import { useState } from 'react'
import { CheckCircle2, ChevronRight, QrCode, Users } from 'lucide-react'
import { API_URL } from '../../lib/api'
import type { ComandaResumo, FormaPagamento, ItemResumo, ResumoConta } from './tipos'
import { FORMAS_PAGAMENTO, LABEL_FORMA_PAGAMENTO, formatarReais } from './tipos'

interface Props {
  contaId: string
  resumo: ResumoConta
  token: string
  onAtualizado: (resumo: ResumoConta) => void
  onVoltar: () => void
}

// O que está sendo pago. `itens: null` = pagamento por valor livre (sem vínculo por item).
interface Alvo {
  tipo: 'conta' | 'comanda' | 'itens' | 'parcela' | 'livre'
  rotulo: string
  itens: ItemResumo[] | null
  valor: number
  // só no tipo 'parcela':
  pessoas?: number
  parcelaAtual?: number
}

type Etapa = 'escolha' | 'itens' | 'pessoas' | 'livre' | 'revisao'

function arred2(valor: number): number {
  return Math.round(valor * 100) / 100
}

function itensNaoPagosDe(comanda: ComandaResumo): ItemResumo[] {
  return comanda.itens.filter((i) => i.status !== 'cancelado' && !i.pago)
}

// Wizard de recebimento (telas ② e ③ da spec): escolher o que está sendo pago,
// revisar, escolher a forma e confirmar. Nada é registrado antes do botão de confirmar.
export default function ReceberPagamento({ contaId, resumo, token, onAtualizado, onVoltar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('escolha')
  const [alvo, setAlvo] = useState<Alvo | null>(null)
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [registrando, setRegistrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set())
  const [pessoas, setPessoas] = useState(2)
  const [valorLivre, setValorLivre] = useState('')

  const [qrCode, setQrCode] = useState<{ payload: string; qrCodeBase64: string } | null>(null)
  const [gerandoQr, setGerandoQr] = useState(false)
  const [erroQr, setErroQr] = useState<string | null>(null)
  const [copiadoQr, setCopiadoQr] = useState(false)

  const todosItensNaoPagos = resumo.porComanda.flatMap(itensNaoPagosDe)

  function irParaRevisao(novoAlvo: Alvo) {
    setAlvo(novoAlvo)
    setErro(null)
    setQrCode(null)
    setErroQr(null)
    setCopiadoQr(false)
    setEtapa('revisao')
  }

  function escolherContaToda() {
    // Com desconto na conta, pagar por itens ignoraria o desconto e estouraria o saldo —
    // nesse caso registra por valor. Sem desconto, mantém o vínculo por item.
    const comDesconto = resumo.descontoValor > 0
    irParaRevisao({
      tipo: 'conta',
      rotulo: 'Conta toda',
      itens: comDesconto ? null : todosItensNaoPagos,
      valor: resumo.saldoDevedor,
    })
  }

  function escolherComanda(comanda: ComandaResumo) {
    irParaRevisao({
      tipo: 'comanda',
      rotulo: `Comanda ${comanda.nome}`,
      itens: itensNaoPagosDe(comanda),
      valor: comanda.totalNaoPago,
    })
  }

  function alternarItem(itemId: string) {
    setItensSelecionados((prev) => {
      const proximo = new Set(prev)
      if (proximo.has(itemId)) proximo.delete(itemId)
      else proximo.add(itemId)
      return proximo
    })
  }

  function continuarItensEspecificos() {
    const itens = todosItensNaoPagos.filter((i) => itensSelecionados.has(i.id))
    if (itens.length === 0) return
    irParaRevisao({
      tipo: 'itens',
      rotulo: `${itens.length} ${itens.length === 1 ? 'item selecionado' : 'itens selecionados'}`,
      itens,
      valor: arred2(itens.reduce((soma, i) => soma + i.total, 0)),
    })
  }

  function continuarParcelas() {
    if (pessoas < 1) return
    irParaRevisao({
      tipo: 'parcela',
      rotulo: `Parcela 1 de ${pessoas}`,
      itens: null,
      valor: arred2(resumo.saldoDevedor / pessoas),
      pessoas,
      parcelaAtual: 1,
    })
  }

  function continuarValorLivre() {
    const valor = arred2(Number(valorLivre))
    if (!(valor > 0)) return
    irParaRevisao({ tipo: 'livre', rotulo: 'Valor livre (pagamento parcial)', itens: null, valor })
  }

  async function confirmar() {
    if (!alvo) return
    setErro(null)
    setRegistrando(true)
    try {
      const body = alvo.itens
        ? { formaPagamento: forma, itensComandaIds: alvo.itens.map((i) => i.id) }
        : { formaPagamento: forma, valor: alvo.valor }
      const resp = await fetch(`${API_URL}/contas/${contaId}/pagamentos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) { setErro(data.erro ?? 'Não foi possível registrar o pagamento'); return }
      const novoResumo = data as ResumoConta
      onAtualizado(novoResumo)

      const ehParcelaComProxima =
        alvo.tipo === 'parcela' &&
        alvo.parcelaAtual !== undefined &&
        alvo.pessoas !== undefined &&
        alvo.parcelaAtual < alvo.pessoas &&
        novoResumo.saldoDevedor > 0

      if (ehParcelaComProxima) {
        // Recalcula sobre o saldo real — a última parcela fecha o saldo exato.
        const restantes = alvo.pessoas! - alvo.parcelaAtual!
        irParaRevisao({
          tipo: 'parcela',
          rotulo: `Parcela ${alvo.parcelaAtual! + 1} de ${alvo.pessoas}`,
          itens: null,
          valor: arred2(novoResumo.saldoDevedor / restantes),
          pessoas: alvo.pessoas,
          parcelaAtual: alvo.parcelaAtual! + 1,
        })
      } else {
        onVoltar()
      }
    } catch {
      setErro('Falha de conexão')
    } finally {
      setRegistrando(false)
    }
  }

  async function gerarQrCode() {
    if (!alvo) return
    setErroQr(null)
    setGerandoQr(true)
    setQrCode(null)
    setCopiadoQr(false)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaId}/pix-qrcode?valor=${alvo.valor}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!resp.ok) { setErroQr(data.erro ?? 'Não foi possível gerar o QR code'); return }
      setQrCode(data)
    } catch {
      setErroQr('Falha de conexão')
    } finally {
      setGerandoQr(false)
    }
  }

  function copiarPayloadPix() {
    if (!qrCode) return
    navigator.clipboard.writeText(qrCode.payload)
    setCopiadoQr(true)
    setTimeout(() => setCopiadoQr(false), 2000)
  }

  function Header({ titulo, aoVoltar }: { titulo: string; aoVoltar: () => void }) {
    return (
      <div className="mb-4 flex items-center justify-between">
        <button onClick={aoVoltar} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
          ← Voltar
        </button>
        <h3 className="font-extrabold">{titulo}</h3>
      </div>
    )
  }

  // ── Etapa: escolha do que está sendo pago ──────────────────────────────────
  if (etapa === 'escolha') {
    return (
      <div className="mx-auto max-w-md">
        <Header titulo="Receber pagamento" aoVoltar={onVoltar} />
        <div className="space-y-4">
          <button
            onClick={escolherContaToda}
            className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-orange-500/50"
          >
            <span className="font-semibold">Conta toda · {formatarReais(resumo.saldoDevedor)}</span>
            <ChevronRight className="h-5 w-5 text-orange-400" />
          </button>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-400">Pagamento por comanda</p>
            <div className="space-y-2">
              {resumo.porComanda.map((comanda) => (
                comanda.totalNaoPago > 0 ? (
                  <button
                    key={comanda.comandaId}
                    onClick={() => escolherComanda(comanda)}
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-orange-500/50"
                  >
                    <span>{comanda.nome} · {formatarReais(comanda.totalNaoPago)}</span>
                    <ChevronRight className="h-5 w-5 text-orange-400" />
                  </button>
                ) : (
                  <div
                    key={comanda.comandaId}
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 text-zinc-500"
                  >
                    <span>{comanda.nome}</span>
                    <span className="text-sm text-emerald-500/70">✓ já pago</span>
                  </div>
                )
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-400">Outros jeitos</p>
            <div className="space-y-2">
              <button
                onClick={() => { setItensSelecionados(new Set()); setEtapa('itens') }}
                className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-orange-500/50"
              >
                <span>Escolher itens específicos</span>
                <ChevronRight className="h-5 w-5 text-orange-400" />
              </button>
              <button
                onClick={() => setEtapa('pessoas')}
                className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-orange-500/50"
              >
                <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Dividir igualmente entre N pessoas</span>
                <ChevronRight className="h-5 w-5 text-orange-400" />
              </button>
              <button
                onClick={() => { setValorLivre(''); setEtapa('livre') }}
                className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-orange-500/50"
              >
                <span>Valor livre (pagamento parcial)</span>
                <ChevronRight className="h-5 w-5 text-orange-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Etapa: seleção de itens específicos ────────────────────────────────────
  if (etapa === 'itens') {
    const totalSelecionado = arred2(
      todosItensNaoPagos.filter((i) => itensSelecionados.has(i.id)).reduce((soma, i) => soma + i.total, 0)
    )
    return (
      <div className="mx-auto max-w-md">
        <Header titulo="Itens específicos" aoVoltar={() => setEtapa('escolha')} />
        <div className="space-y-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          {todosItensNaoPagos.map((item) => (
            <label key={item.id} className="flex items-center gap-2 py-1 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={itensSelecionados.has(item.id)}
                onChange={() => alternarItem(item.id)}
              />
              <span className="flex-1">{item.quantidade}x {item.nomeItem}</span>
              <span>{formatarReais(item.total)}</span>
            </label>
          ))}
        </div>
        <button
          onClick={continuarItensEspecificos}
          disabled={itensSelecionados.size === 0}
          className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Continuar {itensSelecionados.size > 0 && `· ${formatarReais(totalSelecionado)}`}
        </button>
      </div>
    )
  }

  // ── Etapa: dividir igualmente ──────────────────────────────────────────────
  if (etapa === 'pessoas') {
    const parcela = pessoas >= 1 ? arred2(resumo.saldoDevedor / pessoas) : 0
    return (
      <div className="mx-auto max-w-md">
        <Header titulo="Dividir igualmente" aoVoltar={() => setEtapa('escolha')} />
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            Quantas pessoas?
            <input
              type="number"
              min={1}
              value={pessoas}
              onChange={(e) => setPessoas(Math.max(1, Number(e.target.value)))}
              className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-sm text-zinc-400">{formatarReais(parcela)} por pessoa · cada parcela pode ter forma de pagamento própria</p>
        </div>
        <button
          onClick={continuarParcelas}
          disabled={!(parcela > 0)}
          className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Continuar · parcela 1 de {pessoas}
        </button>
      </div>
    )
  }

  // ── Etapa: valor livre ─────────────────────────────────────────────────────
  if (etapa === 'livre') {
    return (
      <div className="mx-auto max-w-md">
        <Header titulo="Valor livre" aoVoltar={() => setEtapa('escolha')} />
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            Valor a receber
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={valorLivre}
              onChange={(e) => setValorLivre(e.target.value)}
              placeholder="0,00"
              className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-xs text-zinc-500">Pagamento parcial, sem vínculo com itens — saldo devedor: {formatarReais(resumo.saldoDevedor)}</p>
        </div>
        <button
          onClick={continuarValorLivre}
          disabled={!(Number(valorLivre) > 0)}
          className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    )
  }

  // ── Etapa: revisão + forma + confirmação ───────────────────────────────────
  if (!alvo) return null
  return (
    <div className="mx-auto max-w-md">
      <Header titulo={alvo.rotulo} aoVoltar={() => setEtapa('escolha')} />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        {alvo.itens && (
          <div className="mb-2 space-y-1">
            {alvo.itens.map((item) => (
              <div key={item.id} className="flex justify-between text-sm text-zinc-300">
                <span>{item.quantidade}x {item.nomeItem}</span>
                <span>{formatarReais(item.total)}</span>
              </div>
            ))}
          </div>
        )}
        <div className={`flex justify-between text-base font-bold ${alvo.itens ? 'border-t border-zinc-800 pt-2' : ''}`}>
          <span>Total a receber</span>
          <span>{formatarReais(alvo.valor)}</span>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-zinc-400">Forma de pagamento</p>
        <div className="flex flex-wrap gap-2">
          {FORMAS_PAGAMENTO.map((f) => (
            <button
              key={f}
              onClick={() => setForma(f)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${forma === f ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}
            >
              {LABEL_FORMA_PAGAMENTO[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
        <button
          onClick={gerarQrCode}
          disabled={gerandoQr}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          <QrCode className="h-4 w-4" /> Mostrar QR code Pix de {formatarReais(alvo.valor)}
        </button>
        {erroQr && <p className="mt-2 text-sm text-red-400">{erroQr}</p>}
        {qrCode && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <img src={qrCode.qrCodeBase64} alt="QR code Pix" className="h-48 w-48 rounded-lg bg-white p-2" />
            <button
              onClick={copiarPayloadPix}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600"
            >
              {copiadoQr ? <CheckCircle2 className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
              {copiadoQr ? 'Copiado!' : 'Copiar código Pix'}
            </button>
          </div>
        )}
      </div>

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

      <button
        onClick={confirmar}
        disabled={registrando}
        className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        Confirmar {formatarReais(alvo.valor)} em {LABEL_FORMA_PAGAMENTO[forma]}
      </button>
      <p className="mt-2 text-center text-xs text-zinc-500">Nada é registrado antes deste botão.</p>
    </div>
  )
}
