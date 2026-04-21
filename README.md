# comanda-ia

SaaS de atendimento automatizado via WhatsApp para galeterias e lanchonetes. Uma IA conversa com o cliente, entende o pedido, registra no sistema e encaminha pra cozinha — sem intervenção humana.

## Status do projeto

🚧 Em desenvolvimento — fase 1 (fundação).

## Sobre

O projeto substitui o atendente humano que hoje recebe pedidos no WhatsApp e anota à mão. A galeteria economiza o custo do atendente e ganha relatórios, painel de cozinha em tempo real e integração com pagamento via PIX.

### Como funciona

1. Cliente manda mensagem no WhatsApp da galeteria
2. Evolution API recebe e dispara webhook pro backend
3. Backend consulta cardápio e envia conversa pro Claude
4. IA entende o pedido e registra no banco via function calling
5. Painel da cozinha atualiza em tempo real (Socket.IO)
6. Cliente recebe link de pagamento PIX e confirmação

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22 + TypeScript + Fastify |
| Banco de dados | PostgreSQL + Prisma ORM |
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

### Executar em desenvolvimento

```bash
npx tsx src/index.ts
```

Servidor sobe em `http://localhost:3000`.

## Licença

Projeto privado. Todos os direitos reservados.