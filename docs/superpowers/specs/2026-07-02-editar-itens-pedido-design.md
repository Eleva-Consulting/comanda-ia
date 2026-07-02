# Editar itens de um pedido já criado

## Problema

Hoje, se o cliente não quer mais um item do pedido, a única opção é cancelar
o pedido inteiro. O dono/operador precisa poder ajustar os itens de um
pedido existente sem descartá-lo.

## Escopo

- **Quando**: qualquer status antes de `entregue` ou `cancelado`.
- **O quê**: adicionar item novo, aumentar/diminuir quantidade de item
  existente, remover item — sempre com pelo menos 1 item restando no pedido.
  Se remover o último item, a ação é bloqueada (o caminho correto é cancelar
  o pedido, botão que já existe).
- **Quem**: DONO ou OPERADOR com a permissão `cozinha`.
- **Fora de escopo (por agora)**: editar observação de item existente, aviso
  automático ao cliente via WhatsApp quando o pedido é editado.

## Backend

Três rotas novas em `src/routes/pedidos.ts`, todas com
`onRequest: [autenticar, temPermissao('cozinha')]`, escopadas por
`estabelecimentoId`, bloqueadas se `pedido.status` for `entregue` ou
`cancelado` (retorna 422).

- `POST /pedidos/:id/itens` — body `{ itemCardapioId, quantidade, observacao? }`.
  Valida que o item pertence ao estabelecimento e está disponível, busca o
  preço atual do cardápio, cria o `ItemPedido` com esse snapshot, recalcula
  `pedido.total`.
- `PATCH /pedidos/:id/itens/:itemPedidoId` — body `{ quantidade }`. Atualiza
  só a quantidade da linha, mantém o `precoUnit` já gravado (não repuxa preço
  atual do cardápio — evita que editar um item mude o preço dos outros).
  Recalcula `pedido.total`.
- `DELETE /pedidos/:id/itens/:itemPedidoId` — remove a linha. Bloqueado
  (422) se for o único item restante do pedido. Recalcula `pedido.total`.

Todas emitem `pedido:atualizado` via socket (`getIO().to(estabelecimentoId)`)
e retornam o pedido atualizado com `itens` e `total`.

## Frontend

Em `Cozinha.tsx`, novo ícone de lápis no card do pedido (ao lado do de
impressão), abre um modal com:

- Lista dos itens atuais, cada um com stepper +/-. No "-" quando a
  quantidade é 1, remove a linha (chama DELETE). Nos demais casos, chama
  PATCH com a nova quantidade.
- Seção "Adicionar item" reaproveitando a lista de cardápio disponível já
  usada no modal de "Novo Pedido" — ao clicar, chama POST.
- Cada ação aplica na hora (chamada de API imediata), sem botão "salvar"
  separado — o modal reflete a resposta da API a cada clique.
- Total exibido é sempre o retornado pela API (nunca calculado no cliente).

## Fora de escopo / decisões conscientes

- Sem notificação automática ao cliente na edição (só existe hoje para
  mudança de status).
- Sem edição de observação em itens existentes nesta primeira versão.
- Preço de itens não tocados nunca muda durante uma edição — só o item
  novo/alterado é reprecificado.
