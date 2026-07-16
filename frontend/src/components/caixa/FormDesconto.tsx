import { useState } from 'react'
import { Percent } from 'lucide-react'
import { API_URL } from '../../lib/api'
import type { ResumoConta } from './tipos'

interface Props {
  contaId: string
  token: string
  onAtualizado: (resumo: ResumoConta) => void
}

// Botão "Aplicar desconto" + form colapsável (valor + motivo + senha de supervisor).
export default function FormDesconto({ contaId, token, onAtualizado }: Props) {
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    setAberto(true)
    setValor('')
    setMotivo('')
    setSenha('')
    setErro(null)
  }

  async function aplicar() {
    const valorNum = Number(valor)
    if (!(valorNum > 0) || !motivo || !senha) return
    setErro(null)
    setEnviando(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaId}/desconto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: valorNum, motivo, senha }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErro(data.erro ?? 'Não foi possível aplicar o desconto'); return }
      onAtualizado(data)
      setAberto(false)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <button
        onClick={abrir}
        className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
      >
        <Percent className="h-4 w-4" /> Aplicar desconto
      </button>

      {aberto && (
        <div className="mt-3 space-y-2 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Valor do desconto"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo do desconto"
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
              onClick={aplicar}
              disabled={enviando || !valor || !motivo || !senha}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              Confirmar desconto
            </button>
            <button onClick={() => setAberto(false)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
