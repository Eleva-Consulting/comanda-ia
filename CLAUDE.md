# comanda-ia — Contexto para Claude Code

## O que é esse projeto

SaaS multi-tenant para food service. Restaurantes recebem pedidos via link público
enviado por WhatsApp. O cliente abre no celular, monta o carrinho e envia. O pedido
aparece na cozinha em tempo real via Socket.IO.

## Stack

**Backend:** Node.js 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL
**Frontend:** React 19 + Vite 7 + Tailwind v4 + React Router 7 + lucide-react
**Deploy:** Railway (backend + postgres) + Vercel (frontend)
**Repo:** github.com/viniciusalvestech/comanda-ia

## Estrutura do projeto

```
comanda-ia/
├── src/                    # Backend
│   ├── routes/             # Fastify routes
│   │   ├── auth.ts         # signup + login
│   │   ├── admin.ts        # rotas exclusivas SUPER_ADMIN
│   │   ├── cardapio.ts     # CRUD cardápio (autenticado)
│   │   ├── pedidos.ts      # CRUD pedidos (autenticado)
│   │   ├── publico.ts      # cardápio + pedido público (sem auth)
│   │   └── estabelecimentos.ts  # dashboard + meu-estabelecimento
│   ├── plugins/
│   │   └── auth.ts         # middlewares: autenticar + apenasAdmin
│   ├── database.ts         # Prisma client
│   ├── socket.ts           # Socket.IO
│   └── server.ts           # buildServer()
├── prisma/
│   ├── schema.prisma       # modelos e enums
│   ├── seed.ts             # dados de teste
│   └── migrations/         # histórico de migrations
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Cadastro.tsx
│       │   ├── AguardandoAprovacao.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Cozinha.tsx
│       │   ├── Cardapio.tsx
│       │   ├── CardapioPublico.tsx
│       │   └── admin/
│       │       ├── AdminDashboard.tsx
│       │       └── AdminEstabelecimentos.tsx
│       ├── components/
│       │   ├── Layout.tsx          # painel do restaurante
│       │   ├── LayoutAdmin.tsx     # painel super admin
│       │   ├── RotaProtegida.tsx   # guard: qualquer autenticado
│       │   └── RotaAdmin.tsx       # guard: apenas SUPER_ADMIN
│       └── lib/
│           ├── api.ts      # API_URL centralizado
│           └── auth.ts     # decodifica JWT no frontend
└── CLAUDE.md               # este arquivo
```

## Arquitetura multi-tenant

- Cada estabelecimento é um tenant com `id` único
- `estabelecimentoId` está em todo registro do banco
- JWT carrega `{ userId, estabelecimentoId, role }` — injetado em toda query
- SUPER_ADMIN tem `estabelecimentoId: null` — não pertence a nenhum tenant

## Roles e acesso

```
SUPER_ADMIN  → /admin/* — gerencia a plataforma inteira
DONO         → /dashboard, /cozinha, /cardapio — gerencia seu restaurante
OPERADOR     → (futuro) permissões restritas
```

## StatusEstabelecimento

```
pendente  → recém cadastrado, aguarda aprovação do Super Admin
ativo     → operando normalmente
suspenso  → bloqueado
```

Fluxo: signup → pendente → Super Admin aprova → ativo

## Credenciais de teste

```
Super Admin:  admin@comanda-ia.dev   / superadmin123
Galeteria:    vinicius@teste.com     / senhaforte123  (ativo)
Pizzaria:     carlos@teste.com       / outrasenha123  (ativo)
Hamburgueria: joao@teste.com         / teste123456    (pendente)
```

Galeteria id fixo: `5619f2a5-dbc2-4dfc-ab38-6c537eada941`

## Como rodar localmente

```bash
# Backend
docker compose up -d
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Padrões que usamos

- **Arquivos completos** — nunca entregar trechos parciais, sempre o arquivo inteiro
- **TypeScript strict** — sem `any` implícito, sem `@ts-ignore`
- **Mobile first** — Tailwind sem prefixo = mobile, `sm:` = desktop
- **min-h-dvh** em vez de `min-h-screen` para viewport mobile correto
- **Non-null assertion** (`!`) em `estabelecimentoId` nas rotas de tenant — seguro pois SUPER_ADMIN nunca chega nessas rotas
- **Commits descritivos** — `feat:`, `fix:`, `docs:` no padrão conventional commits

## Próximas features planejadas

1. Cadastro de estabelecimento pelo próprio Super Admin no painel
2. Reset de senha por email
3. Evolution API — WhatsApp real
4. Mercado Pago — PIX no checkout
5. Fotos nos produtos do cardápio
6. Categorias no cardápio
7. Role OPERADOR com permissões configuráveis
8. Notificação push para o dono

## Variáveis de ambiente

**Backend (.env):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Frontend (frontend/.env.local):**
```
VITE_API_URL=http://localhost:3000
```

**Produção:**
- Backend: Railway (DATABASE_URL gerado automaticamente pelo serviço Postgres do Railway)
- Frontend: Vercel (VITE_API_URL aponta pro Railway)
- Após cada migration nova: `npx prisma migrate deploy` no console do Railway
