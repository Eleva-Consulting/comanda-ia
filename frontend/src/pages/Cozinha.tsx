import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChefHat, Clock, User, LogOut } from 'lucide-react'
import { useSocket } from '../hooks/useSocket'

type Status = 'novo' | 'preparo' | 'pronto' | 'entregue' | 'cancelado'

interface ItemPedido {
  id: string
  nomeItem: string
  quantidade: number
  precoUnit: number | string
}

interface Pedido {
  id: string
  clienteNome: string
  clienteFone: string
  total: number | string
  status: Status
  criadoEm: string
  itens: ItemPedido[]
}

const statusConfig: Record<Status, { label: string; badge: string }> = {
  novo: { label: 'Novo', badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  preparo: { label: 'Em preparo', badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30' },
  pronto: { label: 'Pronto', badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  entregue: { label: 'Entregue', badge: 'bg-zinc-700 text-zinc-400 ring-1 ring-zinc-600' },
  cancelado: { label: 'Cancelado', badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' },
}

function formatarTempo(criadoEm: string): string {
  const diff = Date.now() - new Date(criadoEm).getTime()
  const minutos = Math.floor(diff / 60000)
  if (minutos < 1) return 'agora'
  if (minutos === 1) return 'há 1 min'
  return `há ${minutos} min`
}

export default function Cozinha() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const { socket, conectado, erro } = useSocket(token)

  useEffect(() => {
    if (!socket) return

    const handler = (pedido: Pedido) => {
      setPedidos((prev) => [pedido, ...prev])
    }

    socket.on('pedido:novo', handler)
    return () => {
      socket.off('pedido:novo', handler)
    }
  }, [socket])

  function handleSair() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
              <ChefHat className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Comanda IA</h1>
              <p className="text-sm text-zinc-400">Painel da Cozinha</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusConexao conectado={conectado} erro={erro} />
            <button
              onClick={handleSair}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Pedidos</h2>
          <span className="text-sm text-zinc-400">{pedidos.length} ativos</span>
        </div>

        {pedidos.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 text-center">
            <p className="text-lg font-semibold text-zinc-400">Aguardando pedidos...</p>
            <p className="mt-2 max-w-md text-sm text-zinc-500">
              Os pedidos aparecerão aqui em tempo real assim que chegarem.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pedidos.map((pedido) => {
              const cfg = statusConfig[pedido.status] ?? statusConfig.novo
              return (
                <div
                  key={pedido.id}
                  className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-700"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs text-zinc-500">
                        #{pedido.id.slice(0, 8)}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="text-xs">{formatarTempo(pedido.criadoEm)}</span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.badge}`}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  <div className="mb-4 flex items-center gap-2">
                    <User className="h-4 w-4 text-zinc-500" />
                    <span className="font-semibold">{pedido.clienteNome}</span>
                  </div>

                  <div className="mb-4 flex-1 space-y-2 border-t border-zinc-800 pt-4">
                    {pedido.itens.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-sm font-bold text-orange-400">
                          {item.quantidade}
                        </span>
                        <span className="text-sm text-zinc-200">{item.nomeItem}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                    <span className="text-lg font-bold">
                      R$ {Number(pedido.total).toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function StatusConexao({ conectado, erro }: { conectado: boolean; erro: string | null }) {
  if (erro) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
        <span className="text-sm font-medium text-red-300">{erro}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {conectado && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            conectado ? 'bg-emerald-500' : 'bg-zinc-500'
          }`}
        ></span>
      </span>
      <span className="text-sm font-medium text-zinc-300">
        {conectado ? 'Cozinha conectada' : 'Conectando...'}
      </span>
    </div>
  )
}