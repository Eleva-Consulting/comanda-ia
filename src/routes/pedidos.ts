import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';

const CriarPedidoSchema = Type.Object({
  estabelecimentoId: Type.String(),
  clienteNome: Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone: Type.String({ minLength: 8, maxLength: 20 }),
  enderecoEntrega: Type.Optional(Type.String()),
  total: Type.Number({ minimum: 0 }),
});

const AtualizarPedidoSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});

const PedidoParamsSchema = Type.Object({
  id: Type.String(),
});

export async function pedidosRoutes(fastify: FastifyInstance) {
  fastify.get('/pedidos', async (request, reply) => {
  const pedidos = await prisma.pedido.findMany({
    orderBy: { criadoEm: 'desc' },
    include: {
      estabelecimento: true,
    },
  });
  return pedidos;
});

  fastify.get('/pedidos/:id', {
  schema: {
    params: PedidoParamsSchema,
  },
}, async (request, reply) => {
  const { id } = request.params as { id: string };

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      estabelecimento: true,
    },
  });

  if (!pedido) {
    return reply.status(404).send({ erro: 'Pedido não encontrado' });
  }

  return pedido;
});

  fastify.post('/pedidos', {
    schema: {
      body: CriarPedidoSchema,
    },
  }, async (request, reply) => {
    const dados = request.body as {
      estabelecimentoId: string;
      clienteNome: string;
      clienteFone: string;
      enderecoEntrega?: string;
      total: number;
    };

    const pedido = await prisma.pedido.create({
      data: dados,
    });

    return reply.status(201).send(pedido);
  });

  fastify.patch('/pedidos/:id', {
    schema: {
      params: PedidoParamsSchema,
      body: AtualizarPedidoSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { status: string };

    try {
      const pedido = await prisma.pedido.update({
        where: { id },
        data: dados,
      });
      return pedido;
    } catch (erro) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
  });

  fastify.delete('/pedidos/:id', {
    schema: {
      params: PedidoParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.pedido.delete({
        where: { id },
      });
      return reply.status(204).send();
    } catch (erro) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
  });
}