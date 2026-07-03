# comanda-ia — Contexto para Claude Code

## O que é esse projeto

SaaS multi-tenant para food service. Restaurantes recebem pedidos via link público
enviado por WhatsApp. O cliente abre no celular, monta o carrinho e envia. O pedido
aparece na cozinha em tempo real via Socket.IO.

## Stack

**Backend:** Node.js 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL
**Frontend:** React 19 + Vite 7 + Tailwind v4 + React Router 7 + lucide-react + recharts
**Deploy:** Railway (backend + postgres) + Vercel (frontend)
**Repo:** github.com/viniciusalvestech/comanda-ia

## Estrutura do projeto

```
comanda-ia/
├── src/                    # Backend
│   ├── routes/             # Fastify routes
│   │   ├── auth.ts         # signup + login + redefinir-senha
│   │   ├── admin.ts        # rotas exclusivas SUPER_ADMIN
│   │   ├── cardapio.ts     # CRUD cardápio + categorias + fotos (R2)
│   │   ├── pedidos.ts      # CRUD pedidos (autenticado)
│   │   ├── publico.ts      # cardápio + pedido + avaliar (sem auth)
│   │   ├── estabelecimentos.ts  # dashboard + meu-estabelecimento
│   │   ├── operadores.ts   # CRUD operadores + permissões
│   │   └── push.ts         # Web Push: subscribe/unsubscribe/vapid-key
│   ├── plugins/
│   │   └── auth.ts         # middlewares: autenticar + apenasAdmin
│   ├── mailer.ts           # Resend HTTP API (Railway bloqueia SMTP)
│   ├── push.ts             # web-push / VAPID helper
│   ├── evolution.ts        # Evolution API WhatsApp helper
│   ├── r2.ts               # Cloudflare R2 upload/delete
│   ├── database.ts         # Prisma client
│   ├── socket.ts           # Socket.IO (transporte WebSocket apenas — Railway bloqueia XHR polling)
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
│       │   ├── Dashboard.tsx       # KPIs + BarChart vendas 30 dias (recharts)
│       │   ├── Cozinha.tsx
│       │   ├── Cardapio.tsx        # CRUD itens + categorias + fotos + estoque
│       │   ├── CardapioPublico.tsx # cardápio público + checkout + avaliação
│       │   ├── Configuracoes.tsx   # dados, chave PIX, taxa entrega, Evolution API
│       │   ├── Operadores.tsx      # CRUD operadores + permissões por checkbox
│       │   ├── Historico.tsx
│       │   ├── DefinirSenha.tsx    # define senha via link do email (primeiro acesso)
│       │   ├── EsqueciSenha.tsx
│       │   ├── RedefinirSenha.tsx
│       │   └── admin/
│       │       ├── AdminDashboard.tsx
│       │       └── AdminEstabelecimentos.tsx
│       ├── components/
│       │   ├── Layout.tsx          # painel do restaurante (inclui botão push bell)
│       │   ├── LayoutAdmin.tsx     # painel super admin
│       │   ├── RotaProtegida.tsx   # guard: qualquer autenticado
│       │   ├── RotaAdmin.tsx       # guard: apenas SUPER_ADMIN
│       │   └── RotaPermissao.tsx   # guard: DONO passa sempre, OPERADOR verifica permissão
│       ├── hooks/
│       │   ├── useSocket.ts        # Socket.IO (WebSocket only)
│       │   └── usePush.ts          # Web Push: ativar/desativar notificações
│       └── lib/
│           ├── api.ts              # API_URL centralizado
│           ├── auth.ts             # decodifica JWT no frontend
│           └── permissoes.ts       # lista de permissões + helpers getPermissoes/temPermissao
└── CLAUDE.md               # este arquivo
```

## Arquitetura multi-tenant

- Cada estabelecimento é um tenant com `id` único
- `estabelecimentoId` está em todo registro do banco
- JWT carrega `{ userId, estabelecimentoId, role, permissoes }` — injetado em toda query
- SUPER_ADMIN tem `estabelecimentoId: null` — não pertence a nenhum tenant

## Roles e acesso

```
SUPER_ADMIN  → /admin/* — gerencia a plataforma inteira
DONO         → /dashboard, /cozinha, /cardapio, /historico, /configuracoes, /operadores
OPERADOR     → acesso restrito por permissões configuráveis no painel
```

Permissões disponíveis para OPERADOR: `cozinha`, `cardapio`, `historico`, `pedido_manual`, `configuracoes`

## StatusEstabelecimento

```
pendente  → recém cadastrado, aguarda aprovação do Super Admin
ativo     → operando normalmente
suspenso  → bloqueado
```

Fluxo novo estabelecimento via Admin: Super Admin cria → email com link para DONO definir senha → DONO acessa e cria senha → status ativo

## Features implementadas

- **Autenticação completa** — signup/login, reset de senha por email, definir senha (primeiro acesso via link)
- **Cardápio** — CRUD itens + categorias + fotos (Cloudflare R2) + controle de estoque
- **Pedidos** — cardápio público, checkout, taxa de entrega configurável, avaliação (1-5 estrelas) após confirmação
- **Cozinha** — lista de pedidos em tempo real via Socket.IO, atualização de status
- **Notificações** — toast em tela + beep ao receber pedido; Web Push (bell no header); email via Resend; WhatsApp via Evolution API (opcional)
- **Analytics** — KPIs no dashboard + gráfico de barras (recharts) com faturamento dos últimos 30 dias
- **Operadores** — CRUD com permissões granulares configuráveis por checkbox; guards de rota no frontend
- **Super Admin** — painel para aprovar/suspender estabelecimentos, criar novos com email de convite

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
- **Fire-and-forget** para operações secundárias (email, push, WhatsApp) — nunca bloqueiam o response HTTP
- **Socket.IO transports: ['websocket']** — Railway bloqueia XHR long-polling; nunca usar polling
- **Resend** para emails — Railway bloqueia SMTP (portas 465 e 587); nunca usar nodemailer com SMTP

## Variáveis de ambiente

**Backend (.env / Railway):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
FRONTEND_URL=https://comanda-ia.vercel.app,https://www.comanda-ia.com
NODE_ENV=production
RESEND_API_KEY=re_...              # emails (Resend)
VAPID_PUBLIC_KEY=...               # Web Push
VAPID_PRIVATE_KEY=...              # Web Push
R2_ENDPOINT=...                    # Cloudflare R2 (fotos)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=comanda-ia-fotos
R2_PUBLIC_URL=...
```

**Frontend (frontend/.env.local):**
```
VITE_API_URL=http://localhost:3000
```

**Produção:**
- Backend: Railway (DATABASE_URL gerado automaticamente pelo serviço Postgres do Railway)
- Frontend: Vercel (VITE_API_URL aponta pro Railway)
- Após cada migration nova: `npx prisma migrate deploy` no console do Railway
- Deploy manual Railway: `railway up --detach` (auto-deploy às vezes falha)

## Log de mudanças

> Registrar aqui um resumo de cada sessão de trabalho (mais recente no topo), com base nos commits feitos (`git log`) e no que ainda estiver em andamento sem commit. Objetivo: consultar rapidamente "o que foi feito" sem precisar vasculhar o histórico do git.

### 2026-07-03
- **Pedido de balcão sem status pro cliente + impressão automática configurável** — `Pedido.origem` (`balcao`/`publico`) distingue pedido manual do painel vs via link público. Balcão deixa de mandar WhatsApp de status (delivery e retirada via link continuam mandando normal). Botão liga/desliga na Cozinha controla se pedido de balcão imprime sozinho (delivery/retirada via link sempre imprimem).
- **Reabrir pedido concluído/cancelado** — DONO define uma senha em Configurações; qualquer operador com permissão de Cozinha pode reabrir um pedido `entregue`/`cancelado` digitando essa senha (entregue volta pra "em preparo", cancelado volta pra "recebido"). Botão fica no Histórico.
- **Cardápio público em grade responsiva** — 2 colunas no celular, 3-4 no desktop, ao invés de lista vertical.
- **Busca por nome** no cardápio público e nos modais de pedido manual/adicionar item na Cozinha.
- **Nome do cliente opcional** no pedido manual (balcão) — usa "Cliente" como padrão quando em branco.
- **Fonte maior na comanda impressa** — base 12px → 15px, título e total 14px → 18px.

### 2026-07-03 (em andamento, não commitado)
- **Evolution API self-hosted no Fly.io** (`evolution-fly/fly.toml`) — app `evolution-comanda`, região `gru`, imagem `atendai/evolution-api`, Postgres habilitado, `min_machines_running = 1`.
- **Suporte a proxy em `src/evolution.ts`** — `proxyFromEnv()` lê `EVOLUTION_PROXY_HOST/PORT/PROTOCOL/USERNAME/PASSWORD` do ambiente e injeta `proxy` no payload de `criarInstancia()` (`POST /instance/create`). Objetivo: evitar bloqueio do WhatsApp quando várias instâncias saem do mesmo IP do Fly.io.

### 2026-07-02
- **Impressão automática da comanda + email fictício facilitado no operador** (`edf6997`) — comanda imprime sozinha ao chegar pedido novo na Cozinha; cadastro de operador ganha botão pra gerar email fictício automaticamente.
- **Email fictício do operador usa nome do estabelecimento como domínio** (`2822dbe`, `be7d9f6`) — formato `primeiro.ultimo@slug-do-estabelecimento.com`, sem sufixo aleatório nem travessão.
- **Telefone do cliente vira opcional no pedido** (`dc7dacd`) — no pedido manual e no checkout público; notificações WhatsApp (status, PIX) são puladas quando não há telefone.
- **Editar dados do operador e redefinir senha** (`5b79576`) — DONO corrige nome/email do operador e redefine senha direto, sem depender do fluxo de email.
- **Comanda impressa em negrito por padrão** (`d436580`) — melhora legibilidade em impressora térmica.
- **Aplicar permissões granulares do operador no backend** (`6693137`) — antes só existiam dois níveis de acesso (autenticado ou DONO); adiciona middleware `temPermissao()` aplicado por rota (cardápio, pedido manual, configurações, WhatsApp). Pausar/retomar pedido vira endpoint próprio pra não exigir permissão "configuracoes".
- **Editar itens de um pedido já criado** (`c3e4141`) — adicionar/ajustar quantidade/remover item direto no card da Cozinha, sem cancelar o pedido inteiro.
- **Mostrar links de navegação conforme permissão do operador** (`9f92b54`) — menu (Cardápio, Histórico, Configurações) agora aparece quando o operador tem a permissão, mesmo sem ser DONO.
- **Taxa de entrega por bairro + endereço no pedido** (`079f9bc`) — bairros com taxa própria cadastrados em Configurações (opcional, em branco = grátis); checkout e pedido manual pedem bairro/endereço; aparece na comanda, histórico e dashboard.
- **Troco no pagamento em dinheiro, status por tipo de entrega, resumo do pedido** (`44437aa`) — indicar troco em pagamento dinheiro; retirada pula "saiu para entrega" (vai direto pra "retirado"); tela de confirmação com resumo completo passa a valer pra qualquer forma de pagamento (antes só PIX) e o resumo é enviado por WhatsApp em qualquer pedido.

## Próximas features planejadas

1. **Mercado Pago** — PIX real no checkout (substituir exibição de chave manual)
2. **Painel de avaliações** — ver média de estrelas e comentários no Dashboard
3. **Relatórios avançados** — exportar histórico em CSV, filtro por período
4. **QR Code** — gerar QR no link do cardápio para imprimir e colocar na mesa
5. **Multi-unidades** — um DONO com vários estabelecimentos sob a mesma conta
6. **Comanda por mesa** — associar pedido a número de mesa
