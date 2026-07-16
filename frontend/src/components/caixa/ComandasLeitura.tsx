import type { ComandaResumo } from './tipos'
import { formatarReais } from './tipos'

// Cards por comanda, somente leitura — pagar acontece só pelo fluxo "Receber pagamento".
export default function ComandasLeitura({ comandas }: { comandas: ComandaResumo[] }) {
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
                className={`flex justify-between text-sm ${item.status === 'cancelado' ? 'text-zinc-600 line-through' : item.pago ? 'text-zinc-500' : 'text-zinc-200'}`}
              >
                <span>{item.quantidade}x {item.nomeItem} {item.pago && '· pago'}</span>
                <span>{formatarReais(item.total)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
