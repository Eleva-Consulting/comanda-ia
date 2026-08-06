import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

// Testa o MESMO padrão de configuração usado em server.ts/auth.ts/publico.ts (plugin
// global + override por rota via `config: { rateLimit: {...} }`), isolado do resto da
// aplicação (sem precisar de banco de dados) — garante que a sintaxe/comportamento
// realmente bloqueia como esperado, não só que compila.

async function servidorDeTeste() {
  const fastify = Fastify();
  await fastify.register(fastifyRateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  fastify.get('/rota-normal', async () => ({ ok: true }));

  fastify.post('/rota-restrita', {
    config: { rateLimit: { max: 2, timeWindow: '1 minute' } },
  }, async () => ({ ok: true }));

  return fastify;
}

describe('rate limiting (padrão usado em server.ts)', () => {
  it('rota sem override usa o limite global (não bloqueia com poucas requisições)', async () => {
    const fastify = await servidorDeTeste();
    for (let i = 0; i < 5; i++) {
      const resp = await fastify.inject({ method: 'GET', url: '/rota-normal' });
      expect(resp.statusCode).toBe(200);
    }
  });

  it('rota com override mais restrito bloqueia com 429 depois do limite', async () => {
    const fastify = await servidorDeTeste();

    const resp1 = await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    const resp2 = await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    const resp3 = await fastify.inject({ method: 'POST', url: '/rota-restrita' });

    expect(resp1.statusCode).toBe(200);
    expect(resp2.statusCode).toBe(200);
    expect(resp3.statusCode).toBe(429);
  });

  it('bloqueio é por rota — a rota restrita atingir o limite não afeta a rota normal', async () => {
    const fastify = await servidorDeTeste();

    await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    const bloqueada = await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    expect(bloqueada.statusCode).toBe(429);

    const normal = await fastify.inject({ method: 'GET', url: '/rota-normal' });
    expect(normal.statusCode).toBe(200);
  });
});
