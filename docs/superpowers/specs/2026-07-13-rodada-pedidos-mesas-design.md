# Rodadas de pedido na comanda (Mesas) — Spec de Design

## Contexto e problema

Hoje, na tela Mesas, cada item que o garçom adiciona a uma comanda é enviado ao backend
imediatamente, um por um (`POST /comandas/:id/itens`, uma chamada por clique). Isso cria três
problemas reais, relatados pelo usuário em uso ao vivo:

1. **Não existe impressão de comanda pro módulo de Mesas.** Delivery/balcão já imprimem
   automaticamente (`ImprimirComanda.tsx`), mas mesas nunca imprimiram nada — a cozinha depende
   só da tela.
2. **Na tela de Produção (Kanban), cada item vira um card separado.** Se o garçom lança 3 itens
   de uma vez pra Mesa 5, aparecem 3 cards soltos no Kanban, sem noção de que pertencem ao mesmo
   "pedido" daquele momento.
3. **Não há como avançar vários itens de uma vez.** Cada avanço de status (recebido → em preparo
   → pronto → entregue) é por item, individualmente.

## Objetivo

Agrupar os itens lançados juntos numa comanda em uma **Rodada** — um lote único que:
- imprime como uma comanda só, automaticamente, ao ser enviada;
- aparece como um card só no Kanban de Produção (por setor);
- pode ser avançada de status inteira, com um clique, além do avanço individual por item que já
  existe hoje.

## Fora de escopo (YAGNI)

- Reimpressão da rodada (pode ser pedido futuro se for necessário — não faz parte agora).
- Editar itens de uma rodada já enviada. Se o garçom quiser lançar mais itens na mesma comanda
  depois, isso gera uma **nova** rodada (nova chamada a `POST /comandas/:id/rodadas`) — não junta
  com a anterior.
- Mudar o comportamento da nav mobile/lista da tela Mesas (que já mostra os itens agrupados por
  comanda, isso não muda).
- Qualquer mudança no fluxo de pedidos de delivery/balcão (`Pedido`/`ItemPedido`) — esta spec é
  só sobre o módulo de Mesas (`Comanda`/`ItemComanda`).

## Decisões já validadas com o usuário

1. **Carrinho, não janela de tempo.** O agrupamento acontece porque o garçom monta uma seleção
   de itens no modal e só manda tudo de uma vez ao clicar "Enviar pedido" — não é um agrupamento
   automático por proximidade de horário. Isso muda o fluxo atual de "clica e já manda item por
   item" pra um fluxo de carrinho, parecido com o checkout do cardápio público que já existe.
2. **Impressão automática ao enviar**, sem exigir um clique extra — mesmo padrão já usado no
   balcão/delivery.
3. **Isolamento por setor mantido.** Se uma rodada tiver itens de setores diferentes (ex: um
   drink do Bar + um prato da Cozinha), cada tela de Produção filtrada por setor só vê e avança
   os itens do próprio setor dentro da rodada — nunca os itens de outro setor. Um DONO (sem
   setor fixo, "vê tudo") vê a rodada inteira como um card só, com todos os itens juntos.

## Modelo de dados

Novo model `RodadaComanda`, agrupando um lote de `ItemComanda` enviados juntos:

```prisma
model RodadaComanda {
  id       String   @id @default(uuid())
  criadaEm DateTime @default(now())

  comandaId String
  comanda   Comanda @relation(fields: [comandaId], references: [id], onDelete: Cascade)

  criadoPorUsuarioId String?
  criadoPor          Usuario? @relation(fields: [criadoPorUsuarioId], references: [id])

  itens ItemComanda[]

  @@map("rodadas_comanda")
}
```

`ItemComanda` ganha:

```prisma
  rodadaId String?
  rodada   RodadaComanda? @relation(fields: [rodadaId], references: [id], onDelete: SetNull)
```

**Por que nullable:** itens já existentes no banco (criados antes desta migration, pelo fluxo
antigo de "um item por clique") ficam com `rodadaId: null` — sem backfill necessário. No Kanban,
um item sem rodada continua sendo tratado como uma rodada de um item só (comportamento visual
idêntico ao que existe hoje pra quem já tem itens em produção no momento do deploy).

A partir desta mudança, **todo item novo nasce dentro de uma rodada** — o fluxo de "adicionar um
item avulso" deixa de existir; mesmo mandar um item só passa pelo carrinho (seleciona 1, clica
Enviar).

## API

### `POST /comandas/:id/rodadas` (substitui `POST /comandas/:id/itens` como forma de adicionar item)

Body:
```json
{
  "itens": [
    { "itemCardapioId": "...", "quantidade": 2, "observacao": "sem cebola", "acompanhamento": "Arroz" },
    { "itemCardapioId": "...", "quantidade": 1 }
  ]
}
```

- Cria `RodadaComanda` + N `ItemComanda` numa transação (`prisma.$transaction`).
- Cada item resolve preço/acompanhamento igual ao endpoint atual (reaproveita
  `resolverAcompanhamento`).
- **Item indisponível no meio do caminho:** se um `itemCardapioId` não existir mais ou tiver
  ficado indisponível entre a montagem do carrinho e o envio (concorrência — outro operador
  desativou o item nesse intervalo), esse item específico é descartado da rodada (não quebra a
  request inteira); a resposta inclui `itensDescartados: [{ itemCardapioId, motivo }]` pro
  frontend avisar o garçom. Se **todos** os itens forem descartados, retorna 400 (rodada vazia
  não é criada).
- Emite (mesmo padrão de hoje): `item-comanda:novo` por item (mantém compatibilidade com quem já
  escuta esse evento) **e** um novo `rodada:nova` com o payload da rodada inteira (pra Mesas
  atualizar de uma vez, sem precisar somar eventos individuais).
- Emite pra Produção: `producao:rodada-nova` nas salas relevantes — usa a mesma lógica de
  `salaProducao()` já existente, mas por rodada: agrupa os itens da rodada por `setorId` e emite
  um payload por sala (cada sala recebe só os itens do seu setor; a sala ampla do estabelecimento
  recebe a rodada inteira, pra cobrir DONO/operador sem setor fixo).
- Dispara impressão automática no frontend, análogo ao balcão.

### `PATCH /rodadas/:id/avancar`

Sem body. Em vez de receber um status-alvo único (que seria ambíguo se os itens da rodada
estiverem em estágios diferentes — ver abaixo), avança **cada item elegível para o seu próprio
próximo estágio** (recebido→em_preparo, em_preparo→pronto, pronto→entregue), usando a mesma
`transicaoProducaoValida` já usada no avanço individual.

- Elegível = visível ao usuário: se `request.user.setorId` estiver preenchido, só os itens
  daquele setor dentro da rodada avançam; se não (DONO/operador sem setor fixo), todos os itens
  da rodada avançam.
- Itens cancelados, ou já em `entregue` (sem próximo estágio), são ignorados silenciosamente —
  não travam o avanço dos demais.
- **Por que sem status-alvo explícito:** como o avanço individual por item continua existindo em
  paralelo (ver abaixo), os itens de uma mesma rodada podem ficar em estágios diferentes entre um
  clique em "Avançar rodada" e outro (ex: alguém adiantou só um item manualmente). Pedir um
  status-alvo único no body seria ambíguo nesse cenário — "avançar cada item para o seu próprio
  próximo estágio" é a única semântica que funciona em qualquer combinação de estágios.
- Continua existindo `PATCH /itens-comanda/:id/status` (avanço individual, com status-alvo
  explícito, sem mudanças) — as duas rotas coexistem.

### Impressão

Nova tela `frontend/src/pages/ImprimirRodada.tsx` (mesmo padrão do `ImprimirComanda.tsx`
existente: busca os dados, `useEffect` com `setTimeout(() => window.print(), 300)`), alimentada
por uma rota `GET /rodadas/:id` que devolve mesa + comanda + itens da rodada. Rota nova no
`App.tsx`: `/imprimir/rodada/:rodadaId`. O disparo automático (`imprimirComandaAutomaticamente`
adaptada) roda no frontend, no momento em que `POST /comandas/:id/rodadas` responde com sucesso —
mesmo mecanismo de iframe oculto já usado pelo balcão.

## Frontend

### `Mesas.tsx` — modal de adicionar item vira carrinho

- O modal de "Adicionar item" ganha uma lista de seleção: clicar num item do cardápio
  adiciona/incrementa no carrinho local (estado só do componente, não vai pro backend ainda).
  Cada linha do carrinho mostra quantidade (+/-), observação e acompanhamento (reaproveita a UI
  de acompanhamento que já existe).
- Botão **"Enviar pedido"** no rodapé do modal, com o total de itens selecionados. Só ao clicar
  esse botão é que `POST /comandas/:id/rodadas` é chamado.
- Ao enviar com sucesso: fecha o modal, dispara a impressão automática, mostra aviso se algum
  item foi descartado (`itensDescartados`).

### `Producao.tsx` — Kanban agrupado por rodada

- Cada coluna passa a agrupar os itens visíveis (já filtrados por setor, como hoje) por
  `rodadaId` — itens com o mesmo `rodadaId` viram um card só, listando cada item com sua própria
  linha (quantidade, nome, observação, acompanhamento), preservando o status individual de cada
  item visualmente (ex: badge por item se estiverem em estágios diferentes dentro da mesma
  rodada).
- Um item com `rodadaId: null` (legado, pré-migração) continua sendo seu próprio card, como hoje.
- Novo botão **"Avançar rodada"** no card, chamando `PATCH /rodadas/:id/avancar` (sem status-alvo
  — ver seção API). O avanço individual por item continua disponível dentro do card, sem remoção.
- Cancelamento de item continua sendo por item (sem mudança) — cancelar um item de dentro de uma
  rodada não afeta os demais.

## Tratamento de erros

- Item indisponível no meio do carrinho → rodada criada só com os itens válidos + aviso (ver
  API acima). Nunca trava o envio inteiro por causa de 1 item.
- Falha de impressão (sem impressora conectada/configurada) → não bloqueia o envio do pedido; a
  tentativa de impressão simplesmente não produz papel, igual já acontece hoje no balcão (sem
  showstopper, sem retry automático).
- Erro de rede ao enviar a rodada → mesmo padrão de erro já usado nas outras ações desta tela
  (mensagem de erro inline, sem fechar o modal, permitindo tentar de novo).

## Testes

- **Unitário:** `PATCH /rodadas/:id/avancar` aplicando `transicaoProducaoValida` item a item
  numa rodada com itens em estágios mistos (cada um avança pro seu próprio próximo estágio,
  itens cancelados/já entregues são ignorados).
- **Integração:** `POST /comandas/:id/rodadas` grava 1 `RodadaComanda` + N `ItemComanda` numa
  transação; item indisponível é descartado sem quebrar a rodada; `PATCH /rodadas/:id/avancar`
  avança só os itens do setor do usuário quando ele tem setor fixo, e todos quando não tem.
- **Manual/E2E (verificação ao vivo, não Playwright):** carrinho no modal de Mesas, impressão
  automática disparando, agrupamento visual no Kanban de Produção, avanço em lote respeitando
  isolamento por setor — mesmo processo de verificação manual já usado nas fases anteriores do
  Módulo de Mesas (útil especialmente pro isolamento por setor, que historicamente só foi
  validado com dois operadores de teste em abas separadas).

## Migration

Uma migration: cria a tabela `rodadas_comanda` e adiciona a coluna `rodadaId` (nullable) em
`itens_comanda`. Sem backfill de dados existentes (ver "Modelo de dados" acima).
