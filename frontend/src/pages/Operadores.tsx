import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Users, Plus, Trash2, Loader2, X } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Operador {
  id:       string
  nome:     string
  email:    string
  criadoEm: string
}

function formatarData(data: string) {
  return new Date(data).toLocaleDateString('pt-BR')
}

export default function Operadores() {
  const token = localStorage.getItem('token')
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [criando, setCriando] = useState(false)
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/estabelecimentos/operadores`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setOperadores)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  function abrirModal() {
    setNome('')
    setEmail('')
    setSenha('')
    setErro(null)
    setModalAberto(true)
  }

  async function criarOperador(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCriando(true)
    try {
      const resp = await fetch(`${API_URL}/estabelecimentos/operadores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome, email, senha }),
      })
      const dados = await resp.json()
      if (!resp.ok) {
        setErro(dados.erro ?? 'Erro ao criar operador')
        return
      }
      setOperadores((prev) => [dados, ...prev])
      setModalAberto(false)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCriando(false)
    }
  }

  async function removerOperador(id: string) {
    setRemovendoId(id)
    try {
      const resp = await fetch(`${API_URL}/estabelecimentos/operadores/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        console.error('Erro ao remover operador', resp.status)
        setErro('Não foi possível remover o operador. Tente novamente.')
        return
      }
      setOperadores((prev) => prev.filter((o) => o.id !== id))
    } catch (err) {
      console.error(err)
      setErro('Falha de conexão ao remover operador.')
    } finally {
      setRemovendoId(null)
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Operadores</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {operadores.length} cadastrado{operadores.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Novo Operador
        </button>
      </div>

      {erro && !modalAberto && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/30 flex items-center justify-between gap-3">
          <span>{erro}</span>
          <button onClick={() => setErro(null)} className="shrink-0 text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {carregando ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : operadores.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Users className="h-10 w-10" />
          <p>Nenhum operador cadastrado.</p>
          <button onClick={abrirModal} className="text-sm font-medium text-orange-400 hover:text-orange-300">
            Adicionar operador
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {operadores.map((op) => (
            <div
              key={op.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div>
                <p className="font-semibold">{op.nome}</p>
                <p className="mt-0.5 text-sm text-zinc-400">{op.email}</p>
                <p className="mt-0.5 text-xs text-zinc-600">desde {formatarData(op.criadoEm)}</p>
              </div>
              <button
                onClick={() => removerOperador(op.id)}
                disabled={removendoId === op.id}
                className="rounded-xl bg-red-500/10 p-2.5 text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {removendoId === op.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo operador */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Novo Operador</h3>
              <button
                onClick={() => setModalAberto(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarOperador} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@email.com"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Senha</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                />
              </label>
              {erro && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                  {erro}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
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
                  Criar operador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
