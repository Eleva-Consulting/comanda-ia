# Pedido em rascunho por mesa — anota tudo, revisa a mesa inteira, envia de uma vez

**Data:** 2026-07-17
**Status:** aprovado pelo usuário (design validado em conversa)

## Problema

Hoje, na tela de Mesas, o garçom monta o carrinho de **uma comanda**, revisa e confirma —
e **aquela comanda já vai pra cozinha na hora** (feature de revisão de `9115356`, que
revisa por-comanda-por-carrinho). Não dá pra anotar o pedido de toda a mesa antes de mandar.

O que o usuário quer (cenário real): mesa com Carlos, Vinicius e Luiz. O garçom anota o
pedido de cada um (cada um na sua comanda), mais uma Coca na comanda "Geral" (dividida),
**sem nada ir pra cozinha ainda**. Revisa a **mesa inteira** com os clientes, pode **voltar
e adicionar** algo, e só então **manda tudo de uma vez**. Ou seja: um estado de rascunho que
acumula entre todas as comandas da mesa, com revisão no nível da mesa e um único envio final.

Decisão do usuário: o rascunho **persiste no servidor** — sobrevive a recarregar a página,
travar o celular, ou outro garçom abrir a mesa em outro aparelho.

## Abordagem: área de rascunho separada (staging)

Em vez de marcar `ItemComanda` como "não enviado" (obrigaria a filtrar rascunho em Produção,
Caixa, Dashboard, cancelamento — muita superfície de risco), criar uma **tabela de rascunho
à parte**. Itens não-enviados vivem nela; só viram `ItemComanda` de verdade (e vão pra
cozinha) no envio final. **Produção, Caixa e Dashboard não enxergam rascunho e não mudam em
nada** — zero risco pro que já está em produção. O envio final reaproveita a lógica de
criação de rodada que já existe (`POST /comandas/:id/rodadas`), extraída num helper
compartilhado.

## Modelo de dados

Novo model `RascunhoItemComanda` (migration nova):

```
model RascunhoItemComanda {
  id             String   @id @default(uuid())
  comandaId      String
  comanda        Comanda  @relation(fields: [comandaId], references: [id], onDelete: Cascade)
  itemCardapioId String
  quantidade     Int
  observacao     String?
  acompanhamento String?
  criadoPorUsuarioId String?
  criadoEm       DateTime @default(now())
  @@map("rascunho_itens_comanda")
}
```

Guarda o mínimo (referência ao item + escolhas). Nome/preço/setor são resolvidos do cardápio
no envio (igual hoje) e, pra exibição na revisão, resolvidos na leitura — assim o preço está
sempre atual e o rascunho não carrega snapshot que pode ficar desatualizado.

## Backend

Extrair o núcleo de `POST /comandas/:id/rodadas` (validar disponibilidade, resolver
acompanhamento, descartar indisponíveis, criar rodada+itens, emitir `item-comanda:novo` e
`producao:item-novo`) num helper `criarRodadaDeItens(tx, comandaId, itensInput, ...)`.

Rotas novas (todas `temPermissao('mesas')` + `moduloAtivo('mesas')`):

- `POST /comandas/:id/rascunho` — adiciona itens ao rascunho da comanda. Body:
  `{ itens: [{ itemCardapioId, quantidade, observacao?, acompanhamento? }] }`. Só insere
  linhas de rascunho (sem checar disponibilidade aqui — isso é no envio). Emite
  `conta:atualizada` (pra outros aparelhos na mesma mesa refetcharem). Retorna os itens de
  rascunho criados com `nomeItem`/`precoUnit` resolvidos pra exibição.
- `PATCH /rascunho/:id` — ajusta `quantidade` de um item de rascunho. Emite `conta:atualizada`.
- `DELETE /rascunho/:id` — remove um item de rascunho. Emite `conta:atualizada`.
- `POST /contas/:id/rascunho/enviar` — **o envio final**. Numa transação: pra cada comanda
  da conta que tem itens de rascunho, chama `criarRodadaDeItens` (uma rodada por comanda),
  deleta as linhas de rascunho enviadas. Fora da transação, emite os eventos de socket dos
  itens criados (a tela de Produção imprime ao receber `producao:item-novo`, como já faz
  desde a mudança de impressão-na-Produção — Mesas não imprime). Retorna `rodadaIds` e
  `itensDescartados` (itens que ficaram indisponíveis entre anotar e enviar, com o nome).

Leitura: estender a serialização de conta (`GET /contas/:id`, `serializarConta`) pra incluir,
por comanda, um array `rascunho` (itens de rascunho com nome/preço resolvidos). Mesas usa isso
pra mostrar rascunho inline por comanda.

**Rota antiga `POST /comandas/:id/rodadas` é removida** — só a Mesas.tsx a chamava, e o novo
fluxo de rascunho a substitui. O núcleo dela vira o helper `criarRodadaDeItens`, usado pelo
envio do rascunho.

## Frontend (Mesas.tsx)

- Modal "+ Item": ao adicionar itens, chama `POST /comandas/:id/rascunho` (vai pro rascunho,
  **não** pra cozinha) e fecha. Some o passo de "Revisar pedido → Confirmar e enviar"
  por-comanda de `9115356` — a revisão sobe pro nível da mesa.
- Cada comanda na tela mostra os itens **já enviados** (como hoje, com status de produção) e
  os itens **em rascunho** separados, marcados "não enviado", com ajustar quantidade / remover.
- Botão no nível da **mesa**: "Revisar e enviar pedido (N em rascunho)", visível quando há
  rascunho em qualquer comanda da mesa.
- Tela de **revisão da mesa inteira**: todos os itens de rascunho agrupados por comanda,
  subtotais e total, com remover/ajustar e "← Voltar e adicionar". Botão final "Confirmar e
  enviar tudo pra cozinha" → `POST /contas/:id/rascunho/enviar`. Se voltarem itens
  descartados (indisponíveis), mostra o aviso com os nomes.
- Tempo real: Mesas já refetcha a conta em `conta:atualizada` — como as rotas de rascunho
  emitem esse evento, outro aparelho na mesma mesa vê o rascunho atualizar sozinho.

## O que NÃO muda (isolamento)

- **Produção/Cozinha (Kanban):** só recebe itens no envio (viram `ItemComanda` + rodada e
  disparam `producao:item-novo`, exatamente como hoje). Rascunho é invisível pra ela.
- **Caixa/conta:** rascunho não é `ItemComanda`, então **não entra na conta/total** até ser
  enviado — o que casa com "confirmar com o cliente antes de pedir".
- **Dashboard:** rodadas só são criadas no envio; a contagem de "pedidos (mesas)" não conta
  rascunho.
- **Impressão:** continua na tela de Produção (dispara em `producao:item-novo`), não em Mesas.

## Regras / casos de borda

- Enviar sem nenhum item de rascunho → 400 (nada a enviar).
- Item que ficou indisponível/excluído entre anotar e enviar → descartado no envio, com o
  nome no aviso (reusa `itensDescartados`).
- Acompanhamento obrigatório: exigido ao adicionar (modal já força escolher, como hoje) e
  revalidado no envio por segurança (descartado com mensagem se faltar).
- `opcoesAcompanhamento` continua normalizado (fix `45b27ba`) — sem risco de tela preta.

## Testes

- Backend (Vitest): `criarRodadaDeItens` (cria rodada, descarta indisponível, aplica
  acompanhamento); envio do rascunho (uma rodada por comanda, limpa o rascunho, retorna
  descartados); guardas de permissão.
- Frontend: verificação ao vivo no navegador — anotar itens em 2+ comandas sem enviar,
  revisar a mesa inteira, adicionar mais, enviar tudo, confirmar que só então aparecem na
  Produção e entram na conta.

## Fora de escopo

- Modo claro/escuro do sistema (pedido separado do usuário, pra fazer **depois** desta feature).
- Rateio de item entre comandas (`ItemComandaRateio`) — segue fase futura.
