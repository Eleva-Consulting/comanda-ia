import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Users, Plus, Trash2, Loader2, X, ChevronDown, ChevronUp, Shield, Wand2 } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { TODAS_PERMISSOES, type Permissao } from '../lib/permissoes'

function gerarEmailFicticio(nomePessoa: string, slugEstabelecimento: string): string {
  const partes = nomePessoa
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const primeiro = partes[0] ?? 'operador'
  const ultimo   = partes.length > 1 ? partes[partes.length - 1] : ''
  const usuario  = [primeiro, ultimo].filter(Boolean).join('.')

  return `${usuario}@${slugEstabelecimento || 'equipe'}.com`
}

interface Operador {
  id:         string
  nome:       string
  email:      string
  criadoEm:   string
  permissoes: Permissao[]
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
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [salvandoPermissoes, setSalvandoPermissoes] = useState<string | null>(null)
  const [slugEstabelecimento, setSlugEstabelecimento] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/estabelecimentos/operadores`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setOperadores)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est) => setSlugEstabelecimento(est.slug ?? ''))
      .catch(console.error)
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome, email, senha }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErro(dados.erro ?? 'Erro ao criar operador'); return }
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
      if (!resp.ok) { setErro('Não foi possível remover o operador.'); return }
      setOperadores((prev) => prev.filter((o) => o.id !== id))
    } catch {
      setErro('Falha de conexão ao remover operador.')
    } finally {
      setRemovendoId(null)
    }
  }

  function togglePermissao(operador: Operador, permissao: Permissao) {
    const novas = operador.permissoes.includes(permissao)
      ? operador.permissoes.filter((p) => p !== permissao)
      : [...operador.permissoes, permissao]
    setOperadores((prev) => prev.map((o) => o.id === operador.id ? { ...o, permissoes: novas } : o))
  }

  async function salvarPermissoes(operador: Operador) {
    setSalvandoPermissoes(operador.id)
    try {
      await fetch(`${API_URL}/estabelecimentos/operadores/${operador.id}/permissoes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissoes: operador.permissoes }),
      })
    } catch {
      setErro('Falha ao salvar permissões')
    } finally {
      setSalvandoPermissoes(null)
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
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/30">
          <span>{erro}</span>
          <button onClick={() => setErro(null)}><X className="h-4 w-4" /></button>
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
            <div key={op.id} className="rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{op.nome}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{op.email}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">desde {formatarData(op.criadoEm)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {op.permissoes.map((p) => (
                      <span key={p} className="rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 ring-1 ring-orange-500/20">
                        {TODAS_PERMISSOES.find((x) => x.id === p)?.label.split(' —')[0] ?? p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setExpandidoId(expandidoId === op.id ? null : op.id)}
                    className="rounded-xl border border-zinc-700 p-2.5 text-zinc-400 transition hover:bg-zinc-800"
                    title="Editar permissões"
                  >
                    <Shield className="h-4 w-4" />
                    {expandidoId === op.id ? <ChevronUp className="h-3 w-3 mt-0.5" /> : <ChevronDown className="h-3 w-3 mt-0.5" />}
                  </button>
                  <button
                    onClick={() => removerOperador(op.id)}
                    disabled={removendoId === op.id}
                    className="rounded-xl bg-red-500/10 p-2.5 text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {removendoId === op.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {expandidoId === op.id && (
                <div className="border-t border-zinc-800 px-5 pb-5 pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Permissões</p>
                  <div className="space-y-2">
                    {TODAS_PERMISSOES.map(({ id, label }) => (
                      <label key={id} className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={op.permissoes.includes(id)}
                          onChange={() => togglePermissao(op, id)}
                          className="h-4 w-4 rounded border-zinc-600 accent-orange-500"
                        />
                        <span className="text-sm text-zinc-300">{label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => salvarPermissoes(op)}
                    disabled={salvandoPermissoes === op.id}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    {salvandoPermissoes === op.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Salvar permissões
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Novo Operador</h3>
              <button onClick={() => setModalAberto(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarOperador} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email de acesso</span>
                <div className="flex gap-2">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operador@email.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
                  <button type="button" onClick={() => setEmail(gerarEmailFicticio(nome, slugEstabelecimento))} title="Gerar email fictício"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-400 transition hover:border-orange-500 hover:text-orange-400">
                    <Wand2 className="h-3.5 w-3.5" />
                    Gerar
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Não precisa ser um email real — é só o login do funcionário no sistema. Pode gerar um automaticamente.
                </p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Senha</span>
                <input type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
              </label>
              <p className="text-xs text-zinc-500">O operador começa com acesso à Cozinha. Ajuste as permissões depois.</p>
              {erro && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">{erro}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalAberto(false)}
                  className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800">Cancelar</button>
                <button type="submit" disabled={criando}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">
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
