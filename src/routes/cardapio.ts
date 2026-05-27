import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const CriarItemSchema = Type.Object({
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

export async function cardapioRoutes(fastify: FastifyInstance) {
  // LIST — itens do meu estabelecimento
  fastify.get('/cardapio', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const itens = await prisma.itemCardapio.findMany({
      where: { estabelecimentoId },
      orderBy: { nome: 'asc' },
    });
    return itens;
  });

  // READ — busca composta
  fastify.get('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId },
    });

    if (!item) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
    return item;
  });

  // CREATE — estabelecimentoId do token
  fastify.post('/cardapio', {
    onRequest: [autenticar],
    schema: { body: CriarItemSchema },
  }, async (request, reply) => {
    const dados = request.body as {
      nome: string;
      descricao?: string;
      preco: number;
      disponivel?: boolean;
    };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.create({
      data: {
        ...dados,
        estabelecimentoId,
      },
    });
    return reply.status(201).send(item);
  });

  // UPDATE — updateMany composto
  fastify.patch('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema, body: AtualizarItemSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as {
      nome?: string;
      descricao?: string;
      preco?: number;
      disponivel?: boolean;
    };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.itemCardapio.updateMany({
      where: { id, estabelecimentoId },
      data: dados,
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }

    const itemAtualizado = await prisma.itemCardapio.findUnique({ where: { id } });
    return itemAtualizado;
  });

  // DELETE — deleteMany composto
  fastify.delete('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.itemCardapio.deleteMany({
      where: { id, estabelecimentoId },
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
    return reply.status(204).send();
  });
}