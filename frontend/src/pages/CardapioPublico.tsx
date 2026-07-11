import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { ChefHat, Plus, Minus, ShoppingBag, X, Loader2, CheckCircle2, Phone, User, MapPin, Star } from 'lucide-react'
import { API_URL } from '../lib/api'
import PixAguardandoPagamento from '../components/PixAguardandoPagamento'

interface OpcaoAcompanhamento {
  nome: string
  precoAdicional: number
}

interface ItemPublico {
  id: string
  nome: string
  descricao: string | null
  preco: number
  foto: string | null
  categoria: { id: string; nome: string; ordem: number } | null
  opcoesAcompanhamento: OpcaoAcompanhamento[]
}

interface CarrinhoEntry {
  itemId: string
  quantidade: number
  acompanhamento: string | null
}

function chaveCarrinho(itemId: string, acompanhamento: string | null): string {
  return `${itemId}::${acompanhamento ?? ''}`
}

interface CardapioData {
  estabelecimento: {
    nome: string
    slug: string
    aceitandoPedidos: boolean
    chavePix: string | null
    mpConectado: boolean
    taxaEntrega: number | null
  }
  cardapio: ItemPublico[]
}

interface Bairro {
  id:          string
  nome:        string
  taxaEntrega: number | null
}

interface PedidoConfirmado {
  id: string
  total: number
  mensagem: string
  pixCopiaCola?: string | null
  pixQrCodeBase64?: string | null
}

type FormaPagamento = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'
type TipoEntrega = 'entrega' | 'retirada'

const formaPagamentoLabel: Record<FormaPagamento, string> = {
  pix:            'PIX',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito:  'Cartão de débito',
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CardapioPublico() {
  const { slug } = useParams<{ slug: string }>()
  const [dados, setDados] = useState<CardapioData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(false)

  const [carrinho, setCarrinho] = useState<Record<string, CarrinhoEntry>>({})
  const [checkoutAberto, setCheckoutAberto] = useState(false)
  const [pedidoConfirmado, setPedidoConfirmado] = useState<PedidoConfirmado | null>(null)
  const [pedidoAguardandoPix, setPedidoAguardandoPix] = useState<PedidoConfirmado | null>(null)
  const [avaliacaoFeita, setAvaliacaoFeita] = useState(false)
  const [bairros, setBairros] = useState<Bairro[]>([])
  const [buscaItem, setBuscaItem] = useState('')

  useEffect(() => {
    if (!slug) return
    fetch(`${API_URL}/publico/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Estabelecimento não encontrado')
        return r.json() as Promise<CardapioData>
      })
      .then((d) => setDados(d))
      .catch(() => setErroCarga(true))
      .finally(() => setCarregando(false))

    fetch(`${API_URL}/publico/${slug}/bairros`)
      .then((r) => r.json())
      .then(setBairros)
      .catch(() => null)
  }, [slug])

  function adicionar(id: string, acompanhamento: string | null = null) {
    const chave = chaveCarrinho(id, acompanhamento)
    setCarrinho((p) => ({
      ...p,
      [chave]: { itemId: id, acompanhamento, quantidade: (p[chave]?.quantidade ?? 0) + 1 },
    }))
  }

  function remover(id: string, acompanhamento: string | null = null) {
    const chave = chaveCarrinho(id, acompanhamento)
    setCarrinho((p) => {
      const novo = { ...p }
      const valor = (novo[chave]?.quantidade ?? 0) - 1
      if (valor <= 0) delete novo[chave]
      else novo[chave] = { ...novo[chave], quantidade: valor }
      return novo
    })
  }

  function handleSucessoPedido(pedido: PedidoConfirmado) {
    setCarrinho({})
    if (pedido.pixCopiaCola && pedido.pixQrCodeBase64) {
      setPedidoAguardandoPix(pedido)
      setCheckoutAberto(false)
      return
    }
    setPedidoConfirmado(pedido)
    setCheckoutAberto(false)
  }

  function precoComAcompanhamento(item: ItemPublico, acompanhamento: string | null): number {
    const opcao = item.opcoesAcompanhamento.find((o) => o.nome === acompanhamento)
    return item.preco + (opcao?.precoAdicional ?? 0)
  }

  const totalItens = Object.values(carrinho).reduce((s, e) => s + e.quantidade, 0)
  const subtotalReais = dados
    ? Object.values(carrinho).reduce((soma, entry) => {
        const item = dados.cardapio.find((i) => i.id === entry.itemId)
        return soma + (item ? precoComAcompanhamento(item, entry.acompanhamento) * entry.quantidade : 0)
      }, 0)
    : 0

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
      </div>
    )
  }

  if (erroCarga || !dados) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-center">
        <div>
          <div className="mb-3 text-4xl">😕</div>
          <h1 className="text-xl font-bold text-zinc-100">Cardápio não encontrado</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Confira o link enviado pelo restaurante.
          </p>
        </div>
      </div>
    )
  }

  if (pedidoConfirmado && !avaliacaoFeita) {
    return (
      <TelaConfirmacao
        pedido={pedidoConfirmado}
        slug={slug!}
        nomeEstabelecimento={dados.estabelecimento.nome}
        onAvaliacaoFeita={() => setAvaliacaoFeita(true)}
      />
    )
  }

  if (pedidoConfirmado && avaliacaoFeita) {
    return <TelaObrigado nomeEstabelecimento={dados.estabelecimento.nome} pedido={pedidoConfirmado} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 pb-32">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500">
            <ChefHat className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold leading-tight">{dados.estabelecimento.nome}</h1>
            <p className="text-xs text-zinc-400">Faça seu pedido</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!dados.estabelecimento.aceitandoPedidos && (
          <div className="mx-4 mb-4 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-center">
            <p className="font-semibold text-orange-400">Estamos temporariamente fechados</p>
            <p className="mt-0.5 text-sm text-orange-400/70">Voltamos em breve!</p>
          </div>
        )}
        {dados.cardapio.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-400">O restaurante ainda não cadastrou itens no cardápio.</p>
          </div>
        ) : (
          <>
            <input
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="mb-6 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
            />
            {(() => {
              const itensFiltrados = dados.cardapio.filter((item) =>
                item.nome.toLowerCase().includes(buscaItem.trim().toLowerCase())
              )
              return itensFiltrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">Nenhum item encontrado para "{buscaItem}".</p>
              ) : (
                <GruposCardapio
                  cardapio={itensFiltrados}
                  carrinho={carrinho}
                  onAdicionar={adicionar}
                  onRemover={remover}
                />
              )
            })()}
          </>
        )}
      </main>

      {totalItens > 0 && (
        <BarraCarrinho
          totalItens={totalItens}
          subtotal={subtotalReais}
          taxaEntrega={dados.estabelecimento.taxaEntrega}
          aceitandoPedidos={dados.estabelecimento.aceitandoPedidos}
          onFinalizar={() => setCheckoutAberto(true)}
        />
      )}

      {checkoutAberto && (
        <ModalCheckout
          slug={slug!}
          carrinho={carrinho}
          cardapio={dados.cardapio}
          subtotal={subtotalReais}
          totalItens={totalItens}
          mpConectado={dados.estabelecimento.mpConectado}
          taxaEntrega={dados.estabelecimento.taxaEntrega}
          bairros={bairros}
          onFechar={() => setCheckoutAberto(false)}
          onSucesso={handleSucessoPedido}
        />
      )}

      {pedidoAguardandoPix?.pixCopiaCola && pedidoAguardandoPix?.pixQrCodeBase64 && (
        <PixAguardandoPagamento
          slug={slug!}
          pedidoId={pedidoAguardandoPix.id}
          pixCopiaCola={pedidoAguardandoPix.pixCopiaCola}
          pixQrCodeBase64={pedidoAguardandoPix.pixQrCodeBase64}
          onPago={() => {
            setPedidoConfirmado(pedidoAguardandoPix)
            setPedidoAguardandoPix(null)
          }}
        />
      )}
    </div>
  )
}

function GruposCardapio({
  cardapio, carrinho, onAdicionar, onRemover,
}: {
  cardapio: ItemPublico[]
  carrinho: Record<string, CarrinhoEntry>
  onAdicionar: (id: string, acompanhamento?: string | null) => void
  onRemover: (id: string, acompanhamento?: string | null) => void
}) {
  const grupos = (() => {
    const mapa = new Map<string, { nome: string; ordem: number; itens: ItemPublico[] }>()

    for (const item of cardapio) {
      if (item.categoria) {
        const key = item.categoria.id
        if (!mapa.has(key)) {
          mapa.set(key, { nome: item.categoria.nome, ordem: item.categoria.ordem, itens: [] })
        }
        mapa.get(key)!.itens.push(item)
      }
    }

    const comCategoria = [...mapa.values()].sort((a, b) => a.ordem - b.ordem)
    const semCategoria = cardapio.filter((i) => !i.categoria)

    return [
      ...comCategoria,
      ...(semCategoria.length > 0 ? [{ nome: null, ordem: Infinity, itens: semCategoria }] : []),
    ]
  })()

  return (
    <div className="space-y-8">
      {grupos.map((grupo, idx) => (
        <div key={idx}>
          {grupo.nome && (
            <h2 className="mb-3 border-b border-zinc-800 pb-2 text-sm font-bold uppercase tracking-widest text-orange-400">
              {grupo.nome}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {grupo.itens.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                variantes={Object.values(carrinho).filter((e) => e.itemId === item.id)}
                onAdicionar={(acompanhamento) => onAdicionar(item.id, acompanhamento)}
                onRemover={(acompanhamento) => onRemover(item.id, acompanhamento)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ItemCard({
  item, variantes, onAdicionar, onRemover,
}: {
  item: ItemPublico
  variantes: CarrinhoEntry[]
  onAdicionar: (acompanhamento: string | null) => void
  onRemover: (acompanhamento: string | null) => void
}) {
  const [escolhendo, setEscolhendo] = useState(false)
  const pedeAcompanhamento = item.opcoesAcompanhamento.length > 0
  const quantidadeTotal = variantes.reduce((s, v) => s + v.quantidade, 0)

  function clicarAdicionar() {
    if (pedeAcompanhamento) setEscolhendo(true)
    else onAdicionar(null)
  }

  function escolherOpcao(nomeOpcao: string) {
    onAdicionar(nomeOpcao)
    setEscolhendo(false)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {item.foto && (
        <img
          src={item.foto}
          alt={item.nome}
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-sm font-bold leading-snug">{item.nome}</h3>
        {item.descricao && (
          <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{item.descricao}</p>
        )}
        <p className="mt-2 font-extrabold text-orange-400">{formatarBRL(item.preco)}</p>

        {/* Variantes já no carrinho (uma linha por acompanhamento escolhido) */}
        {variantes.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {variantes.map((v) => (
              <div key={v.acompanhamento ?? ''} className="flex items-center justify-between rounded-xl bg-zinc-800 px-1 py-1">
                {v.acompanhamento && (
                  <span className="ml-2 flex-1 truncate text-xs text-zinc-400">{v.acompanhamento}</span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onRemover(v.acompanhamento)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-orange-400 transition hover:bg-zinc-700"
                    aria-label="Remover um"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-5 text-center text-sm font-bold">{v.quantidade}</span>
                  <button
                    onClick={() => onAdicionar(v.acompanhamento)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-orange-400 transition hover:bg-zinc-700"
                    aria-label="Adicionar mais um"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Escolha de acompanhamento (item pede e o cliente clicou em adicionar/adicionar outro) */}
        {escolhendo && (
          <div className="mt-2 space-y-1 rounded-xl border border-zinc-700 bg-zinc-950 p-2">
            <p className="mb-1 text-xs font-medium text-zinc-400">Escolha o acompanhamento:</p>
            {item.opcoesAcompanhamento.map((op) => (
              <button
                key={op.nome}
                onClick={() => escolherOpcao(op.nome)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <span>{op.nome}</span>
                {op.precoAdicional > 0 && <span className="text-orange-400">+{formatarBRL(op.precoAdicional)}</span>}
              </button>
            ))}
            <button onClick={() => setEscolhendo(false)} className="mt-1 w-full text-center text-xs text-zinc-500 hover:text-zinc-300">
              Cancelar
            </button>
          </div>
        )}

        <div className="mt-auto pt-3">
          {quantidadeTotal === 0 && !escolhendo ? (
            <button
              onClick={clicarAdicionar}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600"
              aria-label="Adicionar"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          ) : pedeAcompanhamento && !escolhendo ? (
            <button
              onClick={clicarAdicionar}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-orange-400 hover:bg-zinc-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar outro acompanhamento
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function BarraCarrinho({
  totalItens, subtotal, taxaEntrega, aceitandoPedidos, onFinalizar,
}: {
  totalItens: number
  subtotal: number
  taxaEntrega: number | null
  aceitandoPedidos: boolean
  onFinalizar: () => void
}) {
  const total = subtotal + (taxaEntrega ?? 0)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur">
      <div className="mx-auto max-w-5xl p-4">
        {taxaEntrega != null && taxaEntrega > 0 && (
          <p className="mb-2 text-center text-xs text-zinc-500">
            + {formatarBRL(taxaEntrega)} taxa de entrega
          </p>
        )}
        <button
          onClick={onFinalizar}
          disabled={!aceitandoPedidos}
          className="flex w-full items-center justify-between rounded-xl bg-orange-500 px-5 py-4 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <span>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'}
            </span>
          </span>
          <span>Finalizar · {formatarBRL(total)}</span>
        </button>
      </div>
    </div>
  )
}

function ModalCheckout({
  slug, carrinho, cardapio, subtotal, totalItens, mpConectado, taxaEntrega, bairros, onFechar, onSucesso,
}: {
  slug: string
  carrinho: Record<string, CarrinhoEntry>
  cardapio: ItemPublico[]
  subtotal: number
  totalItens: number
  mpConectado: boolean
  taxaEntrega: number | null
  bairros: Bairro[]
  onFechar: () => void
  onSucesso: (pedido: PedidoConfirmado) => void
}) {
  const [clienteNome, setClienteNome] = useState('')
  const [clienteFone, setClienteFone] = useState('')
  const [endereco, setEndereco] = useState('')
  const [bairroId, setBairroId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('entrega')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('pix')
  const [precisaTroco, setPrecisaTroco] = useState(false)
  const [trocoPara, setTrocoPara] = useState('')
  const [etapaResumoAberta, setEtapaResumoAberta] = useState(false)

  const usaBairros = bairros.length > 0
  const bairroSelecionado = bairros.find((b) => b.id === bairroId)
  const taxa = tipoEntrega !== 'entrega'
    ? 0
    : usaBairros
      ? (bairroSelecionado?.taxaEntrega ?? 0)
      : (taxaEntrega ?? 0)
  const totalReais = subtotal + taxa

  async function enviarPedido() {
    setErro(null)
    setEnviando(true)

    try {
      const body = {
        clienteNome: clienteNome.trim(),
        clienteFone: clienteFone.trim() || undefined,
        enderecoEntrega: tipoEntrega === 'entrega' ? endereco.trim() || undefined : undefined,
        bairroId: tipoEntrega === 'entrega' && usaBairros ? bairroId : undefined,
        tipoEntrega,
        formaPagamento,
        precisaTroco: formaPagamento === 'dinheiro' ? precisaTroco : undefined,
        trocoPara: formaPagamento === 'dinheiro' && precisaTroco
          ? parseFloat(trocoPara.replace(',', '.'))
          : undefined,
        itens: Object.values(carrinho).map((entry) => ({
          itemCardapioId: entry.itemId,
          quantidade: entry.quantidade,
          ...(entry.acompanhamento ? { acompanhamento: entry.acompanhamento } : {}),
        })),
      }

      const r = await fetch(`${API_URL}/publico/${slug}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.erro ?? 'Erro ao enviar pedido')
      }

      const pedido: PedidoConfirmado = await r.json()
      onSucesso(pedido)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar pedido')
      setEtapaResumoAberta(false)
    } finally {
      setEnviando(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!etapaResumoAberta) {
      if (!clienteNome.trim()) return
      if (tipoEntrega === 'entrega' && !endereco.trim()) return
      if (tipoEntrega === 'entrega' && usaBairros && !bairroId) return
      if (formaPagamento === 'dinheiro' && precisaTroco && !trocoPara.trim()) return
      setEtapaResumoAberta(true)
      return
    }
    await enviarPedido()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
        onClick={onFechar}
      >
        <div
          className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-900 p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold">Finalizar pedido</h3>
            <button
              onClick={onFechar}
              disabled={enviando}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-5 rounded-xl bg-zinc-950 p-3 text-sm space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
              <span>{formatarBRL(subtotal)}</span>
            </div>
            {tipoEntrega === 'entrega' && taxa > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>Taxa de entrega{bairroSelecionado ? ` (${bairroSelecionado.nome})` : ''}</span>
                <span>{formatarBRL(taxa)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-800 pt-1 font-bold text-zinc-100">
              <span>Total</span>
              <span>{formatarBRL(totalReais)}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Seu nome</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="João Silva"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                />
              </div>
            </label>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">
                Telefone (WhatsApp) <span className="font-normal text-zinc-500">— opcional</span>
              </span>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="tel"
                  minLength={8}
                  maxLength={20}
                  value={clienteFone}
                  onChange={(e) => setClienteFone(e.target.value)}
                  placeholder="85 99999-9999"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                />
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                Se informar, você recebe atualizações do pedido pelo WhatsApp.
              </p>
            </label>

            <div className="flex gap-2 mb-4">
              {(['entrega', 'retirada'] as TipoEntrega[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoEntrega(tipo)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                    tipoEntrega === tipo
                      ? 'bg-orange-500 text-white'
                      : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {tipo === 'entrega' ? '🛵 Entrega' : '🏪 Retirada'}
                </button>
              ))}
            </div>

            {tipoEntrega === 'entrega' && usaBairros && (
              <label className="mb-4 block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Bairro</span>
                <select
                  required
                  value={bairroId}
                  onChange={(e) => setBairroId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-orange-500"
                >
                  <option value="" disabled>Selecione o bairro</option>
                  {bairros.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} — {b.taxaEntrega != null ? formatarBRL(b.taxaEntrega) : 'grátis'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {tipoEntrega === 'entrega' && (
              <label className="mb-4 block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">
                  Endereço de entrega
                </span>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <textarea
                    required
                    maxLength={500}
                    rows={2}
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua, número, bairro"
                    className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                  />
                </div>
              </label>
            )}

            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-zinc-300">Forma de pagamento</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { valor: 'pix',            label: 'PIX' },
                  { valor: 'dinheiro',       label: 'Dinheiro' },
                  { valor: 'cartao_credito', label: 'Crédito' },
                  { valor: 'cartao_debito',  label: 'Débito' },
                ] as { valor: FormaPagamento; label: string }[]).map(({ valor, label }) => (
                  <button
                    key={valor}
                    type="button"
                    disabled={valor === 'pix' && !mpConectado}
                    onClick={() => setFormaPagamento(valor)}
                    className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                      formaPagamento === valor
                        ? 'bg-orange-500 text-white'
                        : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    } ${valor === 'pix' && !mpConectado ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {label}
                    {valor === 'pix' && !mpConectado && (
                      <span className="block text-[10px] text-zinc-500">Indisponível</span>
                    )}
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
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
                    />
                  )}
                </div>
              )}
            </div>

            {erro && (
              <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={
                enviando || !clienteNome.trim() ||
                (tipoEntrega === 'entrega' && usaBairros && !bairroId) ||
                (formaPagamento === 'dinheiro' && precisaTroco && !trocoPara.trim())
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                `Revisar pedido · ${formatarBRL(totalReais)}`
              )}
            </button>
          </form>
        </div>
      </div>

      {etapaResumoAberta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 max-h-[90vh] overflow-y-auto">
            <p className="mb-1 text-lg font-bold text-center">Confirme seu pedido</p>
            <p className="mb-4 text-sm text-zinc-400 text-center">Revise antes de enviar pra cozinha</p>

            <div className="mb-4 space-y-1 rounded-xl bg-zinc-950 p-3 text-sm">
              {Object.entries(carrinho).map(([chave, entry]) => {
                const item = cardapio.find((i) => i.id === entry.itemId)
                if (!item) return null
                const opcao = item.opcoesAcompanhamento.find((o) => o.nome === entry.acompanhamento)
                const precoUnit = item.preco + (opcao?.precoAdicional ?? 0)
                return (
                  <div key={chave} className="flex justify-between text-zinc-300">
                    <span>
                      {entry.quantidade}x {item.nome}
                      {entry.acompanhamento && <span className="text-zinc-500"> ({entry.acompanhamento})</span>}
                    </span>
                    <span>{formatarBRL(precoUnit * entry.quantidade)}</span>
                  </div>
                )
              })}
              {taxa > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>Taxa de entrega{bairroSelecionado ? ` (${bairroSelecionado.nome})` : ''}</span>
                  <span>{formatarBRL(taxa)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-800 pt-1 font-bold text-zinc-100">
                <span>Total</span>
                <span>{formatarBRL(totalReais)}</span>
              </div>
            </div>

            <div className="mb-4 space-y-1 text-sm text-zinc-400">
              <p><span className="text-zinc-300">Cliente:</span> {clienteNome}</p>
              <p><span className="text-zinc-300">Entrega:</span> {tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏪 Retirada no local'}</p>
              {tipoEntrega === 'entrega' && (
                <p><span className="text-zinc-300">Endereço:</span> {endereco}</p>
              )}
              <p><span className="text-zinc-300">Pagamento:</span> {formaPagamentoLabel[formaPagamento]}</p>
              {formaPagamento === 'dinheiro' && precisaTroco && trocoPara && (
                <p><span className="text-zinc-300">Troco para:</span> {formatarBRL(parseFloat(trocoPara.replace(',', '.')) || 0)}</p>
              )}
            </div>

            {erro && (
              <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                {erro}
              </p>
            )}

            <button
              onClick={async () => { await enviarPedido() }}
              disabled={enviando}
              className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : 'Confirmar pedido'}
            </button>
            <button
              onClick={() => setEtapaResumoAberta(false)}
              disabled={enviando}
              className="mt-2 w-full rounded-xl py-2.5 text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
            >
              Voltar e editar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function TelaConfirmacao({
  pedido, slug, nomeEstabelecimento, onAvaliacaoFeita,
}: {
  pedido: PedidoConfirmado
  slug: string
  nomeEstabelecimento: string
  onAvaliacaoFeita: () => void
}) {
  const [nota, setNota] = useState(0)
  const [hover, setHover] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function avaliar() {
    if (!nota) return
    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch(`${API_URL}/publico/${slug}/pedidos/${pedido.id}/avaliar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avaliacao: nota, comentarioAvaliacao: comentario.trim() || undefined }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.erro ?? 'Erro ao avaliar')
      }
      onAvaliacaoFeita()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao avaliar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 font-sans text-zinc-100">
      <div className="w-full max-w-md text-center">
        <div className="mb-5 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold">Pedido enviado! 🎉</h1>
        <p className="mt-2 text-zinc-400">
          A cozinha do <span className="font-semibold text-zinc-200">{nomeEstabelecimento}</span> já foi avisada.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-400">Total do pedido</p>
          <p className="mt-1 text-3xl font-extrabold text-orange-400">{formatarBRL(pedido.total)}</p>
          <p className="mt-3 font-mono text-xs text-zinc-500">#{pedido.id.slice(0, 8)}</p>
        </div>

        {/* Avaliação */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="mb-3 font-semibold">Como foi sua experiência?</p>
          <div className="mb-4 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNota(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="transition"
                aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
              >
                <Star
                  className={`h-8 w-8 transition ${
                    n <= (hover || nota) ? 'fill-orange-400 text-orange-400' : 'text-zinc-600'
                  }`}
                />
              </button>
            ))}
          </div>

          {nota > 0 && (
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentário opcional..."
              maxLength={500}
              rows={2}
              className="mb-3 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
            />
          )}

          {erro && (
            <p className="mb-3 text-sm text-red-400">{erro}</p>
          )}

          <button
            onClick={avaliar}
            disabled={!nota || enviando}
            className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enviando ? 'Enviando...' : 'Enviar avaliação'}
          </button>
          <button
            onClick={onAvaliacaoFeita}
            className="mt-2 w-full rounded-xl py-2 text-sm text-zinc-500 hover:text-zinc-300"
          >
            Pular
          </button>
        </div>
      </div>
    </div>
  )
}

function TelaObrigado({
  nomeEstabelecimento, pedido,
}: {
  nomeEstabelecimento: string
  pedido: PedidoConfirmado
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 font-sans text-zinc-100">
      <div className="w-full max-w-md text-center">
        <div className="mb-5 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold">Obrigado! 🙏</h1>
        <p className="mt-2 text-zinc-400">
          A cozinha do <span className="font-semibold text-zinc-200">{nomeEstabelecimento}</span> já foi avisada.
        </p>
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-400">Total do pedido</p>
          <p className="mt-1 text-3xl font-extrabold text-orange-400">{formatarBRL(pedido.total)}</p>
          <p className="mt-3 font-mono text-xs text-zinc-500">#{pedido.id.slice(0, 8)}</p>
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          Você pode fechar esta tela. O restaurante vai entrar em contato pelo WhatsApp em instantes.
        </p>
      </div>
    </div>
  )
}
