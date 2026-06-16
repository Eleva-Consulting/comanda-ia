# Contexto do projeto comanda-ia

Vinícius aqui. Sou cloud engineer (Terraform/Azure) aprendendo dev SaaS construindo
um produto real chamado comanda-ia: SaaS multi-tenant pra restaurantes receberem
pedidos via link público enviado por WhatsApp. Funciona, está deployado, e quero
continuar evoluindo.

## Como prefiro trabalhar contigo

- Conceito antes da implementação, uma sub-etapa por vez.
- Quando for trocar código, me manda o **arquivo completo pronto pra copiar e colar**,
  nunca trechos parciais ou diffs pra integrar.
- Sou exigente com produto: questiono decisões de UX/arquitetura, não sou só executor.
- Quero entender o "porquê" das escolhas, não só o "como".
- Defere polimento visual até features estarem estáveis.

## Stack atual

**Backend:** Node 22 + TypeScript + Fastify 5 + Prisma 7 (generator `prisma-client`
+ `adapter-pg`) + @fastify/jwt + @fastify/cors + Socket.IO + bcrypt + TypeBox.
**Banco:** PostgreSQL 16.
**Frontend:** React 19 + Vite 7 + Tailwind v4 + React Router 7 + lucide-react +
socket.io-client. Tema dark zinc + accent orange, fonte Plus Jakarta Sans.
**Repo:** github.com/viniciusalvestech/comanda-ia
**Máquina:** MacBook Air M4 (acabei de migrar de uma Windows que queimou — disco salvo).

## Arquitetura

- Multi-tenant com `estabelecimentoId` em cada registro
- Auth JWT (payload tem `userId`, `estabelecimentoId`, `role: 'DONO' | 'OPERADOR'`)
- Estabelecimento tem `slug` único (`galeteria-do-vinicius`) usado nas rotas públicas
- Rotas autenticadas: `/auth/*`, `/pedidos`, `/cardapio`, `/meu-estabelecimento/*`
- Rotas públicas (sem token): `GET /publico/:slug`, `POST /publico/:slug/pedido`,
  `POST /webhook/simular`, `GET /saude`
- Socket.IO emite `pedido:novo` na sala `estabelecimentoId` quando pedido entra
- Pedido grava snapshot (`nomeItem`, `precoUnit`) pra preservar histórico se item mudar

## Estado em produção (deployado e funcionando)

- **Backend + Postgres:** Railway — `https://comanda-ia-production.up.railway.app`
- **Frontend:** Vercel — `https://comanda-ia-xxxxx.vercel.app`
- Variáveis em produção: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `NODE_ENV=production`
- Frontend usa `import.meta.env.VITE_API_URL` (centralizado em `src/lib/api.ts`)
- CORS dinâmico libera localhost (dev) + `FRONTEND_URL` (prod)
- Build com `tsc` + `vite build`. Servidor escuta em `0.0.0.0` na `process.env.PORT`.

## Fluxo do produto (end-to-end funcionando)
WhatsApp (mock via /webhook/simular)

↓ retorna mensagem template com link

cliente abre /c/:slug no celular (sem login)

↓ adiciona itens ao carrinho, preenche nome + telefone, envia

POST /publico/:slug/pedido cria pedido + emite Socket.IO

↓

cozinha (logada) recebe ao vivo, avança status: recebido → em_preparo → pronto → entregue

## Telas prontas

**Painel do Dono** (todas autenticadas, dentro de `<Layout>` compartilhado):
- `/dashboard` — KPIs (faturamento, total pedidos, em andamento, ticket médio) +
  lista de pedidos recentes
- `/cozinha` — grid de pedidos ativos em tempo real, botões pra avançar status
- `/cardapio` — CRUD com modal, toggle de disponibilidade, deletar com confirmação
- `/login` — JWT auth com email/senha

**Cliente final:**
- `/c/:slug` — página pública mobile-first com header, lista de itens (stepper +/-),
  barra fixa do carrinho, modal de checkout, tela de confirmação

## Credenciais de teste no banco

- `vinicius@teste.com` / `senhaforte123` — Galeteria do Vinícius
  (id fixo `5619f2a5-dbc2-4dfc-ab38-6c537eada941`, slug `galeteria-do-vinicius`)
- `carlos@teste.com` / `outrasenha123` — Pizzaria do Bairro (slug `pizzaria-do-bairro`)

Seed em `prisma/seed.ts`, configurado em `prisma.config.ts` (Prisma 7 novo formato),
rodado com `npx prisma db seed`.

## Decisões/lições importantes

- **Pivot do produto:** começamos com IA conversacional (Mock + padrão Adapter),
  pivotamos pra mensagem template + link público antes do deploy. IA conversacional
  saiu do escopo. Pasta `src/ia/` deletada.
- **Snapshots de preço:** `ItemPedido` grava `nomeItem`+`precoUnit` do momento, não
  referencia o `ItemCardapio` direto, pra preservar histórico.
- **`prisma migrate dev` exige reset** quando adiciona coluna obrigatória em tabela
  com dados. Em dev: TRUNCATE + migration. Em prod real: 3 migrations (opcional →
  popular → obrigatório).
- **Prisma 7:** não regenera client automaticamente em todos os casos — `npx prisma
  generate` manual quando o seed reclama de tipos antigos.
- **`tsc` strict vs `tsx watch`:** o tsx é permissivo em dev, o tsc do build pega
  imports não usados, tipos faltando etc. Encontramos vários só na hora do build.
- **CORS no @fastify/cors precisa de `methods: ['GET','POST','PATCH','PUT','DELETE',
  'OPTIONS']` explícito** — sem PATCH listado, falha.
- **Socket.IO tem CORS próprio**, separado do CORS do Fastify, em `src/socket.ts`.
- **Postinstall com `prisma generate`** é necessário pro Railway gerar o client a
  cada deploy.

## Próximos passos (eu vou te dizer qual quero seguir)

1. **Validar com 1 restaurante real** — mostrar o link pra um dono conhecido,
   observar onde ele trava. Antes de codar mais.
2. **Evolution API (WhatsApp real)** substituindo `/webhook/simular`.
3. **Mercado Pago (PIX)** no checkout do cardápio público.
4. **Signup pela UI** pra outros restaurantes se cadastrarem sozinhos
   (backend já tem `POST /auth/signup` com slug auto-gerado).
5. **Foto nos produtos** do cardápio.
6. **Notificação push** pro dono quando pedido entra.

## Como começar

Antes de propor código, confirma comigo qual desses caminhos quer seguir, ou se
eu quero abrir outro. Quando partir pra implementação, me passa um plano em
sub-etapas e vai uma de cada vez, esperando minha confirmação entre elas.