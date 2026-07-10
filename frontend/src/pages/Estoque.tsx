import { useEffect, useState } from 'react'
import { TrendingUp, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Insumo {
  id: string
  nome: string
  unidade: string
}

interface LinhaConsumo {
  insumoId: string
  quantidade: string
}

interface LucroDia {
  data: string
  faturamento: number
  custoInsumos: number
  lucro: number
}

interface VendaDia {
  tipo: 'pedido' | 'pagamento'
  id: string
  descricao: string
  formaPagamento: string
  valor: number
}

interface InsumoConsumidoDia {
  insumoId: string
  nome: string
  unidade: string
  quantidade: number
  custoUnitarioSnapshot: number
  custoTotal: number
}

interface LucroDiaDetalhado extends LucroDia {
  vendas: VendaDia[]
  insumos: InsumoConsumidoDia[]
}

const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Estoque() {
  const token = localStorage.getItem('token')
  const [insumos, setInsumos] = useState<Insumo[]>([])

  const [data, setData] = useState(hojeISO())
  const [linhas, setLinhas] = useState<LinhaConsumo[]>([{ insumoId: '', quantidade: '' }])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [resultado, setResultado] = useState<LucroDiaDetalhado | null>(null)
  const [carregandoResultado, setCarregandoResultado] = useState(false)

  const [historico, setHistorico] = useState<LucroDia[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/insumos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setInsumos)
      .catch(console.error)
  }, [token])

  function carregarHistorico() {
    setCarregandoHistorico(true)
    fetch(`${API_URL}/estoque/historico`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setHistorico)
      .catch(console.error)
      .finally(() => setCarregandoHistorico(false))
  }

  useEffect(() => {
    carregarHistorico()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function adicionarLinha() {
    setLinhas((prev) => [...prev, { insumoId: '', quantidade: '' }])
  }

  function removerLinha(index: number) {
    setLinhas((prev) => prev.filter((_, i) => i !== index))
  }

  function atualizarLinha(index: number, campo: keyof LinhaConsumo, valor: string) {
    setLinhas((prev) => prev.map((linha, i) => (i === index ? { ...linha, [campo]: valor } : linha)))
  }

  async function lancarConsumo() {
    const itens = linhas
      .filter((l) => l.insumoId && Number(l.quantidade) > 0)
      .map((l) => ({ insumoId: l.insumoId, quantidade: Number(l.quantidade) }))

    if (itens.length === 0) { setErro('Informe pelo menos um insumo com quantidade'); return }

    setSalvando(true)
    setErro(null)
    try {
      const resp = await fetch(`${API_URL}/estoque/consumo-diario`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, itens }),
      })
      const resultadoResp = await resp.json()
      if (!resp.ok) { setErro(resultadoResp.erro ?? 'Não foi possível lançar o consumo'); return }
      setResultado(resultadoResp)
      setLinhas([{ insumoId: '', quantidade: '' }])
      carregarHistorico()
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  async function consultarDia() {
    setCarregandoResultado(true)
    setErro(null)
    try {
      const resp = await fetch(`${API_URL}/estoque/lucro-dia?data=${data}`, { headers: { Authorization: `Bearer ${token}` } })
      setResultado(await resp.json())
    } catch {
      setErro('Falha ao consultar o dia')
    } finally {
      setCarregandoResultado(false)
    }
  }

  return (
    <Layout>
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <TrendingUp className="h-6 w-6" /> Resultados — Consumo do dia
      </h2>

      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-zinc-400">Dia de funcionamento</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
          />
          <button onClick={consultarDia} className="text-xs text-orange-400 hover:text-orange-300">
            Ver lucro desse dia
          </button>
        </div>

        <div className="space-y-2">
          {linhas.map((linha, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={linha.insumoId}
                onChange={(e) => atualizarLinha(index, 'insumoId', e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              >
                <option value="">Selecione o insumo</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>
                ))}
              </select>
              <input
                type="number" step="0.001" min="0"
                value={linha.quantidade}
                onChange={(e) => atualizarLinha(index, 'quantidade', e.target.value)}
                placeholder="Quantidade"
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {linhas.length > 1 && (
                <button onClick={() => removerLinha(index)} className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={adicionarLinha} className="mt-2 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
          <Plus className="h-3.5 w-3.5" /> Adicionar insumo
        </button>

        {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}

        <button
          onClick={lancarConsumo}
          disabled={salvando}
          className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {salvando ? 'Lançando...' : 'Lançar consumo do dia'}
        </button>
      </div>

      {carregandoResultado ? (
        <Loader2 className="mb-6 h-6 w-6 animate-spin text-zinc-500" />
      ) : resultado && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">Faturamento confirmado</p>
            <p className="text-xl font-bold text-zinc-100">R$ {resultado.faturamento.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">Custo dos insumos</p>
            <p className="text-xl font-bold text-zinc-100">R$ {resultado.custoInsumos.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">Lucro real do dia</p>
            <p className={`text-xl font-bold ${resultado.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              R$ {resultado.lucro.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {resultado && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h4 className="mb-3 text-sm font-bold text-zinc-300">Vendas do dia ({resultado.vendas.length})</h4>
            {resultado.vendas.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma venda confirmada nesse dia.</p>
            ) : (
              <ul className="space-y-2">
                {resultado.vendas.map((venda) => (
                  <li key={`${venda.tipo}-${venda.id}`} className="flex items-center justify-between border-b border-zinc-800 pb-2 text-sm last:border-0 last:pb-0">
                    <div>
                      <p className="text-zinc-200">{venda.descricao}</p>
                      <p className="text-xs text-zinc-500">{LABEL_FORMA_PAGAMENTO[venda.formaPagamento] ?? venda.formaPagamento}</p>
                    </div>
                    <span className="font-medium text-zinc-100">R$ {venda.valor.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h4 className="mb-3 text-sm font-bold text-zinc-300">Insumos consumidos ({resultado.insumos.length})</h4>
            {resultado.insumos.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum insumo lançado nesse dia.</p>
            ) : (
              <ul className="space-y-2">
                {resultado.insumos.map((insumo, index) => (
                  <li key={`${insumo.insumoId}-${index}`} className="flex items-center justify-between border-b border-zinc-800 pb-2 text-sm last:border-0 last:pb-0">
                    <div>
                      <p className="text-zinc-200">{insumo.nome}</p>
                      <p className="text-xs text-zinc-500">
                        {insumo.quantidade} {insumo.unidade} × R$ {insumo.custoUnitarioSnapshot.toFixed(4)}
                      </p>
                    </div>
                    <span className="font-medium text-zinc-100">R$ {insumo.custoTotal.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <h3 className="mb-3 text-lg font-bold">Histórico</h3>
      {carregandoHistorico ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : historico.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-zinc-400">
          <AlertTriangle className="h-4 w-4" /> Nenhum consumo lançado ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Dia</th>
                <th className="px-4 py-3">Faturamento</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {historico.map((dia) => (
                <tr key={dia.data} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">{new Date(`${dia.data}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-zinc-400">R$ {dia.faturamento.toFixed(2)}</td>
                  <td className="px-4 py-3 text-zinc-400">R$ {dia.custoInsumos.toFixed(2)}</td>
                  <td className={`px-4 py-3 font-medium ${dia.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    R$ {dia.lucro.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
