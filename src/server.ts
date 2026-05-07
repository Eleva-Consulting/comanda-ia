import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { rootRoutes } from './routes/root.js';
import { saudeRoutes } from './routes/saude.js';
import { pedidosRoutes } from './routes/pedidos.js';
import { cardapioRoutes } from './routes/cardapio.js';
import { estabelecimentosRoutes } from './routes/estabelecimentos.js';

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
  await fastify.register(cardapioRoutes);
  await fastify.register(estabelecimentosRoutes);

  return fastify;
}