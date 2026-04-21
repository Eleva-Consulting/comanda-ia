import { FastifyInstance } from 'fastify';

export async function rootRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    return { 
      mensagem: 'API do comanda-ia 🍗',
      versao: '0.0.3',
    };
  });
}