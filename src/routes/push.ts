import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const SubscribeSchema = Type.Object({
  endpoint: Type.String(),
  p256dh:   Type.String(),
  auth:     Type.String(),
});

export async function pushRoutes(fastify: FastifyInstance) {
  // ── GET /push/vapid-public-key ────────────────────────────────────────────
  fastify.get('/push/vapid-public-key', async () => ({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  }));

  // ── POST /push/subscribe ──────────────────────────────────────────────────
  fastify.post('/push/subscribe', {
    onRequest: [autenticar],
    schema: { body: SubscribeSchema },
  }, async (request, reply) => {
    const { endpoint, p256dh, auth } = request.body as { endpoint: string; p256dh: string; auth: string };

    await prisma.pushSubscription.upsert({
      where:  { endpoint },
      update: { p256dh, auth },
      create: { endpoint, p256dh, auth, usuarioId: request.user.userId },
    });

    return reply.status(204).send();
  });

  // ── DELETE /push/unsubscribe ───────────────────────────────────────────────
  fastify.delete('/push/unsubscribe', {
    onRequest: [autenticar],
    schema: { body: Type.Object({ endpoint: Type.String() }) },
  }, async (request, reply) => {
    const { endpoint } = request.body as { endpoint: string };
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, usuarioId: request.user.userId },
    });
    return reply.status(204).send();
  });
}
