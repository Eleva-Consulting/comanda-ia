import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { resolverAcompanhamento } from '../utils/acompanhamento.js';
import { serializarItemProducao, salaProducao } from '../utils/producao.js';
import { transicaoProducaoValida, proximoStatusAtivo } from '../utils/statusProducao.js';
import { serializarItemComanda, emitirAtualizacaoItemComanda } from './contas.js';

const ItemRodadaSchema = Type.Object({
  itemCardapioId: Type.String({ minLength: 1 }),
  quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
  observacao:     Type.Optional(Type.String({ maxLength: 300 })),
  acompanhamento: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
});

const CriarRodadaSchema = Type.Object({
  itens: Type.Array(ItemRodadaSchema, { minItems: 1 }),
});

const ComandaParamsSchema = Type.Object({ id: Type.String() });
const RodadaParamsSchema  = Type.Object({ id: Type.String() });

interface ItemRodadaInput {
  itemCardapioId: string;
  quantidade:     number;
  observacao?:    string;
  acompanhamento?: string;
}

export async function rodadasRoutes(fastify: FastifyInstance) {
  // ── POST /comandas/:id/rodadas ───────────────────────────────────────────────
  // Cria uma Rodada (lote de itens enviados juntos) — substitui o antigo "um item
  // por clique" (POST /comandas/:id/itens, removido). Itens que ficaram indisponíveis
  // entre a montagem do carrinho e o envio são descartados sem quebrar a rodada inteira.
  fastify.post('/comandas/:id/rodadas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: CriarRodadaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itens } = request.body as { itens: ItemRodadaInput[] };
    const { estabelecimentoId, userId } = request.user;

    const comanda = await prisma.comanda.findFirst({
      where: { id, conta: { estabelecimentoId: estabelecimentoId! } },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id:         { in: itens.map((i) => i.itemCardapioId) },
        estabelecimentoId: estabelecimentoId!,
        disponivel: true,
      },
      include: { categoria: { select: { opcoesAcompanhamento: true } } },
    });
    const itensCardapioPorId = new Map(itensCardapio.map((i) => [i.id, i]));

    const itensParaCriar: {
      itemCardapioId: string;
      nomeItem: string;
      quantidade: number;
      precoUnit: number;
      observacao: string | null;
      acompanhamento: string | null;
      setorId: string | null;
    }[] = [];
    const itensDescartados: { itemCardapioId: string; motivo: string }[] = [];

    for (const itemInput of itens) {
      const itemCardapio = itensCardapioPorId.get(itemInput.itemCardapioId);
      if (!itemCardapio) {
        itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: 'Item não disponível ou não pertence a este estabelecimento' });
        continue;
      }

      const resultadoAcompanhamento = resolverAcompanhamento(
        itemCardapio.categoria?.opcoesAcompanhamento,
        itemInput.acompanhamento,
        itemCardapio.nome,
      );
      if (resultadoAcompanhamento.erro) {
        itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: resultadoAcompanhamento.erro });
        continue;
      }

      itensParaCriar.push({
        itemCardapioId: itemCardapio.id,
        nomeItem:       itemCardapio.nome,
        quantidade:     itemInput.quantidade,
        precoUnit:      Number(itemCardapio.preco) + (resultadoAcompanhamento.precoAdicional ?? 0),
        observacao:     itemInput.observacao ?? null,
        acompanhamento: itemInput.acompanhamento ?? null,
        setorId:        itemCardapio.setorId,
      });
    }

    if (itensParaCriar.length === 0) {
      return reply.status(400).send({ erro: 'Nenhum item válido pra criar a rodada', itensDescartados });
    }

    const { rodada, itensCriados } = await prisma.$transaction(async (tx) => {
      const rodada = await tx.rodadaComanda.create({
        data: { comandaId: id, criadoPorUsuarioId: userId },
      });
      const itensCriados = [];
      for (const item of itensParaCriar) {
        const itemCriado = await tx.itemComanda.create({
          data: { ...item, comandaId: id, rodadaId: rodada.id, criadoPorUsuarioId: userId },
        });
        itensCriados.push(itemCriado);
      }
      return { rodada, itensCriados };
    });

    // Reaproveita o mecanismo de eventos já existente pra item avulso, em loop —
    // sem evento novo. O agrupamento visual da rodada acontece no frontend via rodadaId.
    for (const itemCriado of itensCriados) {
      const serializado = serializarItemComanda(itemCriado);
      getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializado);
    }

    const itensParaProducao = await prisma.itemComanda.findMany({
      where: { id: { in: itensCriados.map((i) => i.id) } },
      include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
    });
    // salaProducao já resolve sozinha pra onde cada item vai (sala ampla + sala do setor,
    // quando tem setor; só a sala ampla, quando não tem) — mesmo padrão já usado pra item
    // avulso, sem precisar agrupar nada antes.
    for (const item of itensParaProducao) {
      getIO().to(salaProducao(estabelecimentoId!, item.setorId)).emit('producao:item-novo', serializarItemProducao(item));
    }

    return reply.status(201).send({
      rodadaId: rodada.id,
      itens: itensCriados.map(serializarItemComanda),
      itensDescartados,
    });
  });

  // ── GET /rodadas/:id ─────────────────────────────────────────────────────────
  // Usada pela tela de impressão (ImprimirRodada.tsx).
  fastify.get('/rodadas/:id', {
    onRequest: [autenticar, temPermissao('mesas', 'producao', 'cozinha'), moduloAtivo('mesas')],
    schema: { params: RodadaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const rodada = await prisma.rodadaComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { comanda: { include: { conta: { include: { mesa: true } } } }, itens: true },
    });
    if (!rodada) return reply.status(404).send({ erro: 'Rodada não encontrada' });

    return {
      id:          rodada.id,
      criadaEm:    rodada.criadaEm,
      mesaNumero:  rodada.comanda.conta.mesa?.numero ?? null,
      comandaNome: rodada.comanda.nome,
      itens:       rodada.itens.map(serializarItemComanda),
    };
  });

  // ── PATCH /rodadas/:id/avancar ───────────────────────────────────────────────
  // Avança cada item elegível da rodada pro seu próprio próximo estágio — sem
  // status-alvo no body (ver Global Constraints do plano). Itens de outro setor
  // (quando o usuário tem setor fixo), cancelados, ou já entregues são ignorados.
  fastify.patch('/rodadas/:id/avancar', {
    onRequest: [autenticar, temPermissao('cozinha', 'producao'), moduloAtivo('mesas')],
    schema: { params: RodadaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId, setorId } = request.user;

    const rodada = await prisma.rodadaComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { itens: true },
    });
    if (!rodada) return reply.status(404).send({ erro: 'Rodada não encontrada' });

    const itensElegiveis = rodada.itens.filter((item) => setorId ? item.setorId === setorId : true);

    const itensAtualizados = [];
    for (const item of itensElegiveis) {
      const proximo = proximoStatusAtivo(item.status);
      if (!proximo || !transicaoProducaoValida(item.status, proximo)) continue;

      const timestamps: { prontoEm?: Date; entregueEm?: Date } = {};
      if (proximo === 'pronto')   timestamps.prontoEm   = new Date();
      if (proximo === 'entregue') timestamps.entregueEm = new Date();

      const atualizado = await prisma.itemComanda.update({
        where: { id: item.id },
        data:  { status: proximo, ...timestamps },
      });
      const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
      getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);
      await emitirAtualizacaoItemComanda(estabelecimentoId!, atualizado.id);
      itensAtualizados.push(serializado);
    }

    return { rodadaId: id, itensAtualizados };
  });
}
