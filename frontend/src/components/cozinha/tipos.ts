// Tipos de Pedido compartilhados pela tela unificada de Cozinha (Kanban) e seus
// componentes — shapes idênticos aos payloads do backend (GET /pedidos, eventos de socket).

import type { FormaPagamento } from '../caixa/tipos'
import type { StatusPedido, TipoEntrega } from '../../lib/statusPedido'

export interface ItemPedido {
  id:             string
  nomeItem:       string
  quantidade:     number
  precoUnit:      number | string
  observacao:     string | null
  acompanhamento: string | null
}

export interface Pedido {
  id:              string
  clienteNome:     string
  clienteFone:     string | null
  enderecoEntrega: string | null
  bairroNome:      string | null
  taxaEntrega:     number | string | null
  total:           number | string
  precisaTroco:    boolean
  trocoPara:       number | string | null
  status:          StatusPedido
  criadoEm:        string
  itens:           ItemPedido[]
  formaPagamento:  FormaPagamento
  tipoEntrega:     TipoEntrega
  origem:          'balcao' | 'publico'
}

export interface OpcaoAcompanhamento {
  nome: string
  precoAdicional: number
}

export interface ItemCardapio {
  id:         string
  nome:       string
  preco:      number
  disponivel: boolean
  categoria:  { id: string; nome: string; ordem: number; opcoesAcompanhamento: OpcaoAcompanhamento[] } | null
}

export interface Bairro {
  id:          string
  nome:        string
  taxaEntrega: number | null
}

export const formaPagamentoLabel: Record<string, string> = {
  pix:            'PIX',
  pix_maquininha: 'Pix (maq.)',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Crédito',
  cartao_debito:  'Débito',
}

export const tipoEntregaLabel: Record<string, string> = {
  entrega:  '🛵 Entrega',
  retirada: '🏪 Retirada',
}
