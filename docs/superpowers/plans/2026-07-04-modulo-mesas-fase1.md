# Módulo de Mesas — Fase 1a: Fundação de Dados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base de dados e o mecanismo de módulos habilitáveis por estabelecimento que todo o
restante da Fase 1 do módulo de Mesas vai depender — sem expor nenhuma tela nova ao DONO/OPERADOR e
sem mudar nada no comportamento de quem não usa mesas.

**Architecture:** Ver `docs/superpowers/specs/2026-07-04-modulo-mesas-design.md` para a análise
completa. Este plano cobre só a primeira fatia da Fase 1 ali descrita: schema Prisma novo (Mesa, Setor,
Conta, Comanda, ItemComanda, ItemComandaRateio, Pagamento, PagamentoItem, LogAuditoria),
`Estabelecimento.modulosAtivos` (mesmo padrão de `Usuario.permissoes` — `String[]` validado em código),
`ItemCardapio.setorId`, e o toggle de módulos no painel Super Admin. CRUD de Mesa/Setor e as rotas de
Conta/Comanda ficam para o próximo plano (Fase 1b), depois que este estiver implementado e revisado.

**Tech Stack:** Node 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL (backend); React 19 + Vite +
Tailwind (frontend, só o necessário no painel Super Admin); Vitest (introduzido neste plano — o projeto
não tinha nenhuma infraestrutura de teste automatizado até agora).

## Global Constraints

- TypeScript strict, sem `any` implícito, sem `@ts-ignore` (convenção do projeto, `CLAUDE.md`).
- Sem `console.log` — `console.error` em catch é o padrão já usado no projeto.
- `estabelecimentoId` sempre isolando por tenant — todo novo modelo com dado de tenant leva
  `estabelecimentoId` e filtra por ele em toda query (nunca confiar em ID vindo do cliente sozinho).
- Arquivos completos nas edições — nunca entregar trecho parcial.
- Depois de aplicado no ambiente local, toda migration precisa ser rodada em produção via
  `npx prisma migrate deploy` no console do Railway (não faz parte deste plano, é o passo manual de
  deploy já documentado no `CLAUDE.md`).

---

### Task 1: Configurar Vitest e travar o comportamento de `temPermissao`

O projeto nunca teve testes automatizados. Este módulo mexe com dinheiro e permissões sensíveis, então
começamos a introduzir Vitest agora, no ponto mais crítico já existente: o middleware `temPermissao`
(`src/plugins/auth.ts`) é a porta de entrada que toda rota nova de mesas/caixa vai usar para proteger
ações sensíveis. Ele já é genérico (aceita qualquer string de permissão) — não precisa mudar código,
mas precisa de um teste de regressão *antes* de novas permissões (`mesas`, `caixa`) passarem a depender
dele.

**Files:**
- Modify: `package.json` (adiciona `vitest` em devDependencies e script `test`)
- Create: `vitest.config.ts`
- Create: `src/plugins/auth.test.ts`

**Interfaces:**
- Consumes: `temPermissao` exportado de `src/plugins/auth.ts` (já existe, assinatura
  `temPermissao(...permissoes: string[]) => (request, reply) => Promise<void>`)
- Produces: convenção de teste (`describe`/`it` do Vitest, helpers `criarRequestFake`/`criarReplyFake`)
  que as próximas tasks/planos podem reaproveitar para testar outras rotas/middlewares.

- [ ] **Step 1: Instalar Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Adicionar script de teste**

Em `package.json`, dentro de `"scripts"`, adicionar:

```json
"test": "vitest run"
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Escrever o teste (falhando por enquanto não existir o arquivo)**

Create `src/plugins/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { temPermissao } from './auth.js';

function criarRequestFake(role: string, permissoes: string[]) {
  return { user: { role, permissoes } } as unknown as Parameters<ReturnType<typeof temPermissao>>[0];
}

function criarReplyFake() {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as unknown as Parameters<ReturnType<typeof temPermissao>>[1] & {
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

describe('temPermissao', () => {
  it('libera DONO mesmo sem a permissão explícita na lista', async () => {
    const middleware = temPermissao('mesas');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('libera OPERADOR que tem a permissão "mesas"', async () => {
    const middleware = temPermissao('mesas');
    const request = criarRequestFake('OPERADOR', ['mesas']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('bloqueia OPERADOR sem a permissão "caixa" com 403', async () => {
    const middleware = temPermissao('caixa');
    const request = criarRequestFake('OPERADOR', ['mesas']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      erro: 'Você não tem permissão para acessar este recurso',
    });
  });

  it('libera OPERADOR que tem QUALQUER uma das permissões informadas', async () => {
    const middleware = temPermissao('mesas', 'caixa');
    const request = criarRequestFake('OPERADOR', ['caixa']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/plugins/auth.test.ts`
Expected: `4 passed` (o código de `temPermissao` já existe e já é genérico — este teste documenta e
trava o comportamento, não implementa nada novo).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/plugins/auth.test.ts
git commit -m "test: configura Vitest e trava comportamento de temPermissao"
```

---

### Task 2: Estender a lista de permissões válidas no backend (`mesas`, `caixa`)

Só o backend por agora — a UI de Operadores (`frontend/src/pages/Operadores.tsx`) mapeia
`TODAS_PERMISSOES` dinamicamente, então adicionar essas duas ao checkbox do DONO só faz sentido quando
existir uma tela real que dependa delas (a tela do garçom vem no próximo plano, a tela de caixa mais
adiante) — do contrário o DONO veria um checkbox "Mesas" sem nenhuma tela "Mesas" para ativar, o que é
confuso. O backend precisa da lista estendida agora porque a rota
`PATCH /estabelecimentos/operadores/:id/permissoes` rejeita qualquer permissão fora da lista — sem
isso, nenhum plano futuro conseguiria conceder essas permissões a um operador quando a hora chegar.

**Files:**
- Modify: `src/routes/operadores.ts:7`

**Interfaces:**
- Consumes: nada novo
- Produces: `'mesas'` e `'caixa'` agora são valores aceitos pelo body de
  `PATCH /estabelecimentos/operadores/:id/permissoes` e por qualquer `temPermissao('mesas' | 'caixa')`
  usado em rotas futuras.

- [ ] **Step 1: Editar a lista**

Em `src/routes/operadores.ts:7`, trocar:

```typescript
const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes'] as const;
```

por:

```typescript
const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes', 'mesas', 'caixa'] as const;
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros (o TypeBox schema em `operadores.ts` deriva do array automaticamente via
`.map((p) => Type.Literal(p))`, não precisa de outra mudança).

- [ ] **Step 3: Commit**

```bash
git add src/routes/operadores.ts
git commit -m "feat: adiciona permissões mesas e caixa à lista válida do backend"
```

---

### Task 3: Schema Prisma — novos enums, modelos e campos

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: modelos `Mesa`, `Setor`, `Conta`, `Comanda`, `ItemComanda`, `ItemComandaRateio`,
  `Pagamento`, `PagamentoItem`, `LogAuditoria`; enums `StatusConta`, `StatusProducao`,
  `StatusPagamento`; campo `Estabelecimento.modulosAtivos: string[]`; campo
  `ItemCardapio.setorId: string | null`. Todos os planos seguintes (Fase 1b em diante) e a Task 4 deste
  plano dependem exatamente desses nomes.

- [ ] **Step 1: Adicionar os novos enums**

Em `prisma/schema.prisma`, logo depois do enum `OrigemPedido` (linha 65), adicionar:

```prisma
enum StatusConta {
  aberta
  aguardando_pagamento
  fechada
  cancelada
}

enum StatusProducao {
  recebido
  em_preparo
  pronto
  entregue
  cancelado
}

enum StatusPagamento {
  pendente
  confirmado
  recusado
  estornado
}
```

- [ ] **Step 2: Adicionar `modulosAtivos` em `Estabelecimento`**

No model `Estabelecimento`, logo abaixo do campo `senhaReabrirPedido` existente, adicionar:

```prisma
  modulosAtivos    String[]              @default([])
```

E, na lista de relations do mesmo model (junto de `whatsappSession`), adicionar:

```prisma
  mesas            Mesa[]
  setores          Setor[]
  contas           Conta[]
  logsAuditoria    LogAuditoria[]
```

- [ ] **Step 3: Adicionar `setorId` em `ItemCardapio`**

No model `ItemCardapio`, logo abaixo do campo `categoriaId`/`categoria` existente, adicionar:

```prisma
  setorId    String?
  setor      Setor?     @relation(fields: [setorId], references: [id])
```

- [ ] **Step 4: Adicionar relations novas em `Usuario`**

No model `Usuario`, junto de `pushSubscriptions`, adicionar:

```prisma
  itensComandaCriados ItemComanda[]
  pagamentosRegistrados Pagamento[]
  logsAuditoria         LogAuditoria[]
```

- [ ] **Step 5: Adicionar os modelos novos**

No final de `prisma/schema.prisma`, depois do model `Mensagem`, adicionar:

```prisma
// ============================================================================
// MÓDULO DE MESAS (Fase 1)
// ============================================================================

model Mesa {
  id         String   @id @default(uuid())
  numero     String
  area       String?
  capacidade Int?
  ativa      Boolean  @default(true)
  criadoEm   DateTime @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  contas Conta[]

  @@unique([estabelecimentoId, numero])
  @@map("mesas")
}

model Setor {
  id               String   @id @default(uuid())
  nome             String
  tempoAlvoMinutos Int?
  criadoEm         DateTime @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  itensCardapio ItemCardapio[]
  itensComanda  ItemComanda[]

  @@unique([estabelecimentoId, nome])
  @@map("setores")
}

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

model Comanda {
  id       String   @id @default(uuid())
  nome     String   @default("Geral")
  criadaEm DateTime @default(now())

  contaId String
  conta   Conta  @relation(fields: [contaId], references: [id], onDelete: Cascade)

  itens   ItemComanda[]
  rateios ItemComandaRateio[]

  @@map("comandas")
}

model ItemComanda {
  id          String         @id @default(uuid())
  nomeItem    String
  quantidade  Int
  precoUnit   Decimal        @db.Decimal(10, 2)
  observacao  String?
  status      StatusProducao @default(recebido)
  recebidoEm  DateTime       @default(now())
  prontoEm    DateTime?
  entregueEm  DateTime?
  canceladoEm DateTime?

  comandaId String
  comanda   Comanda @relation(fields: [comandaId], references: [id], onDelete: Cascade)

  itemCardapioId String?
  itemCardapio   ItemCardapio? @relation(fields: [itemCardapioId], references: [id])

  setorId String?
  setor   Setor?  @relation(fields: [setorId], references: [id])

  criadoPorUsuarioId String?
  criadoPor          Usuario? @relation(fields: [criadoPorUsuarioId], references: [id])

  rateios        ItemComandaRateio[]
  pagamentoItens PagamentoItem[]

  @@map("itens_comanda")
}

model ItemComandaRateio {
  id     String  @id @default(uuid())
  fracao Decimal @db.Decimal(4, 3)

  itemComandaId String
  itemComanda   ItemComanda @relation(fields: [itemComandaId], references: [id], onDelete: Cascade)

  comandaId String
  comanda   Comanda @relation(fields: [comandaId], references: [id], onDelete: Cascade)

  @@unique([itemComandaId, comandaId])
  @@map("itens_comanda_rateio")
}

model Pagamento {
  id             String          @id @default(uuid())
  valor          Decimal         @db.Decimal(10, 2)
  formaPagamento FormaPagamento
  status         StatusPagamento @default(confirmado)
  criadoEm       DateTime        @default(now())

  contaId String
  conta   Conta  @relation(fields: [contaId], references: [id], onDelete: Cascade)

  usuarioId String?
  usuario   Usuario? @relation(fields: [usuarioId], references: [id])

  itens PagamentoItem[]

  @@map("pagamentos")
}

model PagamentoItem {
  id           String  @id @default(uuid())
  valorCoberto Decimal @db.Decimal(10, 2)

  pagamentoId String
  pagamento   Pagamento @relation(fields: [pagamentoId], references: [id], onDelete: Cascade)

  itemComandaId String
  itemComanda   ItemComanda @relation(fields: [itemComandaId], references: [id])

  @@map("pagamento_itens")
}

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

- [ ] **Step 6: Verificar que o schema é válido**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: schema Prisma do módulo de mesas (Mesa, Conta, Comanda, Setor, Pagamento, LogAuditoria)"
```

---

### Task 4: Migration com backfill de setor padrão

Cada estabelecimento existente precisa ganhar um Setor "Cozinha" automaticamente, e todo
`ItemCardapio` já cadastrado precisa apontar pra ele — sem isso, a Fase 1b (que lê `setorId` para
rotear pedidos) trataria todo item existente como "sem setor". Isso é feito como SQL de dados dentro da
própria migration (não um script à parte), porque o deploy em produção já roda
`npx prisma migrate deploy` — colocar o backfill fora da migration significa alguém ter que lembrar de
rodar mais um passo manual no Railway, o que é fácil de esquecer.

**Files:**
- Create: `prisma/migrations/<timestamp>_modulo_mesas_fundacao/migration.sql` (gerado, depois editado)

**Interfaces:**
- Consumes: schema definido na Task 3
- Produces: banco de dados com as tabelas novas + todo `Estabelecimento` existente com exatamente 1
  `Setor` chamado "Cozinha" + todo `ItemCardapio` existente com `setorId` apontando pra esse setor.

- [ ] **Step 1: Gerar a migration sem aplicar**

Run: `npx prisma migrate dev --name modulo_mesas_fundacao --create-only`
Expected: cria `prisma/migrations/<timestamp>_modulo_mesas_fundacao/migration.sql` com o DDL das
tabelas/colunas novas, sem tocar no banco ainda.

- [ ] **Step 2: Adicionar o backfill no final do arquivo gerado**

No final do `migration.sql` gerado (depois de todo o DDL de `CREATE TABLE`/`ALTER TABLE`), adicionar:

```sql
-- Cria um setor "Cozinha" padrão para cada estabelecimento já existente
INSERT INTO "setores" ("id", "nome", "estabelecimentoId", "criadoEm")
SELECT gen_random_uuid(), 'Cozinha', "id", now()
FROM "estabelecimentos";

-- Aponta todo item de cardápio existente para o setor "Cozinha" do seu estabelecimento
UPDATE "itens_cardapio" ic
SET "setorId" = s."id"
FROM "setores" s
WHERE s."estabelecimentoId" = ic."estabelecimentoId"
  AND s."nome" = 'Cozinha'
  AND ic."setorId" IS NULL;
```

- [ ] **Step 3: Aplicar a migration**

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema.` — e o Prisma Client é regenerado.

- [ ] **Step 4: Conferir o backfill manualmente**

Run: `npx prisma studio` (ou uma query direta) e verificar:
- Cada estabelecimento (`Galeteria do Vinícius`, `Pizzaria do Bairro`, `Hamburgueria do João`) tem
  exatamente 1 registro em `Setor` chamado "Cozinha".
- Todo `ItemCardapio` existente tem `setorId` preenchido (não nulo), apontando pro setor do seu
  próprio estabelecimento.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat: migration do módulo de mesas com backfill de setor padrão"
```

---

### Task 5: Endpoint Super Admin para ligar/desligar módulos

**Files:**
- Modify: `src/routes/admin.ts`

**Interfaces:**
- Consumes: `Estabelecimento.modulosAtivos` (Task 3)
- Produces: `PATCH /admin/estabelecimentos/:id/modulos` (body `{ modulos: string[] }`, retorna
  `{ id, modulosAtivos }`); `GET /admin/estabelecimentos` agora inclui `modulosAtivos` em cada item.
  A Task 6 (frontend) depende desses dois contratos exatamente como estão aqui.

- [ ] **Step 1: Adicionar a lista de módulos válidos e o schema de validação**

Em `src/routes/admin.ts`, logo abaixo de `CriarEstabelecimentoSchema` (linha ~26), adicionar:

```typescript
const MODULOS_VALIDOS = ['mesas', 'estoque_avancado'] as const;

const AtualizarModulosSchema = Type.Object({
  modulos: Type.Array(
    Type.Union(MODULOS_VALIDOS.map((m) => Type.Literal(m)) as [ReturnType<typeof Type.Literal>])
  ),
});
```

- [ ] **Step 2: Incluir `modulosAtivos` no tipo e na resposta de `GET /admin/estabelecimentos`**

Em `type EstabelecimentoComCount` (linha ~29), adicionar o campo:

```typescript
type EstabelecimentoComCount = {
  id: string;
  nome: string;
  slug: string;
  telefone: string;
  status: string;
  modulosAtivos: string[];
  criadoEm: Date;
  _count: { usuarios: number; pedidos: number; itens: number };
};
```

No `return estabelecimentos.map(...)` de `GET /admin/estabelecimentos` (linha ~121), adicionar
`modulosAtivos: e.modulosAtivos,` junto dos outros campos mapeados.

- [ ] **Step 3: Adicionar a rota `PATCH /admin/estabelecimentos/:id/modulos`**

Logo depois da rota `PATCH /admin/estabelecimentos/:id/status` existente, adicionar:

```typescript
  // ── PATCH /admin/estabelecimentos/:id/modulos ────────────────────────────
  // Liga/desliga módulos pagos (mesas, estoque avançado) por estabelecimento.
  // TypeBox valida e rejeita módulo desconhecido com 400.
  fastify.patch('/admin/estabelecimentos/:id/modulos', {
    schema: {
      params: AdminParamsSchema,
      body:   AtualizarModulosSchema,
    },
  }, async (request, reply) => {
    const { id }      = request.params as { id: string };
    const { modulos } = request.body as { modulos: string[] };

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id } });
    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const atualizado = await prisma.estabelecimento.update({
      where: { id },
      data:  { modulosAtivos: modulos },
    });

    return { id: atualizado.id, modulosAtivos: atualizado.modulosAtivos };
  });
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Testar manualmente**

Com o backend rodando (`npm run dev`) e um token de SUPER_ADMIN (login com
`admin@comanda-ia.dev` / `superadmin123`):

Run:
```bash
curl -X PATCH http://localhost:3000/admin/estabelecimentos/<id-da-pizzaria>/modulos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"modulos": ["mesas"]}'
```
Expected: `{"id":"<id-da-pizzaria>","modulosAtivos":["mesas"]}` — e `GET /admin/estabelecimentos`
reflete isso na lista.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin.ts
git commit -m "feat: endpoint Super Admin para ligar/desligar módulos por estabelecimento"
```

---

### Task 6: UI de módulos no painel Super Admin

**Files:**
- Modify: `frontend/src/pages/admin/AdminEstabelecimentos.tsx`

**Interfaces:**
- Consumes: `PATCH /admin/estabelecimentos/:id/modulos` e `modulosAtivos` em
  `GET /admin/estabelecimentos` (Task 5)
- Produces: nenhuma interface nova para outras tasks — esta é a ponta final da cadeia neste plano.

- [ ] **Step 1: Adicionar `modulosAtivos` na interface e a lista de módulos disponíveis**

Em `frontend/src/pages/admin/AdminEstabelecimentos.tsx`, na interface `Estabelecimento` (linha ~7),
adicionar o campo:

```typescript
interface Estabelecimento {
  id: string
  nome: string
  slug: string
  telefone: string
  status: 'pendente' | 'ativo' | 'suspenso'
  modulosAtivos: string[]
  criadoEm: string
  totalUsuarios: number
  totalPedidos: number
  totalItens: number
}
```

Logo abaixo da constante `badgeStatus` (linha ~41), adicionar:

```typescript
const MODULOS_DISPONIVEIS: { id: string; label: string }[] = [
  { id: 'mesas', label: 'Mesas' },
  { id: 'estoque_avancado', label: 'Estoque avançado' },
]
```

- [ ] **Step 2: Adicionar a função `alternarModulo`**

Dentro do componente `AdminEstabelecimentos`, logo depois da função `mudarStatus` existente
(linha ~90), adicionar:

```typescript
  async function alternarModulo(id: string, moduloId: string, ativo: boolean) {
    const estabelecimento = lista.find((e) => e.id === id)
    if (!estabelecimento) return

    const modulos = ativo
      ? [...estabelecimento.modulosAtivos, moduloId]
      : estabelecimento.modulosAtivos.filter((m) => m !== moduloId)

    setAtualizando(id)
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/modulos`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modulos }),
      })
      if (!resp.ok) return
      const atualizado = await resp.json()
      setLista((prev) =>
        prev.map((e) => (e.id === id ? { ...e, modulosAtivos: atualizado.modulosAtivos } : e))
      )
    } catch (err) {
      console.error(err)
    } finally {
      setAtualizando(null)
    }
  }
```

- [ ] **Step 3: Passar a função pros dois `<CardEstabelecimento>`**

Nas duas invocações de `<CardEstabelecimento ... />` (linhas ~191 e ~208), adicionar a prop:

```typescript
                alternarModulo={alternarModulo}
```

- [ ] **Step 4: Receber a prop e renderizar os checkboxes**

Na assinatura de `CardEstabelecimento` (linha ~349), adicionar `alternarModulo` à desestruturação e ao
tipo:

```typescript
function CardEstabelecimento({
  e,
  atualizando,
  mudarStatus,
  deletandoId,
  onDelete,
  alternarModulo,
}: {
  e: Estabelecimento
  atualizando: string | null
  mudarStatus: (id: string, status: StatusEstabelecimento) => void
  deletandoId: string | null
  onDelete: () => void
  alternarModulo: (id: string, moduloId: string, ativo: boolean) => void
}) {
```

Logo abaixo do `<div className="mt-2 flex gap-4 text-xs text-zinc-400">...</div>` existente (que mostra
usuários/pedidos/itens, linha ~383-387), adicionar:

```tsx
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
            {MODULOS_DISPONIVEIS.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={e.modulosAtivos.includes(m.id)}
                  onChange={(ev) => alternarModulo(e.id, m.id, ev.target.checked)}
                  disabled={atualizando === e.id}
                  className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-800 text-orange-500 focus:ring-orange-500"
                />
                {m.label}
              </label>
            ))}
          </div>
```

- [ ] **Step 5: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Verificar manualmente no navegador**

Com backend e frontend rodando, logar como Super Admin (`admin@comanda-ia.dev` / `superadmin123`),
abrir a tela de Estabelecimentos, marcar o checkbox "Mesas" na Pizzaria do Bairro, recarregar a página
e confirmar que o checkbox continua marcado (persistiu no banco).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/AdminEstabelecimentos.tsx
git commit -m "feat: UI de módulos habilitáveis no painel Super Admin"
```

---

### Task 7: Atualizar o seed com setor padrão e módulo de mesas na Pizzaria

Sem isso, todo `npx prisma db seed` apaga o backfill feito na Task 4 (o seed já faz `deleteMany` de
tudo) e os próximos planos (Fase 1b em diante) não têm um estabelecimento de teste com o módulo de
mesas ligado para desenvolver contra.

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: modelos `Setor` (Task 3)
- Produces: depois do seed, `Galeteria do Vinícius` e `Pizzaria do Bairro` têm 1 `Setor` "Cozinha"
  cada; `Pizzaria do Bairro` tem `modulosAtivos: ["mesas"]` — é o estabelecimento de referência para
  desenvolver a Fase 1b em diante.

- [ ] **Step 1: Limpar as tabelas novas antes das existentes**

Em `prisma/seed.ts`, no bloco de `deleteMany()` do início (linha 7), adicionar as tabelas novas
**antes** de `itemCardapio.deleteMany()` (por causa das foreign keys — filhas antes das mães):

```typescript
  await prisma.mensagem.deleteMany()
  await prisma.conversa.deleteMany()
  await prisma.pagamentoItem.deleteMany()
  await prisma.pagamento.deleteMany()
  await prisma.itemComandaRateio.deleteMany()
  await prisma.itemComanda.deleteMany()
  await prisma.comanda.deleteMany()
  await prisma.conta.deleteMany()
  await prisma.mesa.deleteMany()
  await prisma.logAuditoria.deleteMany()
  await prisma.itemPedido.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.itemCardapio.deleteMany()
  await prisma.setor.deleteMany()
  await prisma.usuario.deleteMany()
  await prisma.estabelecimento.deleteMany()
```

- [ ] **Step 2: Criar o setor padrão e habilitar o módulo na Pizzaria**

Depois do bloco que cria `pizzaria` (logo após a linha `console.log(\`✅ ${pizzaria.nome} ...\`)`),
adicionar:

```typescript
  // ── Setor padrão para os estabelecimentos de teste ────────────────────────
  const setorCozinhaGaleteria = await prisma.setor.create({
    data: { nome: 'Cozinha', estabelecimentoId: galeteria.id },
  })
  await prisma.itemCardapio.updateMany({
    where: { estabelecimentoId: galeteria.id },
    data:  { setorId: setorCozinhaGaleteria.id },
  })

  const setorCozinhaPizzaria = await prisma.setor.create({
    data: { nome: 'Cozinha', estabelecimentoId: pizzaria.id },
  })
  await prisma.itemCardapio.updateMany({
    where: { estabelecimentoId: pizzaria.id },
    data:  { setorId: setorCozinhaPizzaria.id },
  })

  // ── Pizzaria é o estabelecimento de referência para o módulo de mesas ─────
  await prisma.estabelecimento.update({
    where: { id: pizzaria.id },
    data:  { modulosAtivos: ['mesas'] },
  })
  console.log('✅ Módulo "mesas" habilitado na Pizzaria do Bairro (estabelecimento de teste)')
```

- [ ] **Step 3: Rodar o seed e conferir**

Run: `npx prisma db seed`
Expected: termina sem erro, com a linha `✅ Módulo "mesas" habilitado na Pizzaria do Bairro
(estabelecimento de teste)` no final.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed cria setor padrão e habilita módulo mesas na Pizzaria de teste"
```

---

## Verificação final do plano

- [ ] `npx vitest run` — todos os testes passam
- [ ] `npx tsc --noEmit` (raiz) — sem erros
- [ ] `cd frontend && npx tsc --noEmit` — sem erros
- [ ] `npx prisma validate` — schema válido
- [ ] Login como Super Admin, marcar/desmarcar módulo "Mesas" na Pizzaria do Bairro, recarregar e
      confirmar que persiste
- [ ] Login como DONO da Galeteria (`vinicius@teste.com`) e confirmar que **nada mudou visualmente** —
      nenhuma tela nova, nenhum checkbox novo em Operadores
