# 05 — Prisma ORM e banco de dados

Este documento consolida o aprendizado sobre persistência de dados no projeto: o conceito de ORM, modelagem de entidades, migrations e a integração do Fastify com o Prisma.

## O problema: sistemas sem memória

Antes da integração com banco, a API recebia pedidos via `POST /pedidos`, processava e **esquecia imediatamente**. Os dados viviam apenas em memória (RAM do Node.js). Reiniciar o servidor significava perder tudo.

Esse não é um sistema real — é um simulacro. Sistemas reais precisam de **persistência**: dados que permanecem após falhas, reinicializações ou atualizações.

## ORM: o que é e por que usar

### Sem ORM (SQL puro)

Acessar banco diretamente exige escrever SQL no código:

```typescript
const resultado = await client.query(
  `INSERT INTO pedidos (cliente, total) VALUES ($1, $2) RETURNING *`,
  [dados.cliente, dados.total]
);
const pedido = resultado.rows[0];
```

Problemas:

- SQL como string, sem auto-complete nem checagem de erros
- Sem tipagem (`pedido.clinte` errado só quebra em produção)
- Vulnerável a SQL injection se mal escrito
- Sintaxe específica de cada banco
- Mudanças no schema não versionadas

### Com ORM (Prisma)

```typescript
const pedido = await prisma.pedido.create({
  data: {
    cliente: dados.cliente,
    total: dados.total,
  },
});
```

ORM (Object-Relational Mapping) traduz entre o mundo do código (objetos) e o mundo do banco (tabelas). Limpo, tipado, com auto-complete, seguro.

### Por que Prisma

Existem outros ORMs em Node.js (TypeORM, Sequelize, Drizzle). Prisma é o mais adotado hoje porque:

- Schema declarativo legível
- Tipagem automática gerada do schema
- Migrations automáticas com versionamento
- Prisma Studio (interface gráfica)
- Documentação excelente
- Padrão da indústria em projetos Node.js modernos

### Paralelo com Terraform

Terraform traduz declaração em HCL para chamadas REST nas APIs de cloud. Prisma traduz declaração em Prisma Schema para SQL no banco. Mesma filosofia: declarar o estado desejado, ferramenta gera as operações.

## Migrations: versionamento de schema

Migration é um arquivo SQL versionado que descreve uma mudança no banco. Cada alteração vira um arquivo no Git.

```
prisma/migrations/
├── 20260423120000_init/
│   └── migration.sql
└── 20260424130000_adiciona_telefone_cliente/
    └── migration.sql
```

Quem clona o repositório roda `npx prisma migrate dev` e todas as mudanças são aplicadas em ordem.

### Comandos principais

| Comando | Efeito |
|---|---|
| `npx prisma migrate dev --name foo` | Gera migration baseada na diferença entre schema e banco, aplica e regenera o client |
| `npx prisma generate` | Apenas regenera o Prisma Client a partir do schema (sem tocar no banco) |
| `npx prisma validate` | Valida o schema sem alterar nada |
| `npx prisma studio` | Abre interface gráfica para ver/editar dados |

### Importante

Sempre que o `schema.prisma` mudar, é necessário regenerar o client com `npx prisma generate`. O `migrate dev` faz isso automaticamente, mas se houver mudança sem migration, o client fica desatualizado.

## Prisma 7: novidades importantes

A versão 7 do Prisma (lançada em novembro de 2025) trouxe mudanças significativas:

### Configuração separada do schema

A URL de conexão saiu do `schema.prisma` e foi para um novo arquivo `prisma.config.ts`:

```typescript
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
```

### Driver adapters obrigatórios

Antes o Prisma incluía drivers internos. Agora é preciso instalar um adapter explícito:

```bash
npm install @prisma/adapter-pg pg
```

E inicializar o cliente passando o adapter:

```typescript
import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
```

### Cliente gerado dentro do código

O cliente agora é gerado em `src/generated/prisma` (configurável). Essa pasta deve estar no `.gitignore`.

### ESM obrigatório

O Prisma 7 exige `"type": "module"` no `package.json`.

## Modelagem do projeto

O schema final do `comanda-ia` ficou assim:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Estabelecimento {
  id        String   @id @default(uuid())
  nome      String
  telefone  String
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now())

  itens    ItemCardapio[]
  pedidos  Pedido[]

  @@map("estabelecimentos")
}

model ItemCardapio {
  id           String  @id @default(uuid())
  nome         String
  descricao    String?
  preco        Decimal @db.Decimal(10, 2)
  disponivel   Boolean @default(true)

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  @@map("itens_cardapio")
}

model Pedido {
  id              String   @id @default(uuid())
  clienteNome     String
  clienteFone     String
  enderecoEntrega String?
  total           Decimal  @db.Decimal(10, 2)
  status          String   @default("recebido")
  criadoEm        DateTime @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  @@map("pedidos")
}
```

### Decisões de modelagem

| Escolha | Justificativa |
|---|---|
| `Estabelecimento` (não `Lanchonete`) | Genérico para atender lanchonete, galeteria, pizzaria, bar |
| UUID como PK | Não expõe contagem, gera no cliente, sem conflito em distribuído |
| `Decimal(10,2)` para preço | Float tem problemas de precisão (`0.1+0.2 ≠ 0.3`); Decimal usa aritmética exata |
| `@@map("nome_plural_minusculo")` | Convenção: código em PascalCase singular, banco em snake_case plural |
| `criadoEm` com `@default(now())` | Banco preenche timestamp automaticamente |

### Relacionamentos

`Estabelecimento` tem muitos `ItemCardapio` e muitos `Pedido`. Cada `ItemCardapio` e `Pedido` aponta para um `Estabelecimento` via foreign key (`estabelecimentoId`).

No Prisma, o lado "muitos" usa array (`itens ItemCardapio[]`) e o lado "um" usa `@relation(fields: [...], references: [...])`.

## Operações comuns no Prisma Client

### Buscar muitos registros

```typescript
const pedidos = await prisma.pedido.findMany({
  orderBy: { criadoEm: 'desc' },
});
```

### Buscar único pelo id

```typescript
const pedido = await prisma.pedido.findUnique({
  where: { id },
});

if (!pedido) {
  return reply.status(404).send({ erro: 'Pedido não encontrado' });
}
```

### Criar registro

```typescript
const pedido = await prisma.pedido.create({
  data: {
    estabelecimentoId,
    clienteNome,
    clienteFone,
    total,
  },
});
```

Campos com `@default` (id, status, criadoEm) são preenchidos automaticamente.

### Atualizar

```typescript
const pedido = await prisma.pedido.update({
  where: { id },
  data: { status: 'pronto' },
});
```

### Deletar

```typescript
await prisma.pedido.delete({ where: { id } });
```

### Incluir relacionamentos

```typescript
const pedidos = await prisma.pedido.findMany({
  include: { estabelecimento: true },
});
```

Isso traz o estabelecimento aninhado em cada pedido.

## Tipos retornados pelo Prisma

### Decimal vira string no JSON

Campos `Decimal` do schema são retornados como **string** no JSON. Motivo: JavaScript não consegue representar decimais com precisão (problema do Float). Para usar como número no frontend, converter explicitamente: `Number(pedido.total)` ou `parseFloat(pedido.total)`.

### DateTime vira ISO string

Datas são serializadas em formato ISO 8601: `"2026-05-04T04:18:16.502Z"`. Para manipular no frontend: `new Date(pedido.criadoEm)`.

## Fluxo de desenvolvimento com Prisma

1. Modificar `prisma/schema.prisma`
2. `npx prisma migrate dev --name descricao_da_mudanca`
3. O Prisma gera o SQL da migration e aplica
4. O Prisma Client é regenerado automaticamente
5. Atualizar o código que usa o cliente, aproveitando os novos tipos

Em produção (deploy), usa-se `npx prisma migrate deploy` em vez de `migrate dev`. A diferença: `deploy` apenas aplica migrations existentes, não gera novas.

## Lições aprendidas

### Stack trace é seu amigo

Quando algo quebra, ler o stack trace completo do erro economiza horas. Toda mensagem de erro do Node.js indica:

- O tipo do erro (`TypeError`, `SyntaxError`, etc.)
- A mensagem específica
- O arquivo e linha onde aconteceu
- A cadeia de chamadas que levou ao erro

### Cliente gerado precisa estar atualizado

Se o `schema.prisma` mudar e o cliente não for regenerado, ele fica "fantasma": com a estrutura antiga ou vazia. Sempre rodar `npx prisma generate` após mudanças.

### Versões novas trazem surpresas

O Prisma 7 é recente (nov/2025). A maioria dos tutoriais ainda é Prisma 6. Em projetos com versões muito novas, **a documentação oficial é a única fonte confiável**.

## Próximos tópicos

- 06 — Autenticação, JWT e multi-tenant
- 07 — Variáveis de ambiente e configuração
- 08 — WebSockets e atualizações em tempo real