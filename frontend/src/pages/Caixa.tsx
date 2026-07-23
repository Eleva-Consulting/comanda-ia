import { useEffect, useState } from 'react'
import { Loader2, Lock, Wallet } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocket } from '../hooks/useSocket'
import type { ContaResumida, ItemResumo, ResumoConta } from '../components/caixa/tipos'
import ResumoTotais from '../components/caixa/ResumoTotais'
import ComandasLeitura from '../components/caixa/ComandasLeitura'
import ReceberPagamento from '../components/caixa/ReceberPagamento'
import PagamentosRegistrados from '../components/caixa/PagamentosRegistrados'
import FormDesconto from '../components/caixa/FormDesconto'

const labelStatusItem: Record<string, string> = {
  recebido:   'recebido',
  em_preparo: 'em preparo',
  pronto:     'pronto',
  entregue:   'entregue',
}

// Item ainda "recebido" (cozinha não começou) cancela livre — espelha
// podeCancelarLivremente do backend.
function podeCancelarLivre(status: string): boolean {
  return status === 'recebido'
}

// Tela de Caixa — grade de contas abertas + tela da conta com o fluxo guiado de
// recebimento. Nenhum pagamento é registrado fora do wizard (ReceberPagamento).
export default function Caixa() {
  const token = localStorage.getItem('token')
  const { socket } = useSocket(token)

  const [contas, setContas] = useState<ContaResumida[]>([])
  const [carregandoContas, setCarregandoContas] = useState(true)

  const [contaSelecionada, setContaSelecionada] = useState<ContaResumida | null>(null)
  const [resumo, setResumo] = useState<ResumoConta | null>(null)
  const [carregandoResumo, setCarregandoResumo] = useState(false)
  const [recebendo, setRecebendo] = useState(false)

  const [fechandoConta, setFechandoConta] = useState(false)
  const [erroFechar, setErroFechar] = useState<string | null>(null)

  const [itemCancelamento, setItemCancelamento] = useState<ItemResumo | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [senhaCancelamento, setSenhaCancelamento] = useState('')
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)

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
    setRecebendo(false)
    setErroFechar(null)
    carregarResumo(conta.id)
  }

  function fecharDetalhe() {
    setContaSelecionada(null)
    setResumo(null)
    setRecebendo(false)
    carregarContas()
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

  function abrirCancelamentoItem(item: ItemResumo) {
    setItemCancelamento(item)
    setMotivoCancelamento('')
    setSenhaCancelamento('')
    setErroCancelamento(null)
  }

  async function confirmarCancelamentoItem() {
    if (!itemCancelamento || !contaSelecionada) return
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
      await carregarResumo(contaSelecionada.id)
      setItemCancelamento(null)
    } catch {
      setErroCancelamento('Falha de conexão')
    } finally {
      setEnviandoCancelamento(false)
    }
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

  // ── Grade de contas ─────────────────────────────────────────────────────────
  if (!contaSelecionada) {
    return (
      <Layout>
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
      </Layout>
    )
  }

  // ── Wizard de recebimento (telas ② e ③) ─────────────────────────────────────
  if (recebendo && resumo) {
    return (
      <Layout>
        <ReceberPagamento
          contaId={contaSelecionada.id}
          resumo={resumo}
          token={token!}
          onAtualizado={setResumo}
          onVoltar={() => setRecebendo(false)}
        />
      </Layout>
    )
  }

  // ── Tela da conta (telas ① e ④) ─────────────────────────────────────────────
  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
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
            <ResumoTotais resumo={resumo} />
            <ComandasLeitura comandas={resumo.porComanda} onCancelarItem={abrirCancelamentoItem} />

            {resumo.saldoDevedor > 0 ? (
              <button
                onClick={() => setRecebendo(true)}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600"
              >
                Receber pagamento
              </button>
            ) : (
              <button
                onClick={fecharConta}
                disabled={!resumo.podeFechar || fechandoConta}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                <Lock className="h-4 w-4" /> Fechar conta e liberar a mesa
              </button>
            )}
            {erroFechar && <p className="text-sm text-red-400">{erroFechar}</p>}

            <PagamentosRegistrados
              pagamentos={resumo.pagamentos}
              token={token!}
              onAtualizado={setResumo}
            />

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <FormDesconto contaId={contaSelecionada.id} token={token!} onAtualizado={setResumo} />
              {resumo.saldoDevedor > 0 && (
                <button
                  onClick={fecharConta}
                  disabled
                  className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-500 disabled:opacity-60"
                  title="Saldo devedor pendente"
                >
                  <Lock className="h-4 w-4" /> Fechar conta
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {itemCancelamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setItemCancelamento(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Cancelar {itemCancelamento.nomeItem}?</h3>
            {!podeCancelarLivre(itemCancelamento.status) && (
              <p className="mb-3 text-xs text-zinc-400">
                Este item já está {labelStatusItem[itemCancelamento.status] ?? itemCancelamento.status} — cancelar exige motivo e senha de supervisor.
              </p>
            )}
            <div className="space-y-2">
              <input
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder={podeCancelarLivre(itemCancelamento.status) ? 'Motivo (opcional)' : 'Motivo (obrigatório)'}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
              />
              {!podeCancelarLivre(itemCancelamento.status) && (
                <input
                  type="password"
                  value={senhaCancelamento}
                  onChange={(e) => setSenhaCancelamento(e.target.value)}
                  placeholder="Senha de supervisor"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                />
              )}
            </div>
            {erroCancelamento && <p className="mt-2 text-sm text-red-400">{erroCancelamento}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmarCancelamentoItem}
                disabled={
                  enviandoCancelamento ||
                  (!podeCancelarLivre(itemCancelamento.status) && (!motivoCancelamento || !senhaCancelamento))
                }
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                Confirmar cancelamento
              </button>
              <button onClick={() => setItemCancelamento(null)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
