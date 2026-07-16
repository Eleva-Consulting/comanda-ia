# Redesenho da tela de Caixa — fluxo guiado "Receber pagamento"

**Data:** 2026-07-16
**Status:** aprovado pelo usuário (brainstorm com visual companion — opção "A, fluxo guiado",
mockup detalhado de 4 telas validado)

## Contexto e problemas

Levantados pelo usuário em uso real do módulo de Mesas:

1. **"Dividir por comanda" tem nome errado** — a ação real é "pagar a comanda inteira", não
   dividir nada. Deve se chamar **"Pagamento por comanda"**.
2. **Clique único registra pagamento** — clicar no nome da comanda (Geral ou qualquer outra)
   registra um pagamento confirmado na hora, sem revisão nem confirmação. É a única ação
   financeira do sistema sem etapa de confirmação (desconto e estorno pedem até senha). O
   mesmo vale pro "Registrar 1 parcela" do dividir igualmente.
3. **Forma de pagamento fica longe da ação** — as pílulas (default "PIX") são escolhidas no
   topo e valem silenciosamente pra qualquer botão abaixo; fácil registrar em Pix o que foi
   pago em dinheiro.

Decisões do brainstorm: o usuário escolheu **repensar a tela inteira** (não só os 2 pontos);
o Caixa é operado **tanto em caixa fixo quanto no celular do garçom na mesa** (mobile-first
que aproveita desktop); "uma pessoa paga tudo" e "cada comanda paga a sua" são **igualmente
comuns** (mesmo destaque). Entre 3 estruturas mockadas (wizard guiado / comanda como unidade
central / tela única + painel de confirmação), o usuário escolheu o **fluxo guiado**.

## Princípio central

**Nenhum pagamento é registrado sem passar pela tela de revisão + confirmação.** O botão de
confirmar diz o valor e a forma ("Confirmar R$ 104,00 em Pix").

## As 4 telas

### ① Tela da conta (substitui o detalhe atual)

- Header: "← Caixa · Mesa N".
- Card de totais: total, desconto (se houver), já pago, **saldo devedor**.
- Um card por comanda, **somente leitura**: nome, valor em aberto e itens (pagos acinzentados
  "· pago", cancelados riscados). Comanda quitada mostra "✓ pago".
- Botão primário **"Receber pagamento"** (só com saldo devedor > 0) — abre a tela ②.
- "Pagamentos registrados" com botão **Estornar** por pagamento (motivo + senha de
  supervisor, como hoje).
- **"Aplicar desconto"** (valor + motivo + senha, como hoje).
- **"Fechar conta"**: desabilitado com saldo pendente. Quando o saldo zera, o card de totais
  ganha destaque verde e o botão vira o primário verde **"Fechar conta e liberar a mesa"**
  (tela ④). Erros do backend (ex.: item ainda em produção — regra de 2026-07-16) aparecem
  embaixo do botão.

### ② "O que está sendo pago?"

Lista de opções, cada uma leva à tela ③:

- **Conta toda · R$ saldo** — paga todos os itens não pagos. Sem desconto na conta, envia
  `itensComandaIds` (mantém o vínculo por item); com desconto > 0, envia `valor:
  saldoDevedor` (pagar por itens ignoraria o desconto e estouraria o saldo).
- **Pagamento por comanda** (nome novo) — uma linha por comanda; com `totalNaoPago > 0` leva
  à ③ com os itens não pagos dela (`itensComandaIds`); **comanda já paga aparece desabilitada
  com "✓ já pago"** (hoje ela some, o que confunde).
- **Escolher itens específicos** — sub-tela com checkboxes dos itens não pagos → ③.
- **Dividir igualmente entre N pessoas** — sub-tela pede N → ③ em modo parcela.
- **Valor livre (parcial)** — sub-tela pede o valor → ③.

### ③ Revisão + forma + confirmação

- Rótulo do que está sendo pago ("Comanda Geral", "Parcela 1 de 4", "Valor livre"...).
- Lista dos itens cobertos (quando o pagamento é por itens) e **total a receber**.
- **Forma de pagamento escolhida aqui** (pílulas Pix / Pix maquininha / Dinheiro / Crédito /
  Débito) — não existe mais seleção global no topo da tela.
- **"Mostrar QR code Pix de R$ X"** — gera o BR Code já com o valor deste pagamento
  (`GET /contas/:id/pix-qrcode?valor=X`); não existe mais campo solto de valor de QR.
- Botão **"Confirmar R$ X em <forma>"** → `POST /contas/:id/pagamentos`. Nada é registrado
  antes dele. Sucesso volta pra tela ① com o resumo atualizado.

**Modo parcela (dividir igualmente):** confirmar a parcela 1 leva direto à ③ da parcela 2
("Parcela 2 de 4"), e assim por diante — cada parcela pode ter forma de pagamento própria.
O valor de cada parcela é recalculado como `saldoAtual / pessoasRestantes` (arredondado a
centavos), então a última parcela fecha o saldo exato. *Corrige um defeito da tela atual: o
"Registrar 1 parcela" de hoje recalcula `saldo/N` a cada clique, então a partir da segunda
parcela o valor sai errado se o operador não diminuir N na mão.*

### ④ Saldo zerado

Mesma tela ①, com o estado visual verde e o fechamento como ação primária (descrito acima).

## Arquitetura (100% frontend)

Nenhuma mudança de backend: todos os fluxos usam rotas existentes (`GET /contas`,
`GET /contas/:id/resumo`, `POST /contas/:id/pagamentos` com `itensComandaIds` ou `valor`,
`POST /contas/:id/desconto`, `PATCH /pagamentos/:id/estornar`, `POST /contas/:id/fechar`,
`GET /contas/:id/pix-qrcode`). Tempo real continua via `conta:atualizada`.

`Caixa.tsx` (647 linhas hoje) é reescrita e dividida por responsabilidade em
`frontend/src/components/caixa/`:

| Arquivo | Responsabilidade |
|---|---|
| `pages/Caixa.tsx` | grade de contas + orquestração da tela da conta (estado, socket, fetch) |
| `components/caixa/tipos.ts` | tipos compartilhados (`ResumoConta`, `ComandaResumo`, `ItemResumo`, `PagamentoResumo`, labels de forma) |
| `components/caixa/ResumoTotais.tsx` | card de totais (com estado verde de saldo zerado) |
| `components/caixa/ComandasLeitura.tsx` | cards por comanda, somente leitura |
| `components/caixa/ReceberPagamento.tsx` | o wizard inteiro (telas ② e ③, incluindo QR code e modo parcela) |
| `components/caixa/PagamentosRegistrados.tsx` | lista de pagamentos + form de estorno |
| `components/caixa/FormDesconto.tsx` | form de desconto |

Mobile-first (padrões do projeto); no desktop o mesmo fluxo, com o wizard centrado.

## Fora de escopo (deliberado)

- Rateio de item entre comandas (`ItemComandaRateio`) — continua fase futura.
- Confirmação automática de Pix (gateway) — decisão antiga mantida.
- Mudanças nas regras de negócio de fechamento/desconto/estorno — só a apresentação muda.

## Testes / verificação

- `tsc -b` no frontend; nenhum teste de backend novo (backend intocado).
- Verificação ao vivo no navegador: fluxo completo com conta real de teste — conta toda,
  por comanda, itens específicos, parcelas com formas diferentes, valor livre, QR code,
  desconto, estorno, fechamento (incluindo o bloqueio de item em produção).
