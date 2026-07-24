import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { resolverAcompanhamento } from '../utils/acompanhamento.js';
import { serializarItemProducao, salaProducao } from '../utils/producao.js';
import { transicaoProducaoValida, proximoStatusAtivo } from '../utils/statusProducao.js';
import { serializarItemComanda, emitirAtualizacaoItemComanda } from './contas.js';
import type { Prisma } from '../generated/prisma/client.js';

const RodadaParamsSchema  = Type.Object({ id: Type.String() });

export interface EntradaItemRodada {
  itemCardapioId: string;
  quantidade:     number;
  observacao?:    string | null;
  acompanhamento?: string | null;
  refId?:         string; // referência opaca do chamador (ex.: id do item de rascunho)
}

type ItemCardapioComCategoria = {
  id: string; nome: string; preco: unknown; setorId: string | null;
  categoria: { opcoesAcompanhamento: unknown } | null;
};

// Parte pura: valida as entradas contra o cardápio e separa o que criar do que descartar.
// Sem tocar no banco — testável isoladamente.
export function montarItensParaCriar(
  cardapioPorId: Map<string, ItemCardapioComCategoria>,
  itens: EntradaItemRodada[],
) {
  const itensParaCriar: {
    itemCardapioId: string; nomeItem: string; quantidade: number; precoUnit: number;
    observacao: string | null; acompanhamento: string | null; setorId: string | null;
  }[] = [];
  const itensDescartados: { itemCardapioId: string; motivo: string; refId?: string }[] = [];

  for (const itemInput of itens) {
    const itemCardapio = cardapioPorId.get(itemInput.itemCardapioId);
    if (!itemCardapio) {
      itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: 'Item não disponível ou não pertence a este estabelecimento', refId: itemInput.refId });
      continue;
    }
    const resultado = resolverAcompanhamento(itemCardapio.categoria?.opcoesAcompanhamento, itemInput.acompanhamento ?? undefined, itemCardapio.nome);
    if (resultado.erro) {
      itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: resultado.erro, refId: itemInput.refId });
      continue;
    }
    itensParaCriar.push({
      itemCardapioId: itemCardapio.id,
      nomeItem:       itemCardapio.nome,
      quantidade:     itemInput.quantidade,
      precoUnit:      Number(itemCardapio.preco) + (resultado.precoAdicional ?? 0),
      observacao:     itemInput.observacao ?? null,
      acompanhamento: itemInput.acompanhamento ?? null,
      setorId:        itemCardapio.setorId,
    });
  }
  return { itensParaCriar, itensDescartados };
}

// Cria uma RodadaComanda + ItemComanda a partir das entradas, dentro de uma transação
// recebida. NÃO emite socket nem abre transação própria — o chamador cuida disso.
// Reaproveitado pela criação direta e pelo envio do rascunho da mesa.
export async function criarRodadaDeItens(
  tx: Prisma.TransactionClient,
  params: { comandaId: string; estabelecimentoId: string; userId: string | null; itens: EntradaItemRodada[] },
) {
  const cardapio = await tx.itemCardapio.findMany({
    where: { id: { in: params.itens.map((i) => i.itemCardapioId) }, estabelecimentoId: params.estabelecimentoId, disponivel: true },
    include: { categoria: { select: { opcoesAcompanhamento: true } } },
  });
  const cardapioPorId = new Map<string, ItemCardapioComCategoria>(cardapio.map((i) => [i.id, i]));
  const { itensParaCriar, itensDescartados } = montarItensParaCriar(cardapioPorId, params.itens);
  const descartadosRefIds = itensDescartados.map((d) => d.refId).filter((r): r is string => !!r);

  const itensCriados = [];
  if (itensParaCriar.length > 0) {
    const rodada = await tx.rodadaComanda.create({ data: { comandaId: params.comandaId, criadoPorUsuarioId: params.userId } });
    for (const item of itensParaCriar) {
      itensCriados.push(await tx.itemComanda.create({ data: { ...item, comandaId: params.comandaId, rodadaId: rodada.id, criadoPorUsuarioId: params.userId } }));
    }
  }
  return { itensCriados, itensDescartados, descartadosRefIds };
}

export async function rodadasRoutes(fastify: FastifyInstance) {
  // NOTA: a criação de rodada agora acontece pelo envio do rascunho da mesa
  // (POST /contas/:id/rascunho/enviar, em rascunho.ts), que reaproveita
  // criarRodadaDeItens acima. A antiga POST /comandas/:id/rodadas foi removida.

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
      include: { comanda: { include: { conta: { include: { mesa: true, abertaPor: { select: { nome: true } } } } } }, itens: true },
    });
    if (!rodada) return reply.status(404).send({ erro: 'Rodada não encontrada' });

    return {
      id:            rodada.id,
      criadaEm:      rodada.criadaEm,
      mesaNumero:    rodada.comanda.conta.mesa?.numero ?? null,
      comandaNome:   rodada.comanda.nome,
      numeroPessoas: rodada.comanda.conta.numeroPessoas,
      abertaPorNome: rodada.comanda.conta.abertaPor?.nome ?? null,
      itens:         rodada.itens.map(serializarItemComanda),
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
