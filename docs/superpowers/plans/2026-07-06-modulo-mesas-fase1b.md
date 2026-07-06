# Módulo de Mesas — Fase 1b: Backend de Mesas/Contas/Comandas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as rotas de backend que permitem abrir uma mesa, lançar pedidos em comandas,
transferir itens entre comandas e acompanhar o status de produção de cada item — sem nenhuma tela
nova ainda (isso é a Fase 1c). Ao final, o fluxo inteiro é operável via API.

**Architecture:** A Fase 1a (já em produção) criou o schema completo (Mesa, Setor, Conta, Comanda,
ItemComanda, `Estabelecimento.modulosAtivos`). Esta fase constrói as rotas Fastify por cima desse
schema, seguindo exatamente o padrão já usado em `src/routes/bairros.ts` (CRUD simples) e
`src/routes/pedidos.ts` (recurso com sub-recursos e máquina de estado). Ver
`docs/superpowers/specs/2026-07-04-modulo-mesas-design.md` para a análise completa de negócio por
trás de cada decisão aqui.

**Tech Stack:** Node 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL + Socket.IO. Vitest (já
configurado na Fase 1a) para a lógica de permissão/máquina de estado — CRUD simples continua
verificado manualmente via curl, mesma convenção da Fase 1a.

## Global Constraints

- TypeScript strict, sem `any` implícito, sem `@ts-ignore`.
- Sem `console.log` — `console.error` em catch é o padrão já usado no projeto.
- `estabelecimentoId` sempre isolando por tenant. `Comanda` e `ItemComanda` **não têm**
  `estabelecimentoId` direto (decisão da Fase 1a, mesmo padrão de `ItemPedido`/`Pedido`) — toda
  query nessas duas tabelas precisa filtrar via relação aninhada até `Conta.estabelecimentoId`
  (ex: `where: { comanda: { conta: { estabelecimentoId } } }`), nunca confiar só no `id` do recurso.
- Arquivos completos nas edições — nunca entregar trecho parcial.
- Rotas do módulo de mesas (`/mesas`, `/contas`, `/comandas/*`, `/itens-comanda/*`) exigem a
  permissão `mesas` **e** o módulo `"mesas"` habilitado em `Estabelecimento.modulosAtivos` — as duas
  checagens são independentes e ambas obrigatórias (permissão é sobre o usuário, módulo é sobre o
  plano contratado pelo estabelecimento). `Setor` é recurso base e **não exige** o módulo de mesas
  (decisão da spec: setor é útil até pra quem só faz delivery).

---

### Task 1: Middleware `moduloAtivo` — checagem server-side do módulo contratado

A Fase 1a construiu o toggle de módulos no Super Admin, mas nenhuma rota de negócio ainda verifica
isso — hoje `Estabelecimento.modulosAtivos` só é lido pelo próprio painel admin. Sem essa checagem,
o toggle é só cosmético: qualquer operador com a permissão `mesas` poderia chamar a API de mesas
mesmo se o estabelecimento nunca contratou o módulo. Este middleware fecha essa lacuna, e é a base
que toda rota das Tasks 4-9 vai usar.

**Diferença importante em relação a `temPermissao`:** `temPermissao` libera o DONO automaticamente,
porque é uma checagem sobre o que aquele usuário pode fazer dentro do que o estabelecimento já tem.
`moduloAtivo` **não libera o DONO automaticamente** — é uma checagem sobre o que o estabelecimento
contratou, e nem o dono de um estabelecimento só-delivery deveria conseguir usar rotas de mesas.

**Files:**
- Modify: `src/plugins/auth.ts` (adiciona `import { prisma } from '../database.js';` e a função
  `moduloAtivo`)
- Modify: `src/plugins/auth.test.ts` (adiciona os testes abaixo aos que já existem da Fase 1a — não
  apagar os testes de `temPermissao` já existentes)

**Interfaces:**
- Consumes: `request.user.estabelecimentoId` (já existe no payload do JWT)
- Produces: `moduloAtivo(...modulos: string[]) => (request, reply) => Promise<void>` — mesma forma
  de uso que `temPermissao`, ex: `onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')]`.
  Usado pelas Tasks 4, 5, 6, 7, 8, 9.

- [ ] **Step 1: Escrever os testes (falhando — `moduloAtivo` ainda não existe)**

No topo de `src/plugins/auth.test.ts`, adicionar o mock do Prisma e o import, antes do `describe`
de `temPermissao` já existente:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { temPermissao, moduloAtivo } from './auth.js';

vi.mock('../database.js', () => ({
  prisma: {
    estabelecimento: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../database.js';
```

(Remova o `import { temPermissao } from './auth.js';` antigo — ele foi substituído pela linha acima
que importa os dois.)

No final do arquivo, depois do `describe('temPermissao', ...)` já existente, adicionar:

```typescript
describe('moduloAtivo', () => {
  it('libera quando o estabelecimento tem o módulo ativo', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: ['mesas'] } as any);
    const middleware = moduloAtivo('mesas');
    const request = criarRequestFake('OPERADOR', ['mesas']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('bloqueia com 403 quando o módulo não está ativo', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: [] } as any);
    const middleware = moduloAtivo('mesas');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ erro: 'Módulo não habilitado para este estabelecimento' });
  });

  it('NÃO libera o DONO automaticamente — módulo é sobre o estabelecimento, não sobre o papel do usuário', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: [] } as any);
    const middleware = moduloAtivo('mesas');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('libera quando o estabelecimento tem QUALQUER um dos módulos informados', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: ['estoque_avancado'] } as any);
    const middleware = moduloAtivo('mesas', 'estoque_avancado');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/plugins/auth.test.ts`
Expected: FAIL — `moduloAtivo` não está exportado de `./auth.js`.

- [ ] **Step 3: Implementar `moduloAtivo`**

Em `src/plugins/auth.ts`, adicionar o import no topo do arquivo (junto dos imports existentes):

```typescript
import { prisma } from '../database.js';
```

E no final do arquivo, depois da função `temPermissao` já existente, adicionar:

```typescript
/**
 * Garante que o estabelecimento do usuário autenticado tem pelo menos um dos
 * módulos informados habilitado em `modulosAtivos`. Ao contrário de
 * `temPermissao`, NÃO libera o DONO automaticamente — módulo é sobre o plano
 * contratado pelo estabelecimento, não sobre o papel do usuário dentro dele.
 * Deve ser usado APÓS o hook autenticar.
 */
export function moduloAtivo(...modulos: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const { estabelecimentoId } = request.user;
    if (!estabelecimentoId) {
      return reply.status(403).send({ erro: 'Acesso negado' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where:  { id: estabelecimentoId },
      select: { modulosAtivos: true },
    });

    if (!estabelecimento || !modulos.some((m) => estabelecimento.modulosAtivos.includes(m))) {
      return reply.status(403).send({ erro: 'Módulo não habilitado para este estabelecimento' });
    }
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/plugins/auth.test.ts`
Expected: `8 passed` (4 de `temPermissao` já existentes + 4 novos de `moduloAtivo`).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/auth.ts src/plugins/auth.test.ts
git commit -m "feat: middleware moduloAtivo para checagem server-side de módulo contratado"
```

---

### Task 2: Máquina de estado de produção do item (`StatusProducao`)

Lógica pura, sem I/O — a peça mais crítica de regra de negócio desta fase (é o que decide se um
item pode avançar de status ou ser cancelado). Extraída em arquivo próprio pra ser testável
isoladamente, e reaproveitada pela rota da Task 8.

**Files:**
- Create: `src/utils/statusProducao.ts`
- Create: `src/utils/statusProducao.test.ts`

**Interfaces:**
- Produces: `transicaoProducaoValida(de: StatusProducao, para: StatusProducao): boolean` e
  `podeCancelarLivremente(status: StatusProducao): boolean` — consumidos pela Task 8
  (`PATCH /itens-comanda/:id/status`).

- [ ] **Step 1: Escrever os testes (falhando — o arquivo ainda não existe)**

Create `src/utils/statusProducao.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { transicaoProducaoValida, podeCancelarLivremente } from './statusProducao.js';

describe('transicaoProducaoValida', () => {
  it('permite recebido -> em_preparo', () => {
    expect(transicaoProducaoValida('recebido', 'em_preparo')).toBe(true);
  });

  it('permite em_preparo -> pronto', () => {
    expect(transicaoProducaoValida('em_preparo', 'pronto')).toBe(true);
  });

  it('permite pronto -> entregue', () => {
    expect(transicaoProducaoValida('pronto', 'entregue')).toBe(true);
  });

  it('não permite pular de recebido direto pra pronto', () => {
    expect(transicaoProducaoValida('recebido', 'pronto')).toBe(false);
  });

  it('permite cancelar a partir de qualquer status ativo', () => {
    expect(transicaoProducaoValida('recebido', 'cancelado')).toBe(true);
    expect(transicaoProducaoValida('em_preparo', 'cancelado')).toBe(true);
    expect(transicaoProducaoValida('pronto', 'cancelado')).toBe(true);
    expect(transicaoProducaoValida('entregue', 'cancelado')).toBe(true);
  });

  it('não permite nenhuma transição a partir de entregue além de cancelado', () => {
    expect(transicaoProducaoValida('entregue', 'em_preparo')).toBe(false);
    expect(transicaoProducaoValida('entregue', 'recebido')).toBe(false);
  });

  it('não permite nenhuma transição a partir de cancelado', () => {
    expect(transicaoProducaoValida('cancelado', 'recebido')).toBe(false);
  });
});

describe('podeCancelarLivremente', () => {
  it('permite cancelamento livre em recebido e em_preparo', () => {
    expect(podeCancelarLivremente('recebido')).toBe(true);
    expect(podeCancelarLivremente('em_preparo')).toBe(true);
  });

  it('bloqueia cancelamento livre em pronto e entregue (exige senha de supervisor — feature futura)', () => {
    expect(podeCancelarLivremente('pronto')).toBe(false);
    expect(podeCancelarLivremente('entregue')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/utils/statusProducao.test.ts`
Expected: FAIL — o módulo `./statusProducao.js` não existe.

- [ ] **Step 3: Implementar**

Create `src/utils/statusProducao.ts`:

```typescript
import type { StatusProducao } from '../generated/prisma/enums.js';

// Cancelamento é sempre estruturalmente válido a partir de qualquer status ativo — a restrição de
// "precisa de senha de supervisor pra cancelar item pronto/entregue" é uma regra operacional
// (podeCancelarLivremente), não uma regra da máquina de estado em si.
export const transicoesProducaoPermitidas: Record<StatusProducao, StatusProducao[]> = {
  recebido:   ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto:     ['entregue', 'cancelado'],
  entregue:   ['cancelado'],
  cancelado:  [],
};

export function transicaoProducaoValida(de: StatusProducao, para: StatusProducao): boolean {
  return transicoesProducaoPermitidas[de].includes(para);
}

// Cancelamento de item pronto/entregue exige senha de supervisor — feature ainda não construída
// (fica pra quando a Fase 2 da spec adicionar isso). Por enquanto essa função é o gate que bloqueia
// cancelar item já pronto/entregue nesta rota.
export function podeCancelarLivremente(status: StatusProducao): boolean {
  return status === 'recebido' || status === 'em_preparo';
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/utils/statusProducao.test.ts`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/statusProducao.ts src/utils/statusProducao.test.ts
git commit -m "feat: máquina de estado de status de produção do item (StatusProducao)"
```

---

### Task 3: CRUD de Setor

Setor é recurso base — **não exige** o módulo de mesas (útil até pra quem só faz delivery/balcão).
Segue exatamente o padrão de `src/routes/bairros.ts`.

**Files:**
- Create: `src/routes/setores.ts`
- Modify: `src/server.ts` (importa e registra `setoresRoutes`)

**Interfaces:**
- Consumes: `temPermissao` de `src/plugins/auth.ts` (já existe)
- Produces: `GET/POST/PATCH/DELETE /setores` — o campo `setorId` retornado por `POST /setores` é
  consumido manualmente depois via Cardápio (fora do escopo desta fase) e pela Task 7
  (`ItemCardapio.setorId` já existe desde a Fase 1a).

- [ ] **Step 1: Criar as rotas**

Create `src/routes/setores.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';

const CriarSetorSchema = Type.Object({
  nome:             Type.String({ minLength: 1, maxLength: 60 }),
  tempoAlvoMinutos: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
});

const AtualizarSetorSchema = Type.Object({
  nome:             Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  tempoAlvoMinutos: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
});

const SetorParamsSchema = Type.Object({ id: Type.String() });

export async function setoresRoutes(fastify: FastifyInstance) {
  // ── GET /setores ────────────────────────────────────────────────────────────
  fastify.get('/setores', {
    onRequest: [autenticar],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    return prisma.setor.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
    });
  });

  // ── POST /setores ───────────────────────────────────────────────────────────
  fastify.post('/setores', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { body: CriarSetorSchema },
  }, async (request, reply) => {
    const { nome, tempoAlvoMinutos } = request.body as { nome: string; tempoAlvoMinutos?: number | null };
    const { estabelecimentoId } = request.user;

    const existente = await prisma.setor.findUnique({
      where: { estabelecimentoId_nome: { estabelecimentoId: estabelecimentoId!, nome } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe um setor com esse nome' });

    const setor = await prisma.setor.create({
      data: { nome, tempoAlvoMinutos: tempoAlvoMinutos ?? null, estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(setor);
  });

  // ── PATCH /setores/:id ──────────────────────────────────────────────────────
  fastify.patch('/setores/:id', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { params: SetorParamsSchema, body: AtualizarSetorSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { nome?: string; tempoAlvoMinutos?: number | null };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.setor.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Setor não encontrado' });

    return prisma.setor.findUnique({ where: { id } });
  });

  // ── DELETE /setores/:id ─────────────────────────────────────────────────────
  // Bloqueado se algum item do cardápio ainda apontar pra esse setor.
  fastify.delete('/setores/:id', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { params: SetorParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const setor = await prisma.setor.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!setor) return reply.status(404).send({ erro: 'Setor não encontrado' });

    const itensVinculados = await prisma.itemCardapio.count({ where: { setorId: id } });
    if (itensVinculados > 0) {
      return reply.status(422).send({ erro: 'Existem itens do cardápio usando este setor. Mude o setor deles antes de excluir.' });
    }

    await prisma.setor.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Registrar as rotas**

Em `src/server.ts`, adicionar o import junto dos outros (perto de `bairrosRoutes`):

```typescript
import { setoresRoutes } from './routes/setores.js';
```

E o registro, junto de `await fastify.register(bairrosRoutes);`:

```typescript
  await fastify.register(setoresRoutes);
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Com o backend rodando (`npm run dev`) e um token de DONO (login com `carlos@teste.com` /
`outrasenha123` — Pizzaria do Bairro, que já tem o módulo `mesas` habilitado desde a Fase 1a):

```bash
curl -X POST http://localhost:3000/setores \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"nome": "Churrasqueira", "tempoAlvoMinutos": 20}'
```
Expected: `201` com o setor criado. `GET /setores` deve listar "Cozinha" (da Fase 1a) e "Churrasqueira".

- [ ] **Step 5: Commit**

```bash
git add src/routes/setores.ts src/server.ts
git commit -m "feat: CRUD de Setor"
```

---

### Task 4: CRUD de Mesa

Ao contrário de Setor, Mesa **exige** o módulo `mesas` habilitado — cadastrar mesa só faz sentido
pra quem contratou esse módulo. Sem `DELETE` — mesa é desativada via `PATCH .../ativa: false`
(mesmo padrão de `ItemCardapio.disponivel`), evitando complicar com histórico de Contas antigas
apontando pra uma mesa excluída.

**Files:**
- Create: `src/routes/mesas.ts`
- Modify: `src/server.ts` (importa e registra `mesasRoutes`)

**Interfaces:**
- Consumes: `moduloAtivo` (Task 1)
- Produces: `GET/POST/PATCH /mesas` — `GET /mesas` retorna `statusMesa: 'livre' | 'aberta' |
  'aguardando_pagamento'` e `contaAbertaId: string | null` por mesa, calculado a partir da Conta
  aberta mais recente (se houver). A Task 5 (`POST /contas`) consome `Mesa.id`.

- [ ] **Step 1: Criar as rotas**

Create `src/routes/mesas.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';

const CriarMesaSchema = Type.Object({
  numero:     Type.String({ minLength: 1, maxLength: 20 }),
  area:       Type.Optional(Type.Union([Type.String({ maxLength: 60 }), Type.Null()])),
  capacidade: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
});

const AtualizarMesaSchema = Type.Object({
  numero:     Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
  area:       Type.Optional(Type.Union([Type.String({ maxLength: 60 }), Type.Null()])),
  capacidade: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  ativa:      Type.Optional(Type.Boolean()),
});

const MesaParamsSchema = Type.Object({ id: Type.String() });

export async function mesasRoutes(fastify: FastifyInstance) {
  // ── GET /mesas ──────────────────────────────────────────────────────────────
  // Inclui o status calculado a partir da Conta aberta mais recente, se houver.
  fastify.get('/mesas', {
    onRequest: [autenticar, moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const mesas = await prisma.mesa.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, ativa: true },
      orderBy: { numero: 'asc' },
      include: {
        contas: {
          where:  { status: { in: ['aberta', 'aguardando_pagamento'] } },
          select: { id: true, status: true },
        },
      },
    });
    return mesas.map((mesa) => {
      const { contas, ...resto } = mesa;
      return { ...resto, contaAbertaId: contas[0]?.id ?? null, statusMesa: contas[0]?.status ?? 'livre' };
    });
  });

  // ── POST /mesas ─────────────────────────────────────────────────────────────
  fastify.post('/mesas', {
    onRequest: [autenticar, temPermissao('configuracoes'), moduloAtivo('mesas')],
    schema: { body: CriarMesaSchema },
  }, async (request, reply) => {
    const { numero, area, capacidade } = request.body as { numero: string; area?: string | null; capacidade?: number | null };
    const { estabelecimentoId } = request.user;

    const existente = await prisma.mesa.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: estabelecimentoId!, numero } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe uma mesa com esse número' });

    const mesa = await prisma.mesa.create({
      data: { numero, area: area ?? null, capacidade: capacidade ?? null, estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(mesa);
  });

  // ── PATCH /mesas/:id ────────────────────────────────────────────────────────
  fastify.patch('/mesas/:id', {
    onRequest: [autenticar, temPermissao('configuracoes'), moduloAtivo('mesas')],
    schema: { params: MesaParamsSchema, body: AtualizarMesaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { numero?: string; area?: string | null; capacidade?: number | null; ativa?: boolean };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.mesa.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Mesa não encontrada' });

    return prisma.mesa.findUnique({ where: { id } });
  });
}
```

- [ ] **Step 2: Registrar as rotas**

Em `src/server.ts`, adicionar o import:

```typescript
import { mesasRoutes } from './routes/mesas.js';
```

E o registro:

```typescript
  await fastify.register(mesasRoutes);
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Login como DONO da Pizzaria (`carlos@teste.com` / `outrasenha123` — módulo `mesas` já habilitado):

```bash
curl -X POST http://localhost:3000/mesas \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"numero": "07", "area": "Externa", "capacidade": 4}'
```
Expected: `201`. `GET /mesas` deve retornar a mesa com `"statusMesa": "livre"` e `"contaAbertaId": null`.

Testar também que o módulo é exigido: logar como DONO da Galeteria (`vinicius@teste.com` /
`senhaforte123` — módulo `mesas` **não** habilitado) e repetir o `GET /mesas` — deve retornar `403`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/mesas.ts src/server.ts
git commit -m "feat: CRUD de Mesa"
```

---

### Task 5: Conta — abrir mesa, listar, buscar e mudar status

O coração da fase: abrir uma mesa cria a `Conta` e já cria a `Comanda` "Geral" automaticamente
(ninguém precisa perguntar nome de ninguém pra começar a lançar pedido).

**Files:**
- Create: `src/routes/contas.ts`
- Modify: `src/server.ts` (importa e registra `contasRoutes`)

**Interfaces:**
- Consumes: `moduloAtivo`, `temPermissao` (Task 1, já existe); `Mesa` (Task 4)
- Produces: `GET/POST /contas`, `GET /contas/:id`, `PATCH /contas/:id/status`. Evento Socket.IO
  `conta:atualizada` emitido na sala `estabelecimentoId` (mesma sala que já existe hoje — sem sala
  por setor ainda, isso fica pra Fase 1d quando a tela de produção existir de verdade pra consumir
  isso). As Tasks 6, 7, 8, 9 **adicionam rotas dentro do mesmo arquivo** `src/routes/contas.ts`,
  editando o corpo da mesma função `contasRoutes` — não importam nada deste arquivo, só o estendem.
  `serializarConta` é um helper privado (não exportado), igual ao `serializarBairro` em
  `bairros.ts`.

- [ ] **Step 1: Criar as rotas**

Create `src/routes/contas.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import type { StatusConta } from '../generated/prisma/enums.js';

const AbrirContaSchema = Type.Object({
  mesaId: Type.String({ minLength: 1 }),
});

const ContaParamsSchema = Type.Object({ id: Type.String() });

const AtualizarStatusContaSchema = Type.Object({
  status: Type.Union([
    Type.Literal('aberta'),
    Type.Literal('aguardando_pagamento'),
    Type.Literal('cancelada'),
  ]),
});

const transicoesContaPermitidas: Record<StatusConta, StatusConta[]> = {
  aberta:               ['aguardando_pagamento', 'cancelada'],
  aguardando_pagamento: ['aberta'],
  fechada:              [],
  cancelada:            [],
};

interface ItemComandaComPreco {
  precoUnit: unknown;
  [chave: string]: unknown;
}

function serializarItemComanda(item: ItemComandaComPreco) {
  return { ...item, precoUnit: Number(item.precoUnit) };
}

interface ComandaComItens {
  itens?: ItemComandaComPreco[];
  [chave: string]: unknown;
}

interface ContaComComandas {
  comandas?: ComandaComItens[];
  [chave: string]: unknown;
}

function serializarConta(conta: ContaComComandas) {
  return {
    ...conta,
    comandas: conta.comandas?.map((comanda) => ({
      ...comanda,
      itens: comanda.itens?.map(serializarItemComanda),
    })),
  };
}

export async function contasRoutes(fastify: FastifyInstance) {
  // ── GET /contas ─────────────────────────────────────────────────────────────
  // ?status=aberta,aguardando_pagamento,fechada,cancelada — default: só as em andamento.
  fastify.get('/contas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const q = request.query as { status?: string };
    const statusValidos: StatusConta[] = ['aberta', 'aguardando_pagamento', 'fechada', 'cancelada'];
    const status = q.status
      ? q.status.split(',').map((s) => s.trim()).filter((s): s is StatusConta => statusValidos.includes(s as StatusConta))
      : (['aberta', 'aguardando_pagamento'] as StatusConta[]);

    const contas = await prisma.conta.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, status: { in: status } },
      orderBy: { abertaEm: 'desc' },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });
    return contas.map(serializarConta);
  });

  // ── GET /contas/:id ─────────────────────────────────────────────────────────
  fastify.get('/contas/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({
      where:   { id, estabelecimentoId: estabelecimentoId! },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });
    return serializarConta(conta);
  });

  // ── POST /contas ────────────────────────────────────────────────────────────
  // Abre uma mesa: cria a Conta e já cria a Comanda "Geral" automaticamente.
  fastify.post('/contas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { body: AbrirContaSchema },
  }, async (request, reply) => {
    const { mesaId } = request.body as { mesaId: string };
    const { estabelecimentoId } = request.user;

    const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, estabelecimentoId: estabelecimentoId!, ativa: true } });
    if (!mesa) return reply.status(404).send({ erro: 'Mesa não encontrada' });

    const contaAberta = await prisma.conta.findFirst({
      where: { mesaId, status: { in: ['aberta', 'aguardando_pagamento'] } },
    });
    if (contaAberta) return reply.status(409).send({ erro: 'Esta mesa já está ocupada' });

    const conta = await prisma.conta.create({
      data: {
        mesaId,
        estabelecimentoId: estabelecimentoId!,
        comandas: { create: [{ nome: 'Geral' }] },
      },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });

    getIO().to(estabelecimentoId!).emit('conta:atualizada', serializarConta(conta));
    return reply.status(201).send(serializarConta(conta));
  });

  // ── PATCH /contas/:id/status ────────────────────────────────────────────────
  fastify.patch('/contas/:id/status', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: AtualizarStatusContaSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusConta };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });

    if (!transicoesContaPermitidas[conta.status].includes(status)) {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    const atualizada = await prisma.conta.update({
      where:   { id },
      data:    { status, fechadaEm: status === 'cancelada' ? new Date() : null },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });

    getIO().to(estabelecimentoId!).emit('conta:atualizada', serializarConta(atualizada));
    return serializarConta(atualizada);
  });
}
```

- [ ] **Step 2: Registrar as rotas**

Em `src/server.ts`, adicionar o import:

```typescript
import { contasRoutes } from './routes/contas.js';
```

E o registro:

```typescript
  await fastify.register(contasRoutes);
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Login como DONO da Pizzaria. Usando o id da mesa criada na Task 4:

```bash
curl -X POST http://localhost:3000/contas \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"mesaId": "<id-da-mesa>"}'
```
Expected: `201`, resposta com `"status": "aberta"` e `"comandas": [{ "nome": "Geral", "itens": [] }]`.

Repetir a mesma chamada (mesma mesa) — Expected: `409` ("Esta mesa já está ocupada"). `GET /mesas`
agora deve mostrar essa mesa com `"statusMesa": "aberta"` e `"contaAbertaId"` preenchido.

`PATCH /contas/<id>/status` com `{"status": "cancelada"}` — Expected: `200`, `"status": "cancelada"`.
Depois disso, `GET /mesas` deve voltar a mostrar `"statusMesa": "livre"` pra essa mesa.

- [ ] **Step 5: Commit**

```bash
git add src/routes/contas.ts src/server.ts
git commit -m "feat: abrir mesa (Conta + Comanda Geral automática), listar, buscar e mudar status da conta"
```

> **Correção pós-review:** a checagem "mesa já ocupada" (`findFirst` antes do `create`) não tinha
> nenhuma trava no banco atrás dela — `Conta.mesaId` não tinha `@@unique`/índice. Duas requisições
> `POST /contas` na mesma mesa quase simultâneas podiam as duas passar pela checagem antes de
> qualquer uma comitar, criando duas Contas abertas na mesma mesa (corrompendo a invariante central
> desta fase). Corrigido com um índice único parcial no Postgres
> (`CREATE UNIQUE INDEX ... ON contas ("mesaId") WHERE status IN ('aberta', 'aguardando_pagamento')`)
> — a checagem `findFirst` continua existindo (dá o 409 rápido no caso comum), e o índice é a rede de
> segurança pro caso de corrida de verdade, convertendo a violação de constraint em 409 também.

---

### Task 6: Comanda — criar e renomear

Adiciona rotas ao `src/routes/contas.ts` já existente (Comanda é sub-recurso de Conta, mesmo
padrão que `ItemPedido` é sub-recurso de `Pedido` em `src/routes/pedidos.ts`).

**Files:**
- Modify: `src/routes/contas.ts` (adiciona rotas dentro de `contasRoutes`, mesma função)

**Interfaces:**
- Consumes: `serializarConta` não é usado aqui (Comanda sozinha não precisa dessa serialização
  completa, só os itens)
- Produces: `POST /contas/:id/comandas`, `PATCH /comandas/:id` — a Task 7 consome o `id` da comanda
  criada aqui pra adicionar itens.

- [ ] **Step 1: Adicionar os schemas**

Em `src/routes/contas.ts`, logo abaixo de `ContaParamsSchema`, adicionar:

```typescript
const CriarComandaSchema = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 40 }),
});

const AtualizarComandaSchema = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 40 }),
});

const ComandaParamsSchema = Type.Object({ id: Type.String() });
```

- [ ] **Step 2: Adicionar as rotas**

Dentro de `contasRoutes`, logo depois da rota `PATCH /contas/:id/status` (antes do `}` que fecha a
função), adicionar:

```typescript
  // ── POST /contas/:id/comandas ───────────────────────────────────────────────
  // Cria uma nova comanda dentro de uma conta aberta (ex: separar "Luiz" do "Geral").
  fastify.post('/contas/:id/comandas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: CriarComandaSchema },
  }, async (request, reply) => {
    const { id }   = request.params as { id: string };
    const { nome } = request.body as { nome: string };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId!, status: 'aberta' } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada ou não está aberta' });

    const comanda = await prisma.comanda.create({ data: { contaId: id, nome }, include: { itens: true } });
    getIO().to(estabelecimentoId!).emit('comanda:criada', comanda);
    return reply.status(201).send(comanda);
  });

  // ── PATCH /comandas/:id ─────────────────────────────────────────────────────
  fastify.patch('/comandas/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: AtualizarComandaSchema },
  }, async (request, reply) => {
    const { id }   = request.params as { id: string };
    const { nome } = request.body as { nome: string };
    const { estabelecimentoId } = request.user;

    const comanda = await prisma.comanda.findFirst({
      where: { id, conta: { estabelecimentoId: estabelecimentoId! } },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    const atualizada = await prisma.comanda.update({ where: { id }, data: { nome }, include: { itens: true } });
    getIO().to(estabelecimentoId!).emit('comanda:atualizada', atualizada);
    return atualizada;
  });
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Usando o id da conta aberta na Task 5:

```bash
curl -X POST http://localhost:3000/contas/<id-da-conta>/comandas \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"nome": "Luiz"}'
```
Expected: `201`, comanda "Luiz" criada. `GET /contas/<id>` deve mostrar as duas comandas
("Geral" e "Luiz").

`PATCH /comandas/<id-da-comanda-luiz>` com `{"nome": "Luiz Silva"}` — Expected: `200`, nome atualizado.

Testar isolamento: tentar `PATCH /comandas/<id>` usando o token de outro estabelecimento (ex: login
como Galeteria) — Expected: `404` (não `403` — a comanda simplesmente não é "vista" por quem não é
dono dela, mesmo padrão do resto do projeto).

- [ ] **Step 5: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: criar e renomear comanda dentro de uma conta"
```

---

### Task 7: ItemComanda — adicionar item à comanda

O item herda o `setorId` do `ItemCardapio` no momento do pedido (snapshot — se o item mudar de
setor no cardápio depois, pedidos já feitos não mudam de rota retroativamente, exatamente como
`nomeItem`/`precoUnit` já são snapshotados).

**Files:**
- Modify: `src/routes/contas.ts` (adiciona rota dentro de `contasRoutes`)

**Interfaces:**
- Consumes: `ItemCardapio.setorId` (existe desde a Fase 1a)
- Produces: `POST /comandas/:id/itens` — evento Socket.IO `item-comanda:novo`. A Task 8 e 9 operam
  sobre o `ItemComanda.id` retornado aqui.

- [ ] **Step 1: Adicionar o schema**

Em `src/routes/contas.ts`, junto dos outros schemas, adicionar:

```typescript
const AdicionarItemComandaSchema = Type.Object({
  itemCardapioId: Type.String({ minLength: 1 }),
  quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
  observacao:     Type.Optional(Type.String({ maxLength: 300 })),
});
```

- [ ] **Step 2: Adicionar a rota**

Dentro de `contasRoutes`, logo depois da rota `PATCH /comandas/:id`, adicionar:

```typescript
  // ── POST /comandas/:id/itens ────────────────────────────────────────────────
  fastify.post('/comandas/:id/itens', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: AdicionarItemComandaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itemCardapioId, quantidade, observacao } = request.body as {
      itemCardapioId: string; quantidade: number; observacao?: string;
    };
    const { estabelecimentoId, userId } = request.user;

    const comanda = await prisma.comanda.findFirst({
      where: { id, conta: { estabelecimentoId: estabelecimentoId! } },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    const itemCardapio = await prisma.itemCardapio.findFirst({
      where: { id: itemCardapioId, estabelecimentoId: estabelecimentoId!, disponivel: true },
    });
    if (!itemCardapio) return reply.status(400).send({ erro: 'Item não disponível ou não pertence a este estabelecimento' });

    const itemComanda = await prisma.itemComanda.create({
      data: {
        comandaId:          id,
        itemCardapioId:     itemCardapio.id,
        nomeItem:           itemCardapio.nome,
        quantidade,
        precoUnit:          itemCardapio.preco,
        observacao:         observacao ?? null,
        setorId:            itemCardapio.setorId,
        criadoPorUsuarioId: userId,
      },
    });

    const serializado = { ...itemComanda, precoUnit: Number(itemComanda.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializado);
    return reply.status(201).send(serializado);
  });
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Usando o id de uma comanda e o id de um item do cardápio da Pizzaria (`GET /publico/pizzaria-do-bairro`
pra pegar o id, ou consultar `GET /cardapio`):

```bash
curl -X POST http://localhost:3000/comandas/<id-da-comanda>/itens \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"itemCardapioId": "<id-do-item>", "quantidade": 2, "observacao": "sem cebola"}'
```
Expected: `201`, item criado com `"status": "recebido"` e `"setorId"` preenchido (herdado do
`ItemCardapio`, que a Fase 1a já garantiu que aponta pro setor "Cozinha" de cada estabelecimento).
`GET /contas/<id-da-conta>` deve mostrar o item dentro da comanda.

- [ ] **Step 5: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: adicionar item a uma comanda, herdando setor do cardápio"
```

---

### Task 8: ItemComanda — mudar status de produção

Usa a máquina de estado da Task 2. Cancelamento de item pronto/entregue é bloqueado nesta fase
(exige senha de supervisor, que ainda não existe — ver `podeCancelarLivremente`).

**Files:**
- Modify: `src/routes/contas.ts` (adiciona rota dentro de `contasRoutes`)

**Interfaces:**
- Consumes: `transicaoProducaoValida`, `podeCancelarLivremente` de `src/utils/statusProducao.js`
  (Task 2)
- Produces: `PATCH /itens-comanda/:id/status` — evento Socket.IO `item-comanda:atualizado`.

- [ ] **Step 1: Adicionar o import e os schemas**

Em `src/routes/contas.ts`, adicionar o import no topo:

```typescript
import { transicaoProducaoValida, podeCancelarLivremente } from '../utils/statusProducao.js';
import type { StatusConta, StatusProducao } from '../generated/prisma/enums.js';
```

(Isso substitui a linha `import type { StatusConta } from '../generated/prisma/enums.js';` que já
existe — troque pela linha acima, que importa os dois tipos.)

Junto dos outros schemas, adicionar:

```typescript
const ItemComandaParamsSchema = Type.Object({ id: Type.String() });

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

- [ ] **Step 2: Adicionar a rota**

Dentro de `contasRoutes`, logo depois da rota `POST /comandas/:id/itens`, adicionar:

```typescript
  // ── PATCH /itens-comanda/:id/status ─────────────────────────────────────────
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
    return serializado;
  });
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Usando o id do item criado na Task 7:

```bash
curl -X PATCH http://localhost:3000/itens-comanda/<id>/status \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"status": "em_preparo"}'
```
Expected: `200`, `"status": "em_preparo"`.

Tentar pular direto pra `"entregue"` a partir de `"em_preparo"` — Expected: `422` (transição
inválida). Avançar corretamente até `"pronto"`, depois tentar `{"status": "cancelado"}` —
Expected: `422` ("Cancelamento de item pronto/entregue ainda não disponível nesta versão").

- [ ] **Step 5: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: atualizar status de produção do item, com máquina de estado e bloqueio de cancelamento pós-pronto"
```

---

### Task 9: ItemComanda — transferir entre comandas

Corrige o caso "esse item foi lançado errado na comanda do Luiz, era do Vini" — só permite
transferir dentro da mesma Conta (não faz sentido mover item de uma mesa pra outra).

**Files:**
- Modify: `src/routes/contas.ts` (adiciona rota dentro de `contasRoutes`)

**Interfaces:**
- Consumes: nada novo além do que já existe no arquivo
- Produces: `PATCH /itens-comanda/:id/transferir` — evento Socket.IO `item-comanda:atualizado`
  (mesmo evento da Task 8, já que o item mudou).

- [ ] **Step 1: Adicionar o schema**

Em `src/routes/contas.ts`, junto dos outros schemas, adicionar:

```typescript
const TransferirItemComandaSchema = Type.Object({
  comandaId: Type.String({ minLength: 1 }),
});
```

- [ ] **Step 2: Adicionar a rota**

Dentro de `contasRoutes`, logo depois da rota `PATCH /itens-comanda/:id/status`, adicionar:

```typescript
  // ── PATCH /itens-comanda/:id/transferir ─────────────────────────────────────
  // Move o item pra outra comanda da MESMA conta (mesma mesa) — nunca entre mesas diferentes.
  fastify.patch('/itens-comanda/:id/transferir', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ItemComandaParamsSchema, body: TransferirItemComandaSchema },
  }, async (request, reply) => {
    const { id }        = request.params as { id: string };
    const { comandaId } = request.body as { comandaId: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { comanda: true },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    const comandaDestino = await prisma.comanda.findFirst({
      where: { id: comandaId, contaId: item.comanda.contaId },
    });
    if (!comandaDestino) {
      return reply.status(400).send({ erro: 'Comanda de destino não encontrada ou não pertence à mesma conta' });
    }

    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { comandaId } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);
    return serializado;
  });
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Usando o item e as duas comandas ("Geral" e "Luiz") criadas nas tasks anteriores:

```bash
curl -X PATCH http://localhost:3000/itens-comanda/<id-do-item>/transferir \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"comandaId": "<id-da-comanda-luiz>"}'
```
Expected: `200`, `"comandaId"` atualizado. `GET /contas/<id>` deve mostrar o item agora dentro da
comanda "Luiz", não mais na "Geral".

Testar a validação: tentar transferir esse item pra uma comanda de OUTRA conta (abrir uma segunda
mesa, criar uma conta lá, tentar `comandaId` daquela comanda) — Expected: `400` ("Comanda de destino
não encontrada ou não pertence à mesma conta").

- [ ] **Step 5: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: transferir item entre comandas da mesma conta"
```

---

## Verificação final do plano

- [ ] `npx vitest run` — todos os testes passam (13 no total: 8 de `auth.test.ts` + 9 de
      `statusProducao.test.ts` — conferir a soma exata depois de implementado)
- [ ] `npx tsc --noEmit` — sem erros
- [ ] Fluxo completo end-to-end via curl: abrir mesa → criar segunda comanda → adicionar item em
      cada uma → avançar status de um item até "pronto" → transferir um item → tentar cancelar item
      pronto (deve bloquear) → cancelar a conta
- [ ] Confirmar que uma requisição de um estabelecimento sem o módulo `mesas` (Galeteria) recebe
      `403` em qualquer rota de `/mesas`, `/contas`, `/comandas/*`, `/itens-comanda/*`
- [ ] Confirmar que `/setores` continua funcionando normalmente pra Galeteria (não exige o módulo)
