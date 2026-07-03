# Checkout com Mercado Pago (Pix) — Design

Data: 2026-07-03
Status: aprovado para virar plano de implementação

## Contexto

Hoje o checkout público (`src/routes/publico.ts`) e o pedido manual (`src/routes/pedidos.ts`) exibem
`Estabelecimento.chavePix` como texto pro cliente pagar por fora do sistema (Pix manual, sem
confirmação). O item "Mercado Pago — PIX real no checkout" já está listado como próxima feature no
`CLAUDE.md`. Este documento define como isso deve funcionar.

## Problema de negócio

comanda-ia é uma plataforma multi-tenant: cada estabelecimento é o vendedor de fato, e o dinheiro do
pedido precisa cair na conta do restaurante — não na conta da plataforma. Isso exige um modelo de
"split de pagamentos" (análogo ao Stripe Connect), não uma conta única centralizada.

## Decisões (confirmadas com o usuário)

- **Modelo:** Mercado Pago para Plataformas — OAuth Connect. Uma única aplicação Mercado Pago
  (Client ID/Secret) pertence à plataforma; cada estabelecimento autoriza via OAuth e o backend passa
  a criar pagamentos usando o token daquele estabelecimento específico.
- **Conexão obrigatória:** um estabelecimento não pode vender via Pix online sem ter conectado sua
  conta Mercado Pago. Sem conexão, o checkout Pix fica bloqueado (CTA "Conectar com Mercado Pago" em
  Configurações).
- **Escopo da fase 1:** apenas Pix. Cartão de crédito/débito via Checkout Pro/Bricks fica para uma
  fase futura (arquitetura deve deixar isso plausível sem retrabalho grande).
- **Dinheiro e cartão físico (maquininha) não mudam.** Continuam presenciais, confirmados fisicamente
  pelo operador na entrega/retirada — sem qualquer integração ou "aguardando pagamento".
- **Monetização (marketplace_fee):** ainda não decidida pelo usuário. O schema já nasce preparado
  (`taxaPlataforma` opcional, default nulo/zero) para poder ativar cobrança por transação no futuro
  sem migration adicional.
- **Custo:** Mercado Pago não cobra da plataforma para usar OAuth Connect. Quem paga a taxa por
  transação é a conta que recebe o dinheiro (o restaurante) — como já ocorre hoje com Pix comum. Se
  `taxaPlataforma` for ativada no futuro, isso é receita da plataforma, retida automaticamente pelo
  MP, não um custo.
- **Comportamento na Cozinha:** pedido pago via Pix Mercado Pago só aparece na fila da Cozinha depois
  do status `pagamento_confirmado` (mudança de comportamento em relação a hoje, só para esse método).
  Dinheiro/cartão físico continuam aparecendo imediatamente, como sempre.

## Arquitetura

```
Restaurante (DONO)          Comanda-IA Backend            Mercado Pago
  1. Clica "Conectar MP" ─────────────────────────────────────►
                              2. Redireciona pro OAuth ────────►
  3. Login + autoriza  ◄───────────────────────────────────────
                              4. Troca code por access/refresh token ─►
                              5. Salva token no Estabelecimento (BD)

Cliente final:
  6. Checkout público ───────►
                              7. Cria Pix payment com token do restaurante ─►
  8. Mostra QR na hora  ◄─────
  9. Cliente paga no banco dele
                              10. Webhook: pagamento aprovado ◄─────────────
  11. Pedido confirmado automaticamente, entra na Cozinha
```

Uma aplicação Mercado Pago única é criada uma vez em
[mercadopago.com.br/developers](https://www.mercadopago.com.br/developers), gerando `Client ID` e
`Client Secret` da plataforma inteira. Cada estabelecimento passa pelo fluxo de autorização (passos
1–5) uma única vez; o token fica salvo por tenant.

## Modelo de dados

### `Estabelecimento` — novos campos

```prisma
mpAccessToken     String?   // token usado para criar pagamentos em nome do restaurante
mpRefreshToken    String?   // usado para renovar o access token quando expira
mpUserId          String?   // id da conta Mercado Pago conectada (collector_id)
mpTokenExpiraEm   DateTime? // access token expira (~180 dias) — precisa refresh
mpConectado       Boolean   @default(false) // flag rápida para UI
taxaPlataforma    Decimal?  @db.Decimal(5, 2) // % de marketplace_fee — null = não cobra (padrão atual)
```

### `Pedido` — novos campos

```prisma
mpPaymentId       String?  // id do pagamento no Mercado Pago — chave para localizar no webhook
pixCopiaCola      String?  @db.Text // código copia-e-cola gerado na criação do pagamento
pixQrCodeBase64   String?  @db.Text // imagem do QR (base64), evita nova chamada à API só para exibir
pagoEm            DateTime? // timestamp de quando o webhook confirmou o pagamento
```

`StatusPedido` não precisa mudar — já existe `pagamento_confirmado`, usado como o estado que o
webhook seta automaticamente. `FormaPagamento.pix` já existe e passa a significar especificamente
"Pix via Mercado Pago" quando o estabelecimento está conectado.

## Fluxo de dados

**Criação do pagamento (checkout Pix):**
1. Backend chama `POST /v1/payments` no Mercado Pago, autenticado com o `mpAccessToken` do
   estabelecimento (não um token genérico da plataforma).
2. Corpo: valor do pedido, `payment_method_id: pix`, dados do pagador (e-mail obrigatório — gerar
   sintético a partir do nome/telefone do cliente, no mesmo espírito do e-mail fictício já usado para
   operadores), `external_reference = pedido.id`, e `date_of_expiration` curto (15–30 min) para não
   deixar QR "pendurado" indefinidamente.
3. Resposta traz `id` (→ `mpPaymentId`), `qr_code` (→ `pixCopiaCola`) e `qr_code_base64` (→
   `pixQrCodeBase64`), salvos direto no `Pedido`.
4. Pedido fica em `recebido` até a confirmação — sem clique manual de "confirmar pagamento".

**Confirmação automática (webhook):**
5. Mercado Pago dispara notificação HTTP (`POST /webhooks/mercadopago`, configurada uma vez na
   aplicação) quando o status do pagamento muda.
6. **Nunca confiar no conteúdo da notificação isoladamente.** O backend deve buscar o pagamento real
   via `GET /v1/payments/{id}` antes de confirmar qualquer coisa — evita spoofing de notificação falsa.
7. Se `status === 'approved'`: localizar `Pedido` via `external_reference`, setar
   `status = pagamento_confirmado` e `pagoEm = now()`, disparar notificações existentes (WhatsApp,
   push, Socket.IO para a Cozinha).
8. **Idempotência:** o MP reenvia notificação se não receber 200 rápido — checar se o pedido já está
   `pagamento_confirmado` antes de reprocessar.
9. **Refresh de token:** antes de `mpTokenExpiraEm`, renovar via `grant_type=refresh_token`
   automaticamente, sem exigir reconexão manual do dono.

> Nota de implementação: os detalhes exatos de assinatura/autenticação do webhook (mecanismo
> `x-signature` do Mercado Pago) precisam ser validados contra a documentação oficial atual no
> momento de implementar — não fixar formato aqui.

## Tratamento de erros

- **MP fora do ar / timeout / token inválido ao criar pagamento:** pedido não é criado ainda nesse
  ponto; erro visível pro cliente, sem duplicar pedido.
- **Token expirado e refresh falha** (ex: restaurante revogou acesso direto no painel do MP, fora do
  fluxo do app): marcar `mpConectado = false`, bloquear novos checkouts Pix desse estabelecimento,
  avisar o DONO (reaproveitando push/e-mail existentes) para reconectar.
- **QR expira sem pagamento:** pedido nunca chega a `pagamento_confirmado`; não deve poluir a fila da
  Cozinha.
- **Webhook duplicado ou fora de ordem:** idempotência via checagem de status atual antes de
  reprocessar.
- **Servidor fora do ar no momento da notificação:** o MP reenvia por um tempo, mas isso não deve ser
  a única rede de segurança — um job periódico reconciliando pedidos "com Pix gerado, pendentes há
  mais de X minutos" contra a API do MP cobre o caso do reenvio também falhar.
- **Pagamento rejeitado/cancelado no MP:** pedido não avança; expira normalmente como se não tivesse
  sido pago.

## Comportamento na Cozinha

- Pedido Pix via Mercado Pago: invisível na fila até `pagamento_confirmado`.
- Dinheiro e cartão físico (maquininha): comportamento inalterado — aparecem imediatamente, como hoje.

## Testes

- Credenciais de teste (Client ID/Secret de sandbox) separadas das de produção.
- Contas de teste no MP: uma no papel de "vendedor" (restaurante, para o fluxo OAuth) e outra de
  "comprador" (para simular o Pix do cliente) — pagamentos entre elas não movem dinheiro real.
- Aprovação manual do Pix de teste pelo painel sandbox do MP dispara webhook real, permitindo testar
  o fluxo ponta a ponta (criação → QR → webhook → `pagamento_confirmado` → aparece na Cozinha) sem
  gastar dinheiro.
- Webhook em dev local via túnel (ex: ngrok) ou testado direto contra staging no Railway.
- Testes automatizados (unit/integração) mockando respostas da API do MP para os casos de erro
  mapeados: token expirado, webhook duplicado, pagamento rejeitado, QR expirado.

## Fora de escopo (fase 1)

- Cartão de crédito/débito via Mercado Pago (Checkout Pro/Bricks).
- Cobrança efetiva de `taxaPlataforma` (campo existe, mas não ativado).
- Multi-conta/múltiplos estabelecimentos sob o mesmo Mercado Pago (item separado no roadmap:
  "multi-unidades").
