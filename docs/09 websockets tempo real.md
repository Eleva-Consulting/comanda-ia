# 09 — WebSockets e tempo real com Socket.IO

Este documento consolida o aprendizado sobre comunicação em tempo real: a diferença entre HTTP e WebSocket, o uso de Socket.IO, e como aplicar isolamento multi-tenant através de salas.

## O problema: HTTP não serve para tempo real

HTTP é **request-response**: o cliente pergunta, o servidor responde, a conexão fecha. O servidor não tem como avisar o cliente sobre algo novo — ele só responde quando perguntado.

Para a cozinha "ver pedidos novos" com HTTP puro, ela precisaria ficar perguntando repetidamente:

```
"Tem pedido novo?" → não
"Tem pedido novo?" → não
"Tem pedido novo?" → sim, 1 pedido
```

Isso se chama **polling**. Problemas: desperdiça requisições (a maioria retorna "nada"), e tem atraso (o pedido só aparece no próximo ciclo de pergunta).

## A solução: WebSocket

WebSocket é uma conexão **persistente e bidirecional**. Uma vez aberta, fica viva, e o servidor pode **empurrar** (push) dados pro cliente a qualquer momento — sem o cliente perguntar.

| HTTP (polling) | WebSocket (push) |
|---|---|
| Cliente pergunta repetidamente | Servidor avisa quando há novidade |
| Muitas requisições desperdiçadas | Uma conexão, dados sob demanda |
| Atraso até o próximo ciclo | Instantâneo |
| Simples, stateless | Conexão com estado |

É a tecnologia por trás de chats, notificações ao vivo, e dashboards que atualizam sozinhos.

## Socket.IO

Socket.IO é uma biblioteca sobre WebSocket que adiciona recursos práticos: reconexão automática, fallback para outras técnicas quando WebSocket não está disponível, e o conceito de salas (rooms). Tem dois lados: servidor (`socket.io`) e cliente (`socket.io-client` ou via CDN).

A comunicação é por **eventos**: um lado emite (`emit`), o outro escuta (`on`).

```typescript
// Servidor empurra
io.to(sala).emit('pedido:novo', pedido);

// Cliente escuta
socket.on('pedido:novo', (pedido) => { /* atualiza a tela */ });
```

## Integração com Fastify

O Socket.IO foi anexado diretamente ao servidor HTTP do Fastify (`fastify.server`), sem plugin wrapper. Isso dá controle total e evita problemas de compatibilidade.

```typescript
import { Server } from 'socket.io';

let io: Server | null = null;

export function inicializarSocket(fastify: FastifyInstance) {
  io = new Server(fastify.server, {
    cors: { origin: '*' }, // dev — em produção, restringir
  });
  // ... auth e eventos
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO não foi inicializado');
  return io;
}
```

### Padrão singleton

A instância `io` é guardada no módulo. `inicializarSocket` cria, `getIO` recupera de qualquer lugar. É a mesma ideia do `prisma` no `database.ts` — uma única instância compartilhada por toda a aplicação.

### Ordem de inicialização

No `index.ts`:

```typescript
const fastify = await buildServer();
await fastify.ready();        // garante que os plugins (JWT) carregaram
inicializarSocket(fastify);   // anexa o Socket.IO
await fastify.listen({ ... });
```

O `await fastify.ready()` é necessário porque `fastify.register` apenas agenda os plugins — eles só carregam de fato no `ready()`. Sem isso, `fastify.jwt` poderia estar indefinido quando o socket tenta usá-lo.

## Autenticação de WebSocket via JWT

Uma conexão WebSocket também precisa ser autenticada — qualquer um poderia tentar conectar. A autenticação acontece no **handshake** (momento da conexão), através de um middleware:

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Token ausente'));

  try {
    const payload = fastify.jwt.verify(token);
    socket.data.estabelecimentoId = payload.estabelecimentoId;
    next();
  } catch (erro) {
    next(new Error('Token inválido'));
  }
});
```

O mesmo JWT usado nas rotas HTTP autentica o socket. O `estabelecimentoId` extraído do token é anexado ao socket (`socket.data`) para uso posterior.

No cliente, o token é passado na conexão:

```javascript
const socket = io('http://localhost:3000', { auth: { token } });
```

## Rooms: isolamento multi-tenant no tempo real

Socket.IO tem o conceito de **salas (rooms)**. Quando um painel conecta, ele entra na sala do seu estabelecimento:

```typescript
io.on('connection', (socket) => {
  const { estabelecimentoId } = socket.data;
  socket.join(estabelecimentoId); // entra na sala do tenant
});
```

Quando um pedido é criado, o evento é emitido **só para a sala daquele estabelecimento**:

```typescript
io.to(estabelecimentoId).emit('pedido:novo', pedido);
```

Resultado: a cozinha da galeteria recebe os pedidos da galeteria, e não os da pizzaria. O isolamento multi-tenant que existe no banco (filtro por `estabelecimentoId`) se estende ao tempo real (salas por `estabelecimentoId`).

## Onde o evento é disparado

A emissão acontece no webhook, logo após o pedido ser criado:

```typescript
const pedido = await prisma.pedido.create({
  data: { /* ... */ },
  include: { itens: true },
});

getIO().to(estabelecimentoId).emit('pedido:novo', pedido);
```

Como o `getIO()` recupera o singleton, o webhook consegue emitir sem precisar receber a instância por parâmetro.

## O ciclo completo de tempo real

```
1. Painel conecta via WebSocket, autentica com JWT, entra na sala do estabelecimento
2. Cliente faz pedido → webhook cria o pedido no banco
3. Webhook emite 'pedido:novo' para a sala do estabelecimento
4. Painel (na sala) recebe o evento
5. Tela atualiza instantaneamente, sem refresh
```

## CORS em desenvolvimento

Durante o desenvolvimento, `cors: { origin: '*' }` permite conexões de qualquer origem (útil para testar com um arquivo HTML local). Em produção, deve-se restringir ao domínio do painel para evitar conexões não autorizadas.

## Próximos tópicos

- 10 — Frontend React (painel do dono e tela da cozinha consumindo o Socket.IO)
- 11 — Integração com Claude API real
- 12 — Integração com WhatsApp via Evolution API
- 13 — Integração com Mercado Pago (PIX)
- 14 — Deploy em Azure com Terraform