# Impressão na Produção + permissão `producao` + Dashboard com vendas de Mesas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a impressão automática de rodada da tela do garçom (Mesas) pra tela de Produção, separar `producao` de `mesas` como permissão de operador, e incluir os pagamentos do módulo de Mesas no faturamento do dia do Dashboard.

**Architecture:** Três mudanças pequenas e independentes sobre código existente. A impressão reusa o padrão iframe-oculto da Cozinha, disparada pelo evento de socket `producao:item-novo` com dedupe por `rodadaId`. A permissão nova entra na lista validada do backend e re-gateia 4 rotas (o `temPermissao` já é variádico/OR — sem helper novo). O Dashboard soma `Pagamento` confirmado do dia via `prisma.pagamento.aggregate` no mesmo recorte de calendário já usado.

**Tech Stack:** Fastify 5 + Prisma 7 (backend), React 19 + Socket.IO client (frontend), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-impressao-producao-permissao-dashboard-design.md`

## Global Constraints

- TypeScript strict, sem `any` implícito, sem `@ts-ignore`.
- Imutabilidade — nunca mutar objeto/array recebido (exceção consciente: `Set` em `useRef` para dedupe de sessão, estado interno local que nunca é lido pelo render).
- Sem `console.log` novo em código commitado.
- Sem migration de schema nesta feature (nenhuma mudança em `prisma/schema.prisma`).
- Mudanças de payload aditivas — `faturamentoTotal` mantém o nome; campos novos são adicionados.
- Commits no padrão conventional commits.
- Verificação: `npx vitest run` e `npx tsc --noEmit` (backend, raiz) + `npx tsc -b` (frontend, `frontend/`) antes de cada commit.

---

### Task 1: Backend — permissão `producao` validada e rotas re-gateadas

**Files:**
- Modify: `src/routes/operadores.ts:7`
- Modify: `src/routes/producao.ts:12`
- Modify: `src/routes/rodadas.ts:145` (GET /rodadas/:id) e `src/routes/rodadas.ts:171` (PATCH /rodadas/:id/avancar)
- Modify: `src/routes/contas.ts:245` (PATCH /itens-comanda/:id/status)

**Interfaces:**
- Consumes: `temPermissao(...permissoes: string[])` de `src/plugins/auth.ts` (já existente, OR semântica, DONO sempre passa).
- Produces: valor de permissão `'producao'` aceito em `POST/PATCH /operadores`; rotas de produção exigindo `'producao'`.

Não há lógica nova — é reconfiguração de guardas já testadas (`src/plugins/auth.test.ts` cobre a semântica OR e o bloqueio 403). Sem teste unitário novo; a verificação de acesso por papel acontece na Task 6 (ao vivo).

- [ ] **Step 1: Adicionar `'producao'` à lista de permissões válidas**

Em `src/routes/operadores.ts` linha 7:

```ts
const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes', 'mesas', 'producao', 'caixa', 'estoque'] as const;
```

- [ ] **Step 2: Re-gatear as rotas**

`src/routes/producao.ts` linha 12 (rota `GET /producao/itens`):

```ts
onRequest: [autenticar, temPermissao('producao'), moduloAtivo('mesas')],
```

`src/routes/rodadas.ts` linha 145 (rota `GET /rodadas/:id` — alimenta a página de impressão, leitura compartilhada):

```ts
onRequest: [autenticar, temPermissao('mesas', 'producao'), moduloAtivo('mesas')],
```

`src/routes/rodadas.ts` linha 171 (rota `PATCH /rodadas/:id/avancar` — ação da Produção):

```ts
onRequest: [autenticar, temPermissao('producao'), moduloAtivo('mesas')],
```

`src/routes/contas.ts` linha 245 (rota `PATCH /itens-comanda/:id/status` — avanço/cancelamento de item existe nas telas de Mesas e Produção):

```ts
onRequest: [autenticar, temPermissao('mesas', 'producao'), moduloAtivo('mesas')],
```

**NÃO mudar:** `POST /comandas/:id/rodadas` (`src/routes/rodadas.ts:38`) continua `temPermissao('mesas')`.

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todos os testes passam, zero erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add src/routes/operadores.ts src/routes/producao.ts src/routes/rodadas.ts src/routes/contas.ts
git commit -m "feat: permissão 'producao' separada de 'mesas' no backend"
```

---

### Task 2: Frontend — permissão `producao` (tipo, label, rota, nav)

**Files:**
- Modify: `frontend/src/lib/permissoes.ts`
- Modify: `frontend/src/App.tsx:49`
- Modify: `frontend/src/components/Layout.tsx:103-125`

**Interfaces:**
- Consumes: `RotaPermissao` (guard existente), `temPermissao(permissao: Permissao)` do próprio `lib/permissoes.ts`.
- Produces: `Permissao` inclui `'producao'`; checkbox aparece sozinho na tela de Operadores (renderiza `TODAS_PERMISSOES`).

- [ ] **Step 1: `frontend/src/lib/permissoes.ts` — tipo, lista e rota de redirecionamento**

```ts
export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes' | 'mesas' | 'producao' | 'caixa' | 'estoque'
```

Em `TODAS_PERMISSOES`, logo após a entrada de `mesas`:

```ts
  { id: 'producao',      label: 'Produção — acompanhar e avançar itens em preparo' },
```

Em `ROTA_POR_PERMISSAO`, logo após a entrada de `mesas`:

```ts
  { permissao: 'producao', rota: '/producao' },
```

- [ ] **Step 2: `frontend/src/App.tsx` — guard da rota**

Linha 49, trocar `permissao="mesas"` por `permissao="producao"`:

```tsx
      <Route path="/producao"  element={<RotaPermissao permissao="producao"><Producao /></RotaPermissao>} />
```

- [ ] **Step 3: `frontend/src/components/Layout.tsx` — link do nav**

Após a linha `const podeMesas = ...` (linha 103), adicionar:

```ts
  const podeProducao = isDono || temPermissao('producao')
```

Após `const mostrarMesas = ...` (linha 114), adicionar:

```ts
  const mostrarProducao = podeProducao && modulosAtivos.includes('mesas')
```

No array `itensPrincipais` (linha 125), trocar o `show` do item Produção:

```ts
    { to: '/producao',  label: 'Produção', icon: ClipboardList, show: mostrarProducao },
```

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b && cd ..`
Expected: zero erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/permissoes.ts frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: permissão 'producao' no frontend — rota, nav e checkbox de operador"
```

---

### Task 3: Frontend — impressão automática move de Mesas pra Produção

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx:252-262,282`
- Modify: `frontend/src/pages/Producao.tsx:1,58-75,198-212`

**Interfaces:**
- Consumes: evento de socket `producao:item-novo` com payload `ItemProducao` (campo `rodadaId: string | null`); página `/imprimir/rodada/:rodadaId` (existente, sem mudança).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Remover a impressão de `Mesas.tsx`**

Apagar a função inteira `imprimirRodadaAutomaticamente` (linhas 252-262) e a chamada `imprimirRodadaAutomaticamente(dados.rodadaId)` dentro de `enviarPedido` (linha 282). Nenhum outro ponto de `Mesas.tsx` referencia impressão.

- [ ] **Step 2: Adicionar impressão com dedupe em `Producao.tsx`**

Import (linha 1):

```tsx
import { useEffect, useRef, useState } from 'react'
```

Dentro do componente `Producao`, junto dos outros estados (após a linha 68 `const [agora, ...]`):

```tsx
  // Rodadas já impressas nesta aba — dedupe porque a rodada chega como N eventos
  // 'producao:item-novo' (um por item) e deve imprimir uma vez só.
  const rodadasImpressasRef = useRef<Set<string>>(new Set())

  function imprimirRodadaAutomaticamente(rodadaId: string) {
    if (rodadasImpressasRef.current.has(rodadaId)) return
    rodadasImpressasRef.current.add(rodadaId)
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
```

- [ ] **Step 3: Disparar no evento `producao:item-novo` (e só nele)**

No `useEffect` do socket (linhas 198-212), separar os handlers — item novo imprime, item atualizado não:

```tsx
  useEffect(() => {
    if (!socket) return

    function aoReceberItemNovo(item: ItemProducao) {
      if (item.rodadaId) imprimirRodadaAutomaticamente(item.rodadaId)
      atualizarItemLocal(item)
    }

    function aoReceberItemAtualizado(item: ItemProducao) {
      atualizarItemLocal(item)
    }

    socket.on('producao:item-novo', aoReceberItemNovo)
    socket.on('producao:item-atualizado', aoReceberItemAtualizado)

    return () => {
      socket.off('producao:item-novo', aoReceberItemNovo)
      socket.off('producao:item-atualizado', aoReceberItemAtualizado)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])
```

Itens sem `rodadaId` (pré-feature de rodadas) não disparam impressão. Itens carregados pelo fetch inicial (`carregarItens`) também não — só eventos de socket imprimem.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b && cd ..`
Expected: zero erros de tipo (confirma inclusive que nenhuma referência órfã a `imprimirRodadaAutomaticamente` sobrou em `Mesas.tsx`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Mesas.tsx frontend/src/pages/Producao.tsx
git commit -m "feat: impressão automática da rodada dispara na tela de Produção, não mais na do garçom"
```

---

### Task 4: Backend — Dashboard soma pagamentos do módulo de Mesas

**Files:**
- Modify: `src/routes/estabelecimentos.ts:147-159,191-196`

**Interfaces:**
- Consumes: `resolverIntervaloPeriodo()` (já importado no arquivo), model `Pagamento` (`status: StatusPagamento`, `valor: Decimal`, `criadoEm`, `estabelecimentoId`).
- Produces: payload `estatisticas` com campos novos `faturamentoPedidos: number` e `faturamentoMesas: number` (aditivos); `faturamentoTotal` passa a ser a soma dos dois; `ticketMedio` continua calculado só sobre pedidos.

- [ ] **Step 1: Agregar pagamentos confirmados do dia e recompor os KPIs**

Em `src/routes/estabelecimentos.ts`, substituir o bloco das linhas 147-159:

```ts
    // Estatísticas de hoje.
    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: { not: 'cancelado' },
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      select: { total: true },
    });

    // Venda do módulo de Mesas conta pelo Pagamento confirmado no Caixa (decisão da spec de
    // 2026-07-16): dinheiro que de fato entrou hoje; estorno muda o status e sai da soma.
    const pagamentosMesasHoje = await prisma.pagamento.aggregate({
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: 'confirmado',
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      _sum: { valor: true },
    });

    const totalPedidos = pedidosHoje.length;
    const faturamentoPedidos = pedidosHoje.reduce((soma, p) => soma + Number(p.total), 0);
    const faturamentoMesas   = Number(pagamentosMesasHoje._sum.valor ?? 0);
    const faturamentoTotal   = faturamentoPedidos + faturamentoMesas;
    // Ticket médio segue só sobre Pedido — pagamento de mesa não é 1 pedido = 1 pagamento.
    const ticketMedio = totalPedidos > 0 ? faturamentoPedidos / totalPedidos : 0;
```

- [ ] **Step 2: Expor os campos novos no payload**

No objeto de retorno (linhas 191-196), o bloco `estatisticas` vira:

```ts
      estatisticas: {
        emAndamento,
        totalPedidos,
        faturamentoTotal,
        faturamentoPedidos,
        faturamentoMesas,
        ticketMedio,
      },
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todos os testes passam, zero erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add src/routes/estabelecimentos.ts
git commit -m "feat: dashboard soma pagamentos confirmados do módulo de Mesas no faturamento do dia"
```

---

### Task 5: Frontend — card de faturamento com a quebra delivery/balcão · mesas

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx:34-39,138-143,292-305`

**Interfaces:**
- Consumes: payload da Task 4 (`estatisticas.faturamentoPedidos`, `estatisticas.faturamentoMesas`).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Tipo `DashboardData`**

Bloco `estatisticas` (linhas 34-39) vira:

```ts
  estatisticas: {
    emAndamento: number
    totalPedidos: number
    faturamentoTotal: number
    faturamentoPedidos: number
    faturamentoMesas: number
    ticketMedio: number
  }
```

- [ ] **Step 2: `KpiCard` ganha sublabel opcional**

Assinatura e JSX (linhas 292-305) viram:

```tsx
function KpiCard({ label, valor, sub, Icone, cor }: { label: string; valor: string; sub?: string; Icone: LucideIcon; cor: string }) {
  const c = corClasses[cor]
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.bg}`}>
          <Icone className={`h-5 w-5 ${c.text}`} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold">{valor}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Card de faturamento com a quebra**

O primeiro `KpiCard` (linhas 138-143) vira — quebra só aparece quando houve venda de mesa no dia (estabelecimento sem o módulo não vê ruído):

```tsx
        <KpiCard
          label="Faturamento (hoje)"
          valor={formatarBRL(dados.estatisticas.faturamentoTotal)}
          sub={dados.estatisticas.faturamentoMesas > 0
            ? `delivery/balcão ${formatarBRL(dados.estatisticas.faturamentoPedidos)} · mesas ${formatarBRL(dados.estatisticas.faturamentoMesas)}`
            : undefined}
          Icone={Wallet}
          cor="emerald"
        />
```

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b && cd ..`
Expected: zero erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: card de faturamento do dashboard mostra quebra delivery/balcão vs mesas"
```

---

### Task 6: Verificação ao vivo + log + push

**Files:**
- Modify: `CLAUDE.md` (seção "Log de mudanças")

- [ ] **Step 1: Subir backend e frontend locais**

```bash
docker compose up -d
npm run dev            # backend (terminal 1)
cd frontend && npm run dev   # frontend (terminal 2)
```

- [ ] **Step 2: Verificação ao vivo no navegador (galeteria de teste, módulo mesas habilitado temporariamente se necessário)**

Roteiro:
1. Como DONO, criar/editar um operador e conferir o checkbox novo "Produção — acompanhar e avançar itens em preparo".
2. Operador A só com `mesas`: loga, vê link Mesas mas NÃO vê link Produção; acessar `/producao` direto redireciona; enviar uma rodada pela tela de Mesas **não** dispara impressão na aba dele.
3. Operador B só com `producao` (ou DONO em outra aba na tela de Produção): ao chegar a rodada do passo 2, a aba de Produção dispara o diálogo de impressão **uma vez só** (rodada com 2+ itens pra provar o dedupe).
4. Operador B consegue "Avançar rodada" e avançar/cancelar item individual; operador A continua conseguindo lançar rodada e cancelar item pela tela de Mesas.
5. Registrar um pagamento no Caixa e conferir no Dashboard (DONO) o faturamento de hoje incluindo o valor, com a quebra "delivery/balcão · mesas" no card.
6. Estornar o pagamento e conferir que o valor sai do faturamento.

- [ ] **Step 3: Atualizar o Log de mudanças do CLAUDE.md**

Nova entrada 2026-07-16 resumindo as três mudanças (impressão movida, permissão `producao` sem backfill — DONO precisa marcar `producao` nos operadores de produção após o deploy —, dashboard somando `Pagamento` confirmado).

- [ ] **Step 4: Commit final + push**

```bash
git add CLAUDE.md
git commit -m "docs: registra impressão na Produção, permissão producao e dashboard com mesas no log"
git pull --rebase
git push
```

Lembrete pós-deploy (avisar o usuário): marcar `producao` nos operadores que trabalham na Produção — sem backfill, eles perdem o acesso até isso.
