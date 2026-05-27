# 07 — Autenticação JWT e multi-tenant

Este documento consolida o que foi aprendido sobre autenticação, autorização e o conceito mestre que transforma um sistema em SaaS de verdade: o isolamento entre tenants.

## Autenticação vs autorização

São conceitos distintos que andam juntos.

| Conceito | Pergunta que responde | Quando acontece |
|---|---|---|
| **Autenticação** | Quem é você? | No login (verifica credenciais) |
| **Autorização** | O que você pode fazer? | Em cada request protegida |

Login é autenticação. "Esse usuário pode editar esse pedido?" é autorização. Confundir os dois leva a bugs de segurança graves.

## Hash de senha com bcrypt

**Regra absoluta: senha em texto puro nunca toca o banco.** Se o banco vazar — e bancos vazam — as senhas em texto puro vão para a dark web e seus usuários ficam expostos em todos os outros serviços onde reutilizam a mesma senha.

O que armazenamos é o **hash**: uma transformação criptográfica de mão única. Você consegue gerar hash a partir da senha, mas matematicamente não consegue voltar.

### O que bcrypt faz além de hashear

**Salt aleatório.** Antes de hashear, o bcrypt gera um valor aleatório (o salt) e mistura com a senha. Isso significa que **a mesma senha gera hashes diferentes a cada chamada**. Sem salt, atacantes usariam "rainbow tables" — tabelas pré-computadas com hash de senhas comuns. Com salt único por usuário, rainbow tables ficam inúteis.

**Trabalho proposital (slow by design).** SHA-256 hasheia milhões de senhas por segundo numa GPU. O bcrypt faz de propósito devagar — repete a operação `2^N` vezes (onde N é o "cost factor"). Em 12 rounds = 4096 iterações. Pra você, hashear leva ~250ms (imperceptível no login). Pra um atacante tentando 1 bilhão de senhas, vira inviável.

### Anatomia de um hash bcrypt

```
$2b$12$Vsnm.pBsniBQ8U.dKOlS/uJ3hEjw1F10tNUY5.3pQF5hmyLkVVEOy
```

| Pedaço | Significado |
|---|---|
| `$2b$` | Algoritmo bcrypt, versão 2b |
| `12$` | Cost factor (`SALT_ROUNDS = 12`) |
| `Vsnm.pBsniBQ8U.dKOlS/u` | Salt (22 caracteres aleatórios) |
| `J3hEjw1F10tNUY5.3pQF5hmyLkVVEOy` | Hash propriamente dito |

O salt vive dentro do próprio hash. Por isso `bcrypt.compare(senha, hash)` funciona sem precisar armazenar o salt separado — ele extrai do hash, re-hasheia a senha digitada com esse salt, e compara.

### Nome do campo importa

O campo no banco se chama `senhaHash`, não `senha`. Esse nome deixa explícito para qualquer dev que abra o schema: aqui não é senha, é hash. Bugs começam quando nomes mentem.

## JWT: anatomia e funcionamento

Um JWT parece com isso: `xxxxx.yyyyy.zzzzz` — três pedaços separados por ponto.

| Parte | Conteúdo | Sensível? |
|---|---|---|
| **Header** | `{"alg":"HS256","typ":"JWT"}` em base64 | Não |
| **Payload** | Seus dados (userId, role, iat, exp) em base64 | **Visível por qualquer um** |
| **Signature** | `HMAC_SHA256(header.payload, secret)` | A prova de autenticidade |

### O detalhe que confunde quem está começando

JWT **não é criptografado, é assinado**. Qualquer pessoa que pegar o token pode decodificar o payload em texto puro (cola no `jwt.io` e dá pra ler tudo). O que ela **não consegue** é forjar um token novo, porque pra isso precisaria da `secret` do servidor.

**Implicação prática:** nunca colocar senha, hash, dados de cartão, ou nada sensível no payload. Apenas identificadores e claims de autorização.

### Stateless vs session-based

| Session-based (tradicional) | JWT (stateless) |
|---|---|
| Servidor guarda sessão em memória/Redis com um ID | Servidor não guarda nada — o token tem tudo |
| Cliente envia cookie com session ID | Cliente envia o token (header Authorization) |
| A cada request, servidor consulta o store da sessão | A cada request, servidor só verifica a assinatura |
| Difícil escalar horizontalmente | Escala infinito — qualquer instância valida sozinha |
| Logout é trivial (deleta sessão) | Logout é complicado (token vive até expirar) |

Para SaaS multi-tenant que pode ter múltiplas instâncias rodando atrás de um load balancer, **JWT é o padrão**. Você ganha escalabilidade ao custo de logout-imediato (que se resolve no futuro com token curto + refresh token).

### Como a verificação funciona

```
Cliente envia: Authorization: Bearer eyJhbGc...

Servidor:
1. Separa o token em header.payload.signature
2. Pega header.payload, junta com a secret armazenada
3. Calcula HMAC_SHA256
4. Compara com a signature recebida
5. Se bater → token é genuíno e payload é confiável
6. Se não bater → 401 imediato
```

Tudo isso **sem tocar no banco**. Por isso JWT é tão rápido — autenticação vira pura aritmética de assinatura.

### Tempo de expiração

Usamos 7 dias (`expiresIn: '7d'`). É o sweet spot para SaaS web — usuário não loga toda hora, mas se o token vazar, o estrago tem prazo. Apps bancários usariam 15 minutos + refresh token.

### A secret

A `JWT_SECRET` é literalmente a chave do reino — se vazar, alguém pode forjar tokens válidos para qualquer usuário. Por isso:

- Vive em variável de ambiente (`.env`)
- O `.env` está no `.gitignore`
- Em produção, vai para um gerenciador de segredos (Azure Key Vault, AWS Secrets Manager)
- Geramos com `crypto.randomBytes(64).toString('hex')` — 128 caracteres aleatórios

## Multi-tenancy: o conceito que muda tudo

Um SaaS mono-tenant serve um cliente por instância. Um SaaS multi-tenant serve **N clientes na mesma instância**, com isolamento garantido entre eles. Cada cliente é um **tenant**.

### Estratégias clássicas

| Estratégia | Como funciona | Quando usar |
|---|---|---|
| **Database per tenant** | Um banco separado para cada cliente | Enterprise, regulação pesada (saúde, bancos) |
| **Schema per tenant** | Um banco, schemas separados | Médio porte, isolamento parcial |
| **Shared database + tenant_id** | Tudo num banco, coluna `tenant_id` em cada tabela filtra | 90% dos SaaS modernos começam aqui |

Escolhemos **shared database**. É mais barato, mais simples, escala bem até centenas de milhares de tenants, e é o padrão de mercado. Notion, Linear, Vercel, todos começam assim.

### Onde o tenant_id mora no projeto

A coluna `estabelecimentoId` em `ItemCardapio` e `Pedido` é o nosso tenant_id. Cada `Estabelecimento` é um tenant. Essa estrutura já existia desde a etapa 5 — só passou a ser usada para isolamento na etapa 7.

### O risco existencial do multi-tenant

O pior bug possível numa arquitetura compartilhada é **vazamento entre tenants** — galeteria A vê pedidos da pizzaria B. Isso destrói um SaaS de uma vez. Já aconteceu com empresas grandes.

A defesa não é "lembrar de filtrar". A defesa é **arquitetura que torna impossível esquecer de filtrar**. O `estabelecimentoId` vem sempre do token (assinado, confiável), nunca do request body (confiança zero).

## Fastify: hooks e middleware

Fastify tem um pipeline de hooks que rodam em ordem antes do handler:

```
Request chega → onRequest → preParsing → parse body → preValidation 
              → schema valida → preHandler → HANDLER → onSend → resposta
```

Para autenticação, usamos `onRequest` — o mais cedo possível. Se o token está inválido, nem queremos gastar trabalho parseando body.

### Aplicando o middleware

```typescript
import { autenticar } from '../plugins/auth.js';

fastify.get('/pedidos', {
  onRequest: [autenticar],
}, async (request, reply) => {
  // request.user já está populado aqui
});
```

A função `autenticar` é uma função normal exportada. Ela chama `request.jwtVerify()` (vem do `@fastify/jwt`) que faz todo o trabalho de extrair, validar e popular `request.user`.

## TypeScript: module augmentation

Quando o `@fastify/jwt` plugin é registrado, ele adiciona `request.user` em runtime. Mas o TypeScript não sabe que campos esse objeto tem. **Module augmentation** ensina isso aos tipos sem alterar a biblioteca:

```typescript
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      estabelecimentoId: string;
      role: 'DONO' | 'OPERADOR';
    };
    user: {
      userId: string;
      estabelecimentoId: string;
      role: 'DONO' | 'OPERADOR';
    };
  }
}
```

A partir dessa declaração, `request.user.estabelecimentoId` vira type-safe no TypeScript. Autocomplete funciona, erro de compilação se errar o nome do campo.

## Padrões de isolamento no Prisma

Toda query que toca tabelas de tenant precisa filtrar pelo `estabelecimentoId` que vem do token. Três padrões cobrem todos os casos.

### findFirst com filtros compostos

O `findUnique` só aceita campos com `@unique` ou `@id`. Para condições compostas (`id` + `estabelecimentoId`), usa-se `findFirst`:

```typescript
const pedido = await prisma.pedido.findFirst({
  where: { id, estabelecimentoId },
});

if (!pedido) {
  return reply.status(404).send({ erro: 'Pedido não encontrado' });
}
```

Se o pedido existe mas pertence a outro tenant, retorna `null` — exatamente como se não existisse.

### updateMany com count

`update` lança exceção quando não encontra. Em multi-tenant, preferimos `updateMany` com filtro composto, e checamos `count`:

```typescript
const resultado = await prisma.pedido.updateMany({
  where: { id, estabelecimentoId },
  data: { status: 'pronto' },
});

if (resultado.count === 0) {
  return reply.status(404).send({ erro: 'Pedido não encontrado' });
}
```

`count === 0` significa: ou o registro não existe, ou pertence a outro tenant. Ambos resolvem com 404.

### deleteMany com count

Mesma lógica do update:

```typescript
const resultado = await prisma.pedido.deleteMany({
  where: { id, estabelecimentoId },
});

if (resultado.count === 0) {
  return reply.status(404).send({ erro: 'Pedido não encontrado' });
}
return reply.status(204).send();
```

### Resumo dos padrões

| Operação | Antes (sem isolamento) | Depois (com isolamento) |
|---|---|---|
| Listar | `findMany()` | `findMany({ where: { estabelecimentoId } })` |
| Buscar por id | `findUnique({ where: { id } })` | `findFirst({ where: { id, estabelecimentoId } })` |
| Atualizar | `update()` + try/catch | `updateMany()` + check count |
| Deletar | `delete()` + try/catch | `deleteMany()` + check count |
| Criar | `create({ data: { ..., estabelecimentoId } })` | mesmo, mas `estabelecimentoId` vem do token |

## Defesas extras de segurança

### 404 em vez de 403 (security through obscurity)

Quando o usuário tenta acessar um recurso que **existe mas pertence a outro tenant**, retornamos **404 "não encontrado"**, não **403 "proibido"**.

- **403 vaza informação**: o atacante sabe que esse ID existe, só não tem permissão
- **404 esconde**: o atacante não consegue mapear o que existe no sistema

GitHub, Stripe, AWS e todos os grandes fazem assim. Em endpoints de tenant, 404 é o status correto para qualquer falha de acesso, mesmo quando tecnicamente seria 403.

### Mensagem genérica no login

No endpoint de login, retornamos a mesma mensagem `"Credenciais inválidas"` tanto para "email não cadastrado" quanto para "senha errada":

```typescript
if (!usuario) {
  return reply.status(401).send({ erro: 'Credenciais inválidas' });
}

const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
if (!senhaCorreta) {
  return reply.status(401).send({ erro: 'Credenciais inválidas' });
}
```

Isso é defesa contra **user enumeration**: se a mensagem fosse diferente nos dois casos, um atacante poderia testar emails em lote e descobrir quais estão cadastrados. Mensagem genérica neutraliza esse ataque.

### Estabelecimento órfão é estado inválido

Todo `Usuario` tem `estabelecimentoId` obrigatório (não-nullable no schema). Não existe usuário sem tenant. Isso é arquitetura defensiva: se o campo fosse opcional, alguém poderia criar um usuário sem `estabelecimentoId` e a query de isolamento daria errado.

## Nested writes: criação atômica

No signup precisamos criar `Estabelecimento` + `Usuario` numa operação só. O Prisma resolve com nested write:

```typescript
const resultado = await prisma.estabelecimento.create({
  data: {
    nome: 'Galeteria do Vinícius',
    telefone: '85999999999',
    usuarios: {
      create: {
        nome: 'Vinícius',
        email: 'vinicius@teste.com',
        senhaHash,
        role: 'DONO',
      },
    },
  },
  include: { usuarios: true },
});
```

O Prisma envolve as duas inserts numa **transação implícita** — ou as duas operações dão certo, ou nenhuma é aplicada. Esse é o A do ACID — Atomicidade. Sem isso, um erro na criação do usuário deixaria estabelecimentos órfãos no banco.

`include` no final pede pro Prisma já retornar o estabelecimento com os usuários criados, evitando uma segunda query.

## Estrutura final das rotas

| Rota | Auth? | O que faz |
|---|---|---|
| `POST /auth/signup` | Não | Cria tenant + usuário DONO |
| `POST /auth/login` | Não | Verifica credenciais, devolve JWT |
| `GET /meu-estabelecimento` | Sim | Dados do meu estabelecimento |
| `GET /meu-estabelecimento/dashboard` | Sim | Dashboard agregado |
| `GET /cardapio` | Sim | Listar meus itens |
| `GET /cardapio/:id` | Sim | Item específico (com ownership) |
| `POST /cardapio` | Sim | Criar item (estabelecimentoId do token) |
| `PATCH /cardapio/:id` | Sim | Atualizar item (com ownership) |
| `DELETE /cardapio/:id` | Sim | Deletar item (com ownership) |
| `GET /pedidos` | Sim | Listar meus pedidos |
| `GET /pedidos/:id` | Sim | Pedido específico (com ownership) |
| `POST /pedidos` | Sim | Criar pedido (estabelecimentoId do token) |
| `PATCH /pedidos/:id` | Sim | Atualizar status (com ownership) |
| `DELETE /pedidos/:id` | Sim | Deletar pedido (com ownership) |

Apenas `signup` e `login` são públicas. Todo o resto é autenticado e isolado por tenant.

## O que mudou no schema

Adicionamos:

```prisma
enum Role {
  DONO
  OPERADOR
}

model Usuario {
  id        String   @id @default(uuid())
  email     String   @unique
  senhaHash String
  nome      String
  role      Role     @default(DONO)
  criadoEm  DateTime @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  @@map("usuarios")
}
```

E em `Estabelecimento`:

```prisma
usuarios  Usuario[]
```

Decisões:

- `senhaHash` em vez de `senha`: nome explícito impede ambiguidade
- `email @unique`: identificador global de login
- `role` como enum nativo do PostgreSQL: validação em 3 camadas (TS, Prisma, banco)
- `estabelecimentoId` obrigatório: não existe usuário órfão
- Relação 1-N (no schema), 1-1 (no fluxo atual): banco pronto pro crescimento futuro

## Dependências adicionadas

| Pacote | Para que |
|---|---|
| `bcrypt` | Hash de senha |
| `@types/bcrypt` | Tipos TypeScript para bcrypt |
| `@fastify/jwt` | Geração e verificação de JWTs |

## Próximos tópicos

- 08 — Integração com WhatsApp via Evolution API (webhook + envio de mensagens)
- 09 — Integração com Claude API usando padrão Adapter (IA recebendo pedidos em linguagem natural)
- 10 — Socket.IO para painel da cozinha em tempo real
- 11 — Frontend React + Vite + Tailwind (painel do dono e tela da cozinha)
- 12 — Integração com Mercado Pago (PIX dinâmico)
- 13 — Deploy em Azure com Terraform