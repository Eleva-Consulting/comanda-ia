import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { resolverAcompanhamento } from '../utils/acompanhamento.js';
import { serializarItemProducao, salaProducao } from '../utils/producao.js';
import { transicaoProducaoValida, proximoStatusAtivo } from '../utils/statusProducao.js';
import { separarItensCancelaveisDaRodada, decidirLiberacaoConta } from '../utils/cancelamentoRodada.js';
import { serializarItemComanda, emitirAtualizacaoItemComanda } from './contas.js';
import { buscarContaComResumo, emitirContaAtualizada } from './pagamentos.js';
import type { Prisma } from '../generated/prisma/client.js';

const RodadaParamsSchema  = Type.Object({ id: Type.String() });
const ComandaParamsSchema = Type.Object({ id: Type.String() });

const CancelarRodadaSchema = Type.Object({
  motivo: Type.String({ minLength: 1, maxLength: 200 }),
  senha:  Type.String({ minLength: 1 }),
});

const AdicionarItemDiretoSchema = Type.Object({
  itemCardapioId: Type.String({ minLength: 1 }),
  quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
  observacao:     Type.Optional(Type.String({ maxLength: 300 })),
  acompanhamento: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
});

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

  // ── PATCH /rodadas/:id/cancelar ────────────────────────────────────────────
  // Cancela de uma vez todos os itens ainda ativos (recebido/em_preparo/pronto) da
  // rodada — alternativa ao cancelamento item a item na Cozinha. Sempre exige motivo
  // + senha de supervisor (ação maior que cancelar 1 item só). Itens já cobertos por
  // pagamento confirmado são ignorados (reportados em itensNaoCancelados — precisa
  // estornar o pagamento antes). Depois de cancelar, se não sobrar nenhum item ativo
  // na CONTA inteira (outras comandas/rodadas da mesma mesa) e o saldo devedor
  // estiver zerado, libera a mesa automaticamente: 'fechada' se algo já foi
  // entregue/pago antes, 'cancelada' se nada da mesa chegou a ser consumido.
  fastify.patch('/rodadas/:id/cancelar', {
    onRequest: [autenticar, temPermissao('mesas', 'producao', 'cozinha', 'caixa'), moduloAtivo('mesas')],
    schema: { params: RodadaParamsSchema, body: CancelarRodadaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { motivo, senha } = request.body as { motivo: string; senha: string };
    const { estabelecimentoId, userId } = request.user;

    const rodada = await prisma.rodadaComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { itens: true, comanda: { include: { conta: true } } },
    });
    if (!rodada) return reply.status(404).send({ erro: 'Rodada não encontrada' });

    const conta = rodada.comanda.conta;
    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Não é possível cancelar pedido de uma conta fechada ou cancelada' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.senhaReabrirPedido) {
      return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de cancelar o pedido' });
    }
    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
    if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });

    const pagamentosConfirmados = await prisma.pagamentoItem.findMany({
      where:  { itemComandaId: { in: rodada.itens.map((i) => i.id) }, pagamento: { status: 'confirmado' } },
      select: { itemComandaId: true },
    });
    const itensJaPagosIds = new Set(pagamentosConfirmados.map((p) => p.itemComandaId));

    const { itensAtivos, itensCancelaveis, itensNaoCancelados } = separarItensCancelaveisDaRodada(rodada.itens, itensJaPagosIds);
    if (itensAtivos.length === 0) {
      return reply.status(400).send({ erro: 'Nenhum item ativo pra cancelar nessa rodada' });
    }

    if (itensCancelaveis.length === 0) {
      return reply.status(422).send({ erro: 'Todos os itens ativos dessa rodada já foram pagos — estorne o pagamento antes de cancelar', itensNaoCancelados });
    }

    const agora = new Date();
    const itensCancelados = [];
    for (const item of itensCancelaveis) {
      const atualizado = await prisma.itemComanda.update({
        where: { id: item.id },
        data:  { status: 'cancelado', canceladoEm: agora },
      });
      const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
      getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);
      await emitirAtualizacaoItemComanda(estabelecimentoId!, atualizado.id);
      itensCancelados.push(serializado);
    }

    await prisma.logAuditoria.create({
      data: {
        acao:         'rodada:cancelada',
        entidadeTipo: 'RodadaComanda',
        entidadeId:   id,
        motivo,
        dadosAntes:   { itens: itensCancelaveis.map((i) => ({ id: i.id, status: i.status })) },
        dadosDepois:  { status: 'cancelado' },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    userId,
      },
    });

    const itensPendentes = await prisma.itemComanda.count({
      where: { comanda: { contaId: conta.id }, status: { notIn: ['entregue', 'cancelado'] } },
    });
    const encontrada = await buscarContaComResumo(estabelecimentoId!, conta.id);
    const itensEntreguesNaConta = await prisma.itemComanda.count({
      where: { comanda: { contaId: conta.id }, status: 'entregue' },
    });
    const contaLiberada = decidirLiberacaoConta({
      itensPendentes,
      podeFechar: encontrada?.resumo.podeFechar ?? false,
      itensEntreguesNaConta,
      totalPago: encontrada?.resumo.totalPago ?? 0,
    });
    if (contaLiberada) {
      await prisma.conta.update({ where: { id: conta.id }, data: { status: contaLiberada, fechadaEm: agora } });
      await emitirContaAtualizada(estabelecimentoId!, conta.id);
    }

    return { rodadaId: id, itensCancelados, itensNaoCancelados, contaLiberada };
  });

  // ── POST /comandas/:id/item-direto ───────────────────────────────────────────
  // Adiciona um item já como "entregue" direto na comanda, sem passar pela cozinha —
  // uso do Caixa na hora de fechar a conta (item esquecido de lançar, não precisa de
  // preparo). Não cria RodadaComanda nem dispara evento de produção/Kanban, só
  // avisa que a conta mudou (mesmo padrão de conta:atualizada usado em toda parte).
  fastify.post('/comandas/:id/item-direto', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: AdicionarItemDiretoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId, userId } = request.user;
    const entrada = request.body as {
      itemCardapioId: string; quantidade: number; observacao?: string; acompanhamento?: string;
    };

    const comanda = await prisma.comanda.findFirst({
      where:   { id, conta: { estabelecimentoId: estabelecimentoId! } },
      include: { conta: true },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });
    if (comanda.conta.status !== 'aberta' && comanda.conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Não é possível adicionar item numa conta fechada ou cancelada' });
    }

    const cardapio = await prisma.itemCardapio.findMany({
      where:   { id: entrada.itemCardapioId, estabelecimentoId: estabelecimentoId!, disponivel: true },
      include: { categoria: { select: { opcoesAcompanhamento: true } } },
    });
    const cardapioPorId = new Map<string, ItemCardapioComCategoria>(cardapio.map((i) => [i.id, i]));
    const { itensParaCriar, itensDescartados } = montarItensParaCriar(cardapioPorId, [entrada]);
    if (itensParaCriar.length === 0) {
      return reply.status(422).send({ erro: itensDescartados[0]?.motivo ?? 'Não foi possível adicionar o item' });
    }

    const agora = new Date();
    const criado = await prisma.itemComanda.create({
      data: {
        ...itensParaCriar[0],
        comandaId:          id,
        status:             'entregue',
        entregueEm:         agora,
        criadoPorUsuarioId: userId,
      },
    });
    const serializado = { ...criado, precoUnit: Number(criado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializado);
    await emitirContaAtualizada(estabelecimentoId!, comanda.contaId);

    return reply.status(201).send(serializado);
  });
}
