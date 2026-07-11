import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Package, Plus, Pencil, Loader2, X, ArrowUpDown } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

type Unidade = 'g' | 'kg' | 'ml' | 'l' | 'un'
type TipoMovimento = 'entrada' | 'perda' | 'ajuste'

const LABEL_UNIDADE: Record<Unidade, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', un: 'un' }

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarQuantidade(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

interface Insumo {
  id: string
  nome: string
  unidade: Unidade
  custoUnitario: number
  estoqueAtual: number
}

export default function Insumos() {
  const token = localStorage.getItem('token')
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Insumo | null>(null)
  const [nome, setNome] = useState('')
  const [unidade, setUnidade] = useState<Unidade>('kg')
  const [custoUnitario, setCustoUnitario] = useState('')
  const [estoqueInicial, setEstoqueInicial] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState<string | null>(null)

  const [movimento, setMovimento] = useState<Insumo | null>(null)
  const [tipoMovimento, setTipoMovimento] = useState<TipoMovimento>('entrada')
  const [quantidadeMovimento, setQuantidadeMovimento] = useState('')
  const [motivoMovimento, setMotivoMovimento] = useState('')
  const [enviandoMovimento, setEnviandoMovimento] = useState(false)
  const [erroMovimento, setErroMovimento] = useState<string | null>(null)

  function carregar() {
    setCarregando(true)
    fetch(`${API_URL}/insumos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setInsumos)
      .catch(() => setErro('Falha ao carregar insumos'))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirCriar() {
    setEditando(null)
    setNome('')
    setUnidade('kg')
    setCustoUnitario('')
    setEstoqueInicial('')
    setErroModal(null)
    setModalAberto(true)
  }

  function abrirEditar(insumo: Insumo) {
    setEditando(insumo)
    setNome(insumo.nome)
    setUnidade(insumo.unidade)
    setCustoUnitario(String(insumo.custoUnitario))
    setEstoqueInicial('')
    setErroModal(null)
    setModalAberto(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErroModal(null)
    try {
      const url    = editando ? `${API_URL}/insumos/${editando.id}` : `${API_URL}/insumos`
      const method = editando ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = { nome, unidade, custoUnitario: Number(custoUnitario) }
      if (!editando && estoqueInicial) body.estoqueInicial = Number(estoqueInicial)

      const resp = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroModal(data.erro ?? 'Não foi possível salvar'); return }
      setModalAberto(false)
      carregar()
    } catch {
      setErroModal('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  function abrirMovimento(insumo: Insumo) {
    setMovimento(insumo)
    setTipoMovimento('entrada')
    setQuantidadeMovimento('')
    setMotivoMovimento('')
    setErroMovimento(null)
  }

  async function confirmarMovimento() {
    if (!movimento) return
    const quantidade = Number(quantidadeMovimento)
    if (!quantidade || (tipoMovimento !== 'ajuste' && quantidade <= 0)) {
      setErroMovimento('Informe uma quantidade válida')
      return
    }
    if (tipoMovimento !== 'entrada' && !motivoMovimento) {
      setErroMovimento('Motivo é obrigatório')
      return
    }

    setEnviandoMovimento(true)
    setErroMovimento(null)
    try {
      const endpoint = tipoMovimento === 'entrada' ? 'entrada' : tipoMovimento === 'perda' ? 'perda' : 'ajuste'
      const body: Record<string, unknown> = { insumoId: movimento.id, quantidade }
      if (tipoMovimento !== 'entrada') body.motivo = motivoMovimento

      const resp = await fetch(`${API_URL}/estoque/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroMovimento(data.erro ?? 'Não foi possível registrar'); return }
      setMovimento(null)
      carregar()
    } catch {
      setErroMovimento('Falha de conexão')
    } finally {
      setEnviandoMovimento(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-extrabold">
          <Package className="h-6 w-6" /> Insumos
        </h2>
        <button
          onClick={abrirCriar}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" /> Novo insumo
        </button>
      </div>

      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}

      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : insumos.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum insumo cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Unidade</th>
                <th className="px-4 py-3">Custo unitário</th>
                <th className="px-4 py-3">Estoque atual</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {insumos.map((insumo) => (
                <tr key={insumo.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3 font-medium">{insumo.nome}</td>
                  <td className="px-4 py-3 text-zinc-400">{LABEL_UNIDADE[insumo.unidade]}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatarBRL(insumo.custoUnitario)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatarQuantidade(insumo.estoqueAtual)} {LABEL_UNIDADE[insumo.unidade]}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => abrirMovimento(insumo)}
                      className="mr-1 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="Movimentar estoque"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirEditar(insumo)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setModalAberto(false)}>
          <form onSubmit={salvar} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editando ? 'Editar insumo' : 'Novo insumo'}</h3>
              <button type="button" onClick={() => setModalAberto(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome (ex: Maminha, Arroz, Coca-Cola 2L)"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as Unidade)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              >
                {(['g', 'kg', 'ml', 'l', 'un'] as Unidade[]).map((u) => (
                  <option key={u} value={u}>{LABEL_UNIDADE[u]}</option>
                ))}
              </select>
              <input
                type="number" step="0.0001" min="0"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
                placeholder="Custo por unidade (R$)"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {!editando && (
                <input
                  type="number" step="0.001" min="0"
                  value={estoqueInicial}
                  onChange={(e) => setEstoqueInicial(e.target.value)}
                  placeholder="Estoque inicial (opcional)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroModal && <p className="mt-2 text-sm text-red-400">{erroModal}</p>}
            <button
              type="submit"
              disabled={salvando}
              className="mt-3 w-full rounded-lg bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        </div>
      )}

      {movimento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMovimento(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Movimentar {movimento.nome}</h3>
            <div className="space-y-2">
              <select
                value={tipoMovimento}
                onChange={(e) => setTipoMovimento(e.target.value as TipoMovimento)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              >
                <option value="entrada">Entrada (reposição/compra)</option>
                <option value="perda">Perda/quebra</option>
                <option value="ajuste">Ajuste de contagem (+ ou -)</option>
              </select>
              <input
                type="number" step="0.001"
                value={quantidadeMovimento}
                onChange={(e) => setQuantidadeMovimento(e.target.value)}
                placeholder={tipoMovimento === 'ajuste' ? 'Quantidade (negativo = faltou)' : 'Quantidade'}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {tipoMovimento !== 'entrada' && (
                <input
                  value={motivoMovimento}
                  onChange={(e) => setMotivoMovimento(e.target.value)}
                  placeholder="Motivo (obrigatório)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroMovimento && <p className="mt-2 text-sm text-red-400">{erroMovimento}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmarMovimento}
                disabled={enviandoMovimento}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button onClick={() => setMovimento(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
