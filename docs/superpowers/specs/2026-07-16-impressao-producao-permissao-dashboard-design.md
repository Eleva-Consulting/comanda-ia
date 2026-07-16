# Impressão na Produção + permissão `producao` + Dashboard com vendas de Mesas

**Data:** 2026-07-16
**Status:** aprovado pelo usuário (design validado em conversa)

## Contexto e problemas

Três problemas reais levantados pelo usuário no mesmo request:

1. **Impressão dispara no lugar errado.** Ao enviar uma rodada pela tela de Mesas, a impressão
   automática acontece no aparelho do garçom (`Mesas.tsx` injeta iframe de
   `/imprimir/rodada/:id` logo após o `POST /comandas/:id/rodadas`). O garçom não deve imprimir
   nada — a impressão tem que acontecer em quem está com a tela de Produção aberta (mesmo padrão
   da Cozinha, que imprime ao receber pedido novo via socket).

2. **Garçom vê Produção sem precisar.** A tela `/producao` e suas rotas de backend exigem a
   permissão `mesas` — a mesma do garçom. Não há como dar acesso a Mesas sem dar acesso a
   Produção. O usuário quer permissões separadas: garçom só com `mesas`, produção só com a
   nova permissão `producao`.

3. **Dashboard ignora venda do módulo de Mesas.** Os KPIs do Dashboard somam só a tabela
   `Pedido` (delivery/balcão/link público) — decisão deliberada de 2026-07-13, registrada no
   CLAUDE.md ("módulo de Mesas fica de fora por agora"). Venda que passa por Mesas/Caixa nunca
   aparece no faturamento do dia.

## Mudança 1 — Impressão automática da rodada move de Mesas pra Produção

- **Remover de `Mesas.tsx`:** a função `imprimirRodadaAutomaticamente` e sua chamada após o
  envio da rodada. Sem botão manual de impressão pra garçom (decisão explícita do usuário:
  "o garçom não vai imprimir nada, só ver").
- **Adicionar em `Producao.tsx`:** ao receber o evento de socket `producao:item-novo` com
  `item.rodadaId` preenchido, disparar a impressão via iframe oculto de
  `/imprimir/rodada/:rodadaId` (mesmo helper/padrão já usado em `Cozinha.tsx`).
- **Deduplicação por `rodadaId`:** a rodada chega como N eventos (um por item). Um
  `useRef<Set<string>>` guarda os `rodadaId` já impressos na sessão da aba; imprime só no
  primeiro evento de cada rodada.
- **Sem impressão pra item sem `rodadaId`:** itens antigos (pré-rodadas) não disparam nada.
- A página `/imprimir/rodada/:rodadaId` (`ImprimirRodada.tsx`) continua existindo sem mudança
  visual; só a origem do disparo muda.

### Comportamentos herdados/aceitos (documentados, não bugs)

- **Cada aba aberta de Produção imprime** — mesmo comportamento da Cozinha hoje. Se duas
  pessoas estiverem com Produção aberta, saem duas impressões.
- **Se um dia houver telas de Produção filtradas por setor**, cada tela imprimiria a rodada
  inteira (a página de impressão busca a rodada completa). Irrelevante hoje: não existe UI pra
  vincular item→setor, então `setorId` é sempre `null` e toda tela vê tudo.

## Mudança 2 — Permissão `producao` separada de `mesas`

### Backend

- Adicionar `'producao'` a `PERMISSOES_VALIDAS` em `src/routes/operadores.ts`.
- Novo helper `temAlgumaPermissao(...permissoes)` em `src/plugins/auth.ts` (passa se o usuário
  tiver **qualquer uma** das permissões listadas; DONO passa sempre, como em `temPermissao`).
- Re-gatear rotas:

| Rota | Guarda hoje | Guarda nova | Motivo |
|---|---|---|---|
| `GET /producao/itens` | `mesas` | `producao` | Tela de Produção |
| `PATCH /rodadas/:id/avancar` | `mesas` | `producao` | Avanço em lote é ação da Produção |
| `POST /comandas/:id/rodadas` | `mesas` | `mesas` (sem mudança) | Garçom lança pedido |
| `PATCH /itens-comanda/:id/status` | `mesas` | `mesas` OU `producao` | Cancelar item existe nas duas telas desde a Fase 1f |
| `GET /rodadas/:id` | `mesas` | `mesas` OU `producao` | Alimenta a página de impressão (agora disparada pela Produção); leitura inofensiva pro garçom |

- Todas continuam com `moduloAtivo('mesas')` — a permissão muda, o módulo contratado não.

### Frontend

- `lib/permissoes.ts`: adicionar `'producao'` ao tipo `Permissao`, à lista `PERMISSOES`
  (label: "Produção — acompanhar e avançar itens em preparo") e a `rotaPorPermissao`
  (`{ permissao: 'producao', rota: '/producao' }`) — operador só com `producao` cai em
  `/producao` após o login.
- `App.tsx`: rota `/producao` passa de `permissao="mesas"` pra `permissao="producao"`.
- `Layout.tsx`: link "Produção" no nav passa a depender de `producao` (variável própria
  `mostrarProducao`, separada de `mostrarMesas`); DONO continua vendo tudo.
- Tela de Operadores: checkbox novo aparece sozinho (renderiza a partir de `PERMISSOES`).

### Migração / rollout

- **Sem migration de schema** — `Usuario.permissoes` já é `String[]`; o valor novo só entra na
  validação.
- **Sem backfill** (decisão do usuário): operadores que hoje usam Produção com a permissão
  `mesas` perdem o acesso no deploy até o DONO marcar `producao` neles na tela de Operadores.
  É o comportamento desejado — o objetivo é justamente restringir os garçons.
- Operador editado precisa deslogar/logar pra pegar o JWT novo (comportamento que já existe
  pra qualquer edição de permissão, não é novidade desta mudança).

### Efeito combinado com a Mudança 1

Garçom com só `mesas` não carrega a tela de Produção (guard de rota + link escondido) e
portanto **nunca recebe disparo de impressão** — requisito explícito do usuário.

## Mudança 3 — Dashboard inclui venda do módulo de Mesas

- **Critério de contagem (decisão do usuário):** `Pagamento` com `status: 'confirmado'` e
  `criadoEm` dentro do dia — dinheiro que de fato entrou no Caixa. Mesa aberta ontem e paga
  hoje conta hoje. Estorno muda o `status`, então sai da soma automaticamente.
- **Backend (`GET /meu-estabelecimento/dashboard`):** nova agregação
  `prisma.pagamento.aggregate({ _sum: { valor } })` com o mesmo recorte de calendário
  `America/Sao_Paulo` já usado (`resolverIntervaloPeriodo`). Payload de `estatisticas` ganha
  campos aditivos `faturamentoPedidos` e `faturamentoMesas`; `faturamentoTotal` passa a ser a
  soma dos dois (o nome existente é mantido — mudança aditiva, front antigo não quebra).
- **Frontend (`Dashboard.tsx`):** card de faturamento mostra o total combinado com a quebra
  "delivery/balcão R$ X · mesas R$ Y".
- **"Pedidos hoje" e "Ticket médio" continuam só sobre `Pedido`** — pagamento de mesa não é
  1 pedido = 1 pagamento; misturar distorceria o ticket médio.
- **Fora do escopo (deliberado):** tela Financeiro continua só com `Pedido`; KPI próprio de
  mesas (ex: contas fechadas no dia) fica pra uma rodada futura, se pedido.

## Testes

- **Backend (Vitest):** guards das rotas re-gateadas (operador só `mesas` recebe 403 em
  `GET /producao/itens` e `PATCH /rodadas/:id/avancar`; operador só `producao` recebe 403 em
  `POST /comandas/:id/rodadas`; ambos passam em `PATCH /itens-comanda/:id/status` e
  `GET /rodadas/:id`); validação de `'producao'` em operadores; dashboard somando `Pagamento`
  confirmado do dia e ignorando estornado/fora do dia.
- **Frontend:** verificação manual ao vivo (padrão do projeto pra telas): enviar rodada pela
  tela de Mesas e confirmar que a impressão dispara na aba de Produção (e não na de Mesas),
  uma vez só por rodada; operador só `mesas` sem link/acesso a Produção; card do Dashboard
  com a quebra.
