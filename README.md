# comanda-ia

SaaS de atendimento automatizado via WhatsApp para negócios de food service (galeterias, pizzarias, lanchonetes, hamburguerias, açaiterias e similares). Uma IA conversa com o cliente, entende o pedido, registra no sistema e encaminha pra cozinha — sem intervenção humana.

## Status do projeto

🚧 Em desenvolvimento — fase 1 (fundação) concluída.

Próxima fase: integrações (WhatsApp, IA, pagamento).

## Sobre

O projeto substitui o atendente humano que hoje recebe pedidos no WhatsApp e anota à mão. O estabelecimento economiza o custo do atendente e ganha relatórios, painel de cozinha em tempo real e integração com pagamento via PIX.

### Como funciona

1. Cliente manda mensagem no WhatsApp do estabelecimento
2. Evolution API recebe e dispara webhook pro backend
3. Backend consulta cardápio e envia conversa pro Claude
4. IA entende o pedido e registra no banco via function calling
5. Painel da cozinha atualiza em tempo real (Socket.IO)
6. Cliente recebe link de pagamento PIX e confirmação

## Arquitetura

O sistema é **multi-tenant**: uma única instância serve N estabelecimentos simultaneamente, com isolamento total de dados entre eles. Cada estabelecimento é um tenant identificado pelo `estabelecimentoId`, que é injetado automaticamente em toda query a partir do JWT do usuário autenticado.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22 + TypeScript + Fastify |
| Banco de dados | PostgreSQL + Prisma ORM |
| Autenticação | JWT (`@fastify/jwt`) + bcrypt |
| Validação | TypeBox + AJV |
| Tempo real | Socket.IO |
| Frontend | React + Vite + Tailwind CSS |
| IA | Claude API (com padrão Adapter para futura migração) |
| WhatsApp | Evolution API (self-hosted) |
| Pagamento | Mercado Pago (PIX) |
| Cloud | Azure (App Service, Static Web Apps, PostgreSQL, Container Instances) |
| Infra como código | Terraform |

## Documentação de aprendizado

Material didático sobre os conceitos e tecnologias usadas no projeto está na pasta [`/docs`](./docs).

- [00 — Setup do ambiente de desenvolvimento](./docs/00-setup-ambiente.md)
- [01 — JavaScript, TypeScript e Node.js](./docs/01-js-ts-nodejs.md)
- [02 — Frameworks e APIs (com Fastify)](./docs/02-frameworks-e-apis.md)
- [03 — Rotas, parâmetros e validação com schemas](./docs/03-rotas-schemas-fastify.md)
- [04 — PostgreSQL e Docker Compose](./docs/04-postgresql-docker.md)
- [05 — Prisma ORM e banco de dados](./docs/05-prisma-banco-dados.md)
- [06 — CRUD completo, relacionamentos e queries avançadas](./docs/06-crud-relacionamentos.md)
- [07 — Autenticação JWT e multi-tenant](./docs/07-autenticacao-multitenant.md)

## Endpoints disponíveis

### Públicos

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/signup` | Cria estabelecimento + usuário DONO |
| POST | `/auth/login` | Verifica credenciais, devolve JWT |
| GET | `/saude` | Health check |

### Autenticados (requerem header `Authorization: Bearer <token>`)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/meu-estabelecimento` | Dados do estabelecimento do usuário logado |
| GET | `/meu-estabelecimento/dashboard` | Dashboard agregado (cardápio, pedidos recentes, estatísticas) |
| GET | `/cardapio` | Lista itens do meu cardápio |
| GET | `/cardapio/:id` | Busca item específico |
| POST | `/cardapio` | Cria item novo |
| PATCH | `/cardapio/:id` | Atualiza item |
| DELETE | `/cardapio/:id` | Remove item |
| GET | `/pedidos` | Lista pedidos do meu estabelecimento |
| GET | `/pedidos/:id` | Busca pedido específico |
| POST | `/pedidos` | Cria pedido (uso manual; webhook vai cobrir o fluxo automático) |
| PATCH | `/pedidos/:id` | Atualiza status do pedido |
| DELETE | `/pedidos/:id` | Remove pedido |

Todas as rotas autenticadas filtram automaticamente pelo `estabelecimentoId` extraído do token. Isolamento entre tenants é garantido em nível de query.

## Como rodar localmente

### Pré-requisitos

- Node.js 22+
- npm
- Docker (para banco de dados e Evolution API)

### Instalação

```bash
git clone https://github.com/viniciusalvestech/comanda-ia.git
cd comanda-ia
npm install
```

### Variáveis de ambiente

Cria um arquivo `.env` na raiz do projeto com:

```env
DATABASE_URL=postgresql://comanda_ia:senha_local_dev@localhost:5432/comanda_ia_dev
JWT_SECRET=cola_aqui_uma_string_aleatoria_de_pelo_menos_64_caracteres
```

Para gerar uma `JWT_SECRET` forte:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

O `.env` está no `.gitignore` — nunca commitar segredos.

### Subir o banco

```bash
docker compose up -d
```

### Aplicar migrations

```bash
npx prisma migrate dev
```

### Executar em desenvolvimento

```bash
npm run dev
```

Servidor sobe em `http://localhost:3000` com hot reload via tsx.

## Licença

Projeto privado. Todos os direitos reservados.