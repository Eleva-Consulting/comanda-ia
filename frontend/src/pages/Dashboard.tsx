import { useEffect, useState } from 'react'
import { Wallet, ShoppingBag, TrendingUp, Receipt, Loader2, Star, type LucideIcon } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface AvaliacaoRecente {
  clienteNome: string
  avaliacao: number
  comentarioAvaliacao: string | null
  criadoEm: string
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
    tipoEntrega: string
  }>
  estatisticas: {
    emAndamento: number
    totalPedidos: number
    faturamentoTotal: number
    ticketMedio: number
  }
  avaliacoes: {
    media: number | null
    total: number
    distribuicao: Array<{ nota: number; quantidade: number }>
    recentes: AvaliacaoRecente[]
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

function Estrelas({ nota, tamanho = 'sm' }: { nota: number; tamanho?: 'sm' | 'lg' }) {
  const cls = tamanho === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5'
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} ${n <= nota ? 'fill-orange-400 text-orange-400' : 'text-zinc-700'}`}
        />
      ))}
    </div>
  )
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
        <div className="text-center text-zinc-500">Não foi possível carregar o dashboard.</div>
      </Layout>
    )
  }

  const { avaliacoes } = dados
  const maxDistribuicao = Math.max(...(avaliacoes.distribuicao.map((d) => d.quantidade)), 1)

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold">Olá, {dados.estabelecimento.nome}</h2>
        <p className="mt-1 text-sm text-zinc-400">Visão geral do seu estabelecimento hoje</p>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Faturamento (hoje)"
          valor={formatarBRL(dados.estatisticas.faturamentoTotal)}
          Icone={Wallet}
          cor="emerald"
        />
        <KpiCard
          label="Pedidos (hoje)"
          valor={dados.estatisticas.totalPedidos.toString()}
          Icone={ShoppingBag}
          cor="orange"
        />
        <KpiCard
          label="Em andamento"
          valor={dados.estatisticas.emAndamento.toString()}
          Icone={TrendingUp}
          cor="sky"
        />
        <KpiCard
          label="Ticket médio (hoje)"
          valor={formatarBRL(dados.estatisticas.ticketMedio)}
          Icone={Receipt}
          cor="purple"
        />
      </div>

      {/* Avaliações */}
      {avaliacoes.total > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Resumo */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="mb-5 text-lg font-bold">Avaliações dos clientes</h3>

            <div className="mb-5 flex items-center gap-5">
              <div className="text-center">
                <p className="text-5xl font-extrabold text-orange-400">
                  {avaliacoes.media?.toFixed(1) ?? '—'}
                </p>
                <div className="mt-2 flex justify-center">
                  <Estrelas nota={Math.round(avaliacoes.media ?? 0)} tamanho="lg" />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {avaliacoes.total} {avaliacoes.total === 1 ? 'avaliação' : 'avaliações'}
                </p>
              </div>

              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const item = avaliacoes.distribuicao.find((d) => d.nota === n)
                  const qtd = item?.quantidade ?? 0
                  const pct = Math.round((qtd / maxDistribuicao) * 100)
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-right text-zinc-400">{n}</span>
                      <Star className="h-3 w-3 fill-orange-400 text-orange-400 shrink-0" />
                      <div className="flex-1 overflow-hidden rounded-full bg-zinc-800 h-2">
                        <div
                          className="h-full rounded-full bg-orange-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-4 text-zinc-500">{qtd}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Comentários recentes */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="mb-5 text-lg font-bold">Comentários recentes</h3>
            {avaliacoes.recentes.filter((a) => a.comentarioAvaliacao).length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum comentário ainda.</p>
            ) : (
              <div className="space-y-4">
                {avaliacoes.recentes
                  .filter((a) => a.comentarioAvaliacao)
                  .map((a, i) => (
                    <div key={i} className="rounded-xl bg-zinc-950 p-4">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-zinc-100">{a.clienteNome}</span>
                        <Estrelas nota={a.avaliacao} />
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        "{a.comentarioAvaliacao}"
                      </p>
                      <p className="mt-1.5 text-xs text-zinc-600">{formatarData(a.criadoEm)}</p>
                    </div>
                  ))}
              </div>
            )}

            {/* Avaliações sem comentário */}
            {avaliacoes.recentes.filter((a) => !a.comentarioAvaliacao).length > 0 && (
              <div className="mt-4 space-y-2">
                {avaliacoes.recentes
                  .filter((a) => !a.comentarioAvaliacao)
                  .map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-2.5">
                      <span className="text-sm text-zinc-400">{a.clienteNome}</span>
                      <Estrelas nota={a.avaliacao} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pedidos recentes */}
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
                    <p className="font-medium">
                      {p.clienteNome} <span className="ml-1">{p.tipoEntrega === 'entrega' ? '🛵' : '🏪'}</span>
                    </p>
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
