import { useEffect, useState, type FormEvent } from 'react'
import { Clock, User, Flame, Check, PackageCheck, Truck, XCircle, Printer, Loader2, Plus, Minus, X, PauseCircle, PlayCircle } from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'a_caminho' | 'entregue' | 'cancelado'

interface PedidosResponse {
  dados: Pedido[]
  proximo: string | null
}

interface ItemPedido {
  id:         string
  nomeItem:   string
  quantidade: number
  precoUnit:  number | string
  observacao: string | null
}

interface Pedido {
  id:          string
  clienteNome: string
  clienteFone: string
  total:       number | string
  status:      Status
  criadoEm:   string
  itens:       ItemPedido[]
}

interface ItemCardapio {
  id:         string
  nome:       string
  preco:      number
  disponivel: boolean
  categoria:  { id: string; nome: string; ordem: number } | null
}

const statusConfig: Record<Status, { label: string; badge: string }> = {
  recebido:   { label: 'Novo',       badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  em_preparo: { label: 'Em preparo', badge: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/30' },
  pronto:     { label: 'Pronto',     badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30' },
  a_caminho:  { label: 'A caminho',  badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30' },
  entregue:   { label: 'Entregue',   badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  cancelado:  { label: 'Cancelado',  badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' },
}

const proximaAcao: Partial<Record<Status, { proximoStatus: Status; label: string; Icone: typeof Flame }>> = {
  recebido:   { proximoStatus: 'em_preparo', label: 'Iniciar preparo',   Icone: Flame },
  em_preparo: { proximoStatus: 'pronto',     label: 'Marcar pronto',     Icone: Check },
  pronto:     { proximoStatus: 'a_caminho',  label: 'Saiu para entrega', Icone: Truck },
  a_caminho:  { proximoStatus: 'entregue',   label: 'Marcar entregue',   Icone: PackageCheck },
}

const statusAtivos: Status[] = ['recebido', 'em_preparo', 'pronto', 'a_caminho']

function formatarTempo(criadoEm: string): string {
  const diff = Date.now() - new Date(criadoEm).getTime()
  const minutos = Math.floor(diff / 60000)
  if (minutos < 1) return 'agora'
  if (minutos === 1) return 'há 1 min'
  return `há ${minutos} min`
}

export default function Cozinha() {
  const token = localStorage.getItem('token')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const { socket, conectado, erro } = useSocket(token)

  // Pausa
  const [aceitando, setAceitando]         = useState(true)
  const [togglingPausa, setTogglingPausa] = useState(false)

  // Modal novo pedido
  const [modalAberto, setModalAberto]           = useState(false)
  const [cardapio, setCardapio]                 = useState<ItemCardapio[]>([])
  const [carregandoMenu, setCarregandoMenu]     = useState(false)
  const [clienteNomeModal, setClienteNomeModal] = useState('')
  const [clienteFoneModal, setClienteFoneModal] = useState('')
  const [selecionados, setSelecionados]         = useState<Record<string, { quantidade: number; observacao: string }>>({})
  const [enviandoManual, setEnviandoManual]     = useState(false)
  const [erroModal, setErroModal]               = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    fetch(`${API_URL}/pedidos?status=recebido,em_preparo,pronto,a_caminho&limite=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((resp: PedidosResponse) => {
        if (resp.dados && Array.isArray(resp.dados)) setPedidos(resp.dados)
      })
      .catch((e) => console.error('Erro ao buscar pedidos:', e))
      .finally(() => setCarregandoInicial(false))
  }, [token])

  useEffect(() => {
    if (!socket) return

    const onNovo = (pedido: Pedido) => {
      setPedidos((prev) => [pedido, ...prev])
    }

    const onAtualizado = (pedido: Pedido) => {
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? pedido : p)))
    }

    socket.on('pedido:novo', onNovo)
    socket.on('pedido:atualizado', onAtualizado)

    return () => {
      socket.off('pedido:novo', onNovo)
      socket.off('pedido:atualizado', onAtualizado)
    }
  }, [socket])

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est) => setAceitando(est.aceitandoPedidos ?? true))
      .catch(console.error)
  }, [token])

  async function atualizarStatus(pedidoId: string, novoStatus: Status) {
    setAtualizandoId(pedidoId)
    try {
      const resposta = await fetch(`${API_URL}/pedidos/${pedidoId}`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: novoStatus }),
      })

      if (!resposta.ok) throw new Error('Falha ao atualizar status')

      const pedidoAtualizado: Pedido = await resposta.json()
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoId ? pedidoAtualizado : p))
      )
    } catch (e) {
      console.error('Erro ao atualizar status:', e)
      alert('Não foi possível atualizar o pedido. Tente de novo.')
    } finally {
      setAtualizandoId(null)
    }
  }

  async function cancelarPedido(pedidoId: string) {
    setCancelandoId(pedidoId)
    try {
      const resposta = await fetch(`${API_URL}/pedidos/${pedidoId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: 'cancelado' }),
      })
      if (!resposta.ok) throw new Error('Falha ao cancelar')
      const pedidoAtualizado: Pedido = await resposta.json()
      setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? pedidoAtualizado : p)))
    } catch (e) {
      console.error('Erro ao cancelar pedido:', e)
    } finally {
      setCancelandoId(null)
    }
  }

  async function togglePausa() {
    setTogglingPausa(true)
    try {
      const resp = await fetch(`${API_URL}/meu-estabelecimento`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ aceitandoPedidos: !aceitando }),
      })
      if (resp.ok) setAceitando((v) => !v)
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingPausa(false)
    }
  }

  async function abrirModalNovoPedido() {
    setClienteNomeModal('')
    setClienteFoneModal('')
    setSelecionados({})
    setErroModal(null)
    setModalAberto(true)
    if (cardapio.length > 0) return
    setCarregandoMenu(true)
    try {
      const resp = await fetch(`${API_URL}/cardapio`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const dados: ItemCardapio[] = await resp.json()
      setCardapio(dados.filter((i) => i.disponivel))
    } catch (e) {
      console.error(e)
    } finally {
      setCarregandoMenu(false)
    }
  }

  function alterarQtd(itemId: string, delta: number) {
    setSelecionados((prev) => {
      const atual = prev[itemId]?.quantidade ?? 0
      const nova  = atual + delta
      if (nova <= 0) {
        const { [itemId]: _, ...resto } = prev
        return resto
      }
      return { ...prev, [itemId]: { quantidade: nova, observacao: prev[itemId]?.observacao ?? '' } }
    })
  }

  function alterarObs(itemId: string, observacao: string) {
    setSelecionados((prev) => ({
      ...prev,
      [itemId]: { quantidade: prev[itemId]?.quantidade ?? 1, observacao },
    }))
  }

  const totalManual = cardapio.reduce((soma, item) => {
    const sel = selecionados[item.id]
    return soma + (sel ? item.preco * sel.quantidade : 0)
  }, 0)

  async function criarPedidoManual(e: FormEvent) {
    e.preventDefault()
    setErroModal(null)
    const itens = Object.entries(selecionados).map(([itemCardapioId, { quantidade, observacao }]) => ({
      itemCardapioId,
      quantidade,
      observacao: observacao || undefined,
    }))
    if (itens.length === 0) {
      setErroModal('Selecione pelo menos um item')
      return
    }
    setEnviandoManual(true)
    try {
      const resp = await fetch(`${API_URL}/pedidos/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ clienteNome: clienteNomeModal, clienteFone: clienteFoneModal, itens }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroModal(dados.erro ?? 'Erro ao criar pedido'); return }
      setPedidos((prev) => [dados, ...prev])
      setModalAberto(false)
    } catch {
      setErroModal('Falha de conexão')
    } finally {
      setEnviandoManual(false)
    }
  }

  const pedidosVisiveis = pedidos.filter((p) => statusAtivos.includes(p.status))

  return (
    <Layout headerExtra={
        <div className="flex items-center gap-2">
          <button
            onClick={abrirModalNovoPedido}
            className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Pedido</span>
          </button>
          <button
            onClick={togglePausa}
            disabled={togglingPausa}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              aceitando
                ? 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                : 'border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
            }`}
          >
            {aceitando
              ? <PauseCircle className="h-4 w-4" />
              : <PlayCircle className="h-4 w-4" />}
            <span className="hidden sm:inline">{aceitando ? 'Pausar' : 'Reabrir'}</span>
          </button>
          <StatusConexao conectado={conectado} erro={erro} aceitando={aceitando} />
        </div>
      }>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-extrabold">Pedidos</h2>
        <span className="text-sm text-zinc-400">{pedidosVisiveis.length} ativos</span>
      </div>

      {carregandoInicial ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : pedidosVisiveis.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 text-center">
          <p className="text-lg font-semibold text-zinc-400">Aguardando pedidos...</p>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Os pedidos aparecerão aqui em tempo real assim que chegarem.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pedidosVisiveis.map((pedido) => {
            const cfg = statusConfig[pedido.status]
            const acao = proximaAcao[pedido.status]
            const atualizando = atualizandoId === pedido.id
            const cancelando = cancelandoId === pedido.id

            return (
              <div
                key={pedido.id}
                className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-700"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">#{pedido.id.slice(-6)}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs">{formatarTempo(pedido.criadoEm)}</span>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>

                <div className="mb-4 flex items-center gap-2">
                  <User className="h-4 w-4 text-zinc-500" />
                  <span className="font-semibold">{pedido.clienteNome}</span>
                </div>

                <div className="mb-4 flex-1 space-y-2 border-t border-zinc-800 pt-4">
                  {pedido.itens.map((item) => (
                    <div key={item.id}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-sm font-bold text-orange-400">
                          {item.quantidade}
                        </span>
                        <span className="text-sm text-zinc-200">{item.nomeItem}</span>
                      </div>
                      {item.observacao && (
                        <p className="ml-10 mt-0.5 text-xs text-zinc-500 italic">{item.observacao}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-lg font-bold">R$ {Number(pedido.total).toFixed(2)}</span>
                    <button
                      onClick={() => window.open(`/imprimir/${pedido.id}`, '_blank')}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                      title="Imprimir comanda"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {acao && (
                      <button
                        onClick={() => atualizarStatus(pedido.id, acao.proximoStatus)}
                        disabled={atualizando || cancelando}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                      >
                        {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <acao.Icone className="h-4 w-4" />}
                        {acao.label}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm('Cancelar este pedido?')) cancelarPedido(pedido.id)
                      }}
                      disabled={atualizando || cancelando}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
                      title="Cancelar pedido"
                    >
                      {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Modal novo pedido manual */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="flex h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 p-5">
              <h3 className="text-lg font-bold">Novo Pedido</h3>
              <button onClick={() => setModalAberto(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarPedidoManual} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Nome *</span>
                    <input
                      required
                      value={clienteNomeModal}
                      onChange={(e) => setClienteNomeModal(e.target.value)}
                      placeholder="Nome do cliente"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Telefone *</span>
                    <input
                      required
                      value={clienteFoneModal}
                      onChange={(e) => setClienteFoneModal(e.target.value)}
                      placeholder="85 99999-9999"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-3 text-xs font-medium text-zinc-400">Itens</p>
                  {carregandoMenu ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cardapio.map((item) => {
                        const sel = selecionados[item.id]
                        return (
                          <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{item.nome}</p>
                                <p className="text-xs text-orange-400">R$ {Number(item.preco).toFixed(2)}</p>
                              </div>
                              {sel ? (
                                <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-1 py-1">
                                  <button type="button" onClick={() => alterarQtd(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700">
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="min-w-5 text-center text-sm font-bold">{sel.quantidade}</span>
                                  <button type="button" onClick={() => alterarQtd(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700">
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => alterarQtd(item.id, 1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-600">
                                  <Plus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            {sel && (
                              <input
                                value={sel.observacao}
                                onChange={(e) => alterarObs(item.id, e.target.value)}
                                placeholder="Observação (opcional)"
                                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-orange-500"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {erroModal && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                    {erroModal}
                  </p>
                )}
              </div>
              <div className="border-t border-zinc-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Total</span>
                  <span className="text-xl font-extrabold text-orange-400">R$ {totalManual.toFixed(2)}</span>
                </div>
                <button
                  type="submit"
                  disabled={enviandoManual}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {enviandoManual && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar Pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}

function StatusConexao({ conectado, erro, aceitando }: { conectado: boolean; erro: string | null; aceitando: boolean }) {
  if (erro) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
        <span className="text-sm font-medium text-red-300">{erro}</span>
      </div>
    )
  }
  if (!aceitando) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 ring-1 ring-orange-500/30">
        <span className="h-2.5 w-2.5 rounded-full bg-orange-500"></span>
        <span className="text-sm font-medium text-orange-400">Pausada</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {conectado && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-zinc-500'}`}></span>
      </span>
      <span className="text-sm font-medium text-zinc-300">
        {conectado ? 'Cozinha ativa' : 'Conectando...'}
      </span>
    </div>
  )
}
