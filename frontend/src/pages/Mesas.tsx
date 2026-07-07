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

  async function abrirMesa(mesaId: string) {
    setAbrindoMesaId(mesaId)
    setErroGrade(null)
    try {
      const resp = await fetch(`${API_URL}/contas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesaId }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroGrade(dados.erro ?? 'Falha ao abrir mesa'); return }
      setContaSelecionada(dados)
      carregarMesas()
    } catch {
      setErroGrade('Falha de conexão')
    } finally {
      setAbrindoMesaId(null)
    }
  }

  async function abrirContaExistente(mesa: Mesa) {
    if (!mesa.contaAbertaId) return
    setCarregandoConta(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${mesa.contaAbertaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const dados = await resp.json()
      if (resp.ok) setContaSelecionada(dados)
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoConta(false)
    }
  }

  function fecharDetalhe() {
    setContaSelecionada(null)
    carregarMesas()
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
                  onClick={() => mesa.statusMesa === 'livre' ? abrirMesa(mesa.id) : abrirContaExistente(mesa)}
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
          <div className="mb-6 flex items-center justify-between">
            <button onClick={fecharDetalhe} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              ← Mesas
            </button>
            <h2 className="text-xl font-extrabold">Mesa {contaSelecionada.mesa.numero}</h2>
          </div>

          <div className="space-y-4">
            {contaSelecionada.comandas.map((comanda) => (
              <div key={comanda.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{comanda.nome}</span>
                </div>

                {comanda.itens.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhum item ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {comanda.itens.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <span className="font-medium">{item.quantidade}x {item.nomeItem}</span>
                          {item.observacao && <p className="text-xs text-zinc-500">{item.observacao}</p>}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                          {labelStatusItem[item.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}
