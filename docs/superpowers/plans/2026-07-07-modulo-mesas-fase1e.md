# Fase 1e — Fechamento de Conta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a caixa/DONO close out a table's bill — splitting by comanda, evenly, or by
picking specific items/free amounts — record manual payments (no gateway), apply a
supervisor-gated discount, reverse a payment if needed, and close the `Conta` once the
balance reaches zero.

**Architecture:** Reuse the existing `Conta`/`Comanda`/`ItemComanda`/`Pagamento`/`PagamentoItem`
schema from Fase 1a — no new tables, only two new nullable columns on `Conta`. All balance
math lives in pure functions (`src/utils/fechamentoConta.ts`) so it's unit-testable without a
database, following the precedent of `src/utils/statusProducao.ts` and `src/utils/producao.ts`.
A new backend route file (`src/routes/pagamentos.ts`) adds the mutating endpoints; the two
existing `GET /contas` routes get their permission check broadened (additive) so the new
screen can read them too. The frontend gets one new page, `Caixa.tsx`, gated by a new
`caixa` permission — completely separate from `Mesas.tsx`, mirroring how `Producao.tsx` was
added in Fase 1d without touching the garçom screen. No new Socket.IO room design is
needed: every mutation re-emits the existing `conta:atualizada` event with the exact same
payload shape `Mesas.tsx` already expects, so that screen and the new one both refresh live
from data both already understand.

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7, PostgreSQL, Vitest (backend);
React 19, Vite, Tailwind, React Router 7, socket.io-client (frontend).

## Global Constraints

- Reuse `Estabelecimento.senhaReabrirPedido` (bcrypt hash, already exists) as the single
  supervisor password for both new sensitive actions (desconto, estorno) — do **not** add a
  new password field. Mirror the exact verification pattern already used in
  `POST /pedidos/:id/reabrir` (`src/routes/pedidos.ts`): 400 if no password configured, 403
  if the provided password doesn't match via `bcrypt.compare`.
- Money is stored as `Decimal(10,2)`. All balance comparisons and sums MUST be done in
  integer cents (`Math.round(valor * 100)`) to avoid floating-point drift — never compare
  raw `Number` decimals for equality or `<=`.
- `LogAuditoria` (schema already has the table, unused so far) gets its first real writes in
  this phase for the two new sensitive actions: `acao: 'conta:desconto'` and
  `acao: 'pagamento:estorno'`. Fields: `entidadeTipo`, `entidadeId`, `motivo`,
  `dadosAntes`/`dadosDepois`, `estabelecimentoId`, `usuarioId`. Broader retroactive audit
  logging of every sensitive action (item cancellation, etc.) is Fase 1f's job, not this
  phase's.
- The permission `caixa` already exists end-to-end on the backend (`PERMISSOES_VALIDAS` in
  `src/routes/operadores.ts`, and `temPermissao('mesas', 'caixa')` already has a passing test
  in `src/plugins/auth.test.ts` for OR-semantics) but is **missing from the frontend** —
  `frontend/src/lib/permissoes.ts`'s `Permissao` type and `TODAS_PERMISSOES` list don't
  include it yet. This phase adds it there for the first time.
- Every mutating endpoint in this phase (`POST /contas/:id/pagamentos`,
  `POST /contas/:id/desconto`, `PATCH /pagamentos/:id/estornar`, `POST /contas/:id/fechar`)
  returns the **same envelope shape** — the "resumo de fechamento" object defined in Task 2
  and Task 3 — so the frontend can use one setter for all four call sites.
- Do not change the payload shape of the existing `conta:atualizada` Socket.IO event.
  `Mesas.tsx` listens for it and expects the full serialized `Conta` (with `mesa` and
  `comandas[].itens`), exactly what `serializarConta()` in `src/routes/contas.ts` already
  produces. New code re-emits that same event with that same shape after every mutation —
  it does not invent a new shape or a new event name for this.
- No new Socket.IO room/handshake work. Fase 1d already built the `contexto: 'producao'`
  opt-in room mechanism for a different, setor-scoped need — this phase does not touch
  `src/socket.ts` or `src/utils/salasSocket.ts` at all.
- Desconto is a single value per `Conta`, not cumulative — applying it again overwrites the
  previous `descontoValor`/`descontoMotivo`. This is a deliberate simplification; note it in
  the task, don't build a discount history table.
- A `Conta` can only receive payments/discounts/closing while `status` is `aberta` or
  `aguardando_pagamento`. A `cancelada`/`fechada` `Conta` rejects all four new mutations
  with 422.
- **Explicit scope decision:** the spec's scenario F ("dois dividem um item" via
  `ItemComandaRateio`) is NOT built in this phase — it needs its own UI for picking which
  comandas share a single item's cost, which is a separate feature from splitting a bill
  that's already itemized correctly. `ItemComandaRateio` stays unused until a future phase.
  Scenario G ("saldo pendente / baixa manual") doesn't need new code: a caixa can already
  apply a desconto equal to the remaining `saldoDevedor` with a motivo like "baixa manual —
  cliente saiu" — it goes through the exact same supervisor-password + `LogAuditoria` path
  as any other discount, so no dedicated "force close" endpoint is needed.

---

## File Structure

- **`prisma/schema.prisma`** (modify) — add `Conta.descontoValor` and `Conta.descontoMotivo`.
- **`src/utils/fechamentoConta.ts`** (create) — pure functions: `calcularResumoConta`,
  `validarItensParaPagamento`. No Prisma/database imports, so Vitest can test it standalone.
- **`src/utils/fechamentoConta.test.ts`** (create) — unit tests for the above.
- **`src/routes/contas.ts`** (modify) — export `serializarConta` (currently private); broaden
  `GET /contas` and `GET /contas/:id` to `temPermissao('mesas', 'caixa')` so the new Caixa
  screen can read the account list/detail it already serves to the Mesas screen.
- **`src/routes/pagamentos.ts`** (create) — `GET /contas/:id/resumo`,
  `POST /contas/:id/pagamentos`, `POST /contas/:id/desconto`,
  `PATCH /pagamentos/:id/estornar`, `POST /contas/:id/fechar`.
- **`src/server.ts`** (modify) — register `pagamentosRoutes`.
- **`frontend/src/lib/permissoes.ts`** (modify) — add `'caixa'` to `Permissao` and
  `TODAS_PERMISSOES`.
- **`frontend/src/pages/Caixa.tsx`** (create, built across 3 tasks) — list of open accounts,
  fechamento detail view (resumo, three ways to split, discount, reversal, close button).
- **`frontend/src/App.tsx`** (modify) — add `/caixa` route gated by `permissao="caixa"`.
- **`frontend/src/components/Layout.tsx`** (modify) — add "Caixa" nav link gated by the
  `caixa` permission (not `mesas`).

---

### Task 1: Schema — desconto fields on Conta

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Conta.descontoValor: Decimal? @db.Decimal(10, 2)`,
  `Conta.descontoMotivo: String?` — consumed by Task 2's `calcularResumoConta` and Task 4's
  `POST /contas/:id/desconto`.

- [ ] **Step 1: Add the two fields to the `Conta` model**

Open `prisma/schema.prisma` and find the `Conta` model (currently):

```prisma
model Conta {
  id        String      @id @default(uuid())
  status    StatusConta @default(aberta)
  abertaEm  DateTime    @default(now())
  fechadaEm DateTime?

  mesaId String?
  mesa   Mesa?   @relation(fields: [mesaId], references: [id])

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  comandas   Comanda[]
  pagamentos Pagamento[]

  @@map("contas")
}
```

Replace it with:

```prisma
model Conta {
  id        String      @id @default(uuid())
  status    StatusConta @default(aberta)
  abertaEm  DateTime    @default(now())
  fechadaEm DateTime?

  descontoValor  Decimal? @db.Decimal(10, 2)
  descontoMotivo String?

  mesaId String?
  mesa   Mesa?   @relation(fields: [mesaId], references: [id])

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  comandas   Comanda[]
  pagamentos Pagamento[]

  @@map("contas")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name conta_fechamento_desconto`

Expected: Prisma creates a new folder under `prisma/migrations/` with a `migration.sql`
containing:

```sql
-- AlterTable
ALTER TABLE "contas" ADD COLUMN     "descontoValor" DECIMAL(10,2),
ADD COLUMN     "descontoMotivo" TEXT;
```

and prints `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`

Expected: exits 0, no errors. This refreshes `src/generated/prisma/` so
`prisma.conta.update({ data: { descontoValor: ... } })` type-checks in later tasks.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adiciona campos de desconto na Conta"
```

---

### Task 2: Pure functions for cálculo de saldo/fechamento

**Files:**
- Create: `src/utils/fechamentoConta.ts`
- Test: `src/utils/fechamentoConta.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no Prisma import — mirrors `src/utils/producao.ts`).
- Produces (used by Task 3–6's route handlers and frontend Task 8's TypeScript interfaces
  as the source of truth for the response shape):

```typescript
export interface ItemParaResumo {
  id: string;
  nomeItem: string;
  precoUnit: number | string; // Prisma Decimal comes through as string/Decimal-like
  quantidade: number;
  status: string;
}

export interface ComandaParaResumo {
  id: string;
  nome: string;
  itens: ItemParaResumo[];
}

export interface PagamentoItemParaResumo {
  itemComandaId: string;
}

export interface PagamentoParaResumo {
  id: string;
  valor: number | string;
  status: string;
  formaPagamento: string;
  criadoEm: Date;
  itens: PagamentoItemParaResumo[];
}

export interface ContaParaResumo {
  descontoValor: number | string | null;
  comandas: ComandaParaResumo[];
  pagamentos: PagamentoParaResumo[];
}

export interface ItemDeResumo {
  id: string;
  nomeItem: string;
  precoUnit: number;
  quantidade: number;
  status: string;
  total: number;
  pago: boolean;
}

export interface ComandaDeResumo {
  comandaId: string;
  nome: string;
  itens: ItemDeResumo[];
  totalNaoPago: number;
}

export interface PagamentoDeResumo {
  id: string;
  valor: number;
  status: string;
  formaPagamento: string;
  criadoEm: Date;
  itensComandaIds: string[];
}

export interface ResumoConta {
  totalConta: number;
  descontoValor: number;
  totalPago: number;
  saldoDevedor: number;
  podeFechar: boolean;
  porComanda: ComandaDeResumo[];
  pagamentos: PagamentoDeResumo[];
}

export function calcularResumoConta(conta: ContaParaResumo): ResumoConta;

export function validarItensParaPagamento(
  resumo: ResumoConta,
  itensComandaIds: string[]
): { valor: number; erro?: string };
```

- [ ] **Step 1: Write the failing tests**

Create `src/utils/fechamentoConta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calcularResumoConta, validarItensParaPagamento, type ContaParaResumo } from './fechamentoConta.js';

function contaBase(overrides: Partial<ContaParaResumo> = {}): ContaParaResumo {
  return {
    descontoValor: null,
    comandas: [
      {
        id: 'comanda-1',
        nome: 'Geral',
        itens: [
          { id: 'item-1', nomeItem: 'Picanha', precoUnit: '80.00', quantidade: 1, status: 'entregue' },
          { id: 'item-2', nomeItem: 'Refrigerante', precoUnit: '8.50', quantidade: 2, status: 'entregue' },
        ],
      },
    ],
    pagamentos: [],
    ...overrides,
  };
}

describe('calcularResumoConta', () => {
  it('soma o total dos itens sem pagamento nem desconto', () => {
    const resumo = calcularResumoConta(contaBase());
    expect(resumo.totalConta).toBe(97);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.descontoValor).toBe(0);
    expect(resumo.saldoDevedor).toBe(97);
    expect(resumo.podeFechar).toBe(false);
  });

  it('exclui itens cancelados do total', () => {
    const conta = contaBase({
      comandas: [
        {
          id: 'comanda-1',
          nome: 'Geral',
          itens: [
            { id: 'item-1', nomeItem: 'Picanha', precoUnit: '80.00', quantidade: 1, status: 'entregue' },
            { id: 'item-2', nomeItem: 'Suco', precoUnit: '10.00', quantidade: 1, status: 'cancelado' },
          ],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.totalConta).toBe(80);
  });

  it('pagamento confirmado reduz o saldo devedor', () => {
    const conta = contaBase({
      pagamentos: [
        { id: 'pag-1', valor: '50.00', status: 'confirmado', formaPagamento: 'pix', criadoEm: new Date(), itens: [] },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.totalPago).toBe(50);
    expect(resumo.saldoDevedor).toBe(47);
  });

  it('pagamento estornado NÃO reduz o saldo devedor', () => {
    const conta = contaBase({
      pagamentos: [
        { id: 'pag-1', valor: '50.00', status: 'estornado', formaPagamento: 'pix', criadoEm: new Date(), itens: [] },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.saldoDevedor).toBe(97);
  });

  it('desconto reduz o saldo devedor', () => {
    const conta = contaBase({ descontoValor: '17.00' });
    const resumo = calcularResumoConta(conta);
    expect(resumo.descontoValor).toBe(17);
    expect(resumo.saldoDevedor).toBe(80);
  });

  it('podeFechar é true quando o saldo chega a zero', () => {
    const conta = contaBase({
      pagamentos: [
        { id: 'pag-1', valor: '97.00', status: 'confirmado', formaPagamento: 'dinheiro', criadoEm: new Date(), itens: [] },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.saldoDevedor).toBe(0);
    expect(resumo.podeFechar).toBe(true);
  });

  it('marca item como pago quando coberto por pagamento confirmado, e como não pago se o pagamento foi estornado', () => {
    const conta = contaBase({
      pagamentos: [
        {
          id: 'pag-1', valor: '80.00', status: 'confirmado', formaPagamento: 'pix', criadoEm: new Date(),
          itens: [{ itemComandaId: 'item-1' }],
        },
        {
          id: 'pag-2', valor: '17.00', status: 'estornado', formaPagamento: 'pix', criadoEm: new Date(),
          itens: [{ itemComandaId: 'item-2' }],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    const item1 = resumo.porComanda[0].itens.find((i) => i.id === 'item-1')!;
    const item2 = resumo.porComanda[0].itens.find((i) => i.id === 'item-2')!;
    expect(item1.pago).toBe(true);
    expect(item2.pago).toBe(false);
    expect(resumo.porComanda[0].totalNaoPago).toBe(17);
  });
});

describe('validarItensParaPagamento', () => {
  it('retorna o valor somado dos itens válidos e não pagos', () => {
    const resumo = calcularResumoConta(contaBase());
    const resultado = validarItensParaPagamento(resumo, ['item-1', 'item-2']);
    expect(resultado.erro).toBeUndefined();
    expect(resultado.valor).toBe(97);
  });

  it('retorna erro se o item já está pago', () => {
    const conta = contaBase({
      pagamentos: [
        {
          id: 'pag-1', valor: '80.00', status: 'confirmado', formaPagamento: 'pix', criadoEm: new Date(),
          itens: [{ itemComandaId: 'item-1' }],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    const resultado = validarItensParaPagamento(resumo, ['item-1']);
    expect(resultado.erro).toMatch(/já foi pago/);
  });

  it('retorna erro se o item está cancelado', () => {
    const conta = contaBase({
      comandas: [
        {
          id: 'comanda-1',
          nome: 'Geral',
          itens: [{ id: 'item-1', nomeItem: 'Suco', precoUnit: '10.00', quantidade: 1, status: 'cancelado' }],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    const resultado = validarItensParaPagamento(resumo, ['item-1']);
    expect(resultado.erro).toMatch(/cancelado/);
  });

  it('retorna erro se o item não existe na conta', () => {
    const resumo = calcularResumoConta(contaBase());
    const resultado = validarItensParaPagamento(resumo, ['item-inexistente']);
    expect(resultado.erro).toMatch(/não encontrado/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/fechamentoConta.test.ts`
Expected: FAIL — `Cannot find module './fechamentoConta.js'`

- [ ] **Step 3: Implement `src/utils/fechamentoConta.ts`**

```typescript
export interface ItemParaResumo {
  id: string;
  nomeItem: string;
  precoUnit: number | string;
  quantidade: number;
  status: string;
}

export interface ComandaParaResumo {
  id: string;
  nome: string;
  itens: ItemParaResumo[];
}

export interface PagamentoItemParaResumo {
  itemComandaId: string;
}

export interface PagamentoParaResumo {
  id: string;
  valor: number | string;
  status: string;
  formaPagamento: string;
  criadoEm: Date;
  itens: PagamentoItemParaResumo[];
}

export interface ContaParaResumo {
  descontoValor: number | string | null;
  comandas: ComandaParaResumo[];
  pagamentos: PagamentoParaResumo[];
}

export interface ItemDeResumo {
  id: string;
  nomeItem: string;
  precoUnit: number;
  quantidade: number;
  status: string;
  total: number;
  pago: boolean;
}

export interface ComandaDeResumo {
  comandaId: string;
  nome: string;
  itens: ItemDeResumo[];
  totalNaoPago: number;
}

export interface PagamentoDeResumo {
  id: string;
  valor: number;
  status: string;
  formaPagamento: string;
  criadoEm: Date;
  itensComandaIds: string[];
}

export interface ResumoConta {
  totalConta: number;
  descontoValor: number;
  totalPago: number;
  saldoDevedor: number;
  podeFechar: boolean;
  porComanda: ComandaDeResumo[];
  pagamentos: PagamentoDeResumo[];
}

function paraCentavos(valor: number | string): number {
  return Math.round(Number(valor) * 100);
}

export function calcularResumoConta(conta: ContaParaResumo): ResumoConta {
  const itensPagosIds = new Set<string>();
  for (const pagamento of conta.pagamentos) {
    if (pagamento.status !== 'confirmado') continue;
    for (const item of pagamento.itens) itensPagosIds.add(item.itemComandaId);
  }

  let totalContaCentavos = 0;
  const porComanda: ComandaDeResumo[] = conta.comandas.map((comanda) => {
    let totalNaoPagoCentavos = 0;
    const itens: ItemDeResumo[] = comanda.itens.map((item) => {
      const totalItemCentavos = item.status === 'cancelado'
        ? 0
        : paraCentavos(item.precoUnit) * item.quantidade;
      totalContaCentavos += totalItemCentavos;
      const pago = itensPagosIds.has(item.id);
      if (!pago) totalNaoPagoCentavos += totalItemCentavos;
      return {
        id: item.id,
        nomeItem: item.nomeItem,
        precoUnit: Number(item.precoUnit),
        quantidade: item.quantidade,
        status: item.status,
        total: totalItemCentavos / 100,
        pago,
      };
    });
    return { comandaId: comanda.id, nome: comanda.nome, itens, totalNaoPago: totalNaoPagoCentavos / 100 };
  });

  const totalPagoCentavos = conta.pagamentos
    .filter((p) => p.status === 'confirmado')
    .reduce((soma, p) => soma + paraCentavos(p.valor), 0);

  const descontoCentavos = conta.descontoValor ? paraCentavos(conta.descontoValor) : 0;
  const saldoDevedorCentavos = totalContaCentavos - descontoCentavos - totalPagoCentavos;

  return {
    totalConta: totalContaCentavos / 100,
    descontoValor: descontoCentavos / 100,
    totalPago: totalPagoCentavos / 100,
    saldoDevedor: saldoDevedorCentavos / 100,
    podeFechar: saldoDevedorCentavos <= 0,
    porComanda,
    pagamentos: conta.pagamentos.map((p) => ({
      id: p.id,
      valor: Number(p.valor),
      status: p.status,
      formaPagamento: p.formaPagamento,
      criadoEm: p.criadoEm,
      itensComandaIds: p.itens.map((i) => i.itemComandaId),
    })),
  };
}

export function validarItensParaPagamento(
  resumo: ResumoConta,
  itensComandaIds: string[]
): { valor: number; erro?: string } {
  const todosItens = resumo.porComanda.flatMap((c) => c.itens);
  let totalCentavos = 0;
  for (const id of itensComandaIds) {
    const item = todosItens.find((i) => i.id === id);
    if (!item) return { valor: 0, erro: `Item ${id} não encontrado nesta conta` };
    if (item.status === 'cancelado') return { valor: 0, erro: `Item ${id} está cancelado` };
    if (item.pago) return { valor: 0, erro: `Item ${id} já foi pago` };
    totalCentavos += Math.round(item.total * 100);
  }
  return { valor: totalCentavos / 100 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/fechamentoConta.test.ts`
Expected: PASS — 11 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/fechamentoConta.ts src/utils/fechamentoConta.test.ts
git commit -m "feat: funções puras de cálculo de saldo e fechamento de conta"
```

---

### Task 3: Rota de resumo + registro de pagamento

**Files:**
- Modify: `src/routes/contas.ts` (export `serializarConta`; broaden 2 permissions)
- Create: `src/routes/pagamentos.ts`
- Modify: `src/server.ts` (register the new route file)

**Interfaces:**
- Consumes: `calcularResumoConta`, `validarItensParaPagamento`, `ResumoConta` from
  `src/utils/fechamentoConta.js` (Task 2). `serializarConta` from `src/routes/contas.js`
  (exported in this task's Step 1).
- Produces:
  - `GET /contas/:id/resumo` → `200 { contaId: string, status: string, ...ResumoConta }`
  - `POST /contas/:id/pagamentos` → `201 { contaId: string, status: string, ...ResumoConta }`
  - Both consumed by Task 4, 5, 6 (same envelope shape) and by frontend Task 8.

- [ ] **Step 1: Export `serializarConta` from `src/routes/contas.ts`**

In `src/routes/contas.ts`, find:

```typescript
function serializarConta(conta: ContaComComandas) {
```

Change to:

```typescript
export function serializarConta(conta: ContaComComandas) {
```

Also export the interface it depends on — find:

```typescript
interface ContaComComandas {
  comandas?: ComandaComItens[];
  [chave: string]: unknown;
}
```

Change to:

```typescript
export interface ContaComComandas {
  comandas?: ComandaComItens[];
  [chave: string]: unknown;
}
```

- [ ] **Step 2: Broaden the two read-only account routes to accept the `caixa` permission too**

In `src/routes/contas.ts`, find:

```typescript
  fastify.get('/contas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
  }, async (request) => {
```

Change to:

```typescript
  fastify.get('/contas', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
  }, async (request) => {
```

And find:

```typescript
  fastify.get('/contas/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
```

Change to:

```typescript
  fastify.get('/contas/:id', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
```

Every other route in this file keeps `temPermissao('mesas')` exactly as-is — only these two
read routes change.

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

Run: `npm test`
Expected: all existing tests still pass (this step only broadens who is *allowed* in; it
doesn't change behavior for existing `mesas`-permission users).

- [ ] **Step 4: Create `src/routes/pagamentos.ts` with the resumo and pagamento routes**

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { serializarConta } from './contas.js';
import { calcularResumoConta, validarItensParaPagamento } from '../utils/fechamentoConta.js';
import type { FormaPagamento } from '../generated/prisma/enums.js';

const ContaParamsSchema = Type.Object({ id: Type.String() });
const PagamentoParamsSchema = Type.Object({ id: Type.String() });

const RegistrarPagamentoSchema = Type.Object({
  formaPagamento: Type.Union([
    Type.Literal('pix'),
    Type.Literal('dinheiro'),
    Type.Literal('cartao_credito'),
    Type.Literal('cartao_debito'),
  ]),
  itensComandaIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  valor: Type.Optional(Type.Number({ minimum: 0.01 })),
});

const CONTA_INCLUDE_RESUMO = {
  comandas: { include: { itens: true } },
  pagamentos: { include: { itens: true }, orderBy: { criadoEm: 'asc' as const } },
};

async function buscarContaComResumo(estabelecimentoId: string, contaId: string) {
  const conta = await prisma.conta.findFirst({
    where: { id: contaId, estabelecimentoId },
    include: CONTA_INCLUDE_RESUMO,
  });
  if (!conta) return null;
  return { conta, resumo: calcularResumoConta(conta) };
}

async function emitirContaAtualizada(estabelecimentoId: string, contaId: string) {
  const contaCompleta = await prisma.conta.findUnique({
    where: { id: contaId },
    include: { mesa: true, comandas: { include: { itens: true } } },
  });
  if (contaCompleta) {
    getIO().to(estabelecimentoId).emit('conta:atualizada', serializarConta(contaCompleta));
  }
}

export async function pagamentosRoutes(fastify: FastifyInstance) {
  // ── GET /contas/:id/resumo ───────────────────────────────────────────────────
  fastify.get('/contas/:id/resumo', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });

    return { contaId: encontrada.conta.id, status: encontrada.conta.status, ...encontrada.resumo };
  });

  // ── POST /contas/:id/pagamentos ──────────────────────────────────────────────
  // Dois modos: itensComandaIds (cobre itens específicos, valor calculado no servidor)
  // ou valor livre (divisão igual ÷ N, ou qualquer valor parcial sem vincular a itens).
  fastify.post('/contas/:id/pagamentos', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: RegistrarPagamentoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { formaPagamento, itensComandaIds, valor } = request.body as {
      formaPagamento: FormaPagamento;
      itensComandaIds?: string[];
      valor?: number;
    };
    const { estabelecimentoId, userId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });
    const { conta, resumo } = encontrada;

    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta para pagamento' });
    }

    let valorFinal: number;
    let itensParaVincular: string[] = [];

    if (itensComandaIds && itensComandaIds.length > 0) {
      const validacao = validarItensParaPagamento(resumo, itensComandaIds);
      if (validacao.erro) return reply.status(422).send({ erro: validacao.erro });
      valorFinal = validacao.valor;
      itensParaVincular = itensComandaIds;
    } else if (typeof valor === 'number' && valor > 0) {
      valorFinal = valor;
    } else {
      return reply.status(400).send({ erro: 'Informe itensComandaIds ou valor' });
    }

    const todosItens = resumo.porComanda.flatMap((c) => c.itens);
    await prisma.pagamento.create({
      data: {
        valor: valorFinal,
        formaPagamento,
        status: 'confirmado',
        estabelecimentoId: estabelecimentoId!,
        contaId: id,
        usuarioId: userId ?? null,
        itens: {
          create: itensParaVincular.map((itemComandaId) => ({
            itemComandaId,
            valorCoberto: todosItens.find((i) => i.id === itemComandaId)!.total,
            estabelecimentoId: estabelecimentoId!,
          })),
        },
      },
    });

    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return reply.status(201).send({ contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo });
  });
}
```

- [ ] **Step 5: Register the new route file in `src/server.ts`**

Find:

```typescript
import { producaoRoutes } from './routes/producao.js';
```

Add right after it:

```typescript
import { pagamentosRoutes } from './routes/pagamentos.js';
```

Find:

```typescript
  await fastify.register(producaoRoutes);
```

Add right after it:

```typescript
  await fastify.register(pagamentosRoutes);
```

- [ ] **Step 6: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Manual verification with curl**

Start the dev server (`npm run dev`), then, using a DONO or `caixa`-permission JWT:

```bash
# Abrir uma mesa de teste e lançar 1 item, então:
curl -s http://localhost:3000/contas/<CONTA_ID>/resumo \
  -H "Authorization: Bearer <TOKEN>" | jq
```

Expected: JSON with `contaId`, `status`, `totalConta`, `descontoValor: 0`, `totalPago: 0`,
`saldoDevedor` equal to `totalConta`, `podeFechar: false`, `porComanda` listing the item(s)
with `pago: false`, `pagamentos: []`.

```bash
curl -s -X POST http://localhost:3000/contas/<CONTA_ID>/pagamentos \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"formaPagamento":"pix","valor":10}' | jq
```

Expected: `201`, `totalPago: 10`, `saldoDevedor` reduced by 10, `pagamentos` has one entry
with `formaPagamento: "pix"`.

```bash
curl -s -X POST http://localhost:3000/contas/<CONTA_ID>/pagamentos \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"formaPagamento":"dinheiro","itensComandaIds":["<ITEM_ID_JA_LANCADO>"]}' | jq
```

Expected: `201`, that item now shows `pago: true` in a follow-up `GET .../resumo` call.

- [ ] **Step 8: Commit**

```bash
git add src/routes/contas.ts src/routes/pagamentos.ts src/server.ts
git commit -m "feat: rota de resumo e registro de pagamento da conta"
```

---

### Task 4: Desconto com senha de supervisor

**Files:**
- Modify: `src/routes/pagamentos.ts`

**Interfaces:**
- Consumes: `buscarContaComResumo`, `emitirContaAtualizada` (private helpers already in the
  file from Task 3).
- Produces: `POST /contas/:id/desconto` → `200 { contaId, status, ...ResumoConta }`.

- [ ] **Step 1: Add the `bcrypt` import and the discount schema**

In `src/routes/pagamentos.ts`, find:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
```

Change to:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
```

Find:

```typescript
const CONTA_INCLUDE_RESUMO = {
```

Add right before it:

```typescript
const AplicarDescontoSchema = Type.Object({
  valor:  Type.Number({ minimum: 0.01 }),
  motivo: Type.String({ minLength: 1, maxLength: 200 }),
  senha:  Type.String({ minLength: 1 }),
});

```

- [ ] **Step 2: Add the `POST /contas/:id/desconto` route**

Find the closing brace of `pagamentosRoutes` — the end of the `POST /contas/:id/pagamentos`
handler, which currently ends the file:

```typescript
    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return reply.status(201).send({ contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo });
  });
}
```

Change to:

```typescript
    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return reply.status(201).send({ contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo });
  });

  // ── POST /contas/:id/desconto ────────────────────────────────────────────────
  // Substitui qualquer desconto anterior nesta conta (não é cumulativo). Exige a
  // senha de supervisor (mesma senha de reabertura de pedido, reusada por design).
  fastify.post('/contas/:id/desconto', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: AplicarDescontoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { valor, motivo, senha } = request.body as { valor: number; motivo: string; senha: string };
    const { estabelecimentoId, userId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });
    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.senhaReabrirPedido) {
      return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de aplicar descontos' });
    }
    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
    if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });

    await prisma.conta.update({ where: { id }, data: { descontoValor: valor, descontoMotivo: motivo } });
    await prisma.logAuditoria.create({
      data: {
        acao:         'conta:desconto',
        entidadeTipo: 'Conta',
        entidadeId:   id,
        motivo,
        dadosDepois:  { valor },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    userId,
      },
    });

    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return { contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo };
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification with curl**

First configure a supervisor password if none exists yet (via `PATCH /estabelecimentos/senha-reabrir-pedido` or whatever the existing Configurações flow uses — check `src/routes/estabelecimentos.ts` for the exact route if unsure). Then:

```bash
curl -s -X POST http://localhost:3000/contas/<CONTA_ID>/desconto \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"valor":5,"motivo":"cliente recorrente","senha":"senhaerrada"}' | jq
```

Expected: `403 { "erro": "Senha incorreta" }`.

```bash
curl -s -X POST http://localhost:3000/contas/<CONTA_ID>/desconto \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"valor":5,"motivo":"cliente recorrente","senha":"<SENHA_CORRETA>"}' | jq
```

Expected: `200`, `descontoValor: 5`, `saldoDevedor` reduced by 5 from before.

- [ ] **Step 5: Commit**

```bash
git add src/routes/pagamentos.ts
git commit -m "feat: desconto na conta com senha de supervisor"
```

---

### Task 5: Estorno de pagamento

**Files:**
- Modify: `src/routes/pagamentos.ts`

**Interfaces:**
- Consumes: same private helpers as Task 4.
- Produces: `PATCH /pagamentos/:id/estornar` → `200 { contaId, status, ...ResumoConta }`.

- [ ] **Step 1: Add the reversal schema**

In `src/routes/pagamentos.ts`, find:

```typescript
const AplicarDescontoSchema = Type.Object({
  valor:  Type.Number({ minimum: 0.01 }),
  motivo: Type.String({ minLength: 1, maxLength: 200 }),
  senha:  Type.String({ minLength: 1 }),
});
```

Add right after it:

```typescript

const EstornarPagamentoSchema = Type.Object({
  motivo: Type.String({ minLength: 1, maxLength: 200 }),
  senha:  Type.String({ minLength: 1 }),
});
```

- [ ] **Step 2: Add the `PATCH /pagamentos/:id/estornar` route**

Find the closing brace at the very end of the file (after the desconto route added in Task 4):

```typescript
    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return { contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo };
  });
}
```

Change to:

```typescript
    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return { contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo };
  });

  // ── PATCH /pagamentos/:id/estornar ───────────────────────────────────────────
  // Nunca apaga o pagamento original — só marca status=estornado (mantém histórico).
  // Se a conta já estava fechada e o estorno reabre saldo devedor, reabre a conta.
  fastify.patch('/pagamentos/:id/estornar', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: PagamentoParamsSchema, body: EstornarPagamentoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { motivo, senha } = request.body as { motivo: string; senha: string };
    const { estabelecimentoId, userId } = request.user;

    const pagamento = await prisma.pagamento.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!pagamento) return reply.status(404).send({ erro: 'Pagamento não encontrado' });
    if (pagamento.status !== 'confirmado') {
      return reply.status(422).send({ erro: 'Só é possível estornar pagamentos confirmados' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.senhaReabrirPedido) {
      return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de estornar pagamentos' });
    }
    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
    if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });

    await prisma.pagamento.update({ where: { id }, data: { status: 'estornado' } });
    await prisma.logAuditoria.create({
      data: {
        acao:         'pagamento:estorno',
        entidadeTipo: 'Pagamento',
        entidadeId:   id,
        motivo,
        dadosAntes:   { valor: Number(pagamento.valor), status: pagamento.status },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    userId,
      },
    });

    const contaId = pagamento.contaId;
    const posEstorno = await buscarContaComResumo(estabelecimentoId!, contaId);
    if (posEstorno && posEstorno.conta.status === 'fechada' && !posEstorno.resumo.podeFechar) {
      await prisma.conta.update({ where: { id: contaId }, data: { status: 'aguardando_pagamento', fechadaEm: null } });
    }

    await emitirContaAtualizada(estabelecimentoId!, contaId);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, contaId);
    return { contaId, status: atualizada!.conta.status, ...atualizada!.resumo };
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification with curl**

```bash
curl -s -X PATCH http://localhost:3000/pagamentos/<PAGAMENTO_ID>/estornar \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"motivo":"pagamento em duplicidade","senha":"<SENHA_CORRETA>"}' | jq
```

Expected: `200`, `totalPago` decreased by the reversed payment's value, `saldoDevedor`
increased back up. A follow-up `GET /contas/<CONTA_ID>/resumo` shows that payment with
`status: "estornado"` and any item it covered back to `pago: false`.

Then close the conta (after Task 6 is implemented) and estorno a payment on a `fechada`
conta to verify it reopens to `aguardando_pagamento`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/pagamentos.ts
git commit -m "feat: estorno de pagamento com senha de supervisor"
```

---

### Task 6: Fechar conta

**Files:**
- Modify: `src/routes/pagamentos.ts`

**Interfaces:**
- Consumes: same private helpers as Tasks 4/5.
- Produces: `POST /contas/:id/fechar` → `200 { contaId, status: 'fechada', ...ResumoConta }`
  or `422` if balance is still owed.

- [ ] **Step 1: Add the `POST /contas/:id/fechar` route**

Find the closing brace at the very end of the file (after the estorno route added in Task 5):

```typescript
    await emitirContaAtualizada(estabelecimentoId!, contaId);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, contaId);
    return { contaId, status: atualizada!.conta.status, ...atualizada!.resumo };
  });
}
```

Change to:

```typescript
    await emitirContaAtualizada(estabelecimentoId!, contaId);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, contaId);
    return { contaId, status: atualizada!.conta.status, ...atualizada!.resumo };
  });

  // ── POST /contas/:id/fechar ───────────────────────────────────────────────────
  // Só fecha quando o saldo devedor chega a zero (ou fica negativo por troco).
  // A mesa volta a aparecer como "livre" automaticamente — GET /mesas já filtra
  // por status aberta/aguardando_pagamento, então fechada cai fora dessa contagem.
  fastify.post('/contas/:id/fechar', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });
    const { conta, resumo } = encontrada;

    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta' });
    }
    if (!resumo.podeFechar) {
      return reply.status(422).send({ erro: 'Saldo devedor pendente', saldoDevedor: resumo.saldoDevedor });
    }

    await prisma.conta.update({ where: { id }, data: { status: 'fechada', fechadaEm: new Date() } });
    await emitirContaAtualizada(estabelecimentoId!, id);

    return { contaId: id, status: 'fechada', ...resumo };
  });
}
```

- [ ] **Step 2: Type-check and run the full backend test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 3: Manual verification with curl**

```bash
# Numa conta com saldoDevedor > 0:
curl -s -X POST http://localhost:3000/contas/<CONTA_ID>/fechar \
  -H "Authorization: Bearer <TOKEN>" | jq
```

Expected: `422 { "erro": "Saldo devedor pendente", "saldoDevedor": <valor> }`.

```bash
# Depois de registrar pagamento(s) suficientes:
curl -s -X POST http://localhost:3000/contas/<CONTA_ID>/fechar \
  -H "Authorization: Bearer <TOKEN>" | jq
```

Expected: `200 { "status": "fechada", ... }`.

```bash
curl -s http://localhost:3000/mesas -H "Authorization: Bearer <TOKEN>" | jq '.[] | select(.id=="<MESA_ID>")'
```

Expected: `statusMesa: "livre"`, `contaAbertaId: null` — the table is free again.

- [ ] **Step 4: Commit**

```bash
git add src/routes/pagamentos.ts
git commit -m "feat: fechar conta quando saldo devedor chega a zero"
```

---

### Task 7: Permissão `caixa` no frontend

**Files:**
- Modify: `frontend/src/lib/permissoes.ts`

**Interfaces:**
- Produces: `Permissao` type now includes `'caixa'`; `TODAS_PERMISSOES` includes it with a
  label — consumed by `Operadores.tsx` (already maps over `TODAS_PERMISSOES`, no changes
  needed there) and by Task 11's `RotaPermissao permissao="caixa"` / `Layout.tsx` nav gate.

- [ ] **Step 1: Add `'caixa'` to the `Permissao` type and `TODAS_PERMISSOES`**

In `frontend/src/lib/permissoes.ts`, find:

```typescript
export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes' | 'mesas'

export const TODAS_PERMISSOES: { id: Permissao; label: string }[] = [
  { id: 'cozinha',       label: 'Cozinha — ver e atualizar pedidos' },
  { id: 'cardapio',      label: 'Cardápio — editar itens e categorias' },
  { id: 'historico',     label: 'Histórico — ver pedidos anteriores' },
  { id: 'pedido_manual', label: 'Criar pedido manualmente' },
  { id: 'configuracoes', label: 'Configurações do estabelecimento' },
  { id: 'mesas',         label: 'Mesas — abrir mesas e lançar pedidos' },
]
```

Change to:

```typescript
export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes' | 'mesas' | 'caixa'

export const TODAS_PERMISSOES: { id: Permissao; label: string }[] = [
  { id: 'cozinha',       label: 'Cozinha — ver e atualizar pedidos' },
  { id: 'cardapio',      label: 'Cardápio — editar itens e categorias' },
  { id: 'historico',     label: 'Histórico — ver pedidos anteriores' },
  { id: 'pedido_manual', label: 'Criar pedido manualmente' },
  { id: 'configuracoes', label: 'Configurações do estabelecimento' },
  { id: 'mesas',         label: 'Mesas — abrir mesas e lançar pedidos' },
  { id: 'caixa',         label: 'Caixa — fechar contas e processar pagamentos' },
]
```

- [ ] **Step 2: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/permissoes.ts
git commit -m "feat: adiciona permissão caixa no frontend"
```

---

### Task 8: Caixa.tsx — lista de contas e resumo de fechamento

**Files:**
- Create: `frontend/src/pages/Caixa.tsx`

**Interfaces:**
- Consumes: `GET /contas` (existing, now readable with `caixa` permission),
  `GET /contas/:id/resumo` (Task 3).
- Produces: default-exported `Caixa` component. Local TypeScript interfaces
  `ResumoConta`/`ItemResumo`/`ComandaResumo`/`PagamentoResumo` mirroring the backend's
  `ResumoConta` shape from Task 2 exactly — Task 9 and Task 10 add to this same file and
  reuse these interfaces and the `resumo`/`carregarResumo` state.

- [ ] **Step 1: Create the file with list view + resumo detail (read-only)**

```tsx
import { useEffect, useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocket } from '../hooks/useSocket'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface ContaResumida {
  id: string
  status: 'aberta' | 'aguardando_pagamento'
  mesa: { numero: string } | null
}

interface ItemResumo {
  id: string
  nomeItem: string
  precoUnit: number
  quantidade: number
  status: string
  total: number
  pago: boolean
}

interface ComandaResumo {
  comandaId: string
  nome: string
  itens: ItemResumo[]
  totalNaoPago: number
}

interface PagamentoResumo {
  id: string
  valor: number
  status: string
  formaPagamento: string
  criadoEm: string
  itensComandaIds: string[]
}

interface ResumoConta {
  contaId: string
  status: string
  totalConta: number
  descontoValor: number
  totalPago: number
  saldoDevedor: number
  podeFechar: boolean
  porComanda: ComandaResumo[]
  pagamentos: PagamentoResumo[]
}

const labelFormaPagamento: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

export default function Caixa() {
  const token = localStorage.getItem('token')
  const { socket } = useSocket(token)

  const [contas, setContas] = useState<ContaResumida[]>([])
  const [carregandoContas, setCarregandoContas] = useState(true)

  const [contaSelecionada, setContaSelecionada] = useState<ContaResumida | null>(null)
  const [resumo, setResumo] = useState<ResumoConta | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)

  async function carregarContas() {
    setCarregandoContas(true)
    try {
      const resp = await fetch(`${API_URL}/contas`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setContas(await resp.json())
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoContas(false)
    }
  }

  async function carregarResumo(contaId: string) {
    setCarregandoResumo(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaId}/resumo`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setResumo(await resp.json())
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoResumo(false)
    }
  }

  function abrirConta(conta: ContaResumida) {
    setContaSelecionada(conta)
    carregarResumo(conta.id)
  }

  function fecharDetalhe() {
    setContaSelecionada(null)
    setResumo(null)
    carregarContas()
  }

  useEffect(() => {
    carregarContas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!socket) return
    function aoAtualizarConta(conta: { id: string }) {
      if (contaSelecionada && conta.id === contaSelecionada.id) carregarResumo(conta.id)
    }
    socket.on('conta:atualizada', aoAtualizarConta)
    return () => {
      socket.off('conta:atualizada', aoAtualizarConta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, contaSelecionada?.id])

  return (
    <Layout>
      {!contaSelecionada ? (
        <div>
          <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
            <Wallet className="h-6 w-6" /> Caixa
          </h2>
          {carregandoContas ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : contas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhuma conta aberta no momento.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {contas.map((conta) => (
                <button
                  key={conta.id}
                  onClick={() => abrirConta(conta)}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-orange-500/50"
                >
                  <span className="text-xl font-bold">{conta.mesa ? `Mesa ${conta.mesa.numero}` : 'Sem mesa'}</span>
                  <span className="text-xs text-zinc-400">{conta.status === 'aguardando_pagamento' ? 'Aguardando pagamento' : 'Aberta'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <button onClick={fecharDetalhe} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              ← Caixa
            </button>
            <h2 className="text-xl font-extrabold">
              {contaSelecionada.mesa ? `Mesa ${contaSelecionada.mesa.numero}` : 'Sem mesa'}
            </h2>
          </div>

          {carregandoResumo || !resumo ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex justify-between text-sm text-zinc-400"><span>Total da conta</span><span>R$ {resumo.totalConta.toFixed(2)}</span></div>
                {resumo.descontoValor > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400"><span>Desconto</span><span>- R$ {resumo.descontoValor.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-sm text-zinc-400"><span>Já pago</span><span>R$ {resumo.totalPago.toFixed(2)}</span></div>
                <div className="mt-2 flex justify-between border-t border-zinc-800 pt-2 text-base font-bold">
                  <span>Saldo devedor</span><span>R$ {resumo.saldoDevedor.toFixed(2)}</span>
                </div>
              </div>

              {resumo.porComanda.map((comanda) => (
                <div key={comanda.comandaId} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">{comanda.nome}</h3>
                  <div className="space-y-1">
                    {comanda.itens.map((item) => (
                      <div key={item.id} className={`flex justify-between text-sm ${item.status === 'cancelado' ? 'text-zinc-600 line-through' : item.pago ? 'text-zinc-500' : 'text-zinc-200'}`}>
                        <span>{item.quantidade}x {item.nomeItem} {item.pago && '· pago'}</span>
                        <span>R$ {item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-1">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className={`flex justify-between text-sm ${pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                        <span>{labelFormaPagamento[pagamento.formaPagamento]}</span>
                        <span>R$ {pagamento.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (The page isn't routed yet — that's Task 11 — so this only verifies the
component itself compiles.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Caixa.tsx
git commit -m "feat: tela de caixa - lista de contas e resumo de fechamento"
```

---

### Task 9: Caixa.tsx — registrar pagamento (por comanda, igualmente, itens/valor livre)

**Files:**
- Modify: `frontend/src/pages/Caixa.tsx`

**Interfaces:**
- Consumes: `resumo`, `contaSelecionada`, `carregarResumo` (state/functions from Task 8).
- Produces: `registrarPagamento` handler calling `POST /contas/:id/pagamentos`; three UI
  entry points into it. Task 10 adds discount/reversal/close controls to the same detail
  view, right after the "Pagamentos registrados" block this task also touches.

- [ ] **Step 1: Add payment-registration state, the `registrarPagamento` function, and the split UI**

In `frontend/src/pages/Caixa.tsx`, find the import line:

```tsx
import { Loader2, Wallet } from 'lucide-react'
```

Change to:

```tsx
import { Loader2, Wallet, Users, CheckCircle2 } from 'lucide-react'
```

Find:

```tsx
  const [contaSelecionada, setContaSelecionada] = useState<ContaResumida | null>(null)
  const [resumo, setResumo] = useState<ResumoConta | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)
```

Change to:

```tsx
  const [contaSelecionada, setContaSelecionada] = useState<ContaResumida | null>(null)
  const [resumo, setResumo] = useState<ResumoConta | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)

  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'>('pix')
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false)
  const [erroPagamento, setErroPagamento] = useState<string | null>(null)

  const [numeroPessoas, setNumeroPessoas] = useState(2)

  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set())
  const [valorLivre, setValorLivre] = useState('')
```

Find:

```tsx
  function abrirConta(conta: ContaResumida) {
    setContaSelecionada(conta)
    carregarResumo(conta.id)
  }
```

Change to:

```tsx
  function abrirConta(conta: ContaResumida) {
    setContaSelecionada(conta)
    carregarResumo(conta.id)
  }

  function alternarItemSelecionado(itemId: string) {
    setItensSelecionados((prev) => {
      const proximo = new Set(prev)
      proximo.has(itemId) ? proximo.delete(itemId) : proximo.add(itemId)
      return proximo
    })
  }

  async function registrarPagamento(opcoes: { itensComandaIds?: string[]; valor?: number }) {
    if (!contaSelecionada) return
    setErroPagamento(null)
    setRegistrandoPagamento(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/pagamentos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ formaPagamento, ...opcoes }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroPagamento(data.erro ?? 'Não foi possível registrar o pagamento'); return }
      setResumo(data)
      setItensSelecionados(new Set())
      setValorLivre('')
    } catch {
      setErroPagamento('Falha de conexão')
    } finally {
      setRegistrandoPagamento(false)
    }
  }

  function pagarComanda(comanda: ComandaResumo) {
    const itensNaoPagos = comanda.itens.filter((i) => i.status !== 'cancelado' && !i.pago).map((i) => i.id)
    if (itensNaoPagos.length > 0) registrarPagamento({ itensComandaIds: itensNaoPagos })
  }

  function pagarItensSelecionados() {
    if (itensSelecionados.size > 0) registrarPagamento({ itensComandaIds: Array.from(itensSelecionados) })
  }

  function pagarValorLivre() {
    const valor = Number(valorLivre)
    if (valor > 0) registrarPagamento({ valor })
  }

  function pagarParcelaIgual() {
    if (!resumo || numeroPessoas < 1) return
    const parcela = Math.round((resumo.saldoDevedor / numeroPessoas) * 100) / 100
    if (parcela > 0) registrarPagamento({ valor: parcela })
  }
```

Find the "Pagamentos registrados" block:

```tsx
              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-1">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className={`flex justify-between text-sm ${pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                        <span>{labelFormaPagamento[pagamento.formaPagamento]}</span>
                        <span>R$ {pagamento.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
```

Change to:

```tsx
              {resumo.saldoDevedor > 0 && (
                <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="font-semibold">Registrar pagamento</h3>

                  <div className="flex flex-wrap gap-2">
                    {(['pix', 'dinheiro', 'cartao_credito', 'cartao_debito'] as const).map((forma) => (
                      <button
                        key={forma}
                        onClick={() => setFormaPagamento(forma)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${formaPagamento === forma ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                      >
                        {labelFormaPagamento[forma]}
                      </button>
                    ))}
                  </div>

                  {erroPagamento && <p className="text-sm text-red-400">{erroPagamento}</p>}

                  {/* Dividir por comanda */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-400">Dividir por comanda</p>
                    <div className="flex flex-wrap gap-2">
                      {resumo.porComanda.filter((c) => c.totalNaoPago > 0).map((comanda) => (
                        <button
                          key={comanda.comandaId}
                          onClick={() => pagarComanda(comanda)}
                          disabled={registrandoPagamento}
                          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          {comanda.nome} · R$ {comanda.totalNaoPago.toFixed(2)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dividir igualmente */}
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400"><Users className="h-3.5 w-3.5" /> Dividir igualmente</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={numeroPessoas}
                        onChange={(e) => setNumeroPessoas(Math.max(1, Number(e.target.value)))}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <span className="text-sm text-zinc-400">pessoas · R$ {(resumo.saldoDevedor / numeroPessoas).toFixed(2)} cada</span>
                      <button
                        onClick={pagarParcelaIgual}
                        disabled={registrandoPagamento}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Registrar 1 parcela
                      </button>
                    </div>
                  </div>

                  {/* Itens específicos */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-400">Pagar itens específicos</p>
                    <div className="space-y-1">
                      {resumo.porComanda.flatMap((c) => c.itens).filter((i) => i.status !== 'cancelado' && !i.pago).map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm text-zinc-200">
                          <input
                            type="checkbox"
                            checked={itensSelecionados.has(item.id)}
                            onChange={() => alternarItemSelecionado(item.id)}
                          />
                          {item.quantidade}x {item.nomeItem} · R$ {item.total.toFixed(2)}
                        </label>
                      ))}
                    </div>
                    {itensSelecionados.size > 0 && (
                      <button
                        onClick={pagarItensSelecionados}
                        disabled={registrandoPagamento}
                        className="mt-2 flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Pagar {itensSelecionados.size} item(ns) selecionado(s)
                      </button>
                    )}
                  </div>

                  {/* Valor livre */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-400">Valor livre (pagamento parcial)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={valorLivre}
                        onChange={(e) => setValorLivre(e.target.value)}
                        placeholder="0,00"
                        className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={pagarValorLivre}
                        disabled={registrandoPagamento || !valorLivre}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Registrar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-1">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className={`flex justify-between text-sm ${pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                        <span>{labelFormaPagamento[pagamento.formaPagamento]}</span>
                        <span>R$ {pagamento.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Caixa.tsx
git commit -m "feat: registrar pagamento por comanda, igualmente, itens ou valor livre"
```

---

### Task 10: Caixa.tsx — desconto, estorno e fechar conta

**Files:**
- Modify: `frontend/src/pages/Caixa.tsx`

**Interfaces:**
- Consumes: `resumo`, `contaSelecionada`, `fecharDetalhe` (from Task 8/9).
- Produces: `aplicarDesconto`, `estornarPagamento`, `fecharConta` handlers calling
  `POST /contas/:id/desconto`, `PATCH /pagamentos/:id/estornar`, `POST /contas/:id/fechar`.

- [ ] **Step 1: Add discount/reversal/close state and handlers**

In `frontend/src/pages/Caixa.tsx`, find:

```tsx
import { Loader2, Wallet, Users, CheckCircle2 } from 'lucide-react'
```

Change to:

```tsx
import { Loader2, Wallet, Users, CheckCircle2, Percent, Undo2, Lock } from 'lucide-react'
```

Find:

```tsx
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set())
  const [valorLivre, setValorLivre] = useState('')
```

Change to:

```tsx
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set())
  const [valorLivre, setValorLivre] = useState('')

  const [descontoAberto, setDescontoAberto] = useState(false)
  const [valorDesconto, setValorDesconto] = useState('')
  const [motivoDesconto, setMotivoDesconto] = useState('')
  const [senhaDesconto, setSenhaDesconto] = useState('')
  const [enviandoDesconto, setEnviandoDesconto] = useState(false)
  const [erroDesconto, setErroDesconto] = useState<string | null>(null)

  const [estornandoId, setEstornandoId] = useState<string | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [senhaEstorno, setSenhaEstorno] = useState('')
  const [enviandoEstorno, setEnviandoEstorno] = useState(false)
  const [erroEstorno, setErroEstorno] = useState<string | null>(null)

  const [fechandoConta, setFechandoConta] = useState(false)
  const [erroFechar, setErroFechar] = useState<string | null>(null)
```

Find:

```tsx
  function pagarParcelaIgual() {
    if (!resumo || numeroPessoas < 1) return
    const parcela = Math.round((resumo.saldoDevedor / numeroPessoas) * 100) / 100
    if (parcela > 0) registrarPagamento({ valor: parcela })
  }
```

Add right after it:

```tsx

  function abrirFormDesconto() {
    setDescontoAberto(true)
    setValorDesconto('')
    setMotivoDesconto('')
    setSenhaDesconto('')
    setErroDesconto(null)
  }

  async function aplicarDesconto() {
    if (!contaSelecionada) return
    const valor = Number(valorDesconto)
    if (!(valor > 0) || !motivoDesconto || !senhaDesconto) return
    setErroDesconto(null)
    setEnviandoDesconto(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/desconto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, motivo: motivoDesconto, senha: senhaDesconto }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroDesconto(data.erro ?? 'Não foi possível aplicar o desconto'); return }
      setResumo(data)
      setDescontoAberto(false)
    } catch {
      setErroDesconto('Falha de conexão')
    } finally {
      setEnviandoDesconto(false)
    }
  }

  function abrirFormEstorno(pagamentoId: string) {
    setEstornandoId(pagamentoId)
    setMotivoEstorno('')
    setSenhaEstorno('')
    setErroEstorno(null)
  }

  async function confirmarEstorno() {
    if (!estornandoId || !motivoEstorno || !senhaEstorno) return
    setErroEstorno(null)
    setEnviandoEstorno(true)
    try {
      const resp = await fetch(`${API_URL}/pagamentos/${estornandoId}/estornar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoEstorno, senha: senhaEstorno }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroEstorno(data.erro ?? 'Não foi possível estornar'); return }
      setResumo(data)
      setEstornandoId(null)
    } catch {
      setErroEstorno('Falha de conexão')
    } finally {
      setEnviandoEstorno(false)
    }
  }

  async function fecharConta() {
    if (!contaSelecionada) return
    setErroFechar(null)
    setFechandoConta(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/fechar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!resp.ok) { setErroFechar(data.erro ?? 'Não foi possível fechar a conta'); return }
      fecharDetalhe()
    } catch {
      setErroFechar('Falha de conexão')
    } finally {
      setFechandoConta(false)
    }
  }
```

Find the "Pagamentos registrados" block (from Task 9):

```tsx
              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-1">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className={`flex justify-between text-sm ${pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                        <span>{labelFormaPagamento[pagamento.formaPagamento]}</span>
                        <span>R$ {pagamento.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
```

Change to:

```tsx
              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-2">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className="flex items-center justify-between text-sm">
                        <span className={pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}>
                          {labelFormaPagamento[pagamento.formaPagamento]} · R$ {pagamento.valor.toFixed(2)}
                        </span>
                        {pagamento.status === 'confirmado' && (
                          <button
                            onClick={() => abrirFormEstorno(pagamento.id)}
                            className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-red-400 hover:bg-red-500/10"
                            title="Estornar pagamento"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Estornar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {estornandoId && (
                    <div className="mt-3 space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                      <p className="text-xs text-zinc-400">Motivo e senha de supervisor para estornar</p>
                      <input
                        value={motivoEstorno}
                        onChange={(e) => setMotivoEstorno(e.target.value)}
                        placeholder="Motivo do estorno"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="password"
                        value={senhaEstorno}
                        onChange={(e) => setSenhaEstorno(e.target.value)}
                        placeholder="Senha de supervisor"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      {erroEstorno && <p className="text-sm text-red-400">{erroEstorno}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={confirmarEstorno}
                          disabled={enviandoEstorno || !motivoEstorno || !senhaEstorno}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          Confirmar estorno
                        </button>
                        <button onClick={() => setEstornandoId(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={abrirFormDesconto}
                    className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    <Percent className="h-4 w-4" /> Aplicar desconto
                  </button>
                  <button
                    onClick={fecharConta}
                    disabled={!resumo.podeFechar || fechandoConta}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                    title={resumo.podeFechar ? 'Fechar conta' : 'Saldo devedor pendente'}
                  >
                    <Lock className="h-4 w-4" /> Fechar conta
                  </button>
                </div>
                {erroFechar && <p className="mt-2 text-sm text-red-400">{erroFechar}</p>}

                {descontoAberto && (
                  <div className="mt-3 space-y-2 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={valorDesconto}
                      onChange={(e) => setValorDesconto(e.target.value)}
                      placeholder="Valor do desconto"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={motivoDesconto}
                      onChange={(e) => setMotivoDesconto(e.target.value)}
                      placeholder="Motivo do desconto"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="password"
                      value={senhaDesconto}
                      onChange={(e) => setSenhaDesconto(e.target.value)}
                      placeholder="Senha de supervisor"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                    />
                    {erroDesconto && <p className="text-sm text-red-400">{erroDesconto}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={aplicarDesconto}
                        disabled={enviandoDesconto || !valorDesconto || !motivoDesconto || !senhaDesconto}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        Confirmar desconto
                      </button>
                      <button onClick={() => setDescontoAberto(false)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Caixa.tsx
git commit -m "feat: desconto, estorno de pagamento e fechamento de conta na tela de caixa"
```

---

### Task 11: Rota e navegação

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `Caixa` default export (Task 8-10), `Permissao` type with `'caixa'` (Task 7).
- Produces: `/caixa` route reachable from the nav for users with the `caixa` permission.

- [ ] **Step 1: Add the route in `App.tsx`**

In `frontend/src/App.tsx`, find:

```tsx
import Producao from './pages/Producao'
```

Add right after it:

```tsx
import Caixa from './pages/Caixa'
```

Find:

```tsx
      <Route path="/producao"  element={<RotaPermissao permissao="mesas"><Producao /></RotaPermissao>} />
```

Add right after it:

```tsx
      <Route path="/caixa"     element={<RotaPermissao permissao="caixa"><Caixa /></RotaPermissao>} />
```

- [ ] **Step 2: Add the nav link in `Layout.tsx`**

In `frontend/src/components/Layout.tsx`, find:

```tsx
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList } from 'lucide-react'
```

Change to:

```tsx
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList, Wallet } from 'lucide-react'
```

Find:

```tsx
  const mostrarMesas = podeMesas && modulosAtivos.includes('mesas')
```

Add right after it:

```tsx
  const podeCaixa = isDono || temPermissao('caixa')
  const mostrarCaixa = podeCaixa && modulosAtivos.includes('mesas')
```

Find the desktop nav's Produção link:

```tsx
            {mostrarMesas && (
              <NavLink to="/producao" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Produção
                </span>
              </NavLink>
            )}
```

Add right after it:

```tsx
            {mostrarCaixa && (
              <NavLink to="/caixa" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" />
                  Caixa
                </span>
              </NavLink>
            )}
```

Find the equivalent block in the mobile nav (same `mostrarMesas && ... /producao ...`
pattern, further down the file) and add the identical `mostrarCaixa && (...)` block right
after it.

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

Start both dev servers (`npm run dev` in backend, `npm run dev` in `frontend`). Log in as
DONO, confirm "Caixa" appears in the nav and the `/caixa` page loads showing open accounts.
Log in as an OPERADOR with only `mesas` (no `caixa`) permission and confirm "Caixa" does
NOT appear in the nav and navigating to `/caixa` directly redirects to `/cozinha` (the
`RotaPermissao` fallback). Then assign `caixa` permission to that operator via
Operadores.tsx, log in again, and confirm "Caixa" now appears.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: rota e navegação da tela de caixa"
```

---

## End-to-End Verification (after all tasks)

1. Abrir uma mesa, lançar 3 itens em 2 comandas diferentes ("Geral" e uma nova "Ana").
2. Ir em Caixa → abrir essa mesa → conferir que o resumo mostra os itens corretos e o
   saldo devedor bate com a soma.
3. Pagar a comanda "Ana" inteira (dividir por comanda) → conferir que os itens dela viram
   "pago" e o saldo cai exatamente o valor dela.
4. Aplicar um desconto de R$5 com a senha de supervisor → conferir que o saldo cai R$5.
5. Pagar o restante com "valor livre" igual ao saldo devedor → conferir `podeFechar: true`.
6. Fechar a conta → conferir que a mesa volta a aparecer como "livre" na tela Mesas.
7. Estornar um dos pagamentos já com a conta fechada → conferir que a conta reabre
   (`aguardando_pagamento`) e o saldo devedor volta a aparecer.
8. Fechar de novo depois de repagar → conferir que fecha normalmente.
9. Repetir o fluxo do garçom em Mesas.tsx (abrir mesa, lançar item, transferir item) do
   início ao fim para confirmar zero regressão nessa tela.
