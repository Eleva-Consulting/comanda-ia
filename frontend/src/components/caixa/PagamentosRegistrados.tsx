import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { API_URL } from '../../lib/api'
import type { PagamentoResumo, ResumoConta } from './tipos'
import { LABEL_FORMA_PAGAMENTO, formatarReais } from './tipos'

interface Props {
  pagamentos: PagamentoResumo[]
  token: string
  onAtualizado: (resumo: ResumoConta) => void
}

// Lista de pagamentos da conta + estorno inline (motivo + senha de supervisor).
export default function PagamentosRegistrados({ pagamentos, token, onAtualizado }: Props) {
  const [estornandoId, setEstornandoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (pagamentos.length === 0) return null

  function abrirForm(pagamentoId: string) {
    setEstornandoId(pagamentoId)
    setMotivo('')
    setSenha('')
    setErro(null)
  }

  async function confirmarEstorno() {
    if (!estornandoId || !motivo || !senha) return
    setErro(null)
    setEnviando(true)
    try {
      const resp = await fetch(`${API_URL}/pagamentos/${estornandoId}/estornar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo, senha }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErro(data.erro ?? 'Não foi possível estornar'); return }
      onAtualizado(data)
      setEstornandoId(null)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
      <div className="space-y-2">
        {pagamentos.map((pagamento) => (
          <div key={pagamento.id} className="flex items-center justify-between text-sm">
            <span className={pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}>
              {LABEL_FORMA_PAGAMENTO[pagamento.formaPagamento]} · {formatarReais(pagamento.valor)}
            </span>
            {pagamento.status === 'confirmado' && (
              <button
                onClick={() => abrirForm(pagamento.id)}
                className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-red-400 hover:bg-red-500/10"
                title="Estornar pagamento"
              >
                <Undo2 className="h-3.5 w-3.5" /> Estornar
              </button>
            )}
          </div>
        ))}
      </div>

      {estornandoId && (
        <div className="mt-3 space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs text-zinc-400">Motivo e senha de supervisor para estornar</p>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo do estorno"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha de supervisor"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex gap-2">
            <button
              onClick={confirmarEstorno}
              disabled={enviando || !motivo || !senha}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              Confirmar estorno
            </button>
            <button onClick={() => setEstornandoId(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
