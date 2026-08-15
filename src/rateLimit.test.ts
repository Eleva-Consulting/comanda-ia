import { describe, expect, it } from 'vitest';
import Fastify, { FastifyRequest } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

// Testa o MESMO padrão de configuração usado em server.ts/auth.ts/publico.ts (plugin
// global + override por rota via `config: { rateLimit: {...} }`), isolado do resto da
// aplicação (sem precisar de banco de dados) — garante que a sintaxe/comportamento
// realmente bloqueia como esperado, não só que compila.

async function servidorDeTeste(opts: { trustProxy?: boolean } = {}) {
  const fastify = Fastify({ trustProxy: opts.trustProxy ?? false });
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      erro: `Muitas tentativas. Tente novamente em ${context.after}.`,
    }),
  });

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

  it('resposta de bloqueio usa o formato {erro} do resto da aplicação, não o padrão do plugin', async () => {
    // achado real: o frontend só lê `dados.erro` — o formato padrão do plugin
    // ({statusCode, error, message}) fazia cair sempre na mensagem genérica de fallback
    const fastify = await servidorDeTeste();
    await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    await fastify.inject({ method: 'POST', url: '/rota-restrita' });
    const bloqueada = await fastify.inject({ method: 'POST', url: '/rota-restrita' });

    const corpo = bloqueada.json();
    expect(corpo).toHaveProperty('erro');
    expect(typeof corpo.erro).toBe('string');
    expect(corpo).not.toHaveProperty('message');
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

// Achado do usuário (2026-08-08): bloqueio por IP tem dois problemas sérios num endpoint
// de login — (1) várias contas atrás do mesmo IP compartilhado (Wi-Fi único do
// restaurante) ficam bloqueadas por causa de UMA sofrendo ataque; (2) o atacante
// contorna só trocando de IP. Mesmo padrão usado em POST /auth/login e
// /auth/esqueci-senha (src/routes/auth.ts): chave do limite é a conta (email do corpo),
// não o IP de origem.
function chavePorEmailDoCorpo(request: FastifyRequest): string {
  const email = (request.body as { email?: string } | undefined)?.email;
  return email ? `conta:${email.toLowerCase()}` : request.ip;
}

async function servidorDeTesteLoginPorConta() {
  const fastify = Fastify({ trustProxy: true });
  await fastify.register(fastifyRateLimit, { global: false });

  fastify.post('/login', {
    config: { rateLimit: { max: 2, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: chavePorEmailDoCorpo } },
  }, async () => ({ ok: true }));

  return fastify;
}

describe('rate limiting por conta (email), não por IP — login/esqueci-senha', () => {
  it('persegue a conta mesmo trocando de IP a cada tentativa (não dá pra contornar só trocando de IP)', async () => {
    const fastify = await servidorDeTesteLoginPorConta();
    const corpo = { email: 'vitima@teste.com', senha: 'errada' };

    const resp1 = await fastify.inject({ method: 'POST', url: '/login', payload: corpo, headers: { 'x-forwarded-for': '203.0.113.1' } });
    const resp2 = await fastify.inject({ method: 'POST', url: '/login', payload: corpo, headers: { 'x-forwarded-for': '203.0.113.2' } });
    const resp3 = await fastify.inject({ method: 'POST', url: '/login', payload: corpo, headers: { 'x-forwarded-for': '203.0.113.3' } });

    expect([resp1.statusCode, resp2.statusCode, resp3.statusCode]).toEqual([200, 200, 429]);
  });

  it('não bloqueia contas diferentes atacadas do mesmo IP compartilhado (ex: Wi-Fi do restaurante)', async () => {
    const fastify = await servidorDeTesteLoginPorConta();
    const mesmoIp = { 'x-forwarded-for': '198.51.100.1' };

    // esgota o limite da conta A
    await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'contaA@teste.com' }, headers: mesmoIp });
    await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'contaA@teste.com' }, headers: mesmoIp });
    const contaABloqueada = await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'contaA@teste.com' }, headers: mesmoIp });
    expect(contaABloqueada.statusCode).toBe(429);

    // conta B, mesmo IP, continua livre
    const contaB = await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'contaB@teste.com' }, headers: mesmoIp });
    expect(contaB.statusCode).toBe(200);
  });

  it('email é normalizado (case-insensitive) — maiúsculas não resetam o contador', async () => {
    const fastify = await servidorDeTesteLoginPorConta();

    await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'Carlos@Teste.com' } });
    await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'carlos@teste.com' } });
    const bloqueada = await fastify.inject({ method: 'POST', url: '/login', payload: { email: 'CARLOS@TESTE.COM' } });

    expect(bloqueada.statusCode).toBe(429);
  });
});
