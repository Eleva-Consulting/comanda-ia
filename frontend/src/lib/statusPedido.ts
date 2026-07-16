// Máquina de status de Pedido (balcão/delivery/link) — compartilhada entre a Cozinha
// e o Kanban da Produção (Fase 1 da Cozinha unificada). Avançar um pedido usa sempre
// PATCH /pedidos/:id, que dispara as notificações de WhatsApp pro cliente.

export type StatusPedido = 'recebido' | 'pagamento_confirmado' | 'em_preparo' | 'pronto' | 'a_caminho' | 'entregue' | 'cancelado'
export type TipoEntrega = 'entrega' | 'retirada'

export const STATUS_PEDIDO_CONFIG: Record<StatusPedido, { label: string; badge: string }> = {
  recebido:              { label: 'Aguard. pgto',     badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  pagamento_confirmado:  { label: 'Pgto. confirmado', badge: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30' },
  em_preparo:            { label: 'Em preparo',        badge: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/30' },
  pronto:                { label: 'Pronto',            badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30' },
  a_caminho:             { label: 'A caminho',         badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30' },
  entregue:              { label: 'Entregue',          badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  cancelado:             { label: 'Cancelado',         badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' },
}

/** Rótulo do status exibido — "Entregue" não faz sentido pra retirada, vira "Retirado". */
export function labelStatusPedido(status: StatusPedido, tipoEntrega: TipoEntrega): string {
  if (status === 'entregue' && tipoEntrega === 'retirada') return 'Retirado'
  return STATUS_PEDIDO_CONFIG[status].label
}

export interface AcaoPedido {
  proximoStatus: StatusPedido
  label: string
  cor?: string
}

const proximaAcaoEntrega: Partial<Record<StatusPedido, AcaoPedido>> = {
  recebido:             { proximoStatus: 'pagamento_confirmado', label: 'Confirmar pagamento', cor: 'bg-emerald-600 hover:bg-emerald-700' },
  pagamento_confirmado: { proximoStatus: 'em_preparo',          label: 'Iniciar preparo',      cor: 'bg-orange-500 hover:bg-orange-600' },
  em_preparo:           { proximoStatus: 'pronto',              label: 'Marcar pronto',        cor: 'bg-orange-500 hover:bg-orange-600' },
  pronto:               { proximoStatus: 'a_caminho',           label: 'Saiu para entrega',    cor: 'bg-orange-500 hover:bg-orange-600' },
  a_caminho:            { proximoStatus: 'entregue',            label: 'Marcar entregue',      cor: 'bg-orange-500 hover:bg-orange-600' },
}

// Retirada não passa por "saiu para entrega" — de "pronto" já vai direto pra retirado.
const proximaAcaoRetirada: Partial<Record<StatusPedido, AcaoPedido>> = {
  ...proximaAcaoEntrega,
  pronto: { proximoStatus: 'entregue', label: 'Marcar retirado', cor: 'bg-orange-500 hover:bg-orange-600' },
}

export function obterProximaAcao(status: StatusPedido, tipoEntrega: TipoEntrega): AcaoPedido | undefined {
  return (tipoEntrega === 'retirada' ? proximaAcaoRetirada : proximaAcaoEntrega)[status]
}

export const STATUS_ATIVOS_PEDIDO: StatusPedido[] = ['recebido', 'pagamento_confirmado', 'em_preparo', 'pronto', 'a_caminho']
