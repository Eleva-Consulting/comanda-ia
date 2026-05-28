# comanda-ia

SaaS de atendimento automatizado via WhatsApp para negócios de food service (galeterias, pizzarias, lanchonetes, hamburguerias, açaiterias e similares). Uma IA conversa com o cliente, entende o pedido, registra no sistema e encaminha pra cozinha em tempo real — sem intervenção humana.

## Status do projeto

🚧 Em desenvolvimento — fase 2 (integrações) em andamento.

Fundação concluída (auth multi-tenant, CRUD isolado). Cérebro de IA com estrutura completa rodando em modo mock (Claude real plugável em uma linha). Painel da cozinha em tempo real funcionando.

## Sobre

O projeto substitui o atendente humano que hoje recebe pedidos no WhatsApp e anota à mão. O estabelecimento economiza o custo do atendente e ganha relatórios, painel de cozinha em tempo real e integração com pagamento via PIX.

### Como funciona

1. Cliente manda mensagem no WhatsApp do estabelecimento
2. Evolution API recebe e dispara webhook pro backend
3. Backend consulta cardápio e envia a conversa pro cérebro de IA
4. IA entende o pedido e registra no banco (tool use)
5. Painel da cozinha atualiza em tempo real (Socket.IO)
6. Cliente recebe link de pagamento PIX e confirmação

## Arquitetura

O sistema é **multi-tenant**: uma única instância serve N estabelecimentos simultaneamente, com isolamento total de dados entre eles. Cada estabelecimento é um tenant identificado pelo `estabelecimentoId`, injetado automaticamente em toda query a partir do JWT do usuário autenticado.

O isolamento se estende ao tempo real: cada estabelecimento tem uma "sala" no Socket.IO, e eventos de pedido são emitidos apenas para a sala correspondente.

A integração com a IA usa o **padrão Adapter**: o sistema fala com uma interface (`ProvedorIA`), nunca com a implementação direta. Isso permite trocar o cérebro (mock → Claude → outro modelo) sem alterar o resto do código.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22 + TypeScript + Fastify |
| Banco de dados | PostgreSQL + Prisma ORM |
| Autenticação | JWT (`@fastify/jwt`) + bcrypt |
| Validação | TypeBox + AJV |
| Tempo real | Socket.IO |
| IA | Claude API via padrão Adapter (mock em desenvolvimento) |
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
- [08 — IA: padrão Adapter, conversação e tool use](./docs/08-ia-adapter-tooluse.md)
- [09 — WebSockets e tempo real com Socket.IO](./docs/09-websockets-tempo-real.md)

## Endpoints disponíveis

### Públicos

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/signup` | Cria estabelecimento + usuário DONO |
| POST | `/auth/login` | Verifica credenciais, devolve JWT |
| POST | `/webhook/simular` | Simula recebimento de mensagem de cliente (testa o fluxo de IA) |
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
| POST | `/pedidos` | Cria pedido (uso manual) |
| PATCH | `/pedidos/:id` | Atualiza status do pedido |
| DELETE | `/pedidos/:id` | Remove pedido |

Todas as rotas autenticadas filtram automaticamente pelo `estabelecimentoId` extraído do token. Isolamento entre tenants garantido em nível de query.

### Tempo real (Socket.IO)

A conexão WebSocket é autenticada via JWT no handshake (`auth: { token }`). Ao conectar, o cliente entra na sala do seu estabelecimento e passa a receber eventos:

| Evento | Quando dispara | Payload |
|---|---|---|
| `pedido:novo` | Um pedido é criado para o estabelecimento | O pedido com seus itens |

## Modelo de dados

| Tabela | Descrição |
|---|---|
| `estabelecimentos` | Os tenants do sistema |
| `usuarios` | Donos/operadores (login), ligados a um estabelecimento |
| `itens_cardapio` | Itens do cardápio de cada estabelecimento |
| `pedidos` | Pedidos recebidos |
| `itens_pedido` | Itens de cada pedido (snapshot de nome e preço) |
| `conversas` | Conversas com clientes (por telefone) |
| `mensagens` | Mensagens trocadas em cada conversa |

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
# Necessária apenas quando o ClaudeProvedorIA estiver ativo (atualmente em mock):
# ANTHROPIC_API_KEY=sk-ant-...
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

## Ferramentas de teste

- **`/webhook/simular`**: permite testar o fluxo de conversa da IA via curl, sem WhatsApp real.
- **`painel-teste.html`**: página simples que conecta no Socket.IO e exibe pedidos chegando em tempo real (cole um token JWT e conecte).

## Licença

Projeto privado. Todos os direitos reservados.