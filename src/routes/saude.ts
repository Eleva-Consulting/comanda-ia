import { FastifyInstance } from 'fastify';

export async function saudeRoutes(fastify: FastifyInstance) {
  fastify.get('/saude', async (request, reply) => {
    return { 
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
}