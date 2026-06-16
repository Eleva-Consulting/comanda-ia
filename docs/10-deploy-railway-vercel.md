# 10 — Deploy: Railway + Vercel

Este documento explica como o comanda-ia é deployado em produção e os aprendizados de cada etapa.

## Visão geral

O projeto tem duas partes deployadas em plataformas diferentes:

| Parte | Plataforma | Por quê |
|---|---|---|
| Backend (Node.js + PostgreSQL) | Railway | Suporta processos persistentes, banco incluso, variáveis de ambiente, deploy por push |
| Frontend (React/Vite) | Vercel | CDN global, build automático de projetos Vite/React, preview por PR |

## Backend no Railway

### Como funciona

Railway conecta ao repositório GitHub e faz deploy automático a cada push na branch `main`. Ele detecta o `package.json`, instala dependências, roda o build e sobe o servidor.

### Configurações importantes

**`postinstall` no `package.json`:**
```json
"postinstall": "prisma generate"
```
O Railway roda `npm install` durante o deploy. O `postinstall` garante que o Prisma Client seja gerado após a instalação — sem isso, o servidor sobe mas crasha ao tentar usar o banco porque o client não existe.

**Porta dinâmica:**
```typescript
const porta = Number(process.env.PORT) || 3000
await app.listen({ host: '0.0.0.0', port: porta })
```
Railway injeta a porta via `process.env.PORT`. O `host: '0.0.0.0'` é obrigatório — sem ele o servidor escuta só em `localhost` e o Railway não consegue rotear o tráfego externo.

### Variáveis de ambiente no Railway

Configure no painel do Railway → seu projeto → Variables:

```
DATABASE_URL=postgresql://...  # gerado automaticamente pelo serviço PostgreSQL do Railway
JWT_SECRET=sua_string_forte_aqui
FRONTEND_URL=https://comanda-ia.vercel.app
NODE_ENV=production
```

### CORS em produção

O backend libera CORS dinâmico baseado na variável `FRONTEND_URL`:

```typescript
// src/app.ts
await app.register(cors, {
  origin: [
    'http://localhost:5173',        // dev
    process.env.FRONTEND_URL ?? '', // prod
  ],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
})
```

**Lição aprendida:** `methods` precisa incluir `PATCH` explicitamente. Sem ele, requisições PATCH (atualização de status de pedido) falham com erro de CORS mesmo que o origin esteja correto.

**CORS do Socket.IO é separado** do CORS do Fastify. Configurar um não afeta o outro:

```typescript
// src/socket.ts
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      process.env.FRONTEND_URL ?? '',
    ],
  },
})
```

## Frontend no Vercel

### Como funciona

Vercel conecta ao repositório, detecta que é um projeto Vite, roda `vite build` e serve os arquivos estáticos com CDN global.

### Configuração do diretório raiz

Como o frontend fica em `/frontend` dentro do monorepo, configure no Vercel:
- **Root Directory:** `frontend`
- **Build Command:** `vite build` (detectado automaticamente)
- **Output Directory:** `dist`

### Variáveis de ambiente no Vercel

```
VITE_API_URL=https://comanda-ia-production.up.railway.app
```

O prefixo `VITE_` é obrigatório para que a variável fique disponível no bundle do cliente (browser). Variáveis sem esse prefixo são ignoradas.

No código, acesse via:
```typescript
// src/lib/api.ts
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
```

### Problema do 404 no reload (SPA routing)

**O problema:** O React Router controla as rotas no navegador. Quando você acessa `/login` diretamente ou dá F5, o Vercel procura um arquivo físico `login` no servidor — que não existe. Resultado: 404.

**A solução:** `vercel.json` na raiz do frontend instrui o Vercel a sempre servir `index.html` e deixar o React Router decidir a rota:

```json
// frontend/vercel.json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Isso é padrão para qualquer SPA (Single Page Application) em qualquer servidor estático.

## Fluxo de deploy

```
git push origin main
  ↓
Railway: npm install → postinstall (prisma generate) → tsc (build) → servidor sobe
Vercel:  npm install → vite build → distribui no CDN
```

Ambos deployam em paralelo, automaticamente, em ~2 minutos.

## Troubleshooting

**Deploy bloqueado no Vercel/Railway:**
O email do committer precisa bater com o email da conta GitHub conectada. Se usar `git config user.email`, use o email da sua conta GitHub.

**Prisma: "PrismaClient is unable to run in this browser environment":**
O client foi gerado para o ambiente errado. Verifique se o `postinstall` está no `package.json` e se o `prisma generate` roda durante o deploy.

**Socket.IO não conecta em produção:**
Verifique se o CORS do Socket.IO (`src/socket.ts`) inclui o domínio do frontend. É separado do CORS do Fastify.

**`localhost` vs `127.0.0.1`:**
O CORS diferencia os dois. Se o frontend usa `localhost:5173` e o CORS libera `127.0.0.1:5173`, as requisições falham. Mantenha consistência.
