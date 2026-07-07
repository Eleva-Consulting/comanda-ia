import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Plus, Search, X, ArrowRightLeft } from 'lucide-react'
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
  const [modalItemAberto, setModalItemAberto] = useState<string | null>(null) // comandaId
  const [cardapio, setCardapio] = useState<ItemCardapio[]>([])
  const [carregandoCardapio, setCarregandoCardapio] = useState(false)
  const [buscaItem, setBuscaItem] = useState('')
  const [adicionandoItemId, setAdicionandoItemId] = useState<string | null>(null)

  const [novaComandaAberta, setNovaComandaAberta] = useState(false)
  const [nomeNovaComanda, setNomeNovaComanda] = useState('')
  const [salvandoComanda, setSalvandoComanda] = useState(false)

  const [renomeandoComandaId, setRenomeandoComandaId] = useState<string | null>(null)
  const [nomeRenomeacao, setNomeRenomeacao] = useState('')
  const [transferindoItemId, setTransferindoItemId] = useState<string | null>(null)
  const [cancelandoConta, setCancelandoConta] = useState(false)

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
    await carregarCardapioSeNecessario()
  }

  async function recarregarContaAtual() {
    if (!contaSelecionada) return
    const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (resp.ok) setContaSelecionada(await resp.json())
  }

  async function adicionarItem(itemCardapioId: string) {
    if (!modalItemAberto) return
    setAdicionandoItemId(itemCardapioId)
    try {
      const resp = await fetch(`${API_URL}/comandas/${modalItemAberto}/itens`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemCardapioId, quantidade: 1 }),
      })
      if (resp.ok) await recarregarContaAtual()
    } catch (err) {
      console.error(err)
    } finally {
      setAdicionandoItemId(null)
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
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                            {labelStatusItem[item.status]}
                          </span>
                          {contaSelecionada.comandas.length > 1 && (
                            <button
                              onClick={() => setTransferindoItemId(item.id)}
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Transferir pra outra comanda"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {modalItemAberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setModalItemAberto(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-zinc-900 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">Adicionar item</h3>
              <button onClick={() => setModalItemAberto(null)}><X className="h-5 w-5 text-zinc-400" /></button>
            </div>
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
                {itensFiltrados.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => adicionarItem(item.id)}
                      disabled={adicionandoItemId === item.id}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <span>{item.nome}</span>
                      <span className="text-zinc-400">R$ {Number(item.preco).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
    </Layout>
  )
}
