import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

const CriarPedidoSchema = Type.Object({
  cliente: Type.String({ minLength: 2, maxLength: 100 }),
  itens: Type.Array(Type.String(), { minItems: 1 }),
});

const PedidoParamsSchema = Type.Object({
  id: Type.String(),
});

export async function pedidosRoutes(fastify: FastifyInstance) {
  fastify.get('/pedidos/:id', {
    schema: {
      params: PedidoParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    return {
      id: id,
      cliente: 'Cliente de teste',
      itens: ['1x Galeto assado', '1x Batata frita'],
      total: 45.90,
    };
  });

  fastify.post('/pedidos', {
    schema: {
      body: CriarPedidoSchema,
    },
  }, async (request, reply) => {
    const dados = request.body as { cliente: string; itens: string[] };

    return {
      id: Math.floor(Math.random() * 1000),
      cliente: dados.cliente,
      itens: dados.itens,
      criadoEm: new Date().toISOString(),
    };
  });
}