import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { ChefHat, Plus, Minus, ShoppingBag, X, Loader2, CheckCircle2, Phone, User, MapPin } from 'lucide-react'
import { API_URL } from '../lib/api'

interface ItemPublico {
  id: string
  nome: string
  descricao: string | null
  preco: number
}

interface CardapioData {
  estabelecimento: { nome: string; slug: string }
  cardapio: ItemPublico[]
}

interface PedidoConfirmado {
  id: string
  total: number
  mensagem: string
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CardapioPublico() {
  const { slug } = useParams<{ slug: string }>()
  const [dados, setDados] = useState<CardapioData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(false)

  const [carrinho, setCarrinho] = useState<Record<string, number>>({})
  const [checkoutAberto, setCheckoutAberto] = useState(false)
  const [pedidoConfirmado, setPedidoConfirmado] = useState<PedidoConfirmado | null>(null)

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
  }, [slug])

  function adicionar(id: string) {
    setCarrinho((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }))
  }

  function remover(id: string) {
    setCarrinho((p) => {
      const novo = { ...p }
      const valor = (novo[id] ?? 0) - 1
      if (valor <= 0) delete novo[id]
      else novo[id] = valor
      return novo
    })
  }

  const totalItens = Object.values(carrinho).reduce((s, q) => s + q, 0)
  const totalReais = dados
    ? Object.entries(carrinho).reduce((soma, [id, qtd]) => {
        const item = dados.cardapio.find((i) => i.id === id)
        return soma + (item ? item.preco * qtd : 0)
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

  if (pedidoConfirmado) {
    return <TelaConfirmacao pedido={pedidoConfirmado} nomeEstabelecimento={dados.estabelecimento.nome} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 pb-32">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500">
            <ChefHat className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold leading-tight">{dados.estabelecimento.nome}</h1>
            <p className="text-xs text-zinc-400">Faça seu pedido</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {dados.cardapio.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-400">O restaurante ainda não cadastrou itens no cardápio.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dados.cardapio.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                quantidade={carrinho[item.id] ?? 0}
                onAdicionar={() => adicionar(item.id)}
                onRemover={() => remover(item.id)}
              />
            ))}
          </div>
        )}
      </main>

      {totalItens > 0 && (
        <BarraCarrinho
          totalItens={totalItens}
          totalReais={totalReais}
          onFinalizar={() => setCheckoutAberto(true)}
        />
      )}

      {checkoutAberto && (
        <ModalCheckout
          slug={slug!}
          carrinho={carrinho}
          totalReais={totalReais}
          totalItens={totalItens}
          onFechar={() => setCheckoutAberto(false)}
          onSucesso={(pedido) => {
            setPedidoConfirmado(pedido)
            setCheckoutAberto(false)
            setCarrinho({})
          }}
        />
      )}
    </div>
  )
}

function ItemCard({
  item,
  quantidade,
  onAdicionar,
  onRemover,
}: {
  item: ItemPublico
  quantidade: number
  onAdicionar: () => void
  onRemover: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-bold">{item.nome}</h3>
        {item.descricao && (
          <p className="mt-1 text-sm text-zinc-400 line-clamp-2">{item.descricao}</p>
        )}
        <p className="mt-2 font-extrabold text-orange-400">{formatarBRL(item.preco)}</p>
      </div>

      {quantidade === 0 ? (
        <button
          onClick={onAdicionar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-600"
          aria-label="Adicionar"
        >
          <Plus className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-zinc-800 px-1 py-1">
          <button
            onClick={onRemover}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-orange-400 transition hover:bg-zinc-700"
            aria-label="Remover um"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-6 text-center font-bold">{quantidade}</span>
          <button
            onClick={onAdicionar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-orange-400 transition hover:bg-zinc-700"
            aria-label="Adicionar mais um"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function BarraCarrinho({
  totalItens,
  totalReais,
  onFinalizar,
}: {
  totalItens: number
  totalReais: number
  onFinalizar: () => void
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur">
      <div className="mx-auto max-w-2xl p-4">
        <button
          onClick={onFinalizar}
          className="flex w-full items-center justify-between rounded-xl bg-orange-500 px-5 py-4 font-bold text-white transition hover:bg-orange-600"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <span>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'}
            </span>
          </span>
          <span>Finalizar · {formatarBRL(totalReais)}</span>
        </button>
      </div>
    </div>
  )
}

function ModalCheckout({
  slug,
  carrinho,
  totalReais,
  totalItens,
  onFechar,
  onSucesso,
}: {
  slug: string
  carrinho: Record<string, number>
  totalReais: number
  totalItens: number
  onFechar: () => void
  onSucesso: (pedido: PedidoConfirmado) => void
}) {
  const [clienteNome, setClienteNome] = useState('')
  const [clienteFone, setClienteFone] = useState('')
  const [endereco, setEndereco] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    try {
      const body = {
        clienteNome: clienteNome.trim(),
        clienteFone: clienteFone.trim(),
        enderecoEntrega: endereco.trim() || undefined,
        itens: Object.entries(carrinho).map(([itemCardapioId, quantidade]) => ({
          itemCardapioId,
          quantidade,
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
    } finally {
      setEnviando(false)
    }
  }

  return (
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

        <div className="mb-5 rounded-xl bg-zinc-950 p-3 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
            <span className="font-bold text-zinc-100">{formatarBRL(totalReais)}</span>
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
            <span className="mb-2 block text-sm font-medium text-zinc-300">Telefone (WhatsApp)</span>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="tel"
                required
                minLength={8}
                maxLength={20}
                value={clienteFone}
                onChange={(e) => setClienteFone(e.target.value)}
                placeholder="85 99999-9999"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
              />
            </div>
          </label>

          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">
              Endereço de entrega <span className="text-zinc-500">(opcional)</span>
            </span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <textarea
                maxLength={500}
                rows={2}
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua exemplo, 123, Bairro"
                className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
              />
            </div>
          </label>

          {erro && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || !clienteNome.trim() || !clienteFone.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              `Enviar pedido · ${formatarBRL(totalReais)}`
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

function TelaConfirmacao({
  pedido,
  nomeEstabelecimento,
}: {
  pedido: PedidoConfirmado
  nomeEstabelecimento: string
}) {
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

        <p className="mt-6 text-sm text-zinc-500">
          Você pode fechar esta tela. O restaurante vai entrar em contato pelo WhatsApp em instantes.
        </p>
      </div>
    </div>
  )
}