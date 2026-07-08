import { useEffect, useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
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

              {resumo.pagamentos.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="mb-2 font-semibold">Pagamentos registrados</h3>
                  <div className="space-y-1">
                    {resumo.pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className={`flex justify-between text-sm ${pagamento.status === 'estornado' ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                        <span>{labelFormaPagamento[pagamento.formaPagamento]}</span>
                        <span>R$ {pagamento.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
