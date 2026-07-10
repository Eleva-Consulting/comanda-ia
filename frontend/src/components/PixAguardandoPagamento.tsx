import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { API_URL } from '../lib/api'

interface Props {
  slug: string
  pedidoId: string
  pixCopiaCola: string
  pixQrCodeBase64: string
  onPago: () => void
}

export default function PixAguardandoPagamento({ slug, pedidoId, pixCopiaCola, pixQrCodeBase64, onPago }: Props) {
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const intervalo = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/publico/${slug}/pedidos/${pedidoId}/status`)
        if (!r.ok) return
        const dados: { status: string; pago: boolean } = await r.json()
        if (dados.pago) {
          clearInterval(intervalo)
          onPago()
        }
      } catch {
        // silencioso — tenta de novo no próximo ciclo
      }
    }, 3000)
    return () => clearInterval(intervalo)
  }, [slug, pedidoId, onPago])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <p className="mb-1 text-lg font-bold">Escaneie para pagar</p>
        <p className="mb-4 text-sm text-zinc-400">O pedido é confirmado automaticamente assim que o Pix cair</p>

        <img
          src={`data:image/png;base64,${pixQrCodeBase64}`}
          alt="QR Code Pix"
          className="mx-auto h-56 w-56 rounded-xl bg-white p-2"
        />

        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(pixCopiaCola)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          }}
          className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-700"
        >
          {copiado ? <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Copiado!</span> : 'Copiar código Pix'}
        </button>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando pagamento...
        </p>
      </div>
    </div>
  )
}
