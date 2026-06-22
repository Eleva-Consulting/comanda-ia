import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, Loader2, CheckCircle2, XCircle, Clock, Plus, X, Trash2 } from 'lucide-react'
import LayoutAdmin from '../../components/LayoutAdmin'
import { API_URL } from '../../lib/api'

interface Estabelecimento {
  id: string
  nome: string
  slug: string
  telefone: string
  status: 'pendente' | 'ativo' | 'suspenso'
  criadoEm: string
  totalUsuarios: number
  totalPedidos: number
  totalItens: number
}

type StatusEstabelecimento = 'pendente' | 'ativo' | 'suspenso'

function formatarData(data: string) {
  return new Date(data).toLocaleDateString('pt-BR')
}

const badgeStatus = {
  ativo: {
    label: 'Ativo',
    classe: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
    Icone: CheckCircle2,
  },
  pendente: {
    label: 'Pendente',
    classe: 'bg-orange-500/10 text-orange-400 ring-orange-500/30',
    Icone: Clock,
  },
  suspenso: {
    label: 'Suspenso',
    classe: 'bg-red-500/10 text-red-400 ring-red-500/30',
    Icone: XCircle,
  },
}

export default function AdminEstabelecimentos() {
  const token = localStorage.getItem('token')
  const [lista, setLista] = useState<Estabelecimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState<string | null>(null)
  const [deletandoId, setDeletandoId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const [novoModalAberto, setNovoModalAberto] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erroModal, setErroModal] = useState<string | null>(null)
  const [nomeEst, setNomeEst] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nomeDono, setNomeDono] = useState('')
  const [emailDono, setEmailDono] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/admin/estabelecimentos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setLista)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  async function mudarStatus(id: string, status: StatusEstabelecimento) {
    setAtualizando(id)
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      })
      if (!resp.ok) return
      const atualizado = await resp.json()
      setLista((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: atualizado.status } : e))
      )
    } catch (err) {
      console.error(err)
    } finally {
      setAtualizando(null)
    }
  }

  async function deletarEstabelecimento(id: string) {
    setDeletandoId(id)
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok || resp.status === 204) {
        setLista((prev) => prev.filter((e) => e.id !== id))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDeletandoId(null)
      setConfirmId(null)
    }
  }

  function abrirNovoModal() {
    setNomeEst('')
    setTelefone('')
    setNomeDono('')
    setEmailDono('')
    setErroModal(null)
    setNovoModalAberto(true)
  }

  async function criarEstabelecimento(e: FormEvent) {
    e.preventDefault()
    setErroModal(null)
    setCriando(true)
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nomeEstabelecimento: nomeEst,
          telefone,
          nomeDono,
          emailDono,
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) {
        setErroModal(dados.erro ?? 'Erro ao criar estabelecimento')
        return
      }
      setLista((prev) => [dados, ...prev])
      setNovoModalAberto(false)
    } catch {
      setErroModal('Falha de conexão')
    } finally {
      setCriando(false)
    }
  }

  const pendentes = lista.filter((e) => e.status === 'pendente')
  const demais = lista.filter((e) => e.status !== 'pendente')

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
        <button
          onClick={abrirNovoModal}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Novo Estabelecimento
        </button>
      </div>

      {/* Pendentes primeiro — requerem ação */}
      {pendentes.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-400" />
            <p className="text-sm font-semibold text-orange-400">
              {pendentes.length} aguardando aprovação
            </p>
          </div>
          <div className="space-y-3">
            {pendentes.map((e) => (
              <CardEstabelecimento
                key={e.id}
                e={e}
                atualizando={atualizando}
                mudarStatus={mudarStatus}
                deletandoId={deletandoId}
                onDelete={() => setConfirmId(e.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ativos e suspensos */}
      {demais.length > 0 && (
        <div className="space-y-3">
          {demais.map((e) => (
            <CardEstabelecimento
              key={e.id}
              e={e}
              atualizando={atualizando}
              mudarStatus={mudarStatus}
              deletandoId={deletandoId}
              onDelete={() => setConfirmId(e.id)}
            />
          ))}
        </div>
      )}

      {lista.length === 0 && (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Building2 className="h-10 w-10" />
          <p>Nenhum estabelecimento cadastrado.</p>
        </div>
      )}

      {confirmId && (() => {
        const estab = lista.find(e => e.id === confirmId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-2 font-bold text-lg">Excluir estabelecimento?</h3>
              <p className="mb-1 text-zinc-300">"{estab?.nome}"</p>
              <p className="mb-6 text-sm text-zinc-500">
                Esta ação é irreversível. Todos os dados, pedidos e usuários vinculados serão removidos permanentemente.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmId(null)}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deletarEstabelecimento(confirmId)}
                  disabled={deletandoId === confirmId}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {deletandoId === confirmId ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {novoModalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Novo Estabelecimento</h3>
              <button
                onClick={() => setNovoModalAberto(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarEstabelecimento} className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Estabelecimento</p>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input
                  type="text"
                  required
                  value={nomeEst}
                  onChange={(e) => setNomeEst(e.target.value)}
                  placeholder="Ex: Galeteria do João"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Telefone</span>
                <input
                  type="text"
                  required
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(51) 99999-0000"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Responsável (DONO)</p>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input
                  type="text"
                  required
                  value={nomeDono}
                  onChange={(e) => setNomeDono(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email</span>
                <input
                  type="email"
                  required
                  value={emailDono}
                  onChange={(e) => setEmailDono(e.target.value)}
                  placeholder="dono@email.com"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <p className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
                📧 Um link para definir a senha será enviado ao email do responsável.
              </p>
              {erroModal && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                  {erroModal}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNovoModalAberto(false)}
                  className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criando}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {criando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar estabelecimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutAdmin>
  )
}

function CardEstabelecimento({
  e,
  atualizando,
  mudarStatus,
  deletandoId,
  onDelete,
}: {
  e: Estabelecimento
  atualizando: string | null
  mudarStatus: (id: string, status: StatusEstabelecimento) => void
  deletandoId: string | null
  onDelete: () => void
}) {
  const badge = badgeStatus[e.status]
  const ocupado = atualizando === e.id

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between">
      {/* Info */}
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${e.status === 'ativo' ? 'bg-orange-500/10' : 'bg-zinc-800'}`}>
          <Building2 className={`h-5 w-5 ${e.status === 'ativo' ? 'text-orange-400' : 'text-zinc-500'}`} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{e.nome}</p>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${badge.classe}`}>
              <badge.Icone className="h-3 w-3" />
              {badge.label}
            </span>
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

      {/* Ações */}
      <div className="flex shrink-0 gap-2">
        {e.status === 'pendente' && (
          <>
            <button
              onClick={() => mudarStatus(e.id, 'ativo')}
              disabled={ocupado}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar
            </button>
            <button
              onClick={() => mudarStatus(e.id, 'suspenso')}
              disabled={ocupado}
              className="flex items-center gap-1.5 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Rejeitar
            </button>
          </>
        )}
        {e.status === 'ativo' && (
          <button
            onClick={() => mudarStatus(e.id, 'suspenso')}
            disabled={ocupado}
            className="flex items-center gap-1.5 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Suspender
          </button>
        )}
        {e.status === 'suspenso' && (
          <button
            onClick={() => mudarStatus(e.id, 'ativo')}
            disabled={ocupado}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Reativar
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={deletandoId === e.id}
          className="flex items-center justify-center rounded-xl bg-red-500/10 p-2 text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
          title="Excluir estabelecimento"
        >
          {deletandoId === e.id
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Trash2 className="h-4 w-4" />
          }
        </button>
      </div>
    </div>
  )
}
