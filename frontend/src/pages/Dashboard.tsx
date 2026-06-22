import { useEffect, useState } from 'react'
import { Wallet, ShoppingBag, TrendingUp, Receipt, Loader2, type LucideIcon } from 'lucide-react'
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
import { API_URL } from '../lib/api'

interface VendaDia {
  data: string
  pedidos: number
  faturamento: number
}

interface DashboardData {
  estabelecimento: {
    id: string
    nome: string
    telefone: string
    status: 'pendente' | 'ativo' | 'suspenso'
  }
  cardapio: Array<{
    id: string
    nome: string
    preco: number | string
    disponivel: boolean
  }>
  pedidosRecentes: Array<{
    id: string
    clienteNome: string
    total: number | string
    status: string
    criadoEm: string
  }>
  estatisticas: {
    totalPedidos: number
    faturamentoTotal: number
    ticketMedio: number
    porStatus: Array<{ status: string; quantidade: number }>
    vendasPorDia: VendaDia[]
  }
}

const statusLabel: Record<string, string> = {
  recebido: 'Novo',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

const statusBadgeColor: Record<string, string> = {
  recebido:   'bg-orange-500/10 text-orange-400 ring-orange-500/30',
  em_preparo: 'bg-sky-500/10 text-sky-400 ring-sky-500/30',
  pronto:     'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
  entregue:   'bg-zinc-700 text-zinc-400 ring-zinc-600',
  cancelado:  'bg-red-500/10 text-red-400 ring-red-500/30',
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(data: string): string {
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatarDia(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export default function Dashboard() {
  const token = localStorage.getItem('token')
  const [dados, setDados] = useState<DashboardData | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!token) return

    fetch(`${API_URL}/meu-estabelecimento/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: DashboardData) => setDados(d))
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token])

  if (carregando) {
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
        <div className="text-center text-zinc-500">Não foi possível carregar o dashboard.</div>
      </Layout>
    )
  }

  const emAndamento = dados.estatisticas.porStatus
    .filter((p) => ['recebido', 'em_preparo', 'pronto'].includes(p.status))
    .reduce((s, p) => s + p.quantidade, 0)

  const graficoData = dados.estatisticas.vendasPorDia.map((d) => ({
    ...d,
    label: formatarDia(d.data),
  }))

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold">Olá, {dados.estabelecimento.nome}</h2>
        <p className="mt-1 text-sm text-zinc-400">Visão geral do seu estabelecimento</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Faturamento total"
          valor={formatarBRL(dados.estatisticas.faturamentoTotal)}
          Icone={Wallet}
          cor="emerald"
        />
        <KpiCard
          label="Total de pedidos"
          valor={dados.estatisticas.totalPedidos.toString()}
          Icone={ShoppingBag}
          cor="orange"
        />
        <KpiCard
          label="Em andamento"
          valor={emAndamento.toString()}
          Icone={TrendingUp}
          cor="sky"
        />
        <KpiCard
          label="Ticket médio"
          valor={formatarBRL(dados.estatisticas.ticketMedio)}
          Icone={Receipt}
          cor="purple"
        />
      </div>

      {graficoData.length > 0 && (
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-6 text-lg font-bold">Faturamento — últimos 30 dias</h3>
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-bold">Pedidos recentes</h3>
        {dados.pedidosRecentes.length === 0 ? (
          <p className="text-sm text-zinc-500">Ainda não há pedidos.</p>
        ) : (
          <div className="space-y-2">
            {dados.pedidosRecentes.map((p) => {
              const cor = statusBadgeColor[p.status] ?? statusBadgeColor.recebido
              const label = statusLabel[p.status] ?? p.status
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{p.clienteNome}</p>
                    <p className="text-xs text-zinc-500">{formatarData(p.criadoEm)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cor}`}>
                      {label}
                    </span>
                    <span className="font-bold">{formatarBRL(Number(p.total))}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}

const corClasses: Record<string, { bg: string; text: string }> = {
  orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-400' },
  sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-400' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-400' },
}

function KpiCard({ label, valor, Icone, cor }: { label: string; valor: string; Icone: LucideIcon; cor: string }) {
  const c = corClasses[cor]
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.bg}`}>
          <Icone className={`h-5 w-5 ${c.text}`} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-extrabold">{valor}</p>
    </div>
  )
}
