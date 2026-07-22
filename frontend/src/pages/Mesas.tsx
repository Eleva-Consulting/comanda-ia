import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Plus, Search, X, ArrowRightLeft, Trash2, Pencil } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocket } from '../hooks/useSocket'
import { temPermissao } from '../lib/permissoes'

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
  acompanhamento: string | null
  status: StatusProducao
  comandaId: string
}

interface RascunhoItem {
  id: string
  itemCardapioId: string
  nomeItem: string
  precoUnit: number
  quantidade: number
  observacao: string | null
  acompanhamento: string | null
}

interface Comanda {
  id: string
  nome: string
  contaId: string
  itens: ItemComanda[]
  rascunho?: RascunhoItem[]
}

interface Conta {
  id: string
  status: 'aberta' | 'aguardando_pagamento' | 'fechada' | 'cancelada'
  mesa: Mesa
  comandas: Comanda[]
}

interface OpcaoAcompanhamento {
  nome: string
  precoAdicional: number
}

interface ItemCardapio {
  id: string
  nome: string
  preco: number
  disponivel: boolean
  categoria: { id: string; nome: string; opcoesAcompanhamento: OpcaoAcompanhamento[] } | null
}

interface ItemCarrinho {
  chave: string // itemCardapioId + acompanhamento, pra permitir 2 linhas do mesmo item com acompanhamentos diferentes
  itemCardapioId: string
  nome: string
  preco: number
  quantidade: number
  acompanhamento?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizarNumeroMesa(numero: string): string {
  return numero.trim().replace(/^Mesa\s+/i, '')
}

// `opcoesAcompanhamento` é uma coluna Json — o TypeScript a tipa como array, mas o dado
// real pode vir com outro formato (ex.: objeto). Ler direto com .find/.map quebra a tela
// inteira (TypeError). Sempre normalizar pra um array seguro antes de iterar.
function opcoesAcompanhamentoDe(item: ItemCardapio | undefined): OpcaoAcompanhamento[] {
  const opcoes = item?.categoria?.opcoesAcompanhamento
  return Array.isArray(opcoes) ? opcoes : []
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
  const { socket } = useSocket(token)

  const [modulosAtivos, setModulosAtivos] = useState<string[] | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [carregandoMesas, setCarregandoMesas] = useState(true)
  const [abrindoMesaId, setAbrindoMesaId] = useState<string | null>(null)
  const [carregandoConta, setCarregandoConta] = useState(false)
  const [erroGrade, setErroGrade] = useState<string | null>(null)

  const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null)
  const [modalItemAberto, setModalItemAberto] = useState<string | null>(null) // comandaId
  const [cardapio, setCardapio] = useState<ItemCardapio[]>([])
  const [carregandoCardapio, setCarregandoCardapio] = useState(false)
  const [buscaItem, setBuscaItem] = useState('')
  const [escolhendoAcompanhamentoId, setEscolhendoAcompanhamentoId] = useState<string | null>(null)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  // Tela de revisão da MESA inteira: o garçom anota tudo em rascunho (todas as comandas),
  // revisa aqui e envia pra cozinha de uma vez só (pedido do usuário em 2026-07-17).
  const [revisandoMesa, setRevisandoMesa] = useState(false)
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [erroPedido, setErroPedido] = useState<string | null>(null)

  const [novaComandaAberta, setNovaComandaAberta] = useState(false)
  const [nomeNovaComanda, setNomeNovaComanda] = useState('')
  const [salvandoComanda, setSalvandoComanda] = useState(false)

  const [renomeandoComandaId, setRenomeandoComandaId] = useState<string | null>(null)
  const [nomeRenomeacao, setNomeRenomeacao] = useState('')
  const [transferindoItemId, setTransferindoItemId] = useState<string | null>(null)
  const [cancelandoConta, setCancelandoConta] = useState(false)

  const [itemCancelamento, setItemCancelamento] = useState<ItemComanda | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [senhaCancelamento, setSenhaCancelamento] = useState('')
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)

  const podeCadastrarMesa = temPermissao('configuracoes')
  const [novaMesaAberta, setNovaMesaAberta] = useState(false)
  const [numeroNovaMesa, setNumeroNovaMesa] = useState('')
  const [areaNovaMesa, setAreaNovaMesa] = useState('')
  const [capacidadeNovaMesa, setCapacidadeNovaMesa] = useState('')
  const [salvandoMesa, setSalvandoMesa] = useState(false)
  const [erroNovaMesa, setErroNovaMesa] = useState<string | null>(null)

  const [mesaEditando, setMesaEditando] = useState<Mesa | null>(null)
  const [numeroEdicaoMesa, setNumeroEdicaoMesa] = useState('')
  const [areaEdicaoMesa, setAreaEdicaoMesa] = useState('')
  const [capacidadeEdicaoMesa, setCapacidadeEdicaoMesa] = useState('')
  const [salvandoEdicaoMesa, setSalvandoEdicaoMesa] = useState(false)
  const [erroEdicaoMesa, setErroEdicaoMesa] = useState<string | null>(null)

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

  async function fecharDetalhe() {
    if (contaSelecionada) {
      const totalItens = contaSelecionada.comandas.reduce((soma, c) => soma + c.itens.length, 0)
      const totalRascunho = contaSelecionada.comandas.reduce((soma, c) => soma + (c.rascunho?.length ?? 0), 0)
      // Mesa aberta sem nenhum item enviado nem rascunho anotado: não faz sentido continuar
      // "ocupada" no vazio — cancela a conta sozinha ao sair, sem exigir ação manual do garçom.
      if (totalItens === 0 && totalRascunho === 0) {
        try {
          await fetch(`${API_URL}/contas/${contaSelecionada.id}/status`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelada' }),
          })
        } catch (err) {
          console.error(err)
        }
      }
    }
    setContaSelecionada(null)
    carregarMesas()
  }

  async function carregarCardapioSeNecessario() {
    if (cardapio.length > 0) return
    setCarregandoCardapio(true)
    try {
      const resp = await fetch(`${API_URL}/cardapio`, { headers: { Authorization: `Bearer ${token}` } })
      const dados = await resp.json()
      if (resp.ok) setCardapio(dados.filter((i: ItemCardapio) => i.disponivel))
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoCardapio(false)
    }
  }

  async function abrirModalItem(comandaId: string) {
    setModalItemAberto(comandaId)
    setBuscaItem('')
    setCarrinho([])
    setErroPedido(null)
    await carregarCardapioSeNecessario()
  }

  async function recarregarContaAtual() {
    if (!contaSelecionada) return
    const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (resp.ok) setContaSelecionada(await resp.json())
  }

  function adicionarAoCarrinho(item: ItemCardapio, acompanhamento?: string) {
    setEscolhendoAcompanhamentoId(null)
    const chave = `${item.id}::${acompanhamento ?? ''}`
    setCarrinho((prev) => {
      const existente = prev.find((c) => c.chave === chave)
      if (existente) {
        return prev.map((c) => c.chave === chave ? { ...c, quantidade: c.quantidade + 1 } : c)
      }
      return [...prev, { chave, itemCardapioId: item.id, nome: item.nome, preco: Number(item.preco), quantidade: 1, acompanhamento }]
    })
  }

  function alterarQuantidadeCarrinho(chave: string, delta: number) {
    setCarrinho((prev) => prev
      .map((c) => c.chave === chave ? { ...c, quantidade: c.quantidade + delta } : c)
      .filter((c) => c.quantidade > 0))
  }

  // Adiciona os itens do carrinho ao RASCUNHO da comanda (não vai pra cozinha).
  async function adicionarRascunho() {
    if (!modalItemAberto || carrinho.length === 0) return
    setEnviandoPedido(true)
    setErroPedido(null)
    try {
      const resp = await fetch(`${API_URL}/comandas/${modalItemAberto}/rascunho`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: carrinho.map((c) => ({
            itemCardapioId: c.itemCardapioId,
            quantidade: c.quantidade,
            ...(c.acompanhamento ? { acompanhamento: c.acompanhamento } : {}),
          })),
        }),
      })
      const dados = await resp.json().catch(() => ({}))
      if (!resp.ok) { setErroPedido(dados.erro ?? 'Não foi possível adicionar ao pedido'); return }
      await recarregarContaAtual()
      setCarrinho([])
      setModalItemAberto(null)
    } catch {
      setErroPedido('Falha de conexão')
    } finally {
      setEnviandoPedido(false)
    }
  }

  async function alterarQtdRascunho(id: string, quantidade: number) {
    if (quantidade < 1) return removerRascunho(id)
    try {
      const resp = await fetch(`${API_URL}/rascunho/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantidade }),
      })
      if (resp.ok) await recarregarContaAtual()
    } catch (err) { console.error(err) }
  }

  async function removerRascunho(id: string) {
    try {
      const resp = await fetch(`${API_URL}/rascunho/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) await recarregarContaAtual()
    } catch (err) { console.error(err) }
  }

  // Envia TODO o rascunho da mesa pra cozinha de uma vez (uma rodada por comanda).
  async function enviarRascunhoDaMesa() {
    if (!contaSelecionada) return
    setEnviandoPedido(true)
    setErroPedido(null)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/rascunho/enviar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const dados = await resp.json().catch(() => ({}))
      if (!resp.ok) { setErroPedido(dados.erro ?? 'Não foi possível enviar o pedido'); return }
      await recarregarContaAtual()
      if (dados.itensDescartados?.length > 0) {
        const nomes = dados.itensDescartados.map((d: { itemCardapioId: string; motivo?: string }) => {
          const r = contaSelecionada.comandas.flatMap((c) => c.rascunho ?? []).find((x) => x.itemCardapioId === d.itemCardapioId)
          return r?.nomeItem ?? d.motivo ?? d.itemCardapioId
        })
        setErroPedido(`Alguns itens ficaram indisponíveis e continuam no pedido: ${nomes.join(', ')}`)
      } else {
        setRevisandoMesa(false)
      }
    } catch {
      setErroPedido('Falha de conexão')
    } finally {
      setEnviandoPedido(false)
    }
  }

  async function criarComanda(e: FormEvent) {
    e.preventDefault()
    if (!contaSelecionada || !nomeNovaComanda.trim()) return
    setSalvandoComanda(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/comandas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeNovaComanda.trim() }),
      })
      if (resp.ok) {
        const novaComanda = await resp.json()
        setContaSelecionada((prev) => prev ? { ...prev, comandas: [...prev.comandas, novaComanda] } : prev)
        setNovaComandaAberta(false)
        setNomeNovaComanda('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSalvandoComanda(false)
    }
  }

  function iniciarRenomeacao(comanda: Comanda) {
    setRenomeandoComandaId(comanda.id)
    setNomeRenomeacao(comanda.nome)
  }

  async function salvarRenomeacao(e: FormEvent) {
    e.preventDefault()
    if (!renomeandoComandaId || !nomeRenomeacao.trim()) return
    try {
      const resp = await fetch(`${API_URL}/comandas/${renomeandoComandaId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeRenomeacao.trim() }),
      })
      if (resp.ok) {
        const atualizada = await resp.json()
        setContaSelecionada((prev) => prev
          ? { ...prev, comandas: prev.comandas.map((c) => c.id === atualizada.id ? atualizada : c) }
          : prev)
        setRenomeandoComandaId(null)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function transferirItem(itemId: string, comandaDestinoId: string) {
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${itemId}/transferir`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comandaId: comandaDestinoId }),
      })
      if (resp.ok) await recarregarContaAtual()
    } catch (err) {
      console.error(err)
    } finally {
      setTransferindoItemId(null)
    }
  }

  // Item que a cozinha já começou (em_preparo em diante) exige senha de supervisor — espelha
  // podeCancelarLivremente do backend (decisão de 2026-07-17).
  function podeCancelarLivre(status: StatusProducao): boolean {
    return status === 'recebido'
  }

  function abrirCancelamentoItem(item: ItemComanda) {
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
      await recarregarContaAtual()
      setItemCancelamento(null)
    } catch {
      setErroCancelamento('Falha de conexão')
    } finally {
      setEnviandoCancelamento(false)
    }
  }

  function abrirNovaMesa() {
    setNumeroNovaMesa('')
    setAreaNovaMesa('')
    setCapacidadeNovaMesa('')
    setErroNovaMesa(null)
    setNovaMesaAberta(true)
  }

  async function criarMesa(e: FormEvent) {
    e.preventDefault()
    if (!numeroNovaMesa.trim()) return
    setSalvandoMesa(true)
    setErroNovaMesa(null)
    try {
      const resp = await fetch(`${API_URL}/mesas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: normalizarNumeroMesa(numeroNovaMesa),
          area: areaNovaMesa.trim() || null,
          capacidade: capacidadeNovaMesa.trim() ? Number(capacidadeNovaMesa) : null,
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroNovaMesa(dados.erro ?? 'Não foi possível cadastrar a mesa'); return }
      setMesas((prev) => [...prev, { ...dados, contaAbertaId: null, statusMesa: 'livre' }].sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })))
      setNovaMesaAberta(false)
    } catch {
      setErroNovaMesa('Falha de conexão')
    } finally {
      setSalvandoMesa(false)
    }
  }

  function abrirEdicaoMesa(mesa: Mesa) {
    setMesaEditando(mesa)
    setNumeroEdicaoMesa(mesa.numero)
    setAreaEdicaoMesa(mesa.area ?? '')
    setCapacidadeEdicaoMesa(mesa.capacidade ? String(mesa.capacidade) : '')
    setErroEdicaoMesa(null)
  }

  async function salvarEdicaoMesa(e: FormEvent) {
    e.preventDefault()
    if (!mesaEditando || !numeroEdicaoMesa.trim()) return
    setSalvandoEdicaoMesa(true)
    setErroEdicaoMesa(null)
    try {
      const resp = await fetch(`${API_URL}/mesas/${mesaEditando.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: normalizarNumeroMesa(numeroEdicaoMesa),
          area: areaEdicaoMesa.trim() || null,
          capacidade: capacidadeEdicaoMesa.trim() ? Number(capacidadeEdicaoMesa) : null,
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroEdicaoMesa(dados.erro ?? 'Não foi possível salvar a mesa'); return }
      setMesas((prev) => prev
        .map((m) => m.id === dados.id ? { ...m, numero: dados.numero, area: dados.area, capacidade: dados.capacidade } : m)
        .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })))
      setMesaEditando(null)
    } catch {
      setErroEdicaoMesa('Falha de conexão')
    } finally {
      setSalvandoEdicaoMesa(false)
    }
  }

  async function cancelarConta() {
    if (!contaSelecionada) return
    setCancelandoConta(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelada' }),
      })
      if (resp.ok) fecharDetalhe()
    } catch (err) {
      console.error(err)
    } finally {
      setCancelandoConta(false)
    }
  }

  const itensFiltrados = cardapio.filter((item) =>
    item.nome.toLowerCase().includes(buscaItem.trim().toLowerCase())
  )

  // ── Rascunho da mesa (itens anotados, ainda não enviados) ─────────────────
  const rascunhoDaMesa = contaSelecionada?.comandas?.flatMap((c) => (c.rascunho ?? []).map((r) => ({ ...r, comandaNome: c.nome, comandaId: c.id }))) ?? []
  const totalItensRascunho = rascunhoDaMesa.reduce((soma, r) => soma + r.quantidade, 0)
  const totalValorRascunho = rascunhoDaMesa.reduce((soma, r) => soma + r.precoUnit * r.quantidade, 0)

  useEffect(() => {
    if (!socket) return

    // Refetch em vez de confiar no payload — alguns emissores de conta:atualizada mandam
    // só { id } (ex.: rotas de rascunho), sem comandas. Confiar no payload cru quebrava a tela.
    function atualizarSeForContaAtual(evento: { id: string }) {
      if (contaSelecionada && contaSelecionada.id === evento.id) recarregarContaAtual()
    }

    function recarregarContaEGrade() {
      recarregarContaAtual()
      carregarMesas()
    }

    socket.on('conta:atualizada', atualizarSeForContaAtual)
    socket.on('comanda:criada', recarregarContaEGrade)
    socket.on('comanda:atualizada', recarregarContaEGrade)
    socket.on('item-comanda:novo', recarregarContaEGrade)
    socket.on('item-comanda:atualizado', recarregarContaEGrade)

    return () => {
      socket.off('conta:atualizada', atualizarSeForContaAtual)
      socket.off('comanda:criada', recarregarContaEGrade)
      socket.off('comanda:atualizada', recarregarContaEGrade)
      socket.off('item-comanda:novo', recarregarContaEGrade)
      socket.off('item-comanda:atualizado', recarregarContaEGrade)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, contaSelecionada?.id])

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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold">Mesas</h2>
            {podeCadastrarMesa && (
              <button
                onClick={abrirNovaMesa}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                <Plus className="h-4 w-4" /> Cadastrar mesa
              </button>
            )}
          </div>
          {erroGrade && <p className="mb-4 text-sm text-red-400">{erroGrade}</p>}
          {carregandoMesas ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : mesas.length === 0 ? (
            <p className="text-sm text-zinc-400">
              {podeCadastrarMesa
                ? 'Nenhuma mesa cadastrada. Clique em "Cadastrar mesa" para adicionar a primeira.'
                : 'Nenhuma mesa cadastrada. Peça pro dono cadastrar em Mesas.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {mesas.map((mesa) => (
                <div key={mesa.id} className="relative">
                  <button
                    onClick={() => mesa.statusMesa === 'livre' ? abrirMesa(mesa.id) : abrirContaExistente(mesa)}
                    disabled={abrindoMesaId === mesa.id || carregandoConta}
                    className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition disabled:opacity-50 ${corStatusMesa[mesa.statusMesa]}`}
                  >
                    {abrindoMesaId === mesa.id
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <span className="text-xl font-bold">{mesa.numero}</span>}
                    <span className="text-xs text-zinc-400">{labelStatusMesa[mesa.statusMesa]}</span>
                  </button>
                  {podeCadastrarMesa && (
                    <button
                      onClick={(e) => { e.stopPropagation(); abrirEdicaoMesa(mesa) }}
                      title="Editar mesa"
                      className="absolute right-1.5 top-1.5 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
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
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold">Mesa {contaSelecionada.mesa.numero}</h2>
              <button
                onClick={cancelarConta}
                disabled={cancelandoConta}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                title="Cancelar mesa"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            onClick={() => setNovaComandaAberta(true)}
            className="mb-4 flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Plus className="h-4 w-4" /> Nova comanda
          </button>

          <div className="space-y-4">
            {contaSelecionada.comandas.map((comanda) => (
              <div key={comanda.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  {renomeandoComandaId === comanda.id ? (
                    <form onSubmit={salvarRenomeacao} className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={nomeRenomeacao}
                        onChange={(e) => setNomeRenomeacao(e.target.value)}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
                      />
                      <button type="submit" className="text-sm text-orange-400">Salvar</button>
                      <button type="button" onClick={() => setRenomeandoComandaId(null)} className="text-sm text-zinc-500">Cancelar</button>
                    </form>
                  ) : (
                    <button onClick={() => iniciarRenomeacao(comanda)} className="font-semibold hover:text-orange-400">
                      {comanda.nome}
                    </button>
                  )}
                  <button
                    onClick={() => abrirModalItem(comanda.id)}
                    className="flex items-center gap-1 rounded-lg bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/20"
                  >
                    <Plus className="h-3.5 w-3.5" /> Item
                  </button>
                </div>

                {comanda.itens.length === 0 && (comanda.rascunho?.length ?? 0) === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhum item ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {comanda.itens.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <span className="font-medium">{item.quantidade}x {item.nomeItem}</span>
                          {item.acompanhamento && <p className="text-xs font-medium text-orange-400">Acompanhamento: {item.acompanhamento}</p>}
                          {item.observacao && <p className="text-xs text-zinc-500">{item.observacao}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                            {labelStatusItem[item.status]}
                          </span>
                          {item.status !== 'cancelado' && contaSelecionada.comandas.length > 1 && (
                            <button
                              onClick={() => setTransferindoItemId(item.id)}
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Transferir pra outra comanda"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {item.status !== 'cancelado' && (
                            <button
                              onClick={() => abrirCancelamentoItem(item)}
                              className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                              title="Cancelar item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Itens em rascunho — anotados, ainda NÃO enviados pra cozinha */}
                {(comanda.rascunho?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-xl border border-dashed border-orange-500/40 bg-orange-500/5 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-400/80">Não enviado</p>
                    <ul className="space-y-1.5">
                      {comanda.rascunho!.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{r.quantidade}x {r.nomeItem}</span>
                            {r.acompanhamento && <p className="text-xs font-medium text-orange-400">Acompanhamento: {r.acompanhamento}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button onClick={() => alterarQtdRascunho(r.id, r.quantidade - 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">−</button>
                            <span className="w-4 text-center">{r.quantidade}</span>
                            <button onClick={() => alterarQtdRascunho(r.id, r.quantidade + 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">+</button>
                            <button onClick={() => removerRascunho(r.id)} className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400" title="Remover">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Barra da mesa: revisar e enviar TODO o rascunho de uma vez */}
          {totalItensRascunho > 0 && (
            <button
              onClick={() => { setErroPedido(null); setRevisandoMesa(true) }}
              className="sticky bottom-4 mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600"
            >
              Revisar e enviar pedido ({totalItensRascunho} {totalItensRascunho === 1 ? 'item' : 'itens'})
            </button>
          )}
        </div>
      )}

      {/* Revisão da mesa inteira: todo o rascunho agrupado por comanda + envio único */}
      {revisandoMesa && contaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setRevisandoMesa(false)}>
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-3">
              <div>
                <h3 className="text-lg font-bold">Confirmar pedido</h3>
                <p className="text-xs text-zinc-400">Mesa {contaSelecionada.mesa.numero} · toda a mesa</p>
              </div>
              <button onClick={() => setRevisandoMesa(false)}><X className="h-5 w-5 text-zinc-400" /></button>
            </div>

            <div className="overflow-y-auto px-4">
              {contaSelecionada.comandas.filter((c) => (c.rascunho?.length ?? 0) > 0).map((comanda) => (
                <div key={comanda.id} className="mb-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{comanda.nome}</p>
                  <ul className="space-y-1.5">
                    {comanda.rascunho!.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-100">{r.quantidade}x {r.nomeItem}</p>
                          {r.acompanhamento && <p className="text-xs font-medium text-orange-400">Acompanhamento: {r.acompanhamento}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => alterarQtdRascunho(r.id, r.quantidade - 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">−</button>
                          <span className="w-4 text-center">{r.quantidade}</span>
                          <button onClick={() => alterarQtdRascunho(r.id, r.quantidade + 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">+</button>
                          <button onClick={() => removerRascunho(r.id)} className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between border-t border-zinc-800 pt-3 text-base font-bold">
                <span>Total do pedido</span>
                <span>R$ {totalValorRascunho.toFixed(2)}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Confira com os clientes antes de enviar — nada foi pra cozinha ainda.</p>
            </div>

            <div className="space-y-2 p-4">
              {erroPedido && <p className="text-sm text-red-400">{erroPedido}</p>}
              <button
                onClick={enviarRascunhoDaMesa}
                disabled={enviandoPedido || totalItensRascunho === 0}
                className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {enviandoPedido ? 'Enviando...' : 'Confirmar e enviar tudo pra cozinha'}
              </button>
              <button
                onClick={() => setRevisandoMesa(false)}
                disabled={enviandoPedido}
                className="w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
              >
                ← Voltar e adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalItemAberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setModalItemAberto(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-3">
              <h3 className="text-lg font-bold">Adicionar item</h3>
              <button onClick={() => setModalItemAberto(null)}><X className="h-5 w-5 text-zinc-400" /></button>
            </div>

            <div className="overflow-y-auto px-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={buscaItem}
                  onChange={(e) => setBuscaItem(e.target.value)}
                  placeholder="Buscar item..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              {carregandoCardapio ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              ) : itensFiltrados.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum item encontrado.</p>
              ) : (
                <ul className="space-y-1">
                  {itensFiltrados.map((item) => {
                    const opcoesAcompanhamento = opcoesAcompanhamentoDe(item)
                    const pedeAcompanhamento = opcoesAcompanhamento.length > 0
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => pedeAcompanhamento ? setEscolhendoAcompanhamentoId(item.id) : adicionarAoCarrinho(item)}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-zinc-800"
                        >
                          <span>{item.nome}</span>
                          <span className="text-zinc-400">R$ {Number(item.preco).toFixed(2)}</span>
                        </button>
                        {escolhendoAcompanhamentoId === item.id && (
                          <div className="mb-1 space-y-1 rounded-lg border border-zinc-700 bg-zinc-800 p-2">
                            <p className="mb-1 text-xs font-medium text-zinc-400">Escolha o acompanhamento:</p>
                            {opcoesAcompanhamento.map((op) => (
                              <button
                                key={op.nome}
                                onClick={() => adicionarAoCarrinho(item, op.nome)}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-700"
                              >
                                <span>{op.nome}</span>
                                {op.precoAdicional > 0 && <span className="text-orange-400">+R$ {op.precoAdicional.toFixed(2)}</span>}
                              </button>
                            ))}
                            <button
                              onClick={() => setEscolhendoAcompanhamentoId(null)}
                              className="mt-1 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {(carrinho.length > 0 || erroPedido) && (
              <div className="border-t border-zinc-800 p-4">
                {carrinho.length > 0 && (
                  <>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Pedido</p>
                    <ul className="mb-3 space-y-1.5">
                      {carrinho.map((c) => (
                        <li key={c.chave} className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <span>{c.nome}</span>
                            {c.acompanhamento && <span className="ml-1 text-xs text-orange-400">({c.acompanhamento})</span>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button onClick={() => alterarQuantidadeCarrinho(c.chave, -1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">−</button>
                            <span className="w-4 text-center">{c.quantidade}</span>
                            <button onClick={() => alterarQuantidadeCarrinho(c.chave, 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">+</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {erroPedido && <p className="mb-2 text-sm text-red-400">{erroPedido}</p>}
                {carrinho.length > 0 && (
                  <button
                    onClick={adicionarRascunho}
                    disabled={enviandoPedido}
                    className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {enviandoPedido
                      ? 'Adicionando...'
                      : `Adicionar ao pedido (${carrinho.reduce((s, c) => s + c.quantidade, 0)} ${carrinho.reduce((s, c) => s + c.quantidade, 0) === 1 ? 'item' : 'itens'})`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {novaMesaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNovaMesaAberta(false)}>
          <form onSubmit={criarMesa} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Cadastrar mesa</h3>
            <div className="space-y-2">
              <input
                autoFocus
                value={numeroNovaMesa}
                onChange={(e) => setNumeroNovaMesa(e.target.value)}
                placeholder="Número (ex: 12)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <input
                value={areaNovaMesa}
                onChange={(e) => setAreaNovaMesa(e.target.value)}
                placeholder="Área (opcional, ex: Salão, Varanda)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                value={capacidadeNovaMesa}
                onChange={(e) => setCapacidadeNovaMesa(e.target.value)}
                placeholder="Capacidade (opcional, nº de pessoas)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
            </div>
            {erroNovaMesa && <p className="mt-2 text-sm text-red-400">{erroNovaMesa}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={salvandoMesa || !numeroNovaMesa.trim()}
                className="flex-1 rounded-xl bg-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {salvandoMesa ? 'Salvando...' : 'Cadastrar'}
              </button>
              <button
                type="button"
                onClick={() => setNovaMesaAberta(false)}
                className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {mesaEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMesaEditando(null)}>
          <form onSubmit={salvarEdicaoMesa} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Editar mesa</h3>
            <div className="space-y-2">
              <input
                autoFocus
                value={numeroEdicaoMesa}
                onChange={(e) => setNumeroEdicaoMesa(e.target.value)}
                placeholder="Número (ex: 12)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <input
                value={areaEdicaoMesa}
                onChange={(e) => setAreaEdicaoMesa(e.target.value)}
                placeholder="Área (opcional, ex: Salão, Varanda)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                value={capacidadeEdicaoMesa}
                onChange={(e) => setCapacidadeEdicaoMesa(e.target.value)}
                placeholder="Capacidade (opcional, nº de pessoas)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
            </div>
            {erroEdicaoMesa && <p className="mt-2 text-sm text-red-400">{erroEdicaoMesa}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={salvandoEdicaoMesa || !numeroEdicaoMesa.trim()}
                className="flex-1 rounded-xl bg-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {salvandoEdicaoMesa ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setMesaEditando(null)}
                className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {novaComandaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNovaComandaAberta(false)}>
          <form onSubmit={criarComanda} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Nova comanda</h3>
            <input
              autoFocus
              value={nomeNovaComanda}
              onChange={(e) => setNomeNovaComanda(e.target.value)}
              placeholder="Nome (ex: Luiz)"
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={salvandoComanda || !nomeNovaComanda.trim()}
              className="w-full rounded-xl bg-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Criar
            </button>
          </form>
        </div>
      )}

      {transferindoItemId && contaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTransferindoItemId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Transferir pra qual comanda?</h3>
            <ul className="space-y-1">
              {contaSelecionada.comandas
                .filter((c) => !c.itens.some((i) => i.id === transferindoItemId))
                .map((comanda) => (
                  <li key={comanda.id}>
                    <button
                      onClick={() => transferirItem(transferindoItemId, comanda.id)}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                    >
                      {comanda.nome}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {itemCancelamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setItemCancelamento(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Cancelar {itemCancelamento.nomeItem}?</h3>
            {!podeCancelarLivre(itemCancelamento.status) && (
              <p className="mb-3 text-xs text-zinc-400">
                Este item já está {labelStatusItem[itemCancelamento.status].toLowerCase()} — cancelar exige motivo e senha de supervisor.
              </p>
            )}
            <div className="space-y-2">
              <input
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder={podeCancelarLivre(itemCancelamento.status) ? 'Motivo (opcional)' : 'Motivo (obrigatório)'}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {!podeCancelarLivre(itemCancelamento.status) && (
                <input
                  type="password"
                  value={senhaCancelamento}
                  onChange={(e) => setSenhaCancelamento(e.target.value)}
                  placeholder="Senha de supervisor"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroCancelamento && <p className="mt-2 text-sm text-red-400">{erroCancelamento}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmarCancelamentoItem}
                disabled={
                  enviandoCancelamento ||
                  (!podeCancelarLivre(itemCancelamento.status) && (!motivoCancelamento || !senhaCancelamento))
                }
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                Confirmar cancelamento
              </button>
              <button onClick={() => setItemCancelamento(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
