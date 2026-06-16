import { useEffect, useState } from 'react'
import { Building2, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import LayoutAdmin from '../../components/LayoutAdmin'
import { API_URL } from '../../lib/api'

interface Estabelecimento {
  id: string
  nome: string
  slug: string
  telefone: string
  ativo: boolean
  criadoEm: string
  totalUsuarios: number
  totalPedidos: number
  totalItens: number
}

function formatarData(data: string) {
  return new Date(data).toLocaleDateString('pt-BR')
}

export default function AdminEstabelecimentos() {
  const token = localStorage.getItem('token')
  const [lista, setLista] = useState<Estabelecimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [suspendendo, setSuspendendo] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/admin/estabelecimentos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setLista)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  async function toggleSuspender(id: string) {
    setSuspendendo(id)
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/suspender`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return
      const atualizado = await resp.json()
      setLista((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ativo: atualizado.ativo } : e))
      )
    } catch (err) {
      console.error(err)
    } finally {
      setSuspendendo(null)
    }
  }

  if (carregando) {
    return (
      <LayoutAdmin>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      </LayoutAdmin>
    )
  }

  return (
    <LayoutAdmin>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Estabelecimentos</h2>
          <p className="mt-1 text-sm text-zinc-400">{lista.length} cadastrados na plataforma</p>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Building2 className="h-10 w-10" />
          <p>Nenhum estabelecimento cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((e) => (
            <div
              key={e.id}
              className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Info */}
              <div className="flex items-start gap-4">
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${e.ativo ? 'bg-violet-500/15' : 'bg-zinc-800'}`}>
                  <Building2 className={`h-5 w-5 ${e.ativo ? 'text-violet-400' : 'text-zinc-500'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{e.nome}</p>
                    {e.ativo ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3" /> Ativo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-500/30">
                        <XCircle className="h-3 w-3" /> Suspenso
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    /{e.slug} · desde {formatarData(e.criadoEm)}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-zinc-400">
                    <span>{e.totalUsuarios} usuário{e.totalUsuarios !== 1 ? 's' : ''}</span>
                    <span>{e.totalPedidos} pedido{e.totalPedidos !== 1 ? 's' : ''}</span>
                    <span>{e.totalItens} item{e.totalItens !== 1 ? 'ns' : ''} no cardápio</span>
                  </div>
                </div>
              </div>

              {/* Ação */}
              <button
                onClick={() => toggleSuspender(e.id)}
                disabled={suspendendo === e.id}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  e.ativo
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/30'
                }`}
              >
                {suspendendo === e.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : e.ativo ? (
                  <><XCircle className="h-4 w-4" /> Suspender</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Reativar</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </LayoutAdmin>
  )
}
