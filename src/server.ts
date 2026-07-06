import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { rootRoutes } from './routes/root.js';
import { saudeRoutes } from './routes/saude.js';
import { pedidosRoutes } from './routes/pedidos.js';
import { cardapioRoutes } from './routes/cardapio.js';
import { estabelecimentosRoutes } from './routes/estabelecimentos.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhook.js';
import { publicoRoutes } from './routes/publico.js';
import { adminRoutes } from './routes/admin.js';
import { operadoresRoutes } from './routes/operadores.js';
import { bairrosRoutes } from './routes/bairros.js';
import { setoresRoutes } from './routes/setores.js';
import { mesasRoutes } from './routes/mesas.js';
import { contasRoutes } from './routes/contas.js';
import { pushRoutes } from './routes/push.js';

function origensPermitidas(): string[] {
  const dev = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const prod = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((u) => u.trim()).filter(Boolean)
    : [];
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

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
      files:    1,
    },
  });

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '7d' },
  });

  // Rotas públicas
  await fastify.register(rootRoutes);
  await fastify.register(saudeRoutes);
  await fastify.register(authRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(publicoRoutes);

  // Rotas autenticadas (tenant)
  await fastify.register(pedidosRoutes);
  await fastify.register(cardapioRoutes);
  await fastify.register(estabelecimentosRoutes);
  await fastify.register(operadoresRoutes);
  await fastify.register(bairrosRoutes);
  await fastify.register(setoresRoutes);
  await fastify.register(mesasRoutes);
  await fastify.register(contasRoutes);

  // Rotas exclusivas do Super Admin
  await fastify.register(adminRoutes);

  // Push notifications
  await fastify.register(pushRoutes);

  return fastify;
}
