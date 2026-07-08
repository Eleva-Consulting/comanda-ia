import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface RegistroAuditoria {
  id: string
  acao: string
  entidadeTipo: string
  entidadeId: string
  motivo: string | null
  dadosAntes: unknown
  dadosDepois: unknown
  criadoEm: string
  usuarioNome: string | null
}

const labelAcao: Record<string, string> = {
  'conta:desconto': 'Desconto aplicado',
  'pagamento:estorno': 'Pagamento estornado',
  'item:cancelado': 'Item cancelado',
  'item:transferido': 'Item transferido',
}

export default function Auditoria() {
  const token = localStorage.getItem('token')

  const [registros, setRegistros] = useState<RegistroAuditoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroAcao, setFiltroAcao] = useState('')
  const [filtroDe, setFiltroDe] = useState('')
  const [filtroAte, setFiltroAte] = useState('')

  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)

  function carregarRegistros() {
    setCarregando(true)
    setErro(null)
    const params = new URLSearchParams()
    if (filtroAcao) params.set('acao', filtroAcao)
    if (filtroDe) params.set('de', filtroDe)
    if (filtroAte) params.set('ate', filtroAte)

    fetch(`${API_URL}/auditoria?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setRegistros)
      .catch(() => setErro('Falha ao carregar auditoria'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregarRegistros()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Layout>
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <ShieldCheck className="h-6 w-6" /> Auditoria
      </h2>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Ação</span>
          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(labelAcao).map(([valor, label]) => (
              <option key={valor} value={valor}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">De</span>
          <input
            type="date"
            value={filtroDe}
            onChange={(e) => setFiltroDe(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Até</span>
          <input
            type="date"
            value={filtroAte}
            onChange={(e) => setFiltroAte(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={carregarRegistros}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Filtrar
        </button>
      </div>

      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}

      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : registros.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum registro encontrado.</p>
      ) : (
        <div className="space-y-2">
          {registros.map((registro) => (
            <div key={registro.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{labelAcao[registro.acao] ?? registro.acao}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {new Date(registro.criadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
                <span className="text-xs text-zinc-400">{registro.usuarioNome ?? 'Desconhecido'}</span>
              </div>
              {registro.motivo && <p className="mt-1 text-sm text-zinc-300">Motivo: {registro.motivo}</p>}
              <button
                onClick={() => setDetalheAberto(detalheAberto === registro.id ? null : registro.id)}
                className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
              >
                {detalheAberto === registro.id ? 'Ocultar detalhes' : 'Ver detalhes'}
              </button>
              {detalheAberto === registro.id && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
                  {JSON.stringify({ dadosAntes: registro.dadosAntes, dadosDepois: registro.dadosDepois }, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
