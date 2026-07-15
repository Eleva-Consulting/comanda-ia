import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';

const CriarMesaSchema = Type.Object({
  numero:     Type.String({ minLength: 1, maxLength: 20 }),
  area:       Type.Optional(Type.Union([Type.String({ maxLength: 60 }), Type.Null()])),
  capacidade: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
});

const AtualizarMesaSchema = Type.Object({
  numero:     Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
  area:       Type.Optional(Type.Union([Type.String({ maxLength: 60 }), Type.Null()])),
  capacidade: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  ativa:      Type.Optional(Type.Boolean()),
});

const MesaParamsSchema = Type.Object({ id: Type.String() });

function normalizarNumeroMesa(numero: string): string {
  return numero.trim().replace(/^Mesa\s+/i, '');
}

export async function mesasRoutes(fastify: FastifyInstance) {
  // ── GET /mesas ──────────────────────────────────────────────────────────────
  // Inclui o status calculado a partir da Conta aberta mais recente, se houver.
  fastify.get('/mesas', {
    onRequest: [autenticar, moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const mesas = await prisma.mesa.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, ativa: true },
      orderBy: { numero: 'asc' },
      include: {
        contas: {
          where:  { status: { in: ['aberta', 'aguardando_pagamento'] } },
          select: { id: true, status: true },
        },
      },
    });
    return mesas.map((mesa) => {
      const { contas, ...resto } = mesa;
      return { ...resto, contaAbertaId: contas[0]?.id ?? null, statusMesa: contas[0]?.status ?? 'livre' };
    });
  });

  // ── POST /mesas ─────────────────────────────────────────────────────────────
  fastify.post('/mesas', {
    onRequest: [autenticar, temPermissao('configuracoes'), moduloAtivo('mesas')],
    schema: { body: CriarMesaSchema },
  }, async (request, reply) => {
    const { numero: numeroRaw, area, capacidade } = request.body as { numero: string; area?: string | null; capacidade?: number | null };
    const numero = normalizarNumeroMesa(numeroRaw);
    const { estabelecimentoId } = request.user;

    const existente = await prisma.mesa.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: estabelecimentoId!, numero } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe uma mesa com esse número' });

    const mesa = await prisma.mesa.create({
      data: { numero, area: area ?? null, capacidade: capacidade ?? null, estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(mesa);
  });

  // ── PATCH /mesas/:id ────────────────────────────────────────────────────────
  fastify.patch('/mesas/:id', {
    onRequest: [autenticar, temPermissao('configuracoes'), moduloAtivo('mesas')],
    schema: { params: MesaParamsSchema, body: AtualizarMesaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dadosRaw = request.body as { numero?: string; area?: string | null; capacidade?: number | null; ativa?: boolean };
    const dados = dadosRaw.numero ? { ...dadosRaw, numero: normalizarNumeroMesa(dadosRaw.numero) } : dadosRaw;
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.mesa.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Mesa não encontrada' });

    return prisma.mesa.findUnique({ where: { id } });
  });
}
