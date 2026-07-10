# Fase 4a — Estoque Avançado (Fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the manual-only version of the estoque avançado module, per
`docs/superpowers/specs/2026-07-08-estoque-avancado-fase4a-design.md`: a simple `Insumo`
registry, an append-only `MovimentacaoEstoque` ledger, and a screen where the owner reports
total insumo consumption for a day of operation. From that, the system computes **lucro real
do dia** = confirmed revenue that day (`Pedido` not cancelled + `Pagamento` confirmado) minus
the cost of insumos reported consumed that day. No ficha técnica, no automatic per-sale
deduction, no sub-receita — those were explicitly discarded during the design brainstorm (see
spec's "Contexto" section for why).

**Architecture:** Two new Prisma models (`Insumo`, `MovimentacaoEstoque`) gated behind the
existing `estoque_avancado` module flag (already in `MODULOS_VALIDOS`, `src/routes/admin.ts`,
unused until now) and a new `estoque` permission (same pattern as `mesas`/`caixa` — 1
permission ≈ 1 screen). Two new backend route files: `src/routes/insumos.ts` (CRUD, mirrors
the existing `src/routes/setores.ts` pattern exactly) and `src/routes/estoque.ts` (ledger
writes — entrada/perda/ajuste/consumo-diário — plus the `lucro-dia`/`historico` read
endpoints that do the actual profit math). Two new frontend pages: `Insumos.tsx` (cadastro +
quick stock-movement actions per insumo) and `Estoque.tsx` (daily consumption entry + profit
report + history table).

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7, PostgreSQL (backend); React 19,
Vite, Tailwind, React Router 7 (frontend). No new dependencies.

## Global Constraints

- **`Insumo.estoqueAtual` is never written directly.** Every change to it happens inside the
  same `prisma.$transaction` that creates the corresponding `MovimentacaoEstoque` row — same
  "ledger, never a bare counter" principle the spec calls out. There is no route that does
  `prisma.insumo.update({ data: { estoqueAtual: ... } })` outside of `src/routes/estoque.ts`'s
  four movement endpoints.
- **`MovimentacaoEstoque.quantidade` sign convention:** always a positive magnitude for
  `entrada`, `saida_perda`, and `consumo_diario` (the route computes the correct
  increment/decrement direction internally). **`ajuste` is the one exception** — its
  `quantidade` is stored signed as submitted (negative = correção pra baixo, positive =
  correção pra cima), because a physical inventory count can go either direction. Document
  this with a one-line comment directly above the `ajuste` route — it is the one place in this
  module where the sign of a stored number matters and isn't obvious from `tipo` alone.
- **`custoUnitarioSnapshot`** is always read from `Insumo.custoUnitario` **at the moment the
  movement is created**, never recalculated later — this is what makes historical `lucro_dia`
  reports correct even after the owner edits an insumo's cost going forward.
- **`data` on `MovimentacaoEstoque` is a date-only field**, separate from `criadoEm`
  (timestamp). It's what the daily consumption entry and the profit calculation group by —
  allows the owner to back-date a forgotten day's entry without it landing on today.
- **Lucro do dia formula** (implemented once, in `src/routes/estoque.ts`, reused by both
  `POST /estoque/consumo-diario` and `GET /estoque/lucro-dia`):
  ```
  faturamento = Σ Pedido.total (status ≠ 'cancelado', criadoEm no dia)
              + Σ Pagamento.valor (status = 'confirmado', criadoEm no dia)
  custoInsumos = Σ MovimentacaoEstoque.quantidade × custoUnitarioSnapshot
                 (tipo = 'consumo_diario', data = dia)
  lucro = faturamento − custoInsumos
  ```
  The `Pedido` half matches the exact definition the Dashboard already uses
  (`src/routes/estabelecimentos.ts`, `status: { not: 'cancelado' }`) — do not invent a
  different revenue definition here. The `Pagamento` half is new (Dashboard today doesn't
  include mesas revenue at all) but scoped only to this report, not a Dashboard change.
- **New permission `estoque`**, separate from `cardapio`/`configuracoes` — same rationale
  already documented for `mesas`/`caixa` in the Módulo de Mesas spec (1 permission ≈ 1
  screen). Gated routes require **both** `temPermissao('estoque')` and
  `moduloAtivo('estoque_avancado')`, same independent-checks pattern `mesas` already uses.
- Every new backend list/serialize path converts Prisma `Decimal` fields to `Number(...)`
  before sending JSON — same convention already used everywhere else in this codebase (e.g.
  `precoUnit: Number(atualizado.precoUnit)` in `src/routes/contas.ts`).
- Do not touch `ItemCardapio`, `ItemComanda`, `ItemPedido`, ficha técnica, or any existing
  route's status-transition logic — this phase is fully additive and has zero interaction
  with the order/production flow (the manual-only model was chosen specifically to avoid
  that coupling).

---

## File Structure

- **`prisma/schema.prisma`** (modify) — `UnidadeMedida`, `TipoMovimentacaoEstoque` enums;
  `Insumo`, `MovimentacaoEstoque` models; relation fields added to `Estabelecimento` and
  `Usuario`.
- **`src/routes/operadores.ts`** (modify) — add `'estoque'` to `PERMISSOES_VALIDAS`.
- **`src/routes/insumos.ts`** (create) — CRUD de Insumo.
- **`src/routes/estoque.ts`** (create) — `POST /estoque/entrada|perda|ajuste|consumo-diario`,
  `GET /estoque/lucro-dia`, `GET /estoque/historico`.
- **`src/server.ts`** (modify) — register `insumosRoutes`, `estoqueRoutes`.
- **`frontend/src/lib/permissoes.ts`** (modify) — add `'estoque'` permission + nav route.
- **`frontend/src/pages/Insumos.tsx`** (create) — CRUD de Insumo + ações rápidas de
  entrada/perda/ajuste.
- **`frontend/src/pages/Estoque.tsx`** (create) — lançamento de consumo diário + relatório de
  lucro do dia + histórico.
- **`frontend/src/App.tsx`** (modify) — `/insumos` e `/estoque` routes.
- **`frontend/src/components/Layout.tsx`** (modify) — nav links pra ambas, gated por
  permissão `estoque` **e** módulo `estoque_avancado`.

---

### Task 1: Schema Prisma — Insumo, MovimentacaoEstoque

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Insumo`, `MovimentacaoEstoque` Prisma models, `UnidadeMedida`,
  `TipoMovimentacaoEstoque` enums, migration applied to local dev DB. Consumed by every
  subsequent task.

- [ ] **Step 1: Add the two new enums**

Find:

```prisma
enum StatusPagamento {
  pendente
  confirmado
  recusado
  estornado
}
```

Add right after it:

```prisma

enum UnidadeMedida {
  g
  kg
  ml
  l
  un
}

enum TipoMovimentacaoEstoque {
  entrada
  saida_perda
  ajuste
  consumo_diario
}
```

- [ ] **Step 2: Add relation fields to `Estabelecimento`**

Find (inside the `Estabelecimento` model, near the end of its relation list):

```prisma
  pagamentos       Pagamento[]
  pagamentoItens   PagamentoItem[]

  @@map("estabelecimentos")
```

Change to:

```prisma
  pagamentos       Pagamento[]
  pagamentoItens   PagamentoItem[]
  insumos          Insumo[]
  movimentacoesEstoque MovimentacaoEstoque[]

  @@map("estabelecimentos")
```

- [ ] **Step 3: Add a relation field to `Usuario`**

Find:

```prisma
  pushSubscriptions PushSubscription[]
  itensComandaCriados ItemComanda[]
  pagamentosRegistrados Pagamento[]
  logsAuditoria         LogAuditoria[]

  @@map("usuarios")
```

Change to:

```prisma
  pushSubscriptions PushSubscription[]
  itensComandaCriados ItemComanda[]
  pagamentosRegistrados Pagamento[]
  logsAuditoria         LogAuditoria[]
  movimentacoesEstoque  MovimentacaoEstoque[]

  @@map("usuarios")
```

- [ ] **Step 4: Add the `Insumo` and `MovimentacaoEstoque` models**

Find the end of the file:

```prisma
model LogAuditoria {
  id           String   @id @default(uuid())
  acao         String
  entidadeTipo String
  entidadeId   String
  motivo       String?
  dadosAntes   Json?
  dadosDepois  Json?
  criadoEm     DateTime @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  usuarioId String?
  usuario   Usuario? @relation(fields: [usuarioId], references: [id])

  @@index([estabelecimentoId, criadoEm])
  @@map("log_auditoria")
}
```

Add right after it:

```prisma

// ============================================================================
// ESTOQUE AVANÇADO (Fase 4a) — modelo manual: sem ficha técnica, sem baixa
// automática por venda. Ver docs/superpowers/specs/2026-07-08-estoque-avancado-fase4a-design.md
// ============================================================================

model Insumo {
  id            String        @id @default(uuid())
  nome          String
  unidade       UnidadeMedida
  custoUnitario Decimal       @db.Decimal(10, 4)
  estoqueAtual  Decimal       @default(0) @db.Decimal(10, 3)
  criadoEm      DateTime      @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  movimentacoes MovimentacaoEstoque[]

  @@unique([estabelecimentoId, nome])
  @@map("insumos")
}

model MovimentacaoEstoque {
  id                    String                  @id @default(uuid())
  tipo                  TipoMovimentacaoEstoque
  quantidade            Decimal                 @db.Decimal(10, 3)
  custoUnitarioSnapshot Decimal                  @db.Decimal(10, 4)
  data                  DateTime                @db.Date
  motivo                String?
  criadoEm              DateTime                @default(now())

  insumoId String
  insumo   Insumo @relation(fields: [insumoId], references: [id])

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  usuarioId String?
  usuario   Usuario? @relation(fields: [usuarioId], references: [id])

  @@index([estabelecimentoId, data])
  @@index([estabelecimentoId, tipo, data])
  @@map("movimentacoes_estoque")
}
```

- [ ] **Step 5: Generate and run the migration**

**Announce explicitly before running** (per `CLAUDE.md`'s "Trabalho em equipe" rule — migration
is the highest-risk point for two people working in parallel):

> "Vou rodar `npx prisma migrate dev --name estoque_avancado_fundacao` agora."

Then run:

```bash
npx prisma migrate dev --name estoque_avancado_fundacao
```

Expected: migration applies cleanly, Prisma Client regenerates. Confirm the new tables exist:

```bash
npx prisma studio
```

(or a direct query) — `insumos` and `movimentacoes_estoque` tables should be visible, both
empty.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (nothing consumes the new models yet, but the Prisma Client types must
compile cleanly).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: schema de Insumo e MovimentacaoEstoque (estoque avançado, Fase 4a)"
```

---

### Task 2: Permissão `estoque` no backend

**Files:**
- Modify: `src/routes/operadores.ts`

**Interfaces:**
- Produces: `'estoque'` is now a valid value in `Usuario.permissoes[]`. Consumed by Tasks 3-4
  (`temPermissao('estoque')` in the new routes) and Task 5 (frontend permission list).

- [ ] **Step 1: Add `'estoque'` to the valid permissions list**

Find:

```typescript
const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes', 'mesas', 'caixa'] as const;
```

Change to:

```typescript
const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes', 'mesas', 'caixa', 'estoque'] as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/operadores.ts
git commit -m "feat: adiciona permissão estoque"
```

---

### Task 3: CRUD de Insumo

**Files:**
- Create: `src/routes/insumos.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `Insumo`/`MovimentacaoEstoque` (Task 1), `'estoque'` permission (Task 2),
  `moduloAtivo` (existing, `src/plugins/auth.ts`).
- Produces: `GET/POST/PATCH/DELETE /insumos`. Consumed by Task 5 (`Insumos.tsx`) and Task 4
  (`estoque.ts` reads `Insumo.custoUnitario` for snapshots).

- [ ] **Step 1: Create `src/routes/insumos.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import type { UnidadeMedida } from '../generated/prisma/enums.js';

const UNIDADES = ['g', 'kg', 'ml', 'l', 'un'] as const;

const CriarInsumoSchema = Type.Object({
  nome:           Type.String({ minLength: 1, maxLength: 80 }),
  unidade:        Type.Union(UNIDADES.map((u) => Type.Literal(u)) as [ReturnType<typeof Type.Literal>]),
  custoUnitario:  Type.Number({ minimum: 0 }),
  estoqueInicial: Type.Optional(Type.Number({ minimum: 0 })),
});

const AtualizarInsumoSchema = Type.Object({
  nome:          Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  unidade:       Type.Optional(Type.Union(UNIDADES.map((u) => Type.Literal(u)) as [ReturnType<typeof Type.Literal>])),
  custoUnitario: Type.Optional(Type.Number({ minimum: 0 })),
});

const InsumoParamsSchema = Type.Object({ id: Type.String() });

function serializarInsumo(insumo: { custoUnitario: unknown; estoqueAtual: unknown; [k: string]: unknown }) {
  return { ...insumo, custoUnitario: Number(insumo.custoUnitario), estoqueAtual: Number(insumo.estoqueAtual) };
}

export async function insumosRoutes(fastify: FastifyInstance) {
  // ── GET /insumos ────────────────────────────────────────────────────────────
  fastify.get('/insumos', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const insumos = await prisma.insumo.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
    });
    return insumos.map(serializarInsumo);
  });

  // ── POST /insumos ───────────────────────────────────────────────────────────
  // estoqueInicial (opcional) gera automaticamente uma MovimentacaoEstoque tipo
  // 'entrada' — mantém a regra de que estoqueAtual nunca é escrito fora do ledger.
  fastify.post('/insumos', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: CriarInsumoSchema },
  }, async (request, reply) => {
    const { nome, unidade, custoUnitario, estoqueInicial } = request.body as {
      nome: string; unidade: UnidadeMedida; custoUnitario: number; estoqueInicial?: number;
    };
    const { estabelecimentoId, userId } = request.user;

    const existente = await prisma.insumo.findUnique({
      where: { estabelecimentoId_nome: { estabelecimentoId: estabelecimentoId!, nome } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe um insumo com esse nome' });

    const insumo = await prisma.$transaction(async (tx) => {
      const criado = await tx.insumo.create({
        data: {
          nome,
          unidade,
          custoUnitario,
          estoqueAtual: estoqueInicial ?? 0,
          estabelecimentoId: estabelecimentoId!,
        },
      });
      if (estoqueInicial && estoqueInicial > 0) {
        await tx.movimentacaoEstoque.create({
          data: {
            tipo:                  'entrada',
            quantidade:            estoqueInicial,
            custoUnitarioSnapshot: custoUnitario,
            data:                  new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
            insumoId:              criado.id,
            estabelecimentoId:     estabelecimentoId!,
            usuarioId:             userId,
          },
        });
      }
      return criado;
    });

    return reply.status(201).send(serializarInsumo(insumo));
  });

  // ── PATCH /insumos/:id ──────────────────────────────────────────────────────
  // Nunca altera estoqueAtual — só nome/unidade/custoUnitario.
  fastify.patch('/insumos/:id', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { params: InsumoParamsSchema, body: AtualizarInsumoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { nome?: string; unidade?: UnidadeMedida; custoUnitario?: number };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.insumo.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    const atualizado = await prisma.insumo.findUnique({ where: { id } });
    return serializarInsumo(atualizado!);
  });

  // ── DELETE /insumos/:id ─────────────────────────────────────────────────────
  // Bloqueado se já existir alguma movimentação — preserva o ledger histórico
  // (mesmo padrão de bloqueio que Setor já usa contra ItemCardapio vinculado).
  fastify.delete('/insumos/:id', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { params: InsumoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const insumo = await prisma.insumo.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    const movimentacoes = await prisma.movimentacaoEstoque.count({ where: { insumoId: id } });
    if (movimentacoes > 0) {
      return reply.status(422).send({ erro: 'Este insumo já tem movimentações registradas e não pode ser excluído' });
    }

    await prisma.insumo.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Register the route in `src/server.ts`**

Find:

```typescript
import { auditoriaRoutes } from './routes/auditoria.js';
```

Add right after it:

```typescript
import { insumosRoutes } from './routes/insumos.js';
```

Find:

```typescript
  await fastify.register(auditoriaRoutes);
```

Add right after it:

```typescript
  await fastify.register(insumosRoutes);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification with curl**

Start the dev server. First, enable the module for the test establishment and give the DONO
token the permission (DONO bypasses `temPermissao` automatically — just needs
`moduloAtivo`), via `PATCH /admin/estabelecimentos/:id/modulos` with a Super Admin token
(`{"modulos":["estoque_avancado"]}`), or reuse an establishment that already has `mesas` and
add `estoque_avancado` to the array.

```bash
curl -s -X POST http://localhost:3000/insumos \
  -H "Authorization: Bearer <TOKEN_DONO>" -H "Content-Type: application/json" \
  -d '{"nome":"Arroz","unidade":"kg","custoUnitario":6.50,"estoqueInicial":20}' -w "\nHTTP %{http_code}\n"
```
Expected: `201`, `estoqueAtual: 20`.

```bash
curl -s http://localhost:3000/insumos -H "Authorization: Bearer <TOKEN_DONO>" | jq
```
Expected: `200`, array with the Arroz insumo.

```bash
curl -s -X POST http://localhost:3000/insumos \
  -H "Authorization: Bearer <TOKEN_DONO>" -H "Content-Type: application/json" \
  -d '{"nome":"Arroz","unidade":"kg","custoUnitario":6.50}' -w "\nHTTP %{http_code}\n"
```
Expected: `409` (nome duplicado).

```bash
curl -s -X DELETE http://localhost:3000/insumos/<INSUMO_ID> -H "Authorization: Bearer <TOKEN_DONO>" -w "\nHTTP %{http_code}\n"
```
Expected: `422` (já tem movimentação da entrada inicial) — confirma que o bloqueio funciona.

- [ ] **Step 5: Commit**

```bash
git add src/routes/insumos.ts src/server.ts
git commit -m "feat: CRUD de Insumo (estoque avançado)"
```

---

### Task 4: Movimentação de estoque e cálculo de lucro do dia

**Files:**
- Create: `src/routes/estoque.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `Insumo`/`MovimentacaoEstoque` (Task 1), `insumosRoutes` registered (Task 3, not a
  code dependency, just needs to exist for manual testing).
- Produces: `POST /estoque/entrada`, `POST /estoque/perda`, `POST /estoque/ajuste`,
  `POST /estoque/consumo-diario`, `GET /estoque/lucro-dia?data=`, `GET /estoque/historico`.
  Consumed by Task 5 (`Insumos.tsx` uses entrada/perda/ajuste) and Task 6 (`Estoque.tsx` uses
  consumo-diario/lucro-dia/historico).

- [ ] **Step 1: Create `src/routes/estoque.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';

const EntradaSchema = Type.Object({
  insumoId:   Type.String({ minLength: 1 }),
  quantidade: Type.Number({ exclusiveMinimum: 0 }),
  data:       Type.Optional(Type.String()),
});

const PerdaSchema = Type.Object({
  insumoId:   Type.String({ minLength: 1 }),
  quantidade: Type.Number({ exclusiveMinimum: 0 }),
  motivo:     Type.String({ minLength: 1, maxLength: 200 }),
  data:       Type.Optional(Type.String()),
});

// quantidade pode ser negativa (correção pra baixo) ou positiva (correção pra
// cima) — o único tipo de movimentação onde o sinal do valor importa.
const AjusteSchema = Type.Object({
  insumoId:   Type.String({ minLength: 1 }),
  quantidade: Type.Number(),
  motivo:     Type.String({ minLength: 1, maxLength: 200 }),
});

const ConsumoDiarioSchema = Type.Object({
  data:  Type.String(),
  itens: Type.Array(
    Type.Object({
      insumoId:   Type.String({ minLength: 1 }),
      quantidade: Type.Number({ exclusiveMinimum: 0 }),
    }),
    { minItems: 1 }
  ),
});

const LucroDiaQuerySchema = Type.Object({ data: Type.String() });

function dataDoDia(dataStr: string): Date {
  return new Date(`${dataStr}T00:00:00.000Z`);
}

function inicioFimDoDia(dataStr: string) {
  return {
    inicio: new Date(`${dataStr}T00:00:00.000Z`),
    fim:    new Date(`${dataStr}T23:59:59.999Z`),
  };
}

async function calcularLucroDia(estabelecimentoId: string, dataStr: string) {
  const { inicio, fim } = inicioFimDoDia(dataStr);

  const [pedidos, pagamentos, movimentacoes] = await Promise.all([
    prisma.pedido.aggregate({
      where: { estabelecimentoId, status: { not: 'cancelado' }, criadoEm: { gte: inicio, lte: fim } },
      _sum:  { total: true },
    }),
    prisma.pagamento.aggregate({
      where: { estabelecimentoId, status: 'confirmado', criadoEm: { gte: inicio, lte: fim } },
      _sum:  { valor: true },
    }),
    prisma.movimentacaoEstoque.findMany({
      where: { estabelecimentoId, tipo: 'consumo_diario', data: dataDoDia(dataStr) },
    }),
  ]);

  const faturamento  = Number(pedidos._sum.total ?? 0) + Number(pagamentos._sum.valor ?? 0);
  const custoInsumos = movimentacoes.reduce(
    (soma, m) => soma + Number(m.quantidade) * Number(m.custoUnitarioSnapshot),
    0
  );

  return { data: dataStr, faturamento, custoInsumos, lucro: faturamento - custoInsumos };
}

export async function estoqueRoutes(fastify: FastifyInstance) {
  // ── POST /estoque/entrada ───────────────────────────────────────────────────
  fastify.post('/estoque/entrada', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: EntradaSchema },
  }, async (request, reply) => {
    const { insumoId, quantidade, data } = request.body as { insumoId: string; quantidade: number; data?: string };
    const { estabelecimentoId, userId } = request.user;

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: {
          tipo: 'entrada', quantidade,
          custoUnitarioSnapshot: insumo.custoUnitario,
          data:      data ? dataDoDia(data) : dataDoDia(new Date().toISOString().slice(0, 10)),
          insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
        },
      }),
      prisma.insumo.update({ where: { id: insumoId }, data: { estoqueAtual: { increment: quantidade } } }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // ── POST /estoque/perda ─────────────────────────────────────────────────────
  fastify.post('/estoque/perda', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: PerdaSchema },
  }, async (request, reply) => {
    const { insumoId, quantidade, motivo, data } = request.body as {
      insumoId: string; quantidade: number; motivo: string; data?: string;
    };
    const { estabelecimentoId, userId } = request.user;

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: {
          tipo: 'saida_perda', quantidade, motivo,
          custoUnitarioSnapshot: insumo.custoUnitario,
          data:      data ? dataDoDia(data) : dataDoDia(new Date().toISOString().slice(0, 10)),
          insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
        },
      }),
      prisma.insumo.update({ where: { id: insumoId }, data: { estoqueAtual: { decrement: quantidade } } }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // ── POST /estoque/ajuste ────────────────────────────────────────────────────
  fastify.post('/estoque/ajuste', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: AjusteSchema },
  }, async (request, reply) => {
    const { insumoId, quantidade, motivo } = request.body as { insumoId: string; quantidade: number; motivo: string };
    const { estabelecimentoId, userId } = request.user;

    if (quantidade === 0) return reply.status(400).send({ erro: 'Informe uma quantidade diferente de zero' });

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: {
          tipo: 'ajuste', quantidade, motivo,
          custoUnitarioSnapshot: insumo.custoUnitario,
          data:      dataDoDia(new Date().toISOString().slice(0, 10)),
          insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
        },
      }),
      prisma.insumo.update({ where: { id: insumoId }, data: { estoqueAtual: { increment: quantidade } } }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // ── POST /estoque/consumo-diario ────────────────────────────────────────────
  fastify.post('/estoque/consumo-diario', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: ConsumoDiarioSchema },
  }, async (request, reply) => {
    const { data, itens } = request.body as { data: string; itens: { insumoId: string; quantidade: number }[] };
    const { estabelecimentoId, userId } = request.user;

    const insumoIds = itens.map((i) => i.insumoId);
    const insumos = await prisma.insumo.findMany({
      where: { id: { in: insumoIds }, estabelecimentoId: estabelecimentoId! },
    });
    if (insumos.length !== new Set(insumoIds).size) {
      return reply.status(400).send({ erro: 'Um ou mais insumos não encontrados' });
    }

    const dataAlvo = dataDoDia(data);

    await prisma.$transaction(
      itens.flatMap((item) => {
        const insumo = insumos.find((i) => i.id === item.insumoId)!;
        return [
          prisma.movimentacaoEstoque.create({
            data: {
              tipo: 'consumo_diario', quantidade: item.quantidade,
              custoUnitarioSnapshot: insumo.custoUnitario, data: dataAlvo,
              insumoId: item.insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
            },
          }),
          prisma.insumo.update({
            where: { id: item.insumoId },
            data:  { estoqueAtual: { decrement: item.quantidade } },
          }),
        ];
      })
    );

    return reply.status(201).send(await calcularLucroDia(estabelecimentoId!, data));
  });

  // ── GET /estoque/lucro-dia?data=YYYY-MM-DD ──────────────────────────────────
  fastify.get('/estoque/lucro-dia', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { querystring: LucroDiaQuerySchema },
  }, async (request) => {
    const { data } = request.query as { data: string };
    const { estabelecimentoId } = request.user;
    return calcularLucroDia(estabelecimentoId!, data);
  });

  // ── GET /estoque/historico ──────────────────────────────────────────────────
  // Últimos 30 dias com algum lançamento de consumo_diario, mais recente primeiro.
  fastify.get('/estoque/historico', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;

    const dias = await prisma.movimentacaoEstoque.findMany({
      where:    { estabelecimentoId: estabelecimentoId!, tipo: 'consumo_diario' },
      distinct: ['data'],
      orderBy:  { data: 'desc' },
      take:     30,
      select:   { data: true },
    });

    return Promise.all(
      dias.map((d) => calcularLucroDia(estabelecimentoId!, d.data.toISOString().slice(0, 10)))
    );
  });
}
```

- [ ] **Step 2: Register the route in `src/server.ts`**

Find:

```typescript
import { insumosRoutes } from './routes/insumos.js';
```

Add right after it:

```typescript
import { estoqueRoutes } from './routes/estoque.js';
```

Find:

```typescript
  await fastify.register(insumosRoutes);
```

Add right after it:

```typescript
  await fastify.register(estoqueRoutes);
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all existing tests pass (this task adds no unit tests of its own — it's
route-only, matching the pattern of most other route files in this codebase; the profit-math
function `calcularLucroDia` is simple enough to verify via the curl checks below rather than
a dedicated unit test, since it's not exported/reused outside this file).

- [ ] **Step 4: Manual verification with curl**

Using the `Arroz` insumo created in Task 3's verification (id: `<INSUMO_ID>`, custoUnitario
6.50):

```bash
# Lança consumo de 5kg de arroz para hoje:
curl -s -X POST http://localhost:3000/estoque/consumo-diario \
  -H "Authorization: Bearer <TOKEN_DONO>" -H "Content-Type: application/json" \
  -d '{"data":"2026-07-08","itens":[{"insumoId":"<INSUMO_ID>","quantidade":5}]}' -w "\nHTTP %{http_code}\n"
```
Expected: `201`, `{ data: "2026-07-08", faturamento: <soma de pedidos/pagamentos do dia>, custoInsumos: 32.5, lucro: faturamento - 32.5 }`.

```bash
curl -s http://localhost:3000/insumos -H "Authorization: Bearer <TOKEN_DONO>" | jq '.[] | select(.nome=="Arroz") | .estoqueAtual'
```
Expected: `15` (20 do estoque inicial da Task 3, menos os 5 consumidos aqui).

```bash
curl -s "http://localhost:3000/estoque/lucro-dia?data=2026-07-08" -H "Authorization: Bearer <TOKEN_DONO>" | jq
```
Expected: mesmo resultado do POST acima (idempotente na leitura).

```bash
curl -s -X POST http://localhost:3000/estoque/perda \
  -H "Authorization: Bearer <TOKEN_DONO>" -H "Content-Type: application/json" \
  -d '{"insumoId":"<INSUMO_ID>","quantidade":1,"motivo":"caiu no chão"}' -w "\nHTTP %{http_code}\n"
```
Expected: `201`. Confirma `estoqueAtual` cai pra `14`.

```bash
curl -s -X POST http://localhost:3000/estoque/ajuste \
  -H "Authorization: Bearer <TOKEN_DONO>" -H "Content-Type: application/json" \
  -d '{"insumoId":"<INSUMO_ID>","quantidade":-2,"motivo":"contagem física encontrou menos"}' -w "\nHTTP %{http_code}\n"
```
Expected: `201`. Confirma `estoqueAtual` cai pra `12`.

```bash
curl -s http://localhost:3000/estoque/historico -H "Authorization: Bearer <TOKEN_DONO>" | jq
```
Expected: `200`, array com a entrada de `2026-07-08`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/estoque.ts src/server.ts
git commit -m "feat: lançamento de consumo diário e cálculo de lucro real do dia"
```

---

### Task 5: Permissão no frontend + tela `/insumos`

**Files:**
- Modify: `frontend/src/lib/permissoes.ts`
- Create: `frontend/src/pages/Insumos.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /insumos`, `POST /estoque/entrada|perda|ajuste` (Tasks 3-4).
- Produces: `'estoque'` added to `Permissao` type + `TODAS_PERMISSOES` + `ROTA_POR_PERMISSAO`.
  `Insumos` default export, consumed by Task 7 (`App.tsx`/`Layout.tsx`).

- [ ] **Step 1: Add the permission to `permissoes.ts`**

Find:

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

Change to:

```typescript
export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes' | 'mesas' | 'caixa' | 'estoque'

export const TODAS_PERMISSOES: { id: Permissao; label: string }[] = [
  { id: 'cozinha',       label: 'Cozinha — ver e atualizar pedidos' },
  { id: 'cardapio',      label: 'Cardápio — editar itens e categorias' },
  { id: 'historico',     label: 'Histórico — ver pedidos anteriores' },
  { id: 'pedido_manual', label: 'Criar pedido manualmente' },
  { id: 'configuracoes', label: 'Configurações do estabelecimento' },
  { id: 'mesas',         label: 'Mesas — abrir mesas e lançar pedidos' },
  { id: 'caixa',         label: 'Caixa — fechar contas e processar pagamentos' },
  { id: 'estoque',       label: 'Estoque — insumos e lançamento de consumo diário' },
]
```

- [ ] **Step 2: Add the nav route**

Find:

```typescript
const ROTA_POR_PERMISSAO: { permissao: Permissao; rota: string }[] = [
  { permissao: 'cozinha', rota: '/cozinha' },
  { permissao: 'mesas', rota: '/mesas' },
  { permissao: 'caixa', rota: '/caixa' },
  { permissao: 'cardapio', rota: '/cardapio' },
  { permissao: 'historico', rota: '/historico' },
  { permissao: 'configuracoes', rota: '/configuracoes' },
]
```

Change to:

```typescript
const ROTA_POR_PERMISSAO: { permissao: Permissao; rota: string }[] = [
  { permissao: 'cozinha', rota: '/cozinha' },
  { permissao: 'mesas', rota: '/mesas' },
  { permissao: 'caixa', rota: '/caixa' },
  { permissao: 'cardapio', rota: '/cardapio' },
  { permissao: 'historico', rota: '/historico' },
  { permissao: 'configuracoes', rota: '/configuracoes' },
  { permissao: 'estoque', rota: '/insumos' },
]
```

- [ ] **Step 3: Create `frontend/src/pages/Insumos.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Package, Plus, Pencil, Loader2, X, ArrowUpDown } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

type Unidade = 'g' | 'kg' | 'ml' | 'l' | 'un'
type TipoMovimento = 'entrada' | 'perda' | 'ajuste'

const LABEL_UNIDADE: Record<Unidade, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', un: 'un' }

interface Insumo {
  id: string
  nome: string
  unidade: Unidade
  custoUnitario: number
  estoqueAtual: number
}

export default function Insumos() {
  const token = localStorage.getItem('token')
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Insumo | null>(null)
  const [nome, setNome] = useState('')
  const [unidade, setUnidade] = useState<Unidade>('kg')
  const [custoUnitario, setCustoUnitario] = useState('')
  const [estoqueInicial, setEstoqueInicial] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState<string | null>(null)

  const [movimento, setMovimento] = useState<Insumo | null>(null)
  const [tipoMovimento, setTipoMovimento] = useState<TipoMovimento>('entrada')
  const [quantidadeMovimento, setQuantidadeMovimento] = useState('')
  const [motivoMovimento, setMotivoMovimento] = useState('')
  const [enviandoMovimento, setEnviandoMovimento] = useState(false)
  const [erroMovimento, setErroMovimento] = useState<string | null>(null)

  function carregar() {
    setCarregando(true)
    fetch(`${API_URL}/insumos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setInsumos)
      .catch(() => setErro('Falha ao carregar insumos'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirCriar() {
    setEditando(null)
    setNome('')
    setUnidade('kg')
    setCustoUnitario('')
    setEstoqueInicial('')
    setErroModal(null)
    setModalAberto(true)
  }

  function abrirEditar(insumo: Insumo) {
    setEditando(insumo)
    setNome(insumo.nome)
    setUnidade(insumo.unidade)
    setCustoUnitario(String(insumo.custoUnitario))
    setEstoqueInicial('')
    setErroModal(null)
    setModalAberto(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErroModal(null)
    try {
      const url    = editando ? `${API_URL}/insumos/${editando.id}` : `${API_URL}/insumos`
      const method = editando ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = { nome, unidade, custoUnitario: Number(custoUnitario) }
      if (!editando && estoqueInicial) body.estoqueInicial = Number(estoqueInicial)

      const resp = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroModal(data.erro ?? 'Não foi possível salvar'); return }
      setModalAberto(false)
      carregar()
    } catch {
      setErroModal('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  function abrirMovimento(insumo: Insumo) {
    setMovimento(insumo)
    setTipoMovimento('entrada')
    setQuantidadeMovimento('')
    setMotivoMovimento('')
    setErroMovimento(null)
  }

  async function confirmarMovimento() {
    if (!movimento) return
    const quantidade = Number(quantidadeMovimento)
    if (!quantidade || (tipoMovimento !== 'ajuste' && quantidade <= 0)) {
      setErroMovimento('Informe uma quantidade válida')
      return
    }
    if (tipoMovimento !== 'entrada' && !motivoMovimento) {
      setErroMovimento('Motivo é obrigatório')
      return
    }

    setEnviandoMovimento(true)
    setErroMovimento(null)
    try {
      const endpoint = tipoMovimento === 'entrada' ? 'entrada' : tipoMovimento === 'perda' ? 'perda' : 'ajuste'
      const body: Record<string, unknown> = { insumoId: movimento.id, quantidade }
      if (tipoMovimento !== 'entrada') body.motivo = motivoMovimento

      const resp = await fetch(`${API_URL}/estoque/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroMovimento(data.erro ?? 'Não foi possível registrar'); return }
      setMovimento(null)
      carregar()
    } catch {
      setErroMovimento('Falha de conexão')
    } finally {
      setEnviandoMovimento(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-extrabold">
          <Package className="h-6 w-6" /> Insumos
        </h2>
        <button
          onClick={abrirCriar}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" /> Novo insumo
        </button>
      </div>

      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}

      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : insumos.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum insumo cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Unidade</th>
                <th className="px-4 py-3">Custo unitário</th>
                <th className="px-4 py-3">Estoque atual</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {insumos.map((insumo) => (
                <tr key={insumo.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3 font-medium">{insumo.nome}</td>
                  <td className="px-4 py-3 text-zinc-400">{LABEL_UNIDADE[insumo.unidade]}</td>
                  <td className="px-4 py-3 text-zinc-400">R$ {insumo.custoUnitario.toFixed(4)}</td>
                  <td className="px-4 py-3 text-zinc-400">{insumo.estoqueAtual.toFixed(3)} {LABEL_UNIDADE[insumo.unidade]}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => abrirMovimento(insumo)}
                      className="mr-1 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="Movimentar estoque"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirEditar(insumo)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setModalAberto(false)}>
          <form onSubmit={salvar} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editando ? 'Editar insumo' : 'Novo insumo'}</h3>
              <button type="button" onClick={() => setModalAberto(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome (ex: Maminha, Arroz, Coca-Cola 2L)"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as Unidade)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              >
                {(['g', 'kg', 'ml', 'l', 'un'] as Unidade[]).map((u) => (
                  <option key={u} value={u}>{LABEL_UNIDADE[u]}</option>
                ))}
              </select>
              <input
                type="number" step="0.0001" min="0"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
                placeholder="Custo por unidade (R$)"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {!editando && (
                <input
                  type="number" step="0.001" min="0"
                  value={estoqueInicial}
                  onChange={(e) => setEstoqueInicial(e.target.value)}
                  placeholder="Estoque inicial (opcional)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroModal && <p className="mt-2 text-sm text-red-400">{erroModal}</p>}
            <button
              type="submit"
              disabled={salvando}
              className="mt-3 w-full rounded-lg bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        </div>
      )}

      {movimento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMovimento(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Movimentar {movimento.nome}</h3>
            <div className="space-y-2">
              <select
                value={tipoMovimento}
                onChange={(e) => setTipoMovimento(e.target.value as TipoMovimento)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              >
                <option value="entrada">Entrada (reposição/compra)</option>
                <option value="perda">Perda/quebra</option>
                <option value="ajuste">Ajuste de contagem (+ ou -)</option>
              </select>
              <input
                type="number" step="0.001"
                value={quantidadeMovimento}
                onChange={(e) => setQuantidadeMovimento(e.target.value)}
                placeholder={tipoMovimento === 'ajuste' ? 'Quantidade (negativo = faltou)' : 'Quantidade'}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {tipoMovimento !== 'entrada' && (
                <input
                  value={motivoMovimento}
                  onChange={(e) => setMotivoMovimento(e.target.value)}
                  placeholder="Motivo (obrigatório)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroMovimento && <p className="mt-2 text-sm text-red-400">{erroMovimento}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmarMovimento}
                disabled={enviandoMovimento}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button onClick={() => setMovimento(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/permissoes.ts frontend/src/pages/Insumos.tsx
git commit -m "feat: permissão estoque + tela de cadastro de insumos"
```

---

### Task 6: Tela `/estoque` — consumo diário e lucro real do dia

**Files:**
- Create: `frontend/src/pages/Estoque.tsx`

**Interfaces:**
- Consumes: `GET /insumos` (Task 3), `POST /estoque/consumo-diario`,
  `GET /estoque/lucro-dia`, `GET /estoque/historico` (Task 4).
- Produces: `Estoque` default export, consumed by Task 7.

- [ ] **Step 1: Create `frontend/src/pages/Estoque.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { TrendingUp, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Insumo {
  id: string
  nome: string
  unidade: string
}

interface LinhaConsumo {
  insumoId: string
  quantidade: string
}

interface LucroDia {
  data: string
  faturamento: number
  custoInsumos: number
  lucro: number
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Estoque() {
  const token = localStorage.getItem('token')
  const [insumos, setInsumos] = useState<Insumo[]>([])

  const [data, setData] = useState(hojeISO())
  const [linhas, setLinhas] = useState<LinhaConsumo[]>([{ insumoId: '', quantidade: '' }])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [resultado, setResultado] = useState<LucroDia | null>(null)
  const [carregandoResultado, setCarregandoResultado] = useState(false)

  const [historico, setHistorico] = useState<LucroDia[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/insumos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setInsumos)
      .catch(console.error)
  }, [token])

  function carregarHistorico() {
    setCarregandoHistorico(true)
    fetch(`${API_URL}/estoque/historico`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setHistorico)
      .catch(console.error)
      .finally(() => setCarregandoHistorico(false))
  }

  useEffect(() => {
    carregarHistorico()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function adicionarLinha() {
    setLinhas((prev) => [...prev, { insumoId: '', quantidade: '' }])
  }

  function removerLinha(index: number) {
    setLinhas((prev) => prev.filter((_, i) => i !== index))
  }

  function atualizarLinha(index: number, campo: keyof LinhaConsumo, valor: string) {
    setLinhas((prev) => prev.map((linha, i) => (i === index ? { ...linha, [campo]: valor } : linha)))
  }

  async function lancarConsumo() {
    const itens = linhas
      .filter((l) => l.insumoId && Number(l.quantidade) > 0)
      .map((l) => ({ insumoId: l.insumoId, quantidade: Number(l.quantidade) }))

    if (itens.length === 0) { setErro('Informe pelo menos um insumo com quantidade'); return }

    setSalvando(true)
    setErro(null)
    try {
      const resp = await fetch(`${API_URL}/estoque/consumo-diario`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, itens }),
      })
      const resultadoResp = await resp.json()
      if (!resp.ok) { setErro(resultadoResp.erro ?? 'Não foi possível lançar o consumo'); return }
      setResultado(resultadoResp)
      setLinhas([{ insumoId: '', quantidade: '' }])
      carregarHistorico()
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  async function consultarDia() {
    setCarregandoResultado(true)
    setErro(null)
    try {
      const resp = await fetch(`${API_URL}/estoque/lucro-dia?data=${data}`, { headers: { Authorization: `Bearer ${token}` } })
      setResultado(await resp.json())
    } catch {
      setErro('Falha ao consultar o dia')
    } finally {
      setCarregandoResultado(false)
    }
  }

  return (
    <Layout>
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <TrendingUp className="h-6 w-6" /> Estoque — Consumo do dia
      </h2>

      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-zinc-400">Dia de funcionamento</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
          <button onClick={consultarDia} className="text-xs text-orange-400 hover:text-orange-300">
            Ver lucro desse dia
          </button>
        </div>

        <div className="space-y-2">
          {linhas.map((linha, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={linha.insumoId}
                onChange={(e) => atualizarLinha(index, 'insumoId', e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              >
                <option value="">Selecione o insumo</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>
                ))}
              </select>
              <input
                type="number" step="0.001" min="0"
                value={linha.quantidade}
                onChange={(e) => atualizarLinha(index, 'quantidade', e.target.value)}
                placeholder="Quantidade"
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {linhas.length > 1 && (
                <button onClick={() => removerLinha(index)} className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={adicionarLinha} className="mt-2 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
          <Plus className="h-3.5 w-3.5" /> Adicionar insumo
        </button>

        {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}

        <button
          onClick={lancarConsumo}
          disabled={salvando}
          className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {salvando ? 'Lançando...' : 'Lançar consumo do dia'}
        </button>
      </div>

      {carregandoResultado ? (
        <Loader2 className="mb-6 h-6 w-6 animate-spin text-zinc-500" />
      ) : resultado && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">Faturamento confirmado</p>
            <p className="text-xl font-bold text-zinc-100">R$ {resultado.faturamento.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">Custo dos insumos</p>
            <p className="text-xl font-bold text-zinc-100">R$ {resultado.custoInsumos.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">Lucro real do dia</p>
            <p className={`text-xl font-bold ${resultado.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              R$ {resultado.lucro.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <h3 className="mb-3 text-lg font-bold">Histórico</h3>
      {carregandoHistorico ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : historico.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-zinc-400">
          <AlertTriangle className="h-4 w-4" /> Nenhum consumo lançado ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Dia</th>
                <th className="px-4 py-3">Faturamento</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {historico.map((dia) => (
                <tr key={dia.data} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">{new Date(`${dia.data}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-zinc-400">R$ {dia.faturamento.toFixed(2)}</td>
                  <td className="px-4 py-3 text-zinc-400">R$ {dia.custoInsumos.toFixed(2)}</td>
                  <td className={`px-4 py-3 font-medium ${dia.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    R$ {dia.lucro.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
git add frontend/src/pages/Estoque.tsx
git commit -m "feat: tela de lançamento de consumo diário e lucro real do dia"
```

---

### Task 7: Rotas e navegação

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `Insumos` (Task 5), `Estoque` (Task 6) default exports.
- Produces: `/insumos` and `/estoque` reachable from the nav, gated by `estoque` permission
  **and** `estoque_avancado` module (same independent double-check as `mesas`/`caixa`).

- [ ] **Step 1: Add the routes in `App.tsx`**

Find:

```tsx
import Auditoria from './pages/Auditoria'
```

Add right after it:

```tsx
import Insumos from './pages/Insumos'
import Estoque from './pages/Estoque'
```

Find:

```tsx
      <Route path="/auditoria" element={<RotaDono><Auditoria /></RotaDono>} />
```

Add right after it:

```tsx
      <Route path="/insumos" element={<RotaPermissao permissao="estoque"><Insumos /></RotaPermissao>} />
      <Route path="/estoque" element={<RotaPermissao permissao="estoque"><Estoque /></RotaPermissao>} />
```

- [ ] **Step 2: Add the nav links in `Layout.tsx`**

Find:

```tsx
  const mostrarMesas = podeMesas && modulosAtivos.includes('mesas')
  const podeCaixa = isDono || temPermissao('caixa')
  const mostrarCaixa = podeCaixa && modulosAtivos.includes('mesas')
```

Change to:

```tsx
  const mostrarMesas = podeMesas && modulosAtivos.includes('mesas')
  const podeCaixa = isDono || temPermissao('caixa')
  const mostrarCaixa = podeCaixa && modulosAtivos.includes('mesas')
  const podeEstoque = isDono || temPermissao('estoque')
  const mostrarEstoque = podeEstoque && modulosAtivos.includes('estoque_avancado')
```

Find the desktop nav block where `mostrarCaixa` is used to render the "Caixa" `NavLink` (same
shape as the `mostrarMesas`/`podeMesas` blocks nearby) and add right after it:

```tsx
            {mostrarEstoque && (
              <NavLink to="/insumos" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Insumos
                </span>
              </NavLink>
            )}
            {mostrarEstoque && (
              <NavLink to="/estoque" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Estoque
                </span>
              </NavLink>
            )}
```

Add the `Package` and `TrendingUp` icons to the existing lucide-react import at the top of the
file (same import statement already modified by Fase 1f for `ShieldCheck`).

Repeat the identical `mostrarEstoque && (...)` blocks in the mobile nav section, right after
the equivalent `mostrarCaixa` block there.

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

Start both dev servers. Using the Super Admin, enable `estoque_avancado` for the test
establishment (`PATCH /admin/estabelecimentos/:id/modulos`, or via whatever admin UI already
exists for `modulosAtivos`). Log in as DONO:

1. Confirm "Insumos" and "Estoque" appear in the nav (desktop and mobile).
2. Go to `/insumos`, create 2-3 insumos (e.g., Arroz kg, Feijão kg, Picanha kg) with an
   initial stock.
3. Go to `/estoque`, lançar consumo do dia com esses insumos, confirmar que o card de
   "Lucro real do dia" aparece com os três valores calculados.
4. Confirm the entry shows up in "Histórico" below.
5. Go back to `/insumos`, use the "Movimentar estoque" action on one insumo to register a
   `perda` and an `ajuste`, confirm `estoqueAtual` updates correctly in the table.
6. Log in as an OPERADOR without the `estoque` permission: confirm "Insumos"/"Estoque" do
   **not** appear in the nav, and navigating to `/insumos` or `/estoque` directly redirects
   away.
7. As Super Admin, disable `estoque_avancado` for the establishment again: confirm the nav
   links disappear even for a DONO/operator who has the `estoque` permission (module check is
   independent of permission check, same as `mesas`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: rota e navegação das telas de estoque avançado"
```

---

## End-to-End Verification (after all tasks)

1. Com o módulo `estoque_avancado` habilitado e a permissão `estoque` concedida a um
   operador: cadastrar 3 insumos em `/insumos`, cada um com estoque inicial diferente.
2. Em `/estoque`, lançar consumo do dia de hoje pra 2 dos 3 insumos. Confirmar que o relatório
   de lucro aparece e que os valores batem manualmente (faturamento do dia − custo dos dois
   insumos lançados × seus custos unitários).
3. Criar um pedido de balcão e confirmar seu pagamento (ou registrar um Pagamento confirmado
   numa Conta de mesa, se o módulo `mesas` também estiver ativo) — voltar em `/estoque`,
   clicar "Ver lucro desse dia" de novo, confirmar que o faturamento aumentou pelo valor
   correto.
4. Tentar excluir um insumo que já tem movimentação — confirmar bloqueio com a mensagem
   correta.
5. Registrar uma perda e um ajuste negativo no terceiro insumo (o que não entrou no consumo
   diário) e confirmar que `estoqueAtual` reflete as duas movimentações corretamente.
6. Desabilitar o módulo `estoque_avancado` pro estabelecimento (via Super Admin) e confirmar
   que as rotas `/insumos`/`/estoque` somem do menu e que uma chamada direta à API
   (`GET /insumos`) retorna `403`.
7. Confirmar zero regressão no resto do app — rodar `npm test` (backend) e navegar pelas
   telas de Mesas/Caixa/Cozinha/Dashboard já existentes, já que esta fase não altera nenhum
   arquivo fora dos listados em "File Structure".
