import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Copy, Check, Loader2, Settings } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Estabelecimento {
  id:               string
  nome:             string
  telefone:         string
  slug:             string
  status:           string
  aceitandoPedidos: boolean
}

export default function Configuracoes() {
  const token = localStorage.getItem('token')

  const [dados, setDados]       = useState<Estabelecimento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso]   = useState(false)
  const [erro, setErro]         = useState<string | null>(null)
  const [copiado, setCopiado]   = useState(false)

  const [nome, setNome]         = useState('')
  const [telefone, setTelefone] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est: Estabelecimento) => {
        setDados(est)
        setNome(est.nome)
        setTelefone(est.telefone)
      })
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(false)
    setSalvando(true)
    try {
      const resp = await fetch(`${API_URL}/meu-estabelecimento`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ nome, telefone }),
      })
      const atualizado = await resp.json()
      if (!resp.ok) { setErro(atualizado.erro ?? 'Erro ao salvar'); return }
      setDados(atualizado)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  function copiarLink() {
    if (!dados) return
    const url = `${window.location.origin}/c/${dados.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  if (carregando) {
    return (
      <Layout>
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-orange-400" />
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>

        {/* Link público */}
        {dados && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="mb-1 text-sm font-medium text-zinc-400">Link do cardápio</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-zinc-950 px-3 py-2.5 text-sm text-orange-400">
                {window.location.origin}/c/{dados.slug}
              </code>
              <button
                onClick={copiarLink}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
              >
                {copiado ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              Envie este link para seus clientes fazerem pedidos pelo celular.
            </p>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={salvar} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="font-semibold text-zinc-200">Dados do estabelecimento</h2>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Nome</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Telefone</span>
            <input
              type="text"
              required
              minLength={8}
              maxLength={20}
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(85) 99999-9999"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          {erro && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erro}
            </p>
          )}

          {sucesso && (
            <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-green-500/30">
              Configurações salvas com sucesso!
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar alterações
            </button>
          </div>
        </form>

        {/* Info somente leitura */}
        {dados && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-200">Informações da conta</h2>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Slug (URL)</span>
              <span className="font-mono text-zinc-300">{dados.slug}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Status</span>
              <span className={`font-medium ${dados.status === 'ativo' ? 'text-green-400' : 'text-yellow-400'}`}>
                {dados.status}
              </span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
