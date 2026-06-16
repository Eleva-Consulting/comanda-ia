# 12 — Super Admin e fluxo de aprovação de estabelecimentos

Este documento registra as decisões e implementações do painel Super Admin e do fluxo de signup com aprovação.

## Contexto

O comanda-ia é um SaaS multi-tenant. Isso significa que a plataforma precisa de dois níveis distintos:

1. **Painel do estabelecimento** — o dono/operador gerencia seu próprio restaurante
2. **Painel da plataforma** — o Super Admin vê e controla todos os tenants

Esses dois mundos nunca se misturam: um DONO nunca acessa `/admin`, e o Super Admin não gerencia cardápio de nenhum restaurante.

## Modelo de roles

```
SUPER_ADMIN  →  proprietário da plataforma, sem vínculo com estabelecimento
DONO         →  dono do restaurante, gerencia seu tenant
OPERADOR     →  funcionário, permissões restritas (futuro)
```

A role fica no JWT. Middlewares no backend leem a role e bloqueiam acesso indevido antes de qualquer lógica de negócio.

## StatusEstabelecimento

Substituiu o campo `ativo: Boolean` por um enum com três estados:

```
pendente  →  recém cadastrado, aguardando aprovação do Super Admin
ativo     →  operando normalmente, cardápio público acessível
suspenso  →  bloqueado pelo Super Admin
```

**Por que enum em vez de boolean?**

Um boolean só representa dois estados. O fluxo de aprovação precisa de três: o restaurante existe (cadastrado), mas ainda não foi aprovado (pendente) — isso é diferente de estar suspenso. Com boolean você teria que criar um segundo campo `aprovado`, o que gera combinações ambíguas (`ativo=false, aprovado=true` — o que significa isso?). O enum elimina a ambiguidade.

**Migração de dados:** a migration converte `ativo=true → ativo` e `ativo=false → suspenso` antes de remover a coluna antiga. Nunca perde dados.

```sql
UPDATE "estabelecimentos" SET "status" = 'ativo'    WHERE "ativo" = true;
UPDATE "estabelecimentos" SET "status" = 'suspenso' WHERE "ativo" = false;
ALTER TABLE "estabelecimentos" DROP COLUMN "ativo";
```

## Fluxo de signup com aprovação

```
/cadastro (público)
  ↓ POST /auth/signup
  Estabelecimento criado com status: 'pendente'
  ↓
/aguardando-aprovacao
  Tela informativa — usuário aguarda contato

Super Admin vê no painel /admin/estabelecimentos
  ↓ clica "Aprovar"
  PATCH /admin/estabelecimentos/:id/status { status: 'ativo' }
  ↓
Dono consegue fazer login normalmente
```

**Login bloqueado para não ativos:**

```typescript
if (usuario.estabelecimento && usuario.estabelecimento.status !== 'ativo') {
  return reply.status(403).send({
    erro: mensagens[usuario.estabelecimento.status],
    status: usuario.estabelecimento.status,
  })
}
```

O erro retorna o `status` junto — o frontend pode usar para mostrar mensagem específica ("aguardando aprovação" vs "conta suspensa").

## Proteção de rotas no backend

Dois middlewares separados com responsabilidades distintas:

```typescript
// Valida o JWT — qualquer role autenticada passa
export async function autenticar(request, reply) {
  await request.jwtVerify()
}

// Garante que é SUPER_ADMIN — bloqueia DONO e OPERADOR com 403
export async function apenasAdmin(request, reply) {
  if (request.user.role !== 'SUPER_ADMIN') {
    return reply.status(403).send({ erro: 'Acesso restrito à plataforma' })
  }
}
```

Rotas do admin usam os dois em sequência:
```typescript
fastify.addHook('onRequest', autenticar)
fastify.addHook('onRequest', apenasAdmin)
```

## estabelecimentoId opcional

O SUPER_ADMIN não pertence a nenhum estabelecimento, então `estabelecimentoId` é `null` no seu JWT e no banco.

```prisma
model Usuario {
  estabelecimentoId String?           // null para SUPER_ADMIN
  estabelecimento   Estabelecimento?  // relação opcional
}
```

Rotas de tenant (cardápio, pedidos) usam `estabelecimentoId!` (non-null assertion) porque só chegam lá após autenticação de DONO/OPERADOR — nunca do Super Admin.

## Proteção de rotas no frontend

```typescript
// RotaProtegida — qualquer usuário autenticado
// Bloqueia: sem token → /login

// RotaAdmin — apenas SUPER_ADMIN
// Bloqueia: sem token → /login
// Bloqueia: DONO/OPERADOR → /dashboard (silencioso, sem erro)
```

O frontend decodifica o JWT localmente para ler a role:

```typescript
// src/lib/auth.ts
export function getTokenPayload(): JwtPayload | null {
  const token = localStorage.getItem('token')
  const base64 = token.split('.')[1]
  return JSON.parse(atob(base64))
}
```

Isso é seguro porque o JWT é apenas lido, não verificado — a verificação real acontece no backend a cada requisição. O frontend usa a role só para UX (redirecionar, mostrar/esconder elementos).

## Redirect por role no login

Após autenticar, o frontend redireciona baseado na role:

```typescript
if (dados.usuario.role === 'SUPER_ADMIN') {
  navigate('/admin')
} else {
  navigate('/dashboard')
}
```

## Layout separado para o admin

O `LayoutAdmin` é completamente separado do `Layout` do restaurante — mesma identidade visual (Comanda IA, laranja) mas com badge "Super Admin" e navegação diferente. Isso reforça ao usuário que está numa área diferente do sistema.

## Endpoints do Super Admin

| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin/estabelecimentos` | Lista todos com contagens |
| PATCH | `/admin/estabelecimentos/:id/status` | Muda status: `pendente \| ativo \| suspenso` |
| GET | `/admin/metricas` | KPIs globais da plataforma |

## Painel admin — ordem de exibição

Pendentes aparecem no topo com destaque e dois botões (Aprovar / Rejeitar). Ativos e suspensos aparecem abaixo com ações contextuais. Isso garante que nada pendente passe despercebido.
