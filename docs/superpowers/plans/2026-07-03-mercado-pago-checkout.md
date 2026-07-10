# Checkout com Mercado Pago (Pix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada estabelecimento conecte sua própria conta Mercado Pago (OAuth) e receba pagamentos Pix diretamente, com confirmação automática via webhook, substituindo a exibição manual de `chavePix`.

**Architecture:** Modelo de split de pagamentos (Mercado Pago para Plataformas). Uma aplicação Mercado Pago única (Client ID/Secret da plataforma) permite que cada `Estabelecimento` autorize via OAuth; o token resultante é salvo por tenant e usado para criar pagamentos Pix em nome dele. Confirmação é 100% via webhook (nunca confiando no payload sem checar a API do MP), e o pedido só aparece na Cozinha depois de `pagamento_confirmado`.

**Tech Stack:** Fastify 5 + TypeBox + Prisma 7 (backend), React 19 + Vite (frontend), `fetch` nativo para chamar a API do Mercado Pago (sem SDK novo), Vitest para os testes do módulo `mercadopago.ts`. **Nota de atualização (2026-07-10):** este plano foi escrito em 2026-07-03, antes do projeto adotar Vitest (chegou na Fase 1a do módulo de mesas, 2026-07-06) — a versão original deste plano previa `node:test` via `tsx --test` porque "não havia test runner no projeto ainda". Isso não é mais verdade: `npm test` já roda `vitest run` hoje, com vários arquivos `*.test.ts` existentes (`src/utils/*.test.ts`, `src/plugins/auth.test.ts`). A Task 2 abaixo já foi corrigida para usar Vitest (`describe`/`it`/`expect`/`vi.stubGlobal`) em vez do `node:test` original, e **não** mexe no script `"test"` do `package.json` — ele já está certo.

## Global Constraints

- Fase 1 cobre **apenas Pix**. Cartão de crédito/débito via Mercado Pago fica fora de escopo.
- Conexão com Mercado Pago é **obrigatória** para o estabelecimento vender por Pix — sem conexão, a opção fica bloqueada no checkout.
- Dinheiro e cartão físico (maquininha) **não mudam em nada** — continuam presenciais, sem qualquer integração.
- `taxaPlataforma` (marketplace fee) existe no schema mas **não é cobrado** nesta fase.
- Pagamentos são sempre criados com o `mpAccessToken` do estabelecimento — nunca com um token genérico da plataforma.
- Webhook **nunca confia no payload isolado** — sempre confirma via `GET /v1/payments/{id}` antes de liberar o pedido.
- Webhook é **idempotente** — reprocessamento não deve duplicar notificações nem sobrescrever um pedido já confirmado.
- Pedido Pix via Mercado Pago só entra na fila da Cozinha depois de `pagamento_confirmado`; decremento de estoque continua acontecendo na criação do pedido, como hoje (aceito como trade-off — ver "Fora de escopo").
- QR Pix expira em 30 minutos (`date_of_expiration`).

## Fora de escopo (não implementar neste plano)

- Checkout com cartão (Checkout Pro/Bricks).
- Cobrança efetiva de `taxaPlataforma`.
- Restauração automática de estoque quando um Pix expira sem pagamento (o estoque é decrementado na criação do pedido, igual ao comportamento atual, e não é devolvido se o Pix expirar — limitação aceita para manter o escopo).
- Job de reconciliação periódica contra a API do Mercado Pago (mencionado no spec como rede de segurança futura, não implementado agora).

---

### Task 1: Schema Prisma — campos de Mercado Pago

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `prisma migrate dev` (nome sugerido: `mercado_pago_oauth`)

**Interfaces:**
- Produces: `Estabelecimento.mpAccessToken`, `mpRefreshToken`, `mpUserId`, `mpTokenExpiraEm`, `mpConectado`, `taxaPlataforma`; `Pedido.mpPaymentId`, `pixCopiaCola`, `pixQrCodeBase64`, `pagoEm`, `aguardandoPagamento` — usados por todas as tasks seguintes.

- [ ] **Step 1: Adicionar campos no model `Estabelecimento`**

Em `prisma/schema.prisma`, dentro de `model Estabelecimento`, logo após `evolutionToken String?`:

```prisma
  evolutionToken   String?
  mpAccessToken    String?
  mpRefreshToken   String?
  mpUserId         String?
  mpTokenExpiraEm  DateTime?
  mpConectado      Boolean               @default(false)
  taxaPlataforma   Decimal?              @db.Decimal(5, 2)
  criadoEm         DateTime              @default(now())
```

- [ ] **Step 2: Adicionar campos no model `Pedido`**

Dentro de `model Pedido`, logo após `trocoPara Decimal? @db.Decimal(10, 2)`:

```prisma
  trocoPara           Decimal?       @db.Decimal(10, 2)
  mpPaymentId         String?
  pixCopiaCola        String?        @db.Text
  pixQrCodeBase64     String?        @db.Text
  pagoEm              DateTime?
  aguardandoPagamento Boolean        @default(false)
  status              StatusPedido   @default(recebido)
```

- [ ] **Step 3: Gerar e aplicar a migration**

Run: `npx prisma migrate dev --name mercado_pago_oauth`
Expected: cria `prisma/migrations/<timestamp>_mercado_pago_oauth/migration.sql` com `ALTER TABLE` para os novos campos, aplica no banco local, `prisma generate` roda automaticamente.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: campos de conexão Mercado Pago em Estabelecimento e Pedido"
```

---

### Task 2: Módulo `src/mercadopago.ts` — cliente OAuth + Pix

**Files:**
- Create: `src/mercadopago.ts`
- Create: `src/mercadopago.test.ts`

**Interfaces:**
- Consumes: nada (módulo isolado, só variáveis de ambiente `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`).
- Produces:
  - `montarUrlAutorizacao(state: string): string`
  - `trocarCodePorToken(code: string): Promise<MercadoPagoTokens>`
  - `renovarToken(refreshToken: string): Promise<MercadoPagoTokens>`
  - `criarPagamentoPix(params): Promise<PagamentoPixCriado>`
  - `buscarPagamento(accessToken: string, paymentId: string): Promise<PagamentoConsultado>`
  - `interface MercadoPagoTokens { accessToken: string; refreshToken: string; userId: string; expiraEm: Date }`
  - `interface PagamentoPixCriado { id: string; qrCode: string; qrCodeBase64: string }`
  - `interface PagamentoConsultado { status: string; externalReference: string | null }`

**Nota:** o projeto já usa Vitest (`npm test` → `vitest run`) — não mexer no script `"test"` do
`package.json`, ele já está correto. Os testes abaixo usam `describe`/`it`/`expect`/`vi.stubGlobal`
do Vitest, seguindo o mesmo padrão de `src/utils/fechamentoConta.test.ts` e
`src/utils/pixBrCode.test.ts`.

- [ ] **Step 1: Escrever o teste de `montarUrlAutorizacao` (falhando)**

Criar `src/mercadopago.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { montarUrlAutorizacao } from './mercadopago.js';

beforeAll(() => {
  process.env.MP_CLIENT_ID = 'client-123';
  process.env.MP_CLIENT_SECRET = 'secret-456';
  process.env.MP_REDIRECT_URI = 'https://api.comanda-ia.dev/mercadopago/callback';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('montarUrlAutorizacao', () => {
  it('inclui client_id, redirect_uri e state', () => {
    const url = montarUrlAutorizacao('estado-teste');
    expect(url).toMatch(/^https:\/\/auth\.mercadopago\.com\.br\/authorization\?/);
    expect(url).toMatch(/client_id=client-123/);
    expect(url).toMatch(/state=estado-teste/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/mercadopago.test.ts`
Expected: FAIL — `Cannot find module './mercadopago.js'` (arquivo ainda não existe)

- [ ] **Step 3: Criar `src/mercadopago.ts` com `montarUrlAutorizacao`**

```ts
function configOAuth() {
  const clientId     = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET
  const redirectUri  = process.env.MP_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Variáveis MP_CLIENT_ID, MP_CLIENT_SECRET ou MP_REDIRECT_URI não configuradas')
  }
  return { clientId, clientSecret, redirectUri }
}

export function montarUrlAutorizacao(state: string): string {
  const { clientId, redirectUri } = configOAuth()
  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    platform_id:   'mp',
    redirect_uri:  redirectUri,
    state,
  })
  return `https://auth.mercadopago.com.br/authorization?${params.toString()}`
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/mercadopago.test.ts`
Expected: PASS — 1 teste passando

- [ ] **Step 5: Escrever teste de `trocarCodePorToken` (falhando)**

Adicionar em `src/mercadopago.test.ts`, dentro do mesmo arquivo (novo `describe` bloco, e
importar `trocarCodePorToken` junto de `montarUrlAutorizacao` no topo):

```ts
import { montarUrlAutorizacao, trocarCodePorToken } from './mercadopago.js';

// ... (describe('montarUrlAutorizacao', ...) continua como está)

describe('trocarCodePorToken', () => {
  it('retorna tokens a partir da resposta da API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token:  'access-abc',
      refresh_token: 'refresh-xyz',
      user_id:       999,
      expires_in:    15552000,
    }), { status: 200 })));

    const tokens = await trocarCodePorToken('code-123');
    expect(tokens.accessToken).toBe('access-abc');
    expect(tokens.refreshToken).toBe('refresh-xyz');
    expect(tokens.userId).toBe('999');
    expect(tokens.expiraEm).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run src/mercadopago.test.ts`
Expected: FAIL — `trocarCodePorToken is not a function` ou `is not exported`

- [ ] **Step 7: Implementar `trocarCodePorToken` e `renovarToken`**

Adicionar em `src/mercadopago.ts`:

```ts
export interface MercadoPagoTokens {
  accessToken:  string
  refreshToken: string
  userId:       string
  expiraEm:     Date
}

function tokensFromResponse(json: {
  access_token: string; refresh_token: string; user_id: number; expires_in: number
}): MercadoPagoTokens {
  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    userId:       String(json.user_id),
    expiraEm:     new Date(Date.now() + json.expires_in * 1000),
  }
}

export async function trocarCodePorToken(code: string): Promise<MercadoPagoTokens> {
  const { clientId, clientSecret, redirectUri } = configOAuth()
  const resp = await fetch('https://api.mercadopago.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao trocar code por token: ${resp.status}`)
  return tokensFromResponse(await resp.json())
}

export async function renovarToken(refreshToken: string): Promise<MercadoPagoTokens> {
  const { clientId, clientSecret } = configOAuth()
  const resp = await fetch('https://api.mercadopago.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao renovar token: ${resp.status}`)
  return tokensFromResponse(await resp.json())
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run src/mercadopago.test.ts`
Expected: PASS — 2 testes passando

- [ ] **Step 9: Escrever testes de `criarPagamentoPix` e `buscarPagamento` (falhando)**

Adicionar em `src/mercadopago.test.ts` (import ampliado no topo, novos `describe` blocos):

```ts
import { montarUrlAutorizacao, trocarCodePorToken, criarPagamentoPix, buscarPagamento } from './mercadopago.js';

describe('criarPagamentoPix', () => {
  it('retorna id, qrCode e qrCodeBase64', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 555,
      point_of_interaction: {
        transaction_data: { qr_code: '000201copiaecola', qr_code_base64: 'aGVsbG8=' },
      },
    }), { status: 201 })));

    const pagamento = await criarPagamentoPix({
      accessToken:       'token-abc',
      valor:             49.9,
      descricao:         'Pedido #123',
      externalReference: 'pedido-123',
      payerEmail:        'cliente@comanda-ia.dev',
    });
    expect(pagamento.id).toBe('555');
    expect(pagamento.qrCode).toBe('000201copiaecola');
    expect(pagamento.qrCodeBase64).toBe('aGVsbG8=');
  });

  it('lança erro quando a API responde com falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('erro', { status: 400 })));
    await expect(criarPagamentoPix({
      accessToken: 'token-abc', valor: 10, descricao: 'x',
      externalReference: 'y', payerEmail: 'a@b.com',
    })).rejects.toThrow();
  });
});

describe('buscarPagamento', () => {
  it('retorna status e external_reference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'approved', external_reference: 'pedido-123',
    }), { status: 200 })));

    const resultado = await buscarPagamento('token-abc', '555');
    expect(resultado.status).toBe('approved');
    expect(resultado.externalReference).toBe('pedido-123');
  });
});
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `npx vitest run src/mercadopago.test.ts`
Expected: FAIL — `criarPagamentoPix is not a function`

- [ ] **Step 11: Implementar `criarPagamentoPix` e `buscarPagamento`**

Adicionar em `src/mercadopago.ts`:

```ts
export interface PagamentoPixCriado {
  id:           string
  qrCode:       string
  qrCodeBase64: string
}

export async function criarPagamentoPix(params: {
  accessToken:        string
  valor:              number
  descricao:          string
  externalReference:  string
  payerEmail:         string
}): Promise<PagamentoPixCriado> {
  const resp = await fetch('https://api.mercadopago.com/v1/payments', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'Authorization':     `Bearer ${params.accessToken}`,
      'X-Idempotency-Key': params.externalReference,
    },
    body: JSON.stringify({
      transaction_amount: params.valor,
      description:        params.descricao,
      payment_method_id:  'pix',
      payer:               { email: params.payerEmail },
      external_reference: params.externalReference,
      date_of_expiration:  new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao criar pagamento Pix: ${resp.status}`)
  const json = await resp.json()
  return {
    id:           String(json.id),
    qrCode:       json.point_of_interaction.transaction_data.qr_code,
    qrCodeBase64: json.point_of_interaction.transaction_data.qr_code_base64,
  }
}

export interface PagamentoConsultado {
  status:             string
  externalReference:  string | null
}

export async function buscarPagamento(accessToken: string, paymentId: string): Promise<PagamentoConsultado> {
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!resp.ok) throw new Error(`Falha ao buscar pagamento: ${resp.status}`)
  const json = await resp.json()
  return { status: json.status, externalReference: json.external_reference ?? null }
}
```

- [ ] **Step 12: Rodar todos os testes e confirmar que passam**

Run: `npx vitest run src/mercadopago.test.ts`
Expected: PASS — 5 testes passando

- [ ] **Step 13: Implementar `obterAccessTokenValido` (renova o token automaticamente antes de expirar)**

`renovarToken` (Step 8) fica sem nenhum lugar que o chame se pararmos aqui — o token de acesso do Mercado Pago expira em ~180 dias, e sem essa checagem o estabelecimento ficaria bloqueado até reconectar manualmente. Adicionar em `src/mercadopago.ts`:

```ts
import { prisma } from './database.js'

export async function obterAccessTokenValido(estabelecimento: {
  id: string
  mpAccessToken:   string | null
  mpRefreshToken:  string | null
  mpTokenExpiraEm: Date | null
}): Promise<string> {
  if (!estabelecimento.mpAccessToken || !estabelecimento.mpRefreshToken) {
    throw new Error('Estabelecimento sem Mercado Pago conectado')
  }

  const seteDiasMs = 7 * 24 * 60 * 60 * 1000
  const expiraEmBreve = !estabelecimento.mpTokenExpiraEm
    || estabelecimento.mpTokenExpiraEm.getTime() - Date.now() < seteDiasMs

  if (!expiraEmBreve) return estabelecimento.mpAccessToken

  const tokens = await renovarToken(estabelecimento.mpRefreshToken)
  await prisma.estabelecimento.update({
    where: { id: estabelecimento.id },
    data: {
      mpAccessToken:   tokens.accessToken,
      mpRefreshToken:  tokens.refreshToken,
      mpTokenExpiraEm: tokens.expiraEm,
    },
  })
  return tokens.accessToken
}
```

- [ ] **Step 14: Verificar manualmente que o token não expirado não é renovado**

Run: `npm test` (roda a suíte inteira via Vitest — os testes existentes de `renovarToken`/
`trocarCodePorToken` continuam cobrindo a lógica de troca; `obterAccessTokenValido` é uma fina
camada de orquestração em cima delas, verificada nas Tasks 5 e 6 via uso real).
Expected: PASS — nenhum teste quebrado (os 45 testes já existentes + os 5 novos deste arquivo).

- [ ] **Step 15: Commit**

```bash
git add src/mercadopago.ts src/mercadopago.test.ts
git commit -m "feat: cliente Mercado Pago (OAuth + Pix) com testes"
```

---

### Task 3: Rotas de conexão OAuth (conectar / status / desconectar / callback)

**Files:**
- Create: `src/routes/mercadopago.ts`
- Modify: `src/server.ts:12` (registrar a rota)

**Interfaces:**
- Consumes: `montarUrlAutorizacao`, `trocarCodePorToken` de `../mercadopago.js` (Task 2); `autenticar`, `temPermissao` de `../plugins/auth.js`; `prisma` de `../database.js`.
- Produces: rotas `GET /meu-estabelecimento/mercadopago/conectar`, `GET /meu-estabelecimento/mercadopago/status`, `DELETE /meu-estabelecimento/mercadopago/desconectar`, `GET /mercadopago/callback` — consumidas pelo frontend na Task 9.

- [ ] **Step 1: Criar `src/routes/mercadopago.ts` com as rotas de conexão**

```ts
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';
import { montarUrlAutorizacao, trocarCodePorToken } from '../mercadopago.js';

const CallbackQuerySchema = Type.Object({
  code:  Type.Optional(Type.String()),
  state: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

export async function mercadoPagoRoutes(fastify: FastifyInstance) {
  // GET /meu-estabelecimento/mercadopago/conectar — gera a URL de autorização OAuth
  fastify.get('/meu-estabelecimento/mercadopago/conectar', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const state = fastify.jwt.sign({ estabelecimentoId }, { expiresIn: '10m' });
    return { url: montarUrlAutorizacao(state) };
  });

  // GET /meu-estabelecimento/mercadopago/status
  fastify.get('/meu-estabelecimento/mercadopago/status', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    return { conectado: estabelecimento?.mpConectado ?? false };
  });

  // DELETE /meu-estabelecimento/mercadopago/desconectar
  fastify.delete('/meu-estabelecimento/mercadopago/desconectar', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data: {
        mpAccessToken: null, mpRefreshToken: null, mpUserId: null,
        mpTokenExpiraEm: null, mpConectado: false,
      },
    });
    return reply.status(204).send();
  });

  // GET /mercadopago/callback — redirect do Mercado Pago após autorização (sem auth)
  fastify.get('/mercadopago/callback', {
    schema: { querystring: CallbackQuerySchema },
  }, async (request, reply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0].trim() ?? 'http://localhost:5173';

    if (error || !code || !state) {
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=erro`);
    }

    let estabelecimentoId: string;
    try {
      const payload = fastify.jwt.verify<{ estabelecimentoId: string }>(state);
      estabelecimentoId = payload.estabelecimentoId;
    } catch {
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=erro`);
    }

    try {
      const tokens = await trocarCodePorToken(code);
      await prisma.estabelecimento.update({
        where: { id: estabelecimentoId },
        data: {
          mpAccessToken:   tokens.accessToken,
          mpRefreshToken:  tokens.refreshToken,
          mpUserId:        tokens.userId,
          mpTokenExpiraEm: tokens.expiraEm,
          mpConectado:     true,
        },
      });
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=conectado`);
    } catch (err) {
      fastify.log.error({ err }, 'Falha ao trocar code por token do Mercado Pago');
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=erro`);
    }
  });
}
```

- [ ] **Step 2: Registrar a rota em `src/server.ts`**

Em `src/server.ts`, adicionar o import junto aos demais (linha 12, após `webhookRoutes`):

```ts
import { webhookRoutes } from './routes/webhook.js';
import { mercadoPagoRoutes } from './routes/mercadopago.js';
```

E registrar junto às rotas públicas (linha ~62, após `publicoRoutes`):

```ts
  await fastify.register(publicoRoutes);
  await fastify.register(mercadoPagoRoutes);
```

- [ ] **Step 3: Verificar manualmente que o build compila e o servidor sobe**

Run: `npm run dev`
Expected: servidor inicia sem erro de tipo/import; `curl -s http://localhost:3000/meu-estabelecimento/mercadopago/status` retorna 401 (sem token) — confirma que a rota está registrada e protegida.

- [ ] **Step 4: Commit**

```bash
git add src/routes/mercadopago.ts src/server.ts
git commit -m "feat: rotas de conexão OAuth com Mercado Pago"
```

---

### Task 4: Webhook de confirmação de pagamento

**Files:**
- Modify: `src/routes/mercadopago.ts` (adicionar rota de webhook)

**Interfaces:**
- Consumes: `buscarPagamento` de `../mercadopago.js`; `getIO` de `../socket.js`; `enviarPush` de `../push.js`; `whatsApp.enviarMensagem` de `../whatsapp.js`; `montarResumoWhatsApp` de `../utils/resumoPedido.js`.
- Produces: rota `POST /webhooks/mercadopago`, consumida pelo Mercado Pago (configurada na aplicação do dev portal).

- [ ] **Step 1: Adicionar imports em `src/routes/mercadopago.ts`**

```ts
import { montarUrlAutorizacao, trocarCodePorToken, buscarPagamento } from '../mercadopago.js';
import { getIO } from '../socket.js';
import { enviarPush } from '../push.js';
import { whatsApp } from '../whatsapp.js';
import { montarResumoWhatsApp } from '../utils/resumoPedido.js';
```

- [ ] **Step 2: Implementar a rota de webhook**

Adicionar dentro de `mercadoPagoRoutes`, após o callback:

```ts
  // POST /webhooks/mercadopago — notificação de pagamento (sem auth)
  fastify.post('/webhooks/mercadopago', async (request, reply) => {
    const query = request.query as { 'data.id'?: string; id?: string; topic?: string; type?: string };
    const body  = request.body as { data?: { id?: string }; type?: string } | undefined;

    const paymentId = query['data.id'] ?? query.id ?? body?.data?.id;
    const tipo       = query.topic ?? query.type ?? body?.type;

    if (tipo !== 'payment' || !paymentId) {
      return reply.status(200).send({ recebido: true });
    }

    const pedidoPendente = await prisma.pedido.findFirst({ where: { mpPaymentId: String(paymentId) } });
    if (!pedidoPendente || !pedidoPendente.aguardandoPagamento) {
      // Não é nosso pagamento, ou já foi processado antes (idempotência) — ignora sem erro.
      return reply.status(200).send({ recebido: true });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: pedidoPendente.estabelecimentoId },
    });
    if (!estabelecimento?.mpAccessToken) {
      return reply.status(200).send({ recebido: true });
    }

    const pagamento = await buscarPagamento(estabelecimento.mpAccessToken, String(paymentId));
    if (pagamento.status !== 'approved' || pagamento.externalReference !== pedidoPendente.id) {
      return reply.status(200).send({ recebido: true });
    }

    const pedidoConfirmado = await prisma.pedido.update({
      where:   { id: pedidoPendente.id },
      data:    { status: 'pagamento_confirmado', aguardandoPagamento: false, pagoEm: new Date() },
      include: { itens: true },
    });

    getIO().to(estabelecimento.id).emit('pedido:novo', pedidoConfirmado);

    // Push notification pro DONO — fire-and-forget
    prisma.pushSubscription.findMany({
      where: { usuario: { estabelecimentoId: estabelecimento.id } },
    }).then((subs) =>
      Promise.allSettled(subs.map((s) => enviarPush(s, {
        titulo: `Novo pedido — ${pedidoConfirmado.clienteNome}`,
        corpo:  `R$ ${Number(pedidoConfirmado.total).toFixed(2)} · Pix confirmado`,
        url:    '/cozinha',
      })))
    ).catch((err) => fastify.log.error({ err }, 'Falha push notifications (webhook MP)'));

    // WhatsApp pro DONO — fire-and-forget
    if (estabelecimento.telefone) {
      whatsApp.enviarMensagem(
        estabelecimento.id, estabelecimento.telefone,
        `💰 Pix confirmado — *${pedidoConfirmado.clienteNome}*\nTotal: R$ ${Number(pedidoConfirmado.total).toFixed(2)}`,
      ).catch((err) => fastify.log.error({ err }, 'Falha WhatsApp dono (webhook MP)'));
    }

    // Resumo pro CLIENTE — fire-and-forget (suspenso até aqui pra não vazar pedido não pago)
    if (pedidoConfirmado.clienteFone) {
      const msgCliente = montarResumoWhatsApp({
        nomeEstabelecimento: estabelecimento.nome,
        clienteNome:         pedidoConfirmado.clienteNome,
        itens:               pedidoConfirmado.itens.map((i) => ({
          nomeItem: i.nomeItem, quantidade: i.quantidade, precoUnit: Number(i.precoUnit),
        })),
        subtotal:            Number(pedidoConfirmado.total) - Number(pedidoConfirmado.taxaEntrega ?? 0),
        taxaEntrega:         Number(pedidoConfirmado.taxaEntrega ?? 0),
        bairroNome:          pedidoConfirmado.bairroNome,
        enderecoEntrega:     pedidoConfirmado.enderecoEntrega,
        tipoEntrega:         pedidoConfirmado.tipoEntrega,
        formaPagamento:      pedidoConfirmado.formaPagamento,
        precisaTroco:        false,
        trocoPara:           null,
        total:               Number(pedidoConfirmado.total),
        chavePix:            null,
      });
      whatsApp.enviarMensagem(estabelecimento.id, pedidoConfirmado.clienteFone, msgCliente)
        .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp cliente (webhook MP)'));
    }

    return reply.status(200).send({ recebido: true });
  });
```

- [ ] **Step 3: Verificar manualmente com curl simulando uma notificação**

Run: `curl -s -X POST "http://localhost:3000/webhooks/mercadopago?topic=payment&id=123"`
Expected: `{"recebido":true}` com status 200 (não há pedido com esse `mpPaymentId` ainda, então cai no early-return — comportamento correto e seguro).

- [ ] **Step 4: Commit**

```bash
git add src/routes/mercadopago.ts
git commit -m "feat: webhook de confirmação de pagamento Pix (Mercado Pago)"
```

---

### Task 5: Checkout público — criar pagamento Pix ao finalizar pedido

**Files:**
- Modify: `src/routes/publico.ts`

**Interfaces:**
- Consumes: `criarPagamentoPix`, `obterAccessTokenValido` de `../mercadopago.js`.
- Produces: campo `mpConectado` na resposta de `GET /publico/:slug`; campos `pixCopiaCola`/`pixQrCodeBase64` na resposta de `POST /publico/:slug/pedido`; nova rota `GET /publico/:slug/pedidos/:id/status` — consumida pelo frontend na Task 10.

- [ ] **Step 1: Expor `mpConectado` no cardápio público**

Em `src/routes/publico.ts:84-93`, incluir o campo:

```ts
    return {
      estabelecimento: {
        nome:             estabelecimento.nome,
        slug:             estabelecimento.slug,
        aceitandoPedidos: estabelecimento.aceitandoPedidos,
        chavePix:         estabelecimento.chavePix,
        mpConectado:      estabelecimento.mpConectado,
        taxaEntrega:      estabelecimento.taxaEntrega !== null
          ? Number(estabelecimento.taxaEntrega)
          : null,
      },
```

- [ ] **Step 2: Importar `criarPagamentoPix` e bloquear Pix sem conexão**

No topo do arquivo, adicionar:

```ts
import { criarPagamentoPix, obterAccessTokenValido } from '../mercadopago.js';
```

Em `POST /publico/:slug/pedido`, logo após a checagem de `aceitandoPedidos` (linha ~165):

```ts
    if (!estabelecimento.aceitandoPedidos) {
      return reply.status(503).send({ erro: 'Estabelecimento temporariamente fechado' });
    }

    if (formaPagamento === 'pix' && !estabelecimento.mpConectado) {
      return reply.status(400).send({ erro: 'Pagamento via Pix indisponível no momento' });
    }
```

- [ ] **Step 3: Criar o pagamento Pix antes do pedido, e incluir os dados no `create`**

Substituir o bloco de criação do pedido (linhas ~215-226) por:

```ts
    let dadosPix: { mpPaymentId: string; pixCopiaCola: string; pixQrCodeBase64: string } | null = null;
    if (formaPagamento === 'pix') {
      try {
        const payerEmail = `cliente-${Date.now()}@${estabelecimento.slug}.comanda-ia.dev`;
        const accessToken = await obterAccessTokenValido(estabelecimento);
        const pagamento = await criarPagamentoPix({
          accessToken,
          valor:              total,
          descricao:          `Pedido — ${estabelecimento.nome}`,
          externalReference:  crypto.randomUUID(),
          payerEmail,
        });
        dadosPix = {
          mpPaymentId:     pagamento.id,
          pixCopiaCola:    pagamento.qrCode,
          pixQrCodeBase64: pagamento.qrCodeBase64,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Falha ao criar pagamento Pix');
        return reply.status(502).send({ erro: 'Não foi possível gerar o pagamento Pix. Tente novamente.' });
      }
    }

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome, clienteFone: clienteFoneNormalizado, enderecoEntrega, total, formaPagamento, tipoEntrega,
        precisaTroco: formaPagamento === 'dinheiro' ? !!precisaTroco : false,
        trocoPara:    formaPagamento === 'dinheiro' && precisaTroco ? trocoPara : null,
        bairroNome:  resultadoTaxa.bairroNome,
        taxaEntrega: resultadoTaxa.taxa,
        estabelecimentoId: estabelecimento.id,
        itens: { create: itensComSnapshot },
        ...(dadosPix ? { ...dadosPix, aguardandoPagamento: true } : {}),
      },
      include: { itens: true },
    });
```

> Nota: `externalReference` usa `crypto.randomUUID()` neste passo porque o `pedido.id` só existe depois do `create` — o Mercado Pago exige o valor no momento da criação do pagamento. Ele é salvo como `mpPaymentId` (não como `external_reference` do pedido), e a busca no webhook usa `mpPaymentId`, não `external_reference` — por isso a consistência não depende de os dois valores serem iguais. `crypto` é global no Node 22, não precisa de import.

- [ ] **Step 4: Suprimir notificações "novo pedido" enquanto aguarda pagamento**

Envolver os blocos de Socket.IO, push, e-mail e WhatsApp (linhas ~240-302) com a checagem `!pedido.aguardandoPagamento`:

```ts
    // Decrementar estoque — fire-and-forget (mantém comportamento atual mesmo pro Pix aguardando pagamento)
    Promise.all(
      itens.map((pedidoItem: ItemPedidoInput) => {
        const ic = itensCardapio.find((i: ItemCardapioRow) => i.id === pedidoItem.itemCardapioId)!;
        if (ic.estoque === null || ic.estoque === undefined) return Promise.resolve();
        return prisma.itemCardapio.update({
          where: { id: pedidoItem.itemCardapioId },
          data:  { estoque: { decrement: pedidoItem.quantidade } },
        });
      })
    ).catch((err) => fastify.log.error({ err }, 'Falha ao decrementar estoque'));

    if (!pedido.aguardandoPagamento) {
      getIO().to(estabelecimento.id).emit('pedido:novo', pedido);

      // Push notification — fire-and-forget
      prisma.pushSubscription.findMany({
        where: { usuario: { estabelecimentoId: estabelecimento.id } },
      }).then((subs) =>
        Promise.allSettled(
          subs.map((s) => enviarPush(s, {
            titulo: `Novo pedido — ${clienteNome}`,
            corpo:  `R$ ${total.toFixed(2)} · ${itensComSnapshot.length} item(s)`,
            url:    '/cozinha',
          }))
        )
      ).catch((err) => fastify.log.error({ err }, 'Falha push notifications'));

      // Email para o DONO — fire-and-forget
      const dono = estabelecimento.usuarios[0];
      if (dono) {
        const urlFrontend = process.env.FRONTEND_URL?.split(',')[0].trim() ?? 'http://localhost:5173';
        enviarEmail({
          to:      dono.email,
          subject: `Novo pedido de ${clienteNome} — ${estabelecimento.nome}`,
          html:    templates.novoPedido({
            nomeEstabelecimento: estabelecimento.nome,
            clienteNome,
            itens: itensComSnapshot,
            total,
            urlFrontend,
          }),
        }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de novo pedido'));
      }

      // WhatsApp para o DONO — fire-and-forget
      if (estabelecimento.telefone) {
        const itensTxt = itensComSnapshot
          .map((i: { nomeItem: string; quantidade: number; precoUnit: number }) =>
            `• ${i.quantidade}x ${i.nomeItem}`)
          .join('\n');
        const msgDono = `🍽️ Novo pedido — *${estabelecimento.nome}*\n\nCliente: *${clienteNome}*\nFone: ${clienteFoneNormalizado ?? 'não informado'}\nTotal: *R$ ${total.toFixed(2)}*\n\nItens:\n${itensTxt}`;
        whatsApp.enviarMensagem(estabelecimento.id, estabelecimento.telefone, msgDono)
          .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp dono'));
      }

      // WhatsApp para o CLIENTE — resumo do pedido (fire-and-forget)
      if (clienteFoneNormalizado) {
        const msgCliente = montarResumoWhatsApp({
          nomeEstabelecimento: estabelecimento.nome,
          clienteNome,
          itens: itensComSnapshot,
          subtotal,
          taxaEntrega: resultadoTaxa.taxa,
          bairroNome: resultadoTaxa.bairroNome,
          enderecoEntrega: enderecoEntrega ?? null,
          tipoEntrega,
          formaPagamento,
          precisaTroco: formaPagamento === 'dinheiro' ? !!precisaTroco : false,
          trocoPara: formaPagamento === 'dinheiro' && precisaTroco ? trocoPara ?? null : null,
          total,
          chavePix: estabelecimento.chavePix,
        });
        whatsApp.enviarMensagem(estabelecimento.id, clienteFoneNormalizado, msgCliente)
          .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp cliente'));
      }
    }
```

(O resumo pro cliente de pedidos Pix confirmados é enviado depois, pelo webhook — Task 4.)

- [ ] **Step 5: Devolver os dados do Pix na resposta**

Substituir o `return` final da rota (linhas ~304-308):

```ts
    return reply.status(201).send({
      id:              pedido.id,
      total:           Number(pedido.total),
      mensagem:        pedido.aguardandoPagamento
        ? 'Escaneie o QR Code ou copie o código Pix para pagar.'
        : 'Pedido recebido! A cozinha foi avisada.',
      pixCopiaCola:    pedido.pixCopiaCola,
      pixQrCodeBase64: pedido.pixQrCodeBase64,
    });
```

- [ ] **Step 6: Adicionar rota pública de status para o polling do frontend**

Adicionar ao final de `publicoRoutes`, antes do fechamento da função:

```ts
  // GET /publico/:slug/pedidos/:id/status — polling do status de pagamento (sem auth)
  fastify.get('/publico/:slug/pedidos/:id/status', {
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { slug } });
    if (!estabelecimento) return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });

    const pedido = await prisma.pedido.findFirst({
      where:  { id, estabelecimentoId: estabelecimento.id },
      select: { status: true, aguardandoPagamento: true },
    });
    if (!pedido) return reply.status(404).send({ erro: 'Pedido não encontrado' });

    return { status: pedido.status, pago: !pedido.aguardandoPagamento };
  });
```

- [ ] **Step 7: Verificar manualmente**

Run: `npm run dev`, depois num estabelecimento de teste **sem** Mercado Pago conectado:
`curl -s -X POST http://localhost:3000/publico/<slug>/pedido -H 'Content-Type: application/json' -d '{"clienteNome":"Teste","tipoEntrega":"retirada","formaPagamento":"pix","itens":[{"itemCardapioId":"<id>","quantidade":1}]}'`
Expected: `400 { "erro": "Pagamento via Pix indisponível no momento" }`.

- [ ] **Step 8: Commit**

```bash
git add src/routes/publico.ts
git commit -m "feat: checkout público cria pagamento Pix via Mercado Pago"
```

---

### Task 6: Pedido manual — suporte a Pix via Mercado Pago

**Files:**
- Modify: `src/routes/pedidos.ts`

**Interfaces:**
- Consumes: `criarPagamentoPix`, `obterAccessTokenValido` de `../mercadopago.js`.
- Produces: `pixCopiaCola`/`pixQrCodeBase64` na resposta de `POST /pedidos/manual` — consumidos pela Task 7 (frontend Cozinha).

- [ ] **Step 1: Importar `criarPagamentoPix`**

No topo de `src/routes/pedidos.ts`:

```ts
import { criarPagamentoPix, obterAccessTokenValido } from '../mercadopago.js';
```

- [ ] **Step 2: Bloquear Pix sem conexão e criar o pagamento antes do pedido**

Em `POST /pedidos/manual`, logo após buscar `estabelecimento` (linha ~361), antes de calcular `resultadoTaxa`:

```ts
    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });

    if (formaPagamentoFinal === 'pix' && !estabelecimento?.mpConectado) {
      return reply.status(400).send({ erro: 'Pagamento via Pix indisponível — conecte o Mercado Pago em Configurações' });
    }
```

Substituir a criação do pedido (linhas ~378-394) por:

```ts
    let dadosPix: { mpPaymentId: string; pixCopiaCola: string; pixQrCodeBase64: string } | null = null;
    if (formaPagamentoFinal === 'pix') {
      try {
        const payerEmail = `cliente-${Date.now()}@${estabelecimento!.slug}.comanda-ia.dev`;
        const accessToken = await obterAccessTokenValido(estabelecimento!);
        const pagamento = await criarPagamentoPix({
          accessToken,
          valor:              total,
          descricao:          `Pedido — ${estabelecimento!.nome}`,
          externalReference:  crypto.randomUUID(),
          payerEmail,
        });
        dadosPix = {
          mpPaymentId:     pagamento.id,
          pixCopiaCola:    pagamento.qrCode,
          pixQrCodeBase64: pagamento.qrCodeBase64,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Falha ao criar pagamento Pix (pedido manual)');
        return reply.status(502).send({ erro: 'Não foi possível gerar o pagamento Pix. Tente novamente.' });
      }
    }

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome,
        clienteFone: clienteFoneNormalizado,
        enderecoEntrega: enderecoEntrega?.trim() || null,
        bairroNome:  resultadoTaxa.bairroNome,
        taxaEntrega: resultadoTaxa.taxa,
        total,
        tipoEntrega: tipoEntregaFinal,
        formaPagamento: formaPagamentoFinal,
        precisaTroco: formaPagamentoFinal === 'dinheiro' ? !!precisaTroco : false,
        trocoPara:    formaPagamentoFinal === 'dinheiro' && precisaTroco ? trocoPara : null,
        estabelecimentoId: estabelecimentoId!,
        itens: { create: itensComSnapshot },
        ...(dadosPix ? { ...dadosPix, aguardandoPagamento: true } : {}),
      },
      include: { itens: true },
    });
```

- [ ] **Step 3: Suprimir socket e WhatsApp enquanto aguarda pagamento**

Envolver o bloco de notificação (linhas ~396-420) com a mesma checagem da Task 5:

```ts
    if (!pedido.aguardandoPagamento) {
      getIO().to(estabelecimentoId!).emit('pedido:novo', pedido);

      if (clienteFoneNormalizado) {
        const msgCliente = montarResumoWhatsApp({
          nomeEstabelecimento: estabelecimento!.nome,
          clienteNome,
          itens: itensComSnapshot,
          subtotal,
          taxaEntrega: resultadoTaxa.taxa,
          bairroNome: resultadoTaxa.bairroNome,
          enderecoEntrega: enderecoEntrega?.trim() || null,
          tipoEntrega: tipoEntregaFinal,
          formaPagamento: formaPagamentoFinal,
          precisaTroco: formaPagamentoFinal === 'dinheiro' ? !!precisaTroco : false,
          trocoPara: formaPagamentoFinal === 'dinheiro' && precisaTroco ? trocoPara ?? null : null,
          total,
          chavePix: estabelecimento!.chavePix,
        });
        whatsApp.enviarMensagem(estabelecimentoId!, clienteFoneNormalizado, msgCliente)
          .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp cliente (pedido manual)'));
      }
    }
```

Remover a segunda busca redundante de `estabWp` que existia antes (linha ~400-401 do arquivo original) — já temos `estabelecimento` carregado no topo da rota.

- [ ] **Step 4: Devolver os dados do Pix na resposta**

O `return reply.status(201).send(pedido)` já existente devolve o objeto `pedido` completo, que agora inclui `pixCopiaCola`/`pixQrCodeBase64`/`aguardandoPagamento` — nenhuma mudança necessária aqui.

- [ ] **Step 5: Verificar manualmente**

Run: `npm run dev`, autenticado como DONO de um estabelecimento **sem** MP conectado:
`curl -s -X POST http://localhost:3000/pedidos/manual -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"clienteNome":"Balcão","formaPagamento":"pix","itens":[{"itemCardapioId":"<id>","quantidade":1}]}'`
Expected: `400 { "erro": "Pagamento via Pix indisponível — conecte o Mercado Pago em Configurações" }`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/pedidos.ts
git commit -m "feat: pedido manual cria pagamento Pix via Mercado Pago"
```

---

### Task 7: Cozinha — ocultar pedidos aguardando pagamento

**Files:**
- Modify: `src/routes/pedidos.ts:145-151`

**Interfaces:**
- Consumes: campo `aguardandoPagamento` do model `Pedido` (Task 1).

- [ ] **Step 1: Adicionar o filtro no `where` de `GET /pedidos`**

Em `src/routes/pedidos.ts`, dentro do handler de `GET /pedidos`:

```ts
    const where = {
      estabelecimentoId: estabelecimentoId!,
      aguardandoPagamento: false,
      ...(status    ? { status: { in: status } } : {}),
      ...(dataInicio || dataFim
        ? { criadoEm: { ...(dataInicio ? { gte: dataInicio } : {}), ...(dataFim ? { lte: dataFim } : {}) } }
        : {}),
    };
```

- [ ] **Step 2: Verificar manualmente**

Com um pedido Pix criado via checkout público (Task 5) e ainda não pago: `GET /pedidos` (autenticado) não deve incluí-lo na lista; após o webhook confirmar (Task 4), ele passa a aparecer.

- [ ] **Step 3: Commit**

```bash
git add src/routes/pedidos.ts
git commit -m "fix: ocultar da Cozinha pedidos Pix aguardando confirmação do Mercado Pago"
```

---

### Task 8: Corrigir fluxo de comprovante por foto no WhatsApp

**Files:**
- Modify: `src/whatsapp.ts:204-208`

**Interfaces:**
- Consumes: campo `mpPaymentId` do model `Pedido` (Task 1).

O fluxo de IA que confirma pedidos Pix a partir de uma foto de comprovante (`handleComprovante`) foi construído para o Pix manual (chave copiada, sem verificação real). Pedidos criados via Mercado Pago já têm verificação automática e mais confiável pelo webhook — não podem ser confirmados por uma foto sem checagem real de pagamento, ou um cliente poderia enviar qualquer imagem e pular a fila sem ter pago.

- [ ] **Step 1: Excluir pedidos rastreados pelo Mercado Pago da busca por comprovante**

Em `src/whatsapp.ts`, dentro de `handleComprovante`:

```ts
    const pedidosPendentes = await prisma.pedido.findMany({
      where:   { estabelecimentoId, status: 'recebido', formaPagamento: 'pix', mpPaymentId: null, criadoEm: { gte: ontemAtras } },
      orderBy: { criadoEm: 'desc' },
      include: { itens: true },
    })
```

- [ ] **Step 2: Verificar manualmente**

Criar um pedido Pix via checkout público (fica com `mpPaymentId` preenchido e invisível na Cozinha). Simular envio de uma foto qualquer pro número conectado do estabelecimento — a resposta deve ser "Não há pedidos PIX pendentes no momento", nunca confirmar esse pedido.

- [ ] **Step 3: Commit**

```bash
git add src/whatsapp.ts
git commit -m "fix: comprovante por foto no WhatsApp não confirma mais pedidos rastreados pelo Mercado Pago"
```

---

### Task 9: Frontend — conectar Mercado Pago em Configurações

**Files:**
- Modify: `frontend/src/pages/Configuracoes.tsx`

**Interfaces:**
- Consumes: `GET /meu-estabelecimento/mercadopago/status`, `GET /meu-estabelecimento/mercadopago/conectar`, `DELETE /meu-estabelecimento/mercadopago/desconectar` (Task 3).

- [ ] **Step 1: Adicionar estado e verificação de status**

Em `frontend/src/pages/Configuracoes.tsx`, junto aos outros `useState` de WhatsApp (linha ~43-48):

```ts
  const [mpStatus, setMpStatus]           = useState<{ conectado: boolean } | null>(null)
  const [conectandoMp, setConectandoMp]   = useState(false)
  const [desconectandoMp, setDesconectandoMp] = useState(false)
  const [erroMp, setErroMp]               = useState<string | null>(null)
  const [avisoMp, setAvisoMp]             = useState<string | null>(null)

  const verificarStatusMp = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/mercadopago/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) setMpStatus(await r.json())
    } catch {
      // silencioso
    }
  }, [token])
```

- [ ] **Step 2: Chamar a verificação no carregamento e ler o parâmetro de retorno do OAuth**

No `useEffect` existente (linha ~75-90), após `verificarStatus()`:

```ts
        verificarStatus()
        verificarStatusMp()
      })
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token, verificarStatus, verificarStatusMp])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resultado = params.get('mercadopago')
    if (resultado === 'conectado') {
      setAvisoMp('Mercado Pago conectado com sucesso!')
      verificarStatusMp()
    } else if (resultado === 'erro') {
      setErroMp('Não foi possível conectar o Mercado Pago. Tente novamente.')
    }
    if (resultado) window.history.replaceState({}, '', window.location.pathname)
  }, [verificarStatusMp])
```

- [ ] **Step 3: Adicionar as funções de conectar/desconectar**

Junto às funções `conectarWhatsApp`/`desconectarWhatsApp` (linha ~219-260):

```ts
  async function conectarMercadoPago() {
    setErroMp(null)
    setConectandoMp(true)
    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/mercadopago/conectar`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json()
      if (!r.ok) { setErroMp(data.erro ?? 'Erro ao gerar link de conexão'); return }
      window.location.href = data.url
    } catch {
      setErroMp('Falha ao conectar')
      setConectandoMp(false)
    }
  }

  async function desconectarMercadoPago() {
    if (!window.confirm('Desconectar o Mercado Pago? Pedidos por Pix ficam indisponíveis até reconectar.')) return
    setDesconectandoMp(true)
    try {
      await fetch(`${API_URL}/meu-estabelecimento/mercadopago/desconectar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setMpStatus({ conectado: false })
    } catch {
      setErroMp('Falha ao desconectar')
    } finally {
      setDesconectandoMp(false)
    }
  }
```

- [ ] **Step 4: Adicionar a seção visual, logo após o bloco do WhatsApp (linha 576)**

```tsx
        {/* Mercado Pago */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-zinc-200">Mercado Pago</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Conecte sua conta para receber pagamentos Pix diretamente, com confirmação automática.
              </p>
            </div>
            {mpStatus && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                mpStatus.conectado
                  ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                  : 'bg-zinc-700 text-zinc-400 ring-zinc-600'
              }`}>
                {mpStatus.conectado ? 'Conectado' : 'Não conectado'}
              </span>
            )}
          </div>

          {avisoMp && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 ring-1 ring-emerald-500/30">
              {avisoMp}
            </p>
          )}
          {erroMp && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erroMp}
            </p>
          )}

          {mpStatus?.conectado ? (
            <button
              type="button"
              onClick={desconectarMercadoPago}
              disabled={desconectandoMp}
              className="flex items-center gap-1.5 rounded-xl border border-red-800 bg-red-950 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-900 disabled:opacity-50"
            >
              {desconectandoMp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={conectarMercadoPago}
              disabled={conectandoMp}
              className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {conectandoMp ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecionando...</> : 'Conectar Mercado Pago'}
            </button>
          )}
        </div>
```

- [ ] **Step 5: Verificar manualmente no navegador**

Run: `cd frontend && npm run dev`
Abrir `/configuracoes` logado como DONO. Confirmar que a seção "Mercado Pago" aparece com o estado "Não conectado" e o botão "Conectar Mercado Pago" (o redirect real requer `MP_CLIENT_ID`/`MP_CLIENT_SECRET` configurados — validar isso na Task 11).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Configuracoes.tsx
git commit -m "feat: conectar Mercado Pago na tela de Configurações"
```

---

### Task 10: Frontend — checkout com QR Pix e confirmação automática

**Files:**
- Create: `frontend/src/components/PixAguardandoPagamento.tsx`
- Modify: `frontend/src/pages/CardapioPublico.tsx`

**Interfaces:**
- Consumes: `GET /publico/:slug/pedidos/:id/status` (Task 5); campos `pixCopiaCola`/`pixQrCodeBase64` na resposta de `POST /publico/:slug/pedido` (Task 5); campo `mpConectado` na resposta de `GET /publico/:slug` (Task 5).
- Produces: componente `PixAguardandoPagamento` usado por `CardapioPublico.tsx`.

- [ ] **Step 1: Criar o componente de espera de pagamento com polling**

```tsx
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { API_URL } from '../lib/api'

interface Props {
  slug: string
  pedidoId: string
  pixCopiaCola: string
  pixQrCodeBase64: string
  onPago: () => void
}

export default function PixAguardandoPagamento({ slug, pedidoId, pixCopiaCola, pixQrCodeBase64, onPago }: Props) {
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const intervalo = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/publico/${slug}/pedidos/${pedidoId}/status`)
        if (!r.ok) return
        const dados: { status: string; pago: boolean } = await r.json()
        if (dados.pago) {
          clearInterval(intervalo)
          onPago()
        }
      } catch {
        // silencioso — tenta de novo no próximo ciclo
      }
    }, 3000)
    return () => clearInterval(intervalo)
  }, [slug, pedidoId, onPago])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <p className="mb-1 text-lg font-bold">Escaneie para pagar</p>
        <p className="mb-4 text-sm text-zinc-400">O pedido é confirmado automaticamente assim que o Pix cair</p>

        <img
          src={`data:image/png;base64,${pixQrCodeBase64}`}
          alt="QR Code Pix"
          className="mx-auto h-56 w-56 rounded-xl bg-white p-2"
        />

        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(pixCopiaCola)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          }}
          className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-700"
        >
          {copiado ? <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Copiado!</span> : 'Copiar código Pix'}
        </button>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando pagamento...
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar `mpConectado` e os campos de Pix aos tipos existentes**

Em `frontend/src/pages/CardapioPublico.tsx`, ajustar as interfaces (linhas 15-36):

```ts
interface CardapioData {
  estabelecimento: {
    nome: string
    slug: string
    aceitandoPedidos: boolean
    chavePix: string | null
    mpConectado: boolean
    taxaEntrega: number | null
  }
  cardapio: ItemPublico[]
}

// ...

interface PedidoConfirmado {
  id: string
  total: number
  mensagem: string
  pixCopiaCola?: string | null
  pixQrCodeBase64?: string | null
}
```

- [ ] **Step 3: Importar o novo componente e adicionar estado de pedido pendente**

No topo do arquivo:

```ts
import PixAguardandoPagamento from '../components/PixAguardandoPagamento'
```

No componente `CardapioPublico` (junto aos demais `useState`, linha ~58-62):

```ts
  const [pedidoAguardandoPix, setPedidoAguardandoPix] = useState<PedidoConfirmado | null>(null)
```

- [ ] **Step 4: Ajustar o fluxo de sucesso do checkout para desviar para o Pix quando necessário**

Localizar onde `onSucesso` é passado ao componente de checkout (props `onSucesso={...}` no JSX de `CardapioPublico`) e trocar o handler para:

```ts
  function handleSucessoPedido(pedido: PedidoConfirmado) {
    if (pedido.pixCopiaCola && pedido.pixQrCodeBase64) {
      setPedidoAguardandoPix(pedido)
      setCheckoutAberto(false)
      return
    }
    setPedidoConfirmado(pedido)
    setCheckoutAberto(false)
  }
```

E usar `onSucesso={handleSucessoPedido}` no lugar do handler anterior.

Depois, renderizar o componente de espera condicionalmente (próximo de onde `pedidoConfirmado` já é renderizado):

```tsx
      {pedidoAguardandoPix?.pixCopiaCola && pedidoAguardandoPix?.pixQrCodeBase64 && (
        <PixAguardandoPagamento
          slug={slug!}
          pedidoId={pedidoAguardandoPix.id}
          pixCopiaCola={pedidoAguardandoPix.pixCopiaCola}
          pixQrCodeBase64={pedidoAguardandoPix.pixQrCodeBase64}
          onPago={() => {
            setPedidoConfirmado(pedidoAguardandoPix)
            setPedidoAguardandoPix(null)
          }}
        />
      )}
```

- [ ] **Step 5: Desabilitar a opção Pix quando o estabelecimento não estiver conectado**

No componente interno de checkout (por volta da linha 596, onde `formaPagamento` é selecionado como botão), passar `dados.estabelecimento.mpConectado` como prop (`mpConectado`) e usar:

```tsx
<button
  type="button"
  disabled={valor === 'pix' && !mpConectado}
  onClick={() => setFormaPagamento(valor)}
  className={/* ...classes existentes..., */ `${valor === 'pix' && !mpConectado ? 'opacity-40 cursor-not-allowed' : ''}`}
>
  {formaPagamentoLabel[valor]}
  {valor === 'pix' && !mpConectado && <span className="block text-[10px] text-zinc-500">Indisponível</span>}
</button>
```

(Ajustar de acordo com o JSX real do botão de forma de pagamento nesse trecho — a lógica-chave é `disabled` e o aviso "Indisponível" quando `!mpConectado`.)

- [ ] **Step 6: Remover a exibição da chave Pix manual na etapa de resumo**

No bloco `{formaPagamento === 'pix' && (...)}` da etapa de resumo (linhas ~698-716), remover completamente — a partir de agora o QR aparece só depois do pedido ser criado, via `PixAguardandoPagamento`. O texto do botão de confirmar (linha 729) deixa de ter o caso especial `'Já paguei — Confirmar pedido'`:

```tsx
{enviando ? 'Enviando...' : 'Confirmar pedido'}
```

- [ ] **Step 7: Verificar manualmente no navegador**

Run: `cd frontend && npm run dev`
Fluxo: abrir cardápio público de um estabelecimento com Mercado Pago conectado → montar carrinho → escolher Pix → confirmar → deve aparecer o QR Code com polling ("Aguardando pagamento..."). Simular aprovação chamando o webhook manualmente (Task 4, Step 3, mas com um `mpPaymentId` real de teste) e confirmar que a tela avança sozinha para a tela de avaliação.
Também testar um estabelecimento **sem** Mercado Pago conectado: a opção Pix deve aparecer desabilitada com "Indisponível".

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/PixAguardandoPagamento.tsx frontend/src/pages/CardapioPublico.tsx
git commit -m "feat: checkout público exibe QR Pix e confirma pagamento automaticamente"
```

---

### Task 11: Variáveis de ambiente e documentação

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Criar a aplicação no Mercado Pago Developers**

Manual (fora do editor): criar uma aplicação em https://www.mercadopago.com.br/developers, modelo "Marketplace/Plataforma", obter `Client ID` e `Client Secret`, e cadastrar a URL de redirect OAuth: `https://<seu-backend>/mercadopago/callback` (em dev: `http://localhost:3000/mercadopago/callback`). Cadastrar também a URL do webhook: `https://<seu-backend>/webhooks/mercadopago`.

- [ ] **Step 2: Adicionar as variáveis no `.env` local e no Railway**

```
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...
MP_REDIRECT_URI=http://localhost:3000/mercadopago/callback   # produção: URL do Railway
```

- [ ] **Step 3: Atualizar `CLAUDE.md` — seção de variáveis de ambiente**

Em `CLAUDE.md`, no bloco `**Backend (.env / Railway):**`, adicionar:

```
R2_PUBLIC_URL=...                  # Cloudflare R2 (fotos)
MP_CLIENT_ID=...                   # Mercado Pago — OAuth (split de pagamentos)
MP_CLIENT_SECRET=...               # Mercado Pago — OAuth
MP_REDIRECT_URI=...                # Mercado Pago — URL de callback OAuth
```

- [ ] **Step 4: Atualizar `CLAUDE.md` — seção "Log de mudanças"**

Adicionar uma entrada no topo da seção `## Log de mudanças` (criada em 2026-07-03) descrevendo a feature entregue, seguindo o mesmo formato das entradas anteriores.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: variáveis de ambiente do Mercado Pago e changelog"
```
