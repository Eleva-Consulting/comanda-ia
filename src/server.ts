import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { rootRoutes } from './routes/root.js';
import { saudeRoutes } from './routes/saude.js';
import { pedidosRoutes } from './routes/pedidos.js';
import { cardapioRoutes } from './routes/cardapio.js';
import { estabelecimentosRoutes } from './routes/estabelecimentos.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhook.js';
import { publicoRoutes } from './routes/publico.js';

// Monta a lista de origens permitidas dinamicamente
function origensPermitidas(): string[] {
  const dev = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const prod = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
  return [...dev, ...prod];
}

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

  await fastify.register(fastifyCors, {
    origin: origensPermitidas(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '7d' },
  });

  await fastify.register(rootRoutes);
  await fastify.register(saudeRoutes);
  await fastify.register(authRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(publicoRoutes);
  await fastify.register(pedidosRoutes);
  await fastify.register(cardapioRoutes);
  await fastify.register(estabelecimentosRoutes);

  return fastify;
}