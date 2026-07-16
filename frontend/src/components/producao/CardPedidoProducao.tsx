import { Loader2 } from 'lucide-react'
import type { StatusPedido, TipoEntrega } from '../../lib/statusPedido'
import { STATUS_PEDIDO_CONFIG, labelStatusPedido, obterProximaAcao } from '../../lib/statusPedido'

export interface ItemPedidoProducao {
  id: string
  nomeItem: string
  quantidade: number
  observacao: string | null
  acompanhamento: string | null
}

export interface PedidoProducao {
  id: string
  clienteNome: string
  status: StatusPedido
  criadoEm: string
  tipoEntrega: TipoEntrega
  origem: 'balcao' | 'publico'
  itens: ItemPedidoProducao[]
}

const tipoEntregaLabel: Record<TipoEntrega, string> = {
  entrega:  '🛵 Entrega',
  retirada: '🏪 Retirada',
}

interface Props {
  pedido: PedidoProducao
  agora: number
  avancando: boolean
  onAvancar: (pedido: PedidoProducao, proximoStatus: StatusPedido) => void
}

// Card de Pedido (balcão/delivery/link) no Kanban da Produção — Fase 1 da Cozinha
// unificada. Avançar usa a mesma máquina de status da Cozinha (WhatsApp automático).
export default function CardPedidoProducao({ pedido, agora, avancando, onAvancar }: Props) {
  const minutos = Math.floor((agora - new Date(pedido.criadoEm).getTime()) / 60000)
  const acao = obterProximaAcao(pedido.status, pedido.tipoEntrega)
  const badge = STATUS_PEDIDO_CONFIG[pedido.status].badge

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {tipoEntregaLabel[pedido.tipoEntrega]}{pedido.origem === 'balcao' ? ' · Balcão' : ''} · {pedido.clienteNome}
        </p>
        <span className="text-xs font-medium text-zinc-500">{minutos}min</span>
      </div>
      <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>
        {labelStatusPedido(pedido.status, pedido.tipoEntrega)}
      </span>
      <div className="space-y-1">
        {pedido.itens.map((item) => (
          <div key={item.id}>
            <p className="text-sm font-semibold text-zinc-100">{item.quantidade}x {item.nomeItem}</p>
            {item.acompanhamento && (
              <p className="text-xs font-medium text-orange-400">Acompanhamento: {item.acompanhamento}</p>
            )}
            {item.observacao && <p className="text-xs italic text-zinc-500">{item.observacao}</p>}
          </div>
        ))}
      </div>
      {acao && (
        <button
          onClick={() => onAvancar(pedido, acao.proximoStatus)}
          disabled={avancando}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
        >
          {avancando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {acao.label}
        </button>
      )}
    </div>
  )
}
