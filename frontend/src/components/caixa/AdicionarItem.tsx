import { useEffect, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { API_URL } from '../../lib/api'

interface OpcaoAcompanhamento {
  nome: string
  precoAdicional: number
}

interface ItemCardapio {
  id: string
  nome: string
  preco: number
  disponivel: boolean
  categoria: { opcoesAcompanhamento: OpcaoAcompanhamento[] } | null
}

interface Props {
  comandaId: string
  token: string
  onAdicionado: () => void
  onFechar: () => void
}

// Adiciona um item direto na comanda, já como "entregue" — sem passar pela cozinha.
// Uso do Caixa: item esquecido de lançar, na hora de fechar a conta (não precisa de preparo).
export default function AdicionarItem({ comandaId, token, onAdicionado, onFechar }: Props) {
  const [cardapio, setCardapio]       = useState<ItemCardapio[]>([])
  const [carregando, setCarregando]   = useState(true)
  const [busca, setBusca]             = useState('')
  const [itemEscolhido, setItemEscolhido] = useState<ItemCardapio | null>(null)
  const [acompanhamento, setAcompanhamento] = useState<string | undefined>(undefined)
  const [quantidade, setQuantidade]   = useState(1)
  const [observacao, setObservacao]   = useState('')
  const [enviando, setEnviando]       = useState(false)
  const [erro, setErro]               = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/cardapio`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((dados) => setCardapio(Array.isArray(dados) ? dados.filter((i: ItemCardapio) => i.disponivel) : []))
      .catch(() => setErro('Falha ao carregar cardápio'))
      .finally(() => setCarregando(false))
  }, [token])

  const itensFiltrados = cardapio.filter((i) => i.nome.toLowerCase().includes(busca.toLowerCase()))

  function escolherItem(item: ItemCardapio) {
    setItemEscolhido(item)
    setAcompanhamento(undefined)
    setQuantidade(1)
    setObservacao('')
    setErro(null)
  }

  async function confirmarAdicao() {
    if (!itemEscolhido) return
    setEnviando(true)
    setErro(null)
    try {
      const resp = await fetch(`${API_URL}/comandas/${comandaId}/item-direto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCardapioId: itemEscolhido.id,
          quantidade,
          ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
          ...(acompanhamento ? { acompanhamento } : {}),
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErro(dados.erro ?? 'Não foi possível adicionar o item'); return }
      onAdicionado()
      onFechar()
    } catch {
      setErro('Falha de conexão')
    } finally {
      setEnviando(false)
    }
  }

  const opcoes = itemEscolhido?.categoria?.opcoesAcompanhamento ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onFechar}>
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl bg-zinc-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className="text-lg font-bold">Adicionar item</h3>
          <button onClick={onFechar}><X className="h-5 w-5 text-zinc-400" /></button>
        </div>

        {!itemEscolhido ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar item do cardápio..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {carregando ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-500" />
            ) : (
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {itensFiltrados.length === 0 && <p className="text-sm text-zinc-500">Nenhum item encontrado.</p>}
                {itensFiltrados.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => escolherItem(item)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm hover:border-orange-500/50"
                  >
                    <span>{item.nome}</span>
                    <span className="text-zinc-400">R$ {item.preco.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-4">
            <button onClick={() => setItemEscolhido(null)} className="text-xs text-zinc-400 hover:text-zinc-200">← Trocar item</button>
            <p className="font-semibold">{itemEscolhido.nome}</p>

            {opcoes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-zinc-400">Acompanhamento</p>
                <div className="flex flex-wrap gap-1.5">
                  {opcoes.map((op) => (
                    <button
                      key={op.nome}
                      onClick={() => setAcompanhamento(acompanhamento === op.nome ? undefined : op.nome)}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${acompanhamento === op.nome ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-zinc-700 bg-zinc-800 text-zinc-300'}`}
                    >
                      {op.nome}{op.precoAdicional > 0 && ` (+R$ ${op.precoAdicional.toFixed(2)})`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Quantidade</span>
              <button onClick={() => setQuantidade((q) => Math.max(1, q - 1))} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">−</button>
              <span className="w-4 text-center text-sm">{quantidade}</span>
              <button onClick={() => setQuantidade((q) => q + 1)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700">+</button>
            </div>

            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação (opcional)"
              maxLength={300}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            />

            {erro && <p className="text-sm text-red-400">{erro}</p>}

            <button
              onClick={confirmarAdicao}
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Adicionar item
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
