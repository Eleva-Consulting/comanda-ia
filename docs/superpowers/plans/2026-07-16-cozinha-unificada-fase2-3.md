# Cozinha unificada — Fases 2+3: paridade total e consolidação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Kanban unificado assume o nome e a rota `/cozinha` com paridade total com a Cozinha antiga (novo pedido manual, pausar loja, toggle de impressão, editar/cancelar/imprimir pedido), acessível com `cozinha` OU `producao`, sem exigir módulo mesas. A Cozinha antiga (lista) e a rota `/producao` deixam de existir (redirect).

**Architecture:** O conteúdo do Kanban (`Producao.tsx`) vira o novo `pages/Cozinha.tsx`. Os modais e controles da Cozinha antiga são extraídos em componentes (`components/cozinha/`), portados sem mudança de lógica. Backend: só alargamento de guardas (nenhuma rota nova). Beep/toast já são globais do Layout — nada a portar.

**Spec:** `docs/superpowers/specs/2026-07-16-cozinha-unificada-design.md` (Fases 2 e 3)

## Global Constraints

- TypeScript strict; imutabilidade; mobile-first; sem `console.log` novo; commits conventional.
- Lógica dos modais/ações portada **sem mudança de comportamento** (mesmos fetches, mesmas validações).
- Nenhuma mudança de schema. Verificação: `npx vitest run && npx tsc --noEmit` + `cd frontend && npx tsc -b`.

### Task 1: Backend — guardas alargadas pra `producao`

**Files:** `src/routes/estabelecimentos.ts`, `src/routes/pedidos.ts`, `src/routes/producao.ts`, `src/routes/rodadas.ts`, `src/routes/contas.ts`

| Rota | Guarda nova |
|---|---|
| `PATCH /meu-estabelecimento/aceitando-pedidos` | `temPermissao('cozinha', 'configuracoes', 'producao')` |
| `PATCH /meu-estabelecimento/imprimir-automatico-balcao` | `temPermissao('cozinha', 'configuracoes', 'producao')` |
| `DELETE /pedidos/:id` · `POST /pedidos/:id/itens` · `PATCH /pedidos/:id/itens/:itemPedidoId` · `DELETE /pedidos/:id/itens/:itemPedidoId` | `temPermissao('cozinha', 'producao')` |
| `GET /producao/itens` · `PATCH /rodadas/:id/avancar` | `temPermissao('cozinha', 'producao')` (mantém `moduloAtivo('mesas')`) |
| `GET /rodadas/:id` · `PATCH /itens-comanda/:id/status` | `temPermissao('mesas', 'producao', 'cozinha')` |

- [ ] Alterar, `npx vitest run && npx tsc --noEmit`, commit `feat: permissões cozinha/producao equivalentes nas rotas da tela unificada`

### Task 2: Frontend — infra (tipos, RotaPermissao múltipla, controle extraído)

**Files:**
- Create: `frontend/src/components/cozinha/tipos.ts` — `Pedido`, `ItemPedido`, `ItemCardapio`, `Bairro`, `OpcaoAcompanhamento`, labels de forma/entrega (portados da Cozinha antiga, shapes idênticos).
- Create: `frontend/src/components/cozinha/ControleAceitandoPedidos.tsx` — componente movido da Cozinha antiga, sem mudança.
- Modify: `frontend/src/components/RotaPermissao.tsx` — `permissao: Permissao | Permissao[]` (passa se tiver QUALQUER uma; DONO sempre).
- Modify: `frontend/src/lib/permissoes.ts` — `ROTA_POR_PERMISSAO`: `producao` passa a apontar pra `/cozinha`.

- [ ] `npx tsc -b`, commit `feat: infra da Cozinha unificada (tipos, rota com múltiplas permissões)`

### Task 3: Frontend — modais portados

**Files:**
- Create: `frontend/src/components/cozinha/ModalNovoPedido.tsx` — port integral do modal de pedido manual (cliente, tipo entrega, bairros/endereço, forma pagamento/troco, busca de itens, acompanhamento obrigatório, total com taxa). Props: `{ aberto, token, onFechar }`. Busca cardápio/bairros internamente ao abrir. Sucesso → `onFechar()` (o socket entrega o pedido novo).
- Create: `frontend/src/components/cozinha/ModalEditarItensPedido.tsx` — port integral do modal de editar itens (quantidade ±, remover, adicionar com acompanhamento, busca). Props: `{ pedido, token, onFechar, onPedidoAtualizado }`.

- [ ] `npx tsc -b`, commit `feat: modais de novo pedido e edição de itens extraídos em componentes`

### Task 4: Frontend — card de pedido completo + tela unificada

**Files:**
- Create: `frontend/src/components/cozinha/CardPedidoKanban.tsx` — evolução do `CardPedidoProducao` com paridade do card antigo: badges (tipo entrega, forma pagamento, troco), endereço/bairro (entrega), total, telefone implícito nos dados, ações **editar** (abre modal), **imprimir** (window.open) e **cancelar** (window.confirm), além do botão de próxima ação. Delete: `frontend/src/components/producao/CardPedidoProducao.tsx`.
- Rewrite: `frontend/src/pages/Cozinha.tsx` — a tela unificada (base: `Producao.tsx` atual):
  - Título "Cozinha"; header via `Layout headerExtra`: **Novo pedido** (só com `pedido_manual`/DONO), `ControleAceitandoPedidos` (usa `conectado`/`erro` do socket amplo que a tela já tem), toggle de impressão de balcão.
  - **Sem exigir módulo mesas**: o bloco "Módulo de mesas não habilitado" sai; `GET /producao/itens` só é chamado com o módulo ativo (sem módulo, o Kanban mostra só pedidos).
  - Modais montados na raiz; estado `edicaoItensPedido` sincronizado com `pedido:atualizado` do socket.
  - Empty state "Aguardando pedidos..." quando não há card nenhum.
- Delete: `frontend/src/pages/Producao.tsx`.
- Modify: `frontend/src/App.tsx` — `/cozinha` → `<RotaPermissao permissao={['cozinha','producao']}>`; `/producao` → `<Navigate to="/cozinha" replace />`.
- Modify: `frontend/src/components/Layout.tsx` — item "Produção" removido do nav; "Cozinha" com `show: isDono || temPermissao('cozinha') || temPermissao('producao')`.

- [ ] `npx tsc -b` + `npm run build`, commit `feat: Kanban unificado assume a tela Cozinha com paridade total (Fases 2+3)`

### Task 5: Verificação ao vivo + docs + push

- [ ] Navegador (galeteria, toggle impressão OFF durante automação): tela `/cozinha` com Kanban; `/producao` redireciona; novo pedido manual completo pelo modal (retirada + dinheiro + troco); editar itens de um pedido (adicionar/quantidade/remover); cancelar pedido; pausar/reabrir loja; toggle impressão; com módulo mesas ativo, rodadas convivem no Kanban; **desabilitar módulo mesas temporariamente** e conferir a tela só com pedidos (galeteria-mode) — reabilitar depois.
- [ ] Permissões via API: operador só `producao` usa toggles/edição; operador só `cozinha` vê Kanban com rodadas (módulo ativo) e avança rodada; operador só `mesas` sem acesso.
- [ ] CLAUDE.md log + memória; limpar dados de teste; `git pull --rebase && git push`.
