# 02 — Frameworks e APIs

Este documento consolida dois conceitos centrais para qualquer desenvolvedor backend: **frameworks** e **APIs**. Explicados com analogias e exemplos do próprio projeto `comanda-ia`.

## O que é um framework

**Framework é código pronto que resolve problemas repetitivos, pra você focar só no que é específico do seu projeto.**

### Analogia da cozinha

Pense em montar uma galeteria:

- **Sem framework:** você compra madeira, faz os móveis, liga tubulação de gás, monta rede elétrica, faz projeto hidráulico. Depois ainda tem que fazer o galeto.
- **Com framework:** você aluga uma cozinha industrial pronta (fogão, coifa, exaustor, pia, tudo funcionando). Você só cozinha.

Nos dois casos o cliente recebe galeto. Mas no primeiro você gastou 6 meses construindo cozinha em vez de cozinhando.

### Em código: com vs sem framework

Sem framework (Node.js puro):

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/pedidos' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      // parsear JSON manualmente
      // validar manualmente
      // tratar erros manualmente
      // formatar resposta manualmente
      // ... pra cada rota
    });
  }
});

server.listen(3000);
```

Com framework (Fastify):

```typescript
fastify.post('/pedidos', async (request, reply) => {
  return { pedido: 'criado' };
});
```

O framework cuida do HTTP, do JSON, dos erros, do roteamento. Você só escreve o que sua rota faz de específico.

### Paralelos com o que você já conhece

Frameworks não são exclusivos de backend. Você já usa vários no seu dia a dia:

| Ferramenta | É framework de quê |
|---|---|
| **Terraform** | Gerenciar infra como código |
| **React** | Construir telas |
| **Fastify** | Construir APIs HTTP |
| **Prisma** | Acessar banco de dados |

A lógica é sempre a mesma: "alguém já resolveu os problemas chatos, você só declara o que quer".

Exemplo em Terraform:

```hcl
resource "azurerm_resource_group" "foo" {
  name     = "foo"
  location = "eastus"
}
```

Você não faz chamadas REST pra API da Azure na mão. O Terraform faz. Você só declara o estado desejado.

Exemplo em Fastify:

```typescript
fastify.get('/cardapio', async () => {
  return { itens: [...] };
});
```

Você não trata HTTP na mão. O Fastify faz. Você só declara que rota tem e o que ela retorna.

### Quando você vê uma ferramenta nova, pergunte-se

> "O que essa ferramenta faz por mim que eu teria que fazer na mão?"

Essa é sempre a resposta pra por que um framework existe.

## O que é uma API

**API é um "cardápio de comandos" que um sistema oferece para outros sistemas chamarem.**

A sigla significa **Application Programming Interface** (Interface de Programação entre Aplicações). Na prática, é a **porta de entrada** pra outro software usar o seu.

### Analogia da galeteria

Quando um cliente vai no balcão, não entra na cozinha pra fazer o galeto. Ele olha o **cardápio** e pede o que quer. O cardápio lista:

- O que pode ser pedido
- O que vem em cada pedido
- Quanto custa cada um

Uma API é exatamente isso: um cardápio de comandos que o sistema oferece.

### Exemplo prático — API do comanda-ia

No final do projeto, a API do `comanda-ia` vai ter um cardápio assim:

```
GET  /cardapio        → retorna o cardápio da lanchonete
POST /pedidos         → cria um pedido novo
GET  /pedidos         → lista todos os pedidos
GET  /pedidos/5       → retorna o pedido número 5
PATCH /pedidos/5      → atualiza o pedido 5 (ex: marcar como pronto)
DELETE /pedidos/5     → cancela o pedido 5
```

Cada linha dessas é um **endpoint** — um item do cardápio.

### Quem consome essa API?

Na arquitetura do `comanda-ia`, três "clientes" diferentes vão chamar a API:

1. **Frontend (tela da cozinha)** — pra buscar pedidos novos em tempo real
2. **Evolution API (WhatsApp)** — quando chega mensagem do cliente, chama a API pra processar
3. **Mercado Pago** — quando um pagamento é confirmado, dispara um webhook pra API

Todos eles falam com o mesmo cardápio.

## Métodos HTTP

Quando alguém chama a API, precisa dizer **o que quer fazer**. Isso é o **método HTTP**:

| Método | Intenção | Exemplo no projeto |
|---|---|---|
| `GET` | **Ler** informação | Buscar o cardápio |
| `POST` | **Criar** algo novo | Criar um pedido |
| `PATCH` | **Atualizar parcialmente** | Marcar pedido como pronto |
| `PUT` | **Substituir totalmente** | Substituir o cardápio inteiro |
| `DELETE` | **Apagar** algo | Cancelar um pedido |

Quando você digitou `http://localhost:3000` no navegador, ele fez um `GET /`. Todo acesso via navegador é `GET` por padrão.

### Códigos de resposta

Toda resposta vem com um código (status code) indicando se deu certo:

| Faixa | Significado | Exemplos |
|---|---|---|
| `2xx` | Sucesso | `200 OK`, `201 Created` |
| `3xx` | Redirecionamento | `301 Moved`, `304 Not Modified` |
| `4xx` | Erro do cliente | `400 Bad Request`, `401 Unauthorized`, `404 Not Found` |
| `5xx` | Erro do servidor | `500 Internal Server Error` |

Se você vir `404` no terminal, é que o cliente pediu algo que não existe. Se vir `500`, é bug no seu código.

## Fastify no projeto

### Por que Fastify (e não Express)

Express é o mais famoso (como o CloudFormation: primeiro a aparecer). Fastify é o sucessor moderno:

- Mais rápido em benchmarks
- Validação de schema nativa
- Tipagem automática com TypeScript
- Adotado por empresas sérias em projetos novos

### Estrutura básica (o código do nosso projeto)

```typescript
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

fastify.get('/', async (request, reply) => {
  return { 
    mensagem: 'Olá! Bem-vindo à API do comanda-ia 🍗',
    versao: '0.0.1',
  };
});

const iniciar = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor rodando em http://localhost:3000');
  } catch (erro) {
    fastify.log.error(erro);
    process.exit(1);
  }
};

iniciar();
```

### Linha por linha

#### Linha 1 — import

```typescript
import Fastify from 'fastify';
```

Traz o Fastify pro arquivo. Equivale a um `module "foo" { source = ... }` em Terraform.

#### Linhas 3-5 — criar instância

```typescript
const fastify = Fastify({
  logger: true,
});
```

Cria o servidor. `logger: true` faz com que toda requisição seja logada no terminal (valioso pra debugar).

#### Linhas 7-12 — uma rota

```typescript
fastify.get('/', async (request, reply) => {
  return { 
    mensagem: 'Olá! ...',
    versao: '0.0.1',
  };
});
```

- `fastify.get('/')` → "quando alguém fizer `GET /`, execute isso"
- `async (request, reply) => { ... }` → função que roda ao ser chamada
- `return { ... }` → Fastify converte o objeto em JSON automaticamente

#### Linhas 14-23 — iniciar o servidor

```typescript
const iniciar = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (erro) {
    fastify.log.error(erro);
    process.exit(1);
  }
};
```

- `listen({ port: 3000 })` → abre a porta 3000 e fica escutando
- `host: '0.0.0.0'` → aceita conexões de qualquer origem (importante em containers)
- `try/catch` → se der erro, loga antes de matar o processo

### Lendo os logs do Fastify

Cada requisição gera uma linha de log JSON. Exemplo:

```json
{
  "level": 30,
  "method": "GET",
  "url": "/",
  "statusCode": 200,
  "responseTime": 6.94,
  "msg": "request completed"
}
```

- `method` → tipo da requisição
- `url` → qual rota foi acessada
- `statusCode` → código de resposta
- `responseTime` → tempo em milissegundos
- `msg` → mensagem legível

Saber ler log é um superpoder de dev. Sempre olhe os logs quando algo falhar.

## Dúvidas comuns

### "Ao rodar no navegador, aparece `GET /favicon.ico not found`. Bug?"

Não. Todo navegador tenta buscar automaticamente o ícone do site (aquele quadradinho na aba). Como nossa API não tem um, retorna 404. Não afeta nada.

### "Como parar o servidor pra mudar o código?"

No terminal onde ele tá rodando, aperta `Ctrl + C`.

### "Toda vez que eu mudar o código, tenho que parar e rodar de novo?"

Sim, por enquanto. Existe uma forma de ter "recarga automática" (hot reload), que vamos configurar mais pra frente usando a flag `--watch` do `tsx`.

### "O que é localhost e a porta 3000?"

- **localhost** = a sua própria máquina. Qualquer código rodando no seu computador pode ser acessado via `localhost`.
- **porta 3000** = um "canal" de comunicação. Uma máquina tem 65 mil portas possíveis. Por convenção, desenvolvedores usam 3000 pra APIs em desenvolvimento.

### "Por que retornar JSON e não HTML?"

Porque uma API é consumida por **outros softwares**, não por humanos diretamente. JSON é o formato universal pra troca de dados entre sistemas — leve, estruturado, fácil de parsear. O HTML fica do lado do frontend (React).

## Próximos tópicos

Ainda não escritos. Virão conforme o projeto avança:

- 03 — Banco de dados e Prisma ORM
- 04 — Autenticação e multi-tenant
- 05 — Variáveis de ambiente e configuração
- 06 — WebSockets e tempo real (Socket.IO)
- 07 — Integração com LLM (padrão Adapter)
- 08 — Integração com WhatsApp (Evolution API)
- 09 — Integração com pagamento (Mercado Pago)
- 10 — Deploy na Azure com Terraform