# Rodadas de pedido na comanda (Mesas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar os itens que o garçom lança juntos numa comanda em uma "Rodada" — um lote que
imprime como uma comanda só (automaticamente), aparece como um card só no Kanban de Produção (por
setor), e pode ser avançado de status inteiro com um clique, sem remover o avanço individual por
item que já existe.

**Architecture:** Novo model `RodadaComanda` agrupando `ItemComanda`. O modal de "Adicionar item"
em `Mesas.tsx` vira um carrinho local (estado só no componente) — só ao clicar "Enviar pedido" é
que tudo vai pro backend numa chamada só (`POST /comandas/:id/rodadas`), que cria a rodada e os
itens numa transação. O Kanban de Produção (`Producao.tsx`) agrupa visualmente os itens já
carregados/recebidos por `rodadaId` (campo que já vem em cada item, sem precisar de payload novo).
Emissão de eventos de socket **reaproveita 100% o mecanismo já existente** (`item-comanda:novo`,
`item-comanda:atualizado`, `producao:item-novo`, `producao:item-atualizado`), só que agora em loop
por item da rodada — sem nenhum evento novo. Isso foi uma simplificação deliberada em relação à
spec original (que cogitava eventos `rodada:nova`/`producao:rodada-nova`): como o agrupamento
visual acontece inteiramente no frontend via `item.rodadaId`, não há necessidade de nenhum
payload/evento novo — só reaproveitar o que já existe e funciona.

**Tech Stack:** Fastify 5 + Prisma 7 + PostgreSQL (backend), React 19 + Vite + Tailwind (frontend),
Socket.IO (tempo real), Vitest (testes de função pura — este projeto não tem infraestrutura de
teste de integração com banco; toda rota é verificada manualmente via curl/navegador, seguindo o
padrão já usado em todas as fases anteriores do Módulo de Mesas).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-13-rodada-pedidos-mesas-design.md` —
  qualquer requisito não coberto aqui deve ser conferido lá.
- `PATCH /rodadas/:id/avancar` **não recebe status-alvo no body** — avança cada item elegível
  para o seu próprio próximo estágio (`recebido→em_preparo→pronto→entregue`), usando
  `transicaoProducaoValida`. Itens cancelados ou já `entregue` são ignorados silenciosamente.
- Isolamento por setor: se `request.user.setorId` estiver preenchido, `PATCH /rodadas/:id/avancar`
  só afeta os itens daquele setor dentro da rodada; se não (DONO/operador sem setor fixo), afeta
  todos os itens da rodada.
- Todo item novo nasce dentro de uma rodada — não existe mais "adicionar item avulso" (nem no
  backend nem no frontend). `POST /comandas/:id/itens` (rota antiga) é removida ao final desta
  implementação (Task 7), quando `Mesas.tsx` para de chamá-la.
- Sem backfill de dados: itens já existentes no banco (antes desta migration) ficam com
  `rodadaId: null` e continuam sendo tratados como "rodada de um item só" no Kanban.
- Sem testes de integração de rota (infraestrutura não existe no projeto — ver seção Testes de
  cada task). Toda rota nova é verificada manualmente via `curl` durante a implementação e ao
  vivo no navegador na revisão final.
- Nomenclatura em português, consistente com o resto do código (`RodadaComanda`, `rodadaId`,
  `avancar`, etc.), TypeScript strict, sem `any` implícito, sem `console.log`.

---

### Task 1: Schema — model `RodadaComanda` + `ItemComanda.rodadaId`

**Files:**
- Modify: `prisma/schema.prisma:164-190` (model `Usuario`), `prisma/schema.prisma:384-396` (model
  `Comanda`), `prisma/schema.prisma:398-428` (model `ItemComanda`)
- Create: migration gerada por `npx prisma migrate dev --name adiciona_rodada_comanda`

**Interfaces:**
- Produces: model Prisma `RodadaComanda` com campos `id`, `criadaEm`, `comandaId`,
  `criadoPorUsuarioId`, relação `itens ItemComanda[]`. Campo `ItemComanda.rodadaId` (nullable,
  `String?`) com relação `rodada RodadaComanda?`.

- [ ] **Step 1: Adicionar o model `RodadaComanda` em `prisma/schema.prisma`**

Adicionar logo após o model `Comanda` (linha 396), antes do model `ItemComanda`:

```prisma
model RodadaComanda {
  id       String   @id @default(uuid())
  criadaEm DateTime @default(now())

  comandaId String
  comanda   Comanda @relation(fields: [comandaId], references: [id], onDelete: Cascade)

  criadoPorUsuarioId String?
  criadoPor          Usuario? @relation(fields: [criadoPorUsuarioId], references: [id])

  itens ItemComanda[]

  @@map("rodadas_comanda")
}
```

- [ ] **Step 2: Adicionar a relação reversa em `Comanda` (linha ~392-393)**

Em `prisma/schema.prisma`, no model `Comanda`, ao lado de `itens` e `rateios`:

```prisma
  itens   ItemComanda[]
  rateios ItemComandaRateio[]
  rodadas RodadaComanda[]
```

- [ ] **Step 3: Adicionar `rodadaId` em `ItemComanda` (perto de `setorId`, linha ~417-418)**

```prisma
  setorId String?
  setor   Setor?  @relation(fields: [setorId], references: [id])

  rodadaId String?
  rodada   RodadaComanda? @relation(fields: [rodadaId], references: [id], onDelete: SetNull)
```

- [ ] **Step 4: Adicionar a relação reversa em `Usuario` (linha ~184)**

```prisma
  pushSubscriptions PushSubscription[]
  itensComandaCriados ItemComanda[]
  rodadasComandaCriadas RodadaComanda[]
  pagamentosRegistrados Pagamento[]
  logsAuditoria         LogAuditoria[]
  movimentacoesEstoque  MovimentacaoEstoque[]
```

- [ ] **Step 5: Gerar e rodar a migration**

Run: `npx prisma migrate dev --name adiciona_rodada_comanda`
Expected: migration criada em `prisma/migrations/<timestamp>_adiciona_rodada_comanda/migration.sql`,
aplicada com sucesso, sem erro. O Prisma Client é regenerado automaticamente.

- [ ] **Step 6: Verificar que a suíte de testes existente continua passando**

Run: `npm test`
Expected: `Test Files 8 passed (8)`, `Tests 60 passed (60)` (nenhuma mudança de comportamento
nesta task, só schema).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adiciona model RodadaComanda e ItemComanda.rodadaId"
```

---

### Task 2: Função pura `proximoStatusAtivo`

**Files:**
- Modify: `src/utils/statusProducao.ts`
- Test: `src/utils/statusProducao.test.ts`

**Interfaces:**
- Consumes: `StatusProducao` (de `../generated/prisma/enums.js`, já importado no arquivo).
- Produces: `proximoStatusAtivo(status: StatusProducao): StatusProducao | null` — usada pela
  Task 5 (`PATCH /rodadas/:id/avancar`).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/utils/statusProducao.test.ts`:

```typescript
describe('proximoStatusAtivo', () => {
  it('avança recebido -> em_preparo', () => {
    expect(proximoStatusAtivo('recebido')).toBe('em_preparo');
  });

  it('avança em_preparo -> pronto', () => {
    expect(proximoStatusAtivo('em_preparo')).toBe('pronto');
  });

  it('avança pronto -> entregue', () => {
    expect(proximoStatusAtivo('pronto')).toBe('entregue');
  });

  it('não tem próximo estágio a partir de entregue', () => {
    expect(proximoStatusAtivo('entregue')).toBe(null);
  });

  it('não tem próximo estágio a partir de cancelado', () => {
    expect(proximoStatusAtivo('cancelado')).toBe(null);
  });
});
```

Atualizar o import no topo do arquivo de teste para incluir a nova função:

```typescript
import { transicaoProducaoValida, podeCancelarLivremente, proximoStatusAtivo } from './statusProducao.js';
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- statusProducao`
Expected: FAIL — `proximoStatusAtivo is not a function` (ou erro de import).

- [ ] **Step 3: Implementar `proximoStatusAtivo` em `src/utils/statusProducao.ts`**

Adicionar ao final do arquivo:

```typescript
// Avanço "positivo" (nunca pra cancelado) usado pelo avanço em lote de uma rodada inteira
// (PATCH /rodadas/:id/avancar) — cada item avança pro seu próprio próximo estágio ativo.
const proximoStatusAtivoMap: Partial<Record<StatusProducao, StatusProducao>> = {
  recebido:   'em_preparo',
  em_preparo: 'pronto',
  pronto:     'entregue',
};

export function proximoStatusAtivo(status: StatusProducao): StatusProducao | null {
  return proximoStatusAtivoMap[status] ?? null;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- statusProducao`
Expected: PASS — todos os testes de `statusProducao.test.ts` passando (incluindo os 5 novos).

- [ ] **Step 5: Commit**

```bash
git add src/utils/statusProducao.ts src/utils/statusProducao.test.ts
git commit -m "feat: adiciona proximoStatusAtivo para avanço em lote de rodada"
```

---

### Task 3: `rodadaId` na serialização de produção

**Files:**
- Modify: `src/utils/producao.ts`
- Test: `src/utils/producao.test.ts`

**Interfaces:**
- Consumes: nada novo (mesmo `StatusProducao`/tipos já usados no arquivo).
- Produces: `serializarItemProducao` passa a incluir `rodadaId` no objeto retornado — usada pelo
  `Producao.tsx` (Task 8) pra agrupar os cards do Kanban.

**Nota:** a spec original cogitava uma função `agruparItensPorSetor` pra montar os payloads de
socket por sala ao criar uma rodada. Não é necessária: `salaProducao(estabelecimentoId, setorId)`
já resolve isso sozinha por item (retorna só a sala ampla quando `setorId` é `null`) — a Task 4
simplesmente chama `salaProducao` uma vez por item, igual ao código que já existe hoje pra item
avulso. Adicionar essa função seria uma abstração sem uso real (YAGNI).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/utils/producao.test.ts`:

```typescript
describe('serializarItemProducao', () => {
  it('inclui rodadaId no payload serializado', () => {
    const item = {
      id: '1', nomeItem: 'Galeto', quantidade: 1, observacao: null, acompanhamento: null,
      status: 'recebido' as const, recebidoEm: new Date('2026-01-01T12:00:00Z'),
      setorId: null, rodadaId: 'rodada-1',
      setor: null, comanda: { nome: 'Geral', conta: { mesa: { numero: '5' } } },
    };
    expect(serializarItemProducao(item).rodadaId).toBe('rodada-1');
  });

  it('rodadaId null quando o item não pertence a nenhuma rodada (legado)', () => {
    const item = {
      id: '1', nomeItem: 'Galeto', quantidade: 1, observacao: null, acompanhamento: null,
      status: 'recebido' as const, recebidoEm: new Date('2026-01-01T12:00:00Z'),
      setorId: null, rodadaId: null,
      setor: null, comanda: { nome: 'Geral', conta: { mesa: { numero: '5' } } },
    };
    expect(serializarItemProducao(item).rodadaId).toBe(null);
  });
});
```

Atualizar o import no topo do arquivo de teste:

```typescript
import { filtroSetorProducao, salaProducao, serializarItemProducao } from './producao.js';
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- producao`
Expected: FAIL — `rodadaId` undefined no objeto retornado (a interface/função ainda não inclui o
campo).

- [ ] **Step 3: Adicionar `rodadaId` em `src/utils/producao.ts`**

Substituir o conteúdo de `src/utils/producao.ts` por:

```typescript
import type { StatusProducao } from '../generated/prisma/enums.js';

export function filtroSetorProducao(setorId: string | null): { setorId?: string } {
  return setorId ? { setorId } : {};
}

interface ItemComandaParaProducao {
  id: string;
  nomeItem: string;
  quantidade: number;
  observacao: string | null;
  acompanhamento: string | null;
  status: StatusProducao;
  recebidoEm: Date;
  setorId: string | null;
  rodadaId: string | null;
  setor: { nome: string; tempoAlvoMinutos: number | null } | null;
  comanda: { nome: string; conta: { mesa: { numero: string } | null } };
}

export function serializarItemProducao(item: ItemComandaParaProducao) {
  return {
    id:               item.id,
    nomeItem:         item.nomeItem,
    quantidade:       item.quantidade,
    observacao:       item.observacao,
    acompanhamento:   item.acompanhamento,
    status:           item.status,
    recebidoEm:       item.recebidoEm,
    setorId:          item.setorId,
    rodadaId:         item.rodadaId,
    setorNome:        item.setor?.nome ?? null,
    tempoAlvoMinutos: item.setor?.tempoAlvoMinutos ?? null,
    mesaNumero:       item.comanda.conta.mesa?.numero ?? null,
    comandaNome:      item.comanda.nome,
  };
}

export function salaProducao(estabelecimentoId: string, setorId: string | null): string[] {
  return setorId ? [estabelecimentoId, `${estabelecimentoId}:${setorId}`] : [estabelecimentoId];
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- producao`
Expected: PASS — todos os testes de `producao.test.ts` passando (incluindo os 2 novos).

- [ ] **Step 5: Rodar `tsc --noEmit` no backend pra confirmar que nada mais quebrou com o campo `rodadaId` novo na interface**

Run: `npx tsc --noEmit`
Expected: sem erros. (`src/routes/producao.ts` e `src/routes/contas.ts` fazem `include: { setor:
true, comanda: {...} }` ao buscar `ItemComanda` pra montar `ItemComandaParaProducao` — como
`rodadaId` é uma coluna escalar simples do próprio `ItemComanda`, ela já vem automaticamente em
qualquer `findUnique`/`findMany` sem precisar mudar nenhum `include` existente.)

- [ ] **Step 6: Commit**

```bash
git add src/utils/producao.ts src/utils/producao.test.ts
git commit -m "feat: inclui rodadaId na serialização de itens de produção"
```

---

### Task 4: Rota `POST /comandas/:id/rodadas`

**Files:**
- Create: `src/routes/rodadas.ts`
- Modify: `src/routes/contas.ts:74-76` (exportar `serializarItemComanda`)
- Modify: `src/server.ts` (registrar `rodadasRoutes`)

**Interfaces:**
- Consumes: `serializarItemComanda` (de `contas.ts`, precisa virar `export`), `serializarItemProducao`
  (Task 3) e `salaProducao` (já existe, ambas de `producao.ts`), `resolverAcompanhamento` (já
  existe em `src/utils/acompanhamento.ts`).
- Produces: rota `POST /comandas/:id/rodadas` que outras tasks (7) vão chamar do frontend.

- [ ] **Step 1: Exportar `serializarItemComanda` em `src/routes/contas.ts`**

Em `src/routes/contas.ts`, linha 74, mudar:

```typescript
function serializarItemComanda(item: ItemComandaComPreco) {
```

para:

```typescript
export function serializarItemComanda(item: ItemComandaComPreco) {
```

- [ ] **Step 2: Criar `src/routes/rodadas.ts` com a rota de criação**

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { resolverAcompanhamento } from '../utils/acompanhamento.js';
import { serializarItemProducao, salaProducao } from '../utils/producao.js';
import { serializarItemComanda } from './contas.js';

const ItemRodadaSchema = Type.Object({
  itemCardapioId: Type.String({ minLength: 1 }),
  quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
  observacao:     Type.Optional(Type.String({ maxLength: 300 })),
  acompanhamento: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
});

const CriarRodadaSchema = Type.Object({
  itens: Type.Array(ItemRodadaSchema, { minItems: 1 }),
});

const ComandaParamsSchema = Type.Object({ id: Type.String() });
const RodadaParamsSchema  = Type.Object({ id: Type.String() });

interface ItemRodadaInput {
  itemCardapioId: string;
  quantidade:     number;
  observacao?:    string;
  acompanhamento?: string;
}

export async function rodadasRoutes(fastify: FastifyInstance) {
  // ── POST /comandas/:id/rodadas ───────────────────────────────────────────────
  // Cria uma Rodada (lote de itens enviados juntos) — substitui o antigo "um item
  // por clique" (POST /comandas/:id/itens, removido). Itens que ficaram indisponíveis
  // entre a montagem do carrinho e o envio são descartados sem quebrar a rodada inteira.
  fastify.post('/comandas/:id/rodadas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: CriarRodadaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itens } = request.body as { itens: ItemRodadaInput[] };
    const { estabelecimentoId, userId } = request.user;

    const comanda = await prisma.comanda.findFirst({
      where: { id, conta: { estabelecimentoId: estabelecimentoId! } },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id:         { in: itens.map((i) => i.itemCardapioId) },
        estabelecimentoId: estabelecimentoId!,
        disponivel: true,
      },
      include: { categoria: { select: { opcoesAcompanhamento: true } } },
    });
    const itensCardapioPorId = new Map(itensCardapio.map((i) => [i.id, i]));

    const itensParaCriar: {
      itemCardapioId: string;
      nomeItem: string;
      quantidade: number;
      precoUnit: number;
      observacao: string | null;
      acompanhamento: string | null;
      setorId: string | null;
    }[] = [];
    const itensDescartados: { itemCardapioId: string; motivo: string }[] = [];

    for (const itemInput of itens) {
      const itemCardapio = itensCardapioPorId.get(itemInput.itemCardapioId);
      if (!itemCardapio) {
        itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: 'Item não disponível ou não pertence a este estabelecimento' });
        continue;
      }

      const resultadoAcompanhamento = resolverAcompanhamento(
        itemCardapio.categoria?.opcoesAcompanhamento,
        itemInput.acompanhamento,
        itemCardapio.nome,
      );
      if (resultadoAcompanhamento.erro) {
        itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: resultadoAcompanhamento.erro });
        continue;
      }

      itensParaCriar.push({
        itemCardapioId: itemCardapio.id,
        nomeItem:       itemCardapio.nome,
        quantidade:     itemInput.quantidade,
        precoUnit:      Number(itemCardapio.preco) + (resultadoAcompanhamento.precoAdicional ?? 0),
        observacao:     itemInput.observacao ?? null,
        acompanhamento: itemInput.acompanhamento ?? null,
        setorId:        itemCardapio.setorId,
      });
    }

    if (itensParaCriar.length === 0) {
      return reply.status(400).send({ erro: 'Nenhum item válido pra criar a rodada', itensDescartados });
    }

    const { rodada, itensCriados } = await prisma.$transaction(async (tx) => {
      const rodada = await tx.rodadaComanda.create({
        data: { comandaId: id, criadoPorUsuarioId: userId },
      });
      const itensCriados = await Promise.all(
        itensParaCriar.map((item) =>
          tx.itemComanda.create({
            data: { ...item, comandaId: id, rodadaId: rodada.id, criadoPorUsuarioId: userId },
          }),
        ),
      );
      return { rodada, itensCriados };
    });

    // Reaproveita o mecanismo de eventos já existente pra item avulso, em loop —
    // sem evento novo. O agrupamento visual da rodada acontece no frontend via rodadaId.
    for (const itemCriado of itensCriados) {
      const serializado = serializarItemComanda(itemCriado);
      getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializado);
    }

    const itensParaProducao = await prisma.itemComanda.findMany({
      where: { id: { in: itensCriados.map((i) => i.id) } },
      include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
    });
    // salaProducao já resolve sozinha pra onde cada item vai (sala ampla + sala do setor,
    // quando tem setor; só a sala ampla, quando não tem) — mesmo padrão já usado pra item
    // avulso, sem precisar agrupar nada antes.
    for (const item of itensParaProducao) {
      getIO().to(salaProducao(estabelecimentoId!, item.setorId)).emit('producao:item-novo', serializarItemProducao(item));
    }

    return reply.status(201).send({
      rodadaId: rodada.id,
      itens: itensCriados.map(serializarItemComanda),
      itensDescartados,
    });
  });

  // ── GET /rodadas/:id ─────────────────────────────────────────────────────────
  // Usada pela tela de impressão (ImprimirRodada.tsx).
  fastify.get('/rodadas/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: RodadaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const rodada = await prisma.rodadaComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { comanda: { include: { conta: { include: { mesa: true } } } }, itens: true },
    });
    if (!rodada) return reply.status(404).send({ erro: 'Rodada não encontrada' });

    return {
      id:          rodada.id,
      criadaEm:    rodada.criadaEm,
      mesaNumero:  rodada.comanda.conta.mesa?.numero ?? null,
      comandaNome: rodada.comanda.nome,
      itens:       rodada.itens.map(serializarItemComanda),
    };
  });
}
```

- [ ] **Step 3: Registrar a rota em `src/server.ts`**

Adicionar o import junto dos outros (perto da linha 20):

```typescript
import { rodadasRoutes } from './routes/rodadas.js';
```

Adicionar o registro junto dos outros (perto da linha 84, logo após `contasRoutes`):

```typescript
  await fastify.register(contasRoutes);
  await fastify.register(rodadasRoutes);
```

- [ ] **Step 4: Verificar tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; `Tests 60 passed (60)` (sem teste novo nesta task — a lógica de
negócio relevante já foi coberta como função pura nas Tasks 2 e 3; esta rota em si é verificada
manualmente no próximo passo).

- [ ] **Step 5: Verificação manual via curl**

Suba o backend (`npm run dev`), habilite o módulo `mesas` num estabelecimento de teste (via
`PATCH /admin/estabelecimentos/:id/modulos`), abra uma mesa (`POST /contas`) e rode:

```bash
curl -s -X POST http://localhost:3000/comandas/<comandaId>/rodadas \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"itens":[{"itemCardapioId":"<id-existente>","quantidade":2}]}'
```

Expected: `201`, resposta com `rodadaId`, `itens` (1 item, `rodadaId` preenchido igual ao
`rodadaId` do topo), `itensDescartados: []`. Repita passando um `itemCardapioId` inexistente
junto de um válido — espere `itensDescartados` com 1 entrada e `itens` só com o item válido.
Repita `GET /rodadas/<rodadaId>` — espere `mesaNumero`, `comandaNome` e `itens` corretos.

- [ ] **Step 6: Commit**

```bash
git add src/routes/rodadas.ts src/routes/contas.ts src/server.ts
git commit -m "feat: rota POST /comandas/:id/rodadas cria lote de itens numa transação"
```

---

### Task 5: Rota `PATCH /rodadas/:id/avancar`

**Files:**
- Modify: `src/routes/rodadas.ts` (adicionar a rota)
- Modify: `src/routes/contas.ts` (extrair helper de emissão compartilhado, ver Step 1)

**Interfaces:**
- Consumes: `proximoStatusAtivo` (Task 2), `transicaoProducaoValida` (já existe).
- Produces: rota `PATCH /rodadas/:id/avancar`, chamada pela Task 8 (`Producao.tsx`).

- [ ] **Step 1: Extrair um helper de emissão compartilhado em `src/routes/contas.ts`**

Em `src/routes/contas.ts`, dentro de `PATCH /itens-comanda/:id/status` (linha ~375-386), o bloco
que emite os eventos de produção após atualizar o item é duplicado 3 vezes no arquivo (criação,
atualização de status, transferência). Pra `PATCH /rodadas/:id/avancar` reaproveitar exatamente a
mesma emissão sem duplicar de novo, extrair uma função exportada logo antes de
`export async function contasRoutes(...)`:

```typescript
export async function emitirAtualizacaoItemComanda(estabelecimentoId: string, itemId: string) {
  const itemParaProducao = await prisma.itemComanda.findUnique({
    where:   { id: itemId },
    include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
  });
  if (!itemParaProducao) return;
  getIO()
    .to(salaProducao(estabelecimentoId, itemParaProducao.setorId))
    .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
}
```

Substituir os 2 blocos idênticos que já existem em `PATCH /itens-comanda/:id/status` (linha
~376-386) e `PATCH /itens-comanda/:id/transferir` (linha ~430-439) por uma chamada a essa função,
por exemplo (no primeiro caso):

```typescript
    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { status, ...timestamps } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    // ... (bloco de auditoria de cancelamento continua igual, sem mudança) ...

    await emitirAtualizacaoItemComanda(estabelecimentoId!, atualizado.id);

    return serializado;
  });
```

(Repita a mesma substituição no bloco correspondente de `PATCH /itens-comanda/:id/transferir`.)

- [ ] **Step 2: Rodar os testes existentes pra garantir que a extração não quebrou nada**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; `Tests 60 passed (60)`.

- [ ] **Step 3: Adicionar a rota `PATCH /rodadas/:id/avancar` em `src/routes/rodadas.ts`**

Adicionar o import no topo do arquivo:

```typescript
import { transicaoProducaoValida, proximoStatusAtivo } from '../utils/statusProducao.js';
import { emitirAtualizacaoItemComanda } from './contas.js';
```

Adicionar a rota dentro de `rodadasRoutes`, após `GET /rodadas/:id`:

```typescript
  // ── PATCH /rodadas/:id/avancar ───────────────────────────────────────────────
  // Avança cada item elegível da rodada pro seu próprio próximo estágio — sem
  // status-alvo no body (ver Global Constraints do plano). Itens de outro setor
  // (quando o usuário tem setor fixo), cancelados, ou já entregues são ignorados.
  fastify.patch('/rodadas/:id/avancar', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: RodadaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId, setorId } = request.user;

    const rodada = await prisma.rodadaComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { itens: true },
    });
    if (!rodada) return reply.status(404).send({ erro: 'Rodada não encontrada' });

    const itensElegiveis = rodada.itens.filter((item) => setorId ? item.setorId === setorId : true);

    const itensAtualizados = [];
    for (const item of itensElegiveis) {
      const proximo = proximoStatusAtivo(item.status);
      if (!proximo || !transicaoProducaoValida(item.status, proximo)) continue;

      const timestamps: { prontoEm?: Date; entregueEm?: Date } = {};
      if (proximo === 'pronto')   timestamps.prontoEm   = new Date();
      if (proximo === 'entregue') timestamps.entregueEm = new Date();

      const atualizado = await prisma.itemComanda.update({
        where: { id: item.id },
        data:  { status: proximo, ...timestamps },
      });
      const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
      getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);
      await emitirAtualizacaoItemComanda(estabelecimentoId!, atualizado.id);
      itensAtualizados.push(serializado);
    }

    return { rodadaId: id, itensAtualizados };
  });
```

Adicionar o import de `getIO` e `serializarItemProducao`/`salaProducao` se ainda não estiverem
(já foram adicionados na Task 4 — conferir que `getIO` está importado no topo do arquivo).

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Verificação manual via curl**

Usando a `rodadaId` criada na verificação da Task 4:

```bash
curl -s -X PATCH http://localhost:3000/rodadas/<rodadaId>/avancar \
  -H "Authorization: Bearer <token-dono>"
```

Expected: `200`, `itensAtualizados` com o item indo de `recebido` pra `em_preparo`. Repita mais
duas vezes — espere `pronto`, depois `entregue`. Repita uma 4ª vez — espere `itensAtualizados: []`
(item já em `entregue`, sem próximo estágio, ignorado silenciosamente, sem erro 4xx/5xx).

Pra conferir o isolamento por setor: crie uma rodada com 2 itens de setores diferentes, logue
como um operador com `setorId` fixo (só um dos dois setores) e chame `/avancar` — espere que só
o item do setor daquele operador apareça em `itensAtualizados`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/rodadas.ts src/routes/contas.ts
git commit -m "feat: rota PATCH /rodadas/:id/avancar avança itens em lote por setor"
```

---

### Task 6: Impressão da rodada (`ImprimirRodada.tsx`)

**Files:**
- Create: `frontend/src/pages/ImprimirRodada.tsx`
- Modify: `frontend/src/App.tsx` (nova rota `/imprimir/rodada/:rodadaId`)

**Interfaces:**
- Consumes: `GET /rodadas/:id` (Task 4).
- Produces: componente `ImprimirRodada`, usado pela Task 7 via `window.open`/iframe oculto.

- [ ] **Step 1: Criar `frontend/src/pages/ImprimirRodada.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams }           from 'react-router'
import { API_URL }             from '../lib/api'

interface ItemRodada {
  id:             string
  nomeItem:       string
  quantidade:     number
  observacao:     string | null
  acompanhamento: string | null
}

interface Rodada {
  id:          string
  criadaEm:    string
  mesaNumero:  string | null
  comandaNome: string
  itens:       ItemRodada[]
}

interface Estabelecimento {
  nome: string
}

export default function ImprimirRodada() {
  const { rodadaId }  = useParams<{ rodadaId: string }>()
  const token         = localStorage.getItem('token')
  const [rodada, setRodada] = useState<Rodada | null>(null)
  const [estab, setEstab]   = useState<Estabelecimento | null>(null)
  const [erro, setErro]     = useState<string | null>(null)

  useEffect(() => {
    if (!token || !rodadaId) return
    Promise.all([
      fetch(`${API_URL}/rodadas/${rodadaId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/meu-estabelecimento`,  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([r, e]) => {
        if (r.erro) { setErro(r.erro); return }
        setRodada(r)
        setEstab(e)
      })
      .catch(() => setErro('Falha ao carregar dados'))
  }, [token, rodadaId])

  useEffect(() => {
    if (!rodada || !estab) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [rodada, estab])

  if (erro)             return <div style={{ fontFamily: 'monospace', padding: 16 }}>Erro: {erro}</div>
  if (!rodada || !estab) return <div style={{ fontFamily: 'monospace', padding: 16 }}>Carregando...</div>

  const data = new Date(rodada.criadaEm)
  const dataStr = data.toLocaleDateString('pt-BR')
  const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="comanda">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          body  { margin: 0; }
          .no-print { display: none !important; }
        }
        .comanda {
          font-family: 'Courier New', Courier, monospace;
          font-size: 15px;
          font-weight: bold;
          width: 72mm;
          margin: 0 auto;
          padding: 4mm;
          color: #000;
          background: #fff;
        }
        .linha { border-top: 1px dashed #000; margin: 4px 0; }
        .center { text-align: center; }
        .bold   { font-weight: bold; }
        .row    { display: flex; justify-content: space-between; }
        .item-row { margin-bottom: 2px; }
        .obs    { margin-left: 16px; font-style: italic; }
      `}</style>

      <p className="center bold" style={{ fontSize: 18 }}>{estab.nome}</p>
      <div className="linha" />
      <p className="center bold">
        {rodada.mesaNumero ? `Mesa ${rodada.mesaNumero}` : 'Sem mesa'} · {rodada.comandaNome}
      </p>
      <p className="center">{dataStr} {horaStr}</p>
      <div className="linha" />

      {rodada.itens.map((item) => (
        <div key={item.id} className="item-row">
          <div className="row">
            <span>{item.quantidade}x {item.nomeItem}</span>
          </div>
          {item.acompanhamento && <p className="obs"><strong>Acompanhamento: {item.acompanhamento}</strong></p>}
          {item.observacao && <p className="obs">obs: {item.observacao}</p>}
        </div>
      ))}

      <p className="center no-print" style={{ marginTop: 16, color: '#666' }}>
        A impressão deve iniciar automaticamente.
      </p>
      <button
        onClick={() => window.print()}
        className="no-print"
        style={{ display: 'block', margin: '8px auto', padding: '6px 16px', cursor: 'pointer' }}
      >
        Imprimir novamente
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Registrar a rota em `frontend/src/App.tsx`**

Adicionar o import junto de `ImprimirComanda` (linha ~28):

```typescript
import ImprimirRodada from './pages/ImprimirRodada'
```

Adicionar a rota logo abaixo de `/imprimir/:pedidoId` (linha ~58):

```tsx
<Route path="/imprimir/:pedidoId" element={<RotaProtegida><ImprimirComanda /></RotaProtegida>} />
<Route path="/imprimir/rodada/:rodadaId" element={<RotaProtegida><ImprimirRodada /></RotaProtegida>} />
```

- [ ] **Step 3: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no navegador**

Com uma `rodadaId` de teste (criada na Task 4), navegar direto pra
`http://localhost:5173/imprimir/rodada/<rodadaId>` logado. Esperado: mostra mesa/comanda/itens
corretamente, dispara `window.print()` automaticamente (o diálogo de impressão do navegador
abre).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ImprimirRodada.tsx frontend/src/App.tsx
git commit -m "feat: tela de impressão da rodada de pedido"
```

---

### Task 7: `Mesas.tsx` — carrinho no modal de adicionar item

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`
- Modify: `src/routes/contas.ts` (remover a rota antiga, agora morta)

**Interfaces:**
- Consumes: `POST /comandas/:id/rodadas` (Task 4).
- Produces: nenhuma nova (fim da cadeia — tela usada pelo garçom).

- [ ] **Step 1: Remover a rota morta `POST /comandas/:id/itens` de `src/routes/contas.ts`**

Depois desta task, `Mesas.tsx` não chama mais `POST /comandas/:id/itens` — é o único consumidor
dela (confirmado por busca no repo). Remover o bloco inteiro da rota em `src/routes/contas.ts`
(linhas 240-296, do comentário `// ── POST /comandas/:id/itens` até o `});` de fechamento) e o
schema `AdicionarItemComandaSchema` que só ela usava (linhas 29-34), se não for usado em mais
nenhum lugar do arquivo (conferir com `grep -n AdicionarItemComandaSchema
src/routes/contas.ts` antes de remover).

- [ ] **Step 2: Adicionar o estado do carrinho em `Mesas.tsx`**

Em `frontend/src/pages/Mesas.tsx`, substituir as linhas do estado do modal de item (linhas
100-106):

```typescript
  const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null)
  const [modalItemAberto, setModalItemAberto] = useState<string | null>(null) // comandaId
  const [cardapio, setCardapio] = useState<ItemCardapio[]>([])
  const [carregandoCardapio, setCarregandoCardapio] = useState(false)
  const [buscaItem, setBuscaItem] = useState('')
  const [adicionandoItemId, setAdicionandoItemId] = useState<string | null>(null)
  const [escolhendoAcompanhamentoId, setEscolhendoAcompanhamentoId] = useState<string | null>(null)
```

por:

```typescript
  const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null)
  const [modalItemAberto, setModalItemAberto] = useState<string | null>(null) // comandaId
  const [cardapio, setCardapio] = useState<ItemCardapio[]>([])
  const [carregandoCardapio, setCarregandoCardapio] = useState(false)
  const [buscaItem, setBuscaItem] = useState('')
  const [escolhendoAcompanhamentoId, setEscolhendoAcompanhamentoId] = useState<string | null>(null)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [erroPedido, setErroPedido] = useState<string | null>(null)
```

Adicionar a interface `ItemCarrinho` junto das outras interfaces do topo do arquivo (perto de
`ItemCardapio`, linha ~57):

```typescript
interface ItemCarrinho {
  chave: string // itemCardapioId + acompanhamento, pra permitir 2 linhas do mesmo item com acompanhamentos diferentes
  itemCardapioId: string
  nome: string
  preco: number
  quantidade: number
  acompanhamento?: string
}
```

- [ ] **Step 3: Trocar `adicionarItem` por funções de manipular o carrinho local**

Substituir a função `adicionarItem` (linhas 215-231) por:

```typescript
  function adicionarAoCarrinho(item: ItemCardapio, acompanhamento?: string) {
    setEscolhendoAcompanhamentoId(null)
    const chave = `${item.id}::${acompanhamento ?? ''}`
    setCarrinho((prev) => {
      const existente = prev.find((c) => c.chave === chave)
      if (existente) {
        return prev.map((c) => c.chave === chave ? { ...c, quantidade: c.quantidade + 1 } : c)
      }
      return [...prev, { chave, itemCardapioId: item.id, nome: item.nome, preco: Number(item.preco), quantidade: 1, acompanhamento }]
    })
  }

  function alterarQuantidadeCarrinho(chave: string, delta: number) {
    setCarrinho((prev) => prev
      .map((c) => c.chave === chave ? { ...c, quantidade: c.quantidade + delta } : c)
      .filter((c) => c.quantidade > 0))
  }

  function imprimirRodadaAutomaticamente(rodadaId: string) {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.top      = '-10000px'
    iframe.style.left     = '-10000px'
    iframe.style.width    = '1px'
    iframe.style.height   = '1px'
    iframe.src = `/imprimir/rodada/${rodadaId}`
    document.body.appendChild(iframe)
    setTimeout(() => iframe.remove(), 8000)
  }

  async function enviarPedido() {
    if (!modalItemAberto || carrinho.length === 0) return
    setEnviandoPedido(true)
    setErroPedido(null)
    try {
      const resp = await fetch(`${API_URL}/comandas/${modalItemAberto}/rodadas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: carrinho.map((c) => ({
            itemCardapioId: c.itemCardapioId,
            quantidade: c.quantidade,
            ...(c.acompanhamento ? { acompanhamento: c.acompanhamento } : {}),
          })),
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroPedido(dados.erro ?? 'Não foi possível enviar o pedido'); return }
      imprimirRodadaAutomaticamente(dados.rodadaId)
      if (dados.itensDescartados?.length > 0) {
        setErroPedido(`Alguns itens ficaram indisponíveis e não foram enviados: ${dados.itensDescartados.map((d: { itemCardapioId: string }) => d.itemCardapioId).join(', ')}`)
      }
      await recarregarContaAtual()
      setCarrinho([])
      if (!dados.itensDescartados?.length) setModalItemAberto(null)
    } catch {
      setErroPedido('Falha de conexão')
    } finally {
      setEnviandoPedido(false)
    }
  }
```

- [ ] **Step 4: Atualizar `abrirModalItem` pra limpar o carrinho**

Substituir (linhas 201-205):

```typescript
  async function abrirModalItem(comandaId: string) {
    setModalItemAberto(comandaId)
    setBuscaItem('')
    await carregarCardapioSeNecessario()
  }
```

por:

```typescript
  async function abrirModalItem(comandaId: string) {
    setModalItemAberto(comandaId)
    setBuscaItem('')
    setCarrinho([])
    setErroPedido(null)
    await carregarCardapioSeNecessario()
  }
```

- [ ] **Step 5: Atualizar o JSX do modal de adicionar item**

Substituir o bloco `{modalItemAberto && (...)}` inteiro (linhas 627-689) por:

```tsx
      {modalItemAberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setModalItemAberto(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-3">
              <h3 className="text-lg font-bold">Adicionar item</h3>
              <button onClick={() => setModalItemAberto(null)}><X className="h-5 w-5 text-zinc-400" /></button>
            </div>

            <div className="overflow-y-auto px-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={buscaItem}
                  onChange={(e) => setBuscaItem(e.target.value)}
                  placeholder="Buscar item..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              {carregandoCardapio ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              ) : itensFiltrados.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum item encontrado.</p>
              ) : (
                <ul className="space-y-1">
                  {itensFiltrados.map((item) => {
                    const pedeAcompanhamento = (item.categoria?.opcoesAcompanhamento?.length ?? 0) > 0
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => pedeAcompanhamento ? setEscolhendoAcompanhamentoId(item.id) : adicionarAoCarrinho(item)}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-zinc-800"
                        >
                          <span>{item.nome}</span>
                          <span className="text-zinc-400">R$ {Number(item.preco).toFixed(2)}</span>
                        </button>
                        {escolhendoAcompanhamentoId === item.id && (
                          <div className="mb-1 space-y-1 rounded-lg border border-zinc-700 bg-zinc-800 p-2">
                            <p className="mb-1 text-xs font-medium text-zinc-400">Escolha o acompanhamento:</p>
                            {item.categoria!.opcoesAcompanhamento.map((op) => (
                              <button
                                key={op.nome}
                                onClick={() => adicionarAoCarrinho(item, op.nome)}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-700"
                              >
                                <span>{op.nome}</span>
                                {op.precoAdicional > 0 && <span className="text-orange-400">+R$ {op.precoAdicional.toFixed(2)}</span>}
                              </button>
                            ))}
                            <button
                              onClick={() => setEscolhendoAcompanhamentoId(null)}
                              className="mt-1 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {carrinho.length > 0 && (
              <div className="border-t border-zinc-800 p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Pedido</p>
                <ul className="mb-3 space-y-1.5">
                  {carrinho.map((c) => (
                    <li key={c.chave} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <span>{c.nome}</span>
                        {c.acompanhamento && <span className="ml-1 text-xs text-orange-400">({c.acompanhamento})</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => alterarQuantidadeCarrinho(c.chave, -1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">−</button>
                        <span className="w-4 text-center">{c.quantidade}</span>
                        <button onClick={() => alterarQuantidadeCarrinho(c.chave, 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">+</button>
                      </div>
                    </li>
                  ))}
                </ul>
                {erroPedido && <p className="mb-2 text-sm text-red-400">{erroPedido}</p>}
                <button
                  onClick={enviarPedido}
                  disabled={enviandoPedido}
                  className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {enviandoPedido ? 'Enviando...' : `Enviar pedido (${carrinho.reduce((s, c) => s + c.quantidade, 0)} ${carrinho.reduce((s, c) => s + c.quantidade, 0) === 1 ? 'item' : 'itens'})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros. (`adicionandoItemId` foi removido do estado — conferir que não sobrou
nenhuma referência a ele no arquivo; `grep -n adicionandoItemId frontend/src/pages/Mesas.tsx`
deve retornar vazio.)

- [ ] **Step 7: Verificar o backend depois de remover a rota morta**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; `Tests 60 passed (60)`.

- [ ] **Step 8: Verificação manual no navegador**

Com o módulo `mesas` habilitado num estabelecimento de teste: abrir uma mesa, clicar "+ Item",
selecionar 2-3 itens diferentes (incluindo um com acompanhamento), ajustar quantidade de um
deles com os botões +/-, clicar "Enviar pedido". Esperado: modal fecha (ou mostra aviso se algum
item foi descartado), a impressão dispara automaticamente (diálogo de impressão abre), e os
itens aparecem na lista da comanda com o status "Recebido".

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Mesas.tsx src/routes/contas.ts
git commit -m "feat: modal de adicionar item na comanda vira carrinho (rodada)"
```

---

### Task 8: `Producao.tsx` — Kanban agrupado por rodada

**Files:**
- Modify: `frontend/src/pages/Producao.tsx`

**Interfaces:**
- Consumes: `PATCH /rodadas/:id/avancar` (Task 5); campo `rodadaId` já presente em cada item
  vindo de `GET /producao/itens` e dos eventos de socket (Task 3).

- [ ] **Step 1: Adicionar `rodadaId` à interface `ItemProducao`**

Em `frontend/src/pages/Producao.tsx`, linha 11-24, adicionar o campo:

```typescript
interface ItemProducao {
  id: string
  nomeItem: string
  quantidade: number
  observacao: string | null
  acompanhamento: string | null
  status: StatusProducao
  recebidoEm: string
  setorId: string | null
  rodadaId: string | null
  setorNome: string | null
  tempoAlvoMinutos: number | null
  mesaNumero: string
  comandaNome: string
}
```

- [ ] **Step 2: Adicionar a função de avançar rodada**

Adicionar, logo após a função `avancarStatus` (linha ~148), o estado e a função de avanço em
lote. Adicionar ao estado do componente (perto de `avancandoId`, linha 65):

```typescript
  const [avancandoRodadaId, setAvancandoRodadaId] = useState<string | null>(null)
```

Adicionar a função:

```typescript
  async function avancarRodada(rodadaId: string) {
    setAvancandoRodadaId(rodadaId)
    try {
      const resp = await fetch(`${API_URL}/rodadas/${rodadaId}/avancar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        const dados = await resp.json()
        for (const item of dados.itensAtualizados) {
          atualizarItemLocal(item)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAvancandoRodadaId(null)
    }
  }
```

- [ ] **Step 3: Agrupar os itens de cada coluna por `rodadaId` no render**

Substituir o bloco que monta `itensDaColuna` (linhas 203-205):

```typescript
            const itensDaColuna = itens
              .filter((i) => i.status === coluna.status)
              .sort((a, b) => new Date(a.recebidoEm).getTime() - new Date(b.recebidoEm).getTime())
```

por (agrupando por rodada, com itens sem rodada virando grupo de 1):

```typescript
            const itensDaColuna = itens
              .filter((i) => i.status === coluna.status)
              .sort((a, b) => new Date(a.recebidoEm).getTime() - new Date(b.recebidoEm).getTime())

            const gruposDaColuna: { chave: string; rodadaId: string | null; itens: ItemProducao[] }[] = []
            for (const item of itensDaColuna) {
              const chave = item.rodadaId ?? item.id
              const grupoExistente = gruposDaColuna.find((g) => g.chave === chave)
              if (grupoExistente) grupoExistente.itens.push(item)
              else gruposDaColuna.push({ chave, rodadaId: item.rodadaId, itens: [item] })
            }
```

- [ ] **Step 4: Atualizar o JSX pra renderizar um card por grupo (rodada) em vez de por item**

Substituir o bloco `<div className="space-y-2">...` que mapeia `itensDaColuna.map((item) => ...)`
(linhas 219-300) por uma versão que mapeia `gruposDaColuna`, mostrando cada item da rodada dentro
do mesmo card, com o botão de avançar a rodada inteira além do avanço individual por item:

```tsx
                  <div className="space-y-2">
                    {gruposDaColuna.map((grupo) => (
                      <div key={grupo.chave} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                        <p className="mb-2 text-xs text-zinc-500">
                          Mesa {grupo.itens[0].mesaNumero} · {grupo.itens[0].comandaNome}
                        </p>
                        <div className="space-y-2">
                          {grupo.itens.map((item) => {
                            const minutos = minutosDesde(item.recebidoEm, agora)
                            return (
                              <div key={item.id} className="border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-zinc-100">
                                    {item.quantidade}x {item.nomeItem}
                                  </span>
                                  <span className={`flex items-center gap-1 text-xs font-medium ${corCronometro(minutos, item.tempoAlvoMinutos)}`}>
                                    {minutos}min
                                  </span>
                                </div>
                                {item.acompanhamento && (
                                  <p className="mb-1 text-xs font-medium text-orange-400">Acompanhamento: {item.acompanhamento}</p>
                                )}
                                {item.observacao && (
                                  <p className="mb-1 text-xs italic text-zinc-500">{item.observacao}</p>
                                )}
                                {labelAvancar[item.status] && (
                                  <button
                                    onClick={() => avancarStatus(item)}
                                    disabled={avancandoId === item.id}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                                  >
                                    {avancandoId === item.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : null}
                                    {labelAvancar[item.status]} (só este)
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
                                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                                  >
                                    Cancelar item
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {grupo.rodadaId && grupo.itens.some((i) => labelAvancar[i.status]) && (
                          <button
                            onClick={() => avancarRodada(grupo.rodadaId!)}
                            disabled={avancandoRodadaId === grupo.rodadaId}
                            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                          >
                            {avancandoRodadaId === grupo.rodadaId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <ChefHat className="h-3.5 w-3.5" />}
                            Avançar rodada
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
```

- [ ] **Step 5: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Verificação manual no navegador — grupo e avanço em lote**

Usando o carrinho da Task 7, enviar uma rodada com 2+ itens do mesmo setor pra uma mesa. Esperado
no Kanban de Produção: os itens aparecem **num card só** (com a etiqueta "Mesa X · nome da
comanda" uma vez só no topo), cada item com seu próprio botão "(só este)", e um botão "Avançar
rodada" no rodapé do card que avança todos de uma vez. Confirmar que um item avulso antigo
(criado antes desta migration, ou um item sem `rodadaId`) continua aparecendo como seu próprio
card, sem o botão "Avançar rodada" (só o individual).

- [ ] **Step 7: Verificação manual — isolamento por setor com rodada mista**

Repetir o teste de dois operadores em abas separadas já usado nas fases anteriores do Módulo de
Mesas (Fase 1d): logar como um operador com `setorId` do Bar numa aba e outro com `setorId` da
Cozinha em outra. Enviar uma rodada com 1 item do Bar + 1 item da Cozinha. Esperado: a aba do Bar
vê um card só com o item do Bar (e "Avançar rodada" só afeta esse item); a aba da Cozinha vê um
card só com o item da Cozinha; nenhuma das duas vê o item da outra.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Producao.tsx
git commit -m "feat: Kanban de Produção agrupa itens da mesma rodada num card só"
```

---

## Self-Review (feito pelo autor do plano)

- **Cobertura da spec:** carrinho (Task 7), impressão automática (Tasks 6+7), agrupamento no
  Kanban (Task 8), avanço em lote respeitando setor (Task 5+8), modelo de dados (Task 1) — todos
  os pontos da spec têm uma task correspondente.
- **Simplificação registrada:** a spec original cogitava eventos de socket novos
  (`rodada:nova`/`producao:rodada-nova`); o plano reaproveita os eventos existentes em loop por
  item, já que o agrupamento visual acontece inteiramente no frontend via `rodadaId` — registrado
  explicitamente na seção Architecture acima.
- **Testes:** ajustado pra realidade do projeto (só testes de função pura existem hoje — Tasks 2
  e 3 seguem esse padrão; rotas são verificadas manualmente via curl/navegador, como todas as
  fases anteriores do Módulo de Mesas).
