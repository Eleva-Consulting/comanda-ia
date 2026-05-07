import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';

const EstabelecimentoParamsSchema = Type.Object({
  id: Type.String(),
});

const CriarEstabelecimentoSchema = Type.Object({
  nome: Type.String({ minLength: 2, maxLength: 100 }),
  telefone: Type.String({ minLength: 8, maxLength: 20 }),
});

export async function estabelecimentosRoutes(fastify: FastifyInstance) {
  fastify.get('/estabelecimentos', async (request, reply) => {
    const estabelecimentos = await prisma.estabelecimento.findMany({
      orderBy: { nome: 'asc' },
    });
    return estabelecimentos;
  });

  fastify.get('/estabelecimentos/:id', {
    schema: {
      params: EstabelecimentoParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    return estabelecimento;
  });

  fastify.post('/estabelecimentos', {
    schema: {
      body: CriarEstabelecimentoSchema,
    },
  }, async (request, reply) => {
    const dados = request.body as { nome: string; telefone: string };

    const estabelecimento = await prisma.estabelecimento.create({
      data: dados,
    });

    return reply.status(201).send(estabelecimento);
  });

  fastify.get('/estabelecimentos/:id/dashboard', {
    schema: {
      params: EstabelecimentoParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id },
      include: {
        itens: {
          orderBy: { nome: 'asc' },
        },
        pedidos: {
          orderBy: { criadoEm: 'desc' },
          take: 10,
        },
      },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const estatisticas = await prisma.pedido.groupBy({
      by: ['status'],
      where: { estabelecimentoId: id },
      _count: { id: true },
    });

    const totalPedidos = estatisticas.reduce(
      (soma, item) => soma + item._count.id,
      0
    );

    return {
      estabelecimento: {
        id: estabelecimento.id,
        nome: estabelecimento.nome,
        telefone: estabelecimento.telefone,
        ativo: estabelecimento.ativo,
      },
      cardapio: estabelecimento.itens,
      pedidosRecentes: estabelecimento.pedidos,
      estatisticas: {
        totalPedidos,
        porStatus: estatisticas.map((item) => ({
          status: item.status,
          quantidade: item._count.id,
        })),
      },
    };
  });
}