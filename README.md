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
WhatsApp (mock via /webhook/simular)
  ↓ retorna mensagem template com link público
Cliente abre /c/:slug no celular (sem login)
  ↓ monta carrinho, preenche nome + telefone, envia
POST /publico/:slug/pedido → cria pedido + emite Socket.IO
  ↓
Cozinha (logada) recebe ao vivo → avança status em tempo real
```

## Telas disponíveis

### Painel do estabelecimento (autenticado)

| Rota | Tela |
|---|---|
| `/login` | Auth com email + senha, devolve JWT |
| `/dashboard` | KPIs: faturamento, total pedidos, em andamento, ticket médio + pedidos recentes |
| `/cozinha` | Grid de pedidos ativos em tempo real com botões de status |
| `/cardapio` | CRUD completo: criar, editar, toggle disponibilidade, excluir |

### Área do cliente (pública)

| Rota | Tela |
|---|---|
| `/c/:slug` | Cardápio mobile-first: lista itens, carrinho fixo, modal de checkout, confirmação |

## Arquitetura

**Multi-tenant** com isolamento por `estabelecimentoId`: uma única instância serve N restaurantes, com dados completamente separados. O `estabelecimentoId` é extraído do JWT em cada requisição e injetado em toda query automaticamente.

**Tempo real** via Socket.IO: cada estabelecimento tem uma sala própria. Quando um pedido entra, o evento `pedido:novo` é emitido apenas para a sala do tenant correspondente.

**Snapshots de preço**: `ItemPedido` grava `nomeItem` e `precoUnit` no momento do pedido, sem referenciar o `ItemCardapio` diretamente. Isso preserva o histórico correto mesmo se o item mudar de preço ou for deletado depois.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22 + TypeScript + Fastify 5 |
| ORM | Prisma 7 (generator `prisma-client` + `adapter-pg`) |
| Banco | PostgreSQL 16 |
| Autenticação | JWT (`@fastify/jwt`) + bcrypt |
| Validação | TypeBox + AJV |
| Tempo real | Socket.IO |
| Frontend | React 19 + Vite 7 + Tailwind v4 + React Router 7 |
| UI | lucide-react, tema dark zinc + accent orange, fonte Plus Jakarta Sans |
| Deploy backend | Railway |
| Deploy frontend | Vercel |

## Modelo de dados

| Tabela | Descrição |
|---|---|
| `estabelecimentos` | Tenants do sistema |
| `usuarios` | Donos/operadores, ligados a um estabelecimento |
| `itens_cardapio` | Itens do cardápio de cada tenant |
| `pedidos` | Pedidos recebidos |
| `itens_pedido` | Itens de cada pedido (snapshot de nome + preço) |

## Endpoints

### Públicos

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/signup` | Cria estabelecimento + usuário DONO |
| POST | `/auth/login` | Autenticação, retorna JWT |
| GET | `/publico/:slug` | Cardápio público do estabelecimento |
| POST | `/publico/:slug/pedido` | Cria pedido (cliente final) |
| POST | `/webhook/simular` | Simula mensagem WhatsApp (desenvolvimento) |
| GET | `/saude` | Health check |

### Autenticados (`Authorization: Bearer <token>`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/meu-estabelecimento` | Dados do estabelecimento logado |
| GET | `/meu-estabelecimento/dashboard` | KPIs + pedidos recentes |
| GET/POST | `/cardapio` | Listar / criar itens |
| GET/PATCH/DELETE | `/cardapio/:id` | Buscar / atualizar / remover item |
| GET/POST | `/pedidos` | Listar / criar pedidos |
| GET/PATCH/DELETE | `/pedidos/:id` | Buscar / atualizar / remover pedido |

### Tempo real (Socket.IO)

Conexão autenticada via JWT no handshake (`auth: { token }`). Ao conectar, cliente entra na sala do seu `estabelecimentoId`.

| Evento | Dispara quando | Payload |
|---|---|---|
| `pedido:novo` | Pedido criado | Pedido completo com itens |
| `pedido:atualizado` | Status alterado | Pedido atualizado |

## Como rodar localmente

### Pré-requisitos

- Node.js 22+
- Docker (PostgreSQL via Docker Compose)

### Instalação

```bash
git clone https://github.com/viniciusalvestech/comanda-ia.git
cd comanda-ia
npm install
```

### Variáveis de ambiente

Cria `.env` na raiz:

```env
DATABASE_URL=postgresql://comanda_ia:senha_local_dev@localhost:5432/comanda_ia_dev
JWT_SECRET=string_aleatoria_minimo_64_chars
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Para gerar JWT_SECRET forte:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Subir o banco

```bash
docker compose up -d
npx prisma migrate dev
npx prisma db seed
```

### Rodar o backend

```bash
npm run dev
# http://localhost:3000
```

### Rodar o frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

### Credenciais de teste

| Email | Senha | Estabelecimento |
|---|---|---|
| `vinicius@teste.com` | `senhaforte123` | Galeteria do Vinícius |
| `carlos@teste.com` | `outrasenha123` | Pizzaria do Bairro |

## Variáveis de ambiente em produção

| Variável | Onde |
|---|---|
| `DATABASE_URL` | Railway |
| `JWT_SECRET` | Railway |
| `FRONTEND_URL` | Railway (libera CORS) |
| `NODE_ENV=production` | Railway |
| `VITE_API_URL` | Vercel (aponta pro backend Railway) |

## Decisões técnicas relevantes

**CORS duplo:** `@fastify/cors` e Socket.IO têm CORS separado. Ambos precisam ser configurados. Métodos precisam incluir `PATCH` explicitamente ou requisições de update falham.

**Prisma 7:** não regenera o client automaticamente em todos os cenários. Após mudanças no schema: `npx prisma generate` manual. O `postinstall` com `prisma generate` é obrigatório no Railway para gerar o client a cada deploy.

**Vercel SPA routing:** `vercel.json` com rewrite de `(.*)` para `/index.html` é obrigatório para o React Router funcionar com reload de página.

**Viewport mobile:** usar `min-h-dvh` no container raiz em vez de `min-h-screen` para cobrir corretamente o viewport dinâmico do Safari iOS (desconta a barra de endereço).

## Documentação de aprendizado

Material didático sobre os conceitos usados no projeto:

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

## Próximos passos

- [ ] Evolution API — WhatsApp real substituindo `/webhook/simular`
- [ ] Mercado Pago — PIX no checkout público
- [ ] Signup pela UI — outros restaurantes se cadastrarem sozinhos
- [ ] Fotos nos produtos do cardápio
- [ ] Notificação push para o dono quando pedido entra
- [ ] Super Admin — painel da plataforma

## Licença

Projeto privado. Todos os direitos reservados.
