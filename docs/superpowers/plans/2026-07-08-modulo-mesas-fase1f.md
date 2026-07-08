# Fase 1f — Auditoria Básica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining rows of the spec's fraud-prevention table that aren't audited
yet — cancelling an item (freely before "pronto", or with supervisor password after) and
transferring an item between comandas both start writing to `LogAuditoria` — and finally
build "cancelar item pronto/entregue com senha", a feature that has been explicitly blocked
since Fase 1b waiting for exactly the supervisor-password mechanism Fase 1e delivered. Add a
simple DONO-only screen to actually read `LogAuditoria` back.

**Architecture:** No new tables. Two existing routes in `src/routes/contas.ts`
(`PATCH /itens-comanda/:id/status`, `PATCH /itens-comanda/:id/transferir`) get additive
changes: a password gate reusing the same `Estabelecimento.senhaReabrirPedido` mechanism
from Fase 1e, an "already paid" guard that blocks cancelling an item a confirmed payment
already covers, and `LogAuditoria` writes. A new small route file,
`src/routes/auditoria.ts`, adds a single read endpoint gated by the existing `apenasDono`
middleware. On the frontend, both `Mesas.tsx` (garçom) and `Producao.tsx` (cozinha/Kanban)
get a "Cancelar item" action — there is currently no cancel-item UI anywhere in the app, only
a "cancel the whole mesa" button — and a new DONO-only page, `Auditoria.tsx`, lists the log.

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7, PostgreSQL (backend); React 19,
Vite, Tailwind, React Router 7 (frontend). No new dependencies.

## Global Constraints

- Reuse `Estabelecimento.senhaReabrirPedido` (bcrypt) for the "cancelar item pronto/entregue"
  password gate — the exact same mechanism Fase 1e used for desconto/estorno. Do not add a
  new password field. Mirror the 400 (unset)/403 (wrong) pattern from
  `POST /pedidos/:id/reabrir` and Fase 1e's desconto/estorno routes.
- Per the spec's fraud table: cancelling an item **before** "pronto" needs no password but IS
  audited; cancelling **after** "pronto"/"entregue" needs both a password AND a mandatory
  `motivo`. Both paths write to `LogAuditoria` — only the second one requires the password.
- **New guard, not explicitly in the original spec table but required for money integrity**:
  an item already covered by a `PagamentoItem` whose `Pagamento.status` is `confirmado`
  cannot be cancelled at all (before or after "pronto") — reject with 422 telling the caller
  to reverse the payment first. Without this, cancelling a paid item would silently create a
  situation where `saldoDevedor` goes negative because the money was already collected for
  an item that no longer counts toward the total.
- `LogAuditoria` fields: `acao` (exact strings: `'item:cancelado'`, `'item:transferido'`),
  `entidadeTipo: 'ItemComanda'`, `entidadeId` (the item's id), `motivo` (nullable — only
  present for the password-gated cancel path), `dadosAntes`/`dadosDepois` (plain JSON
  objects capturing the relevant before/after state), `estabelecimentoId`, `usuarioId`.
- The new `GET /auditoria` endpoint is gated by the existing `apenasDono` middleware
  (`src/plugins/auth.ts`) — same restriction as `/operadores`. This is deliberately NOT a
  `caixa`/`mesas` permission — audit visibility is owner-level, not operator-level.
  "Auditoria completa" (dashboards, export) is a separate, later phase (Fase 5 of the
  original 5-phase spec) — this endpoint is intentionally simple: filter by date range and
  `acao`, ordered newest-first, capped at 200 rows. No pagination UI, no export.
- Do not change the payload shape of `item-comanda:atualizado` or `producao:item-atualizado`
  — both already fire correctly whenever an `ItemComanda` is updated (including to
  `cancelado`), and `Producao.tsx`'s existing `atualizarItemLocal` already removes an item
  from the Kanban once its status is `cancelado`. This phase adds no new Socket.IO event and
  touches neither `src/socket.ts` nor the emit blocks already in `contas.ts`.
- Cancel-item UI is added to **both** `Mesas.tsx` and `Producao.tsx` (garçom and cozinha each
  get their own trigger), matching the spec's "Qualquer garçom/cozinha" permission for the
  free-cancellation row. Some duplication between the two files' cancel-form code is
  expected and acceptable — this codebase already tolerates the same shape of duplication
  between `useSocket.ts`/`useSocketProducao.ts` from Fase 1d.

---

## File Structure

- **`src/routes/contas.ts`** (modify) — `PATCH /itens-comanda/:id/status`: password-gated
  cancellation logic, already-paid guard, `LogAuditoria` writes for both cancel paths.
  `PATCH /itens-comanda/:id/transferir`: `LogAuditoria` write. New `bcrypt` import.
- **`src/routes/auditoria.ts`** (create) — `GET /auditoria`, DONO-only.
- **`src/server.ts`** (modify) — register `auditoriaRoutes`.
- **`frontend/src/pages/Mesas.tsx`** (modify) — "Cancelar item" button + inline
  confirm/password form next to each item.
- **`frontend/src/pages/Producao.tsx`** (modify) — "Cancelar item" button + inline
  confirm/password form on each Kanban card.
- **`frontend/src/pages/Auditoria.tsx`** (create) — DONO-only list view with date/ação
  filters.
- **`frontend/src/App.tsx`** (modify) — `/auditoria` route, `RotaDono`-gated.
- **`frontend/src/components/Layout.tsx`** (modify) — "Auditoria" nav link, `isDono`-gated
  (desktop + mobile).

---

### Task 1: Cancelamento de item pronto/entregue com senha + guarda de item já pago

**Files:**
- Modify: `src/routes/contas.ts`

**Interfaces:**
- Consumes: `podeCancelarLivremente`, `transicaoProducaoValida` (already imported from
  `../utils/statusProducao.js`), `prisma`, `bcrypt` (new import).
- Produces: `PATCH /itens-comanda/:id/status` now accepts an expanded body
  `{ status: StatusProducao; motivo?: string; senha?: string }`. Behavior consumed by
  Task 4 (Mesas.tsx) and Task 5 (Producao.tsx): the response is unchanged (still the
  serialized item) on success; new failure modes: `422` "Item já foi pago — estorne o
  pagamento antes de cancelar", `400` "Motivo é obrigatório..."/"Senha de supervisor é
  obrigatória...", `400` "Configure a senha de supervisor...", `403` "Senha incorreta".

- [ ] **Step 1: Add the `bcrypt` import**

In `src/routes/contas.ts`, find:

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

- [ ] **Step 2: Expand the status-update body schema**

Find:

```typescript
const AtualizarStatusItemComandaSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});
```

Change to:

```typescript
const AtualizarStatusItemComandaSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
  motivo: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  senha: Type.Optional(Type.String({ minLength: 1 })),
});
```

- [ ] **Step 3: Replace the cancellation gate and add the new checks**

Find:

```typescript
  fastify.patch('/itens-comanda/:id/status', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ItemComandaParamsSchema, body: AtualizarStatusItemComandaSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusProducao };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemComanda.findFirst({
      where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    if (!transicaoProducaoValida(item.status, status)) {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }
    if (status === 'cancelado' && !podeCancelarLivremente(item.status)) {
      return reply.status(422).send({ erro: 'Cancelamento de item pronto/entregue ainda não disponível nesta versão' });
    }

    const timestamps: { prontoEm?: Date; entregueEm?: Date; canceladoEm?: Date } = {};
    if (status === 'pronto')    timestamps.prontoEm    = new Date();
    if (status === 'entregue')  timestamps.entregueEm  = new Date();
    if (status === 'cancelado') timestamps.canceladoEm = new Date();

    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { status, ...timestamps } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);
```

Change to:

```typescript
  fastify.patch('/itens-comanda/:id/status', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ItemComandaParamsSchema, body: AtualizarStatusItemComandaSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status, motivo, senha } = request.body as { status: StatusProducao; motivo?: string; senha?: string };
    const { estabelecimentoId, userId } = request.user;

    const item = await prisma.itemComanda.findFirst({
      where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    if (!transicaoProducaoValida(item.status, status)) {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    if (status === 'cancelado') {
      const pagamentoConfirmado = await prisma.pagamentoItem.findFirst({
        where: { itemComandaId: id, pagamento: { status: 'confirmado' } },
      });
      if (pagamentoConfirmado) {
        return reply.status(422).send({ erro: 'Item já foi pago — estorne o pagamento antes de cancelar' });
      }

      if (!podeCancelarLivremente(item.status)) {
        if (!motivo) return reply.status(400).send({ erro: 'Motivo é obrigatório para cancelar item pronto/entregue' });
        if (!senha) return reply.status(400).send({ erro: 'Senha de supervisor é obrigatória para cancelar item pronto/entregue' });

        const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
        if (!estabelecimento?.senhaReabrirPedido) {
          return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de cancelar itens prontos/entregues' });
        }
        const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
        if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });
      }
    }

    const timestamps: { prontoEm?: Date; entregueEm?: Date; canceladoEm?: Date } = {};
    if (status === 'pronto')    timestamps.prontoEm    = new Date();
    if (status === 'entregue')  timestamps.entregueEm  = new Date();
    if (status === 'cancelado') timestamps.canceladoEm = new Date();

    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { status, ...timestamps } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    if (status === 'cancelado') {
      await prisma.logAuditoria.create({
        data: {
          acao:         'item:cancelado',
          entidadeTipo: 'ItemComanda',
          entidadeId:   id,
          motivo:       motivo ?? null,
          dadosAntes:   { status: item.status },
          dadosDepois:  { status: 'cancelado' },
          estabelecimentoId: estabelecimentoId!,
          usuarioId,
        },
      });
    }
```

Note: everything from `if (atualizado.setorId) { ... }` through the closing `return
serializado; });` of this handler stays exactly as it was — this task does not touch that
part.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (this task doesn't touch any pure function that has
unit tests — it's route-only).

- [ ] **Step 6: Manual verification with curl**

Start the dev server. Using a `mesas`-permission JWT and a real `ItemComanda` id in each
status:

```bash
# Item em 'recebido' — cancelamento livre, sem senha, sem motivo:
curl -s -X PATCH http://localhost:3000/itens-comanda/<ITEM_RECEBIDO_ID>/status \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"status":"cancelado"}' -w "\nHTTP %{http_code}\n"
```
Expected: `200`, `status: "cancelado"`.

```bash
# Item em 'pronto' — sem motivo/senha, deve falhar:
curl -s -X PATCH http://localhost:3000/itens-comanda/<ITEM_PRONTO_ID>/status \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"status":"cancelado"}' -w "\nHTTP %{http_code}\n"
```
Expected: `400 {"erro":"Motivo é obrigatório para cancelar item pronto/entregue"}`.

```bash
# Mesmo item, motivo mas senha errada:
curl -s -X PATCH http://localhost:3000/itens-comanda/<ITEM_PRONTO_ID>/status \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"status":"cancelado","motivo":"queimou","senha":"errada"}' -w "\nHTTP %{http_code}\n"
```
Expected: `403 {"erro":"Senha incorreta"}`.

```bash
# Mesmo item, senha correta:
curl -s -X PATCH http://localhost:3000/itens-comanda/<ITEM_PRONTO_ID>/status \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"status":"cancelado","motivo":"queimou","senha":"<SENHA_CORRETA>"}' -w "\nHTTP %{http_code}\n"
```
Expected: `200`, `status: "cancelado"`. Confirm via a direct DB query (or Prisma Studio)
that a `log_auditoria` row exists with `acao = 'item:cancelado'`, `motivo = 'queimou'`.

```bash
# Item que já tem um Pagamento confirmado cobrindo ele (registrar um pagamento por
# itensComandaIds via POST /contas/:id/pagamentos primeiro, depois tentar cancelar esse item):
curl -s -X PATCH http://localhost:3000/itens-comanda/<ITEM_JA_PAGO_ID>/status \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"status":"cancelado"}' -w "\nHTTP %{http_code}\n"
```
Expected: `422 {"erro":"Item já foi pago — estorne o pagamento antes de cancelar"}`.

- [ ] **Step 7: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: cancelar item pronto/entregue com senha de supervisor + auditoria"
```

---

### Task 2: Auditoria na transferência de item

**Files:**
- Modify: `src/routes/contas.ts`

**Interfaces:**
- Consumes: same as Task 1 (already in the file after Task 1 lands).
- Produces: `PATCH /itens-comanda/:id/transferir` now writes a `LogAuditoria` row on every
  successful transfer. Response shape is unchanged.

- [ ] **Step 1: Add the `LogAuditoria` write after a successful transfer**

Find:

```typescript
    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { comandaId } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    if (atualizado.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: atualizado.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
      }
    }

    return serializado;
  });
}
```

Change to:

```typescript
    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { comandaId } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    await prisma.logAuditoria.create({
      data: {
        acao:         'item:transferido',
        entidadeTipo: 'ItemComanda',
        entidadeId:   id,
        dadosAntes:   { comandaId: item.comanda.id },
        dadosDepois:  { comandaId },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    request.user.userId,
      },
    });

    if (atualizado.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: atualizado.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
      }
    }

    return serializado;
  });
}
```

- [ ] **Step 2: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 3: Manual verification with curl**

```bash
curl -s -X PATCH http://localhost:3000/itens-comanda/<ITEM_ID>/transferir \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"comandaId":"<COMANDA_DESTINO_ID>"}' -w "\nHTTP %{http_code}\n"
```

Expected: `200`. Confirm via DB query a `log_auditoria` row with `acao = 'item:transferido'`,
`dadosAntes.comandaId` equal to the original comanda, `dadosDepois.comandaId` equal to
`<COMANDA_DESTINO_ID>`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: audita transferência de item entre comandas"
```

---

### Task 3: Rota de leitura do log de auditoria (DONO-only)

**Files:**
- Create: `src/routes/auditoria.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `apenasDono` from `../plugins/auth.js` (already exists, used by
  `src/routes/operadores.ts`).
- Produces: `GET /auditoria?de=&ate=&acao=` → `200`, array of
  `{ id, acao, entidadeTipo, entidadeId, motivo, dadosAntes, dadosDepois, criadoEm,
  usuarioNome }`. Consumed by Task 6 (`Auditoria.tsx`).

- [ ] **Step 1: Create `src/routes/auditoria.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';

const ListarAuditoriaQuerySchema = Type.Object({
  de:   Type.Optional(Type.String()),
  ate:  Type.Optional(Type.String()),
  acao: Type.Optional(Type.String()),
});

export async function auditoriaRoutes(fastify: FastifyInstance) {
  // ── GET /auditoria ───────────────────────────────────────────────────────────
  // Lista básica, mais recente primeiro, limitada a 200 linhas — "auditoria completa"
  // (dashboards, exportação) é escopo de uma fase futura separada.
  fastify.get('/auditoria', {
    onRequest: [autenticar, apenasDono],
    schema: { querystring: ListarAuditoriaQuerySchema },
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const { de, ate, acao } = request.query as { de?: string; ate?: string; acao?: string };

    const registros = await prisma.logAuditoria.findMany({
      where: {
        estabelecimentoId: estabelecimentoId!,
        ...(acao ? { acao } : {}),
        ...(de || ate
          ? {
              criadoEm: {
                ...(de ? { gte: new Date(de) } : {}),
                ...(ate ? { lte: new Date(ate) } : {}),
              },
            }
          : {}),
      },
      include: { usuario: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });

    return registros.map((registro) => ({
      id:           registro.id,
      acao:         registro.acao,
      entidadeTipo: registro.entidadeTipo,
      entidadeId:   registro.entidadeId,
      motivo:       registro.motivo,
      dadosAntes:   registro.dadosAntes,
      dadosDepois:  registro.dadosDepois,
      criadoEm:     registro.criadoEm,
      usuarioNome:  registro.usuario?.nome ?? null,
    }));
  });
}
```

- [ ] **Step 2: Register the route in `src/server.ts`**

Find:

```typescript
import { pagamentosRoutes } from './routes/pagamentos.js';
```

Add right after it:

```typescript
import { auditoriaRoutes } from './routes/auditoria.js';
```

Find:

```typescript
  await fastify.register(pagamentosRoutes);
```

Add right after it:

```typescript
  await fastify.register(auditoriaRoutes);
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Manual verification with curl**

```bash
# Com um JWT de OPERADOR (mesmo com todas as permissões) — deve ser bloqueado:
curl -s http://localhost:3000/auditoria -H "Authorization: Bearer <TOKEN_OPERADOR>" -w "\nHTTP %{http_code}\n"
```
Expected: `403`.

```bash
# Com um JWT de DONO:
curl -s http://localhost:3000/auditoria -H "Authorization: Bearer <TOKEN_DONO>" | jq
```
Expected: `200`, array com os registros criados nas Tasks 1 e 2 (e os de desconto/estorno
da Fase 1e, se ainda existirem no banco de teste), cada um com `usuarioNome` preenchido.

```bash
curl -s "http://localhost:3000/auditoria?acao=item:cancelado" -H "Authorization: Bearer <TOKEN_DONO>" | jq
```
Expected: `200`, só os registros com `acao: "item:cancelado"`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/auditoria.ts src/server.ts
git commit -m "feat: rota de leitura do log de auditoria (DONO)"
```

---

### Task 4: Cancelar item em Mesas.tsx

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `PATCH /itens-comanda/:id/status` (Task 1's expanded body).
- Produces: a "Cancelar" button next to each non-cancelled item, opening an inline form
  (motivo always, senha only when the item is `pronto`/`entregue`).

- [ ] **Step 1: Add the `Trash2` icon import**

Find:

```tsx
import { Loader2, Plus, Search, X, ArrowRightLeft } from 'lucide-react'
```

Change to:

```tsx
import { Loader2, Plus, Search, X, ArrowRightLeft, Trash2 } from 'lucide-react'
```

- [ ] **Step 2: Add cancellation state**

Find:

```tsx
  const [transferindoItemId, setTransferindoItemId] = useState<string | null>(null)
  const [cancelandoConta, setCancelandoConta] = useState(false)
```

Change to:

```tsx
  const [transferindoItemId, setTransferindoItemId] = useState<string | null>(null)
  const [cancelandoConta, setCancelandoConta] = useState(false)

  const [itemCancelamento, setItemCancelamento] = useState<ItemComanda | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [senhaCancelamento, setSenhaCancelamento] = useState('')
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)
```

- [ ] **Step 3: Add the cancellation handlers**

Find:

```tsx
  async function cancelarConta() {
```

Add right before it:

```tsx
  function podeCancelarLivre(status: StatusProducao): boolean {
    return status === 'recebido' || status === 'em_preparo'
  }

  function abrirCancelamentoItem(item: ItemComanda) {
    setItemCancelamento(item)
    setMotivoCancelamento('')
    setSenhaCancelamento('')
    setErroCancelamento(null)
  }

  async function confirmarCancelamentoItem() {
    if (!itemCancelamento) return
    const precisaSenha = !podeCancelarLivre(itemCancelamento.status)
    if (precisaSenha && (!motivoCancelamento || !senhaCancelamento)) return

    setErroCancelamento(null)
    setEnviandoCancelamento(true)
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${itemCancelamento.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelado',
          ...(motivoCancelamento ? { motivo: motivoCancelamento } : {}),
          ...(precisaSenha ? { senha: senhaCancelamento } : {}),
        }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroCancelamento(data.erro ?? 'Não foi possível cancelar o item'); return }
      await recarregarContaAtual()
      setItemCancelamento(null)
    } catch {
      setErroCancelamento('Falha de conexão')
    } finally {
      setEnviandoCancelamento(false)
    }
  }

```

- [ ] **Step 4: Add the "Cancelar" button next to each item**

Find:

```tsx
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                            {labelStatusItem[item.status]}
                          </span>
                          {contaSelecionada.comandas.length > 1 && (
                            <button
                              onClick={() => setTransferindoItemId(item.id)}
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Transferir pra outra comanda"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
```

Change to:

```tsx
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                            {labelStatusItem[item.status]}
                          </span>
                          {item.status !== 'cancelado' && contaSelecionada.comandas.length > 1 && (
                            <button
                              onClick={() => setTransferindoItemId(item.id)}
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Transferir pra outra comanda"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {item.status !== 'cancelado' && (
                            <button
                              onClick={() => abrirCancelamentoItem(item)}
                              className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                              title="Cancelar item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
```

- [ ] **Step 5: Add the cancellation modal**

Find:

```tsx
      {transferindoItemId && contaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTransferindoItemId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Transferir pra qual comanda?</h3>
            <ul className="space-y-1">
              {contaSelecionada.comandas
                .filter((c) => !c.itens.some((i) => i.id === transferindoItemId))
                .map((comanda) => (
                  <li key={comanda.id}>
                    <button
                      onClick={() => transferirItem(transferindoItemId, comanda.id)}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                    >
                      {comanda.nome}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </Layout>
  )
}
```

Change to:

```tsx
      {transferindoItemId && contaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTransferindoItemId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Transferir pra qual comanda?</h3>
            <ul className="space-y-1">
              {contaSelecionada.comandas
                .filter((c) => !c.itens.some((i) => i.id === transferindoItemId))
                .map((comanda) => (
                  <li key={comanda.id}>
                    <button
                      onClick={() => transferirItem(transferindoItemId, comanda.id)}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                    >
                      {comanda.nome}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {itemCancelamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setItemCancelamento(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Cancelar {itemCancelamento.nomeItem}?</h3>
            {!podeCancelarLivre(itemCancelamento.status) && (
              <p className="mb-3 text-xs text-zinc-400">
                Este item já está {labelStatusItem[itemCancelamento.status].toLowerCase()} — cancelar exige motivo e senha de supervisor.
              </p>
            )}
            <div className="space-y-2">
              <input
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder={podeCancelarLivre(itemCancelamento.status) ? 'Motivo (opcional)' : 'Motivo (obrigatório)'}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {!podeCancelarLivre(itemCancelamento.status) && (
                <input
                  type="password"
                  value={senhaCancelamento}
                  onChange={(e) => setSenhaCancelamento(e.target.value)}
                  placeholder="Senha de supervisor"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroCancelamento && <p className="mt-2 text-sm text-red-400">{erroCancelamento}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmarCancelamentoItem}
                disabled={
                  enviandoCancelamento ||
                  (!podeCancelarLivre(itemCancelamento.status) && (!motivoCancelamento || !senhaCancelamento))
                }
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                Confirmar cancelamento
              </button>
              <button onClick={() => setItemCancelamento(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: cancelar item na tela de Mesas (livre ou com senha)"
```

---

### Task 5: Cancelar item em Producao.tsx

**Files:**
- Modify: `frontend/src/pages/Producao.tsx`

**Interfaces:**
- Consumes: same `PATCH /itens-comanda/:id/status` as Task 4.
- Produces: a "Cancelar" action on each Kanban card, same behavior as Task 4's, adapted to
  this file's card layout (no comanda-level grouping, no modal — inline form directly below
  the "avançar status" button, since a Kanban card is already a self-contained small unit).

- [ ] **Step 1: Add the `X` icon import**

Find:

```tsx
import { Loader2, ChefHat } from 'lucide-react'
```

Change to:

```tsx
import { Loader2, ChefHat, X } from 'lucide-react'
```

- [ ] **Step 2: Add cancellation state and helpers**

Find:

```tsx
  const [avancandoId, setAvancandoId] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
```

Change to:

```tsx
  const [avancandoId, setAvancandoId] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())

  const [itemCancelamento, setItemCancelamento] = useState<ItemProducao | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [senhaCancelamento, setSenhaCancelamento] = useState('')
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)
```

- [ ] **Step 3: Add the cancellation handlers**

Find:

```tsx
  async function avancarStatus(item: ItemProducao) {
```

Add right before it:

```tsx
  function podeCancelarLivre(status: StatusProducao): boolean {
    return status === 'recebido' || status === 'em_preparo'
  }

  function abrirCancelamentoItem(item: ItemProducao) {
    setItemCancelamento(item)
    setMotivoCancelamento('')
    setSenhaCancelamento('')
    setErroCancelamento(null)
  }

  async function confirmarCancelamentoItem() {
    if (!itemCancelamento) return
    const precisaSenha = !podeCancelarLivre(itemCancelamento.status)
    if (precisaSenha && (!motivoCancelamento || !senhaCancelamento)) return

    setErroCancelamento(null)
    setEnviandoCancelamento(true)
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${itemCancelamento.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelado',
          ...(motivoCancelamento ? { motivo: motivoCancelamento } : {}),
          ...(precisaSenha ? { senha: senhaCancelamento } : {}),
        }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroCancelamento(data.erro ?? 'Não foi possível cancelar o item'); return }
      atualizarItemLocal({ ...itemCancelamento, status: data.status })
      setItemCancelamento(null)
    } catch {
      setErroCancelamento('Falha de conexão')
    } finally {
      setEnviandoCancelamento(false)
    }
  }

```

- [ ] **Step 4: Add the "Cancelar" button and inline form to each card**

Find:

```tsx
                          {labelAvancar[item.status] && (
                            <button
                              onClick={() => avancarStatus(item)}
                              disabled={avancandoId === item.id}
                              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                            >
                              {avancandoId === item.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <ChefHat className="h-3.5 w-3.5" />}
                              {labelAvancar[item.status]}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
```

Change to:

```tsx
                          {labelAvancar[item.status] && (
                            <button
                              onClick={() => avancarStatus(item)}
                              disabled={avancandoId === item.id}
                              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                            >
                              {avancandoId === item.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <ChefHat className="h-3.5 w-3.5" />}
                              {labelAvancar[item.status]}
                            </button>
                          )}

                          {itemCancelamento?.id === item.id ? (
                            <div className="mt-2 space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                              <input
                                value={motivoCancelamento}
                                onChange={(e) => setMotivoCancelamento(e.target.value)}
                                placeholder={podeCancelarLivre(item.status) ? 'Motivo (opcional)' : 'Motivo (obrigatório)'}
                                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                              />
                              {!podeCancelarLivre(item.status) && (
                                <input
                                  type="password"
                                  value={senhaCancelamento}
                                  onChange={(e) => setSenhaCancelamento(e.target.value)}
                                  placeholder="Senha de supervisor"
                                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                                />
                              )}
                              {erroCancelamento && <p className="text-xs text-red-400">{erroCancelamento}</p>}
                              <div className="flex gap-1.5">
                                <button
                                  onClick={confirmarCancelamentoItem}
                                  disabled={
                                    enviandoCancelamento ||
                                    (!podeCancelarLivre(item.status) && (!motivoCancelamento || !senhaCancelamento))
                                  }
                                  className="flex-1 rounded bg-red-500 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setItemCancelamento(null)}
                                  className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => abrirCancelamentoItem(item)}
                              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                            >
                              Cancelar item
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Producao.tsx
git commit -m "feat: cancelar item na tela de Produção (livre ou com senha)"
```

---

### Task 6: Tela de Auditoria (DONO-only)

**Files:**
- Create: `frontend/src/pages/Auditoria.tsx`

**Interfaces:**
- Consumes: `GET /auditoria?de=&ate=&acao=` (Task 3).
- Produces: default-exported `Auditoria` component. Consumed by Task 7's route/nav wiring.

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface RegistroAuditoria {
  id: string
  acao: string
  entidadeTipo: string
  entidadeId: string
  motivo: string | null
  dadosAntes: unknown
  dadosDepois: unknown
  criadoEm: string
  usuarioNome: string | null
}

const labelAcao: Record<string, string> = {
  'conta:desconto': 'Desconto aplicado',
  'pagamento:estorno': 'Pagamento estornado',
  'item:cancelado': 'Item cancelado',
  'item:transferido': 'Item transferido',
}

export default function Auditoria() {
  const token = localStorage.getItem('token')

  const [registros, setRegistros] = useState<RegistroAuditoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroAcao, setFiltroAcao] = useState('')
  const [filtroDe, setFiltroDe] = useState('')
  const [filtroAte, setFiltroAte] = useState('')

  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)

  function carregarRegistros() {
    setCarregando(true)
    setErro(null)
    const params = new URLSearchParams()
    if (filtroAcao) params.set('acao', filtroAcao)
    if (filtroDe) params.set('de', filtroDe)
    if (filtroAte) params.set('ate', filtroAte)

    fetch(`${API_URL}/auditoria?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setRegistros)
      .catch(() => setErro('Falha ao carregar auditoria'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregarRegistros()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Layout>
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <ShieldCheck className="h-6 w-6" /> Auditoria
      </h2>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Ação</span>
          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(labelAcao).map(([valor, label]) => (
              <option key={valor} value={valor}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">De</span>
          <input
            type="date"
            value={filtroDe}
            onChange={(e) => setFiltroDe(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Até</span>
          <input
            type="date"
            value={filtroAte}
            onChange={(e) => setFiltroAte(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={carregarRegistros}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Filtrar
        </button>
      </div>

      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}

      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : registros.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum registro encontrado.</p>
      ) : (
        <div className="space-y-2">
          {registros.map((registro) => (
            <div key={registro.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{labelAcao[registro.acao] ?? registro.acao}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {new Date(registro.criadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
                <span className="text-xs text-zinc-400">{registro.usuarioNome ?? 'Desconhecido'}</span>
              </div>
              {registro.motivo && <p className="mt-1 text-sm text-zinc-300">Motivo: {registro.motivo}</p>}
              <button
                onClick={() => setDetalheAberto(detalheAberto === registro.id ? null : registro.id)}
                className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
              >
                {detalheAberto === registro.id ? 'Ocultar detalhes' : 'Ver detalhes'}
              </button>
              {detalheAberto === registro.id && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
                  {JSON.stringify({ dadosAntes: registro.dadosAntes, dadosDepois: registro.dadosDepois }, null, 2)}
                </pre>
              )}
            </div>
          ))}
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
git add frontend/src/pages/Auditoria.tsx
git commit -m "feat: tela de auditoria (DONO)"
```

---

### Task 7: Rota e navegação

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `Auditoria` default export (Task 6).
- Produces: `/auditoria` route reachable from the nav for DONO only.

- [ ] **Step 1: Add the route in `App.tsx`**

Find:

```tsx
import Operadores from './pages/Operadores'
```

Add right after it:

```tsx
import Auditoria from './pages/Auditoria'
```

Find:

```tsx
      <Route path="/operadores" element={<RotaDono><Operadores /></RotaDono>} />
```

Add right after it:

```tsx
      <Route path="/auditoria" element={<RotaDono><Auditoria /></RotaDono>} />
```

- [ ] **Step 2: Add the nav link in `Layout.tsx`**

Find:

```tsx
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList, Wallet } from 'lucide-react'
```

Change to:

```tsx
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList, Wallet, ShieldCheck } from 'lucide-react'
```

Find (desktop nav):

```tsx
            {isDono && (
              <NavLink to="/operadores" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Operadores
                </span>
              </NavLink>
            )}
            {podeHistorico && <NavLink to="/historico" className={linkClass}>Histórico</NavLink>}
```

Change to:

```tsx
            {isDono && (
              <NavLink to="/operadores" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Operadores
                </span>
              </NavLink>
            )}
            {isDono && (
              <NavLink to="/auditoria" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Auditoria
                </span>
              </NavLink>
            )}
            {podeHistorico && <NavLink to="/historico" className={linkClass}>Histórico</NavLink>}
```

Find the equivalent block in the mobile nav (same `isDono && ... /operadores ...` pattern,
further down the file) and add the identical `isDono && (...)` block for `/auditoria` right
after it, in the same shape as the desktop block above.

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

Start both dev servers. Log in as DONO: confirm "Auditoria" appears in the nav, `/auditoria`
loads and lists the entries created during Tasks 1-2's curl verification (and Fase 1e's
desconto/estorno entries, if the test data still exists), filters work. Log in as an
OPERADOR (any permissions): confirm "Auditoria" does NOT appear in the nav, and navigating
to `/auditoria` directly redirects away (via `RotaDono`).

Then, still as an operator with `mesas` permission, exercise the new cancel-item flow
end-to-end in the browser: cancel a `recebido` item freely (no password prompt), advance
another item to `pronto`, try to cancel it (should demand motivo + senha), cancel it
correctly, and confirm it disappears from both the Mesas comanda view and the Produção
Kanban in real time (no page refresh needed — this relies on the pre-existing
`item-comanda:atualizado`/`producao:item-atualizado` socket events, untouched by this
phase).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: rota e navegação da tela de auditoria"
```

---

## End-to-End Verification (after all tasks)

1. Abrir uma mesa, lançar 2 itens. Cancelar um deles enquanto ainda está `recebido` (sem
   senha) — confirmar que some da lista com um badge "Cancelado" e que aparece em
   `/auditoria` como "Item cancelado", sem motivo.
2. Avançar o outro item até `pronto` na tela de Produção. Tentar cancelar sem preencher
   motivo — deve bloquear no frontend antes mesmo de chamar a API. Preencher motivo e uma
   senha errada — deve mostrar "Senha incorreta". Preencher a senha certa — deve cancelar,
   sumir do Kanban, e aparecer em `/auditoria` com o motivo preenchido.
3. Lançar um novo item, registrar um pagamento cobrindo ele via `/caixa` (Fase 1e), depois
   tentar cancelar esse mesmo item pela tela de Mesas — deve bloquear com "Item já foi pago
   — estorne o pagamento antes de cancelar".
4. Transferir um item entre duas comandas e confirmar que aparece em `/auditoria` como "Item
   transferido", com `dadosAntes`/`dadosDepois` mostrando as duas comandas nos detalhes.
5. Repetir o fluxo completo de fechamento de conta da Fase 1e (dividir, descontar, estornar,
   fechar) do início ao fim pra confirmar zero regressão — este plano não toca em nenhum
   código de `src/routes/pagamentos.ts` nem de `Caixa.tsx`.
