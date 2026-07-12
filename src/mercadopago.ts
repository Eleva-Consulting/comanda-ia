import { prisma } from './database.js'

// Flag temporária (decisão do usuário em 2026-07-12): enquanto `true`, Pix exige o
// estabelecimento estar conectado ao Mercado Pago (comportamento normal, com cobrança real e
// confirmação automática via webhook). Setar como `false` desliga essa exigência em TODO o
// sistema — checkout público e pedido de balcão — enquanto processos internos são ajustados;
// nesse modo, Pix vira só um registro (como dinheiro/cartão), sem cobrança real nem confirmação
// automática. Reverter: voltar pra `true`. Usado em `src/routes/publico.ts` e
// `src/routes/pedidos.ts`.
export const EXIGIR_MERCADO_PAGO_PARA_PIX = false

function configOAuth() {
  const clientId     = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET
  const redirectUri  = process.env.MP_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Variáveis MP_CLIENT_ID, MP_CLIENT_SECRET ou MP_REDIRECT_URI não configuradas')
  }
  return { clientId, clientSecret, redirectUri }
}

export function montarUrlAutorizacao(state: string): string {
  const { clientId, redirectUri } = configOAuth()
  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    platform_id:   'mp',
    redirect_uri:  redirectUri,
    state,
  })
  return `https://auth.mercadopago.com.br/authorization?${params.toString()}`
}

export interface MercadoPagoTokens {
  accessToken:  string
  refreshToken: string
  userId:       string
  expiraEm:     Date
}

function tokensFromResponse(json: {
  access_token: string; refresh_token: string; user_id: number; expires_in: number
}): MercadoPagoTokens {
  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    userId:       String(json.user_id),
    expiraEm:     new Date(Date.now() + json.expires_in * 1000),
  }
}

export async function trocarCodePorToken(code: string): Promise<MercadoPagoTokens> {
  const { clientId, clientSecret, redirectUri } = configOAuth()
  const resp = await fetch('https://api.mercadopago.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao trocar code por token: ${resp.status}`)
  return tokensFromResponse(await resp.json())
}

export async function renovarToken(refreshToken: string): Promise<MercadoPagoTokens> {
  const { clientId, clientSecret } = configOAuth()
  const resp = await fetch('https://api.mercadopago.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao renovar token: ${resp.status}`)
  return tokensFromResponse(await resp.json())
}

export interface PagamentoPixCriado {
  id:           string
  qrCode:       string
  qrCodeBase64: string
}

export async function criarPagamentoPix(params: {
  accessToken:        string
  valor:              number
  descricao:          string
  externalReference:  string
  payerEmail:         string
}): Promise<PagamentoPixCriado> {
  const resp = await fetch('https://api.mercadopago.com/v1/payments', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'Authorization':     `Bearer ${params.accessToken}`,
      'X-Idempotency-Key': params.externalReference,
    },
    body: JSON.stringify({
      transaction_amount: params.valor,
      description:        params.descricao,
      payment_method_id:  'pix',
      payer:               { email: params.payerEmail },
      external_reference: params.externalReference,
      date_of_expiration:  new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao criar pagamento Pix: ${resp.status}`)
  const json = await resp.json()
  return {
    id:           String(json.id),
    qrCode:       json.point_of_interaction.transaction_data.qr_code,
    qrCodeBase64: json.point_of_interaction.transaction_data.qr_code_base64,
  }
}

export interface PagamentoConsultado {
  status:             string
  externalReference:  string | null
}

export async function buscarPagamento(accessToken: string, paymentId: string): Promise<PagamentoConsultado> {
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!resp.ok) throw new Error(`Falha ao buscar pagamento: ${resp.status}`)
  const json = await resp.json()
  return { status: json.status, externalReference: json.external_reference ?? null }
}

export async function obterAccessTokenValido(estabelecimento: {
  id: string
  mpAccessToken:   string | null
  mpRefreshToken:  string | null
  mpTokenExpiraEm: Date | null
}): Promise<string> {
  if (!estabelecimento.mpAccessToken || !estabelecimento.mpRefreshToken) {
    throw new Error('Estabelecimento sem Mercado Pago conectado')
  }

  const seteDiasMs = 7 * 24 * 60 * 60 * 1000
  const expiraEmBreve = !estabelecimento.mpTokenExpiraEm
    || estabelecimento.mpTokenExpiraEm.getTime() - Date.now() < seteDiasMs

  if (!expiraEmBreve) return estabelecimento.mpAccessToken

  const tokens = await renovarToken(estabelecimento.mpRefreshToken)
  await prisma.estabelecimento.update({
    where: { id: estabelecimento.id },
    data: {
      mpAccessToken:   tokens.accessToken,
      mpRefreshToken:  tokens.refreshToken,
      mpTokenExpiraEm: tokens.expiraEm,
    },
  })
  return tokens.accessToken
}
