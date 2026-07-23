import { X } from 'lucide-react'
import type { ComandaResumo, ItemResumo } from './tipos'
import { formatarReais } from './tipos'

interface Props {
  comandas: ComandaResumo[]
  onCancelarItem: (item: ItemResumo) => void
}

// Cards por comanda — leitura dos itens, com a exceção de poder cancelar um item
// (pagar continua só pelo fluxo "Receber pagamento").
export default function ComandasLeitura({ comandas, onCancelarItem }: Props) {
  return (
    <>
      {comandas.map((comanda) => (
        <div key={comanda.comandaId} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{comanda.nome}</h3>
            {comanda.totalNaoPago > 0 ? (
              <span className="text-sm text-zinc-400">{formatarReais(comanda.totalNaoPago)} em aberto</span>
            ) : (
              <span className="text-sm text-emerald-400">✓ pago</span>
            )}
          </div>
          <div className="space-y-1">
            {comanda.itens.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-2 text-sm ${item.status === 'cancelado' ? 'text-zinc-600 line-through' : item.pago ? 'text-zinc-500' : 'text-zinc-200'}`}
              >
                <span className="truncate">{item.quantidade}x {item.nomeItem} {item.pago && '· pago'}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {formatarReais(item.total)}
                  {item.status !== 'cancelado' && (
                    <button
                      onClick={() => onCancelarItem(item)}
                      className="rounded p-0.5 text-zinc-600 no-underline hover:bg-red-500/10 hover:text-red-400"
                      title={item.pago ? 'Item pago — estorne o pagamento antes de cancelar' : 'Cancelar item'}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
