import { useEffect, useState } from 'react'
import { Loader2, Wallet, Users, CheckCircle2, Percent, Undo2, Lock, QrCode } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocket } from '../hooks/useSocket'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface ContaResumida {
  id: string
  status: 'aberta' | 'aguardando_pagamento'
  mesa: { numero: string } | null
}

interface ItemResumo {
  id: string
  nomeItem: string
  precoUnit: number
  quantidade: number
  status: string
  total: number
  pago: boolean
}

interface ComandaResumo {
  comandaId: string
  nome: string
  itens: ItemResumo[]
  totalNaoPago: number
}

interface PagamentoResumo {
  id: string
  valor: number
  status: string
  formaPagamento: string
  criadoEm: string
  itensComandaIds: string[]
}

interface ResumoConta {
  contaId: string
  status: string
  totalConta: number
  descontoValor: number
  totalPago: number
  saldoDevedor: number
  podeFechar: boolean
  porComanda: ComandaResumo[]
  pagamentos: PagamentoResumo[]
}

const labelFormaPagamento: Record<string, string> = {
  pix: 'PIX',
  pix_maquininha: 'Pix (maquininha)',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

export default function Caixa() {
  const token = localStorage.getItem('token')
  const { socket } = useSocket(token)

  const [contas, setContas] = useState<ContaResumida[]>([])
  const [carregandoContas, setCarregandoContas] = useState(true)

  const [contaSelecionada, setContaSelecionada] = useState<ContaResumida | null>(null)
  const [resumo, setResumo] = useState<ResumoConta | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)

  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'pix_maquininha' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'>('pix')
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false)
  const [erroPagamento, setErroPagamento] = useState<string | null>(null)

  const [numeroPessoas, setNumeroPessoas] = useState(2)

  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set())
  const [valorLivre, setValorLivre] = useState('')

  const [descontoAberto, setDescontoAberto] = useState(false)
  const [valorDesconto, setValorDesconto] = useState('')
  const [motivoDesconto, setMotivoDesconto] = useState('')
  const [senhaDesconto, setSenhaDesconto] = useState('')
  const [enviandoDesconto, setEnviandoDesconto] = useState(false)
  const [erroDesconto, setErroDesconto] = useState<string | null>(null)

  const [estornandoId, setEstornandoId] = useState<string | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [senhaEstorno, setSenhaEstorno] = useState('')
  const [enviandoEstorno, setEnviandoEstorno] = useState(false)
  const [erroEstorno, setErroEstorno] = useState<string | null>(null)

  const [fechandoConta, setFechandoConta] = useState(false)
  const [erroFechar, setErroFechar] = useState<string | null>(null)

  const [valorQrCode, setValorQrCode] = useState('')
  const [qrCodeGerado, setQrCodeGerado] = useState<{ payload: string; qrCodeBase64: string } | null>(null)
  const [gerandoQrCode, setGerandoQrCode] = useState(false)
  const [erroQrCode, setErroQrCode] = useState<string | null>(null)
  const [copiadoQrCode, setCopiadoQrCode] = useState(false)

  async function carregarContas() {
    setCarregandoContas(true)
    try {
      const resp = await fetch(`${API_URL}/contas`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setContas(await resp.json())
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoContas(false)
    }
  }

  async function carregarResumo(contaId: string) {
    setCarregandoResumo(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaId}/resumo`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) setResumo(await resp.json())
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoResumo(false)
    }
  }

  function abrirConta(conta: ContaResumida) {
    setContaSelecionada(conta)
    carregarResumo(conta.id)
  }

  function alternarItemSelecionado(itemId: string) {
    setItensSelecionados((prev) => {
      const proximo = new Set(prev)
      proximo.has(itemId) ? proximo.delete(itemId) : proximo.add(itemId)
      return proximo
    })
  }

  async function registrarPagamento(opcoes: { itensComandaIds?: string[]; valor?: number }) {
    if (!contaSelecionada) return
    setErroPagamento(null)
    setRegistrandoPagamento(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/pagamentos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ formaPagamento, ...opcoes }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroPagamento(data.erro ?? 'Não foi possível registrar o pagamento'); return }
      setResumo(data)
      setItensSelecionados(new Set())
      setValorLivre('')
    } catch {
      setErroPagamento('Falha de conexão')
    } finally {
      setRegistrandoPagamento(false)
    }
  }

  function pagarComanda(comanda: ComandaResumo) {
    const itensNaoPagos = comanda.itens.filter((i) => i.status !== 'cancelado' && !i.pago).map((i) => i.id)
    if (itensNaoPagos.length > 0) registrarPagamento({ itensComandaIds: itensNaoPagos })
  }

  function pagarItensSelecionados() {
    if (itensSelecionados.size > 0) registrarPagamento({ itensComandaIds: Array.from(itensSelecionados) })
  }

  function pagarValorLivre() {
    const valor = Math.round(Number(valorLivre) * 100) / 100
    if (valor > 0) registrarPagamento({ valor })
  }

  function pagarParcelaIgual() {
    if (!resumo || numeroPessoas < 1) return
    const parcela = Math.round((resumo.saldoDevedor / numeroPessoas) * 100) / 100
    if (parcela > 0) registrarPagamento({ valor: parcela })
  }

  function abrirFormDesconto() {
    setDescontoAberto(true)
    setValorDesconto('')
    setMotivoDesconto('')
    setSenhaDesconto('')
    setErroDesconto(null)
  }

  async function aplicarDesconto() {
    if (!contaSelecionada) return
    const valor = Number(valorDesconto)
    if (!(valor > 0) || !motivoDesconto || !senhaDesconto) return
    setErroDesconto(null)
    setEnviandoDesconto(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/desconto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, motivo: motivoDesconto, senha: senhaDesconto }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroDesconto(data.erro ?? 'Não foi possível aplicar o desconto'); return }
      setResumo(data)
      setDescontoAberto(false)
    } catch {
      setErroDesconto('Falha de conexão')
    } finally {
      setEnviandoDesconto(false)
    }
  }

  function abrirFormEstorno(pagamentoId: string) {
    setEstornandoId(pagamentoId)
    setMotivoEstorno('')
    setSenhaEstorno('')
    setErroEstorno(null)
  }

  async function confirmarEstorno() {
    if (!estornandoId || !motivoEstorno || !senhaEstorno) return
    setErroEstorno(null)
    setEnviandoEstorno(true)
    try {
      const resp = await fetch(`${API_URL}/pagamentos/${estornandoId}/estornar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoEstorno, senha: senhaEstorno }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroEstorno(data.erro ?? 'Não foi possível estornar'); return }
      setResumo(data)
      setEstornandoId(null)
    } catch {
      setErroEstorno('Falha de conexão')
    } finally {
      setEnviandoEstorno(false)
    }
  }

  async function gerarQrCodePix() {
    if (!contaSelecionada) return
    const valor = Number(valorQrCode)
    if (!(valor > 0)) return
    setErroQrCode(null)
    setGerandoQrCode(true)
    setQrCodeGerado(null)
    setCopiadoQrCode(false)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/pix-qrcode?valor=${valor}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!resp.ok) { setErroQrCode(data.erro ?? 'Não foi possível gerar o QR code'); return }
      setQrCodeGerado(data)
    } catch {
      setErroQrCode('Falha de conexão')
    } finally {
      setGerandoQrCode(false)
    }
  }

  function copiarPayloadPix() {
    if (!qrCodeGerado) return
    navigator.clipboard.writeText(qrCodeGerado.payload)
    setCopiadoQrCode(true)
    setTimeout(() => setCopiadoQrCode(false), 2000)
  }

  async function fecharConta() {
    if (!contaSelecionada) return
    setErroFechar(null)
    setFechandoConta(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/fechar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!resp.ok) { setErroFechar(data.erro ?? 'Não foi possível fechar a conta'); return }
      fecharDetalhe()
    } catch {
      setErroFechar('Falha de conexão')
    } finally {
      setFechandoConta(false)
    }
  }

  function fecharDetalhe() {
    setContaSelecionada(null)
    setResumo(null)
    carregarContas()
  }

  useEffect(() => {
    carregarContas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!socket) return
    function aoAtualizarConta(conta: { id: string }) {
      if (contaSelecionada && conta.id === contaSelecionada.id) carregarResumo(conta.id)
    }
    socket.on('conta:atualizada', aoAtualizarConta)
    return () => {
      socket.off('conta:atualizada', aoAtualizarConta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, contaSelecionada?.id])

  return (
    <Layout>
      {!contaSelecionada ? (
        <div>
          <h2 className="mb-6 flex items-center gap-2 text-2xl font-extrabold">
            <Wallet className="h-6 w-6" /> Caixa
          </h2>
          {carregandoContas ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : contas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhuma conta aberta no momento.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {contas.map((conta) => (
                <button
                  key={conta.id}
                  onClick={() => abrirConta(conta)}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-orange-500/50"
                >
                  <span className="text-xl font-bold">{conta.mesa ? `Mesa ${conta.mesa.numero}` : 'Sem mesa'}</span>
                  <span className="text-xs text-zinc-400">{conta.status === 'aguardando_pagamento' ? 'Aguardando pagamento' : 'Aberta'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <button onClick={fecharDetalhe} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              ← Caixa
            </button>
            <h2 className="text-xl font-extrabold">
              {contaSelecionada.mesa ? `Mesa ${contaSelecionada.mesa.numero}` : 'Sem mesa'}
            </h2>
          </div>

          {carregandoResumo || !resumo ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex justify-between text-sm text-zinc-400"><span>Total da conta</span><span>R$ {resumo.totalConta.toFixed(2)}</span></div>
                {resumo.descontoValor > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400"><span>Desconto</span><span>- R$ {resumo.descontoValor.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-sm text-zinc-400"><span>Já pago</span><span>R$ {resumo.totalPago.toFixed(2)}</span></div>
                <div className="mt-2 flex justify-between border-t border-zinc-800 pt-2 text-base font-bold">
                  <span>Saldo devedor</span><span>R$ {resumo.saldoDevedor.toFixed(2)}</span>
                </div>
              </div>

              {resumo.porComanda.map((comanda) => (
                <div key={comanda.comandaId} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">{comanda.nome}</h3>
                  <div className="space-y-1">
                    {comanda.itens.map((item) => (
                      <div key={item.id} className={`flex justify-between text-sm ${item.status === 'cancelado' ? 'text-zinc-600 line-through' : item.pago ? 'text-zinc-500' : 'text-zinc-200'}`}>
                        <span>{item.quantidade}x {item.nomeItem} {item.pago && '· pago'}</span>
                        <span>R$ {item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {resumo.saldoDevedor > 0 && (
                <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="font-semibold">Registrar pagamento</h3>

                  <div className="flex flex-wrap gap-2">
                    {(['pix', 'pix_maquininha', 'dinheiro', 'cartao_credito', 'cartao_debito'] as const).map((forma) => (
                      <button
                        key={forma}
                        onClick={() => setFormaPagamento(forma)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${formaPagamento === forma ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                      >
                        {labelFormaPagamento[forma]}
                      </button>
                    ))}
                  </div>

                  {erroPagamento && <p className="text-sm text-red-400">{erroPagamento}</p>}

                  {/* QR code Pix — independente da forma de pagamento selecionada acima;
                      só gera o código pra mostrar ao cliente, quem confirma o pagamento
                      continua sendo o garçom/caixa manualmente, como sempre. */}
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <QrCode className="h-3.5 w-3.5" /> QR code Pix (sem maquininha)
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={valorQrCode}
                        onChange={(e) => setValorQrCode(e.target.value)}
                        placeholder={resumo.saldoDevedor.toFixed(2)}
                        className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={gerarQrCodePix}
                        disabled={gerandoQrCode || !valorQrCode}
                        className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
                      >
                        Gerar QR code
                      </button>
                    </div>
                    {erroQrCode && <p className="mt-2 text-sm text-red-400">{erroQrCode}</p>}
                    {qrCodeGerado && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <img src={qrCodeGerado.qrCodeBase64} alt="QR code Pix" className="h-48 w-48 rounded-lg bg-white p-2" />
                        <button
                          onClick={copiarPayloadPix}
                          className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600"
                        >
                          {copiadoQrCode ? <CheckCircle2 className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
                          {copiadoQrCode ? 'Copiado!' : 'Copiar código Pix'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dividir por comanda */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-400">Dividir por comanda</p>
                    <div className="flex flex-wrap gap-2">
                      {resumo.porComanda.filter((c) => c.totalNaoPago > 0).map((comanda) => (
                        <button
                          key={comanda.comandaId}
                          onClick={() => pagarComanda(comanda)}
                          disabled={registrandoPagamento}
                          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          {comanda.nome} · R$ {comanda.totalNaoPago.toFixed(2)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dividir igualmente */}
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400"><Users className="h-3.5 w-3.5" /> Dividir igualmente</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={numeroPessoas}
                        onChange={(e) => setNumeroPessoas(Math.max(1, Number(e.target.value)))}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <span className="text-sm text-zinc-400">pessoas · R$ {(resumo.saldoDevedor / numeroPessoas).toFixed(2)} cada</span>
                      <button
                        onClick={pagarParcelaIgual}
                        disabled={registrandoPagamento}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Registrar 1 parcela
                      </button>
                    </div>
                  </div>

                  {/* Itens específicos */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-400">Pagar itens específicos</p>
                    <div className="space-y-1">
                      {resumo.porComanda.flatMap((c) => c.itens).filter((i) => i.status !== 'cancelado' && !i.pago).map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm text-zinc-200">
                          <input
                            type="checkbox"
                            checked={itensSelecionados.has(item.id)}
                            onChange={() => alternarItemSelecionado(item.id)}
                          />
                          {item.quantidade}x {item.nomeItem} · R$ {item.total.toFixed(2)}
                        </label>
                      ))}
                    </div>
                    {itensSelecionados.size > 0 && (
                      <button
                        onClick={pagarItensSelecionados}
                        disabled={registrandoPagamento}
                        className="mt-2 flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Pagar {itensSelecionados.size} item(ns) selecionado(s)
                      </button>
                    )}
                  </div>

                  {/* Valor livre */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-400">Valor livre (pagamento parcial)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={valorLivre}
                        onChange={(e) => setValorLivre(e.target.value)}
                        placeholder="0,00"
                        className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={pagarValorLivre}
                        disabled={registrandoPagamento || !valorLivre}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Registrar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-2">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className="flex items-center justify-between text-sm">
                        <span className={pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}>
                          {labelFormaPagamento[pagamento.formaPagamento]} · R$ {pagamento.valor.toFixed(2)}
                        </span>
                        {pagamento.status === 'confirmado' && (
                          <button
                            onClick={() => abrirFormEstorno(pagamento.id)}
                            className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-red-400 hover:bg-red-500/10"
                            title="Estornar pagamento"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Estornar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {estornandoId && (
                    <div className="mt-3 space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                      <p className="text-xs text-zinc-400">Motivo e senha de supervisor para estornar</p>
                      <input
                        value={motivoEstorno}
                        onChange={(e) => setMotivoEstorno(e.target.value)}
                        placeholder="Motivo do estorno"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="password"
                        value={senhaEstorno}
                        onChange={(e) => setSenhaEstorno(e.target.value)}
                        placeholder="Senha de supervisor"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      {erroEstorno && <p className="text-sm text-red-400">{erroEstorno}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={confirmarEstorno}
                          disabled={enviandoEstorno || !motivoEstorno || !senhaEstorno}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          Confirmar estorno
                        </button>
                        <button onClick={() => setEstornandoId(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={abrirFormDesconto}
                    className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    <Percent className="h-4 w-4" /> Aplicar desconto
                  </button>
                  <button
                    onClick={fecharConta}
                    disabled={!resumo.podeFechar || fechandoConta}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                    title={resumo.podeFechar ? 'Fechar conta' : 'Saldo devedor pendente'}
                  >
                    <Lock className="h-4 w-4" /> Fechar conta
                  </button>
                </div>
                {erroFechar && <p className="mt-2 text-sm text-red-400">{erroFechar}</p>}

                {descontoAberto && (
                  <div className="mt-3 space-y-2 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={valorDesconto}
                      onChange={(e) => setValorDesconto(e.target.value)}
                      placeholder="Valor do desconto"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={motivoDesconto}
                      onChange={(e) => setMotivoDesconto(e.target.value)}
                      placeholder="Motivo do desconto"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="password"
                      value={senhaDesconto}
                      onChange={(e) => setSenhaDesconto(e.target.value)}
                      placeholder="Senha de supervisor"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                    />
                    {erroDesconto && <p className="text-sm text-red-400">{erroDesconto}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={aplicarDesconto}
                        disabled={enviandoDesconto || !valorDesconto || !motivoDesconto || !senhaDesconto}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        Confirmar desconto
                      </button>
                      <button onClick={() => setDescontoAberto(false)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
