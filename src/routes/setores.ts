import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';

const CriarSetorSchema = Type.Object({
  nome:             Type.String({ minLength: 1, maxLength: 60 }),
  tempoAlvoMinutos: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
});

const AtualizarSetorSchema = Type.Object({
  nome:             Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  tempoAlvoMinutos: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
});

const SetorParamsSchema = Type.Object({ id: Type.String() });

export async function setoresRoutes(fastify: FastifyInstance) {
  // ── GET /setores ────────────────────────────────────────────────────────────
  fastify.get('/setores', {
    onRequest: [autenticar],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    return prisma.setor.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
    });
  });

  // ── POST /setores ───────────────────────────────────────────────────────────
  fastify.post('/setores', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { body: CriarSetorSchema },
  }, async (request, reply) => {
    const { nome, tempoAlvoMinutos } = request.body as { nome: string; tempoAlvoMinutos?: number | null };
    const { estabelecimentoId } = request.user;

    const existente = await prisma.setor.findUnique({
      where: { estabelecimentoId_nome: { estabelecimentoId: estabelecimentoId!, nome } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe um setor com esse nome' });

    const setor = await prisma.setor.create({
      data: { nome, tempoAlvoMinutos: tempoAlvoMinutos ?? null, estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(setor);
  });

  // ── PATCH /setores/:id ──────────────────────────────────────────────────────
  fastify.patch('/setores/:id', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { params: SetorParamsSchema, body: AtualizarSetorSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { nome?: string; tempoAlvoMinutos?: number | null };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.setor.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Setor não encontrado' });

    return prisma.setor.findUnique({ where: { id } });
  });

  // ── DELETE /setores/:id ─────────────────────────────────────────────────────
  // Bloqueado se algum item do cardápio ainda apontar pra esse setor.
  fastify.delete('/setores/:id', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { params: SetorParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const setor = await prisma.setor.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!setor) return reply.status(404).send({ erro: 'Setor não encontrado' });

    const itensVinculados = await prisma.itemCardapio.count({ where: { setorId: id } });
    if (itensVinculados > 0) {
      return reply.status(422).send({ erro: 'Existem itens do cardápio usando este setor. Mude o setor deles antes de excluir.' });
    }

    await prisma.setor.delete({ where: { id } });
    return reply.status(204).send();
  });
}
