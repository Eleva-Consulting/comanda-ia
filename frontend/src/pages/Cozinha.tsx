import { useEffect, useState, type FormEvent } from 'react'
import { Clock, User, Flame, Check, PackageCheck, Truck, XCircle, Printer, Loader2, Plus, Minus, X, Banknote, Pencil, MapPin } from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

type Status = 'recebido' | 'pagamento_confirmado' | 'em_preparo' | 'pronto' | 'a_caminho' | 'entregue' | 'cancelado'

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
  id:              string
  clienteNome:     string
  clienteFone:     string | null
  enderecoEntrega: string | null
  bairroNome:      string | null
  taxaEntrega:     number | string | null
  total:           number | string
  precisaTroco:    boolean
  trocoPara:       number | string | null
  status:          Status
  criadoEm:        string
  itens:           ItemPedido[]
  formaPagamento:  'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'
  tipoEntrega:     'entrega' | 'retirada'
  origem:          'balcao' | 'publico'
}

interface Bairro {
  id:          string
  nome:        string
  taxaEntrega: number | null
}

const formaPagamentoLabel: Record<string, string> = {
  pix:            'PIX',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Crédito',
  cartao_debito:  'Débito',
}

const tipoEntregaLabel: Record<string, string> = {
  entrega:  '🛵 Entrega',
  retirada: '🏪 Retirada',
}

interface ItemCardapio {
  id:         string
  nome:       string
  preco:      number
  disponivel: boolean
  categoria:  { id: string; nome: string; ordem: number } | null
}

const statusConfig: Record<Status, { label: string; badge: string }> = {
  recebido:              { label: 'Aguard. pgto',     badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  pagamento_confirmado:  { label: 'Pgto. confirmado', badge: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30' },
  em_preparo:            { label: 'Em preparo',        badge: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/30' },
  pronto:                { label: 'Pronto',            badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30' },
  a_caminho:             { label: 'A caminho',         badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30' },
  entregue:              { label: 'Entregue',          badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  cancelado:             { label: 'Cancelado',         badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' },
}

/** Rótulo do status exibido — "Entregue" não faz sentido pra retirada, vira "Retirado". */
function labelStatus(status: Status, tipoEntrega: 'entrega' | 'retirada'): string {
  if (status === 'entregue' && tipoEntrega === 'retirada') return 'Retirado'
  return statusConfig[status].label
}

type Acao = { proximoStatus: Status; label: string; Icone: typeof Flame; cor?: string }

const proximaAcaoEntrega: Partial<Record<Status, Acao>> = {
  recebido:             { proximoStatus: 'pagamento_confirmado', label: 'Confirmar pagamento', Icone: Banknote,     cor: 'bg-emerald-600 hover:bg-emerald-700' },
  pagamento_confirmado: { proximoStatus: 'em_preparo',          label: 'Iniciar preparo',      Icone: Flame,        cor: 'bg-orange-500 hover:bg-orange-600' },
  em_preparo:           { proximoStatus: 'pronto',              label: 'Marcar pronto',        Icone: Check,        cor: 'bg-orange-500 hover:bg-orange-600' },
  pronto:               { proximoStatus: 'a_caminho',           label: 'Saiu para entrega',    Icone: Truck,        cor: 'bg-orange-500 hover:bg-orange-600' },
  a_caminho:            { proximoStatus: 'entregue',            label: 'Marcar entregue',      Icone: PackageCheck, cor: 'bg-orange-500 hover:bg-orange-600' },
}

// Retirada não passa por "saiu para entrega" — de "pronto" já vai direto pra retirado.
const proximaAcaoRetirada: Partial<Record<Status, Acao>> = {
  ...proximaAcaoEntrega,
  pronto: { proximoStatus: 'entregue', label: 'Marcar retirado', Icone: PackageCheck, cor: 'bg-orange-500 hover:bg-orange-600' },
}

function obterProximaAcao(status: Status, tipoEntrega: 'entrega' | 'retirada'): Acao | undefined {
  return (tipoEntrega === 'retirada' ? proximaAcaoRetirada : proximaAcaoEntrega)[status]
}

const statusAtivos: Status[] = ['recebido', 'pagamento_confirmado', 'em_preparo', 'pronto', 'a_caminho']

function formatarTempo(criadoEm: string): string {
  const diff = Date.now() - new Date(criadoEm).getTime()
  const minutos = Math.floor(diff / 60000)
  if (minutos < 1) return 'agora'
  if (minutos === 1) return 'há 1 min'
  return `há ${minutos} min`
}

function imprimirComandaAutomaticamente(pedidoId: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top      = '-10000px'
  iframe.style.left     = '-10000px'
  iframe.style.width    = '1px'
  iframe.style.height   = '1px'
  iframe.src = `/imprimir/${pedidoId}`
  document.body.appendChild(iframe)
  setTimeout(() => iframe.remove(), 8000)
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

  // Impressão automática do balcão
  const [imprimirAutoBalcao, setImprimirAutoBalcao] = useState(true)
  const [togglingImprimir, setTogglingImprimir]     = useState(false)

  // Modal novo pedido
  const [modalAberto, setModalAberto]           = useState(false)
  const [cardapio, setCardapio]                 = useState<ItemCardapio[]>([])
  const [carregandoMenu, setCarregandoMenu]     = useState(false)
  const [clienteNomeModal, setClienteNomeModal] = useState('')
  const [clienteFoneModal, setClienteFoneModal] = useState('')
  const [selecionados, setSelecionados]         = useState<Record<string, { quantidade: number; observacao: string }>>({})
  const [enviandoManual, setEnviandoManual]     = useState(false)
  const [erroModal, setErroModal]               = useState<string | null>(null)
  const [formaPagamentoModal, setFormaPagamentoModal] = useState<'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'>('dinheiro')
  const [tipoEntregaModal, setTipoEntregaModal]       = useState<'entrega' | 'retirada'>('retirada')
  const [precisaTrocoModal, setPrecisaTrocoModal]     = useState(false)
  const [trocoParaModal, setTrocoParaModal]           = useState('')
  const [enderecoModal, setEnderecoModal]             = useState('')
  const [bairroIdModal, setBairroIdModal]             = useState('')
  const [bairros, setBairros]                         = useState<Bairro[]>([])
  const [buscaItemModal, setBuscaItemModal]           = useState('')

  // Modal editar itens de pedido existente
  const [edicaoItensPedido, setEdicaoItensPedido] = useState<Pedido | null>(null)
  const [salvandoItemId, setSalvandoItemId]       = useState<string | null>(null)
  const [erroEdicaoItens, setErroEdicaoItens]     = useState<string | null>(null)
  const [buscaItemEdicao, setBuscaItemEdicao]     = useState('')

  useEffect(() => {
    if (!token) return

    fetch(`${API_URL}/pedidos?status=recebido,pagamento_confirmado,em_preparo,pronto,a_caminho&limite=100`, {
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
      setPedidos((prev) => [pedido, ...prev.filter((p) => p.id !== pedido.id)])
      if (pedido.origem !== 'balcao' || imprimirAutoBalcao) {
        imprimirComandaAutomaticamente(pedido.id)
      }
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
  }, [socket, imprimirAutoBalcao])

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est) => {
        setAceitando(est.aceitandoPedidos ?? true)
        setImprimirAutoBalcao(est.imprimirAutomaticoBalcao ?? true)
      })
      .catch(console.error)

    fetch(`${API_URL}/bairros`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setBairros)
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
      const resp = await fetch(`${API_URL}/meu-estabelecimento/aceitando-pedidos`, {
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

  async function toggleImprimirAutoBalcao() {
    setTogglingImprimir(true)
    try {
      const resp = await fetch(`${API_URL}/meu-estabelecimento/imprimir-automatico-balcao`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ imprimirAutomaticoBalcao: !imprimirAutoBalcao }),
      })
      if (resp.ok) setImprimirAutoBalcao((v) => !v)
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingImprimir(false)
    }
  }

  async function carregarCardapioSeNecessario() {
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

  async function abrirModalNovoPedido() {
    setClienteNomeModal('')
    setClienteFoneModal('')
    setSelecionados({})
    setErroModal(null)
    setFormaPagamentoModal('dinheiro')
    setTipoEntregaModal('retirada')
    setPrecisaTrocoModal(false)
    setTrocoParaModal('')
    setEnderecoModal('')
    setBairroIdModal('')
    setBuscaItemModal('')
    setModalAberto(true)
    await carregarCardapioSeNecessario()
  }

  function aplicarPedidoAtualizado(pedidoAtualizado: Pedido) {
    setPedidos((prev) => prev.map((p) => (p.id === pedidoAtualizado.id ? pedidoAtualizado : p)))
    setEdicaoItensPedido((prev) => (prev && prev.id === pedidoAtualizado.id ? pedidoAtualizado : prev))
  }

  async function abrirEdicaoItens(pedido: Pedido) {
    setErroEdicaoItens(null)
    setBuscaItemEdicao('')
    setEdicaoItensPedido(pedido)
    await carregarCardapioSeNecessario()
  }

  async function adicionarItemAoPedido(itemCardapioId: string) {
    if (!edicaoItensPedido) return
    setErroEdicaoItens(null)
    setSalvandoItemId(itemCardapioId)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${edicaoItensPedido.id}/itens`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ itemCardapioId, quantidade: 1 }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroEdicaoItens(dados.erro ?? 'Erro ao adicionar item'); return }
      aplicarPedidoAtualizado(dados)
    } catch {
      setErroEdicaoItens('Falha de conexão')
    } finally {
      setSalvandoItemId(null)
    }
  }

  async function alterarQuantidadeItemPedido(item: ItemPedido, delta: number) {
    if (!edicaoItensPedido) return
    const novaQuantidade = item.quantidade + delta
    if (novaQuantidade < 1) { removerItemPedido(item.id); return }

    setErroEdicaoItens(null)
    setSalvandoItemId(item.id)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${edicaoItensPedido.id}/itens/${item.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ quantidade: novaQuantidade }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroEdicaoItens(dados.erro ?? 'Erro ao atualizar item'); return }
      aplicarPedidoAtualizado(dados)
    } catch {
      setErroEdicaoItens('Falha de conexão')
    } finally {
      setSalvandoItemId(null)
    }
  }

  async function removerItemPedido(itemPedidoId: string) {
    if (!edicaoItensPedido) return
    setErroEdicaoItens(null)
    setSalvandoItemId(itemPedidoId)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${edicaoItensPedido.id}/itens/${itemPedidoId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const dados = await resp.json().catch(() => ({}))
        setErroEdicaoItens(dados.erro ?? 'Erro ao remover item')
        return
      }
      const dados = await resp.json()
      aplicarPedidoAtualizado(dados)
    } catch {
      setErroEdicaoItens('Falha de conexão')
    } finally {
      setSalvandoItemId(null)
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

  const bairroSelecionadoModal = bairros.find((b) => b.id === bairroIdModal)
  const taxaModal = tipoEntregaModal === 'entrega' ? (bairroSelecionadoModal?.taxaEntrega ?? 0) : 0
  const subtotalManual = cardapio.reduce((soma, item) => {
    const sel = selecionados[item.id]
    return soma + (sel ? item.preco * sel.quantidade : 0)
  }, 0)
  const totalManual = subtotalManual + taxaModal
  const itensFiltradosModal = cardapio.filter((item) =>
    item.nome.toLowerCase().includes(buscaItemModal.trim().toLowerCase())
  )
  const itensFiltradosEdicao = cardapio.filter((item) =>
    item.nome.toLowerCase().includes(buscaItemEdicao.trim().toLowerCase())
  )

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
    if (tipoEntregaModal === 'entrega' && !enderecoModal.trim()) {
      setErroModal('Endereço de entrega é obrigatório')
      return
    }
    if (tipoEntregaModal === 'entrega' && bairros.length > 0 && !bairroIdModal) {
      setErroModal('Selecione o bairro de entrega')
      return
    }
    if (formaPagamentoModal === 'dinheiro' && precisaTrocoModal && !trocoParaModal.trim()) {
      setErroModal('Informe o valor para o troco')
      return
    }
    setEnviandoManual(true)
    try {
      const resp = await fetch(`${API_URL}/pedidos/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          clienteNome: clienteNomeModal,
          clienteFone: clienteFoneModal.trim() || undefined,
          enderecoEntrega: tipoEntregaModal === 'entrega' ? enderecoModal.trim() || undefined : undefined,
          bairroId: tipoEntregaModal === 'entrega' && bairros.length > 0 ? bairroIdModal : undefined,
          itens,
          formaPagamento: formaPagamentoModal,
          precisaTroco: formaPagamentoModal === 'dinheiro' ? precisaTrocoModal : undefined,
          trocoPara: formaPagamentoModal === 'dinheiro' && precisaTrocoModal
            ? parseFloat(trocoParaModal.replace(',', '.'))
            : undefined,
          tipoEntrega: tipoEntregaModal,
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroModal(dados.erro ?? 'Erro ao criar pedido'); return }
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
            className="flex items-center gap-1.5 rounded-full bg-orange-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:bg-orange-600 sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo pedido</span>
          </button>
          <div className="flex items-center divide-x divide-zinc-800 overflow-hidden rounded-full bg-zinc-900/80 ring-1 ring-zinc-800">
            <ControleAceitandoPedidos
              conectado={conectado}
              erro={erro}
              aceitando={aceitando}
              disabled={togglingPausa}
              onToggle={togglePausa}
            />
            <button
              onClick={toggleImprimirAutoBalcao}
              disabled={togglingImprimir}
              title={`Impressão automática de pedidos de balcão: ${imprimirAutoBalcao ? 'ligada' : 'desligada'} (delivery e retirada via link sempre imprimem)`}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
                imprimirAutoBalcao
                  ? 'text-emerald-400 hover:bg-emerald-500/10'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">{imprimirAutoBalcao ? 'Auto' : 'Manual'}</span>
            </button>
          </div>
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
            const acao = obterProximaAcao(pedido.status, pedido.tipoEntrega)
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
                    {labelStatus(pedido.status, pedido.tipoEntrega)}
                  </span>
                </div>

                <div className="mb-2 flex items-center gap-2">
                  <User className="h-4 w-4 text-zinc-500" />
                  <span className="font-semibold">{pedido.clienteNome}</span>
                </div>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {tipoEntregaLabel[pedido.tipoEntrega] ?? pedido.tipoEntrega}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    pedido.formaPagamento === 'pix'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {formaPagamentoLabel[pedido.formaPagamento] ?? pedido.formaPagamento}
                  </span>
                  {pedido.formaPagamento === 'dinheiro' && pedido.precisaTroco && pedido.trocoPara != null && (
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                      Troco p/ R$ {Number(pedido.trocoPara).toFixed(2)}
                    </span>
                  )}
                </div>

                {pedido.tipoEntrega === 'entrega' && pedido.enderecoEntrega && (
                  <div className="mb-4 flex items-start gap-1.5 text-xs text-zinc-400">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span>
                      {pedido.bairroNome && <span className="font-medium text-zinc-300">{pedido.bairroNome} — </span>}
                      {pedido.enderecoEntrega}
                    </span>
                  </div>
                )}

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
                    <div className="flex items-center gap-1">
                      {pedido.status !== 'entregue' && pedido.status !== 'cancelado' && (
                        <button
                          onClick={() => abrirEdicaoItens(pedido)}
                          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                          title="Editar itens do pedido"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => window.open(`/imprimir/${pedido.id}`, '_blank')}
                        className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                        title="Imprimir comanda"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {acao && (
                      <button
                        onClick={() => atualizarStatus(pedido.id, acao.proximoStatus)}
                        disabled={atualizando || cancelando}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 ${acao.cor ?? 'bg-orange-500 hover:bg-orange-600'}`}
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
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Nome</span>
                    <input
                      value={clienteNomeModal}
                      onChange={(e) => setClienteNomeModal(e.target.value)}
                      placeholder="Nome do cliente (opcional)"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Telefone</span>
                    <input
                      value={clienteFoneModal}
                      onChange={(e) => setClienteFoneModal(e.target.value)}
                      placeholder="85 99999-9999 (opcional)"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  </label>
                </div>
                {/* Tipo de entrega */}
                <div className="grid grid-cols-2 gap-2">
                  {(['retirada', 'entrega'] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoEntregaModal(tipo)}
                      className={`rounded-xl py-2 text-sm font-semibold transition ${
                        tipoEntregaModal === tipo
                          ? 'bg-orange-500 text-white'
                          : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {tipo === 'retirada' ? '🏪 Retirada' : '🛵 Entrega'}
                    </button>
                  ))}
                </div>

                {tipoEntregaModal === 'entrega' && (
                  <div className="space-y-3">
                    {bairros.length > 0 && (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-zinc-400">Bairro</span>
                        <select
                          value={bairroIdModal}
                          onChange={(e) => setBairroIdModal(e.target.value)}
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-orange-500"
                        >
                          <option value="">Selecione o bairro</option>
                          {bairros.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.nome} — {b.taxaEntrega != null ? `R$ ${b.taxaEntrega.toFixed(2)}` : 'grátis'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-zinc-400">Endereço de entrega</span>
                      <textarea
                        rows={2}
                        value={enderecoModal}
                        onChange={(e) => setEnderecoModal(e.target.value)}
                        placeholder="Rua, número, referência"
                        className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                      />
                    </label>
                  </div>
                )}

                {/* Forma de pagamento */}
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-400">Pagamento</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { valor: 'dinheiro',       label: 'Dinheiro' },
                      { valor: 'cartao_debito',  label: 'Débito' },
                      { valor: 'cartao_credito', label: 'Crédito' },
                      { valor: 'pix',            label: 'PIX' },
                    ] as const).map(({ valor, label }) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setFormaPagamentoModal(valor)}
                        className={`rounded-xl py-2 text-sm font-semibold transition ${
                          formaPagamentoModal === valor
                            ? 'bg-orange-500 text-white'
                            : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {formaPagamentoModal === 'dinheiro' && (
                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={precisaTrocoModal}
                          onChange={(e) => setPrecisaTrocoModal(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-600 accent-orange-500"
                        />
                        <span className="text-sm text-zinc-300">Precisa de troco?</span>
                      </label>
                      {precisaTrocoModal && (
                        <input
                          value={trocoParaModal}
                          onChange={(e) => setTrocoParaModal(e.target.value)}
                          placeholder="Troco para quanto? (R$)"
                          inputMode="decimal"
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-3 text-xs font-medium text-zinc-400">Itens</p>
                  <input
                    value={buscaItemModal}
                    onChange={(e) => setBuscaItemModal(e.target.value)}
                    placeholder="Buscar item pelo nome..."
                    className="mb-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                  />
                  {carregandoMenu ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                    </div>
                  ) : itensFiltradosModal.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-500">Nenhum item encontrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {itensFiltradosModal.map((item) => {
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
                {taxaModal > 0 && (
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>Taxa de entrega{bairroSelecionadoModal ? ` (${bairroSelecionadoModal.nome})` : ''}</span>
                    <span>R$ {taxaModal.toFixed(2)}</span>
                  </div>
                )}
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

      {/* Modal editar itens de pedido existente */}
      {edicaoItensPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="flex h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 p-5">
              <div>
                <h3 className="text-lg font-bold">Editar pedido</h3>
                <p className="text-xs text-zinc-500">{edicaoItensPedido.clienteNome} · #{edicaoItensPedido.id.slice(-6)}</p>
              </div>
              <button onClick={() => setEdicaoItensPedido(null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-3 text-xs font-medium text-zinc-400">Itens do pedido</p>
                <div className="space-y-2">
                  {edicaoItensPedido.itens.map((item) => (
                    <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.nomeItem}</p>
                          <p className="text-xs text-orange-400">R$ {Number(item.precoUnit).toFixed(2)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-1 py-1">
                          <button
                            type="button"
                            disabled={salvandoItemId === item.id}
                            onClick={() => alterarQuantidadeItemPedido(item, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700 disabled:opacity-40"
                            title={item.quantidade === 1 ? 'Remover item' : 'Diminuir'}
                          >
                            {item.quantidade === 1 ? <X className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                          </button>
                          {salvandoItemId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
                          ) : (
                            <span className="min-w-5 text-center text-sm font-bold">{item.quantidade}</span>
                          )}
                          <button
                            type="button"
                            disabled={salvandoItemId === item.id}
                            onClick={() => alterarQuantidadeItemPedido(item, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700 disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {item.observacao && (
                        <p className="mt-1.5 text-xs italic text-zinc-500">obs: {item.observacao}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-medium text-zinc-400">Adicionar item</p>
                <input
                  value={buscaItemEdicao}
                  onChange={(e) => setBuscaItemEdicao(e.target.value)}
                  placeholder="Buscar item pelo nome..."
                  className="mb-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                />
                {carregandoMenu ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                  </div>
                ) : itensFiltradosEdicao.length === 0 ? (
                  <p className="py-4 text-center text-sm text-zinc-500">Nenhum item encontrado.</p>
                ) : (
                  <div className="space-y-2">
                    {itensFiltradosEdicao.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.nome}</p>
                          <p className="text-xs text-orange-400">R$ {Number(item.preco).toFixed(2)}</p>
                        </div>
                        <button
                          type="button"
                          disabled={salvandoItemId === item.id}
                          onClick={() => adicionarItemAoPedido(item.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                        >
                          {salvandoItemId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {erroEdicaoItens && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                  {erroEdicaoItens}
                </p>
              )}
            </div>

            <div className="border-t border-zinc-800 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total</span>
                <span className="text-xl font-extrabold text-orange-400">R$ {Number(edicaoItensPedido.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

interface ControleAceitandoPedidosProps {
  conectado: boolean
  erro:      string | null
  aceitando: boolean
  disabled:  boolean
  onToggle:  () => void
}

/** Estado da conexão + toggle de aceitar pedidos num único controle (evita repetir o mesmo status em dois lugares). */
function ControleAceitandoPedidos({ conectado, erro, aceitando, disabled, onToggle }: ControleAceitandoPedidosProps) {
  if (erro) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        title={erro}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
        <span className="hidden sm:inline">{erro}</span>
      </button>
    )
  }
  if (!aceitando) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        title="Toque para reabrir e voltar a receber pedidos"
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-400 transition hover:bg-orange-500/10 disabled:opacity-50"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
        <span className="hidden sm:inline">Pausada</span>
      </button>
    )
  }
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title="Toque para pausar o recebimento de pedidos"
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {conectado && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
      </span>
      <span className="hidden sm:inline">{conectado ? 'Ativa' : 'Conectando...'}</span>
    </button>
  )
}
