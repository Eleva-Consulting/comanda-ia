# Cozinha unificada — Fase 1: cards de pedido no Kanban — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedidos (balcão/delivery/link) aparecem como cards no Kanban da tela de Produção, junto das rodadas — com avanço de status (mantendo WhatsApp automático) e impressão automática. Aditivo: a Cozinha atual continua intacta.

**Architecture:** Zero rota nova. Backend: duas guardas alargadas pra aceitar `producao` (`GET /pedidos`, `PATCH /pedidos/:id`). Frontend: a lógica de status de pedido da Cozinha (mapas de próxima ação por tipo de entrega) é extraída pra `lib/statusPedido.ts` e compartilhada; `Producao.tsx` ganha uma segunda fonte de dados (pedidos ativos) e um segundo socket (sala ampla, eventos `pedido:novo`/`pedido:atualizado` — necessário porque a conexão de produção de operador com setor fixo entra só na sala do setor). Card de pedido extraído em componente próprio.

**Tech Stack:** existente (Fastify/React). Sem libs novas.

**Spec:** `docs/superpowers/specs/2026-07-16-cozinha-unificada-design.md` (Fase 1)

## Global Constraints

- TypeScript strict; imutabilidade; mobile-first; sem `console.log` novo; commits conventional.
- **Cozinha atual intacta em comportamento** — a única mudança nela é importar de `lib/statusPedido.ts` o que hoje é local (refactor sem mudança de lógica).
- Nenhuma mudança de schema/payload de evento (mudanças aditivas apenas).
- Verificação por task: `npx vitest run && npx tsc --noEmit` (backend) / `cd frontend && npx tsc -b`.

## Decisões de design (fixadas aqui pra não re-decidir)

- **Mapeamento de colunas** (pedido tem 5 status ativos, o Kanban tem 3 colunas):
  `recebido` + `pagamento_confirmado` → coluna Recebido; `em_preparo` → Em preparo;
  `pronto` + `a_caminho` → Pronto. O badge do card mostra o status real ("Aguard. pgto",
  "A caminho"...) quando difere do nome da coluna.
- **Avanço** usa `obterProximaAcao(status, tipoEntrega)` — exatamente a máquina da Cozinha
  (delivery passa por "Saiu para entrega"; retirada pula direto pra "Marcar retirado") →
  `PATCH /pedidos/:id` com o próximo status → WhatsApp do cliente continua automático.
- **Impressão automática de pedido** na Produção: mesma regra da Cozinha
  (`origem !== 'balcao' || imprimirAutomaticoBalcao`), iframe `/imprimir/:pedidoId`, dedupe
  por `pedido.id` (ref). **Comportamento aceito e documentado:** Cozinha e Produção abertas
  ao mesmo tempo imprimem as duas (igual a duas abas da Cozinha hoje).
- Pedidos aparecem pra **todos** os operadores da tela (inclusive com setor fixo) — pedido
  não tem setor; eventos chegam pela conexão ampla (`useSocket`), não pela de produção.
- **Fora da Fase 1** (fica pra Fase 2): editar/cancelar pedido, novo pedido manual, pausar
  loja, toggle de impressão, beep/toast, detalhes completos no card (endereço/troco/Pix),
  liberar a tela sem módulo mesas.

---

### Task 1: Backend — guardas de `GET /pedidos` e `PATCH /pedidos/:id` aceitam `producao`

**Files:**
- Modify: `src/routes/pedidos.ts:139` e `src/routes/pedidos.ts:268`

- [ ] Linha 139: `temPermissao('cozinha', 'historico')` → `temPermissao('cozinha', 'historico', 'producao')`
- [ ] Linha 268: `temPermissao('cozinha')` → `temPermissao('cozinha', 'producao')`
- [ ] `npx vitest run && npx tsc --noEmit`
- [ ] Commit: `feat: operador de produção pode listar e avançar pedidos (Fase 1 Cozinha unificada)`

### Task 2: Frontend — extrair `lib/statusPedido.ts` da Cozinha (refactor puro)

**Files:**
- Create: `frontend/src/lib/statusPedido.ts`
- Modify: `frontend/src/pages/Cozinha.tsx` (remove as definições locais, importa do novo módulo)

**Interfaces (Produces):** `type StatusPedido`, `statusConfig` (labels/badges), `labelStatus(status, tipoEntrega)`, `type AcaoPedido` (sem os ícones — ícones ficam na UI de cada tela; o módulo exporta só `proximoStatus`/`label` por status e tipo), `obterProximaAcao(status, tipoEntrega)`, `STATUS_ATIVOS_PEDIDO`.
Obs.: a Cozinha usa ícones (`Icone`) no mapa de ações — na extração, o mapa compartilhado carrega `proximoStatus`/`label`/`corClasse`, e a Cozinha resolve o ícone localmente por `proximoStatus` (mapa `Record<Status, LucideIcon>` local), preservando o visual atual.

- [ ] Extrair; `cd frontend && npx tsc -b`; conferir `git diff` da Cozinha = só troca de origem dos símbolos
- [ ] Commit: `refactor: máquina de status de pedido extraída pra lib compartilhada`

### Task 3: Frontend — cards de pedido no Kanban da Produção

**Files:**
- Create: `frontend/src/components/producao/CardPedidoProducao.tsx`
- Modify: `frontend/src/pages/Producao.tsx`

**Comportamento:**
- Fetch adicional: `GET /pedidos?status=recebido,pagamento_confirmado,em_preparo,pronto,a_caminho&limite=100`.
- Socket adicional via `useSocket(token)` (sala ampla): `pedido:novo` → adiciona + imprime (regra acima); `pedido:atualizado` → atualiza/remove da lista quando sai dos ativos.
- `imprimirAutomaticoBalcao` lido do `GET /meu-estabelecimento` que a tela já faz.
- Card (`CardPedidoProducao`): cliente, `tipoEntregaLabel`, badge do status real, itens (qtd x nome, acompanhamento/observação), tempo desde `criadoEm` (mesmo cronômetro visual, sem cor de alvo — pedido não tem setor/tempoAlvo), botão da próxima ação (`obterProximaAcao`).
- Avançar: `PATCH /pedidos/:id` `{ status: proximoStatus }`, otimista + evento socket confirma.
- Ordenação dentro da coluna: pedidos e rodadas intercalados por horário de criação (mais antigo primeiro, como a produção espera).

- [ ] Implementar; `cd frontend && npx tsc -b`
- [ ] Commit: `feat: pedidos aparecem no Kanban da Produção junto das rodadas (Fase 1)`

### Task 4: Verificação ao vivo + docs + push

- [ ] Galeteria de teste (módulo mesas ativo): com a tela de Produção aberta no navegador e o toggle de impressão de balcão **desligado** (senão o diálogo de impressão trava a automação), criar um pedido de balcão via API → card aparece em tempo real na coluna Recebido; avançar até entregue conferindo os rótulos por tipo de entrega; confirmar que a rodada de mesa continua aparecendo junto; conferir que a Cozinha continua funcionando igual.
- [ ] Operador só com `producao`: consegue ver e avançar pedidos (guard nova); operador só com `mesas`: segue sem acesso.
- [ ] Atualizar Log de mudanças do CLAUDE.md; limpar dados de teste; `git pull --rebase && git push`.
- [ ] Avisar o usuário: teste físico de impressão (pedido de link/delivery imprimindo na Produção; dupla impressão se Cozinha também estiver aberta).
