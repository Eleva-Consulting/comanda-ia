import { useEffect, useRef, useState } from 'react'
import { Loader2, ChefHat, Plus, Printer, X } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocket } from '../hooks/useSocket'
import { useSocketProducao } from '../hooks/useSocketProducao'
import CardPedidoKanban from '../components/cozinha/CardPedidoKanban'
import ModalNovoPedido from '../components/cozinha/ModalNovoPedido'
import ModalEditarItensPedido from '../components/cozinha/ModalEditarItensPedido'
import ControleAceitandoPedidos from '../components/cozinha/ControleAceitandoPedidos'
import type { Pedido } from '../components/cozinha/tipos'
import { STATUS_ATIVOS_PEDIDO, type StatusPedido } from '../lib/statusPedido'
import { temPermissao } from '../lib/permissoes'
import { getRole } from '../lib/auth'

// ── Tipos ──────────────────────────────────────────────────────────────────

type StatusProducao = 'recebido' | 'em_preparo' | 'pronto' | 'entregue' | 'cancelado'

interface ItemProducao {
  id: string
  nomeItem: string
  quantidade: number
  observacao: string | null
  acompanhamento: string | null
  status: StatusProducao
  recebidoEm: string
  setorId: string | null
  rodadaId: string | null
  setorNome: string | null
  tempoAlvoMinutos: number | null
  mesaNumero: string
  comandaNome: string
}

// ── Helpers visuais ────────────────────────────────────────────────────────

const colunas: { status: StatusProducao; titulo: string }[] = [
  { status: 'recebido',   titulo: 'Recebido' },
  { status: 'em_preparo', titulo: 'Em preparo' },
  { status: 'pronto',     titulo: 'Pronto' },
]

const proximoStatus: Partial<Record<StatusProducao, StatusProducao>> = {
  recebido:   'em_preparo',
  em_preparo: 'pronto',
  pronto:     'entregue',
}

const labelAvancar: Partial<Record<StatusProducao, string>> = {
  recebido:   'Iniciar preparo',
  em_preparo: 'Marcar pronto',
  pronto:     'Marcar entregue',
}

// Pedido tem 5 status ativos e o Kanban 3 colunas — o badge do card mostra o status
// real ("Aguard. pgto", "A caminho"...) quando difere do nome da coluna.
const colunaDoPedido: Record<string, StatusProducao | undefined> = {
  recebido:             'recebido',
  pagamento_confirmado: 'recebido',
  em_preparo:           'em_preparo',
  pronto:               'pronto',
  a_caminho:            'pronto',
}

function minutosDesde(dataIso: string, referencia: number): number {
  return Math.floor((referencia - new Date(dataIso).getTime()) / 60000)
}

function corCronometro(minutos: number, tempoAlvoMinutos: number | null): string {
  if (tempoAlvoMinutos === null) return 'text-zinc-500'
  if (minutos >= tempoAlvoMinutos) return 'text-red-400'
  if (minutos >= tempoAlvoMinutos * 0.7) return 'text-yellow-400'
  return 'text-zinc-500'
}

export default function Cozinha() {
  const token = localStorage.getItem('token')
  const { socket } = useSocketProducao(token)
  // Conexão ampla (mesma do Layout) — eventos de Pedido não passam pelas salas por
  // setor da produção, e pedido não tem setor: todo operador da tela vê todos.
  const { socket: socketAmplo, conectado, erro: erroSocket } = useSocket(token)

  const [modulosAtivos, setModulosAtivos] = useState<string[] | null>(null)
  const [itens, setItens] = useState<ItemProducao[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [avancandoPedidoId, setAvancandoPedidoId] = useState<string | null>(null)
  const [cancelandoPedidoId, setCancelandoPedidoId] = useState<string | null>(null)
  const [imprimirAutoBalcao, setImprimirAutoBalcao] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [avancandoId, setAvancandoId] = useState<string | null>(null)
  const [avancandoRodadaId, setAvancandoRodadaId] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())

  // Controles do header (portados da Cozinha antiga)
  const [aceitando, setAceitando]         = useState(true)
  const [togglingPausa, setTogglingPausa] = useState(false)
  const [togglingImprimir, setTogglingImprimir] = useState(false)
  const [modalNovoAberto, setModalNovoAberto]   = useState(false)
  const [edicaoItensPedido, setEdicaoItensPedido] = useState<Pedido | null>(null)

  const podeNovoPedido = getRole() === 'DONO' || temPermissao('pedido_manual')

  // Rodadas já impressas nesta aba — dedupe porque a rodada chega como N eventos
  // 'producao:item-novo' (um por item) e deve imprimir uma vez só.
  const rodadasImpressasRef = useRef<Set<string>>(new Set())

  function imprimirRodadaAutomaticamente(rodadaId: string) {
    if (rodadasImpressasRef.current.has(rodadaId)) return
    rodadasImpressasRef.current.add(rodadaId)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.top      = '-10000px'
    iframe.style.left     = '-10000px'
    iframe.style.width    = '1px'
    iframe.style.height   = '1px'
    iframe.src = `/imprimir/rodada/${rodadaId}`
    document.body.appendChild(iframe)
    setTimeout(() => iframe.remove(), 8000)
  }

  const [itemCancelamento, setItemCancelamento] = useState<ItemProducao | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [senhaCancelamento, setSenhaCancelamento] = useState('')
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)

  function carregarItens() {
    fetch(`${API_URL}/producao/itens`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setItens)
      .catch((err) => { console.error(err); setErro('Falha ao carregar produção') })
      .finally(() => setCarregando(false))
  }

  function carregarPedidos() {
    fetch(`${API_URL}/pedidos?status=${STATUS_ATIVOS_PEDIDO.join(',')}&limite=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { dados: Pedido[] }) => setPedidos(data.dados ?? []))
      .catch((err) => { console.error(err); setErro('Falha ao carregar pedidos') })
      .finally(() => setCarregando(false))
  }

  function atualizarPedidoLocal(pedido: Pedido) {
    setPedidos((prev) => {
      const semEsse = prev.filter((p) => p.id !== pedido.id)
      return STATUS_ATIVOS_PEDIDO.includes(pedido.status) ? [...semEsse, pedido] : semEsse
    })
    // Mantém o modal de edição sincronizado se o pedido aberto nele mudou.
    setEdicaoItensPedido((prev) => (prev && prev.id === pedido.id ? pedido : prev))
  }

  // Pedidos já impressos nesta aba (balcão respeita o toggle). Duas abas abertas da
  // tela imprimem em dobro — mesmo comportamento aceito da Cozinha antiga.
  const pedidosImpressosRef = useRef<Set<string>>(new Set())

  function imprimirPedidoAutomaticamente(pedido: Pedido) {
    if (pedido.origem === 'balcao' && !imprimirAutoBalcao) return
    if (pedidosImpressosRef.current.has(pedido.id)) return
    pedidosImpressosRef.current.add(pedido.id)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.top      = '-10000px'
    iframe.style.left     = '-10000px'
    iframe.style.width    = '1px'
    iframe.style.height   = '1px'
    iframe.src = `/imprimir/${pedido.id}`
    document.body.appendChild(iframe)
    setTimeout(() => iframe.remove(), 8000)
  }

  async function avancarPedido(pedido: Pedido, proximoStatus: StatusPedido) {
    setAvancandoPedidoId(pedido.id)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${pedido.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: proximoStatus }),
      })
      if (resp.ok) atualizarPedidoLocal(await resp.json())
    } catch (err) {
      console.error(err)
    } finally {
      setAvancandoPedidoId(null)
    }
  }

  async function cancelarPedido(pedido: Pedido) {
    setCancelandoPedidoId(pedido.id)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${pedido.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' }),
      })
      if (resp.ok) atualizarPedidoLocal(await resp.json())
    } catch (err) {
      console.error(err)
    } finally {
      setCancelandoPedidoId(null)
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
    } catch (err) {
      console.error(err)
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
    } catch (err) {
      console.error(err)
    } finally {
      setTogglingImprimir(false)
    }
  }

  function atualizarItemLocal(item: ItemProducao) {
    setItens((prev) => {
      const semEsseItem = prev.filter((i) => i.id !== item.id)
      const aindaAtivo = item.status === 'recebido' || item.status === 'em_preparo' || item.status === 'pronto'
      return aindaAtivo ? [...semEsseItem, item] : semEsseItem
    })
  }

  // Item que a cozinha já começou (em_preparo em diante) exige senha de supervisor — espelha
  // podeCancelarLivremente do backend (decisão de 2026-07-17).
  function podeCancelarLivre(status: StatusProducao): boolean {
    return status === 'recebido'
  }

  function abrirCancelamentoItem(item: ItemProducao) {
    setItemCancelamento(item)
    setMotivoCancelamento('')
    setSenhaCancelamento('')
    setErroCancelamento(null)
  }

  async function confirmarCancelamentoItem() {
    if (!itemCancelamento) return
    const precisaSenha = !podeCancelarLivre(itemCancelamento.status)
    if (precisaSenha && (!motivoCancelamento || !senhaCancelamento)) return

    setErroCancelamento(null)
    setEnviandoCancelamento(true)
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${itemCancelamento.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelado',
          ...(motivoCancelamento ? { motivo: motivoCancelamento } : {}),
          ...(precisaSenha ? { senha: senhaCancelamento } : {}),
        }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroCancelamento(data.erro ?? 'Não foi possível cancelar o item'); return }
      atualizarItemLocal({ ...itemCancelamento, status: data.status })
      setItemCancelamento(null)
    } catch {
      setErroCancelamento('Falha de conexão')
    } finally {
      setEnviandoCancelamento(false)
    }
  }

  async function avancarStatus(item: ItemProducao) {
    const novoStatus = proximoStatus[item.status]
    if (!novoStatus) return
    setAvancandoId(item.id)
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${item.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      })
      if (resp.ok) {
        const atualizado = await resp.json()
        atualizarItemLocal({ ...item, status: atualizado.status })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAvancandoId(null)
    }
  }

  // Recebe os itens do grupo já renderizado (não só o rodadaId) pra poder mesclar
  // só o campo `status` da resposta por cima do item local já conhecido — a resposta
  // de PATCH /rodadas/:id/avancar traz o ItemComanda "cru" do Prisma (sem os joins de
  // mesaNumero/comandaNome/setorNome/tempoAlvoMinutos que serializarItemProducao
  // adiciona), então não dá pra usar a resposta como item completo sem perder esses
  // campos visuais. O evento de socket 'producao:item-atualizado' já traz a versão
  // completa; aqui só garantimos a atualização otimista do status, no mesmo padrão
  // já usado em avancarStatus.
  async function avancarRodada(itensDoGrupo: ItemProducao[]) {
    const rodadaId = itensDoGrupo[0]?.rodadaId
    if (!rodadaId) return
    setAvancandoRodadaId(rodadaId)
    try {
      const resp = await fetch(`${API_URL}/rodadas/${rodadaId}/avancar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        const dados = await resp.json()
        const statusPorId = new Map<string, StatusProducao>(
          dados.itensAtualizados.map((i: { id: string; status: StatusProducao }) => [i.id, i.status])
        )
        for (const item of itensDoGrupo) {
          const novoStatus = statusPorId.get(item.id)
          if (novoStatus) atualizarItemLocal({ ...item, status: novoStatus })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAvancandoRodadaId(null)
    }
  }

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setModulosAtivos(data.modulosAtivos ?? [])
        setImprimirAutoBalcao(data.imprimirAutomaticoBalcao ?? true)
        setAceitando(data.aceitandoPedidos ?? true)
      })
      .catch(() => setModulosAtivos([]))
  }, [token])

  // Pedidos existem em qualquer estabelecimento; itens de comanda só com o módulo mesas.
  useEffect(() => {
    carregarPedidos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (modulosAtivos?.includes('mesas')) carregarItens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulosAtivos])

  useEffect(() => {
    if (!socket) return

    function aoReceberItemNovo(item: ItemProducao) {
      if (item.rodadaId) imprimirRodadaAutomaticamente(item.rodadaId)
      atualizarItemLocal(item)
    }

    function aoReceberItemAtualizado(item: ItemProducao) {
      atualizarItemLocal(item)
    }

    socket.on('producao:item-novo', aoReceberItemNovo)
    socket.on('producao:item-atualizado', aoReceberItemAtualizado)

    return () => {
      socket.off('producao:item-novo', aoReceberItemNovo)
      socket.off('producao:item-atualizado', aoReceberItemAtualizado)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  useEffect(() => {
    if (!socketAmplo) return

    function aoReceberPedidoNovo(pedido: Pedido) {
      imprimirPedidoAutomaticamente(pedido)
      atualizarPedidoLocal(pedido)
    }

    function aoReceberPedidoAtualizado(pedido: Pedido) {
      atualizarPedidoLocal(pedido)
    }

    socketAmplo.on('pedido:novo', aoReceberPedidoNovo)
    socketAmplo.on('pedido:atualizado', aoReceberPedidoAtualizado)

    return () => {
      socketAmplo.off('pedido:novo', aoReceberPedidoNovo)
      socketAmplo.off('pedido:atualizado', aoReceberPedidoAtualizado)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketAmplo, imprimirAutoBalcao])

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 15000)
    return () => clearInterval(intervalo)
  }, [])

  // Uma rodada "dividida" tem itens não-terminais (não entregue/cancelado) espalhados
  // por mais de uma coluna de status — acontece quando o operador avança só um item
  // específico via "(só este)" em vez da rodada inteira. Nesse caso o botão "Avançar
  // rodada" precisa sumir em todos os fragmentos da rodada: ele chama
  // PATCH /rodadas/:id/avancar, que avança TODOS os itens elegíveis da rodada no
  // backend (por design), não só os itens visíveis no card daquela coluna — mostrar o
  // botão em apenas um fragmento sugeriria (erroneamente) que ele afeta só aquele card.
  const rodadasDivididas = new Set<string>()
  {
    const statusPorRodada = new Map<string, Set<StatusProducao>>()
    for (const item of itens) {
      if (!item.rodadaId) continue
      if (item.status === 'entregue' || item.status === 'cancelado') continue
      const statusSet = statusPorRodada.get(item.rodadaId) ?? new Set<StatusProducao>()
      statusSet.add(item.status)
      statusPorRodada.set(item.rodadaId, statusSet)
    }
    for (const [rodadaId, statusSet] of statusPorRodada) {
      if (statusSet.size > 1) rodadasDivididas.add(rodadaId)
    }
  }

  return (
    <Layout headerExtra={
      <div className="flex items-center gap-2">
        {podeNovoPedido && (
          <button
            onClick={() => setModalNovoAberto(true)}
            className="flex items-center gap-1.5 rounded-full bg-orange-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:bg-orange-600 sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo pedido</span>
          </button>
        )}
        <div className="flex items-center divide-x divide-zinc-800 overflow-hidden rounded-full bg-zinc-900/80 ring-1 ring-zinc-800">
          <ControleAceitandoPedidos
            conectado={conectado}
            erro={erroSocket}
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
      <h2 className="mb-6 text-2xl font-extrabold">Cozinha</h2>
      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}
      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {colunas.map((coluna) => {
            const itensDaColuna = itens
              .filter((i) => i.status === coluna.status)
              .sort((a, b) => new Date(a.recebidoEm).getTime() - new Date(b.recebidoEm).getTime())

            const gruposDaColuna: { chave: string; rodadaId: string | null; itens: ItemProducao[] }[] = []
            for (const item of itensDaColuna) {
              const chave = item.rodadaId ?? item.id
              const grupoExistente = gruposDaColuna.find((g) => g.chave === chave)
              if (grupoExistente) grupoExistente.itens.push(item)
              else gruposDaColuna.push({ chave, rodadaId: item.rodadaId, itens: [item] })
            }

            const pedidosDaColuna = pedidos
              .filter((p) => colunaDoPedido[p.status] === coluna.status)

            // Pedidos e rodadas intercalados por horário de chegada — o mais antigo no topo.
            const cardsDaColuna = [
              ...pedidosDaColuna.map((pedido) => ({
                tipo: 'pedido' as const,
                horario: new Date(pedido.criadoEm).getTime(),
                pedido,
              })),
              ...gruposDaColuna.map((grupo) => ({
                tipo: 'grupo' as const,
                horario: new Date(grupo.itens[0].recebidoEm).getTime(),
                grupo,
              })),
            ].sort((a, b) => a.horario - b.horario)

            const totalDaColuna = itensDaColuna.length + pedidosDaColuna.length

            return (
              <div key={coluna.status} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="font-semibold text-zinc-200">{coluna.titulo}</h3>
                  <span className="text-xs text-zinc-500">{totalDaColuna}</span>
                </div>

                {totalDaColuna === 0 ? (
                  <p className="px-1 text-sm text-zinc-600">Nada por aqui.</p>
                ) : (
                  <div className="space-y-2">
                    {cardsDaColuna.map((card) => {
                      if (card.tipo === 'pedido') {
                        return (
                          <CardPedidoKanban
                            key={card.pedido.id}
                            pedido={card.pedido}
                            agora={agora}
                            avancando={avancandoPedidoId === card.pedido.id}
                            cancelando={cancelandoPedidoId === card.pedido.id}
                            onAvancar={avancarPedido}
                            onCancelar={cancelarPedido}
                            onEditar={setEdicaoItensPedido}
                          />
                        )
                      }
                      const grupo = card.grupo
                      return (
                      <div key={grupo.chave} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                        <p className="mb-2 text-xs text-zinc-500">
                          Mesa {grupo.itens[0].mesaNumero} · {grupo.itens[0].comandaNome}
                        </p>
                        <div className="space-y-2">
                          {grupo.itens.map((item) => {
                            const minutos = minutosDesde(item.recebidoEm, agora)
                            return (
                              <div key={item.id} className="border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-zinc-100">
                                    {item.quantidade}x {item.nomeItem}
                                  </span>
                                  <span className={`flex items-center gap-1 text-xs font-medium ${corCronometro(minutos, item.tempoAlvoMinutos)}`}>
                                    {minutos}min
                                  </span>
                                </div>
                                {item.acompanhamento && (
                                  <p className="mb-1 text-xs font-medium text-orange-400">Acompanhamento: {item.acompanhamento}</p>
                                )}
                                {item.observacao && (
                                  <p className="mb-1 text-xs italic text-zinc-500">{item.observacao}</p>
                                )}
                                {labelAvancar[item.status] && (
                                  <button
                                    onClick={() => avancarStatus(item)}
                                    disabled={avancandoId === item.id}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                                  >
                                    {avancandoId === item.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : null}
                                    {labelAvancar[item.status]} (só este)
                                  </button>
                                )}
                                {itemCancelamento?.id === item.id ? (
                                  <div className="mt-2 space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                                    <input
                                      value={motivoCancelamento}
                                      onChange={(e) => setMotivoCancelamento(e.target.value)}
                                      placeholder={podeCancelarLivre(item.status) ? 'Motivo (opcional)' : 'Motivo (obrigatório)'}
                                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                                    />
                                    {!podeCancelarLivre(item.status) && (
                                      <input
                                        type="password"
                                        value={senhaCancelamento}
                                        onChange={(e) => setSenhaCancelamento(e.target.value)}
                                        placeholder="Senha de supervisor"
                                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs"
                                      />
                                    )}
                                    {erroCancelamento && <p className="text-xs text-red-400">{erroCancelamento}</p>}
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={confirmarCancelamentoItem}
                                        disabled={
                                          enviandoCancelamento ||
                                          (!podeCancelarLivre(item.status) && (!motivoCancelamento || !senhaCancelamento))
                                        }
                                        className="flex-1 rounded bg-red-500 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => setItemCancelamento(null)}
                                        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => abrirCancelamentoItem(item)}
                                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                                  >
                                    Cancelar item
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {grupo.rodadaId &&
                          !rodadasDivididas.has(grupo.rodadaId) &&
                          grupo.itens.some((i) => labelAvancar[i.status]) && (
                          <button
                            onClick={() => avancarRodada(grupo.itens)}
                            disabled={avancandoRodadaId === grupo.rodadaId}
                            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                          >
                            {avancandoRodadaId === grupo.rodadaId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <ChefHat className="h-3.5 w-3.5" />}
                            Avançar rodada
                          </button>
                        )}
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ModalNovoPedido
        aberto={modalNovoAberto}
        token={token!}
        onFechar={() => setModalNovoAberto(false)}
      />
      {edicaoItensPedido && (
        <ModalEditarItensPedido
          pedido={edicaoItensPedido}
          token={token!}
          onFechar={() => setEdicaoItensPedido(null)}
          onPedidoAtualizado={atualizarPedidoLocal}
        />
      )}
    </Layout>
  )
}
