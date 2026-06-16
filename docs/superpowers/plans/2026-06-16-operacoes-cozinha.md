# Operações da Cozinha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o ciclo de vida de pedidos com status interativo na cozinha, pausa de recebimento, entrada manual, histórico por período, impressão de comanda 80mm e deleção de estabelecimento pelo Super Admin.

**Architecture:** Backend Fastify/Prisma recebe novos endpoints e enriquece existentes; Socket.IO emite `pedido:atualizado` em cada mudança de status; Frontend React atualiza Cozinha.tsx com botões de ação e dois novos modais, e adiciona páginas Historico e ImprimirComanda.

**Tech Stack:** Node 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL + Socket.IO | React 19 + Vite 7 + Tailwind v4 + React Router 7 + lucide-react

---

## Mapa de arquivos

**Backend — criar:**
- nenhum arquivo novo

**Backend — modificar:**
- `prisma/schema.prisma` — enum + campos novos
- `src/routes/pedidos.ts` — PATCH com transições + socket; POST /pedidos/manual
- `src/routes/publico.ts` — GET retorna aceitandoPedidos; POST valida aceitandoPedidos
- `src/routes/estabelecimentos.ts` — PATCH /meu-estabelecimento
- `src/routes/admin.ts` — DELETE /admin/estabelecimentos/:id

**Frontend — criar:**
- `frontend/src/pages/Historico.tsx`
- `frontend/src/pages/ImprimirComanda.tsx`

**Frontend — modificar:**
- `frontend/src/pages/Cozinha.tsx` — status interativo + pausa + modal manual + imprimir
- `frontend/src/pages/CardapioPublico.tsx` — banner fechado
- `frontend/src/pages/admin/AdminEstabelecimentos.tsx` — botão excluir
- `frontend/src/components/Layout.tsx` — link Histórico
- `frontend/src/App.tsx` — novas rotas

---

## Task 1: Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Editar schema**

Em `prisma/schema.prisma`, fazer três mudanças:

**1a. Adicionar `a_caminho` ao enum `StatusPedido`:**
```prisma
enum StatusPedido {
  recebido
  em_preparo
  pronto
  a_caminho
  entregue
  cancelado
}
```

**1b. Adicionar `aceitandoPedidos` em `Estabelecimento`** (após o campo `status`):
```prisma
model Estabelecimento {
  id               String                 @id @default(uuid())
  nome             String
  telefone         String
  slug             String                 @unique
  status           StatusEstabelecimento  @default(pendente)
  aceitandoPedidos Boolean                @default(true)
  criadoEm         DateTime               @default(now())
  // ... relações permanecem iguais
}
```

**1c. Adicionar `observacao` em `ItemPedido`** (após `precoUnit`):
```prisma
model ItemPedido {
  id         String  @id @default(uuid())
  nomeItem   String
  quantidade Int
  precoUnit  Decimal @db.Decimal(10, 2)
  observacao String?

  pedidoId String
  pedido   Pedido @relation(fields: [pedidoId], references: [id], onDelete: Cascade)

  @@map("itens_pedido")
}
```

- [ ] **Step 2: Rodar migration**

```bash
cd /Users/vinicius/comanda-ia
npx prisma migrate dev --name operacoes_cozinha
```

Esperado: migration criada e aplicada, cliente Prisma regenerado.

- [ ] **Step 3: Verificar tipos gerados**

```bash
grep -n "a_caminho\|aceitandoPedidos\|observacao" src/generated/prisma/enums.ts src/generated/prisma/models.ts 2>/dev/null || grep -rn "a_caminho" src/generated/
```

Esperado: `a_caminho` no enum, campos presentes nos tipos.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/
git commit -m "feat: migration — a_caminho, aceitandoPedidos, observacao em ItemPedido"
```

---

## Task 2: Backend — PATCH /pedidos/:id com transições + Socket.IO

**Files:**
- Modify: `src/routes/pedidos.ts`

- [ ] **Step 1: Atualizar AtualizarPedidoSchema e adicionar mapa de transições**

Em `src/routes/pedidos.ts`, substituir o bloco de schemas e helpers por:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import type { StatusPedido } from '../generated/prisma/enums.js';

// ── Schemas ────────────────────────────────────────────────────────────────────

const CriarPedidoSchema = Type.Object({
  clienteNome:     Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone:     Type.String({ minLength: 8, maxLength: 20 }),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String({ minLength: 1 }),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
    }),
    { minItems: 1 }
  ),
});

const AtualizarStatusSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('a_caminho'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});

const ManualPedidoSchema = Type.Object({
  clienteNome: Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone: Type.String({ minLength: 8, maxLength: 20 }),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String({ minLength: 1 }),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
      observacao:     Type.Optional(Type.String({ maxLength: 300 })),
    }),
    { minItems: 1 }
  ),
});

const PedidoParamsSchema = Type.Object({
  id: Type.String(),
});

// Transições permitidas por status atual
const transicoesPermitidas: Record<StatusPedido, StatusPedido[]> = {
  recebido:   ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto:     ['a_caminho', 'entregue', 'cancelado'],
  a_caminho:  ['entregue', 'cancelado'],
  entregue:   [],
  cancelado:  [],
};
```

- [ ] **Step 2: Atualizar PATCH /pedidos/:id para validar transição + emitir socket**

Substituir o handler do `fastify.patch('/pedidos/:id', ...)` existente por:

```typescript
  fastify.patch('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema, body: AtualizarStatusSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusPedido };
    const { estabelecimentoId } = request.user;

    const pedidoAtualizado = await prisma.$transaction(async (tx) => {
      const existente = await tx.pedido.findFirst({
        where: { id, estabelecimentoId: estabelecimentoId! },
      });
      if (!existente) return null;

      const permitidos = transicoesPermitidas[existente.status];
      if (!permitidos.includes(status)) return 'transicao_invalida';

      return tx.pedido.update({
        where:   { id },
        data:    { status },
        include: { itens: true },
      });
    });

    if (!pedidoAtualizado) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    if (pedidoAtualizado === 'transicao_invalida') {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoAtualizado);
    return pedidoAtualizado;
  });
```

- [ ] **Step 3: Verificar tipos**

```bash
cd /Users/vinicius/comanda-ia && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/routes/pedidos.ts
git commit -m "feat: PATCH /pedidos/:id com validação de transições e socket pedido:atualizado"
```

---

## Task 3: Backend — aceitandoPedidos (toggle + check público)

**Files:**
- Modify: `src/routes/estabelecimentos.ts`
- Modify: `src/routes/publico.ts`

- [ ] **Step 1: Adicionar PATCH /meu-estabelecimento em estabelecimentos.ts**

Em `src/routes/estabelecimentos.ts`, adicionar import do TypeBox e a rota nova. O arquivo completo ficará:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const AtualizarEstabelecimentoSchema = Type.Object({
  aceitandoPedidos: Type.Optional(Type.Boolean()),
  nome:             Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  telefone:         Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
});

export async function estabelecimentosRoutes(fastify: FastifyInstance) {
  fastify.get('/meu-estabelecimento', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId! },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }
    return estabelecimento;
  });

  fastify.patch('/meu-estabelecimento', {
    onRequest: [autenticar],
    schema: { body: AtualizarEstabelecimentoSchema },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const dados = request.body as {
      aceitandoPedidos?: boolean;
      nome?: string;
      telefone?: string;
    };

    const atualizado = await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data:  dados,
    });

    return atualizado;
  });

  fastify.get('/meu-estabelecimento/dashboard', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

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

    const estatisticas = await prisma.pedido.groupBy({
      by: ['status'],
      where: { estabelecimentoId: estabelecimentoId! },
      _count: { id: true },
    });

    const totalPedidos = estatisticas.reduce(
      (soma: number, item: { _count: { id: number } }) => soma + item._count.id,
      0
    );

    const agregacoes = await prisma.pedido.aggregate({
      where: { estabelecimentoId: estabelecimentoId!, status: { not: 'cancelado' } },
      _sum: { total: true },
      _avg: { total: true },
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
      estatisticas: {
        totalPedidos,
        faturamentoTotal: Number(agregacoes._sum.total ?? 0),
        ticketMedio:      Number(agregacoes._avg.total ?? 0),
        porStatus: estatisticas.map((item: { status: string; _count: { id: number } }) => ({
          status:     item.status,
          quantidade: item._count.id,
        })),
      },
    };
  });
}
```

- [ ] **Step 2: Atualizar publico.ts — GET retorna aceitandoPedidos, POST valida**

Em `src/routes/publico.ts`:

**2a.** No `GET /publico/:slug`, mudar o retorno para incluir `aceitandoPedidos`:
```typescript
    return {
      estabelecimento: {
        nome:             estabelecimento.nome,
        slug:             estabelecimento.slug,
        aceitandoPedidos: estabelecimento.aceitandoPedidos,
      },
      cardapio: estabelecimento.itens.map((item: ItemCardapioRow) => ({
        id:        item.id,
        nome:      item.nome,
        descricao: item.descricao ?? null,
        preco:     Number(item.preco),
        foto:      item.foto ?? null,
        categoria: item.categoria ?? null,
      })),
    };
```

**2b.** No `POST /publico/:slug/pedido`, adicionar verificação após checar status `ativo`:
```typescript
    if (!estabelecimento || estabelecimento.status !== 'ativo') {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    if (!estabelecimento.aceitandoPedidos) {
      return reply.status(503).send({ erro: 'Estabelecimento temporariamente fechado' });
    }
```

- [ ] **Step 3: Verificar tipos**

```bash
cd /Users/vinicius/comanda-ia && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/routes/estabelecimentos.ts src/routes/publico.ts
git commit -m "feat: PATCH /meu-estabelecimento e check aceitandoPedidos no cardápio público"
```

---

## Task 4: Backend — POST /pedidos/manual

**Files:**
- Modify: `src/routes/pedidos.ts`

- [ ] **Step 1: Adicionar rota POST /pedidos/manual**

Em `src/routes/pedidos.ts`, dentro de `pedidosRoutes`, adicionar antes do bloco do `DELETE /pedidos/:id`:

```typescript
  // ── POST /pedidos/manual ────────────────────────────────────────────────────
  // DONO ou OPERADOR registra pedido presencial/telefone.
  fastify.post('/pedidos/manual', {
    onRequest: [autenticar],
    schema: { body: ManualPedidoSchema },
  }, async (request, reply) => {
    const { clienteNome, clienteFone, itens } = request.body as {
      clienteNome: string;
      clienteFone: string;
      itens: { itemCardapioId: string; quantidade: number; observacao?: string }[];
    };
    const { estabelecimentoId } = request.user;

    const itemIds = itens.map((i) => i.itemCardapioId);

    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id:                { in: itemIds },
        estabelecimentoId: estabelecimentoId!,
        disponivel:        true,
      },
    });

    if (itensCardapio.length !== itemIds.length) {
      return reply.status(400).send({
        erro: 'Um ou mais itens não estão disponíveis ou não pertencem a este estabelecimento',
      });
    }

    const itensComSnapshot = itens.map((pedidoItem) => {
      const ic = itensCardapio.find((ic) => ic.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem:   ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit:  Number(ic.preco),
        observacao: pedidoItem.observacao,
      };
    });

    const total = itensComSnapshot.reduce(
      (soma, item) => soma + item.precoUnit * item.quantidade,
      0
    );

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome,
        clienteFone,
        total,
        estabelecimentoId: estabelecimentoId!,
        itens: { create: itensComSnapshot },
      },
      include: { itens: true },
    });

    getIO().to(estabelecimentoId!).emit('pedido:novo', pedido);

    return reply.status(201).send(pedido);
  });
```

- [ ] **Step 2: Verificar tipos**

```bash
cd /Users/vinicius/comanda-ia && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/routes/pedidos.ts
git commit -m "feat: POST /pedidos/manual para pedidos presenciais/telefone"
```

---

## Task 5: Backend — DELETE /admin/estabelecimentos/:id

**Files:**
- Modify: `src/routes/admin.ts`

- [ ] **Step 1: Adicionar rota DELETE**

Em `src/routes/admin.ts`, dentro de `adminRoutes`, adicionar após o bloco do `GET /admin/metricas`:

```typescript
  // ── DELETE /admin/estabelecimentos/:id ───────────────────────────────────────
  // Remove estabelecimento e todos os dados vinculados em cascata.
  fastify.delete('/admin/estabelecimentos/:id', {
    schema: { params: AdminParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existente = await prisma.estabelecimento.findUnique({ where: { id } });
    if (!existente) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    // Deleta em ordem para respeitar FKs (cascata manual)
    await prisma.$transaction([
      prisma.conversa.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.pedido.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.itemCardapio.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.categoria.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.usuario.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.estabelecimento.delete({ where: { id } }),
    ]);

    return reply.status(204).send();
  });
```

- [ ] **Step 2: Verificar tipos**

```bash
cd /Users/vinicius/comanda-ia && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.ts
git commit -m "feat: DELETE /admin/estabelecimentos/:id com cascata manual"
```

---

## Task 6: Frontend — Cozinha: status a_caminho + cancel + socket pedido:atualizado

**Files:**
- Modify: `frontend/src/pages/Cozinha.tsx`

- [ ] **Step 1: Atualizar tipos, config de status e importações**

No topo de `frontend/src/pages/Cozinha.tsx`, substituir as declarações de tipo e config por:

```tsx
import { useEffect, useState } from 'react'
import {
  Clock, User, Flame, Check, PackageCheck, Truck,
  XCircle, Printer, Loader2, Plus, Minus, X, PauseCircle, PlayCircle,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useSocket } from '../hooks/useSocket'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'a_caminho' | 'entregue' | 'cancelado'

interface ItemPedido {
  id:         string
  nomeItem:   string
  quantidade: number
  precoUnit:  number | string
  observacao: string | null
}

interface Pedido {
  id:          string
  clienteNome: string
  clienteFone: string
  total:       number | string
  status:      Status
  criadoEm:   string
  itens:       ItemPedido[]
}

interface ItemCardapio {
  id:         string
  nome:       string
  preco:      number
  disponivel: boolean
  categoria:  { id: string; nome: string; ordem: number } | null
}

interface PedidosResponse {
  dados:    Pedido[]
  proximo:  string | null
}

const statusConfig: Record<Status, { label: string; badge: string }> = {
  recebido:   { label: 'Novo',        badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  em_preparo: { label: 'Em preparo',  badge: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/30' },
  pronto:     { label: 'Pronto',      badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30' },
  a_caminho:  { label: 'A caminho',   badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30' },
  entregue:   { label: 'Entregue',    badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  cancelado:  { label: 'Cancelado',   badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' },
}

const proximaAcao: Partial<Record<Status, { proximoStatus: Status; label: string; Icone: typeof Flame }>> = {
  recebido:   { proximoStatus: 'em_preparo', label: 'Iniciar preparo',    Icone: Flame },
  em_preparo: { proximoStatus: 'pronto',     label: 'Marcar pronto',      Icone: Check },
  pronto:     { proximoStatus: 'a_caminho',  label: 'Saiu para entrega',  Icone: Truck },
  a_caminho:  { proximoStatus: 'entregue',   label: 'Marcar entregue',    Icone: PackageCheck },
}

const statusAtivos: Status[] = ['recebido', 'em_preparo', 'pronto', 'a_caminho']
```

- [ ] **Step 2: Atualizar estado e handlers na função Cozinha**

Substituir o corpo da função `Cozinha()` por (mantendo StatusConexao no final):

```tsx
export default function Cozinha() {
  const token = localStorage.getItem('token')
  const [pedidos, setPedidos]                   = useState<Pedido[]>([])
  const [atualizandoId, setAtualizandoId]       = useState<string | null>(null)
  const [cancelandoId, setCancelandoId]         = useState<string | null>(null)
  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const { socket, conectado, erro } = useSocket(token)

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/pedidos?status=recebido,em_preparo,pronto,a_caminho&limite=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((resp: PedidosResponse) => {
        if (resp.dados && Array.isArray(resp.dados)) setPedidos(resp.dados)
      })
      .catch((e) => console.error('Erro ao buscar pedidos:', e))
      .finally(() => setCarregandoInicial(false))
  }, [token])

  useEffect(() => {
    if (!socket) return

    const onNovo = (pedido: Pedido) => {
      setPedidos((prev) => [pedido, ...prev])
    }

    const onAtualizado = (pedido: Pedido) => {
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? pedido : p)))
    }

    socket.on('pedido:novo',      onNovo)
    socket.on('pedido:atualizado', onAtualizado)
    return () => {
      socket.off('pedido:novo',      onNovo)
      socket.off('pedido:atualizado', onAtualizado)
    }
  }, [socket])

  async function atualizarStatus(pedidoId: string, novoStatus: Status) {
    setAtualizandoId(pedidoId)
    try {
      const resposta = await fetch(`${API_URL}/pedidos/${pedidoId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: novoStatus }),
      })
      if (!resposta.ok) throw new Error('Falha ao atualizar status')
      const pedidoAtualizado: Pedido = await resposta.json()
      setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? pedidoAtualizado : p)))
    } catch (e) {
      console.error('Erro ao atualizar status:', e)
    } finally {
      setAtualizandoId(null)
    }
  }

  async function cancelarPedido(pedidoId: string) {
    setCancelandoId(pedidoId)
    try {
      const resposta = await fetch(`${API_URL}/pedidos/${pedidoId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: 'cancelado' }),
      })
      if (!resposta.ok) throw new Error('Falha ao cancelar')
      const pedidoAtualizado: Pedido = await resposta.json()
      setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? pedidoAtualizado : p)))
    } catch (e) {
      console.error('Erro ao cancelar pedido:', e)
    } finally {
      setCancelandoId(null)
    }
  }

  const pedidosVisiveis = pedidos.filter((p) => statusAtivos.includes(p.status))

  return (
    <Layout headerExtra={<StatusConexao conectado={conectado} erro={erro} />}>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-extrabold">Pedidos</h2>
        <span className="text-sm text-zinc-400">{pedidosVisiveis.length} ativos</span>
      </div>

      {carregandoInicial ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : pedidosVisiveis.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 text-center">
          <p className="text-lg font-semibold text-zinc-400">Aguardando pedidos...</p>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Os pedidos aparecerão aqui em tempo real assim que chegarem.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pedidosVisiveis.map((pedido) => {
            const cfg       = statusConfig[pedido.status]
            const acao      = proximaAcao[pedido.status]
            const atualizando = atualizandoId === pedido.id
            const cancelando  = cancelandoId  === pedido.id

            return (
              <div
                key={pedido.id}
                className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-700"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">#{pedido.id.slice(-6)}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs">{formatarTempo(pedido.criadoEm)}</span>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>

                <div className="mb-4 flex items-center gap-2">
                  <User className="h-4 w-4 text-zinc-500" />
                  <span className="font-semibold">{pedido.clienteNome}</span>
                </div>

                <div className="mb-4 flex-1 space-y-2 border-t border-zinc-800 pt-4">
                  {pedido.itens.map((item) => (
                    <div key={item.id}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-sm font-bold text-orange-400">
                          {item.quantidade}
                        </span>
                        <span className="text-sm text-zinc-200">{item.nomeItem}</span>
                      </div>
                      {item.observacao && (
                        <p className="ml-10 mt-0.5 text-xs text-zinc-500 italic">{item.observacao}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-lg font-bold">R$ {Number(pedido.total).toFixed(2)}</span>
                    <button
                      onClick={() => window.open(`/imprimir/${pedido.id}`, '_blank')}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                      title="Imprimir comanda"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {acao && (
                      <button
                        onClick={() => atualizarStatus(pedido.id, acao.proximoStatus)}
                        disabled={atualizando || cancelando}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                      >
                        {atualizando
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <acao.Icone className="h-4 w-4" />}
                        {acao.label}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm('Cancelar este pedido?')) cancelarPedido(pedido.id)
                      }}
                      disabled={atualizando || cancelando}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
                      title="Cancelar pedido"
                    >
                      {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}

function formatarTempo(criadoEm: string): string {
  const diff    = Date.now() - new Date(criadoEm).getTime()
  const minutos = Math.floor(diff / 60000)
  if (minutos < 1) return 'agora'
  if (minutos === 1) return 'há 1 min'
  return `há ${minutos} min`
}

function StatusConexao({ conectado, erro }: { conectado: boolean; erro: string | null }) {
  if (erro) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="text-sm font-medium text-red-300">{erro}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {conectado && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
      </span>
      <span className="text-sm font-medium text-zinc-300">
        {conectado ? 'Cozinha conectada' : 'Conectando...'}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/Cozinha.tsx
git commit -m "feat: cozinha — status a_caminho, cancelar, imprimir, socket pedido:atualizado"
```

---

## Task 7: Frontend — Cozinha: toggle pausa + modal novo pedido manual

**Files:**
- Modify: `frontend/src/pages/Cozinha.tsx`

- [ ] **Step 1: Adicionar estado e lógica de pausa + modal**

Dentro da função `Cozinha()`, após as declarações de estado existentes, adicionar:

```tsx
  // Pausa
  const [aceitando, setAceitando]         = useState(true)
  const [togglingPausa, setTogglingPausa] = useState(false)

  // Modal novo pedido
  const [modalAberto, setModalAberto]       = useState(false)
  const [cardapio, setCardapio]             = useState<ItemCardapio[]>([])
  const [carregandoMenu, setCarregandoMenu] = useState(false)
  const [clienteNome, setClienteNome]       = useState('')
  const [clienteFone, setClienteFone]       = useState('')
  const [selecionados, setSelecionados]     = useState<Record<string, { quantidade: number; observacao: string }>>({})
  const [enviandoManual, setEnviandoManual] = useState(false)
  const [erroModal, setErroModal]           = useState<string | null>(null)
```

- [ ] **Step 2: Adicionar useEffect para carregar aceitandoPedidos no mount**

Após o `useEffect` dos pedidos existente:

```tsx
  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est) => setAceitando(est.aceitandoPedidos ?? true))
      .catch(console.error)
  }, [token])
```

- [ ] **Step 3: Adicionar funções de pausa e pedido manual**

Após `cancelarPedido`, adicionar:

```tsx
  async function togglePausa() {
    setTogglingPausa(true)
    try {
      const resp = await fetch(`${API_URL}/meu-estabelecimento`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ aceitandoPedidos: !aceitando }),
      })
      if (resp.ok) setAceitando((v) => !v)
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingPausa(false)
    }
  }

  async function abrirModalNovoPedido() {
    setClienteNome('')
    setClienteFone('')
    setSelecionados({})
    setErroModal(null)
    setModalAberto(true)
    if (cardapio.length > 0) return
    setCarregandoMenu(true)
    try {
      const resp = await fetch(`${API_URL}/cardapio`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const dados: ItemCardapio[] = await resp.json()
      setCardapio(dados.filter((i) => i.disponivel))
    } catch (e) {
      console.error(e)
    } finally {
      setCarregandoMenu(false)
    }
  }

  function alterarQtd(itemId: string, delta: number) {
    setSelecionados((prev) => {
      const atual = prev[itemId]?.quantidade ?? 0
      const nova  = atual + delta
      if (nova <= 0) {
        const { [itemId]: _, ...resto } = prev
        return resto
      }
      return { ...prev, [itemId]: { quantidade: nova, observacao: prev[itemId]?.observacao ?? '' } }
    })
  }

  function alterarObs(itemId: string, observacao: string) {
    setSelecionados((prev) => ({
      ...prev,
      [itemId]: { quantidade: prev[itemId]?.quantidade ?? 1, observacao },
    }))
  }

  const totalManual = cardapio.reduce((soma, item) => {
    const sel = selecionados[item.id]
    return soma + (sel ? item.preco * sel.quantidade : 0)
  }, 0)

  async function criarPedidoManual(e: FormEvent) {
    e.preventDefault()
    setErroModal(null)
    const itens = Object.entries(selecionados).map(([itemCardapioId, { quantidade, observacao }]) => ({
      itemCardapioId,
      quantidade,
      observacao: observacao || undefined,
    }))
    if (itens.length === 0) {
      setErroModal('Selecione pelo menos um item')
      return
    }
    setEnviandoManual(true)
    try {
      const resp = await fetch(`${API_URL}/pedidos/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ clienteNome, clienteFone, itens }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroModal(dados.erro ?? 'Erro ao criar pedido'); return }
      setPedidos((prev) => [dados, ...prev])
      setModalAberto(false)
    } catch {
      setErroModal('Falha de conexão')
    } finally {
      setEnviandoManual(false)
    }
  }
```

- [ ] **Step 4: Atualizar o JSX retornado — header com toggle e botão novo pedido**

Dentro do `<Layout>`, antes do `<div className="mb-6 ...">`, o `headerExtra` já está definido como `<StatusConexao>`. Vamos compor mais elementos no header. Substituir o `<Layout ...>` opening tag:

```tsx
  return (
    <Layout
      headerExtra={
        <div className="flex items-center gap-2">
          <button
            onClick={abrirModalNovoPedido}
            className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Pedido</span>
          </button>
          <button
            onClick={togglePausa}
            disabled={togglingPausa}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              aceitando
                ? 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                : 'border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
            }`}
          >
            {aceitando
              ? <PauseCircle className="h-4 w-4" />
              : <PlayCircle className="h-4 w-4" />}
            <span className="hidden sm:inline">{aceitando ? 'Pausar' : 'Reabrir'}</span>
          </button>
          <StatusConexao conectado={conectado} erro={erro} />
        </div>
      }
    >
```

- [ ] **Step 5: Adicionar modal no final do JSX retornado (antes do fechamento do `</Layout>`)**

```tsx
      {/* Modal novo pedido manual */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="flex h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900">
            {/* Header modal */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-5">
              <h3 className="text-lg font-bold">Novo Pedido</h3>
              <button onClick={() => setModalAberto(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo scrollável */}
            <form onSubmit={criarPedidoManual} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {/* Dados do cliente */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Nome *</span>
                    <input
                      required
                      value={clienteNome}
                      onChange={(e) => setClienteNome(e.target.value)}
                      placeholder="Nome do cliente"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Telefone *</span>
                    <input
                      required
                      value={clienteFone}
                      onChange={(e) => setClienteFone(e.target.value)}
                      placeholder="85 99999-9999"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  </label>
                </div>

                {/* Lista de itens */}
                <div>
                  <p className="mb-3 text-xs font-medium text-zinc-400">Itens</p>
                  {carregandoMenu ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cardapio.map((item) => {
                        const sel = selecionados[item.id]
                        return (
                          <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{item.nome}</p>
                                <p className="text-xs text-orange-400">R$ {Number(item.preco).toFixed(2)}</p>
                              </div>
                              {sel ? (
                                <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-1 py-1">
                                  <button type="button" onClick={() => alterarQtd(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700">
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="min-w-5 text-center text-sm font-bold">{sel.quantidade}</span>
                                  <button type="button" onClick={() => alterarQtd(item.id, +1)} className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700">
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => alterarQtd(item.id, +1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-600">
                                  <Plus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            {sel && (
                              <input
                                value={sel.observacao}
                                onChange={(e) => alterarObs(item.id, e.target.value)}
                                placeholder="Observação (opcional)"
                                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-orange-500"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {erroModal && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                    {erroModal}
                  </p>
                )}
              </div>

              {/* Footer fixo com total e botão */}
              <div className="border-t border-zinc-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Total</span>
                  <span className="text-xl font-extrabold text-orange-400">R$ {totalManual.toFixed(2)}</span>
                </div>
                <button
                  type="submit"
                  disabled={enviandoManual}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {enviandoManual && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar Pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
```

- [ ] **Step 6: Build**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: 0 erros TypeScript.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/Cozinha.tsx
git commit -m "feat: cozinha — toggle pausa, modal novo pedido manual"
```

---

## Task 8: Frontend — CardapioPublico: banner fechado

**Files:**
- Modify: `frontend/src/pages/CardapioPublico.tsx`

- [ ] **Step 1: Atualizar interface e state**

No topo de `CardapioPublico.tsx`, atualizar `CardapioData`:

```tsx
interface CardapioData {
  estabelecimento: { nome: string; slug: string; aceitandoPedidos: boolean }
  cardapio:        ItemPublico[]
}
```

- [ ] **Step 2: Adicionar banner no JSX principal**

No retorno da função `CardapioPublico`, dentro de `<main>`, antes da condição `dados.cardapio.length === 0`, adicionar:

```tsx
        {!dados.estabelecimento.aceitandoPedidos && (
          <div className="mb-4 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-center text-sm font-medium text-orange-400">
            Estamos temporariamente fechados — volte em breve.
          </div>
        )}
```

- [ ] **Step 3: Desabilitar finalizar quando fechado**

Na `BarraCarrinho`, o botão já existe. Precisamos passar `aceitandoPedidos` para bloquear quando fechado. Atualizar a renderização condicional da `BarraCarrinho`:

```tsx
      {totalItens > 0 && dados.estabelecimento.aceitandoPedidos && (
        <BarraCarrinho
          totalItens={totalItens}
          totalReais={totalReais}
          onFinalizar={() => setCheckoutAberto(true)}
        />
      )}
```

E o `ModalCheckout` só abre quando `aceitandoPedidos === true` (já garantido por não renderizar `BarraCarrinho`).

- [ ] **Step 4: Build**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: 0 erros.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/CardapioPublico.tsx
git commit -m "feat: cardápio público mostra banner quando estabelecimento está pausado"
```

---

## Task 9: Frontend — ImprimirComanda página

**Files:**
- Create: `frontend/src/pages/ImprimirComanda.tsx`

- [ ] **Step 1: Criar página**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import { API_URL } from '../lib/api'

interface ItemPedido {
  id:         string
  nomeItem:   string
  quantidade: number
  precoUnit:  number | string
  observacao: string | null
}

interface Pedido {
  id:             string
  clienteNome:    string
  clienteFone:    string
  total:          number | string
  status:         string
  criadoEm:       string
  itens:          ItemPedido[]
}

interface Estabelecimento {
  nome: string
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

export default function ImprimirComanda() {
  const { pedidoId } = useParams<{ pedidoId: string }>()
  const token = localStorage.getItem('token')
  const [pedido, setPedido]                     = useState<Pedido | null>(null)
  const [estabelecimento, setEstabelecimento]   = useState<Estabelecimento | null>(null)
  const [erro, setErro]                         = useState(false)

  useEffect(() => {
    if (!pedidoId || !token) return

    Promise.all([
      fetch(`${API_URL}/pedidos/${pedidoId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
        if (!r.ok) throw new Error('Pedido não encontrado')
        return r.json() as Promise<Pedido>
      }),
      fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json() as Promise<Estabelecimento>),
    ])
      .then(([p, est]) => {
        setPedido(p)
        setEstabelecimento(est)
      })
      .catch(() => setErro(true))
  }, [pedidoId, token])

  useEffect(() => {
    if (pedido && estabelecimento) {
      setTimeout(() => window.print(), 300)
    }
  }, [pedido, estabelecimento])

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-center text-zinc-800">
        <p>Comanda não encontrada.</p>
      </div>
    )
  }

  if (!pedido || !estabelecimento) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  const total = Number(pedido.total)

  return (
    <>
      <style>{`
        @media print {
          @page { width: 80mm; margin: 4mm; }
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { background: white; }
      `}</style>

      {/* Botão fechar — some ao imprimir */}
      <div className="no-print flex justify-end p-4">
        <button onClick={() => window.close()} className="text-sm text-zinc-500 underline">
          Fechar
        </button>
      </div>

      {/* Comanda */}
      <div style={{ fontFamily: 'monospace', width: '72mm', margin: '0 auto', fontSize: '12px', color: '#000' }}>
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
          {estabelecimento.nome}
        </div>
        <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '8px', color: '#555' }}>
          {formatarDataHora(pedido.criadoEm)}
        </div>

        <div style={{ borderTop: '1px dashed #000', marginBottom: '6px' }} />

        <div style={{ marginBottom: '4px' }}>
          <strong>Pedido:</strong> #{pedido.id.slice(-6)}
        </div>
        <div style={{ marginBottom: '4px' }}>
          <strong>Cliente:</strong> {pedido.clienteNome}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Fone:</strong> {pedido.clienteFone}
        </div>

        <div style={{ borderTop: '1px dashed #000', marginBottom: '6px' }} />

        {pedido.itens.map((item) => (
          <div key={item.id} style={{ marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.quantidade}x {item.nomeItem}</span>
              <span>R${(Number(item.precoUnit) * item.quantidade).toFixed(2)}</span>
            </div>
            {item.observacao && (
              <div style={{ marginLeft: '12px', fontSize: '11px', color: '#555' }}>
                obs: {item.observacao}
              </div>
            )}
          </div>
        ))}

        <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
            <span>TOTAL</span>
            <span>R${total.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #000', marginTop: '8px', marginBottom: '8px' }} />
        <div style={{ textAlign: 'center', fontSize: '10px', color: '#777' }}>
          Comanda IA — obrigado!
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/ImprimirComanda.tsx
git commit -m "feat: página ImprimirComanda com layout 80mm e auto-print"
```

---

## Task 10: Frontend — Histórico de pedidos

**Files:**
- Create: `frontend/src/pages/Historico.tsx`

- [ ] **Step 1: Criar página**

```tsx
import { useState, useEffect } from 'react'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface ItemPedido {
  id:        string
  nomeItem:  string
  quantidade: number
  precoUnit: number | string
  observacao: string | null
}

interface Pedido {
  id:          string
  clienteNome: string
  clienteFone: string
  total:       number | string
  status:      string
  criadoEm:   string
  itens:       ItemPedido[]
}

interface PedidosResponse {
  dados:   Pedido[]
  proximo: string | null
}

const statusLabel: Record<string, string> = {
  recebido:   'Recebido',
  em_preparo: 'Em preparo',
  pronto:     'Pronto',
  a_caminho:  'A caminho',
  entregue:   'Entregue',
  cancelado:  'Cancelado',
}

const statusBadge: Record<string, string> = {
  recebido:   'bg-orange-500/10 text-orange-400',
  em_preparo: 'bg-yellow-500/10 text-yellow-400',
  pronto:     'bg-sky-500/10 text-sky-400',
  a_caminho:  'bg-violet-500/10 text-violet-400',
  entregue:   'bg-emerald-500/10 text-emerald-400',
  cancelado:  'bg-red-500/10 text-red-400',
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function Historico() {
  const token = localStorage.getItem('token')
  const [dataInicio, setDataInicio] = useState(hoje())
  const [dataFim, setDataFim]       = useState(hoje())
  const [pedidos, setPedidos]       = useState<Pedido[]>([])
  const [carregando, setCarregando] = useState(false)
  const [expandido, setExpandido]   = useState<string | null>(null)

  function buscar() {
    if (!token) return
    setCarregando(true)
    fetch(
      `${API_URL}/pedidos?dataInicio=${dataInicio}&dataFim=${dataFim}&limite=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((r) => r.json())
      .then((resp: PedidosResponse) => setPedidos(resp.dados ?? []))
      .catch(console.error)
      .finally(() => setCarregando(false))
  }

  useEffect(() => { buscar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalReceita = pedidos
    .filter((p) => p.status !== 'cancelado')
    .reduce((soma, p) => soma + Number(p.total), 0)

  const totalPedidos = pedidos.length

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold">Histórico</h2>
        <p className="mt-1 text-sm text-zinc-400">Pedidos por período</p>
      </div>

      {/* Filtro */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">De</span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">Até</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500"
          />
        </label>
        <button
          onClick={buscar}
          disabled={carregando}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
          Buscar
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-400">Total de pedidos</p>
          <p className="mt-1 text-2xl font-extrabold">{totalPedidos}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-400">Receita (sem cancelados)</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-400">
            R$ {totalReceita.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-zinc-400">Ticket médio</p>
          <p className="mt-1 text-2xl font-extrabold">
            R$ {totalPedidos > 0 ? (totalReceita / pedidos.filter(p => p.status !== 'cancelado').length || 0).toFixed(2) : '0.00'}
          </p>
        </div>
      </div>

      {/* Lista */}
      {carregando ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center text-zinc-500">
          Nenhum pedido no período selecionado.
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((pedido) => {
            const aberto = expandido === pedido.id
            return (
              <div key={pedido.id} className="rounded-2xl border border-zinc-800 bg-zinc-900">
                <button
                  className="flex w-full items-center justify-between p-4 text-left"
                  onClick={() => setExpandido(aberto ? null : pedido.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge[pedido.status] ?? 'bg-zinc-700 text-zinc-400'}`}
                    >
                      {statusLabel[pedido.status] ?? pedido.status}
                    </span>
                    <span className="font-medium">{pedido.clienteNome}</span>
                    <span className="hidden text-xs text-zinc-500 sm:inline">
                      {formatarDataHora(pedido.criadoEm)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-orange-400">
                      R$ {Number(pedido.total).toFixed(2)}
                    </span>
                    {aberto ? (
                      <ChevronUp className="h-4 w-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                </button>

                {aberto && (
                  <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
                    <p className="mb-2 text-xs text-zinc-500">
                      {formatarDataHora(pedido.criadoEm)} · {pedido.clienteFone}
                    </p>
                    <div className="space-y-1">
                      {pedido.itens.map((item) => (
                        <div key={item.id}>
                          <div className="flex justify-between text-sm">
                            <span>{item.quantidade}× {item.nomeItem}</span>
                            <span className="text-zinc-400">
                              R$ {(Number(item.precoUnit) * item.quantidade).toFixed(2)}
                            </span>
                          </div>
                          {item.observacao && (
                            <p className="ml-4 text-xs text-zinc-600 italic">{item.observacao}</p>
                          )}
                        </div>
                      ))}
                    </div>
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

- [ ] **Step 2: Build**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/Historico.tsx
git commit -m "feat: página Histórico com filtro por data e resumo de receita"
```

---

## Task 11: Frontend — App.tsx + Layout.tsx + Admin delete

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/pages/admin/AdminEstabelecimentos.tsx`

- [ ] **Step 1: Atualizar App.tsx**

Em `frontend/src/App.tsx`, adicionar imports:

```tsx
import Historico from './pages/Historico'
import ImprimirComanda from './pages/ImprimirComanda'
```

Adicionar rotas (dentro de `<Routes>`, após `/operadores`):

```tsx
      <Route path="/historico"         element={<RotaDono><Historico /></RotaDono>} />
      <Route path="/imprimir/:pedidoId" element={<RotaProtegida><ImprimirComanda /></RotaProtegida>} />
```

- [ ] **Step 2: Atualizar Layout.tsx — adicionar link Histórico**

Em `frontend/src/components/Layout.tsx`, nos dois blocos de nav (desktop e mobile), após o link de Operadores, adicionar:

```tsx
            {isDono && <NavLink to="/historico" className={linkClass}>Histórico</NavLink>}
```

Isso vai no bloco desktop (dentro do `<nav className="hidden ...">`) e no bloco mobile, ambos já condicionados por `{isDono && ...}`.

- [ ] **Step 3: Adicionar botão de excluir em AdminEstabelecimentos.tsx**

Ler o arquivo atual e adicionar:
- Import `Trash2` de lucide-react
- State: `excluindoId: string | null`
- State: `confirmandoId: string | null`
- Função `excluirEstabelecimento(id: string, nome: string)`
- Modal de confirmação quando `confirmandoId` não é null
- Botão lixeira em cada card

Em `frontend/src/pages/admin/AdminEstabelecimentos.tsx`, as adições ao estado:

```tsx
  const [excluindoId, setExcluindoId]     = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
```

Função de exclusão (após `criarEstabelecimento`):

```tsx
  async function excluirEstabelecimento(id: string) {
    setExcluindoId(id)
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return
      setLista((prev) => prev.filter((e) => e.id !== id))
    } catch (e) {
      console.error(e)
    } finally {
      setExcluindoId(null)
      setConfirmandoId(null)
    }
  }
```

No card de cada estabelecimento, adicionar botão lixeira ao lado dos controles de status já existentes:

```tsx
                <button
                  onClick={() => setConfirmandoId(est.id)}
                  className="ml-2 rounded-lg p-1.5 text-red-400 transition hover:bg-red-500/10"
                  title="Excluir estabelecimento"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
```

Modal de confirmação (antes do fechamento do componente, no final do JSX):

```tsx
      {confirmandoId && (() => {
        const est = lista.find((e) => e.id === confirmandoId)
        return est ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-2 text-lg font-bold">Excluir estabelecimento</h3>
              <p className="mb-1 text-sm text-zinc-300">
                Tem certeza que deseja excluir <strong>{est.nome}</strong>?
              </p>
              <p className="mb-6 text-sm text-red-400">
                Esta ação é irreversível. Todos os dados, pedidos e usuários serão removidos.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmandoId(null)}
                  className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => excluirEstabelecimento(confirmandoId)}
                  disabled={excluindoId === confirmandoId}
                  className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {excluindoId === confirmandoId && <Loader2 className="h-4 w-4 animate-spin" />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ) : null
      })()}
```

- [ ] **Step 4: Build final**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: 0 erros TypeScript, bundle limpo.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/pages/admin/AdminEstabelecimentos.tsx
git commit -m "feat: rotas histórico + imprimir, link nav, admin excluir estabelecimento"
```

---

## Self-Review

**Spec coverage:**
- ✅ Toggle aceitandoPedidos → Tasks 3, 7, 8
- ✅ Fluxo de status a_caminho → Tasks 1, 2, 6
- ✅ Cancelar pedido → Task 6
- ✅ Socket pedido:atualizado → Tasks 2, 6
- ✅ POST /pedidos/manual → Tasks 4, 7
- ✅ Histórico com filtro e totais → Tasks 5 (inexistente—removido), 10
- ✅ Impressão de comanda 80mm → Tasks 9, 6 (botão)
- ✅ DELETE /admin/estabelecimentos/:id → Tasks 5, 11

**Nota sobre GET /pedidos:** O endpoint já existe com filtro por data e paginação cursor-based. O Histórico usa `limite=200` e computa o total no frontend. Nenhum backend adicional necessário.

**Tipo consistency:** `Status` type inclui `a_caminho` definido em Task 6; `statusConfig` e `proximaAcao` mapeiam o mesmo tipo; `transicoesPermitidas` no backend usa `StatusPedido` do Prisma que inclui `a_caminho` após Task 1. Consistente.
