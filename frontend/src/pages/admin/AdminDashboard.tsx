import { useEffect, useState } from 'react'
import { Building2, ShoppingBag, Users, Clock, XCircle, Loader2 } from 'lucide-react'
import LayoutAdmin from '../../components/LayoutAdmin'
import { API_URL } from '../../lib/api'

interface Metricas {
  totalEstabelecimentos: number
  estabelecimentosAtivos: number
  estabelecimentosPendentes: number
  estabelecimentosSuspensos: number
  totalPedidos: number
  totalUsuarios: number
}

function KpiCard({
  label, valor, Icone, cor,
}: {
  label: string
  valor: string
  Icone: React.ElementType
  cor: 'orange' | 'emerald' | 'sky' | 'red' | 'zinc'
}) {
  const cores = {
    orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-400' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-400' },
    red:     { bg: 'bg-red-500/10',     text: 'text-red-400' },
    zinc:    { bg: 'bg-zinc-700',       text: 'text-zinc-400' },
  }
  const c = cores[cor]
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

export default function AdminDashboard() {
  const token = localStorage.getItem('token')
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/admin/metricas`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setMetricas)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  if (carregando) {
    return (
      <LayoutAdmin>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      </LayoutAdmin>
    )
  }

  if (!metricas) {
    return (
      <LayoutAdmin>
        <p className="text-center text-zinc-500">Não foi possível carregar as métricas.</p>
      </LayoutAdmin>
    )
  }

  return (
    <LayoutAdmin>
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold">Visão Geral da Plataforma</h2>
        <p className="mt-1 text-sm text-zinc-400">Métricas globais de todos os estabelecimentos</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Estabelecimentos ativos"   valor={metricas.estabelecimentosAtivos.toString()}   Icone={Building2}   cor="emerald" />
        <KpiCard label="Aguardando aprovação"       valor={metricas.estabelecimentosPendentes.toString()} Icone={Clock}       cor="orange"  />
        <KpiCard label="Suspensos"                  valor={metricas.estabelecimentosSuspensos.toString()} Icone={XCircle}     cor="red"     />
        <KpiCard label="Total de usuários"  valor={metricas.totalUsuarios.toString()}  Icone={Users}       cor="sky"  />
        <KpiCard label="Total de pedidos"   valor={metricas.totalPedidos.toString()}   Icone={ShoppingBag} cor="zinc" />
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-500">Receita de licenças</p>
          <p className="mt-3 text-2xl font-extrabold text-zinc-600">—</p>
          <p className="mt-1 text-xs text-zinc-600">Cobrança por assinatura em breve</p>
        </div>
      </div>
    </LayoutAdmin>
  )
}
