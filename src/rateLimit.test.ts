import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

// Testa o MESMO padrão de configuração usado em server.ts/auth.ts/publico.ts (plugin
// global + override por rota via `config: { rateLimit: {...} }`), isolado do resto da
// aplicação (sem precisar de banco de dados) — garante que a sintaxe/comportamento
// realmente bloqueia como esperado, não só que compila.

async function servidorDeTeste(opts: { trustProxy?: boolean } = {}) {
  const fastify = Fastify({ trustProxy: opts.trustProxy ?? false });
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

// Achado real testando em produção/homologação (2026-08-06): atrás do proxy do Railway,
// sem `trustProxy: true` o Fastify usa o peer TCP direto (o proxy, que varia a cada
// requisição) como `request.ip` — cada requisição do mesmo cliente cai num "IP" diferente
// pro rate limiter, e o bloqueio nunca fecha. Simula esse cenário controlando
// `remoteAddress` (peer TCP) e `x-forwarded-for` (IP real, só confiável com trustProxy)
// em requisições separadas — reproduz o bug e confirma a correção.
describe('rate limiting atrás de proxy (trustProxy)', () => {
  it('sem trustProxy: peer TCP variando faz o limite nunca bloquear (bug reproduzido)', async () => {
    const fastify = await servidorDeTeste({ trustProxy: false });

    const resp1 = await fastify.inject({ method: 'POST', url: '/rota-restrita', remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } });
    const resp2 = await fastify.inject({ method: 'POST', url: '/rota-restrita', remoteAddress: '10.0.0.2', headers: { 'x-forwarded-for': '203.0.113.9' } });
    const resp3 = await fastify.inject({ method: 'POST', url: '/rota-restrita', remoteAddress: '10.0.0.3', headers: { 'x-forwarded-for': '203.0.113.9' } });

    expect([resp1.statusCode, resp2.statusCode, resp3.statusCode]).toEqual([200, 200, 200]);
  });

  it('com trustProxy: usa o IP real (x-forwarded-for), bloqueia corretamente mesmo com peer TCP variando', async () => {
    const fastify = await servidorDeTeste({ trustProxy: true });

    const resp1 = await fastify.inject({ method: 'POST', url: '/rota-restrita', remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } });
    const resp2 = await fastify.inject({ method: 'POST', url: '/rota-restrita', remoteAddress: '10.0.0.2', headers: { 'x-forwarded-for': '203.0.113.9' } });
    const resp3 = await fastify.inject({ method: 'POST', url: '/rota-restrita', remoteAddress: '10.0.0.3', headers: { 'x-forwarded-for': '203.0.113.9' } });

    expect([resp1.statusCode, resp2.statusCode, resp3.statusCode]).toEqual([200, 200, 429]);
  });

  it('com trustProxy: clientes reais diferentes (x-forwarded-for diferente) continuam isolados um do outro', async () => {
    const fastify = await servidorDeTeste({ trustProxy: true });

    await fastify.inject({ method: 'POST', url: '/rota-restrita', headers: { 'x-forwarded-for': '203.0.113.1' } });
    await fastify.inject({ method: 'POST', url: '/rota-restrita', headers: { 'x-forwarded-for': '203.0.113.1' } });
    const clienteA = await fastify.inject({ method: 'POST', url: '/rota-restrita', headers: { 'x-forwarded-for': '203.0.113.1' } });
    const clienteB = await fastify.inject({ method: 'POST', url: '/rota-restrita', headers: { 'x-forwarded-for': '203.0.113.2' } });

    expect(clienteA.statusCode).toBe(429);
    expect(clienteB.statusCode).toBe(200);
  });
});
