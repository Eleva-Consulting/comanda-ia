import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Minus, Plus, X } from 'lucide-react'
import { API_URL } from '../../lib/api'
import type { Bairro, ItemCardapio } from './tipos'

interface Props {
  aberto: boolean
  token: string
  onFechar: () => void
}

// Modal de pedido manual (balcão) — portado da Cozinha antiga sem mudança de lógica.
// Ao registrar com sucesso só fecha: o evento pedido:novo do socket entrega o card.
export default function ModalNovoPedido({ aberto, token, onFechar }: Props) {
  const [cardapio, setCardapio]             = useState<ItemCardapio[]>([])
  const [bairros, setBairros]               = useState<Bairro[]>([])
  const [carregandoMenu, setCarregandoMenu] = useState(false)

  const [clienteNome, setClienteNome] = useState('')
  const [clienteFone, setClienteFone] = useState('')
  const [selecionados, setSelecionados] = useState<Record<string, { quantidade: number; observacao: string; acompanhamento?: string }>>({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'pix_maquininha' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'>('dinheiro')
  const [tipoEntrega, setTipoEntrega] = useState<'entrega' | 'retirada'>('retirada')
  const [precisaTroco, setPrecisaTroco] = useState(false)
  const [trocoPara, setTrocoPara] = useState('')
  const [endereco, setEndereco] = useState('')
  const [bairroId, setBairroId] = useState('')
  const [buscaItem, setBuscaItem] = useState('')

  useEffect(() => {
    if (!aberto) return
    // Reseta o form a cada abertura (mesmo comportamento do abrirModalNovoPedido antigo).
    setClienteNome('')
    setClienteFone('')
    setSelecionados({})
    setErro(null)
    setFormaPagamento('dinheiro')
    setTipoEntrega('retirada')
    setPrecisaTroco(false)
    setTrocoPara('')
    setEndereco('')
    setBairroId('')
    setBuscaItem('')

    if (cardapio.length === 0) {
      setCarregandoMenu(true)
      fetch(`${API_URL}/cardapio`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((dados: ItemCardapio[]) => setCardapio(dados.filter((i) => i.disponivel)))
        .catch(console.error)
        .finally(() => setCarregandoMenu(false))
    }
    if (bairros.length === 0) {
      fetch(`${API_URL}/bairros`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setBairros)
        .catch(console.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  function alterarQtd(itemId: string, delta: number) {
    setSelecionados((prev) => {
      const atual = prev[itemId]?.quantidade ?? 0
      const nova  = atual + delta
      if (nova <= 0) {
        const { [itemId]: _, ...resto } = prev
        return resto
      }
      return {
        ...prev,
        [itemId]: { quantidade: nova, observacao: prev[itemId]?.observacao ?? '', acompanhamento: prev[itemId]?.acompanhamento },
      }
    })
  }

  function alterarAcompanhamento(itemId: string, acompanhamento: string) {
    setSelecionados((prev) => ({
      ...prev,
      [itemId]: { quantidade: prev[itemId]?.quantidade ?? 1, observacao: prev[itemId]?.observacao ?? '', acompanhamento },
    }))
  }

  function alterarObs(itemId: string, observacao: string) {
    setSelecionados((prev) => ({
      ...prev,
      [itemId]: { quantidade: prev[itemId]?.quantidade ?? 1, observacao },
    }))
  }

  const bairroSelecionado = bairros.find((b) => b.id === bairroId)
  const taxa = tipoEntrega === 'entrega' ? (bairroSelecionado?.taxaEntrega ?? 0) : 0
  const subtotal = cardapio.reduce((soma, item) => {
    const sel = selecionados[item.id]
    if (!sel) return soma
    const opcao = item.categoria?.opcoesAcompanhamento?.find((o) => o.nome === sel.acompanhamento)
    return soma + (Number(item.preco) + Number(opcao?.precoAdicional ?? 0)) * sel.quantidade
  }, 0)
  const total = subtotal + taxa
  const itensFiltrados = cardapio.filter((item) =>
    item.nome.toLowerCase().includes(buscaItem.trim().toLowerCase())
  )

  async function criarPedidoManual(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    const itemFaltandoAcompanhamento = Object.entries(selecionados).find(([itemCardapioId, sel]) => {
      const item = cardapio.find((i) => i.id === itemCardapioId)
      return (item?.categoria?.opcoesAcompanhamento?.length ?? 0) > 0 && !sel.acompanhamento
    })
    if (itemFaltandoAcompanhamento) {
      const item = cardapio.find((i) => i.id === itemFaltandoAcompanhamento[0])
      setErro(`Escolha o acompanhamento de "${item?.nome}"`)
      return
    }

    const itens = Object.entries(selecionados).map(([itemCardapioId, { quantidade, observacao, acompanhamento }]) => ({
      itemCardapioId,
      quantidade,
      observacao: observacao || undefined,
      acompanhamento: acompanhamento || undefined,
    }))
    if (itens.length === 0) {
      setErro('Selecione pelo menos um item')
      return
    }
    if (tipoEntrega === 'entrega' && !endereco.trim()) {
      setErro('Endereço de entrega é obrigatório')
      return
    }
    if (tipoEntrega === 'entrega' && bairros.length > 0 && !bairroId) {
      setErro('Selecione o bairro de entrega')
      return
    }
    if (formaPagamento === 'dinheiro' && precisaTroco && !trocoPara.trim()) {
      setErro('Informe o valor para o troco')
      return
    }
    setEnviando(true)
    try {
      const resp = await fetch(`${API_URL}/pedidos/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          clienteNome,
          clienteFone: clienteFone.trim() || undefined,
          enderecoEntrega: tipoEntrega === 'entrega' ? endereco.trim() || undefined : undefined,
          bairroId: tipoEntrega === 'entrega' && bairros.length > 0 ? bairroId : undefined,
          itens,
          formaPagamento,
          precisaTroco: formaPagamento === 'dinheiro' ? precisaTroco : undefined,
          trocoPara: formaPagamento === 'dinheiro' && precisaTroco
            ? parseFloat(trocoPara.replace(',', '.'))
            : undefined,
          tipoEntrega,
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErro(dados.erro ?? 'Erro ao criar pedido'); return }
      onFechar()
    } catch {
      setErro('Falha de conexão')
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="flex h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 p-5">
          <h3 className="text-lg font-bold">Novo Pedido</h3>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={criarPedidoManual} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Nome</span>
                <input
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="Nome do cliente (opcional)"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Telefone</span>
                <input
                  value={clienteFone}
                  onChange={(e) => setClienteFone(e.target.value)}
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
                  onClick={() => setTipoEntrega(tipo)}
                  className={`rounded-xl py-2 text-sm font-semibold transition ${
                    tipoEntrega === tipo
                      ? 'bg-orange-500 text-white'
                      : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {tipo === 'retirada' ? '🏪 Retirada' : '🛵 Entrega'}
                </button>
              ))}
            </div>

            {tipoEntrega === 'entrega' && (
              <div className="space-y-3">
                {bairros.length > 0 && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Bairro</span>
                    <select
                      value={bairroId}
                      onChange={(e) => setBairroId(e.target.value)}
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
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
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
                  { valor: 'pix_maquininha', label: 'Pix (maquininha)' },
                ] as const).map(({ valor, label }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setFormaPagamento(valor)}
                    className={`rounded-xl py-2 text-sm font-semibold transition ${
                      formaPagamento === valor
                        ? 'bg-orange-500 text-white'
                        : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {formaPagamento === 'dinheiro' && (
                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={precisaTroco}
                      onChange={(e) => setPrecisaTroco(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 accent-orange-500"
                    />
                    <span className="text-sm text-zinc-300">Precisa de troco?</span>
                  </label>
                  {precisaTroco && (
                    <input
                      value={trocoPara}
                      onChange={(e) => setTrocoPara(e.target.value)}
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
                        {sel && (item.categoria?.opcoesAcompanhamento?.length ?? 0) > 0 && (
                          <select
                            value={sel.acompanhamento ?? ''}
                            onChange={(e) => alterarAcompanhamento(item.id, e.target.value)}
                            className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-orange-500"
                          >
                            <option value="">Escolha o acompanhamento...</option>
                            {item.categoria!.opcoesAcompanhamento.map((op) => (
                              <option key={op.nome} value={op.nome}>
                                {op.nome}{op.precoAdicional > 0 ? ` (+R$ ${op.precoAdicional.toFixed(2)})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
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
            {erro && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                {erro}
              </p>
            )}
          </div>
          <div className="border-t border-zinc-800 p-5">
            {taxa > 0 && (
              <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                <span>Taxa de entrega{bairroSelecionado ? ` (${bairroSelecionado.nome})` : ''}</span>
                <span>R$ {taxa.toFixed(2)}</span>
              </div>
            )}
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-xl font-extrabold text-orange-400">R$ {total.toFixed(2)}</span>
            </div>
            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar Pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
