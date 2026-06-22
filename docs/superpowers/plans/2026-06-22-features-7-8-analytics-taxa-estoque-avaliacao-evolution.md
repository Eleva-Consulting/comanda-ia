# Features 7, 8, Analytics, Taxa de Entrega, Estoque, Avaliação, Evolution API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar permissões de OPERADOR, push notifications, analytics, taxa de entrega, controle de estoque, avaliação de pedido e integração com Evolution API (WhatsApp).

**Architecture:** Uma migration única adiciona todos os campos novos; cada feature tem backend (Fastify route) + frontend (React page/component) desacoplados. Push usa Web Push API com VAPID. Evolution API é fire-and-forget no fluxo de criação de pedido.

**Tech Stack:** Node.js/Fastify/Prisma (backend), React 19/Vite/Tailwind v4 (frontend), web-push (push notifications), recharts (gráficos), Evolution API REST (WhatsApp)

## Global Constraints

- TypeScript strict, sem `any` exceto onde absolutamente necessário com comentário
- Mobile-first: Tailwind sem prefixo = mobile, `sm:` = desktop
- `min-h-dvh` em vez de `min-h-screen`
- Imutabilidade: nunca mutar objetos, sempre spread
- Fire-and-forget com `.catch(log)` para operações secundárias (email, push, WhatsApp)
- Commits no padrão conventional commits (`feat:`, `fix:`)
- Build deve passar (`npm run build` no backend, `npm run build` no frontend) antes de cada commit

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Run migration: `npx prisma migrate dev --name feature-batch`

**Changes:**

```prisma
// Usuario — adicionar permissoes
model Usuario {
  // ...campos existentes...
  permissoes           String[]         @default([])
  pushSubscriptions    PushSubscription[]
}

// Estabelecimento — adicionar campos
model Estabelecimento {
  // ...campos existentes...
  taxaEntrega    Decimal? @db.Decimal(10,2)
  evolutionUrl   String?
  evolutionToken String?
}

// ItemCardapio — adicionar estoque
model ItemCardapio {
  // ...campos existentes...
  estoque Int? // null = ilimitado
}

// Pedido — adicionar avaliacao
model Pedido {
  // ...campos existentes...
  avaliacao           Int?    // 1-5
  comentarioAvaliacao String?
}

// Novo model
model PushSubscription {
  id        String   @id @default(uuid())
  endpoint  String   @unique
  p256dh    String
  auth      String
  criadoEm  DateTime @default(now())

  usuarioId String
  usuario   Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@map("push_subscriptions")
}
```

- [ ] Editar `prisma/schema.prisma` com todos os campos acima
- [ ] Rodar `npx prisma migrate dev --name feature-batch`
- [ ] Verificar que `npx prisma generate` completa sem erro
- [ ] Commit: `chore: migration — permissoes, push, taxaEntrega, estoque, avaliacao`

---

## Task 2: Feature 7 — OPERADOR Permissões

**Files:**
- Modify: `src/routes/operadores.ts`
- Modify: `src/routes/auth.ts` (incluir permissoes no JWT)
- Modify: `frontend/src/pages/Operadores.tsx`
- Create: `frontend/src/lib/permissoes.ts`
- Modify: `frontend/src/components/RotaProtegida.tsx`

**Permissões disponíveis:** `cozinha | cardapio | historico | pedido_manual | configuracoes`

**Backend — operadores.ts:**

Adicionar schema de update com permissoes:
```ts
const AtualizarPermissoesSchema = Type.Object({
  permissoes: Type.Array(Type.Union([
    Type.Literal('cozinha'),
    Type.Literal('cardapio'),
    Type.Literal('historico'),
    Type.Literal('pedido_manual'),
    Type.Literal('configuracoes'),
  ]))
})
```

Adicionar rota `PATCH /estabelecimentos/operadores/:id/permissoes` que faz:
```ts
await prisma.usuario.update({
  where: { id, estabelecimentoId: request.user.estabelecimentoId! },
  data: { permissoes: dados.permissoes },
})
```

**Backend — auth.ts login:**

No JWT sign, incluir permissoes para OPERADOR:
```ts
const token = fastify.jwt.sign({
  userId: usuario.id,
  estabelecimentoId: usuario.estabelecimentoId,
  role: usuario.role,
  permissoes: usuario.role === 'OPERADOR' ? usuario.permissoes : [],
})
```

Adicionar `permissoes` no type do JWT (atualizar `plugins/auth.ts` se necessário).

**Frontend — `frontend/src/lib/permissoes.ts`:**
```ts
import { getRole } from './auth'

const PERMISSOES_DONO = ['cozinha','cardapio','historico','pedido_manual','configuracoes']

export function getPermissoes(): string[] {
  const role = getRole()
  if (role === 'DONO' || role === 'SUPER_ADMIN') return PERMISSOES_DONO
  try {
    const token = localStorage.getItem('token')
    if (!token) return []
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.permissoes ?? []
  } catch { return [] }
}

export function temPermissao(permissao: string): boolean {
  return getPermissoes().includes(permissao)
}
```

**Frontend — Operadores.tsx:**

Adicionar painel de permissões por operador. Ao expandir um operador, mostrar checkboxes:
- Cozinha / Cardápio / Histórico / Criar pedido / Configurações
- Salvar via `PATCH /estabelecimentos/operadores/:id/permissoes`

**Frontend — App.tsx:**

Proteger rotas com `temPermissao`:
- `/cozinha` → requer `cozinha`
- `/cardapio` → requer `cardapio`
- `/historico` → requer `historico`
- `/configuracoes` → requer `configuracoes`
- DONO sempre passa

- [ ] Adicionar `PATCH /estabelecimentos/operadores/:id/permissoes` em `operadores.ts`
- [ ] Incluir `permissoes` no JWT em `auth.ts`
- [ ] Atualizar type `UserPayload` em `src/plugins/auth.ts` com `permissoes: string[]`
- [ ] Criar `frontend/src/lib/permissoes.ts`
- [ ] Atualizar `Operadores.tsx` com checkboxes de permissão por operador
- [ ] Atualizar guards de rota no `App.tsx` para respeitar permissões
- [ ] Build backend + frontend passando
- [ ] Commit: `feat: permissões configuráveis por OPERADOR`

---

## Task 3: Feature 8 — Push Notifications

**Files:**
- Install: `web-push` (backend)
- Create: `src/push.ts`
- Create: `src/routes/push.ts`
- Modify: `src/server.ts` (registrar rota push)
- Modify: `src/routes/publico.ts` (disparar push em novo pedido)
- Create: `frontend/public/sw.js` (service worker)
- Create: `frontend/src/hooks/usePush.ts`
- Modify: `frontend/src/components/Layout.tsx` (botão ativar notificações)

**Backend — `src/push.ts`:**
```ts
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:notifications@comanda.cloud',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function enviarPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { titulo: string; corpo: string; url?: string }
) {
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
  )
}
```

**Backend — `src/routes/push.ts`:**
- `GET /push/vapid-public-key` → retorna `{ publicKey: process.env.VAPID_PUBLIC_KEY }`
- `POST /push/subscribe` (autenticado) → salva PushSubscription no banco
- `DELETE /push/unsubscribe` (autenticado) → remove subscription do banco

**Gerar VAPID keys (rodar localmente uma vez):**
```ts
import webpush from 'web-push'
const keys = webpush.generateVAPIDKeys()
console.log(keys) // salvar no Railway
```

**Enviar push em novo pedido (publico.ts):**
Após criar pedido e emitir socket event, buscar subscriptions do estabelecimento e disparar push para cada uma — fire-and-forget.

```ts
prisma.pushSubscription.findMany({
  where: { usuario: { estabelecimentoId: estabelecimento.id } }
}).then(subs => Promise.allSettled(
  subs.map(s => enviarPush(s, {
    titulo: `Novo pedido — ${pedido.clienteNome}`,
    corpo: `R$ ${Number(pedido.total).toFixed(2)}`,
    url: '/cozinha',
  }))
)).catch(err => fastify.log.error({ err }, 'Falha push'))
```

**Frontend — `frontend/public/sw.js`:**
```js
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.titulo ?? 'Comanda IA', {
      body: data.corpo,
      icon: '/favicon.ico',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data.url))
})
```

**Frontend — `frontend/src/hooks/usePush.ts`:**
Hook que: registra SW, pede permissão, salva subscription no backend, retorna `{ ativo, ativar, desativar }`.

**Frontend — Layout.tsx:**
Ícone de sino no header. Se `!ativo`, mostra tooltip "Ativar notificações". Click chama `ativar()`.

- [ ] `npm install web-push` no backend
- [ ] Gerar VAPID keys: `node -e "import('web-push').then(m => console.log(m.default.generateVAPIDKeys()))"`
- [ ] Setar `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` no Railway
- [ ] Criar `src/push.ts`
- [ ] Criar `src/routes/push.ts` com 3 rotas
- [ ] Registrar `pushRoutes` em `src/server.ts`
- [ ] Disparar push em `src/routes/publico.ts` após criar pedido
- [ ] Criar `frontend/public/sw.js`
- [ ] Criar `frontend/src/hooks/usePush.ts`
- [ ] Atualizar `Layout.tsx` com botão de notificações
- [ ] Build passando
- [ ] Commit: `feat: push notifications para novo pedido`

---

## Task 4: Analytics

**Files:**
- Create: `src/routes/analytics.ts`
- Modify: `src/server.ts` (registrar rota)
- Modify: `frontend/src/pages/Dashboard.tsx`
- Install: `recharts` (frontend)

**Backend — `src/routes/analytics.ts`:**

`GET /analytics` (autenticado) retorna:
```ts
{
  receitaHoje: number,
  pedidosHoje: number,
  ticketMedio: number,
  receitaSemana: Array<{ data: string; receita: number; pedidos: number }>, // últimos 7 dias
  topItens: Array<{ nome: string; quantidade: number }>, // top 5 últimos 30 dias
  pedidosPorStatus: Record<StatusPedido, number>,
}
```

Queries Prisma:
- `receitaHoje`: `pedido.aggregate({ _sum: { total: true }, where: { criadoEm: { gte: startOfDay }, status: { not: 'cancelado' } } })`
- `receitaSemana`: loop 7 dias com aggregate por dia
- `topItens`: `itemPedido.groupBy({ by: ['nomeItem'], _sum: { quantidade: true } })`

**Frontend — Dashboard.tsx:**

Substituir cards estáticos por dados reais. Adicionar seção de gráficos:
- `LineChart` de receita dos últimos 7 dias
- `BarChart` dos top 5 itens mais vendidos

- [ ] `npm install recharts` no frontend
- [ ] Criar `src/routes/analytics.ts`
- [ ] Registrar em `src/server.ts`
- [ ] Atualizar `Dashboard.tsx` com cards reais + 2 gráficos
- [ ] Build passando
- [ ] Commit: `feat: analytics — receita, pedidos e top itens no dashboard`

---

## Task 5: Taxa de Entrega

**Files:**
- Modify: `src/routes/estabelecimentos.ts`
- Modify: `src/routes/publico.ts`
- Modify: `frontend/src/pages/Configuracoes.tsx`
- Modify: `frontend/src/pages/CardapioPublico.tsx`

**Backend:**
- `AtualizarEstabelecimentoSchema`: adicionar `taxaEntrega: Type.Optional(Type.Union([Type.Number(), Type.Null()]))`
- `GET /pub/:slug`: incluir `taxaEntrega` no retorno do estabelecimento
- `POST /pub/:slug/pedido`: somar `taxaEntrega` ao total quando `tipoEntrega === 'entrega'`

**Frontend — Configuracoes.tsx:**

Adicionar campo "Taxa de entrega (R$)" com input number. Salvar junto com os outros campos.

**Frontend — CardapioPublico.tsx:**

- Mostrar "Taxa de entrega: R$ X,XX" no resumo do carrinho quando `tipoEntrega === 'entrega'`
- Incluir taxa no total exibido (mas não nos subtotais dos itens)

- [ ] Atualizar schema e handler em `estabelecimentos.ts`
- [ ] Atualizar `GET /pub/:slug` para incluir `taxaEntrega` em `publico.ts`
- [ ] Atualizar cálculo do total em `POST /pub/:slug/pedido`
- [ ] Atualizar `Configuracoes.tsx` com campo de taxa
- [ ] Atualizar `CardapioPublico.tsx` para mostrar e somar taxa
- [ ] Build passando
- [ ] Commit: `feat: taxa de entrega configurável por estabelecimento`

---

## Task 6: Controle de Estoque

**Files:**
- Modify: `src/routes/cardapio.ts`
- Modify: `src/routes/publico.ts`
- Modify: `frontend/src/pages/Cardapio.tsx`

**Backend — cardapio.ts:**
- Adicionar `estoque` nos schemas de criar/atualizar item
- `GET /cardapio`: retornar `estoque` nos itens

**Backend — publico.ts:**
- `POST /pub/:slug/pedido`: após criar pedido, decrementar estoque de cada item. Se `estoque <= 0` após decremento, setar `disponivel: false`
- `GET /pub/:slug`: não filtrar por estoque aqui (já filtra por `disponivel`)

**Frontend — Cardapio.tsx:**
- Adicionar campo "Estoque" no modal de criar/editar item (input number, placeholder "Ilimitado")
- Mostrar badge "Estoque: N" quando item tem estoque definido
- Badge vermelho quando estoque ≤ 5

- [ ] Atualizar schemas e handlers em `cardapio.ts`
- [ ] Decrementar estoque em `publico.ts` na criação de pedido
- [ ] Atualizar modal de item em `Cardapio.tsx`
- [ ] Build passando
- [ ] Commit: `feat: controle de estoque por item do cardápio`

---

## Task 7: Avaliação de Pedido

**Files:**
- Modify: `src/routes/pedidos.ts`
- Create: `frontend/src/pages/Avaliar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Cozinha.tsx` (mostrar estrelas nos entregues)

**Backend — pedidos.ts:**

Nova rota pública `POST /pedidos/:id/avaliar` (sem auth):
```ts
const AvaliarSchema = Type.Object({
  avaliacao: Type.Integer({ minimum: 1, maximum: 5 }),
  comentario: Type.Optional(Type.String({ maxLength: 500 })),
})
// Validar que pedido está 'entregue' antes de aceitar avaliação
```

**Frontend — `Avaliar.tsx`:**
- Página pública `/avaliar/:pedidoId`
- Busca dados do pedido (rota pública simples)
- Mostra 5 estrelas clicáveis
- Campo de comentário opcional
- POST para `/pedidos/:id/avaliar`
- Mensagem de agradecimento após envio

**Frontend — Cozinha.tsx:**
- Nos cards de pedido `entregue`: mostrar estrelinhas se já avaliado

- [ ] Adicionar `POST /pedidos/:id/avaliar` em `pedidos.ts` (rota pública)
- [ ] Criar `frontend/src/pages/Avaliar.tsx`
- [ ] Registrar `/avaliar/:pedidoId` em `App.tsx`
- [ ] Mostrar avaliação nos cards entregues em `Cozinha.tsx`
- [ ] Build passando
- [ ] Commit: `feat: avaliação de pedido após entrega`

---

## Task 8: Evolution API — WhatsApp

**Files:**
- Create: `src/evolution.ts`
- Modify: `src/routes/publico.ts` (enviar mensagem em novo pedido)
- Modify: `src/routes/estabelecimentos.ts` (salvar config Evolution)
- Modify: `frontend/src/pages/Configuracoes.tsx` (seção WhatsApp)

**Backend — `src/evolution.ts`:**
```ts
interface EvolutionConfig {
  url:   string
  token: string
}

export async function enviarMensagemWhatsApp(
  config: EvolutionConfig,
  fone: string,   // formato: 5585999991234
  mensagem: string,
) {
  const instancia = new URL(config.url).pathname.split('/').filter(Boolean)[0] ?? 'default'
  await fetch(`${config.url}/message/sendText/${instancia}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.token },
    body: JSON.stringify({ number: fone, text: mensagem }),
  })
}

export function formatarFone(fone: string): string {
  return fone.replace(/\D/g, '').replace(/^0/, '55')
}

export function montarMensagemPedido(params: {
  nomeEstabelecimento: string
  clienteNome: string
  itens: Array<{ nomeItem: string; quantidade: number }>
  total: number
}): string {
  const linhas = params.itens.map(i => `  ${i.quantidade}x ${i.nomeItem}`).join('\n')
  return [
    `✅ *Pedido confirmado — ${params.nomeEstabelecimento}*`,
    ``,
    `Olá, ${params.clienteNome}! Recebemos seu pedido:`,
    ``,
    linhas,
    ``,
    `*Total: R$ ${params.total.toFixed(2)}*`,
    ``,
    `Acompanhe o status pelo link que você recebeu. 🍽️`,
  ].join('\n')
}
```

**Backend — publico.ts:**

Após criar pedido e emitir socket, fire-and-forget:
```ts
if (estabelecimento.evolutionUrl && estabelecimento.evolutionToken) {
  enviarMensagemWhatsApp(
    { url: estabelecimento.evolutionUrl, token: estabelecimento.evolutionToken },
    formatarFone(dados.clienteFone),
    montarMensagemPedido({ ... }),
  ).catch(err => fastify.log.error({ err }, 'Falha Evolution API'))
}
```

**Backend — estabelecimentos.ts:**
- Schema: adicionar `evolutionUrl` e `evolutionToken` opcionais
- Handler PATCH: persistir esses campos

**Frontend — Configuracoes.tsx:**

Nova seção "WhatsApp (Evolution API)":
- Campo URL da instância
- Campo Token/API Key
- Botão "Salvar"
- Texto de ajuda: "Configure sua instância Evolution API para enviar confirmações automáticas por WhatsApp"

- [ ] Criar `src/evolution.ts`
- [ ] Disparar WhatsApp em `publico.ts` após criar pedido
- [ ] Atualizar schema e handler em `estabelecimentos.ts`
- [ ] Adicionar seção WhatsApp em `Configuracoes.tsx`
- [ ] Build passando
- [ ] Commit: `feat: integração Evolution API — confirmação de pedido por WhatsApp`

---

## Deploy Final

- [ ] `railway up --detach` no backend
- [ ] Verificar logs do Railway após cada deploy
- [ ] Vercel pega o push do frontend automaticamente
