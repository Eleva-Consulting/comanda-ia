# Taxa de entrega por bairro + endereço no pedido

## Problema

A taxa de entrega hoje é um valor único fixo por estabelecimento. O dono
quer taxas diferentes por bairro, com o cálculo já saindo pronto no total
do pedido — tanto no link público quanto no pedido manual do balcão (que
hoje nem tem campo de endereço). Endereço e tipo de entrega também
precisam aparecer na comanda impressa e no dashboard.

## Modelo de dados

Novo model `Bairro`, escopado por estabelecimento:

```prisma
model Bairro {
  id                String    @id @default(uuid())
  nome              String
  taxaEntrega       Decimal?  @db.Decimal(10, 2) // null = entrega grátis nesse bairro
  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])
  criadoEm          DateTime  @default(now())

  @@unique([estabelecimentoId, nome])
  @@map("bairros")
}
```

`Pedido` ganha dois campos snapshot (mesmo padrão do `ItemPedido`, protege
o histórico contra edição/remoção posterior do bairro):

```prisma
bairroNome  String?
taxaEntrega Decimal? @db.Decimal(10, 2)
```

## Compatibilidade

- **Zero bairros cadastrados** → nada muda: taxa de entrega geral
  (`Estabelecimento.taxaEntrega`) continua sendo usada como hoje, sem
  seletor de bairro em nenhuma tela.
- **≥ 1 bairro cadastrado** → o seletor de bairro passa a ser obrigatório
  em pedidos de entrega (tanto público quanto manual). A taxa geral deixa
  de ser aplicada automaticamente — cada bairro tem a sua (em branco =
  grátis).

## Backend

Novo arquivo `src/routes/bairros.ts`:
- `GET /bairros` — autenticado, qualquer papel do tenant (usado no modal de pedido manual).
- `POST /bairros`, `PATCH /bairros/:id`, `DELETE /bairros/:id` — `temPermissao('configuracoes')`.

`src/routes/publico.ts`:
- `GET /publico/:slug/bairros` — público, sem auth, pro checkout.
- `POST /publico/:slug/pedido` — aceita `bairroId?`. Se `tipoEntrega === 'entrega'` e o estabelecimento tem bairros cadastrados, `bairroId` é obrigatório. Snapshot de `bairroNome`/`taxaEntrega` no pedido, soma no total.

`src/routes/pedidos.ts`:
- `ManualPedidoSchema` ganha `enderecoEntrega?` e `bairroId?` — mesma validação e cálculo do fluxo público.

`src/routes/estabelecimentos.ts` (dashboard): nenhuma mudança de backend —
os pedidos recentes já retornam o registro completo do Prisma
(`tipoEntrega`, `enderecoEntrega`, `bairroNome` inclusos automaticamente).

## Frontend

- **Configurações**: nova seção "Bairros" — listar, criar, editar (nome +
  taxa opcional), excluir.
- **Checkout público** (`CardapioPublico.tsx`): busca bairros do
  estabelecimento; se houver, mostra `<select>` obrigatório ao marcar
  "Entrega", junto do campo de endereço que já existe. Total recalculado
  ao trocar o bairro.
- **Pedido manual** (`Cozinha.tsx`, modal "Novo Pedido"): adiciona campo
  de endereço (não existia) + mesmo seletor de bairro quando aplicável.
- **Card do pedido na Cozinha**: mostra endereço e bairro quando for
  entrega.
- **Comanda impressa** (`ImprimirComanda.tsx`): mostra tipo de entrega
  (🛵 Entrega / 🏪 Retirada) e, se entrega, o endereço completo e o bairro.
- **Histórico**: mostra endereço/bairro no detalhe expandido do pedido.
- **Dashboard** (`Dashboard.tsx`, "Pedidos recentes"): mostra selo de
  tipo de entrega (🛵/🏪) em cada linha.
