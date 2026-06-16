# Operações da Cozinha — Design Spec
Data: 2026-06-16

## Escopo

Seis features operacionais que fecham o ciclo de vida de um pedido no painel:

1. Toggle aceitando pedidos (aberto/pausado)
2. Fluxo de status interativo na Cozinha
3. Entrada manual de pedido
4. Histórico de pedidos com filtro por data
5. Impressão de comanda (layout 80mm, browser print)
6. Super Admin: excluir estabelecimento

---

## Feature 1: Toggle Aceitando Pedidos

### Objetivo
DONO ou OPERADOR pode pausar o recebimento de pedidos sem precisar tirar o cardápio do ar.

### Schema
Adicionar em `Estabelecimento`:
```prisma
aceitandoPedidos Boolean @default(true)
```

### Backend

**`PATCH /estabelecimentos/meu-estabelecimento`** (já existe) — passa a aceitar `aceitandoPedidos` no body.

**`POST /publico/:slug/pedidos`** (já existe em `src/routes/publico.ts`) — antes de criar o pedido, verifica `estabelecimento.aceitandoPedidos`. Se `false`, retorna:
```json
HTTP 503
{ "erro": "Estabelecimento temporariamente fechado" }
```

### Frontend

**`Cozinha.tsx`:** cabeçalho ganha toggle "Aceitando pedidos" / "Pausado" (visível para DONO e OPERADOR). Ao alternar, faz `PATCH /estabelecimentos/meu-estabelecimento` com `{ aceitandoPedidos: true/false }`. Estado inicial carregado junto com os pedidos.

**`CardapioPublico.tsx`:** ao carregar o cardápio (`GET /publico/:slug`), o endpoint passa a retornar `aceitandoPedidos`. Se `false`, exibe banner laranja "Estamos temporariamente fechados — volte em breve" e desabilita o botão de finalizar pedido.

---

## Feature 2: Fluxo de Status Interativo na Cozinha

### Objetivo
Operadores avançam o status de cada pedido individualmente na tela da Cozinha.

### Schema
Adicionar valor ao enum `StatusPedido`:
```prisma
enum StatusPedido {
  recebido
  em_preparo
  pronto
  a_caminho   // novo
  entregue
  cancelado
}
```

Fluxo válido de transições:
```
recebido → em_preparo → pronto → a_caminho → entregue
                                           ↗
                                    pronto → entregue  (salto direto, para presencial)
qualquer estado → cancelado
```

### Backend

**`PATCH /pedidos/:id/status`** — novo endpoint em `src/routes/pedidos.ts`:
- Autenticado (`autenticar`)
- Body: `{ status: StatusPedido }`
- Valida que a transição é permitida (lista de transições válidas no servidor)
- Atualiza no banco
- Emite `pedido:atualizado` via Socket.IO com o pedido completo
- Retorna o pedido atualizado

Transições permitidas (servidor valida):
```
recebido    → [em_preparo, cancelado]
em_preparo  → [pronto, cancelado]
pronto      → [a_caminho, entregue, cancelado]
a_caminho   → [entregue, cancelado]
entregue    → []
cancelado   → []
```

### Frontend

**`Cozinha.tsx`:**

Cada card de pedido exibe:
- Badge colorido por status:
  - `recebido` → laranja
  - `em_preparo` → amarelo
  - `pronto` → azul
  - `a_caminho` → roxo
  - `entregue` → verde
  - `cancelado` → vermelho
- Botão "Avançar" → próximo status na sequência (texto dinâmico: "Iniciar preparo", "Marcar como pronto", "Saiu para entrega", "Marcar como entregue")
- Botão "Cancelar" → confirma com modal antes de executar
- Botão "Imprimir" → abre comanda (Feature 5)

Pedidos com status `entregue` e `cancelado` somem do painel ativo e ficam no histórico (Feature 4).

Socket.IO: listener `pedido:atualizado` atualiza o status do card em tempo real para todos os usuários conectados.

---

## Feature 3: Entrada Manual de Pedido

### Objetivo
DONO ou OPERADOR registra pedido de cliente presencial ou por telefone diretamente no painel.

### Backend

**`POST /pedidos/manual`** — novo endpoint em `src/routes/pedidos.ts`:
- Autenticado (`autenticar`) — DONO e OPERADOR podem usar
- Body:
```json
{
  "clienteNome": "string (min 2)",
  "clienteFone": "string (min 8)",
  "itens": [
    { "itemCardapioId": "uuid", "quantidade": 1, "observacao": "string opcional" }
  ]
}
```
- Busca cada item no banco (valida que pertence ao mesmo estabelecimento)
- Calcula total: soma de `preco * quantidade` por item
- Cria `Pedido` com status `recebido`
- Cria `ItemPedido` para cada item (nomeItem, precoUnit do banco, quantidade, observacao)
- Emite `pedido:novo` via Socket.IO igual ao fluxo público
- Retorna 201 com o pedido criado

### Schema
Adicionar em `ItemPedido`:
```prisma
observacao String?
```

### Frontend

**`Cozinha.tsx`:** botão "Novo Pedido" no cabeçalho (ao lado do toggle de status).

Abre modal com:
- Campo nome do cliente (obrigatório)
- Campo telefone do cliente (obrigatório)
- Lista de itens do cardápio agrupados por categoria — cada item tem botão "+" para adicionar, campo de quantidade editável e campo de observação
- Resumo lateral: itens selecionados com subtotal e total em tempo real
- Botão "Registrar pedido" → POST /pedidos/manual → fecha modal, pedido aparece na cozinha via Socket.IO

Itens indisponíveis (`disponivel: false`) não aparecem na lista.

---

## Feature 4: Histórico de Pedidos

### Objetivo
DONO visualiza pedidos passados com filtro por data e totais do período.

### Backend

**`GET /pedidos`** — novo endpoint em `src/routes/pedidos.ts`:
- Autenticado, apenas DONO (`apenasDono`)
- Query params: `de` (YYYY-MM-DD), `ate` (YYYY-MM-DD), `status` (opcional)
- Retorna:
```json
{
  "pedidos": [...],
  "total": "1250.00",
  "quantidade": 42
}
```
- Cada pedido inclui: id, clienteNome, clienteFone, status, total, criadoEm, itens[]

### Frontend

**Nova página `Historico.tsx`:**
- Acessível via `/historico`, link no nav (DONO apenas, usando `RotaDono`)
- Seletor de período: data início + data fim (padrão = hoje)
- Card de resumo: total de pedidos e receita do período
- Lista de pedidos: hora, cliente, status badge, total
- Clique expande itens detalhados (nome, quantidade, preço unitário, observação)

**`App.tsx`:** adicionar rota `/historico` com `RotaDono`.

**`Layout.tsx`:** adicionar link "Histórico" no nav, visível apenas para DONO.

---

## Feature 5: Impressão de Comanda

### Objetivo
Imprimir comanda formatada para impressora térmica 80mm a partir de qualquer pedido na Cozinha.

### Frontend

**Nova página `ImprimirComanda.tsx`** — rota `/imprimir/:pedidoId`:
- Ao carregar: busca pedido via `GET /pedidos/:id`, chama `window.print()` automaticamente
- Layout otimizado para 80mm com `@media print`

Conteúdo da comanda:
```
[NOME DO ESTABELECIMENTO]
--------------------------------
Pedido #[últimos 6 chars do ID]
[DD/MM/YYYY HH:MM]
--------------------------------
Cliente: [nome]
Fone:    [telefone]
--------------------------------
2x Frango Assado          R$30,00
   obs: sem sal
1x Refrigerante           R$ 8,00
--------------------------------
TOTAL                     R$38,00
================================
```

CSS: `body { font-family: monospace; width: 80mm; }`, `@media print { @page { width: 80mm; margin: 4mm; } }`

**`Cozinha.tsx`:** botão "Imprimir" em cada card abre `/imprimir/:pedidoId` em nova aba.

**`App.tsx`:** adicionar rota `/imprimir/:pedidoId` com `RotaProtegida` — a nova aba compartilha o mesmo `localStorage` do painel (mesmo domínio), então o token é lido normalmente. Backend: `GET /pedidos/:id` já é autenticado.

---

## Feature 6: Super Admin — Excluir Estabelecimento

### Objetivo
Super Admin remove permanentemente um estabelecimento e todos os seus dados.

### Backend

**`DELETE /admin/estabelecimentos/:id`** — novo endpoint em `src/routes/admin.ts`:
- Protegido por `autenticar + apenasAdmin`
- Verifica que o estabelecimento existe (404 se não encontrar)
- `prisma.estabelecimento.delete({ where: { id } })` — cascata já configurada no schema para usuários, itens, categorias, pedidos e conversas
- Retorna 204

### Frontend

**`AdminEstabelecimentos.tsx`:** cada card ganha botão "Excluir" (ícone lixeira, vermelho).

Clique abre modal de confirmação:
```
Excluir "Nome do Estabelecimento"?
Esta ação é irreversível. Todos os dados, pedidos e usuários
vinculados serão removidos permanentemente.
[Cancelar]  [Excluir]
```

Confirma → DELETE /admin/estabelecimentos/:id → remove da lista sem reload.

---

## Migrations necessárias

1. Adicionar `aceitandoPedidos Boolean @default(true)` em `Estabelecimento`
2. Adicionar `a_caminho` ao enum `StatusPedido`
3. Adicionar `observacao String?` em `ItemPedido`

Todas em uma única migration: `npx prisma migrate dev --name operacoes_cozinha`

---

## Ordem de implementação

1. Migration + Prisma generate
2. Backend: PATCH /pedidos/:id/status + validação de transições
3. Backend: GET /pedidos (histórico)
4. Backend: POST /pedidos/manual
5. Backend: aceitandoPedidos no PATCH meu-estabelecimento + check no publico
6. Backend: DELETE /admin/estabelecimentos/:id
7. Frontend: Cozinha — status interativo (badges + botões avançar/cancelar)
8. Frontend: Cozinha — toggle aceitandoPedidos + modal novo pedido manual
9. Frontend: CardapioPublico — banner fechado
10. Frontend: ImprimirComanda — página + botão na Cozinha
11. Frontend: Historico — página + nav + rota
12. Frontend: Admin — botão excluir estabelecimento
