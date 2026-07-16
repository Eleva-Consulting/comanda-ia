import { useEffect, useState } from 'react'
import { Loader2, Minus, Plus, X } from 'lucide-react'
import { API_URL } from '../../lib/api'
import type { ItemCardapio, ItemPedido, Pedido } from './tipos'

interface Props {
  pedido: Pedido
  token: string
  onFechar: () => void
  onPedidoAtualizado: (pedido: Pedido) => void
}

// Modal de editar itens de um pedido existente — portado da Cozinha antiga sem
// mudança de lógica (adicionar com acompanhamento, quantidade ±, remover).
export default function ModalEditarItensPedido({ pedido, token, onFechar, onPedidoAtualizado }: Props) {
  const [cardapio, setCardapio]             = useState<ItemCardapio[]>([])
  const [carregandoMenu, setCarregandoMenu] = useState(false)
  const [salvandoItemId, setSalvandoItemId] = useState<string | null>(null)
  const [erro, setErro]                     = useState<string | null>(null)
  const [escolhendoAcompanhamentoId, setEscolhendoAcompanhamentoId] = useState<string | null>(null)
  const [buscaItem, setBuscaItem]           = useState('')

  useEffect(() => {
    setCarregandoMenu(true)
    fetch(`${API_URL}/cardapio`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((dados: ItemCardapio[]) => setCardapio(dados.filter((i) => i.disponivel)))
      .catch(console.error)
      .finally(() => setCarregandoMenu(false))
  }, [token])

  async function adicionarItem(itemCardapioId: string, acompanhamento?: string) {
    setErro(null)
    setSalvandoItemId(itemCardapioId)
    setEscolhendoAcompanhamentoId(null)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${pedido.id}/itens`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ itemCardapioId, quantidade: 1, ...(acompanhamento ? { acompanhamento } : {}) }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErro(dados.erro ?? 'Erro ao adicionar item'); return }
      onPedidoAtualizado(dados)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvandoItemId(null)
    }
  }

  async function alterarQuantidade(item: ItemPedido, delta: number) {
    const novaQuantidade = item.quantidade + delta
    if (novaQuantidade < 1) { removerItem(item.id); return }

    setErro(null)
    setSalvandoItemId(item.id)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${pedido.id}/itens/${item.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ quantidade: novaQuantidade }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErro(dados.erro ?? 'Erro ao atualizar item'); return }
      onPedidoAtualizado(dados)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvandoItemId(null)
    }
  }

  async function removerItem(itemPedidoId: string) {
    setErro(null)
    setSalvandoItemId(itemPedidoId)
    try {
      const resp = await fetch(`${API_URL}/pedidos/${pedido.id}/itens/${itemPedidoId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const dados = await resp.json().catch(() => ({}))
        setErro(dados.erro ?? 'Erro ao remover item')
        return
      }
      const dados = await resp.json()
      onPedidoAtualizado(dados)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvandoItemId(null)
    }
  }

  const itensFiltrados = cardapio.filter((item) =>
    item.nome.toLowerCase().includes(buscaItem.trim().toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="flex h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 p-5">
          <div>
            <h3 className="text-lg font-bold">Editar pedido</h3>
            <p className="text-xs text-zinc-500">{pedido.clienteNome} · #{pedido.id.slice(-6)}</p>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className="mb-3 text-xs font-medium text-zinc-400">Itens do pedido</p>
            <div className="space-y-2">
              {pedido.itens.map((item) => (
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
                        onClick={() => alterarQuantidade(item, -1)}
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
                        onClick={() => alterarQuantidade(item, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-orange-400 hover:bg-zinc-700 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {item.acompanhamento && (
                    <p className="mt-1.5 text-xs font-medium text-orange-400">Acompanhamento: {item.acompanhamento}</p>
                  )}
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
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              placeholder="Buscar item pelo nome..."
              className="mb-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
            />
            {carregandoMenu ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
              </div>
            ) : itensFiltrados.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">Nenhum item encontrado.</p>
            ) : (
              <div className="space-y-2">
                {itensFiltrados.map((item) => {
                  const pedeAcompanhamento = (item.categoria?.opcoesAcompanhamento?.length ?? 0) > 0
                  return (
                    <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.nome}</p>
                          <p className="text-xs text-orange-400">R$ {Number(item.preco).toFixed(2)}</p>
                        </div>
                        <button
                          type="button"
                          disabled={salvandoItemId === item.id}
                          onClick={() => pedeAcompanhamento ? setEscolhendoAcompanhamentoId(item.id) : adicionarItem(item.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                        >
                          {salvandoItemId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </button>
                      </div>
                      {escolhendoAcompanhamentoId === item.id && (
                        <div className="mt-2 space-y-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
                          <p className="mb-1 text-xs font-medium text-zinc-400">Escolha o acompanhamento:</p>
                          {item.categoria!.opcoesAcompanhamento.map((op) => (
                            <button
                              key={op.nome}
                              type="button"
                              onClick={() => adicionarItem(item.id, op.nome)}
                              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                            >
                              <span>{op.nome}</span>
                              {op.precoAdicional > 0 && <span className="text-orange-400">+R$ {op.precoAdicional.toFixed(2)}</span>}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setEscolhendoAcompanhamentoId(null)}
                            className="mt-1 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {erro && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erro}
            </p>
          )}
        </div>

        <div className="border-t border-zinc-800 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Total</span>
            <span className="text-xl font-extrabold text-orange-400">R$ {Number(pedido.total).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
