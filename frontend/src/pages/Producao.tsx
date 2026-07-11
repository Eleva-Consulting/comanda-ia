import { useEffect, useState } from 'react'
import { Loader2, ChefHat, X } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocketProducao } from '../hooks/useSocketProducao'

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

function minutosDesde(dataIso: string, referencia: number): number {
  return Math.floor((referencia - new Date(dataIso).getTime()) / 60000)
}

function corCronometro(minutos: number, tempoAlvoMinutos: number | null): string {
  if (tempoAlvoMinutos === null) return 'text-zinc-500'
  if (minutos >= tempoAlvoMinutos) return 'text-red-400'
  if (minutos >= tempoAlvoMinutos * 0.7) return 'text-yellow-400'
  return 'text-zinc-500'
}

export default function Producao() {
  const token = localStorage.getItem('token')
  const { socket } = useSocketProducao(token)

  const [modulosAtivos, setModulosAtivos] = useState<string[] | null>(null)
  const [itens, setItens] = useState<ItemProducao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [avancandoId, setAvancandoId] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())

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

  function atualizarItemLocal(item: ItemProducao) {
    setItens((prev) => {
      const semEsseItem = prev.filter((i) => i.id !== item.id)
      const aindaAtivo = item.status === 'recebido' || item.status === 'em_preparo' || item.status === 'pronto'
      return aindaAtivo ? [...semEsseItem, item] : semEsseItem
    })
  }

  function podeCancelarLivre(status: StatusProducao): boolean {
    return status === 'recebido' || status === 'em_preparo'
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

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(() => setModulosAtivos([]))
  }, [token])

  useEffect(() => {
    if (modulosAtivos?.includes('mesas')) carregarItens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulosAtivos])

  useEffect(() => {
    if (!socket) return

    function aoReceberItem(item: ItemProducao) {
      atualizarItemLocal(item)
    }

    socket.on('producao:item-novo', aoReceberItem)
    socket.on('producao:item-atualizado', aoReceberItem)

    return () => {
      socket.off('producao:item-novo', aoReceberItem)
      socket.off('producao:item-atualizado', aoReceberItem)
    }
  }, [socket])

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 15000)
    return () => clearInterval(intervalo)
  }, [])

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
      <h2 className="mb-6 text-2xl font-extrabold">Produção</h2>
      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}
      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {colunas.map((coluna) => {
            const itensDaColuna = itens
              .filter((i) => i.status === coluna.status)
              .sort((a, b) => new Date(a.recebidoEm).getTime() - new Date(b.recebidoEm).getTime())

            return (
              <div key={coluna.status} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="font-semibold text-zinc-200">{coluna.titulo}</h3>
                  <span className="text-xs text-zinc-500">{itensDaColuna.length}</span>
                </div>

                {itensDaColuna.length === 0 ? (
                  <p className="px-1 text-sm text-zinc-600">Nada por aqui.</p>
                ) : (
                  <div className="space-y-2">
                    {itensDaColuna.map((item) => {
                      const minutos = minutosDesde(item.recebidoEm, agora)
                      return (
                        <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-zinc-100">
                              {item.quantidade}x {item.nomeItem}
                            </span>
                            <span className={`flex items-center gap-1 text-xs font-medium ${corCronometro(minutos, item.tempoAlvoMinutos)}`}>
                              {minutos}min
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            Mesa {item.mesaNumero} · {item.comandaNome}
                          </p>
                          {item.acompanhamento && (
                            <p className="mt-1 text-xs font-medium text-orange-400">Acompanhamento: {item.acompanhamento}</p>
                          )}
                          {item.observacao && (
                            <p className="mt-1 text-xs italic text-zinc-500">{item.observacao}</p>
                          )}
                          {labelAvancar[item.status] && (
                            <button
                              onClick={() => avancarStatus(item)}
                              disabled={avancandoId === item.id}
                              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                            >
                              {avancandoId === item.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <ChefHat className="h-3.5 w-3.5" />}
                              {labelAvancar[item.status]}
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
                              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                            >
                              Cancelar item
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
    </Layout>
  )
}
