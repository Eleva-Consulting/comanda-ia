import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { rootRoutes } from './routes/root.js';
import { saudeRoutes } from './routes/saude.js';
import { pedidosRoutes } from './routes/pedidos.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: true,
    ajv: {
      customOptions: {
        coerceTypes: false,
        useDefaults: true,
        removeAdditional: true,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await fastify.register(rootRoutes);
  await fastify.register(saudeRoutes);
  await fastify.register(pedidosRoutes);

  return fastify;
}