import { useEffect, useState } from 'react'
import { Loader2, Lock, Wallet } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocket } from '../hooks/useSocket'
import type { ContaResumida, ResumoConta } from '../components/caixa/tipos'
import ResumoTotais from '../components/caixa/ResumoTotais'
import ComandasLeitura from '../components/caixa/ComandasLeitura'
import ReceberPagamento from '../components/caixa/ReceberPagamento'
import PagamentosRegistrados from '../components/caixa/PagamentosRegistrados'
import FormDesconto from '../components/caixa/FormDesconto'

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
            <ComandasLeitura comandas={resumo.porComanda} />

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
    </Layout>
  )
}
