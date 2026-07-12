# Dashboard com filtro de data + Tela financeira — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um filtro de período reutilizável ao Dashboard (com "Hoje" como padrão em vez
de faturamento acumulado desde sempre), uma lista dos dias que mais venderam, e uma nova tela
financeira (só DONO) com a quebra do faturamento por forma de pagamento.

**Architecture:** Uma função utilitária pura resolve o período (padrão "hoje", em
`America/Sao_Paulo`, nunca UTC bruto) e é usada por duas rotas backend (`/dashboard`, que passa a
aceitar `inicio`/`fim`, e a nova `/financeiro`). No frontend, um componente `FiltroPeriodo`
reutilizável (presets + intervalo customizado) alimenta as duas páginas.

**Tech Stack:** Node 22 + TypeScript + Fastify 5 + Prisma 7 (backend); React 19 + Vite + Tailwind +
Recharts (frontend); Vitest para os testes do utilitário puro.

## Global Constraints

- Escopo é só `Pedido` (delivery/balcão/link público) — módulo de Mesas (`Conta`/`Pagamento`) fica
  de fora deste pacote.
- Todo agrupamento/filtro por dia usa o calendário de `America/Sao_Paulo`, nunca
  `Date.toISOString()`/UTC bruto — Brasil não observa horário de verão desde 2019, então o offset
  fixo `-03:00` é seguro de usar diretamente (sem precisar de biblioteca de timezone).
- A tela `/financeiro` é **só DONO** (`apenasDono`, mesmo padrão de `src/routes/auditoria.ts`) —
  sem permissão configurável pra operador.
- KPI "Em andamento" no Dashboard **nunca** é filtrado por período — reflete sempre o estado atual
  da cozinha (pedidos com status `recebido`/`em_preparo`/`pronto`), independente do período
  selecionado.
- Sem testes automatizados de componente React neste projeto (não há infraestrutura) —
  verificação do frontend é manual, no navegador.

---

### Task 1: Utilitário de resolução de período (`periodoRelatorio.ts`)

**Files:**
- Create: `src/utils/periodoRelatorio.ts`
- Test: `src/utils/periodoRelatorio.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa do plano).
- Produces: `diaSaoPaulo(data: Date): string` e
  `resolverIntervaloPeriodo(inicioStr?: string, fimStr?: string): { inicioUTC: Date; fimUTC: Date; inicioLabel: string; fimLabel: string }`
  — usadas pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever os testes que devem falhar**

Criar `src/utils/periodoRelatorio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diaSaoPaulo, resolverIntervaloPeriodo } from './periodoRelatorio.js';

describe('diaSaoPaulo', () => {
  it('converte um horário UTC de madrugada (ainda dia anterior em Brasília) pro dia certo', () => {
    // 2026-07-12T02:00:00Z = 2026-07-11T23:00:00-03:00 (ainda 11 em Brasília)
    const data = new Date('2026-07-12T02:00:00Z');
    expect(diaSaoPaulo(data)).toBe('2026-07-11');
  });

  it('converte um horário UTC já bem avançado no dia', () => {
    // 2026-07-12T15:00:00Z = 2026-07-12T12:00:00-03:00
    const data = new Date('2026-07-12T15:00:00Z');
    expect(diaSaoPaulo(data)).toBe('2026-07-12');
  });
});

describe('resolverIntervaloPeriodo', () => {
  it('sem parâmetros, usa o dia de hoje em Brasília como início e fim', () => {
    const resultado = resolverIntervaloPeriodo();
    const hojeEsperado = diaSaoPaulo(new Date());
    expect(resultado.inicioLabel).toBe(hojeEsperado);
    expect(resultado.fimLabel).toBe(hojeEsperado);
  });

  it('com parâmetros, usa exatamente as datas informadas', () => {
    const resultado = resolverIntervaloPeriodo('2026-07-01', '2026-07-10');
    expect(resultado.inicioLabel).toBe('2026-07-01');
    expect(resultado.fimLabel).toBe('2026-07-10');
  });

  it('inicioUTC é meia-noite em Brasília (03:00 UTC) do dia informado', () => {
    const resultado = resolverIntervaloPeriodo('2026-07-01', '2026-07-01');
    expect(resultado.inicioUTC.toISOString()).toBe('2026-07-01T03:00:00.000Z');
  });

  it('fimUTC é o último instante do dia em Brasília (02:59:59.999 UTC do dia seguinte)', () => {
    const resultado = resolverIntervaloPeriodo('2026-07-01', '2026-07-01');
    expect(resultado.fimUTC.toISOString()).toBe('2026-07-02T02:59:59.999Z');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/vinicius/comanda-ia && npx vitest run src/utils/periodoRelatorio.test.ts`
Expected: FAIL — `Cannot find module './periodoRelatorio.js'`

- [ ] **Step 3: Implementar**

Criar `src/utils/periodoRelatorio.ts`:

```ts
// Brasil não observa horário de verão desde 2019 — offset fixo é seguro sem
// precisar de biblioteca de timezone.
const OFFSET_BRASIL = '-03:00';

/** Dia-calendário (YYYY-MM-DD) de uma data, no fuso de Brasília — nunca use
 *  `Date.toISOString().slice(0,10)` pra isso (agrupa pelo dia em UTC, que pode
 *  já estar "amanhã" perto da meia-noite em Brasília). */
export function diaSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(data);
}

/** Resolve um período de relatório a partir de datas opcionais (YYYY-MM-DD).
 *  Sem parâmetros, usa o dia de hoje (em Brasília) como início e fim. */
export function resolverIntervaloPeriodo(inicioStr?: string, fimStr?: string): {
  inicioUTC: Date;
  fimUTC: Date;
  inicioLabel: string;
  fimLabel: string;
} {
  const hoje = diaSaoPaulo(new Date());
  const inicioLabel = inicioStr ?? hoje;
  const fimLabel = fimStr ?? hoje;

  const inicioUTC = new Date(`${inicioLabel}T00:00:00${OFFSET_BRASIL}`);
  const fimUTC    = new Date(`${fimLabel}T23:59:59.999${OFFSET_BRASIL}`);

  return { inicioUTC, fimUTC, inicioLabel, fimLabel };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd /Users/vinicius/comanda-ia && npx vitest run src/utils/periodoRelatorio.test.ts`
Expected: PASS (6/6 testes)

- [ ] **Step 5: Rodar a suíte inteira (confirma que nada quebrou)**

Run: `cd /Users/vinicius/comanda-ia && npm test`
Expected: todos os testes existentes + os 6 novos passando.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add src/utils/periodoRelatorio.ts src/utils/periodoRelatorio.test.ts
git commit -m "feat: utilitário de resolução de período pra relatórios (dia-calendário em Brasília)"
```

---

### Task 2: Backend — `/meu-estabelecimento/dashboard` respeita período + emAndamento + topDias

**Files:**
- Modify: `src/routes/estabelecimentos.ts:118-239` (rota `GET /meu-estabelecimento/dashboard`)

**Interfaces:**
- Consumes: `resolverIntervaloPeriodo`, `diaSaoPaulo` de `../utils/periodoRelatorio.js` (Task 1).
- Produces: novo formato de resposta da rota (campos `estatisticas.emAndamento`,
  `estatisticas.topDias`, `periodo`; `estatisticas.totalPedidos`/`faturamentoTotal`/`ticketMedio`/
  `vendasPorDia` passam a ser escopados ao período; `estatisticas.porStatus` deixa de existir na
  resposta) — usado pela Task 5 (frontend Dashboard).

- [ ] **Step 1: Ler o início do arquivo pra confirmar os imports existentes**

Run: `head -10 src/routes/estabelecimentos.ts`

Confirme que `import { Type } from '@sinclair/typebox';`, `import { prisma } from '../database.js';`
e `import { autenticar } from '../plugins/auth.js';` (ou equivalente) já existem — a rota já usa
`prisma`/`autenticar`/`Type`, então não deve faltar nenhum import básico. Adicione, junto dos
outros imports no topo do arquivo:

```ts
import { resolverIntervaloPeriodo, diaSaoPaulo } from '../utils/periodoRelatorio.js';
```

Adicione também, junto dos outros schemas TypeBox já definidos no arquivo (ex: perto de
`AtualizarEstabelecimentoSchema`):

```ts
const PeriodoQuerySchema = Type.Object({
  inicio: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  fim:    Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
});
```

- [ ] **Step 2: Substituir o corpo da rota**

Localize o bloco completo da rota (de `fastify.get('/meu-estabelecimento/dashboard', {` até o `});`
que fecha o handler — é o trecho entre as linhas 118 e 239 no arquivo atual). Substitua o handler
inteiro por:

```ts
  fastify.get('/meu-estabelecimento/dashboard', {
    onRequest: [autenticar],
    schema: { querystring: PeriodoQuerySchema },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const { inicio, fim } = request.query as { inicio?: string; fim?: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId! },
      include: {
        itens:   { orderBy: { nome: 'asc' } },
        pedidos: { orderBy: { criadoEm: 'desc' }, take: 10 },
      },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const { inicioUTC, fimUTC, inicioLabel, fimLabel } = resolverIntervaloPeriodo(inicio, fim);

    // "Em andamento" é sempre o estado atual da cozinha — nunca filtrado por período.
    const emAndamentoAgregado = await prisma.pedido.groupBy({
      by: ['status'],
      where: { estabelecimentoId: estabelecimentoId!, status: { in: ['recebido', 'em_preparo', 'pronto'] } },
      _count: { id: true },
    });
    const emAndamento = emAndamentoAgregado.reduce((soma, item) => soma + item._count.id, 0);

    // Estatísticas do período selecionado (padrão: hoje, em Brasília).
    const pedidosPeriodo = await prisma.pedido.findMany({
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: { not: 'cancelado' },
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      select: { criadoEm: true, total: true },
    });

    const totalPedidos = pedidosPeriodo.length;
    const faturamentoTotal = pedidosPeriodo.reduce((soma, p) => soma + Number(p.total), 0);
    const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;

    const vendasPorDiaMap = pedidosPeriodo.reduce<Record<string, { data: string; pedidos: number; faturamento: number }>>(
      (acc, p) => {
        const dia = diaSaoPaulo(p.criadoEm);
        const anterior = acc[dia] ?? { data: dia, pedidos: 0, faturamento: 0 };
        return {
          ...acc,
          [dia]: {
            ...anterior,
            pedidos:     anterior.pedidos + 1,
            faturamento: anterior.faturamento + Number(p.total),
          },
        };
      },
      {},
    );

    const vendasPorDia = Object.values(vendasPorDiaMap).sort((a, b) => a.data.localeCompare(b.data));
    const topDias = [...vendasPorDia]
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 5)
      .map((d) => ({ data: d.data, faturamento: d.faturamento }));

    // Avaliações (sem filtro de período — mesmo comportamento de antes).
    const avaliacoesAgregadas = await prisma.pedido.aggregate({
      where: { estabelecimentoId: estabelecimentoId!, avaliacao: { not: null } },
      _avg:   { avaliacao: true },
      _count: { avaliacao: true },
    });

    const distribuicaoNotas = await prisma.pedido.groupBy({
      by:    ['avaliacao'],
      where: { estabelecimentoId: estabelecimentoId!, avaliacao: { not: null } },
      _count: { id: true },
      orderBy: { avaliacao: 'desc' },
    });

    const avaliacoesRecentes = await prisma.pedido.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, avaliacao: { not: null } },
      orderBy: { criadoEm: 'desc' },
      take:    5,
      select:  { clienteNome: true, avaliacao: true, comentarioAvaliacao: true, criadoEm: true },
    });

    return {
      estabelecimento: {
        id:       estabelecimento.id,
        nome:     estabelecimento.nome,
        telefone: estabelecimento.telefone,
        status:   estabelecimento.status,
      },
      cardapio:        estabelecimento.itens,
      pedidosRecentes: estabelecimento.pedidos,
      periodo: { inicio: inicioLabel, fim: fimLabel },
      estatisticas: {
        emAndamento,
        totalPedidos,
        faturamentoTotal,
        ticketMedio,
        vendasPorDia,
        topDias,
      },
      avaliacoes: {
        media:        avaliacoesAgregadas._avg.avaliacao
          ? Math.round(avaliacoesAgregadas._avg.avaliacao * 10) / 10
          : null,
        total:        avaliacoesAgregadas._count.avaliacao,
        distribuicao: distribuicaoNotas.map((d) => ({
          nota:       d.avaliacao as number,
          quantidade: d._count.id,
        })),
        recentes: avaliacoesRecentes.map((a) => ({
          clienteNome:         a.clienteNome,
          avaliacao:           a.avaliacao as number,
          comentarioAvaliacao: a.comentarioAvaliacao,
          criadoEm:            a.criadoEm,
        })),
      },
    };
  });
```

- [ ] **Step 3: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes**

Run: `cd /Users/vinicius/comanda-ia && npm test`
Expected: todos os testes passando (esta rota não tem teste automatizado hoje — verificação
funcional será manual na Task 5, quando o frontend consumir a rota).

- [ ] **Step 5: Verificação manual rápida via curl**

Com o backend rodando localmente (`npm run dev`), pegue um token JWT válido (login de teste) e rode:

```bash
curl -s http://localhost:3000/meu-estabelecimento/dashboard \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" | python3 -m json.tool
```

Confirme que a resposta tem `periodo.inicio` e `periodo.fim` iguais (dia de hoje), e que
`estatisticas` tem `emAndamento`, `topDias` e não tem mais `porStatus`.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add src/routes/estabelecimentos.ts
git commit -m "feat: dashboard aceita filtro de período e calcula top 5 dias de venda"
```

---

### Task 3: Backend — nova rota `/meu-estabelecimento/financeiro`

**Files:**
- Create: `src/routes/financeiro.ts`
- Modify: `src/server.ts` (registrar a rota nova)

**Interfaces:**
- Consumes: `resolverIntervaloPeriodo` de `../utils/periodoRelatorio.js` (Task 1).
- Produces: `GET /meu-estabelecimento/financeiro?inicio=YYYY-MM-DD&fim=YYYY-MM-DD` — usada pela
  Task 6 (frontend Financeiro.tsx).

- [ ] **Step 1: Criar a rota**

Criar `src/routes/financeiro.ts`:

```ts
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';
import { resolverIntervaloPeriodo } from '../utils/periodoRelatorio.js';

const PeriodoQuerySchema = Type.Object({
  inicio: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  fim:    Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
});

export async function financeiroRoutes(fastify: FastifyInstance) {
  fastify.get('/meu-estabelecimento/financeiro', {
    onRequest: [autenticar, apenasDono],
    schema: { querystring: PeriodoQuerySchema },
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const { inicio, fim } = request.query as { inicio?: string; fim?: string };

    const { inicioUTC, fimUTC, inicioLabel, fimLabel } = resolverIntervaloPeriodo(inicio, fim);

    const agregadoPorForma = await prisma.pedido.groupBy({
      by: ['formaPagamento'],
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: { not: 'cancelado' },
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      _count: { id: true },
      _sum:   { total: true },
    });

    const porFormaPagamento = agregadoPorForma.map((item) => ({
      formaPagamento: item.formaPagamento,
      quantidade:     item._count.id,
      total:          Number(item._sum.total ?? 0),
    }));

    const totalGeral = porFormaPagamento.reduce((soma, item) => soma + item.total, 0);

    return {
      periodo: { inicio: inicioLabel, fim: fimLabel },
      porFormaPagamento,
      totalGeral,
    };
  });
}
```

- [ ] **Step 2: Registrar a rota em `src/server.ts`**

Localize a linha de import das rotas (perto de `import { auditoriaRoutes } from './routes/auditoria.js';`)
e adicione logo abaixo:

```ts
import { financeiroRoutes } from './routes/financeiro.js';
```

Localize a linha `await fastify.register(auditoriaRoutes);` e adicione logo abaixo:

```ts
  await fastify.register(financeiroRoutes);
```

- [ ] **Step 3: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes**

Run: `cd /Users/vinicius/comanda-ia && npm test`
Expected: todos os testes passando.

- [ ] **Step 5: Verificação manual via curl (dois casos: DONO e sem ser DONO)**

Com o backend rodando localmente, usando um token de DONO:

```bash
curl -s http://localhost:3000/meu-estabelecimento/financeiro \
  -H "Authorization: Bearer TOKEN_DE_DONO" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 200`, com `porFormaPagamento` e `totalGeral`.

Repita com um token de operador (não-DONO), se houver um estabelecimento de teste com operador
cadastrado:

```bash
curl -s http://localhost:3000/meu-estabelecimento/financeiro \
  -H "Authorization: Bearer TOKEN_DE_OPERADOR" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 403` (bloqueado por `apenasDono`, mesmo comportamento de `/auditoria`).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add src/routes/financeiro.ts src/server.ts
git commit -m "feat: rota financeiro com quebra de faturamento por forma de pagamento"
```

---

### Task 4: Frontend — componente `FiltroPeriodo`

**Files:**
- Create: `frontend/src/components/FiltroPeriodo.tsx`

**Interfaces:**
- Consumes: nada (componente novo e independente).
- Produces: componente `FiltroPeriodo` com props
  `{ onMudarPeriodo: (inicio: string, fim: string) => void }` — usado pelas Tasks 5 e 6.

- [ ] **Step 1: Criar o componente**

Criar `frontend/src/components/FiltroPeriodo.tsx`:

```tsx
import { useState } from 'react'
import { Calendar } from 'lucide-react'

type Preset = 'hoje' | '7dias' | '30dias' | 'mes' | 'personalizado'

function formatarDataLocal(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function calcularIntervalo(preset: Exclude<Preset, 'personalizado'>): { inicio: string; fim: string } {
  const hoje = new Date()
  const fim = formatarDataLocal(hoje)

  if (preset === 'hoje') return { inicio: fim, fim }

  if (preset === '7dias') {
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - 6)
    return { inicio: formatarDataLocal(inicio), fim }
  }

  if (preset === '30dias') {
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - 29)
    return { inicio: formatarDataLocal(inicio), fim }
  }

  // 'mes' — do dia 1 do mês atual até hoje
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return { inicio: formatarDataLocal(inicio), fim }
}

const presetLabel: Record<Exclude<Preset, 'personalizado'>, string> = {
  hoje:    'Hoje',
  '7dias': '7 dias',
  '30dias': '30 dias',
  mes:     'Este mês',
}

export default function FiltroPeriodo({ onMudarPeriodo }: { onMudarPeriodo: (inicio: string, fim: string) => void }) {
  const [presetAtivo, setPresetAtivo] = useState<Preset>('hoje')
  const [dataInicioCustom, setDataInicioCustom] = useState('')
  const [dataFimCustom, setDataFimCustom] = useState('')

  function selecionarPreset(preset: Exclude<Preset, 'personalizado'>) {
    setPresetAtivo(preset)
    const { inicio, fim } = calcularIntervalo(preset)
    onMudarPeriodo(inicio, fim)
  }

  function aplicarPersonalizado() {
    if (!dataInicioCustom || !dataFimCustom) return
    setPresetAtivo('personalizado')
    onMudarPeriodo(dataInicioCustom, dataFimCustom)
  }

  const botaoClasse = (ativo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      ativo ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
    }`

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <Calendar className="h-4 w-4" />
      </div>
      {(['hoje', '7dias', '30dias', 'mes'] as const).map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => selecionarPreset(preset)}
          className={botaoClasse(presetAtivo === preset)}
        >
          {presetLabel[preset]}
        </button>
      ))}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">De</span>
        <input
          type="date"
          value={dataInicioCustom}
          onChange={(e) => setDataInicioCustom(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">Até</span>
        <input
          type="date"
          value={dataFimCustom}
          onChange={(e) => setDataFimCustom(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
        />
      </label>
      <button type="button" onClick={aplicarPersonalizado} className={botaoClasse(presetAtivo === 'personalizado')}>
        Aplicar
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia/frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /Users/vinicius/comanda-ia/frontend
git add src/components/FiltroPeriodo.tsx
git commit -m "feat: componente reutilizável de filtro de período (presets + intervalo customizado)"
```

---

### Task 5: Frontend — Dashboard usa o filtro e mostra Top 5 dias

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `FiltroPeriodo` (Task 4); novo formato de resposta de `/meu-estabelecimento/dashboard`
  (Task 2) — `estatisticas.emAndamento`, `estatisticas.topDias`, `periodo`, e a ausência de
  `estatisticas.porStatus`.
- Produces: nada (última tarefa que toca este arquivo).

- [ ] **Step 1: Atualizar a interface `DashboardData` e imports**

Localize (no topo do arquivo):

```ts
import { Wallet, ShoppingBag, TrendingUp, Receipt, Loader2, Star, type LucideIcon } from 'lucide-react'
```

Substitua por (adiciona `Calendar` pro ícone do card de Top 5 dias):

```ts
import { Wallet, ShoppingBag, TrendingUp, Receipt, Loader2, Star, Calendar, type LucideIcon } from 'lucide-react'
```

Adicione, logo após o import de `Layout`:

```ts
import FiltroPeriodo from '../components/FiltroPeriodo'
```

Localize a interface `DashboardData` completa:

```ts
interface DashboardData {
  estabelecimento: {
    id: string
    nome: string
    telefone: string
    status: 'pendente' | 'ativo' | 'suspenso'
  }
  cardapio: Array<{
    id: string
    nome: string
    preco: number | string
    disponivel: boolean
  }>
  pedidosRecentes: Array<{
    id: string
    clienteNome: string
    total: number | string
    status: string
    criadoEm: string
    tipoEntrega: string
  }>
  estatisticas: {
    totalPedidos: number
    faturamentoTotal: number
    ticketMedio: number
    porStatus: Array<{ status: string; quantidade: number }>
    vendasPorDia: VendaDia[]
  }
  avaliacoes: {
    media: number | null
    total: number
    distribuicao: Array<{ nota: number; quantidade: number }>
    recentes: AvaliacaoRecente[]
  }
}
```

Substitua por:

```ts
interface DashboardData {
  estabelecimento: {
    id: string
    nome: string
    telefone: string
    status: 'pendente' | 'ativo' | 'suspenso'
  }
  cardapio: Array<{
    id: string
    nome: string
    preco: number | string
    disponivel: boolean
  }>
  pedidosRecentes: Array<{
    id: string
    clienteNome: string
    total: number | string
    status: string
    criadoEm: string
    tipoEntrega: string
  }>
  periodo: { inicio: string; fim: string }
  estatisticas: {
    emAndamento: number
    totalPedidos: number
    faturamentoTotal: number
    ticketMedio: number
    vendasPorDia: VendaDia[]
    topDias: Array<{ data: string; faturamento: number }>
  }
  avaliacoes: {
    media: number | null
    total: number
    distribuicao: Array<{ nota: number; quantidade: number }>
    recentes: AvaliacaoRecente[]
  }
}
```

- [ ] **Step 2: Buscar dados considerando o período selecionado**

Localize:

```ts
export default function Dashboard() {
  const token = localStorage.getItem('token')
  const [dados, setDados] = useState<DashboardData | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!token) return

    fetch(`${API_URL}/meu-estabelecimento/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: DashboardData) => setDados(d))
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token])
```

Substitua por:

```ts
export default function Dashboard() {
  const token = localStorage.getItem('token')
  const [dados, setDados] = useState<DashboardData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null)

  useEffect(() => {
    if (!token) return

    const params = periodo ? `?inicio=${periodo.inicio}&fim=${periodo.fim}` : ''
    setCarregando(true)
    fetch(`${API_URL}/meu-estabelecimento/dashboard${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: DashboardData) => setDados(d))
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token, periodo])
```

- [ ] **Step 3: Remover o cálculo local de `emAndamento` e usar o do backend**

Localize:

```ts
  const emAndamento = dados.estatisticas.porStatus
    .filter((p) => ['recebido', 'em_preparo', 'pronto'].includes(p.status))
    .reduce((s, p) => s + p.quantidade, 0)

  const graficoData = dados.estatisticas.vendasPorDia.map((d) => ({
```

Substitua por:

```ts
  const graficoData = dados.estatisticas.vendasPorDia.map((d) => ({
```

(A variável `emAndamento` some daqui — os usos dela mais abaixo passam a ler
`dados.estatisticas.emAndamento` diretamente, no próximo passo.)

- [ ] **Step 4: Adicionar o `FiltroPeriodo`, ajustar os KPIs e adicionar o card de Top 5 dias**

Localize o bloco inteiro do cabeçalho + KPIs + gráfico:

```tsx
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold">Olá, {dados.estabelecimento.nome}</h2>
        <p className="mt-1 text-sm text-zinc-400">Visão geral do seu estabelecimento</p>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Faturamento total"
          valor={formatarBRL(dados.estatisticas.faturamentoTotal)}
          Icone={Wallet}
          cor="emerald"
        />
        <KpiCard
          label="Total de pedidos"
          valor={dados.estatisticas.totalPedidos.toString()}
          Icone={ShoppingBag}
          cor="orange"
        />
        <KpiCard
          label="Em andamento"
          valor={emAndamento.toString()}
          Icone={TrendingUp}
          cor="sky"
        />
        <KpiCard
          label="Ticket médio"
          valor={formatarBRL(dados.estatisticas.ticketMedio)}
          Icone={Receipt}
          cor="purple"
        />
      </div>

      {/* Gráfico de vendas */}
      {graficoData.length > 0 && (
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-6 text-lg font-bold">Faturamento — últimos 30 dias</h3>
```

Substitua por:

```tsx
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold">Olá, {dados.estabelecimento.nome}</h2>
        <p className="mt-1 text-sm text-zinc-400">Visão geral do seu estabelecimento</p>
      </div>

      <FiltroPeriodo onMudarPeriodo={(inicio, fim) => setPeriodo({ inicio, fim })} />

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`Faturamento — ${formatarDia(dados.periodo.inicio)} a ${formatarDia(dados.periodo.fim)}`}
          valor={formatarBRL(dados.estatisticas.faturamentoTotal)}
          Icone={Wallet}
          cor="emerald"
        />
        <KpiCard
          label="Pedidos no período"
          valor={dados.estatisticas.totalPedidos.toString()}
          Icone={ShoppingBag}
          cor="orange"
        />
        <KpiCard
          label="Em andamento"
          valor={dados.estatisticas.emAndamento.toString()}
          Icone={TrendingUp}
          cor="sky"
        />
        <KpiCard
          label="Ticket médio"
          valor={formatarBRL(dados.estatisticas.ticketMedio)}
          Icone={Receipt}
          cor="purple"
        />
      </div>

      {/* Top 5 dias */}
      {dados.estatisticas.topDias.length > 0 && (
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-orange-400" /> Dias que mais venderam
          </h3>
          <div className="space-y-2">
            {dados.estatisticas.topDias.map((d, i) => (
              <div key={d.data} className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-2.5">
                <span className="text-sm text-zinc-400">
                  <span className="mr-2 text-zinc-600">#{i + 1}</span>
                  {formatarDia(d.data)}
                </span>
                <span className="font-bold text-emerald-400">{formatarBRL(d.faturamento)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico de vendas */}
      {graficoData.length > 0 && (
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-6 text-lg font-bold">
            Faturamento — {formatarDia(dados.periodo.inicio)} a {formatarDia(dados.periodo.fim)}
          </h3>
```

- [ ] **Step 5: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia/frontend && npx tsc -b`
Expected: sem erros. Se der erro sobre `emAndamento` não definido, confirme que o Step 4 trocou
`valor={emAndamento.toString()}` por `valor={dados.estatisticas.emAndamento.toString()}` (o Step 3
removeu a variável local, o Step 4 já usa a leitura direta do backend).

- [ ] **Step 6: Verificação manual no navegador**

1. Rodar backend (`npm run dev` na raiz) e frontend (`cd frontend && npm run dev`).
2. Logar como DONO de um estabelecimento de teste, ir em `/dashboard`.
3. Confirmar que o filtro aparece, com "Hoje" selecionado por padrão.
4. Trocar entre os presets e um intervalo customizado — confirmar que os KPIs de Faturamento,
   Pedidos e Ticket médio mudam de acordo, mas "Em andamento" **não muda**.
5. Confirmar que o card "Dias que mais venderam" aparece quando há dados no período (ex: ao
   selecionar "30 dias" num banco de teste com pedidos variados).

- [ ] **Step 7: Commit**

```bash
cd /Users/vinicius/comanda-ia/frontend
git add src/pages/Dashboard.tsx
git commit -m "feat: dashboard usa filtro de período e mostra os 5 dias que mais venderam"
```

---

### Task 6: Frontend — nova tela `/financeiro` + link no menu

**Files:**
- Create: `frontend/src/pages/Financeiro.tsx`
- Modify: `frontend/src/components/Layout.tsx` (novo link no menu, só DONO)
- Modify: `frontend/src/App.tsx` (nova rota)

**Interfaces:**
- Consumes: `FiltroPeriodo` (Task 4); resposta de `GET /meu-estabelecimento/financeiro` (Task 3).
- Produces: nada (última tarefa do plano).

- [ ] **Step 1: Criar a página**

Criar `frontend/src/pages/Financeiro.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Landmark, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import FiltroPeriodo from '../components/FiltroPeriodo'
import { API_URL } from '../lib/api'

interface FinanceiroData {
  periodo: { inicio: string; fim: string }
  porFormaPagamento: Array<{ formaPagamento: string; quantidade: number; total: number }>
  totalGeral: number
}

const formaPagamentoLabel: Record<string, string> = {
  pix:            'Pix',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito:  'Cartão de débito',
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDia(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export default function Financeiro() {
  const token = localStorage.getItem('token')
  const [dados, setDados] = useState<FinanceiroData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null)

  useEffect(() => {
    if (!token) return

    const params = periodo ? `?inicio=${periodo.inicio}&fim=${periodo.fim}` : ''
    setCarregando(true)
    fetch(`${API_URL}/meu-estabelecimento/financeiro${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: FinanceiroData) => setDados(d))
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token, periodo])

  if (carregando) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      </Layout>
    )
  }

  if (!dados) {
    return (
      <Layout>
        <div className="text-center text-zinc-500">Não foi possível carregar o financeiro.</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <Landmark className="h-6 w-6" /> Financeiro
      </h2>

      <FiltroPeriodo onMudarPeriodo={(inicio, fim) => setPeriodo({ inicio, fim })} />

      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-sm text-zinc-400">
          Total no período ({formatarDia(dados.periodo.inicio)} a {formatarDia(dados.periodo.fim)})
        </p>
        <p className="mt-1 text-4xl font-extrabold text-emerald-400">{formatarBRL(dados.totalGeral)}</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-bold">Por forma de pagamento</h3>
        {dados.porFormaPagamento.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pedido no período selecionado.</p>
        ) : (
          <div className="space-y-2">
            {dados.porFormaPagamento.map((item) => (
              <div
                key={item.formaPagamento}
                className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{formaPagamentoLabel[item.formaPagamento] ?? item.formaPagamento}</p>
                  <p className="text-xs text-zinc-500">{item.quantidade} pedido{item.quantidade !== 1 ? 's' : ''}</p>
                </div>
                <span className="font-bold">{formatarBRL(item.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Adicionar o link no menu (`Layout.tsx`)**

Localize (no topo do arquivo):

```ts
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList, Wallet, ShieldCheck, Package, TrendingUp } from 'lucide-react'
```

Substitua por (adiciona `Landmark`):

```ts
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList, Wallet, ShieldCheck, Package, TrendingUp, Landmark } from 'lucide-react'
```

O arquivo tem duas versões do menu (desktop e mobile), cada uma com o bloco do link de Auditoria.
Localize a **primeira ocorrência**:

```tsx
            {isDono && (
              <NavLink to="/auditoria" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Auditoria
                </span>
              </NavLink>
            )}
```

Substitua por (mantém o bloco de Auditoria e adiciona o de Financeiro logo depois):

```tsx
            {isDono && (
              <NavLink to="/auditoria" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Auditoria
                </span>
              </NavLink>
            )}
            {isDono && (
              <NavLink to="/financeiro" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5" />
                  Financeiro
                </span>
              </NavLink>
            )}
```

Localize a **segunda ocorrência** (menu mobile — mesmo trecho, mas com indentação de 2 espaços a
menos, sem estar dentro de outro `<div>` extra):

```tsx
          {isDono && (
            <NavLink to="/auditoria" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Auditoria
              </span>
            </NavLink>
          )}
```

Substitua por:

```tsx
          {isDono && (
            <NavLink to="/auditoria" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Auditoria
              </span>
            </NavLink>
          )}
          {isDono && (
            <NavLink to="/financeiro" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5" />
                Financeiro
              </span>
            </NavLink>
          )}
```

- [ ] **Step 3: Adicionar a rota em `App.tsx`**

Localize o import:

```ts
import Auditoria from './pages/Auditoria'
```

Adicione logo abaixo:

```ts
import Financeiro from './pages/Financeiro'
```

Localize a rota:

```tsx
      <Route path="/auditoria" element={<RotaDono><Auditoria /></RotaDono>} />
```

Adicione logo abaixo:

```tsx
      <Route path="/financeiro" element={<RotaDono><Financeiro /></RotaDono>} />
```

- [ ] **Step 4: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia/frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no navegador**

1. Logar como DONO — confirmar que "Financeiro" aparece no menu (desktop e mobile), e que a tela
   `/financeiro` carrega, mostra o filtro de período e a quebra por forma de pagamento.
2. Logar como operador (não-DONO) — confirmar que "Financeiro" **não aparece** no menu, e que
   acessar `/financeiro` diretamente pela URL redireciona/bloqueia (mesmo comportamento de
   `/auditoria` pra operador, via `RotaDono`).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia/frontend
git add src/pages/Financeiro.tsx src/components/Layout.tsx src/App.tsx
git commit -m "feat: nova tela financeira (só DONO) com quebra por forma de pagamento"
```
