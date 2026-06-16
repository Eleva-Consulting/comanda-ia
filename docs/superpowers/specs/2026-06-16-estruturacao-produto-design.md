# Estruturação do Produto — Design Spec
Data: 2026-06-16

## Escopo

Quatro features estruturais antes de integrar Evolution API e Mercado Pago:

1. Cadastro de estabelecimento pelo Super Admin
2. Reset de senha por email
3. Role OPERADOR com permissões restritas
4. Notificação sonora/visual de novo pedido no painel

---

## Feature 1: Cadastro de Estabelecimento pelo Super Admin

### Objetivo
Super Admin cria estabelecimento + usuário DONO diretamente no painel, já como `ativo`, sem depender do fluxo de signup público.

### Backend

**Rota:** `POST /admin/estabelecimentos`

Body:
```json
{
  "nomeEstabelecimento": "string (min 2)",
  "telefone": "string (min 8)",
  "nomeDono": "string (min 2)",
  "emailDono": "string (email)",
  "senhaDono": "string (min 8)"
}
```

- Valida email único (409 se já existe)
- Gera slug único via `gerarSlugUnico` (função já existente em `auth.ts` — será movida para `utils/slug.ts`)
- Cria `Estabelecimento` (status `ativo`) + `Usuario` (role `DONO`) em transação Prisma
- Retorna o estabelecimento criado

**Arquivo:** `src/routes/admin.ts`

### Frontend

- Botão "Novo Estabelecimento" no header de `AdminEstabelecimentos.tsx`
- Modal com form de dois blocos: dados do estabelecimento e dados do DONO
- Ao criar com sucesso, insere o novo card no topo da lista sem reload
- Validação básica inline (campos obrigatórios, email format)

---

## Feature 2: Reset de Senha por Email

### Schema

Adicionar em `Usuario`:
```prisma
resetToken           String?
resetTokenExpiracao  DateTime?
```

### Backend

**`POST /auth/esqueci-senha`**
- Body: `{ email: string }`
- Busca usuário pelo email (retorna 200 mesmo se não encontrar — não vaza existência)
- Gera UUID v4 como token
- Salva `resetToken` e `resetTokenExpiracao` (now + 1h) no usuário
- Envia email com link `{FRONTEND_URL}/redefinir-senha?token=<uuid>`
- Template: `templates.resetSenha(nome, urlRedefinicao)`

**`POST /auth/redefinir-senha`**
- Body: `{ token: string, novaSenha: string (min 8) }`
- Busca usuário pelo token
- Valida que `resetTokenExpiracao > now()`
- Salva nova senha hasheada com bcrypt(12)
- Limpa `resetToken` e `resetTokenExpiracao`
- Retorna 200

**Arquivo:** `src/routes/auth.ts`

### Frontend

- Link "Esqueceu a senha?" na página de login
- `EsqueciSenha.tsx`: form com campo email, feedback de "email enviado"
- `RedefinirSenha.tsx`: lê `?token=` da URL, form com nova senha + confirmação
- Rotas em `App.tsx`: `/esqueci-senha` e `/redefinir-senha`

### Mailer

Novo template `resetSenha(nome, url)` em `src/mailer.ts`.

---

## Feature 3: Role OPERADOR

### Permissões

| Rota         | DONO | OPERADOR |
|--------------|------|----------|
| /dashboard   | ✅   | ❌ → redireciona para /cozinha |
| /cardapio    | ✅   | ❌ → redireciona para /cozinha |
| /operadores  | ✅   | ❌ → redireciona para /cozinha |
| /cozinha     | ✅   | ✅ |

### Backend

Novo arquivo `src/routes/operadores.ts` — protegido por `autenticar`:

- `GET /estabelecimentos/operadores` — lista operadores do estabelecimento do DONO
- `POST /estabelecimentos/operadores` — cria usuário com role `OPERADOR` no mesmo estabelecimento
  - Body: `{ nome, email, senha }`
  - Valida email único (409)
  - Hash bcrypt(12)
- `DELETE /estabelecimentos/operadores/:id` — remove operador (valida que pertence ao mesmo estabelecimento)

Todas as rotas: apenas DONO pode chamar (retorna 403 se OPERADOR tentar).

### Frontend

**Novo componente:** `RotaDono.tsx`
- Se não autenticado → `/login`
- Se OPERADOR → `/cozinha`
- Se DONO ou SUPER_ADMIN → renderiza children

**Ajuste nas rotas** em `App.tsx`:
- `/dashboard` e `/cardapio` trocam `RotaProtegida` por `RotaDono`
- Nova rota `/operadores` com `RotaDono`

**Nova página:** `Operadores.tsx`
- Lista operadores do estabelecimento
- Botão "Novo Operador" → modal com nome, email, senha
- Botão remover por operador

**Ajuste no `Layout.tsx`:** adicionar link "Operadores" no nav (visível só para DONO).

**Ajuste no login:** após login bem-sucedido, se `role === 'OPERADOR'` → navega para `/cozinha`.

---

## Feature 4: Notificação Sonora/Visual de Novo Pedido

### Onde

`Layout.tsx` — presente em todas as páginas autenticadas do painel do estabelecimento. Assim DONO e OPERADOR recebem a notificação independentemente da página em que estiverem.

### Como

O Socket.IO já emite `novoPedido` com os dados do pedido. Basta assinar esse evento no Layout.

**Som:** Web Audio API — gera beep sintético de ~200ms sem precisar de arquivo externo.

```ts
function tocarBeep() {
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
}
```

**Toast:** componente simples no canto inferior direito. Estado: array de toasts com `id`, `clienteNome`, `total`. Cada toast some após 5s ou ao clicar no X.

**Dados necessários no evento `novoPedido`:** `clienteNome` e `total` — já presentes no payload do socket (verificar em `src/socket.ts`).

---

## Migration necessária

Apenas para Feature 2 (reset de senha):
```sql
ALTER TABLE usuarios ADD COLUMN reset_token TEXT;
ALTER TABLE usuarios ADD COLUMN reset_token_expiracao TIMESTAMP;
```

Gerada via `npx prisma migrate dev`.

---

## Ordem de implementação

1. Feature 1 — Admin cria estabelecimento (sem migration)
2. Feature 2 — Reset de senha (migration simples)
3. Feature 3 — OPERADOR (sem migration, maior escopo de frontend)
4. Feature 4 — Notificação (sem migration, escopo pequeno)
