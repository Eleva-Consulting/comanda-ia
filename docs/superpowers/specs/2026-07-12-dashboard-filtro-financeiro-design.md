# Dashboard com filtro de data + Tela financeira — Design

## Contexto

O Dashboard hoje (`frontend/src/pages/Dashboard.tsx`, servido por
`GET /meu-estabelecimento/dashboard` em `src/routes/estabelecimentos.ts:118-239`) mostra um
"Faturamento total" que na verdade é a soma de **todo** pedido já feito desde sempre (nenhum
filtro de data em `prisma.pedido.aggregate` — `estabelecimentos.ts:146-150`), o que confunde o
dono quando ele quer saber "quanto vendi hoje". O gráfico de vendas é fixo nos últimos 30 dias
(`estabelecimentos.ts:152-164`), sem opção de escolher outro período, e não existe nenhuma lista
ou destaque de "quais dias venderam mais". Também não existe nenhuma tela mostrando quanto do
faturamento veio de cada forma de pagamento (Pix, dinheiro, cartão) — só dá pra ver a forma de
pagamento pedido por pedido no Histórico, sem nenhum total agregado.

Esse pacote resolve os dois problemas juntos, já que ambos são sobre visibilidade histórica/
financeira no Dashboard: adiciona um filtro de período reutilizável (Dashboard e a nova tela
financeira usam o mesmo filtro), corrige o "faturamento" pra respeitar esse período (com "Hoje"
como padrão), adiciona uma lista dos dias que mais venderam, e cria uma tela financeira nova com a
quebra por forma de pagamento.

**Fora de escopo (decisão do usuário):** receita do módulo de Mesas (fechamento de conta via
`Conta`/`Pagamento`) não entra nesse pacote — só `Pedido` (delivery/balcão/link público), como já é
hoje. Pode ser uma ampliação futura.

## Correção técnica encontrada durante o brainstorm (não é feature nova, é bug pré-existente)

O agrupamento de vendas por dia hoje usa `p.criadoEm.toISOString().slice(0, 10)`
(`estabelecimentos.ts:168`) — isso agrupa pelo **dia em UTC**, não pelo dia no horário de Brasília
(UTC-3). Um pedido feito às 21h30 (horário de Brasília) pode já estar em UTC no dia seguinte
(00h30 UTC), sendo contado no dia errado no gráfico/relatório. Como este pacote reconstrói essa
lógica de qualquer forma (pra adicionar o filtro de período), a correção entra junto: todo
agrupamento por dia passa a usar o calendário de `America/Sao_Paulo`, não UTC bruto.

## Arquitetura

Um filtro de período reutilizável (`inicio`/`fim`, datas no formato `YYYY-MM-DD`, sem hora) é
calculado no frontend a partir dos botões de atalho (usando a data local do navegador — a
premissa é que quem opera o painel está fisicamente no Brasil) e enviado como query params pras
duas rotas. O backend interpreta essas datas como dias-calendário em `America/Sao_Paulo` e monta o
intervalo real em UTC pra consultar o Postgres — nunca confia em horário de servidor/UTC bruto pra
decidir "que dia é esse pedido".

## Componentes

### 1. `src/utils/periodoRelatorio.ts` (novo)

Funções puras, testáveis isoladamente (Vitest, seguindo o padrão já usado em `src/utils/*.test.ts`):

- `resolverIntervaloPeriodo(inicioStr?: string, fimStr?: string): { inicioUTC: Date; fimUTC: Date; inicioLabel: string; fimLabel: string }`
  — se `inicioStr`/`fimStr` não vierem, usa o dia de hoje (calendário `America/Sao_Paulo`) como os
  dois. Converte pro intervalo UTC real que cobre esse(s) dia(s) inteiro(s) em Brasília (início às
  00:00:00 do primeiro dia, fim ao último instante do último dia). `inicioLabel`/`fimLabel` são as
  strings `YYYY-MM-DD` resolvidas, devolvidas pro frontend saber o que foi aplicado quando nada é
  passado.
- `diaSaoPaulo(data: Date): string` — devolve `YYYY-MM-DD` do dia correspondente em
  `America/Sao_Paulo` (substitui o `toISOString().slice(0,10)` problemático).

### 2. `src/routes/estabelecimentos.ts` — `/meu-estabelecimento/dashboard` (modificado)

- Passa a ler `request.query` como `{ inicio?: string; fim?: string }` e usar
  `resolverIntervaloPeriodo`.
- `estatisticas.emAndamento` (novo campo, calculado no backend): contagem de pedidos com status
  `recebido`/`em_preparo`/`pronto`, **sem filtro de período** (é sempre "agora", reflete o estado
  atual da cozinha — um pedido de ontem ainda em preparo continua contando hoje). Move a lógica que
  hoje vive no frontend (`Dashboard.tsx:147-149`, `.filter(...).reduce(...)` sobre `porStatus`) pro
  backend; `porStatus` deixa de ser exposto (o frontend não precisa mais dele).
- `estatisticas.totalPedidos`, `estatisticas.faturamentoTotal`, `estatisticas.ticketMedio`: passam
  a ser calculados **dentro do período resolvido** (antes eram sobre todo o histórico).
- `estatisticas.vendasPorDia`: passa a cobrir o período resolvido (antes era fixo em 30 dias),
  agrupado via `diaSaoPaulo`, não mais `toISOString()`.
- `estatisticas.topDias` (novo campo): os 5 dias com maior `faturamento` dentro do período
  resolvido, ordenados do maior pro menor — `Array<{ data: string; faturamento: number }>`. Se o
  período tiver menos de 5 dias com vendas, devolve só os que existem.
- Resposta ganha `periodo: { inicio: string; fim: string }` (os valores resolvidos, sempre
  presentes mesmo quando a requisição não passou nenhum).

### 3. `src/routes/financeiro.ts` (novo)

`GET /meu-estabelecimento/financeiro`, protegida por `onRequest: [autenticar, apenasDono]` (mesmo
padrão de `src/routes/auditoria.ts:17` — só o DONO acessa, sem permissão configurável pra
operador, dado que é informação financeira sensível).

- Query params: mesmos `inicio`/`fim` de `/dashboard`, resolvidos com a mesma função.
- Agrega `Pedido` (excluindo `cancelado`) por `formaPagamento` no período — `prisma.pedido.groupBy`
  com `_count` e `_sum.total`.
- Resposta:
  ```
  {
    periodo: { inicio: string; fim: string },
    porFormaPagamento: Array<{ formaPagamento: string; quantidade: number; total: number }>,
    totalGeral: number,
  }
  ```

Registrar `financeiroRoutes` em `src/server.ts`, junto das outras rotas autenticadas.

### 4. `frontend/src/components/FiltroPeriodo.tsx` (novo)

Componente reutilizável: botões "Hoje" / "7 dias" / "30 dias" / "Este mês" + um par de campos de
data pra período customizado. Calcula `inicio`/`fim` (strings `YYYY-MM-DD`, data local do
navegador) e devolve via callback (`onMudarPeriodo(inicio, fim)`). Usado tanto no Dashboard quanto
no Financeiro — mesmo componente, sem duplicar lógica de cálculo de datas.

### 5. `frontend/src/pages/Dashboard.tsx` (modificado)

- Usa `FiltroPeriodo`; refaz a chamada à API toda vez que o período muda, passando `inicio`/`fim`.
- KPI "Faturamento total" vira "Faturamento" (label reflete o período selecionado, ex: "Faturamento
  — Hoje" / "Faturamento — 01/07 a 12/07").
- KPI "Total de pedidos" e "Ticket médio" continuam existindo, agora refletindo o período.
- KPI "Em andamento" usa `estatisticas.emAndamento` direto da API (não computa mais localmente).
- Gráfico de barras: título dinâmico refletindo o período (não mais fixo "últimos 30 dias").
- Novo card "Dias que mais venderam": lista os 5 itens de `estatisticas.topDias` (data formatada +
  valor).

### 6. `frontend/src/pages/Financeiro.tsx` (novo)

- Usa `FiltroPeriodo` (mesmo componente do Dashboard).
- Mostra os totais de `porFormaPagamento` (um card ou linha por forma: Pix, Dinheiro, Cartão de
  Crédito, Cartão de Débito — quantidade de pedidos + total R$ de cada) e o `totalGeral` do
  período em destaque.

### 7. `frontend/src/components/Layout.tsx` e `frontend/src/App.tsx` (modificados)

- Novo link "Financeiro" no menu, visível só quando o usuário logado é DONO (mesmo padrão
  condicional já usado pro link "Auditoria").
- Nova rota `/financeiro`, envolvida em `<RotaDono>` (mesmo padrão de `/auditoria` em
  `App.tsx:51`).

## Testes

- `src/utils/periodoRelatorio.test.ts` (novo): testa `resolverIntervaloPeriodo` (com e sem
  parâmetros — confirma que o padrão é "hoje" em `America/Sao_Paulo`, não UTC) e `diaSaoPaulo`
  (confirma que um horário perto da meia-noite UTC é atribuído ao dia correto em Brasília).
- Verificação manual (sem infraestrutura de teste de componente React neste projeto, mesmo padrão
  já usado pras últimas features): abrir o Dashboard e o Financeiro no navegador, trocar entre os
  presets e um intervalo customizado, e confirmar que os números mudam de acordo; confirmar que
  "Em andamento" não muda ao trocar o período; confirmar que operador (não-DONO) não vê o link
  "Financeiro" no menu e recebe 403 se tentar acessar a rota direto.

## Fora de escopo

- Receita do módulo de Mesas (`Conta`/`Pagamento`) — só `Pedido` nesse pacote.
- Permissão configurável de operador pra ver o Financeiro — é DONO-only, como a Auditoria.
- Exportação de relatórios (CSV etc.) — já é um item separado na lista de features futuras do
  projeto, não faz parte deste pacote.
