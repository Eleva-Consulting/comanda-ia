import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';

const CriarBairroSchema = Type.Object({
  nome:        Type.String({ minLength: 1, maxLength: 100 }),
  taxaEntrega: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
});

const AtualizarBairroSchema = Type.Object({
  nome:        Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  taxaEntrega: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
});

const BairroParamsSchema = Type.Object({ id: Type.String() });

function serializarBairro(bairro: { id: string; nome: string; taxaEntrega: unknown; criadoEm: Date; estabelecimentoId: string }) {
  return { ...bairro, taxaEntrega: bairro.taxaEntrega !== null ? Number(bairro.taxaEntrega) : null };
}

export async function bairrosRoutes(fastify: FastifyInstance) {
  // ── GET /bairros ────────────────────────────────────────────────────────────
  // Qualquer usuário autenticado do tenant — usado no seletor do pedido manual.
  fastify.get('/bairros', {
    onRequest: [autenticar],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const bairros = await prisma.bairro.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
    });
    return bairros.map(serializarBairro);
  });

  // ── POST /bairros ───────────────────────────────────────────────────────────
  fastify.post('/bairros', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { body: CriarBairroSchema },
  }, async (request, reply) => {
    const { nome, taxaEntrega } = request.body as { nome: string; taxaEntrega?: number | null };
    const { estabelecimentoId } = request.user;

    const existente = await prisma.bairro.findUnique({
      where: { estabelecimentoId_nome: { estabelecimentoId: estabelecimentoId!, nome } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe um bairro com esse nome' });

    const bairro = await prisma.bairro.create({
      data: { nome, taxaEntrega: taxaEntrega ?? null, estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(serializarBairro(bairro));
  });

  // ── PATCH /bairros/:id ─────────────────────────────────────────────────────
  fastify.patch('/bairros/:id', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { params: BairroParamsSchema, body: AtualizarBairroSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { nome?: string; taxaEntrega?: number | null };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.bairro.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Bairro não encontrado' });

    const atualizado = await prisma.bairro.findUnique({ where: { id } });
    return serializarBairro(atualizado!);
  });

  // ── DELETE /bairros/:id ────────────────────────────────────────────────────
  fastify.delete('/bairros/:id', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { params: BairroParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.bairro.deleteMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Bairro não encontrado' });

    return reply.status(204).send();
  });
}
