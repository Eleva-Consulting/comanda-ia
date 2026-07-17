import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { criarRodadaDeItens } from './rodadas.js';
import { serializarItemComanda } from './contas.js';
import { serializarItemProducao, salaProducao } from '../utils/producao.js';

const ComandaParams  = Type.Object({ id: Type.String() });
const ContaParams    = Type.Object({ id: Type.String() });
const RascunhoParams = Type.Object({ id: Type.String() });

const AdicionarRascunhoSchema = Type.Object({
  itens: Type.Array(Type.Object({
    itemCardapioId: Type.String({ minLength: 1 }),
    quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
    observacao:     Type.Optional(Type.String({ maxLength: 300 })),
    acompanhamento: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  }), { minItems: 1 }),
});

const AtualizarRascunhoSchema = Type.Object({ quantidade: Type.Integer({ minimum: 1, maximum: 100 }) });

// Avisa quem está com a mesa aberta (em qualquer aparelho) que o rascunho mudou — Mesas
// refetcha a conta em `conta:atualizada`. Reusa o evento existente, sem evento novo.
async function emitirContaDaComanda(estabelecimentoId: string, comandaId: string) {
  const comanda = await prisma.comanda.findUnique({ where: { id: comandaId }, select: { contaId: true } });
  if (comanda) getIO().to(estabelecimentoId).emit('conta:atualizada', { id: comanda.contaId });
}

export async function rascunhoRoutes(fastify: FastifyInstance) {
  // ── POST /comandas/:id/rascunho ───────────────────────────────────────────────
  // Adiciona itens ao rascunho de uma comanda. NÃO vai pra cozinha — fica em staging
  // até o envio final da mesa (POST /contas/:id/rascunho/enviar).
  fastify.post('/comandas/:id/rascunho', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParams, body: AdicionarRascunhoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itens } = request.body as { itens: { itemCardapioId: string; quantidade: number; observacao?: string; acompanhamento?: string }[] };
    const { estabelecimentoId, userId } = request.user;

    const comanda = await prisma.comanda.findFirst({ where: { id, conta: { estabelecimentoId: estabelecimentoId! } } });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    await prisma.rascunhoItemComanda.createMany({
      data: itens.map((i) => ({
        comandaId: id,
        itemCardapioId: i.itemCardapioId,
        quantidade: i.quantidade,
        observacao: i.observacao ?? null,
        acompanhamento: i.acompanhamento ?? null,
        criadoPorUsuarioId: userId,
      })),
    });
    await emitirContaDaComanda(estabelecimentoId!, id);
    return reply.status(201).send({ ok: true });
  });

  // ── PATCH /rascunho/:id ───────────────────────────────────────────────────────
  fastify.patch('/rascunho/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: RascunhoParams, body: AtualizarRascunhoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { quantidade } = request.body as { quantidade: number };
    const { estabelecimentoId } = request.user;

    const r = await prisma.rascunhoItemComanda.findFirst({
      where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      select: { comandaId: true },
    });
    if (!r) return reply.status(404).send({ erro: 'Item de rascunho não encontrado' });

    await prisma.rascunhoItemComanda.update({ where: { id }, data: { quantidade } });
    await emitirContaDaComanda(estabelecimentoId!, r.comandaId);
    return { ok: true };
  });

  // ── DELETE /rascunho/:id ──────────────────────────────────────────────────────
  fastify.delete('/rascunho/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: RascunhoParams },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const r = await prisma.rascunhoItemComanda.findFirst({
      where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      select: { comandaId: true },
    });
    if (!r) return reply.status(404).send({ erro: 'Item de rascunho não encontrado' });

    await prisma.rascunhoItemComanda.delete({ where: { id } });
    await emitirContaDaComanda(estabelecimentoId!, r.comandaId);
    return { ok: true };
  });

  // ── POST /contas/:id/rascunho/enviar ──────────────────────────────────────────
  // Envia TODO o rascunho da conta pra cozinha de uma vez: uma rodada por comanda que
  // tem rascunho. Reaproveita criarRodadaDeItens (mesma validação/descarte de POST /rodadas).
  fastify.post('/contas/:id/rascunho/enviar', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParams },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId, userId } = request.user;

    const conta = await prisma.conta.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
      include: { comandas: { include: { rascunhoItens: true } } },
    });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });

    const comandasComRascunho = conta.comandas.filter((c) => c.rascunhoItens.length > 0);
    if (comandasComRascunho.length === 0) return reply.status(400).send({ erro: 'Nenhum item em rascunho pra enviar' });

    const { itensCriadosTotal, itensDescartados } = await prisma.$transaction(async (tx) => {
      const itensCriadosTotal: Awaited<ReturnType<typeof criarRodadaDeItens>>['itensCriados'] = [];
      const itensDescartados: { itemCardapioId: string; motivo: string; refId?: string }[] = [];
      for (const comanda of comandasComRascunho) {
        const { itensCriados, itensDescartados: desc, descartadosRefIds } = await criarRodadaDeItens(tx, {
          comandaId: comanda.id,
          estabelecimentoId: estabelecimentoId!,
          userId,
          itens: comanda.rascunhoItens.map((r) => ({
            itemCardapioId: r.itemCardapioId,
            quantidade: r.quantidade,
            observacao: r.observacao,
            acompanhamento: r.acompanhamento,
            refId: r.id,
          })),
        });
        itensCriadosTotal.push(...itensCriados);
        itensDescartados.push(...desc);
        // Apaga só os itens de rascunho ENVIADOS; os descartados ficam pro garçom decidir.
        const enviados = comanda.rascunhoItens.map((r) => r.id).filter((rid) => !descartadosRefIds.includes(rid));
        if (enviados.length > 0) await tx.rascunhoItemComanda.deleteMany({ where: { id: { in: enviados } } });
      }
      return { itensCriadosTotal, itensDescartados };
    });

    // Emite fora da transação — mesmo padrão de POST /rodadas (Produção imprime ao receber).
    for (const item of itensCriadosTotal) {
      getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializarItemComanda(item));
    }
    const paraProducao = await prisma.itemComanda.findMany({
      where: { id: { in: itensCriadosTotal.map((i) => i.id) } },
      include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
    });
    for (const item of paraProducao) {
      getIO().to(salaProducao(estabelecimentoId!, item.setorId)).emit('producao:item-novo', serializarItemProducao(item));
    }
    getIO().to(estabelecimentoId!).emit('conta:atualizada', { id });

    return { enviados: itensCriadosTotal.length, itensDescartados };
  });
}
