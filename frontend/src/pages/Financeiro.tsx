import { useEffect, useState } from 'react'
import { Landmark, Loader2, Calendar } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import Layout from '../components/Layout'
import FiltroPeriodo from '../components/FiltroPeriodo'
import { API_URL } from '../lib/api'

interface VendaDia {
  data: string
  pedidos: number
  faturamento: number
}

interface FinanceiroData {
  periodo: { inicio: string; fim: string }
  porFormaPagamento: Array<{ formaPagamento: string; quantidade: number; total: number }>
  totalGeral: number
  vendasPorDia: VendaDia[]
  topDias: Array<{ data: string; faturamento: number }>
}

const formaPagamentoLabel: Record<string, string> = {
  pix:            'Pix',
  pix_maquininha: 'Pix (maquininha)',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito:  'Cartão de débito',
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDia(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export default function Financeiro() {
  const token = localStorage.getItem('token')
  const [dados, setDados] = useState<FinanceiroData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null)

  useEffect(() => {
    if (!token) return

    const params = periodo ? `?inicio=${periodo.inicio}&fim=${periodo.fim}` : ''
    setCarregando(true)
    fetch(`${API_URL}/meu-estabelecimento/financeiro${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: FinanceiroData) => setDados(d))
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token, periodo])

  if (carregando && !dados) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      </Layout>
    )
  }

  if (!dados) {
    return (
      <Layout>
        <div className="text-center text-zinc-500">Não foi possível carregar o financeiro.</div>
      </Layout>
    )
  }

  const graficoData = dados.vendasPorDia.map((d) => ({
    ...d,
    label: formatarDia(d.data),
  }))

  return (
    <Layout>
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
        <Landmark className="h-6 w-6" /> Financeiro
      </h2>

      <FiltroPeriodo onMudarPeriodo={(inicio, fim) => setPeriodo({ inicio, fim })} />

      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-sm text-zinc-400">
          Total no período ({formatarDia(dados.periodo.inicio)} a {formatarDia(dados.periodo.fim)})
        </p>
        <p className="mt-1 text-4xl font-extrabold text-emerald-400">{formatarBRL(dados.totalGeral)}</p>
      </div>

      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-bold">Por forma de pagamento</h3>
        {dados.porFormaPagamento.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma venda no período selecionado.</p>
        ) : (
          <div className="space-y-2">
            {dados.porFormaPagamento.map((item) => (
              <div
                key={item.formaPagamento}
                className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{formaPagamentoLabel[item.formaPagamento] ?? item.formaPagamento}</p>
                  <p className="text-xs text-zinc-500">{item.quantidade} venda{item.quantidade !== 1 ? 's' : ''}</p>
                </div>
                <span className="font-bold">{formatarBRL(item.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top 5 dias */}
      {dados.topDias.length > 0 && (
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-orange-400" /> Dias que mais venderam
          </h3>
          <div className="space-y-2">
            {dados.topDias.map((d, i) => (
              <div key={d.data} className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-2.5">
                <span className="text-sm text-zinc-400">
                  <span className="mr-2 text-zinc-600">#{i + 1}</span>
                  {formatarDia(d.data)}
                </span>
                <span className="font-bold text-emerald-400">{formatarBRL(d.faturamento)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico de vendas */}
      {graficoData.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-6 text-lg font-bold">
            Faturamento — {formatarDia(dados.periodo.inicio)} a {formatarDia(dados.periodo.fim)}
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={graficoData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => `R$${v}`}
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#f4f4f5' }}
                formatter={(value) => [formatarBRL(Number(value)), 'Faturamento']}
                labelFormatter={(l) => `Dia ${l}`}
              />
              <Bar dataKey="faturamento" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Layout>
  )
}
