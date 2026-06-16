# Estruturação do Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 4 features estruturais: (1) Super Admin cria estabelecimento, (2) reset de senha por email, (3) role OPERADOR com acesso restrito à Cozinha, (4) notificação sonora/visual de novo pedido no painel.

**Architecture:** Backend Fastify + Prisma com novas rotas em `admin.ts`, `auth.ts` e novo arquivo `operadores.ts`. Frontend React com novos componentes de guard (`RotaDono`), páginas (`EsqueciSenha`, `RedefinirSenha`, `Operadores`) e atualizações em `Layout.tsx` para notificações via Socket.IO.

**Tech Stack:** Node.js 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL / React 19 + Vite 7 + Tailwind v4 + Socket.IO

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `src/utils/slug.ts` | Criar | `slugify` + `gerarSlugUnico` compartilhados entre auth e admin |
| `src/routes/auth.ts` | Modificar | Remover funções de slug duplicadas; adicionar esqueci-senha e redefinir-senha |
| `src/routes/admin.ts` | Modificar | Adicionar `POST /admin/estabelecimentos` |
| `src/routes/operadores.ts` | Criar | `GET/POST/DELETE /estabelecimentos/operadores` — apenas DONO |
| `src/mailer.ts` | Modificar | Adicionar template `resetSenha` |
| `src/server.ts` | Modificar | Registrar `operadoresRoutes` |
| `prisma/schema.prisma` | Modificar | Adicionar `resetToken` e `resetTokenExpiracao` em `Usuario` |
| `frontend/src/components/RotaDono.tsx` | Criar | Guard: DONO only; OPERADOR → /cozinha; SUPER_ADMIN → /admin |
| `frontend/src/pages/EsqueciSenha.tsx` | Criar | Formulário de solicitação de reset de senha |
| `frontend/src/pages/RedefinirSenha.tsx` | Criar | Formulário de nova senha; lê token da URL |
| `frontend/src/pages/Operadores.tsx` | Criar | DONO gerencia operadores do seu estabelecimento |
| `frontend/src/pages/Login.tsx` | Modificar | Link "Esqueceu a senha?"; redirect OPERADOR → /cozinha; exibir mensagem de sucesso |
| `frontend/src/pages/admin/AdminEstabelecimentos.tsx` | Modificar | Botão + modal para criar estabelecimento |
| `frontend/src/components/Layout.tsx` | Modificar | Nav com Operadores (DONO only); socket para toast + beep |
| `frontend/src/App.tsx` | Modificar | Novas rotas; RotaDono em /dashboard e /cardapio |

---

## Task 1: Extrair utilitários de slug para módulo compartilhado

**Files:**
- Create: `src/utils/slug.ts`
- Modify: `src/routes/auth.ts`

- [ ] **Step 1: Criar `src/utils/slug.ts`**

```typescript
import { prisma } from '../database.js';

export function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function gerarSlugUnico(base: string): Promise<string> {
  const slugBase = slugify(base);
  let candidato = slugBase;
  let tentativa = 1;
  while (true) {
    const existente = await prisma.estabelecimento.findUnique({ where: { slug: candidato } });
    if (!existente) return candidato;
    tentativa++;
    candidato = `${slugBase}-${tentativa}`;
  }
}
```

- [ ] **Step 2: Atualizar `src/routes/auth.ts` — remover funções locais e importar do módulo**

Substituir as linhas 20-38 de `src/routes/auth.ts` (as funções `slugify` e `gerarSlugUnico`) por:

```typescript
import { gerarSlugUnico } from '../utils/slug.js';
```

O import fica logo abaixo dos imports existentes, antes da definição dos schemas. As funções `slugify` e `gerarSlugUnico` são removidas do arquivo.

- [ ] **Step 3: Verificar compilação**

```bash
cd /Users/vinicius/comanda-ia && npm run build
```

Esperado: saída sem erros TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/utils/slug.ts src/routes/auth.ts
git commit -m "refactor: extrai slugify e gerarSlugUnico para utils/slug"
```

---

## Task 2: Backend — Super Admin cria estabelecimento

**Files:**
- Modify: `src/routes/admin.ts`

- [ ] **Step 1: Adicionar import de bcrypt e gerarSlugUnico em `src/routes/admin.ts`**

No topo do arquivo, adicionar após os imports existentes:

```typescript
import bcrypt from 'bcrypt';
import { gerarSlugUnico } from '../utils/slug.js';
```

- [ ] **Step 2: Adicionar schema e rota `POST /admin/estabelecimentos` em `src/routes/admin.ts`**

Logo após `const AtualizarStatusEstabelecimentoSchema` (linha ~17), adicionar:

```typescript
const CriarEstabelecimentoSchema = Type.Object({
  nomeEstabelecimento: Type.String({ minLength: 2, maxLength: 100 }),
  telefone:            Type.String({ minLength: 8, maxLength: 20 }),
  nomeDono:            Type.String({ minLength: 2, maxLength: 100 }),
  emailDono:           Type.String({ format: 'email' }),
  senhaDono:           Type.String({ minLength: 8, maxLength: 100 }),
});
```

Dentro de `adminRoutes`, antes do `GET /admin/estabelecimentos`, adicionar a nova rota:

```typescript
// ── POST /admin/estabelecimentos ─────────────────────────────────────────────
// Super Admin cria estabelecimento + DONO diretamente como 'ativo'
fastify.post('/admin/estabelecimentos', {
  schema: { body: CriarEstabelecimentoSchema },
}, async (request, reply) => {
  const dados = request.body as {
    nomeEstabelecimento: string;
    telefone: string;
    nomeDono: string;
    emailDono: string;
    senhaDono: string;
  };

  const emailExistente = await prisma.usuario.findUnique({ where: { email: dados.emailDono } });
  if (emailExistente) {
    return reply.status(409).send({ erro: 'Email já cadastrado' });
  }

  const slug = await gerarSlugUnico(dados.nomeEstabelecimento);
  const senhaHash = await bcrypt.hash(dados.senhaDono, 12);

  const resultado = await prisma.estabelecimento.create({
    data: {
      nome:     dados.nomeEstabelecimento,
      telefone: dados.telefone,
      slug,
      status:   'ativo',
      usuarios: {
        create: {
          nome:      dados.nomeDono,
          email:     dados.emailDono,
          senhaHash,
          role:      'DONO',
        },
      },
    },
    include: {
      _count: { select: { usuarios: true, pedidos: true, itens: true } },
    },
  });

  return reply.status(201).send({
    id:           resultado.id,
    nome:         resultado.nome,
    slug:         resultado.slug,
    telefone:     resultado.telefone,
    status:       resultado.status,
    criadoEm:     resultado.criadoEm,
    totalUsuarios: resultado._count.usuarios,
    totalPedidos:  resultado._count.pedidos,
    totalItens:    resultado._count.itens,
  });
});
```

- [ ] **Step 3: Verificar compilação**

```bash
cd /Users/vinicius/comanda-ia && npm run build
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.ts
git commit -m "feat: super admin pode criar estabelecimento diretamente como ativo"
```

---

## Task 3: Frontend — Modal para criar estabelecimento no painel admin

**Files:**
- Modify: `frontend/src/pages/admin/AdminEstabelecimentos.tsx`

- [ ] **Step 1: Adicionar imports necessários**

No topo de `AdminEstabelecimentos.tsx`, atualizar a linha de imports do React e adicionar `FormEvent`:

```typescript
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
```

Na linha de imports do lucide-react, adicionar `Plus`, `X` e `Loader2` (já existe, manter):

```typescript
import { Building2, Loader2, CheckCircle2, XCircle, Clock, Plus, X } from 'lucide-react'
```

- [ ] **Step 2: Adicionar estado do modal na função `AdminEstabelecimentos`**

Logo após `const [atualizando, setAtualizando] = useState<string | null>(null)`, adicionar:

```typescript
const [novoModalAberto, setNovoModalAberto] = useState(false)
const [criando, setCriando] = useState(false)
const [erroModal, setErroModal] = useState<string | null>(null)
const [nomeEst, setNomeEst] = useState('')
const [telefone, setTelefone] = useState('')
const [nomeDono, setNomeDono] = useState('')
const [emailDono, setEmailDono] = useState('')
const [senhaDono, setSenhaDono] = useState('')
```

- [ ] **Step 3: Adicionar funções `abrirNovoModal` e `criarEstabelecimento`**

Logo após a função `mudarStatus`, adicionar:

```typescript
function abrirNovoModal() {
  setNomeEst('')
  setTelefone('')
  setNomeDono('')
  setEmailDono('')
  setSenhaDono('')
  setErroModal(null)
  setNovoModalAberto(true)
}

async function criarEstabelecimento(e: FormEvent) {
  e.preventDefault()
  setErroModal(null)
  setCriando(true)
  try {
    const resp = await fetch(`${API_URL}/admin/estabelecimentos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        nomeEstabelecimento: nomeEst,
        telefone,
        nomeDono,
        emailDono,
        senhaDono,
      }),
    })
    const dados = await resp.json()
    if (!resp.ok) {
      setErroModal(dados.erro ?? 'Erro ao criar estabelecimento')
      return
    }
    setLista((prev) => [dados, ...prev])
    setNovoModalAberto(false)
  } catch {
    setErroModal('Falha de conexão')
  } finally {
    setCriando(false)
  }
}
```

- [ ] **Step 4: Adicionar botão "Novo Estabelecimento" no header da página**

Substituir o bloco `<div className="mb-8">` por:

```tsx
<div className="mb-8 flex items-center justify-between">
  <div>
    <h2 className="text-2xl font-extrabold">Estabelecimentos</h2>
    <p className="mt-1 text-sm text-zinc-400">{lista.length} cadastrados na plataforma</p>
  </div>
  <button
    onClick={abrirNovoModal}
    className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
  >
    <Plus className="h-4 w-4" />
    Novo Estabelecimento
  </button>
</div>
```

- [ ] **Step 5: Adicionar modal JSX antes do `</LayoutAdmin>` de fechamento**

```tsx
{novoModalAberto && (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8">
    <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-bold">Novo Estabelecimento</h3>
        <button
          onClick={() => setNovoModalAberto(false)}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <form onSubmit={criarEstabelecimento} className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Estabelecimento</p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
          <input
            type="text"
            required
            value={nomeEst}
            onChange={(e) => setNomeEst(e.target.value)}
            placeholder="Ex: Galeteria do João"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-300">Telefone</span>
          <input
            type="text"
            required
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(51) 99999-0000"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
          />
        </label>
        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Responsável (DONO)</p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
          <input
            type="text"
            required
            value={nomeDono}
            onChange={(e) => setNomeDono(e.target.value)}
            placeholder="Nome completo"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email</span>
          <input
            type="email"
            required
            value={emailDono}
            onChange={(e) => setEmailDono(e.target.value)}
            placeholder="dono@email.com"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-300">Senha provisória</span>
          <input
            type="password"
            required
            minLength={8}
            value={senhaDono}
            onChange={(e) => setSenhaDono(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
          />
        </label>
        {erroModal && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
            {erroModal}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setNovoModalAberto(false)}
            className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={criando}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {criando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar estabelecimento
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verificar build do frontend**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: sem erros TypeScript.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/admin/AdminEstabelecimentos.tsx
git commit -m "feat: super admin pode criar estabelecimento via modal no painel admin"
```

---

## Task 4: Schema — campos de reset de senha

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar campos em `Usuario`**

No model `Usuario` de `prisma/schema.prisma`, adicionar após `criadoEm`:

```prisma
resetToken           String?
resetTokenExpiracao  DateTime?
```

O model completo fica:

```prisma
model Usuario {
  id        String   @id @default(uuid())
  email     String   @unique
  senhaHash String
  nome      String
  role      Role     @default(DONO)
  criadoEm  DateTime @default(now())

  resetToken           String?
  resetTokenExpiracao  DateTime?

  estabelecimentoId String?
  estabelecimento   Estabelecimento? @relation(fields: [estabelecimentoId], references: [id])

  @@map("usuarios")
}
```

- [ ] **Step 2: Executar migration**

```bash
cd /Users/vinicius/comanda-ia && npx prisma migrate dev --name add-reset-senha
```

Esperado: mensagem `The following migration(s) have been created and applied` sem erros.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: adiciona campos resetToken e resetTokenExpiracao em Usuario"
```

---

## Task 5: Backend — reset de senha (rotas + template de email)

**Files:**
- Modify: `src/mailer.ts`
- Modify: `src/routes/auth.ts`

- [ ] **Step 1: Adicionar template `resetSenha` em `src/mailer.ts`**

Dentro do objeto `templates`, após `cadastroAprovado` e antes de `novoPedido`, adicionar:

```typescript
resetSenha(nome: string, urlRedefinicao: string): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#18181b">
      <h2 style="color:#f97316">Redefinição de senha</h2>
      <p>Olá, <strong>${nome}</strong>!</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta na Comanda IA.</p>
      <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
      <p>
        <a href="${urlRedefinicao}"
           style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
          Redefinir senha →
        </a>
      </p>
      <p style="color:#71717a;font-size:13px">Se você não solicitou a redefinição, ignore este email com segurança.</p>
      <p style="color:#a1a1aa;font-size:12px;margin-top:32px">Comanda IA — Plataforma de pedidos para food service</p>
    </div>
  `;
},
```

- [ ] **Step 2: Adicionar import `randomUUID` em `src/routes/auth.ts`**

No topo do arquivo, adicionar após os imports existentes:

```typescript
import { randomUUID } from 'crypto';
```

- [ ] **Step 3: Adicionar schemas de reset em `src/routes/auth.ts`**

Após `LoginSchema`, adicionar:

```typescript
const EsqueciSenhaSchema = Type.Object({
  email: Type.String({ format: 'email' }),
});

const RedefinirSenhaSchema = Type.Object({
  token:     Type.String({ minLength: 1 }),
  novaSenha: Type.String({ minLength: 8, maxLength: 100 }),
});
```

- [ ] **Step 4: Adicionar rota `POST /auth/esqueci-senha` em `src/routes/auth.ts`**

Dentro de `authRoutes`, após a rota de login, adicionar:

```typescript
// ── POST /auth/esqueci-senha ─────────────────────────────────────────────────
fastify.post('/auth/esqueci-senha', {
  schema: { body: EsqueciSenhaSchema },
}, async (request) => {
  const { email } = request.body as { email: string };

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  // Resposta idêntica seja o email cadastrado ou não — não vaza informação
  const resposta = { mensagem: 'Se este email estiver cadastrado, você receberá as instruções em instantes.' };

  if (!usuario) return resposta;

  const token = randomUUID();
  const expiracao = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { resetToken: token, resetTokenExpiracao: expiracao },
  });

  const urlFrontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const urlRedefinicao = `${urlFrontend}/redefinir-senha?token=${token}`;

  enviarEmail({
    to:      usuario.email,
    subject: 'Redefinição de senha — Comanda IA',
    html:    templates.resetSenha(usuario.nome, urlRedefinicao),
  }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de reset'));

  return resposta;
});
```

- [ ] **Step 5: Adicionar rota `POST /auth/redefinir-senha` em `src/routes/auth.ts`**

Logo após a rota de esqueci-senha, adicionar:

```typescript
// ── POST /auth/redefinir-senha ───────────────────────────────────────────────
fastify.post('/auth/redefinir-senha', {
  schema: { body: RedefinirSenhaSchema },
}, async (request, reply) => {
  const { token, novaSenha } = request.body as { token: string; novaSenha: string };

  const usuario = await prisma.usuario.findFirst({
    where: { resetToken: token },
  });

  if (!usuario || !usuario.resetTokenExpiracao || usuario.resetTokenExpiracao < new Date()) {
    return reply.status(400).send({ erro: 'Link inválido ou expirado. Solicite um novo.' });
  }

  const senhaHash = await bcrypt.hash(novaSenha, 12);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash, resetToken: null, resetTokenExpiracao: null },
  });

  return { mensagem: 'Senha redefinida com sucesso' };
});
```

- [ ] **Step 6: Verificar compilação**

```bash
cd /Users/vinicius/comanda-ia && npm run build
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/mailer.ts src/routes/auth.ts
git commit -m "feat: reset de senha por email (esqueci-senha + redefinir-senha)"
```

---

## Task 6: Frontend — páginas de reset de senha

**Files:**
- Create: `frontend/src/pages/EsqueciSenha.tsx`
- Create: `frontend/src/pages/RedefinirSenha.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Criar `frontend/src/pages/EsqueciSenha.tsx`**

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { ChefHat, Mail, Loader2, ArrowLeft } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      const resp = await fetch(`${API_URL}/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!resp.ok) {
        const dados = await resp.json()
        setErro(dados.erro ?? 'Erro ao processar solicitação')
        return
      }
      setEnviado(true)
    } catch {
      setErro('Falha de conexão com o servidor')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100">Recuperar senha</h1>
          <p className="mt-1 text-center text-sm text-zinc-400">
            {enviado ? 'Verifique seu email' : 'Informe seu email para receber as instruções'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          {enviado ? (
            <div className="text-center">
              <p className="mb-6 text-sm text-zinc-300">
                Se <strong className="text-zinc-100">{email}</strong> estiver cadastrado,
                você receberá um link para redefinir sua senha em instantes.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-orange-400 hover:text-orange-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                  />
                </div>
              </label>

              {erro && (
                <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={carregando || !email}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {carregando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                ) : 'Enviar instruções'}
              </button>

              <p className="mt-4 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `frontend/src/pages/RedefinirSenha.tsx`**

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ChefHat, Lock, Loader2 } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem')
      return
    }
    setCarregando(true)
    try {
      const resp = await fetch(`${API_URL}/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha }),
      })
      const dados = await resp.json()
      if (!resp.ok) {
        setErro(dados.erro ?? 'Erro ao redefinir senha')
        return
      }
      navigate('/login', { state: { mensagem: 'Senha redefinida com sucesso! Faça login.' } })
    } catch {
      setErro('Falha de conexão com o servidor')
    } finally {
      setCarregando(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans text-center">
        <div>
          <p className="text-zinc-400">Link inválido ou incompleto.</p>
          <Link to="/login" className="mt-4 inline-block text-sm text-orange-400 hover:text-orange-300">
            Voltar ao login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100">Nova senha</h1>
          <p className="mt-1 text-sm text-zinc-400">Escolha uma senha com no mínimo 8 caracteres</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Nova senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                minLength={8}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          <label className="mb-6 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Confirmar senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                minLength={8}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          {erro && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando || !novaSenha || !confirmarSenha}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {carregando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Atualizar `frontend/src/pages/Login.tsx`**

Adicionar `useLocation` ao import de react-router:

```tsx
import { Link, useNavigate, useLocation } from 'react-router'
```

Logo após `const [carregando, setCarregando] = useState(false)`, adicionar:

```tsx
const location = useLocation()
const mensagemSucesso = (location.state as { mensagem?: string } | null)?.mensagem ?? null
```

No `handleSubmit`, substituir o bloco de redirect por:

```tsx
localStorage.setItem('token', dados.token)

if (dados.usuario.role === 'SUPER_ADMIN') {
  navigate('/admin')
} else if (dados.usuario.role === 'OPERADOR') {
  navigate('/cozinha')
} else {
  navigate('/dashboard')
}
```

No JSX, antes do `{erro && ...}`, adicionar exibição da mensagem de sucesso:

```tsx
{mensagemSucesso && (
  <p className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 ring-1 ring-emerald-500/30">
    {mensagemSucesso}
  </p>
)}
```

No final do form, após o parágrafo de "Não tem conta?", adicionar link de esqueceu a senha:

```tsx
<p className="mt-2 text-center text-sm text-zinc-500">
  <Link to="/esqueci-senha" className="font-medium text-zinc-400 hover:text-zinc-300">
    Esqueceu sua senha?
  </Link>
</p>
```

- [ ] **Step 4: Atualizar `frontend/src/App.tsx` — adicionar novas rotas**

Adicionar imports:

```tsx
import EsqueciSenha from './pages/EsqueciSenha'
import RedefinirSenha from './pages/RedefinirSenha'
```

Na seção de rotas públicas, adicionar:

```tsx
<Route path="/esqueci-senha"   element={<EsqueciSenha />} />
<Route path="/redefinir-senha" element={<RedefinirSenha />} />
```

- [ ] **Step 5: Verificar build do frontend**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: sem erros TypeScript.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/EsqueciSenha.tsx frontend/src/pages/RedefinirSenha.tsx \
        frontend/src/pages/Login.tsx frontend/src/App.tsx
git commit -m "feat: reset de senha por email — páginas EsqueciSenha e RedefinirSenha"
```

---

## Task 7: Backend — rotas de operadores

**Files:**
- Create: `src/routes/operadores.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Criar `src/routes/operadores.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const CriarOperadorSchema = Type.Object({
  nome:  Type.String({ minLength: 2, maxLength: 100 }),
  email: Type.String({ format: 'email' }),
  senha: Type.String({ minLength: 8, maxLength: 100 }),
});

export async function operadoresRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', autenticar);

  // ── GET /estabelecimentos/operadores ──────────────────────────────────────
  fastify.get('/estabelecimentos/operadores', async (request, reply) => {
    if (request.user.role !== 'DONO') {
      return reply.status(403).send({ erro: 'Apenas o DONO pode gerenciar operadores' });
    }

    const operadores = await prisma.usuario.findMany({
      where: {
        estabelecimentoId: request.user.estabelecimentoId!,
        role:              'OPERADOR',
      },
      select:  { id: true, nome: true, email: true, criadoEm: true },
      orderBy: { criadoEm: 'desc' },
    });

    return operadores;
  });

  // ── POST /estabelecimentos/operadores ────────────────────────────────────
  fastify.post('/estabelecimentos/operadores', {
    schema: { body: CriarOperadorSchema },
  }, async (request, reply) => {
    if (request.user.role !== 'DONO') {
      return reply.status(403).send({ erro: 'Apenas o DONO pode gerenciar operadores' });
    }

    const { nome, email, senha } = request.body as { nome: string; email: string; senha: string };

    const emailExistente = await prisma.usuario.findUnique({ where: { email } });
    if (emailExistente) {
      return reply.status(409).send({ erro: 'Email já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const operador = await prisma.usuario.create({
      data: {
        nome,
        email,
        senhaHash,
        role:              'OPERADOR',
        estabelecimentoId: request.user.estabelecimentoId!,
      },
      select: { id: true, nome: true, email: true, criadoEm: true },
    });

    return reply.status(201).send(operador);
  });

  // ── DELETE /estabelecimentos/operadores/:id ──────────────────────────────
  fastify.delete('/estabelecimentos/operadores/:id', {
    schema: { params: Type.Object({ id: Type.String() }) },
  }, async (request, reply) => {
    if (request.user.role !== 'DONO') {
      return reply.status(403).send({ erro: 'Apenas o DONO pode gerenciar operadores' });
    }

    const { id } = request.params as { id: string };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (
      !operador ||
      operador.estabelecimentoId !== request.user.estabelecimentoId ||
      operador.role !== 'OPERADOR'
    ) {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    await prisma.usuario.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Registrar em `src/server.ts`**

Adicionar import logo após o import de `adminRoutes`:

```typescript
import { operadoresRoutes } from './routes/operadores.js';
```

Adicionar registro após `await fastify.register(estabelecimentosRoutes)`:

```typescript
await fastify.register(operadoresRoutes);
```

- [ ] **Step 3: Verificar compilação**

```bash
cd /Users/vinicius/comanda-ia && npm run build
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/routes/operadores.ts src/server.ts
git commit -m "feat: rotas de operadores (GET/POST/DELETE) acessíveis pelo DONO"
```

---

## Task 8: Frontend — guard RotaDono + redirect de login para OPERADOR

**Files:**
- Create: `frontend/src/components/RotaDono.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Criar `frontend/src/components/RotaDono.tsx`**

```tsx
import { Navigate } from 'react-router'
import { getRole } from '../lib/auth'

interface Props {
  children: React.ReactNode
}

export default function RotaDono({ children }: Props) {
  const token = localStorage.getItem('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const role = getRole()

  if (role === 'OPERADOR') {
    return <Navigate to="/cozinha" replace />
  }

  if (role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 2: Atualizar `frontend/src/App.tsx` — adicionar RotaDono nas rotas existentes**

Adicionar import de `RotaDono`:

```tsx
import RotaDono from './components/RotaDono'
```

Substituir as rotas do painel do estabelecimento (manter `/operadores` para Task 9):

```tsx
{/* Painel do estabelecimento */}
<Route path="/dashboard" element={<RotaDono><Dashboard /></RotaDono>} />
<Route path="/cozinha"   element={<RotaProtegida><Cozinha /></RotaProtegida>} />
<Route path="/cardapio"  element={<RotaDono><Cardapio /></RotaDono>} />
```

- [ ] **Step 3: Verificar build do frontend**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: sem erros TypeScript.

- [ ] **Step 4: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/components/RotaDono.tsx frontend/src/App.tsx
git commit -m "feat: RotaDono guard — OPERADOR só acessa /cozinha"
```

---

## Task 9: Frontend — página Operadores + nav link no Layout

**Files:**
- Create: `frontend/src/pages/Operadores.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Criar `frontend/src/pages/Operadores.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Users, Plus, Trash2, Loader2, X } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Operador {
  id:       string
  nome:     string
  email:    string
  criadoEm: string
}

function formatarData(data: string) {
  return new Date(data).toLocaleDateString('pt-BR')
}

export default function Operadores() {
  const token = localStorage.getItem('token')
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [criando, setCriando] = useState(false)
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/estabelecimentos/operadores`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setOperadores)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  function abrirModal() {
    setNome('')
    setEmail('')
    setSenha('')
    setErro(null)
    setModalAberto(true)
  }

  async function criarOperador(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCriando(true)
    try {
      const resp = await fetch(`${API_URL}/estabelecimentos/operadores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome, email, senha }),
      })
      const dados = await resp.json()
      if (!resp.ok) {
        setErro(dados.erro ?? 'Erro ao criar operador')
        return
      }
      setOperadores((prev) => [dados, ...prev])
      setModalAberto(false)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCriando(false)
    }
  }

  async function removerOperador(id: string) {
    setRemovendoId(id)
    try {
      await fetch(`${API_URL}/estabelecimentos/operadores/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setOperadores((prev) => prev.filter((o) => o.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setRemovendoId(null)
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Operadores</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {operadores.length} cadastrado{operadores.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Novo Operador
        </button>
      </div>

      {carregando ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : operadores.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Users className="h-10 w-10" />
          <p>Nenhum operador cadastrado.</p>
          <button onClick={abrirModal} className="text-sm font-medium text-orange-400 hover:text-orange-300">
            Adicionar operador
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {operadores.map((op) => (
            <div
              key={op.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div>
                <p className="font-semibold">{op.nome}</p>
                <p className="mt-0.5 text-sm text-zinc-400">{op.email}</p>
                <p className="mt-0.5 text-xs text-zinc-600">desde {formatarData(op.criadoEm)}</p>
              </div>
              <button
                onClick={() => removerOperador(op.id)}
                disabled={removendoId === op.id}
                className="rounded-xl bg-red-500/10 p-2.5 text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {removendoId === op.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo operador */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Novo Operador</h3>
              <button
                onClick={() => setModalAberto(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarOperador} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@email.com"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Senha</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              {erro && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                  {erro}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criando}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {criando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar operador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: Substituir `frontend/src/components/Layout.tsx` completo**

Layout recebe link de Operadores (só DONO) e listener de Socket.IO para toast + beep:

```tsx
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { ChefHat, LogOut, Users, X } from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { getRole } from '../lib/auth'

interface Toast {
  id:          number
  clienteNome: string
  total:       number
}

interface Props {
  children:     ReactNode
  headerExtra?: ReactNode
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'bg-orange-500/15 text-orange-400'
      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
  }`

function tocarBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
  } catch {
    // AudioContext indisponível no ambiente
  }
}

export default function Layout({ children, headerExtra }: Props) {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const role = getRole()
  const { socket } = useSocket(token)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    if (!socket) return

    const handler = (pedido: { clienteNome: string; total: number | string }) => {
      const id = Date.now()
      tocarBeep()
      setToasts((prev) => [
        ...prev,
        { id, clienteNome: pedido.clienteNome, total: Number(pedido.total) },
      ])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
    }

    socket.on('pedido:novo', handler)
    return () => { socket.off('pedido:novo', handler) }
  }, [socket])

  function removerToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  function handleSair() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const isDono = role === 'DONO'

  return (
    <div className="min-h-dvh bg-zinc-950 font-sans text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        {/* Linha superior: logo + ações */}
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">

          <NavLink to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 sm:h-10 sm:w-10">
              <ChefHat className="h-5 w-5 text-white sm:h-6 sm:w-6" />
            </div>
            <h1 className="hidden text-lg font-bold leading-tight text-zinc-100 sm:block">Comanda IA</h1>
          </NavLink>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 sm:flex">
            {isDono && <NavLink to="/dashboard" className={linkClass}>Home</NavLink>}
            <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
            {isDono && <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink>}
            {isDono && (
              <NavLink to="/operadores" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Operadores
                </span>
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              onClick={handleSair}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Nav mobile */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2 sm:hidden">
          {isDono && <NavLink to="/dashboard" className={linkClass}>Home</NavLink>}
          <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
          {isDono && <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink>}
          {isDono && (
            <NavLink to="/operadores" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Operadores
              </span>
            </NavLink>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      {/* Toasts de novo pedido */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start gap-3 rounded-2xl border border-orange-500/30 bg-zinc-900 p-4 shadow-lg ring-1 ring-orange-500/20"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                <ChefHat className="h-5 w-5 text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-100">Novo pedido!</p>
                <p className="text-xs text-zinc-400">
                  {toast.clienteNome} · R$ {toast.total.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => removerToast(toast.id)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Adicionar rota `/operadores` em `frontend/src/App.tsx`**

Adicionar import:

```tsx
import Operadores from './pages/Operadores'
```

Na seção de rotas do painel do estabelecimento, adicionar após `/cardapio`:

```tsx
<Route path="/operadores" element={<RotaDono><Operadores /></RotaDono>} />
```

- [ ] **Step 4: Verificar build do frontend**

```bash
cd /Users/vinicius/comanda-ia/frontend && npm run build
```

Esperado: sem erros TypeScript.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add frontend/src/pages/Operadores.tsx frontend/src/components/Layout.tsx frontend/src/App.tsx
git commit -m "feat: página Operadores + nav condicional (DONO) + toast e beep de novo pedido"
```

---

## Verificação final

- [ ] **Iniciar backend e frontend**

```bash
# Terminal 1 — backend
cd /Users/vinicius/comanda-ia && npm run dev

# Terminal 2 — frontend
cd /Users/vinicius/comanda-ia/frontend && npm run dev
```

- [ ] **Testar Feature 1 — Admin cria estabelecimento**
  1. Login como `admin@comanda-ia.dev / superadmin123`
  2. Ir para `/admin/estabelecimentos`
  3. Clicar em "Novo Estabelecimento", preencher form, clicar em Criar
  4. Verificar: novo card aparece na lista com status Ativo

- [ ] **Testar Feature 2 — Reset de senha**
  1. Acessar `/esqueci-senha`, digitar `vinicius@teste.com`, enviar
  2. Verificar no log do backend que o email foi enviado (ou verificar inbox se SMTP configurado)
  3. Acessar `/redefinir-senha?token=<token-do-log>`
  4. Definir nova senha, verificar redirect para `/login` com mensagem de sucesso
  5. Login com a nova senha funciona

- [ ] **Testar Feature 3 — OPERADOR**
  1. Login como `vinicius@teste.com`, ir para `/operadores`
  2. Criar operador com nome, email e senha
  3. Logout, login com o operador criado
  4. Verificar: redirect para `/cozinha`; links Home, Cardápio e Operadores não aparecem no nav
  5. Tentar acessar `/dashboard` manualmente: deve redirecionar para `/cozinha`

- [ ] **Testar Feature 4 — Notificações**
  1. Login como `vinicius@teste.com`, ir para `/cozinha`
  2. Em outra aba, abrir o cardápio público (`/c/galeteria`) e fazer um pedido
  3. Verificar: toast aparece no canto inferior direito com nome do cliente e total; beep toca

- [ ] **Commit final de verificação** (se tudo OK)

```bash
git tag v0.3.0 -m "feat: admin cria estabelecimento, reset senha, role operador, notificações"
```
