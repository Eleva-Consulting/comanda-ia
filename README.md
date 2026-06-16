# comanda-ia

SaaS multi-tenant para food service (galeterias, pizzarias, lanchonetes, hamburguerias e similares). Restaurantes recebem pedidos via link público enviado por WhatsApp — o cliente abre no celular, monta o carrinho e envia. O pedido aparece na cozinha em tempo real, sem intervenção humana.

## Status do projeto

🟢 **Em produção** — backend + frontend deployados e funcionando end-to-end.

| Camada | Ambiente | URL |
|---|---|---|
| Backend | Railway | `https://comanda-ia-production.up.railway.app` |
| Frontend | Vercel | `https://comanda-ia.vercel.app` |

## Como funciona (fluxo end-to-end)

```
Restaurante se cadastra em /cadastro
  ↓ status: pendente
Super Admin aprova no painel /admin
  ↓ status: ativo
Dono configura cardápio em /cardapio
  ↓
WhatsApp (mock via /webhook/simular) envia link público
  ↓
Cliente abre /c/:slug no celular, monta carrinho, envia pedido
  ↓ POST /publico/:slug/pedido → Socket.IO
Cozinha em /cozinha recebe ao vivo → avança status em tempo real
```

## Telas disponíveis

### Painel do estabelecimento (autenticado — DONO / OPERADOR)

| Rota | Tela |
|---|---|
| `/login` | Auth com email + senha |
| `/cadastro` | Signup do estabelecimento (cria com status pendente) |
| `/aguardando-aprovacao` | Tela pós-signup aguardando aprovação |
| `/dashboard` | KPIs + pedidos recentes (menu: "Home") |
| `/cozinha` | Grid de pedidos ativos em tempo real |
| `/cardapio` | CRUD completo de itens |

### Painel da plataforma (SUPER_ADMIN)

| Rota | Tela |
|---|---|
| `/admin` | Métricas globais: ativos, pendentes, suspensos, faturamento |
| `/admin/estabelecimentos` | Lista todos os tenants com aprovação/suspensão |

### Área do cliente (pública)

| Rota | Tela |
|---|---|
| `/c/:slug` | Cardápio mobile-first com carrinho e checkout |

## Arquitetura

**Multi-tenant** com isolamento por `estabelecimentoId`: uma única instância serve N restaurantes com dados completamente separados. O `estabelecimentoId` é extraído do JWT em cada requisição e injetado em toda query automaticamente.

**Três roles:** `SUPER_ADMIN` (plataforma, sem tenant), `DONO` (gerencia seu restaurante), `OPERADOR` (futuro).

**Status do estabelecimento:** `pendente → ativo → suspenso`. Novos cadastros entram como `pendente` e precisam de aprovação do Super Admin para operar.

**Tempo real** via Socket.IO: cada estabelecimento tem uma sala própria. Pedidos emitem `pedido:novo` apenas para o tenant correspondente.

**Snapshots de preço:** `ItemPedido` grava `nomeItem` e `precoUnit` no momento do pedido, preservando histórico mesmo se o item mudar depois.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22 + TypeScript + Fastify 5 |
| ORM | Prisma 7 |
| Banco | PostgreSQL 16 |
| Autenticação | JWT + bcrypt |
| Validação | TypeBox + AJV |
| Tempo real | Socket.IO |
| Frontend | React 19 + Vite 7 + Tailwind v4 + React Router 7 |
| UI | lucide-react, dark zinc + accent orange, Plus Jakarta Sans |
| Deploy backend | Railway |
| Deploy frontend | Vercel |

## Modelo de dados

| Tabela | Descrição |
|---|---|
| `estabelecimentos` | Tenants — `status: pendente\|ativo\|suspenso` |
| `usuarios` | Donos/operadores — `estabelecimentoId` opcional (null para SUPER_ADMIN) |
| `itens_cardapio` | Itens do cardápio de cada tenant |
| `pedidos` | Pedidos recebidos |
| `itens_pedido` | Itens de cada pedido (snapshot de nome + preço) |

## Endpoints

### Públicos

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/signup` | Cria estabelecimento com `status: pendente` |
| POST | `/auth/login` | Autenticação — bloqueia pendentes/suspensos com mensagem clara |
| GET | `/publico/:slug` | Cardápio público (só estabelecimentos `ativo`) |
| POST | `/publico/:slug/pedido` | Cria pedido (cliente final) |
| POST | `/webhook/simular` | Simula mensagem WhatsApp (dev) |
| GET | `/saude` | Health check |

### Autenticados — tenant (`Authorization: Bearer <token>`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/meu-estabelecimento` | Dados do tenant logado |
| GET | `/meu-estabelecimento/dashboard` | KPIs + pedidos recentes |
| GET/POST | `/cardapio` | Listar / criar itens |
| GET/PATCH/DELETE | `/cardapio/:id` | Buscar / atualizar / remover item |
| GET/POST | `/pedidos` | Listar / criar pedidos |
| GET/PATCH/DELETE | `/pedidos/:id` | Buscar / atualizar status / remover pedido |

### Super Admin (`role: SUPER_ADMIN` obrigatório)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin/estabelecimentos` | Lista todos os tenants com contagens |
| PATCH | `/admin/estabelecimentos/:id/status` | Muda status: `pendente\|ativo\|suspenso` |
| GET | `/admin/metricas` | KPIs globais da plataforma |

### Tempo real (Socket.IO)

| Evento | Dispara quando | Payload |
|---|---|---|
| `pedido:novo` | Pedido criado | Pedido completo com itens |
| `pedido:atualizado` | Status alterado | Pedido atualizado |

## Como rodar localmente

### Pré-requisitos

- Node.js 22+
- Docker (PostgreSQL)

### Instalação

```bash
git clone https://github.com/viniciusalvestech/comanda-ia.git
cd comanda-ia
npm install
```

### Variáveis de ambiente

```env
DATABASE_URL=postgresql://comanda_ia:senha_local_dev@localhost:5432/comanda_ia_dev
JWT_SECRET=string_aleatoria_minimo_64_chars
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### Banco e seed

```bash
docker compose up -d
npx prisma migrate dev
npx prisma db seed
```

### Rodar

```bash
npm run dev          # backend http://localhost:3000
cd frontend && npm run dev  # frontend http://localhost:5173
```

### Credenciais de teste

| Email | Senha | Role | Status |
|---|---|---|---|
| `admin@comanda-ia.dev` | `superadmin123` | SUPER_ADMIN | — |
| `vinicius@teste.com` | `senhaforte123` | DONO | ativo |
| `carlos@teste.com` | `outrasenha123` | DONO | ativo |
| `joao@teste.com` | `teste123456` | DONO | pendente |

## Variáveis em produção

| Variável | Onde |
|---|---|
| `DATABASE_URL` | Railway |
| `JWT_SECRET` | Railway |
| `FRONTEND_URL` | Railway |
| `NODE_ENV=production` | Railway |
| `VITE_API_URL` | Vercel |

## Decisões técnicas relevantes

**StatusEstabelecimento enum:** substituiu `ativo: Boolean` para suportar três estados (pendente/ativo/suspenso). Migration preserva dados existentes convertendo `true→ativo` e `false→suspenso`.

**SUPER_ADMIN sem tenant:** `estabelecimentoId` é `String?` (opcional) no banco e `string | null` no JWT. Rotas de tenant usam `estabelecimentoId!` (non-null assertion) — seguro porque SUPER_ADMIN nunca chega nessas rotas.

**CORS duplo:** `@fastify/cors` e Socket.IO têm CORS separado. Ambos precisam ser configurados. `methods` precisa incluir `PATCH` explicitamente.

**Prisma 7 postinstall:** `prisma generate` no `postinstall` é obrigatório no Railway.

**Vercel SPA routing:** `vercel.json` com rewrite para `index.html`.

**Viewport mobile:** `min-h-dvh` em vez de `min-h-screen`. Background no `body` e `#root` via CSS global.

## Documentação de aprendizado

- [00 — Setup do ambiente](./docs/00-setup-ambiente.md)
- [01 — JavaScript, TypeScript e Node.js](./docs/01-js-ts-nodejs.md)
- [02 — Frameworks e APIs com Fastify](./docs/02-frameworks-e-apis.md)
- [03 — Rotas, parâmetros e validação](./docs/03-rotas-schemas-fastify.md)
- [04 — PostgreSQL e Docker](./docs/04-postgresql-docker.md)
- [05 — Prisma ORM](./docs/05-prisma-banco-dados.md)
- [06 — CRUD e relacionamentos](./docs/06-crud-relacionamentos.md)
- [07 — Autenticação JWT e multi-tenant](./docs/07-autenticacao-multitenant.md)
- [08 — IA: padrão Adapter e tool use](./docs/08-ia-adapter-tooluse.md)
- [09 — WebSockets e tempo real](./docs/09-websockets-tempo-real.md)
- [10 — Deploy: Railway + Vercel](./docs/10-deploy-railway-vercel.md)
- [11 — Responsividade e UX mobile](./docs/11-responsividade-mobile.md)
- [12 — Super Admin e fluxo de aprovação](./docs/12-super-admin-signup.md)

## Próximos passos

- [ ] Evolution API — WhatsApp real
- [ ] Mercado Pago — PIX no checkout
- [ ] Fotos nos produtos do cardápio
- [ ] Notificação push para o dono quando pedido entra
- [ ] Role OPERADOR com permissões configuráveis
- [ ] Categorias no cardápio

## Licença

Projeto privado. Todos os direitos reservados.
