# Cozinha unificada — um Kanban de produção pra qualquer origem de pedido

**Data:** 2026-07-16
**Status:** visão aprovada pelo usuário em brainstorm; Fase 0 aprovada pra implementação
imediata. Fases 1-3 exigem plano próprio (writing-plans) antes de qualquer código.

## Problema (3 camadas, levantadas pelo usuário em uso real)

1. **Duas telas de produção que não se conversam.** `/cozinha` mostra só `Pedido`
   (balcão/delivery/link público); `/producao` mostra só `ItemComanda` (módulo mesas).
   Restaurante com mesas: a Cozinha fica morta no nav (nenhum pedido chega lá). Galeteria
   (só balcão/delivery): usa a Cozinha mas nunca ganha o Kanban (colunas, cronômetro,
   setores, avanço em lote).
2. **Risco operacional latente.** Cliente com módulo mesas que ativar o bot/link público
   terá pedidos caindo numa tela que ninguém olha. Confirmado no brainstorm: **os canais
   vão conviver** no mesmo estabelecimento.
3. **Dashboard míope.** "Pedidos (hoje)" conta só `Pedido` — restaurante de mesas vê
   faturamento (desde 2026-07-16) mas zero "pedidos", parecendo bug.

## Visão aprovada

**Uma única tela de produção, chamada "Cozinha"** (decisão explícita do usuário: o nome
"Cozinha" fica; "Produção" é que desaparece no final). Nela, lado a lado no mesmo Kanban
(Recebido → Em preparo → Pronto):

- **Card de rodada** (mesas) — como a Produção mostra hoje: agrupado por `rodadaId`,
  avanço em lote respeitando setor, impressão automática da rodada.
- **Card de pedido** (balcão/delivery/link/bot) — o `Pedido` inteiro como um grupo (análogo
  à rodada), com os dados que a Cozinha mostra hoje (cliente, telefone, tipo de entrega,
  bairro/endereço, troco, forma de pagamento, status do Pix). Avançar o card usa a rota de
  status de `Pedido` já existente — **as notificações de WhatsApp pro cliente continuam
  funcionando sem mudança**.

Pós-pronto continua diferente por natureza (não é defeito, é o domínio): item de mesa →
`entregue` (garçom); delivery → `saiu_para_entrega` → `entregue`; retirada → `retirado`;
balcão → `entregue`.

### Requisito inegociável: paridade total com a Cozinha atual

Decisão explícita do usuário ("manter tudo o que a cozinha usa hoje"). Inventário e destino:

| Função da Cozinha hoje | Destino na tela unificada |
|---|---|
| Pausar/reabrir loja (pílula) | Header |
| Toggle impressão automática de balcão | Header |
| "Novo pedido" manual (permissão `pedido_manual`) | Header |
| Dados do pedido no card (cliente, telefone, entrega, bairro, troco, pagamento, Pix) | Card do pedido no Kanban |
| Avançar status com WhatsApp automático | Avanço do card (mesma rota `PATCH /pedidos/:id/status`) |
| Editar itens do pedido (adicionar/ajustar/remover) | Ação no card do pedido |
| Cancelar pedido | Ação no card do pedido |
| Impressão manual (botão) e automática (delivery/retirada sempre; balcão conforme toggle) | Padrão da tela (que já imprime rodada desde 2026-07-16) |
| Beep + toast de pedido novo | Mantidos |
| Busca por nome nos modais de itens | Mantida |
| Reabrir pedido concluído/cancelado | Continua no Histórico (já mora lá) |

### Permissões e módulos

- **Acesso à tela unificada: `cozinha` OU `producao`** — zero migração manual de operador
  (operadores da galeteria têm `cozinha`; os de produção do restaurante têm `producao`).
  A separação criada em 2026-07-16 continua valendo: **garçom com só `mesas` não vê a
  tela** (nem recebe disparo de impressão).
- **A tela deixa de exigir o módulo `mesas`.** Ela é a tela base de qualquer
  estabelecimento; o módulo mesas controla só o que aparece nela (rodadas, setores,
  cronômetro por `tempoAlvoMinutos` de setor). Sem o módulo, o Kanban mostra só pedidos.
- Setores: `Pedido`/`ItemPedido` não têm setor — cards de pedido aparecem pra todo mundo
  (sala ampla), como os itens sem setor já fazem. Vínculo item→setor continua sendo a
  limitação conhecida de sempre (sem UI no Cardápio).

## Rollout em fases (sem big bang)

- **Fase 0 — Dashboard honesto (quick win, aprovado pra já):** KPI "Pedidos (hoje)" passa a
  contar também as **rodadas enviadas** no dia (o análogo de "pedido chegou" no mundo mesas
  — `RodadaComanda.criadaEm` no dia, via relação `comanda.conta.estabelecimentoId`, sem
  campo novo). Card mostra o total combinado com a quebra "delivery/balcão X · mesas Y",
  no mesmo padrão do card de faturamento. Ticket médio continua só sobre `Pedido`
  (documentado). Payload aditivo: `estatisticas.totalRodadas`.
- **Fase 1 — Pedidos no Kanban (aditivo):** cards de `Pedido` aparecem na tela de Kanban
  junto das rodadas. A Cozinha atual continua existindo e funcionando igual — ninguém é
  forçado a migrar. Backend: rotas/eventos de produção passam a servir também `ItemPedido`
  ou o `Pedido` agrupado (desenhar no plano da fase).
- **Fase 2 — Paridade e liberação:** as ações da Cozinha migram pro Kanban (tabela acima),
  a tela deixa de exigir módulo mesas, acesso vira `cozinha` OU `producao`.
- **Fase 3 — Consolidação de nome e nav:** a tela unificada assume o nome/rota "Cozinha"
  (`/cozinha`), "Produção" sai do nav (redirect de `/producao` por compatibilidade), a
  Cozinha antiga é removida. Galeteria treinada no Kanban antes deste passo.

Cada fase 1-3 passa pelo processo completo (writing-plans → subagent/inline → revisão →
verificação ao vivo) antes de ir pro main.

## Fora de escopo (deliberado)

- UI de vínculo item→setor no Cardápio (limitação conhecida, iniciativa separada).
- Feed unificado no Histórico/relatórios (Histórico já cobre `Pedido`; mesas têm Auditoria
  e Financeiro — unificação de relatórios é outra conversa).
- Mudança em regras de notificação WhatsApp (ficam exatamente como são).
