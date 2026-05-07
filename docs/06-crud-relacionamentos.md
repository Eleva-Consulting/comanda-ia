# 06 — CRUD completo, relacionamentos e queries avançadas

Este documento consolida o que foi aprendido sobre operações CRUD completas, uso de `include` para trazer dados relacionados e queries avançadas com `groupBy`.

## CRUD: o padrão fundamental

CRUD é a sigla das 4 operações básicas de qualquer sistema com banco de dados. Cada uma corresponde a um método HTTP em APIs REST.

| Operação | Método HTTP | Prisma | Status code de sucesso |
|---|---|---|---|
| **C**reate | POST | `prisma.modelo.create()` | 201 Created |
| **R**ead | GET | `prisma.modelo.findMany()` / `findUnique()` | 200 OK |
| **U**pdate | PATCH (parcial) ou PUT (total) | `prisma.modelo.update()` | 200 OK |
| **D**elete | DELETE | `prisma.modelo.delete()` | 204 No Content |

### PATCH vs PUT

- **PATCH:** atualização parcial. Manda só o que quer mudar.
- **PUT:** substitui tudo. Manda o objeto completo.

Em SaaS modernos, 90% das atualizações são PATCH.

### Status 204 No Content

Para DELETE bem-sucedido, a convenção é retornar 204 (sem corpo de resposta) em vez de 200. Significa "deu certo, não tenho nada a te devolver".

## Validação de enum com TypeBox

Quando um campo só pode ter valores específicos (ex: status de um pedido), usa-se `Type.Union` com `Type.Literal`:

```typescript
const AtualizarPedidoSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});
```

Qualquer valor fora dessa lista é rejeitado automaticamente com 400 Bad Request.

## Tratamento de erros do Prisma

`prisma.modelo.update()` e `prisma.modelo.delete()` lançam exceção quando o registro não existe. Captura-se com try/catch:

```typescript
try {
  const pedido = await prisma.pedido.update({
    where: { id },
    data: { status: 'pronto' },
  });
  return pedido;
} catch (erro) {
  return reply.status(404).send({ erro: 'Pedido não encontrado' });
}
```

Sem o try/catch, o erro vira 500 Internal Server Error — pior experiência para o cliente da API.

## include: trazendo relações

Sem `include`, queries retornam só os dados da tabela principal. As foreign keys aparecem (ex: `estabelecimentoId`), mas não os dados relacionados.

```typescript
// Sem include
const pedidos = await prisma.pedido.findMany();
// Retorna: [{ id, clienteNome, estabelecimentoId, ... }]
```

Com `include`, o Prisma faz JOIN automaticamente:

```typescript
const pedidos = await prisma.pedido.findMany({
  include: {
    estabelecimento: true,
  },
});
// Retorna: [{ id, clienteNome, estabelecimentoId, estabelecimento: { id, nome, ... }, ... }]
```

### include com configuração

`include` pode ter sub-opções como `orderBy`, `take`, `where`:

```typescript
prisma.estabelecimento.findUnique({
  where: { id },
  include: {
    pedidos: {
      orderBy: { criadoEm: 'desc' },
      take: 10,
      where: { status: 'recebido' },
    },
  },
});
```

Essa query traz o estabelecimento + os 10 pedidos mais recentes com status "recebido".

## Vantagens do include

- Reduz round-trips de rede (1 chamada em vez de 2-3)
- Melhor performance no frontend
- Código mais limpo (sem orquestração de chamadas)

## Queries avançadas: groupBy

Para estatísticas e agregações, o Prisma oferece `groupBy`:

```typescript
const estatisticas = await prisma.pedido.groupBy({
  by: ['status'],
  where: { estabelecimentoId: id },
  _count: { id: true },
});
```

Isso é equivalente a:

```sql
SELECT status, COUNT(*) FROM pedidos
WHERE "estabelecimentoId" = '...'
GROUP BY status;
```

Retorna algo como:

```json
[
  { "status": "recebido", "_count": { "id": 1 } },
  { "status": "em_preparo", "_count": { "id": 1 } }
]
```

### Outras agregações disponíveis

| Função | O que faz |
|---|---|
| `_count` | Conta registros |
| `_sum` | Soma valores numéricos |
| `_avg` | Calcula média |
| `_min` / `_max` | Menor / maior valor |

Exemplo de soma de receita por status:

```typescript
const receita = await prisma.pedido.groupBy({
  by: ['status'],
  _sum: { total: true },
});
```

## reduce: somando arrays no JavaScript

`reduce` é uma função nativa do JavaScript que reduz um array a um único valor. Útil para somar resultados de `groupBy`:

```typescript
const totalPedidos = estatisticas.reduce(
  (soma, item) => soma + item._count.id,
  0
);
```

Lê-se: "começando com 0, soma `item._count.id` para cada item do array".

## Padrão dashboard endpoint

Em SaaS, é comum ter um endpoint específico para a tela inicial do cliente. Ele agrega dados de várias fontes em uma única resposta:

```
GET /estabelecimentos/:id/dashboard
```

Retorna:
- Dados do estabelecimento
- Cardápio completo
- Pedidos recentes (limitados)
- Estatísticas agregadas

Vantagens:
- Performance: 1 chamada em vez de 4-5
- Lógica de agregação no backend (mais rápido)
- Frontend simples (apenas exibe)

## URLs hierárquicas

Para recursos que pertencem a outros, usa-se URL hierárquica:

```
GET /estabelecimentos/:id/dashboard
GET /cardapio/:estabelecimentoId
```

Em vez de:

```
GET /dashboard?estabelecimentoId=:id  (menos legível)
```

A hierarquia deixa claro que "esse dashboard pertence a esse estabelecimento".

## Próximos tópicos

- 07 — Autenticação JWT e multi-tenant
- 08 — Variáveis de ambiente e configuração avançada
- 09 — Validação de UUID em parâmetros
- 10 — Migrations adicionais e evolução do schema