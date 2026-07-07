import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface Mesa {
  id: string
  numero: string
  area: string | null
  capacidade: number | null
  contaAbertaId: string | null
  statusMesa: 'livre' | 'aberta' | 'aguardando_pagamento'
}

type StatusProducao = 'recebido' | 'em_preparo' | 'pronto' | 'entregue' | 'cancelado'

interface ItemComanda {
  id: string
  nomeItem: string
  quantidade: number
  precoUnit: number
  observacao: string | null
  status: StatusProducao
  comandaId: string
}

interface Comanda {
  id: string
  nome: string
  contaId: string
  itens: ItemComanda[]
}

interface Conta {
  id: string
  status: 'aberta' | 'aguardando_pagamento' | 'fechada' | 'cancelada'
  mesa: Mesa
  comandas: Comanda[]
}

interface ItemCardapio {
  id: string
  nome: string
  preco: number
  disponivel: boolean
}

// ── Helpers visuais ────────────────────────────────────────────────────────

const corStatusMesa: Record<Mesa['statusMesa'], string> = {
  livre:                'border-zinc-800 bg-zinc-900 hover:border-orange-500/50',
  aberta:               'border-orange-500/40 bg-orange-500/10',
  aguardando_pagamento: 'border-blue-500/40 bg-blue-500/10',
}

const labelStatusMesa: Record<Mesa['statusMesa'], string> = {
  livre:                'Livre',
  aberta:               'Ocupada',
  aguardando_pagamento: 'Aguardando pagamento',
}

const corStatusItem: Record<StatusProducao, string> = {
  recebido:   'bg-zinc-800 text-zinc-300',
  em_preparo: 'bg-yellow-500/10 text-yellow-400',
  pronto:     'bg-emerald-500/10 text-emerald-400',
  entregue:   'bg-zinc-800 text-zinc-500',
  cancelado:  'bg-red-500/10 text-red-400 line-through',
}

const labelStatusItem: Record<StatusProducao, string> = {
  recebido:   'Recebido',
  em_preparo: 'Em preparo',
  pronto:     'Pronto',
  entregue:   'Entregue',
  cancelado:  'Cancelado',
}

export default function Mesas() {
  const token = localStorage.getItem('token')

  const [modulosAtivos, setModulosAtivos] = useState<string[] | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [carregandoMesas, setCarregandoMesas] = useState(true)
  const [abrindoMesaId, setAbrindoMesaId] = useState<string | null>(null)
  const [carregandoConta, setCarregandoConta] = useState(false)
  const [erroGrade, setErroGrade] = useState<string | null>(null)

  const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null)

  function carregarMesas() {
    fetch(`${API_URL}/mesas`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMesas)
      .catch((err) => { console.error(err); setErroGrade('Falha ao carregar mesas') })
      .finally(() => setCarregandoMesas(false))
  }

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(() => setModulosAtivos([]))
  }, [token])

  useEffect(() => {
    if (modulosAtivos?.includes('mesas')) carregarMesas()
  }, [modulosAtivos])

  if (modulosAtivos !== null && !modulosAtivos.includes('mesas')) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-semibold">Módulo de mesas não habilitado</p>
          <p className="text-sm text-zinc-400">Fale com o suporte pra habilitar esse módulo no seu plano.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {!contaSelecionada ? (
        <div>
          <h2 className="mb-6 text-2xl font-extrabold">Mesas</h2>
          {erroGrade && <p className="mb-4 text-sm text-red-400">{erroGrade}</p>}
          {carregandoMesas ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : mesas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhuma mesa cadastrada. Cadastre em Configurações.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {mesas.map((mesa) => (
                <button
                  key={mesa.id}
                  disabled={abrindoMesaId === mesa.id || carregandoConta}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition disabled:opacity-50 ${corStatusMesa[mesa.statusMesa]}`}
                >
                  {abrindoMesaId === mesa.id
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <span className="text-xl font-bold">{mesa.numero}</span>}
                  <span className="text-xs text-zinc-400">{labelStatusMesa[mesa.statusMesa]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-zinc-400">Detalhe da conta — Task 3</p>
        </div>
      )}
    </Layout>
  )
}
