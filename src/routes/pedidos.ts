import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const CriarPedidoSchema = Type.Object({
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
  // LIST — pedidos do meu estabelecimento, COM os itens
  fastify.get('/pedidos', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const pedidos = await prisma.pedido.findMany({
      where: { estabelecimentoId: estabelecimentoId! },
      orderBy: { criadoEm: 'desc' },
      include: { itens: true },
    });
    return pedidos;
  });

  // READ — busca composta: id + tenant
  fastify.get('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
      include: { itens: true },
    });

    if (!pedido) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    return pedido;
  });

  // CREATE
  fastify.post('/pedidos', {
    onRequest: [autenticar],
    schema: { body: CriarPedidoSchema },
  }, async (request, reply) => {
    const dados = request.body as {
      clienteNome: string;
      clienteFone: string;
      enderecoEntrega?: string;
      total: number;
    };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.create({
      data: { ...dados, estabelecimentoId: estabelecimentoId! },
      include: { itens: true },
    });
    return reply.status(201).send(pedido);
  });

  // UPDATE — updateMany com filtro composto, retorna o pedido com itens
  fastify.patch('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema, body: AtualizarPedidoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { status: string };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.pedido.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data: dados,
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }

    const pedidoAtualizado = await prisma.pedido.findUnique({
      where: { id },
      include: { itens: true },
    });
    return pedidoAtualizado;
  });

  // DELETE
  fastify.delete('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.pedido.deleteMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    return reply.status(204).send();
  });
}