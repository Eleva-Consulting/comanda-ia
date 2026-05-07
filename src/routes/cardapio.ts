import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';

const CriarItemSchema = Type.Object({
  estabelecimentoId: Type.String(),
  nome: Type.String({ minLength: 2, maxLength: 100 }),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  preco: Type.Number({ minimum: 0 }),
  disponivel: Type.Optional(Type.Boolean()),
});

const AtualizarItemSchema = Type.Object({
  nome: Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  preco: Type.Optional(Type.Number({ minimum: 0 })),
  disponivel: Type.Optional(Type.Boolean()),
});

const ItemParamsSchema = Type.Object({
  id: Type.String(),
});

const EstabelecimentoParamsSchema = Type.Object({
  estabelecimentoId: Type.String(),
});

export async function cardapioRoutes(fastify: FastifyInstance) {
  fastify.get('/cardapio/:estabelecimentoId', {
    schema: {
      params: EstabelecimentoParamsSchema,
    },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.params as { estabelecimentoId: string };

    const itens = await prisma.itemCardapio.findMany({
      where: { estabelecimentoId },
      orderBy: { nome: 'asc' },
    });

    return itens;
  });

  fastify.get('/cardapio/item/:id', {
    schema: {
      params: ItemParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await prisma.itemCardapio.findUnique({
      where: { id },
    });

    if (!item) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }

    return item;
  });

  fastify.post('/cardapio', {
    schema: {
      body: CriarItemSchema,
    },
  }, async (request, reply) => {
    const dados = request.body as {
      estabelecimentoId: string;
      nome: string;
      descricao?: string;
      preco: number;
      disponivel?: boolean;
    };

    const item = await prisma.itemCardapio.create({
      data: dados,
    });

    return reply.status(201).send(item);
  });

  fastify.patch('/cardapio/:id', {
    schema: {
      params: ItemParamsSchema,
      body: AtualizarItemSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as {
      nome?: string;
      descricao?: string;
      preco?: number;
      disponivel?: boolean;
    };

    try {
      const item = await prisma.itemCardapio.update({
        where: { id },
        data: dados,
      });
      return item;
    } catch (erro) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
  });

  fastify.delete('/cardapio/:id', {
    schema: {
      params: ItemParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.itemCardapio.delete({
        where: { id },
      });
      return reply.status(204).send();
    } catch (erro) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
  });
}