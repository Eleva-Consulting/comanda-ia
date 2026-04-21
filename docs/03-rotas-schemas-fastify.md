# 03 — Rotas, parâmetros e validação com schemas

Este documento consolida o que foi aprendido sobre criação de rotas HTTP no Fastify, tipos de parâmetros e validação automática de dados.

## Hot reload no desenvolvimento

### O problema

Sem hot reload, toda mudança no código exige parar e reiniciar o servidor manualmente. Ineficiente.

### A solução

Usar `tsx watch` em vez de `tsx` direto. O `watch` detecta mudanças nos arquivos e reinicia automaticamente.

### Como configurar via scripts

No `package.json`, adicionar scripts:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

Uso:

| Comando | Quando usar |
|---|---|
| `npm run dev` | Desenvolvimento (com hot reload) |
| `npm run build` | Compilar TypeScript para JavaScript |
| `npm run start` | Executar em produção (JavaScript puro) |

## Tipos de rotas

### GET — leitura

Usado quando se quer **obter** informação. Sem efeitos colaterais.

```typescript
fastify.get('/cardapio', async (request, reply) => {
  return { itens: [...] };
});
```

### POST — criação

Usado quando se quer **criar** algo novo. Dados vêm no corpo (body).

```typescript
fastify.post('/pedidos', async (request, reply) => {
  const dados = request.body;
  return { id: gerarId(), ...dados };
});
```

### PATCH / PUT — atualização

- `PATCH` atualiza parcialmente (só os campos enviados)
- `PUT` substitui completamente

### DELETE — remoção

```typescript
fastify.delete('/pedidos/:id', async (request, reply) => {
  return { removido: true };
});
```

## Parâmetros de URL

Para capturar partes variáveis da URL, use `:nome`:

```typescript
fastify.get('/pedidos/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  return { id };
});
```

Chamadas:
- `GET /pedidos/42` → `id = "42"`
- `GET /pedidos/abc` → `id = "abc"`

### Múltiplos parâmetros

```typescript
fastify.get('/lanchonete/:lojaId/pedidos/:pedidoId', ...);
```

## Códigos de status HTTP

| Faixa | Significado | Exemplos |
|---|---|---|
| `2xx` | Sucesso | `200 OK`, `201 Created` |
| `4xx` | Erro do cliente | `400 Bad Request`, `404 Not Found` |
| `5xx` | Erro do servidor | `500 Internal Server Error` |

## Validação automática com schema

### Por que validar

Sem validação, a API aceita **qualquer coisa** no body. Isso causa:

- Dados corrompidos no banco
- Bugs silenciosos em produção
- Riscos de segurança

### TypeBox + Fastify

TypeBox é uma biblioteca que permite descrever schemas em formato conciso. O Fastify valida automaticamente antes de executar a função da rota.

Instalação:

```bash
npm install @sinclair/typebox
npm install --save-dev @fastify/type-provider-typebox
```

### Exemplo de schema

```typescript
import { Type } from '@sinclair/typebox';

const CriarPedidoSchema = Type.Object({
  cliente: Type.String({ minLength: 2, maxLength: 100 }),
  itens: Type.Array(Type.String(), { minItems: 1 }),
});
```

Leitura: "um pedido válido tem um `cliente` (string de 2 a 100 chars) e `itens` (array com no mínimo 1 item)".

### Aplicando o schema na rota

```typescript
fastify.post('/pedidos', {
  schema: {
    body: CriarPedidoSchema,
  },
}, async (request, reply) => {
  return { ok: true };
});
```

Se a requisição não bater no schema, o Fastify rejeita automaticamente com `400 Bad Request`.

### Onde aplicar schemas

| Localização | Uso |
|---|---|
| `body` | Dados do corpo da requisição (POST, PATCH) |
| `params` | Parâmetros na URL (`:id`) |
| `querystring` | Query params (`?filtro=ativo`) |
| `headers` | Cabeçalhos HTTP |
| `response` | Formato da resposta (opcional) |

## Modo estrito de validação

Por padrão, o Fastify faz **coerção de tipos** — converte silenciosamente `123` em `"123"` se o schema esperava string. Isso mascara bugs.

### Solução: desligar coerção

No `buildServer()`:

```typescript
const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      coerceTypes: false,
      useDefaults: true,
      removeAdditional: true,
    },
  },
}).withTypeProvider<TypeBoxTypeProvider>();
```

| Opção | Efeito |
|---|---|
| `coerceTypes: false` | Desliga conversão automática de tipos |
| `useDefaults: true` | Preenche valores padrão definidos no schema |
| `removeAdditional: true` | Remove campos não declarados no schema (segurança) |

## Organização de código

### Problema de ter tudo num arquivo

Com o crescimento do projeto, um único arquivo vira inviável: muitas rotas, validações, regras de negócio misturadas.

### Estrutura adotada

```
src/
├── index.ts              Ponto de entrada (só inicia o servidor)
├── server.ts             Configura e monta o Fastify
└── routes/
    ├── root.ts           Rota /
    ├── saude.ts          Rota /saude
    └── pedidos.ts        Rotas /pedidos, /pedidos/:id
```

### Plugin system do Fastify

Cada arquivo de rota exporta uma função que recebe a instância do Fastify:

```typescript
export async function pedidosRoutes(fastify: FastifyInstance) {
  fastify.get('/pedidos/:id', ...);
  fastify.post('/pedidos', ...);
}
```

E é "registrada" no `server.ts`:

```typescript
await fastify.register(pedidosRoutes);
```

Isso se chama **plugin**. Tudo no Fastify é plugin — rotas, banco, autenticação, log. Essa é a filosofia do framework.

### Imports com extensão `.js`

Mesmo sendo arquivos `.ts`, nos imports usamos `.js`:

```typescript
import { pedidosRoutes } from './routes/pedidos.js';
```

Isso é uma particularidade da configuração moderna de módulos ES do TypeScript. Parece estranho mas é assim mesmo.

## Testando APIs pelo terminal (curl)

`curl` é uma ferramenta de linha de comando pra fazer requisições HTTP. Já vem instalada no Linux.

### GET simples

```bash
curl http://localhost:3000/saude
```

### POST com body JSON

```bash
curl -X POST http://localhost:3000/pedidos \
  -H "Content-Type: application/json" \
  -d '{"cliente": "João", "itens": ["1x Galeto"]}'
```

### Opções mais usadas

| Flag | Significado |
|---|---|
| `-X MÉTODO` | Define o método HTTP (GET, POST, etc.) |
| `-H "header: valor"` | Adiciona um header |
| `-d 'dados'` | Envia dados no body |
| `-i` | Mostra também os headers da resposta |
| `-v` | Modo verboso (debug completo da requisição) |

## Ferramentas alternativas para testar APIs

Além do curl, existem ferramentas com interface gráfica:

- **Postman** — o mais famoso, bom pra equipes
- **Insomnia** — alternativa leve e bonita
- **Thunder Client** — extensão do VS Code, roda dentro do editor
- **REST Client** — extensão do VS Code, usa arquivos `.http` versionáveis

Para o projeto, qualquer uma serve. Comece com curl e depois experimente.

## Próximos tópicos

Ainda não escritos. Virão em breve:

- 04 — Banco de dados com Prisma ORM
- 05 — Autenticação, JWT e multi-tenant