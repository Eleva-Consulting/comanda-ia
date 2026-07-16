import { Loader2, MapPin, Pencil, Printer, XCircle } from 'lucide-react'
import type { StatusPedido } from '../../lib/statusPedido'
import { STATUS_PEDIDO_CONFIG, labelStatusPedido, obterProximaAcao } from '../../lib/statusPedido'
import type { Pedido } from './tipos'
import { formaPagamentoLabel, tipoEntregaLabel } from './tipos'

interface Props {
  pedido: Pedido
  agora: number
  avancando: boolean
  cancelando: boolean
  onAvancar: (pedido: Pedido, proximoStatus: StatusPedido) => void
  onCancelar: (pedido: Pedido) => void
  onEditar: (pedido: Pedido) => void
}

// Card de Pedido (balcão/delivery/link) no Kanban da Cozinha unificada — paridade
// com o card da Cozinha antiga: badges, endereço, troco, total, editar/imprimir/cancelar.
export default function CardPedidoKanban({ pedido, agora, avancando, cancelando, onAvancar, onCancelar, onEditar }: Props) {
  const minutos = Math.floor((agora - new Date(pedido.criadoEm).getTime()) / 60000)
  const acao = obterProximaAcao(pedido.status, pedido.tipoEntrega)
  const badge = STATUS_PEDIDO_CONFIG[pedido.status].badge
  const ocupado = avancando || cancelando

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-zinc-500">
          #{pedido.id.slice(-6)} · {pedido.clienteNome}
        </p>
        <span className="shrink-0 text-xs font-medium text-zinc-500">{minutos}min</span>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>
          {labelStatusPedido(pedido.status, pedido.tipoEntrega)}
        </span>
        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
          {tipoEntregaLabel[pedido.tipoEntrega] ?? pedido.tipoEntrega}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
          pedido.formaPagamento === 'pix' ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-800 text-zinc-400'
        }`}>
          {formaPagamentoLabel[pedido.formaPagamento] ?? pedido.formaPagamento}
        </span>
        {pedido.formaPagamento === 'dinheiro' && pedido.precisaTroco && pedido.trocoPara != null && (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
            Troco p/ R$ {Number(pedido.trocoPara).toFixed(2)}
          </span>
        )}
      </div>

      {pedido.tipoEntrega === 'entrega' && pedido.enderecoEntrega && (
        <div className="mb-2 flex items-start gap-1.5 text-xs text-zinc-400">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span>
            {pedido.bairroNome && <span className="font-medium text-zinc-300">{pedido.bairroNome} — </span>}
            {pedido.enderecoEntrega}
          </span>
        </div>
      )}

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

      <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2">
        <span className="text-sm font-bold">R$ {Number(pedido.total).toFixed(2)}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onEditar(pedido)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="Editar itens do pedido"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.open(`/imprimir/${pedido.id}`, '_blank')}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="Imprimir comanda"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (window.confirm('Cancelar este pedido?')) onCancelar(pedido)
            }}
            disabled={ocupado}
            className="rounded-lg p-1.5 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            title="Cancelar pedido"
          >
            {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {acao && (
        <button
          onClick={() => onAvancar(pedido, acao.proximoStatus)}
          disabled={ocupado}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
        >
          {avancando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {acao.label}
        </button>
      )}
    </div>
  )
}
