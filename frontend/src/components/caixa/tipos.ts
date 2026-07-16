// Tipos compartilhados da tela de Caixa — shapes idênticos aos payloads do backend
// (GET /contas, GET /contas/:id/resumo, POST /contas/:id/pagamentos).

export interface ContaResumida {
  id: string
  status: 'aberta' | 'aguardando_pagamento'
  mesa: { numero: string } | null
}

export interface ItemResumo {
  id: string
  nomeItem: string
  precoUnit: number
  quantidade: number
  status: string
  total: number
  pago: boolean
}

export interface ComandaResumo {
  comandaId: string
  nome: string
  itens: ItemResumo[]
  totalNaoPago: number
}

export interface PagamentoResumo {
  id: string
  valor: number
  status: string
  formaPagamento: string
  criadoEm: string
  itensComandaIds: string[]
}

export interface ResumoConta {
  contaId: string
  status: string
  totalConta: number
  descontoValor: number
  totalPago: number
  saldoDevedor: number
  podeFechar: boolean
  porComanda: ComandaResumo[]
  pagamentos: PagamentoResumo[]
}

export type FormaPagamento = 'pix' | 'pix_maquininha' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'

export const FORMAS_PAGAMENTO: FormaPagamento[] = ['pix', 'pix_maquininha', 'dinheiro', 'cartao_credito', 'cartao_debito']

export const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  pix_maquininha: 'Pix (maquininha)',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

export function formatarReais(valor: number): string {
  return `R$ ${valor.toFixed(2)}`
}
