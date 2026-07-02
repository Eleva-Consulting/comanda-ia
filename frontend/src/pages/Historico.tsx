import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, ShoppingBag } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

// helpers
function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const statusLabel: Record<string, string> = {
  recebido:   'Recebido',
  em_preparo: 'Em preparo',
  pronto:     'Pronto',
  a_caminho:  'A caminho',
  entregue:   'Entregue',
  cancelado:  'Cancelado',
}

const statusColor: Record<string, string> = {
  recebido:   'bg-orange-500/20 text-orange-400',
  em_preparo: 'bg-yellow-500/20 text-yellow-400',
  pronto:     'bg-blue-500/20 text-blue-400',
  a_caminho:  'bg-violet-500/20 text-violet-400',
  entregue:   'bg-green-500/20 text-green-400',
  cancelado:  'bg-red-500/20 text-red-400',
}

interface ItemPedido {
  id:         string
  nomeItem:   string
  quantidade: number
  precoUnit:  number | string
  observacao: string | null
}

interface Pedido {
  id:              string
  clienteNome:     string
  clienteFone:     string | null
  enderecoEntrega: string | null
  bairroNome:      string | null
  status:          string
  total:           number | string
  criadoEm:        string
  itens:           ItemPedido[]
  formaPagamento:  string
  tipoEntrega:     string
}

interface Resultado {
  dados:   Pedido[]
  proximo: string | null
}

export default function Historico() {
  const token    = localStorage.getItem('token')
  const [de, setDe]         = useState(hoje())
  const [ate, setAte]       = useState(hoje())
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())

  const buscar = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/pedidos?dataInicio=${de}&dataFim=${ate}&limite=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        const json: Resultado = await resp.json()
        setPedidos(json.dados)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [token, de, ate])

  useEffect(() => { buscar() }, [buscar])

  function toggleExpand(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <h1 className="text-2xl font-bold">Histórico de Pedidos</h1>

        {/* Filtro de data */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">De</span>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">Até</span>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500"
            />
          </label>
          <button
            onClick={buscar}
            disabled={loading}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {/* Resumo */}
        {pedidos && (() => {
          const ativos    = pedidos.filter((p) => p.status !== 'cancelado')
          const receita   = ativos.reduce((s, p) => s + Number(p.total), 0)
          const quantidade = ativos.length
          return (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center">
                <p className="text-2xl font-extrabold text-orange-400">{quantidade}</p>
                <p className="mt-1 text-xs text-zinc-400">Pedidos</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center">
                <p className="text-2xl font-extrabold text-orange-400">{fmt(receita)}</p>
                <p className="mt-1 text-xs text-zinc-400">Receita</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center">
                <p className="text-2xl font-extrabold text-orange-400">
                  {quantidade > 0 ? fmt(receita / quantidade) : 'R$ 0,00'}
                </p>
                <p className="mt-1 text-xs text-zinc-400">Ticket médio</p>
              </div>
            </div>
          )
        })()}

        {/* Lista de pedidos */}
        {pedidos && pedidos.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-600">
            <ShoppingBag className="h-12 w-12" />
            <p>Nenhum pedido no período selecionado</p>
          </div>
        )}

        {pedidos && pedidos.map((pedido) => {
          const aberto = expandido.has(pedido.id)
          const hora   = new Date(pedido.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          const data   = new Date(pedido.criadoEm).toLocaleDateString('pt-BR')
          return (
            <div key={pedido.id} className="rounded-2xl border border-zinc-800 bg-zinc-900">
              <button
                onClick={() => toggleExpand(pedido.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-lg px-2.5 py-0.5 text-xs font-medium ${statusColor[pedido.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {pedido.status === 'entregue' && pedido.tipoEntrega === 'retirada'
                      ? 'Retirado'
                      : statusLabel[pedido.status] ?? pedido.status}
                  </span>
                  <div>
                    <p className="font-medium">{pedido.clienteNome}</p>
                    <p className="text-xs text-zinc-500">{data} {hora}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-orange-400">{fmt(pedido.total)}</span>
                  {aberto ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                </div>
              </button>

              {aberto && (
                <div className="border-t border-zinc-800 p-4">
                  {pedido.clienteFone && (
                    <p className="mb-2 text-xs text-zinc-500">Fone: {pedido.clienteFone}</p>
                  )}
                  {pedido.tipoEntrega === 'entrega' && pedido.enderecoEntrega && (
                    <p className="mb-2 text-xs text-zinc-500">
                      {pedido.bairroNome && <span className="font-medium text-zinc-400">{pedido.bairroNome} — </span>}
                      {pedido.enderecoEntrega}
                    </p>
                  )}
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      {pedido.tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏪 Retirada'}
                    </span>
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      {({ pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Crédito', cartao_debito: 'Débito' } as Record<string, string>)[pedido.formaPagamento] ?? pedido.formaPagamento}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {pedido.itens.map((item) => (
                      <div key={item.id}>
                        <div className="flex justify-between text-sm">
                          <span>{item.quantidade}x {item.nomeItem}</span>
                          <span className="text-zinc-400">{fmt(Number(item.precoUnit) * item.quantidade)}</span>
                        </div>
                        {item.observacao && (
                          <p className="ml-4 text-xs italic text-zinc-500">{item.observacao}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 text-sm font-semibold">
                    <span>Total</span>
                    <span className="text-orange-400">{fmt(pedido.total)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Layout>
  )
}
