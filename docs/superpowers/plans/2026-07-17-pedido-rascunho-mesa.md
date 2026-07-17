# Pedido em rascunho por mesa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela de Mesas, o garçom acumula itens em rascunho (persistido no servidor) entre todas as comandas da mesa, revisa a mesa inteira, e envia tudo pra cozinha num único clique — em vez de cada comanda ir pra cozinha na hora.

**Architecture:** Tabela de staging `RascunhoItemComanda` separada; itens em rascunho só viram `ItemComanda` + rodada no envio final, reaproveitando um helper `criarRodadaDeItens` extraído da rota atual. Produção/Caixa/Dashboard não enxergam rascunho — zero mudança neles.

**Tech Stack:** Node/Fastify 5 + Prisma 7 + PostgreSQL (backend), React 19 (frontend), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-pedido-rascunho-mesa-design.md`

## Global Constraints

- TypeScript strict; sem `any`/`@ts-ignore`; imutabilidade; sem `console.log` novo; commits conventional.
- Rotas de rascunho: `temPermissao('mesas')` + `moduloAtivo('mesas')`.
- Rascunho é staging separado — **não** tocar em Produção, Caixa, Dashboard, cancelamento.
- Impressão continua na tela de Produção (dispara em `producao:item-novo`); Mesas não imprime.
- Tempo real reusa o evento `conta:atualizada` (Mesas já refetcha nele) — sem evento novo.
- Verificação por task: `npx vitest run && npx tsc --noEmit` (backend) / `cd frontend && npx tsc -b`.
- **Migration nova** — avisar antes de push (regra de equipe do CLAUDE.md).

## File Structure

- `prisma/schema.prisma` — novo model `RascunhoItemComanda` + relação em `Comanda`.
- `src/routes/rodadas.ts` — extrai `criarRodadaDeItens` (helper exportado); mantém `POST /comandas/:id/rodadas` usando o helper até o frontend parar de chamá-la.
- `src/routes/rascunho.ts` (novo) — rotas de rascunho (add/patch/delete/enviar).
- `src/routes/contas.ts` — `serializarConta` passa a incluir `rascunho` por comanda.
- `src/server.ts` — registra `rascunhoRoutes`.
- `frontend/src/pages/Mesas.tsx` — modal adiciona ao rascunho; comanda mostra rascunho; revisão da mesa + envio.

---

### Task 1: Schema — model RascunhoItemComanda + migration

**Files:**
- Modify: `prisma/schema.prisma` (model `Comanda` ~385, adicionar model novo perto de `ItemComanda`)

- [ ] **Step 1: Adicionar o model e a relação**

Em `model Comanda`, adicionar à lista de relações (depois de `rodadas RodadaComanda[]`):

```prisma
  rascunhoItens RascunhoItemComanda[]
```

Adicionar o model novo (logo após `model Comanda { ... }`):

```prisma
model RascunhoItemComanda {
  id             String  @id @default(uuid())
  quantidade     Int
  observacao     String?
  acompanhamento String?

  comandaId String
  comanda   Comanda @relation(fields: [comandaId], references: [id], onDelete: Cascade)

  itemCardapioId String
  itemCardapio   ItemCardapio @relation(fields: [itemCardapioId], references: [id], onDelete: Cascade)

  criadoPorUsuarioId String?
  criadoPor          Usuario? @relation(fields: [criadoPorUsuarioId], references: [id])

  criadoEm DateTime @default(now())

  @@map("rascunho_itens_comanda")
}
```

Adicionar as relações inversas: em `model ItemCardapio` adicionar `rascunhoItens RascunhoItemComanda[]`; em `model Usuario` adicionar `rascunhoItens RascunhoItemComanda[]`.

- [ ] **Step 2: Gerar a migration**

Run: `npx prisma migrate dev --name rascunho_item_comanda`
Expected: migration criada e aplicada no banco local; `prisma generate` roda automático.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: zero erros (client Prisma regenerado com `RascunhoItemComanda`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: model RascunhoItemComanda (staging de pedido em rascunho por mesa)"
```

---

### Task 2: Backend — extrair helper criarRodadaDeItens

**Files:**
- Modify: `src/routes/rodadas.ts:37-140` (extrai o núcleo do handler num helper exportado; o handler passa a chamá-lo)

**Interfaces:**
- Produces: `export async function criarRodadaDeItens(tx, params): Promise<{ itensCriados: ItemComanda[]; descartadosRefIds: string[]; itensDescartados: { itemCardapioId: string; motivo: string; refId?: string }[] }>`
  onde `params = { comandaId: string; estabelecimentoId: string; userId: string | null; itens: { itemCardapioId: string; quantidade: number; observacao?: string | null; acompanhamento?: string | null; refId?: string }[] }` e `tx` é o cliente de transação do Prisma (`Prisma.TransactionClient`).
  - Faz o mesmo que o handler atual: busca itens do cardápio disponíveis, resolve acompanhamento, descarta indisponíveis/inválidos (populando `itensDescartados` com o `refId` da entrada), cria `RodadaComanda` + `ItemComanda`. **Não** emite socket nem abre transação própria (usa o `tx` recebido). `descartadosRefIds` = lista dos `refId` das entradas descartadas.
  - Se nenhum item válido, retorna `itensCriados: []` (não lança) — o chamador decide o que fazer.

- [ ] **Step 1: Escrever o teste do helper**

Criar `src/routes/rodadas.helper.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../database.js', () => ({ prisma: {} }));

import { montarItensParaCriar } from './rodadas.js';

// montarItensParaCriar é a parte pura: dado o mapa de cardápio e as entradas, retorna
// { itensParaCriar, itensDescartados } sem tocar no banco.
describe('montarItensParaCriar', () => {
  const cardapio = new Map<string, any>([
    ['a', { id: 'a', nome: 'Coca', preco: 5, setorId: null, categoria: { opcoesAcompanhamento: [] } }],
    ['pf', { id: 'pf', nome: 'PF', preco: 20, setorId: null, categoria: { opcoesAcompanhamento: [{ nome: 'Baião Cremoso', precoAdicional: 3 }] } }],
  ]);

  it('cria item simples e aplica preço', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'a', quantidade: 2, refId: 'r1' }]);
    expect(r.itensParaCriar).toHaveLength(1);
    expect(r.itensParaCriar[0].precoUnit).toBe(5);
    expect(r.itensDescartados).toHaveLength(0);
  });

  it('aplica preço adicional do acompanhamento', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'pf', quantidade: 1, acompanhamento: 'Baião Cremoso', refId: 'r2' }]);
    expect(r.itensParaCriar[0].precoUnit).toBe(23);
  });

  it('descarta item não encontrado no cardápio, com refId', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'x', quantidade: 1, refId: 'r3' }]);
    expect(r.itensParaCriar).toHaveLength(0);
    expect(r.itensDescartados).toEqual([{ itemCardapioId: 'x', motivo: expect.any(String), refId: 'r3' }]);
  });

  it('descarta item que exige acompanhamento sem escolha', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'pf', quantidade: 1, refId: 'r4' }]);
    expect(r.itensParaCriar).toHaveLength(0);
    expect(r.itensDescartados[0].refId).toBe('r4');
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `npx vitest run src/routes/rodadas.helper.test.ts`
Expected: FAIL — `montarItensParaCriar` não existe.

- [ ] **Step 3: Extrair `montarItensParaCriar` e `criarRodadaDeItens`**

Em `src/routes/rodadas.ts`, extrair a parte pura (linhas ~50-97 do handler) numa função exportada:

```ts
import type { Prisma } from '../generated/prisma/client.js';

export interface EntradaItemRodada {
  itemCardapioId: string;
  quantidade: number;
  observacao?: string | null;
  acompanhamento?: string | null;
  refId?: string;
}

type ItemCardapioComCategoria = { id: string; nome: string; preco: unknown; setorId: string | null; categoria: { opcoesAcompanhamento: unknown } | null };

export function montarItensParaCriar(
  cardapioPorId: Map<string, ItemCardapioComCategoria>,
  itens: EntradaItemRodada[],
) {
  const itensParaCriar: { itemCardapioId: string; nomeItem: string; quantidade: number; precoUnit: number; observacao: string | null; acompanhamento: string | null; setorId: string | null }[] = [];
  const itensDescartados: { itemCardapioId: string; motivo: string; refId?: string }[] = [];

  for (const itemInput of itens) {
    const itemCardapio = cardapioPorId.get(itemInput.itemCardapioId);
    if (!itemCardapio) {
      itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: 'Item não disponível ou não pertence a este estabelecimento', refId: itemInput.refId });
      continue;
    }
    const resultado = resolverAcompanhamento(itemCardapio.categoria?.opcoesAcompanhamento, itemInput.acompanhamento ?? undefined, itemCardapio.nome);
    if (resultado.erro) {
      itensDescartados.push({ itemCardapioId: itemInput.itemCardapioId, motivo: resultado.erro, refId: itemInput.refId });
      continue;
    }
    itensParaCriar.push({
      itemCardapioId: itemCardapio.id,
      nomeItem:       itemCardapio.nome,
      quantidade:     itemInput.quantidade,
      precoUnit:      Number(itemCardapio.preco) + (resultado.precoAdicional ?? 0),
      observacao:     itemInput.observacao ?? null,
      acompanhamento: itemInput.acompanhamento ?? null,
      setorId:        itemCardapio.setorId,
    });
  }
  return { itensParaCriar, itensDescartados };
}

export async function criarRodadaDeItens(
  tx: Prisma.TransactionClient,
  params: { comandaId: string; estabelecimentoId: string; userId: string | null; itens: EntradaItemRodada[] },
) {
  const cardapio = await tx.itemCardapio.findMany({
    where: { id: { in: params.itens.map((i) => i.itemCardapioId) }, estabelecimentoId: params.estabelecimentoId, disponivel: true },
    include: { categoria: { select: { opcoesAcompanhamento: true } } },
  });
  const cardapioPorId = new Map(cardapio.map((i) => [i.id, i]));
  const { itensParaCriar, itensDescartados } = montarItensParaCriar(cardapioPorId as any, params.itens);
  const descartadosRefIds = itensDescartados.map((d) => d.refId).filter((r): r is string => !!r);

  const itensCriados = [];
  if (itensParaCriar.length > 0) {
    const rodada = await tx.rodadaComanda.create({ data: { comandaId: params.comandaId, criadoPorUsuarioId: params.userId } });
    for (const item of itensParaCriar) {
      itensCriados.push(await tx.itemComanda.create({ data: { ...item, comandaId: params.comandaId, rodadaId: rodada.id, criadoPorUsuarioId: params.userId } }));
    }
  }
  return { itensCriados, itensDescartados, descartadosRefIds };
}
```

O handler `POST /comandas/:id/rodadas` passa a: abrir transação, chamar `criarRodadaDeItens(tx, {...})`, e (se `itensCriados.length === 0`) retornar 400 com `itensDescartados`; senão emitir os sockets (loop `item-comanda:novo` + `producao:item-novo`, como já faz) e retornar `{ rodadaId, itensDescartados }`. Reusa `montarItensParaCriar` internamente via o helper.

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run && npx tsc --noEmit`
Expected: novo teste PASSA; todos os 67+ existentes continuam passando.

- [ ] **Step 5: Commit**

```bash
git add src/routes/rodadas.ts src/routes/rodadas.helper.test.ts
git commit -m "refactor: extrai criarRodadaDeItens/montarItensParaCriar de POST /rodadas"
```

---

### Task 3: Backend — rotas de rascunho (add/patch/delete) + rascunho na conta

**Files:**
- Create: `src/routes/rascunho.ts`
- Modify: `src/routes/contas.ts:80-88` (`serializarConta` inclui `rascunho` por comanda; `GET /contas` e `GET /contas/:id` passam a incluir `comandas.rascunhoItens`)
- Modify: `src/server.ts` (registrar `rascunhoRoutes`)

**Interfaces:**
- Consumes: nada de tasks anteriores (usa Prisma direto).
- Produces: `export async function rascunhoRoutes(fastify)`.

- [ ] **Step 1: Incluir rascunho na serialização da conta**

Em `contas.ts`, os dois `include` de comandas (`GET /contas` linha ~117 e `GET /contas/:id` linha ~132) passam a incluir também o rascunho com dados do cardápio pra exibição:

```ts
include: { mesa: true, comandas: { include: { itens: true, rascunhoItens: { include: { itemCardapio: { select: { nome: true, preco: true } } }, orderBy: { criadoEm: 'asc' } } } } },
```

`serializarConta` mapeia cada comanda incluindo `rascunho` com nome/preço resolvidos:

```ts
export function serializarConta(conta: ContaComComandas) {
  return {
    ...conta,
    comandas: conta.comandas?.map((comanda) => ({
      ...comanda,
      itens: comanda.itens?.map(serializarItemComanda),
      rascunho: (comanda.rascunhoItens as any[] | undefined)?.map((r) => ({
        id: r.id,
        itemCardapioId: r.itemCardapioId,
        nomeItem: r.itemCardapio?.nome ?? '',
        precoUnit: Number(r.itemCardapio?.preco ?? 0),
        quantidade: r.quantidade,
        observacao: r.observacao,
        acompanhamento: r.acompanhamento,
      })),
    })),
  };
}
```

Ampliar a interface `ComandaComItens` pra aceitar `rascunhoItens?: any[]`.

- [ ] **Step 2: Criar `src/routes/rascunho.ts`**

```ts
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';

const ComandaParams = Type.Object({ id: Type.String() });
const RascunhoParams = Type.Object({ id: Type.String() });

const AdicionarRascunhoSchema = Type.Object({
  itens: Type.Array(Type.Object({
    itemCardapioId: Type.String({ minLength: 1 }),
    quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
    observacao:     Type.Optional(Type.String({ maxLength: 300 })),
    acompanhamento: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  }), { minItems: 1 }),
});

const AtualizarRascunhoSchema = Type.Object({ quantidade: Type.Integer({ minimum: 1, maximum: 100 }) });

async function emitirContaDaComanda(estabelecimentoId: string, comandaId: string) {
  const comanda = await prisma.comanda.findUnique({ where: { id: comandaId }, select: { contaId: true } });
  if (comanda) getIO().to(estabelecimentoId).emit('conta:atualizada', { id: comanda.contaId });
}

export async function rascunhoRoutes(fastify: FastifyInstance) {
  // Adiciona itens ao rascunho de uma comanda (não vai pra cozinha).
  fastify.post('/comandas/:id/rascunho', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParams, body: AdicionarRascunhoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itens } = request.body as { itens: { itemCardapioId: string; quantidade: number; observacao?: string; acompanhamento?: string }[] };
    const { estabelecimentoId, userId } = request.user;

    const comanda = await prisma.comanda.findFirst({ where: { id, conta: { estabelecimentoId: estabelecimentoId! } } });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    await prisma.rascunhoItemComanda.createMany({
      data: itens.map((i) => ({ comandaId: id, itemCardapioId: i.itemCardapioId, quantidade: i.quantidade, observacao: i.observacao ?? null, acompanhamento: i.acompanhamento ?? null, criadoPorUsuarioId: userId })),
    });
    await emitirContaDaComanda(estabelecimentoId!, id);
    return reply.status(201).send({ ok: true });
  });

  // Ajusta quantidade de um item de rascunho.
  fastify.patch('/rascunho/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: RascunhoParams, body: AtualizarRascunhoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { quantidade } = request.body as { quantidade: number };
    const { estabelecimentoId } = request.user;

    const r = await prisma.rascunhoItemComanda.findFirst({ where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } }, include: { comanda: { select: { id: true } } } });
    if (!r) return reply.status(404).send({ erro: 'Item de rascunho não encontrado' });
    await prisma.rascunhoItemComanda.update({ where: { id }, data: { quantidade } });
    await emitirContaDaComanda(estabelecimentoId!, r.comanda.id);
    return { ok: true };
  });

  // Remove um item de rascunho.
  fastify.delete('/rascunho/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: RascunhoParams },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const r = await prisma.rascunhoItemComanda.findFirst({ where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } }, include: { comanda: { select: { id: true } } } });
    if (!r) return reply.status(404).send({ erro: 'Item de rascunho não encontrado' });
    await prisma.rascunhoItemComanda.delete({ where: { id } });
    await emitirContaDaComanda(estabelecimentoId!, r.comanda.id);
    return { ok: true };
  });
}
```

- [ ] **Step 3: Registrar em `src/server.ts`**

Importar `rascunhoRoutes` e registrar junto das outras rotas de mesas (mesma forma que `rodadasRoutes`/`contasRoutes` são registradas).

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: passa; zero erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/routes/rascunho.ts src/routes/contas.ts src/server.ts
git commit -m "feat: rotas de rascunho de pedido (add/patch/delete) + rascunho na serialização da conta"
```

---

### Task 4: Backend — envio do rascunho (POST /contas/:id/rascunho/enviar)

**Files:**
- Modify: `src/routes/rascunho.ts` (adicionar a rota de envio)

**Interfaces:**
- Consumes: `criarRodadaDeItens` (Task 2); `serializarItemProducao`, `salaProducao` (`utils/producao`); `serializarItemComanda` (`contas.ts`).

- [ ] **Step 1: Escrever a rota de envio**

Adicionar em `rascunhoRoutes` (imports no topo: `criarRodadaDeItens` de `./rodadas.js`, `serializarItemComanda` de `./contas.js`, `serializarItemProducao, salaProducao` de `../utils/producao.js`):

```ts
  // Envia TODO o rascunho da conta pra cozinha: uma rodada por comanda com rascunho.
  fastify.post('/contas/:id/rascunho/enviar', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParams },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId, userId } = request.user;

    const conta = await prisma.conta.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
      include: { comandas: { include: { rascunhoItens: true } } },
    });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });

    const comandasComRascunho = conta.comandas.filter((c) => c.rascunhoItens.length > 0);
    if (comandasComRascunho.length === 0) return reply.status(400).send({ erro: 'Nenhum item em rascunho pra enviar' });

    const { itensCriadosTotal, itensDescartados } = await prisma.$transaction(async (tx) => {
      const itensCriadosTotal: any[] = [];
      const itensDescartados: { itemCardapioId: string; motivo: string; refId?: string }[] = [];
      for (const comanda of comandasComRascunho) {
        const { itensCriados, itensDescartados: desc, descartadosRefIds } = await criarRodadaDeItens(tx, {
          comandaId: comanda.id,
          estabelecimentoId: estabelecimentoId!,
          userId,
          itens: comanda.rascunhoItens.map((r) => ({ itemCardapioId: r.itemCardapioId, quantidade: r.quantidade, observacao: r.observacao, acompanhamento: r.acompanhamento, refId: r.id })),
        });
        itensCriadosTotal.push(...itensCriados);
        itensDescartados.push(...desc);
        // apaga só os itens de rascunho que foram ENVIADOS (mantém os descartados pro garçom decidir)
        const enviados = comanda.rascunhoItens.map((r) => r.id).filter((rid) => !descartadosRefIds.includes(rid));
        if (enviados.length > 0) await tx.rascunhoItemComanda.deleteMany({ where: { id: { in: enviados } } });
      }
      return { itensCriadosTotal, itensDescartados };
    });

    // Emite fora da transação — mesmo padrão de POST /rodadas (Produção imprime ao receber).
    for (const item of itensCriadosTotal) {
      getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializarItemComanda(item));
    }
    const paraProducao = await prisma.itemComanda.findMany({
      where: { id: { in: itensCriadosTotal.map((i) => i.id) } },
      include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
    });
    for (const item of paraProducao) {
      getIO().to(salaProducao(estabelecimentoId!, item.setorId)).emit('producao:item-novo', serializarItemProducao(item));
    }
    getIO().to(estabelecimentoId!).emit('conta:atualizada', { id });

    return { enviados: itensCriadosTotal.length, itensDescartados };
  });
```

Adicionar `const ContaParams = Type.Object({ id: Type.String() });` no topo do arquivo.

- [ ] **Step 2: Verificar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: passa; zero erros.

- [ ] **Step 3: Teste manual via API (backend rodando)**

```bash
docker compose up -d && npm run dev  # se ainda não estiver rodando
```
Roteiro (script curl/python): abrir mesa → criar 2ª comanda → `POST /comandas/:id/rascunho` em cada uma → `GET /contas/:id` mostra `rascunho` nas comandas e `itens` vazio → `POST /contas/:id/rascunho/enviar` → `GET /contas/:id` mostra `itens` (status recebido) e `rascunho` vazio; `GET /producao/itens` mostra os itens.

- [ ] **Step 4: Commit**

```bash
git add src/routes/rascunho.ts
git commit -m "feat: envio do rascunho da mesa (uma rodada por comanda, tudo de uma vez)"
```

---

### Task 5: Frontend — Mesas.tsx: rascunho por comanda + revisão da mesa + envio

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`
- Modify: `src/routes/rodadas.ts` (remover `POST /comandas/:id/rodadas` — nada mais chama; manter só o helper exportado)

**Comportamento:**
- O modal "+ Item" (carrinho local) passa a enviar pra `POST /comandas/:id/rascunho` (não mais `POST /comandas/:id/rodadas`). Botão do modal: "Adicionar ao pedido (N)". Ao adicionar, fecha o modal e recarrega a conta (o rascunho aparece na comanda). Remove o estado/JSX de `revisandoPedido` do modal (a revisão sobe pro nível da mesa).
- Cada comanda na tela mostra, além dos itens enviados (como hoje): os itens de `comanda.rascunho` numa seção "Não enviado" (nome, qtd, acompanhamento), com botões − / + (`PATCH /rascunho/:id`) e remover (`DELETE /rascunho/:id`).
- Barra no nível da mesa (fora das comandas): quando `contaSelecionada.comandas` tem algum `rascunho`, mostrar botão "Revisar e enviar pedido (N)" onde N = total de itens em rascunho da mesa.
- Tela de revisão da mesa (novo estado `revisandoMesa`): lista o rascunho agrupado por comanda com subtotais e total, com − / + / remover por item, botão "← Voltar e adicionar" (fecha a revisão, volta pra mesa) e "Confirmar e enviar tudo pra cozinha" → `POST /contas/:id/rascunho/enviar`. Se a resposta trouxer `itensDescartados`, mostrar aviso com os nomes (resolvidos do `rascunho`/cardápio) e recarregar a conta (os enviados somem do rascunho, os descartados ficam).
- `precoLinhaRascunho` usa `opcoesAcompanhamentoDe` (fix `45b27ba`) pra somar adicional com segurança.

- [ ] **Step 1: Tipos + fetch helpers**

Adicionar ao tipo da comanda no `Mesas.tsx` o array `rascunho?: RascunhoItem[]` onde `RascunhoItem = { id: string; itemCardapioId: string; nomeItem: string; precoUnit: number; quantidade: number; observacao: string | null; acompanhamento: string | null }`. Funções `adicionarRascunho(comandaId, itens)`, `alterarQtdRascunho(id, quantidade)`, `removerRascunho(id)`, `enviarRascunhoDaMesa()` chamando as rotas da Task 3/4, cada uma seguida de `recarregarContaAtual()`.

- [ ] **Step 2: Modal adiciona ao rascunho**

Trocar `enviarPedido` (que chamava `POST /comandas/:id/rodadas`) por chamada a `adicionarRascunho(modalItemAberto, carrinho.map(...))`; o botão do modal vira "Adicionar ao pedido (N)"; remover o bloco `revisandoPedido` do modal. Manter a montagem do carrinho e a normalização de acompanhamento.

- [ ] **Step 3: Render do rascunho por comanda + barra da mesa + tela de revisão**

Implementar o JSX descrito acima (seção "Não enviado" por comanda com −/+/remover; barra "Revisar e enviar pedido (N)"; tela `revisandoMesa` com o rascunho agrupado, totais, voltar e confirmar-enviar).

- [ ] **Step 4: Remover a rota antiga**

Em `src/routes/rodadas.ts`, remover o handler `POST /comandas/:id/rodadas` (mantendo `criarRodadaDeItens`/`montarItensParaCriar` exportados e os outros handlers de rodada — `GET /rodadas/:id`, `PATCH /rodadas/:id/avancar`). Conferir que nenhum outro arquivo chama `POST /comandas/:id/rodadas` (`grep -rn "comandas/.*rodadas" frontend/src`).

- [ ] **Step 5: Verificar tipos**

Run: `cd frontend && npx tsc -b` e (raiz) `npx tsc --noEmit`
Expected: zero erros nos dois.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mesas.tsx src/routes/rodadas.ts
git commit -m "feat: Mesas monta pedido em rascunho, revisa a mesa inteira e envia de uma vez"
```

---

### Task 6: Verificação ao vivo + docs + push

- [ ] **Step 1: Subir back + front locais** (`docker compose up -d`, `npm run dev`, `cd frontend && npm run dev`).
- [ ] **Step 2: Verificação no navegador** (galeteria de teste, módulo mesas ativo): abrir uma mesa, criar 2 comandas (ex.: "Carlos", "Geral"); adicionar itens em cada uma → aparecem como "Não enviado", **nada** aparece na Produção nem entra na conta/Caixa; adicionar uma Coca no Geral; "Revisar e enviar pedido" → conferir o resumo da mesa inteira; remover um item; voltar e adicionar; "Confirmar e enviar tudo pra cozinha" → só então os itens aparecem na tela de Produção (uma rodada por comanda) e entram na conta do Caixa. Testar persistência: com rascunho pendente, recarregar a página (F5) e confirmar que o rascunho continua lá.
- [ ] **Step 3: Limpar dados de teste** (cancelar conta/mesa, remover itens/categorias criados).
- [ ] **Step 4: Atualizar "Log de mudanças" do CLAUDE.md** e a memória do módulo de mesas.
- [ ] **Step 5: `git pull --rebase && git push`** — avisar que tem migration nova (Railway roda `prisma migrate deploy` no deploy); confirmar no log do Railway que o deploy anterior terminou antes de pushar.
