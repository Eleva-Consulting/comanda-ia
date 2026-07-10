import { useState, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'
import { Copy, Check, Loader2, Settings, Smartphone, Wifi, WifiOff, RefreshCw, PhoneOff, MapPin, Plus, Pencil, Trash2, X } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Estabelecimento {
  id:               string
  nome:             string
  telefone:         string
  slug:             string
  status:           string
  aceitandoPedidos: boolean
  chavePix:         string | null
  cidade:           string | null
  taxaEntrega:      number | null
  senhaReabrirPedidoConfigurada: boolean
}

interface Bairro {
  id:          string
  nome:        string
  taxaEntrega: number | null
}

interface WhatsAppStatus {
  conectado: boolean
  estado: string | null
}

export default function Configuracoes() {
  const token = localStorage.getItem('token')

  const [dados, setDados]           = useState<Estabelecimento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando]     = useState(false)
  const [sucesso, setSucesso]       = useState(false)
  const [erro, setErro]             = useState<string | null>(null)
  const [copiado, setCopiado]       = useState(false)

  const [nome, setNome]               = useState('')
  const [telefone, setTelefone]       = useState('')
  const [chavePix, setChavePix]       = useState('')
  const [cidade, setCidade]           = useState('')
  const [taxaEntrega, setTaxaEntrega] = useState('')
  const [wpStatus, setWpStatus]     = useState<WhatsAppStatus | null>(null)
  const [qrCode, setQrCode]         = useState<string | null>(null)
  const [conectando, setConectando]       = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [erroWp, setErroWp]              = useState<string | null>(null)
  const [verificandoStatus, setVerificandoStatus] = useState(false)

  const [mpStatus, setMpStatus]           = useState<{ conectado: boolean } | null>(null)
  const [conectandoMp, setConectandoMp]   = useState(false)
  const [desconectandoMp, setDesconectandoMp] = useState(false)
  const [erroMp, setErroMp]               = useState<string | null>(null)
  const [avisoMp, setAvisoMp]             = useState<string | null>(null)

  const verificarStatusMp = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/mercadopago/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) setMpStatus(await r.json())
    } catch {
      // silencioso
    }
  }, [token])

  // Senha de reabertura de pedido
  const [senhaReabrirConfigurada, setSenhaReabrirConfigurada] = useState(false)
  const [novaSenhaReabrir, setNovaSenhaReabrir]                 = useState('')
  const [salvandoSenhaReabrir, setSalvandoSenhaReabrir]         = useState(false)
  const [erroSenhaReabrir, setErroSenhaReabrir]                 = useState<string | null>(null)
  const [sucessoSenhaReabrir, setSucessoSenhaReabrir]           = useState(false)

  // Bairros
  const [bairros, setBairros]                   = useState<Bairro[]>([])
  const [carregandoBairros, setCarregandoBairros] = useState(true)
  const [novoNomeBairro, setNovoNomeBairro]       = useState('')
  const [novaTaxaBairro, setNovaTaxaBairro]       = useState('')
  const [salvandoBairro, setSalvandoBairro]       = useState(false)
  const [erroBairro, setErroBairro]               = useState<string | null>(null)
  const [editandoBairroId, setEditandoBairroId]   = useState<string | null>(null)
  const [editNomeBairro, setEditNomeBairro]       = useState('')
  const [editTaxaBairro, setEditTaxaBairro]       = useState('')

  const verificarStatus = useCallback(async () => {
    setVerificandoStatus(true)
    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) setWpStatus(await r.json())
    } catch {
      // silencioso
    } finally {
      setVerificandoStatus(false)
    }
  }, [token])

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est: Estabelecimento) => {
        setDados(est)
        setNome(est.nome)
        setTelefone(est.telefone)
        setChavePix(est.chavePix ?? '')
        setCidade(est.cidade ?? '')
        setTaxaEntrega(est.taxaEntrega != null ? String(est.taxaEntrega) : '')
        setSenhaReabrirConfigurada(est.senhaReabrirPedidoConfigurada)
        verificarStatus()
        verificarStatusMp()
      })
      .catch(() => null)
      .finally(() => setCarregando(false))
  }, [token, verificarStatus, verificarStatusMp])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resultado = params.get('mercadopago')
    if (resultado === 'conectado') {
      setAvisoMp('Mercado Pago conectado com sucesso!')
      verificarStatusMp()
    } else if (resultado === 'erro') {
      setErroMp('Não foi possível conectar o Mercado Pago. Tente novamente.')
    }
    if (resultado) window.history.replaceState({}, '', window.location.pathname)
  }, [verificarStatusMp])

  useEffect(() => {
    fetch(`${API_URL}/bairros`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setBairros)
      .catch(() => null)
      .finally(() => setCarregandoBairros(false))
  }, [token])

  function parseTaxa(valor: string): number | null {
    return valor.trim() ? parseFloat(valor.replace(',', '.')) : null
  }

  async function criarBairro(e: FormEvent) {
    e.preventDefault()
    setErroBairro(null)
    if (!novoNomeBairro.trim()) return
    setSalvandoBairro(true)
    try {
      const resp = await fetch(`${API_URL}/bairros`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ nome: novoNomeBairro.trim(), taxaEntrega: parseTaxa(novaTaxaBairro) }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroBairro(dados.erro ?? 'Erro ao criar bairro'); return }
      setBairros((prev) => [...prev, dados].sort((a, b) => a.nome.localeCompare(b.nome)))
      setNovoNomeBairro('')
      setNovaTaxaBairro('')
    } catch {
      setErroBairro('Falha de conexão')
    } finally {
      setSalvandoBairro(false)
    }
  }

  function iniciarEdicaoBairro(bairro: Bairro) {
    setEditandoBairroId(bairro.id)
    setEditNomeBairro(bairro.nome)
    setEditTaxaBairro(bairro.taxaEntrega != null ? String(bairro.taxaEntrega) : '')
    setErroBairro(null)
  }

  async function salvarEdicaoBairro(id: string) {
    setErroBairro(null)
    setSalvandoBairro(true)
    try {
      const resp = await fetch(`${API_URL}/bairros/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ nome: editNomeBairro.trim(), taxaEntrega: parseTaxa(editTaxaBairro) }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroBairro(dados.erro ?? 'Erro ao salvar bairro'); return }
      setBairros((prev) => prev.map((b) => (b.id === id ? dados : b)).sort((a, b) => a.nome.localeCompare(b.nome)))
      setEditandoBairroId(null)
    } catch {
      setErroBairro('Falha de conexão')
    } finally {
      setSalvandoBairro(false)
    }
  }

  async function removerBairro(id: string) {
    if (!window.confirm('Remover este bairro?')) return
    try {
      const resp = await fetch(`${API_URL}/bairros/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) setBairros((prev) => prev.filter((b) => b.id !== id))
    } catch {
      setErroBairro('Falha ao remover bairro')
    }
  }

  // Polling do status enquanto QR code está visível (aguarda scan)
  useEffect(() => {
    if (!qrCode) return
    const interval = setInterval(async () => {
      const r = await fetch(`${API_URL}/meu-estabelecimento/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!r?.ok) return
      const status: WhatsAppStatus = await r.json()
      setWpStatus(status)
      if (status.conectado) {
        setQrCode(null) // esconde o QR code após conectar
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [qrCode, token])

  async function salvar(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    setSucesso(false)
    setSalvando(true)
    try {
      const taxaNum = taxaEntrega.trim() ? parseFloat(taxaEntrega.replace(',', '.')) : null
      if (taxaEntrega.trim() && (isNaN(taxaNum!) || taxaNum! < 0)) {
        setErro('Taxa de entrega inválida')
        return
      }

      const resp = await fetch(`${API_URL}/meu-estabelecimento`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          nome,
          telefone,
          chavePix:    chavePix.trim() || null,
          cidade:      cidade.trim() || null,
          taxaEntrega: taxaNum,
        }),
      })
      const atualizado = await resp.json()
      if (!resp.ok) { setErro(atualizado.erro ?? 'Erro ao salvar'); return }
      setDados(atualizado)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  async function conectarWhatsApp() {
    setErroWp(null)
    setQrCode(null)
    setConectando(true)

    // Salva as configs primeiro antes de conectar
    await salvar()

    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/whatsapp/conectar`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json()
      if (!r.ok) { setErroWp(data.erro ?? 'Erro ao conectar'); return }
      if (data.qrCode) {
        setQrCode(data.qrCode)
      } else {
        setErroWp('QR code não retornado. Tente novamente.')
      }
    } catch {
      setErroWp('Falha ao conectar')
    } finally {
      setConectando(false)
    }
  }

  async function desconectarWhatsApp() {
    if (!window.confirm('Desconectar o WhatsApp? O bot vai parar de funcionar até você reconectar.')) return
    setErroWp(null)
    setDesconectando(true)
    try {
      await fetch(`${API_URL}/meu-estabelecimento/whatsapp/desconectar`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setWpStatus({ conectado: false, estado: 'close' })
      setQrCode(null)
    } catch {
      setErroWp('Falha ao desconectar')
    } finally {
      setDesconectando(false)
    }
  }

  async function conectarMercadoPago() {
    setErroMp(null)
    setConectandoMp(true)
    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/mercadopago/conectar`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json()
      if (!r.ok) { setErroMp(data.erro ?? 'Erro ao gerar link de conexão'); setConectandoMp(false); return }
      window.location.href = data.url
    } catch {
      setErroMp('Falha ao conectar')
      setConectandoMp(false)
    }
  }

  async function desconectarMercadoPago() {
    if (!window.confirm('Desconectar o Mercado Pago? Pedidos por Pix ficam indisponíveis até reconectar.')) return
    setDesconectandoMp(true)
    try {
      await fetch(`${API_URL}/meu-estabelecimento/mercadopago/desconectar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setMpStatus({ conectado: false })
    } catch {
      setErroMp('Falha ao desconectar')
    } finally {
      setDesconectandoMp(false)
    }
  }

  async function salvarSenhaReabrir(e: FormEvent) {
    e.preventDefault()
    setErroSenhaReabrir(null)
    setSucessoSenhaReabrir(false)
    setSalvandoSenhaReabrir(true)
    try {
      const r = await fetch(`${API_URL}/meu-estabelecimento/senha-reabrir-pedido`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ senha: novaSenhaReabrir.trim() || null }),
      })
      const data = await r.json()
      if (!r.ok) { setErroSenhaReabrir(data.erro ?? 'Erro ao salvar'); return }
      setSenhaReabrirConfigurada(data.senhaReabrirPedidoConfigurada)
      setNovaSenhaReabrir('')
      setSucessoSenhaReabrir(true)
      setTimeout(() => setSucessoSenhaReabrir(false), 3000)
    } catch {
      setErroSenhaReabrir('Falha ao salvar')
    } finally {
      setSalvandoSenhaReabrir(false)
    }
  }

  function copiarLink() {
    if (!dados) return
    const url = `${window.location.origin}/c/${dados.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  if (carregando) {
    return (
      <Layout>
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-orange-400" />
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>

        {/* Link público */}
        {dados && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="mb-1 text-sm font-medium text-zinc-400">Link do cardápio</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-zinc-950 px-3 py-2.5 text-sm text-orange-400">
                {window.location.origin}/c/{dados.slug}
              </code>
              <button
                onClick={copiarLink}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
              >
                {copiado ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              Envie este link para seus clientes fazerem pedidos pelo celular.
            </p>
          </div>
        )}

        {/* Dados do estabelecimento */}
        <form onSubmit={salvar} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="font-semibold text-zinc-200">Dados do estabelecimento</h2>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Nome</span>
            <input
              type="text" required minLength={2} maxLength={100} value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Telefone</span>
            <input
              type="text" required minLength={8} maxLength={20} value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(85) 99999-9999"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Chave PIX</span>
            <input
              type="text" value={chavePix} onChange={(e) => setChavePix(e.target.value)}
              placeholder="CPF, CNPJ, email, telefone ou chave aleatória"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
            <p className="mt-1 text-xs text-zinc-600">Exibida para o cliente ao escolher PIX como pagamento</p>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Cidade</span>
            <input
              type="text" value={cidade} onChange={(e) => setCidade(e.target.value)}
              placeholder="Ex: Fortaleza"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
            <p className="mt-1 text-xs text-zinc-600">Usada no QR code Pix gerado na tela de Caixa (mesa).</p>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">Taxa de entrega (R$)</span>
            <input
              type="text" inputMode="decimal" value={taxaEntrega}
              onChange={(e) => setTaxaEntrega(e.target.value)}
              placeholder="Ex: 5,00 — deixe em branco para grátis"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
            <p className="mt-1 text-xs text-zinc-600">Adicionada ao total quando o cliente escolher entrega</p>
          </label>

          {erro && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erro}
            </p>
          )}
          {sucesso && (
            <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-green-500/30">
              Configurações salvas!
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit" disabled={salvando}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar alterações
            </button>
          </div>
        </form>

        {/* Bairros e taxa de entrega */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-zinc-200">
              <MapPin className="h-4 w-4 text-orange-400" />
              Bairros e taxa de entrega
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Cadastre os bairros que você atende com a taxa de cada um (deixe em branco para entrega grátis).
              Sem nenhum bairro cadastrado, vale a "Taxa de entrega" geral acima.
            </p>
          </div>

          {carregandoBairros ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
            </div>
          ) : (
            <div className="space-y-2">
              {bairros.map((bairro) => (
                <div key={bairro.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  {editandoBairroId === bairro.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editNomeBairro}
                        onChange={(e) => setEditNomeBairro(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-orange-500"
                      />
                      <input
                        value={editTaxaBairro}
                        onChange={(e) => setEditTaxaBairro(e.target.value)}
                        placeholder="Grátis"
                        inputMode="decimal"
                        className="w-24 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-orange-500"
                      />
                      <button type="button" onClick={() => salvarEdicaoBairro(bairro.id)} disabled={salvandoBairro}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                        {salvandoBairro ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                      </button>
                      <button type="button" onClick={() => setEditandoBairroId(null)}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{bairro.nome}</p>
                        <p className="text-xs text-orange-400">
                          {bairro.taxaEntrega != null ? `R$ ${bairro.taxaEntrega.toFixed(2)}` : 'Grátis'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => iniciarEdicaoBairro(bairro)}
                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removerBairro(bairro.id)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {bairros.length === 0 && (
                <p className="py-2 text-center text-sm text-zinc-500">Nenhum bairro cadastrado ainda.</p>
              )}
            </div>
          )}

          <form onSubmit={criarBairro} className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
            <input
              value={novoNomeBairro}
              onChange={(e) => setNovoNomeBairro(e.target.value)}
              placeholder="Nome do bairro"
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
            />
            <input
              value={novaTaxaBairro}
              onChange={(e) => setNovaTaxaBairro(e.target.value)}
              placeholder="Taxa (R$)"
              inputMode="decimal"
              className="w-28 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
            />
            <button type="submit" disabled={salvandoBairro || !novoNomeBairro.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </form>

          {erroBairro && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erroBairro}
            </p>
          )}
        </div>

        {/* WhatsApp / Evolution API */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-zinc-200 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-400" />
                WhatsApp
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Receba notificações de novos pedidos no WhatsApp.
              </p>
            </div>
            {wpStatus && (
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                wpStatus.conectado
                  ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                  : 'bg-zinc-700 text-zinc-400 ring-zinc-600'
              }`}>
                {wpStatus.conectado
                  ? <><Wifi className="h-3 w-3" /> Conectado</>
                  : <><WifiOff className="h-3 w-3" /> Desconectado</>
                }
              </span>
            )}
          </div>

          {erroWp && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erroWp}
            </p>
          )}

          {/* QR Code */}
          {qrCode && (
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-center">
              <p className="mb-3 font-semibold text-zinc-100">Escaneie o QR code com o WhatsApp</p>
              <p className="mb-4 text-xs text-zinc-500">
                Abra o WhatsApp → Dispositivos Vinculados → Vincular um dispositivo
              </p>
              <img
                src={qrCode}
                alt="QR Code WhatsApp"
                className="mx-auto h-56 w-56 rounded-xl"
              />
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando conexão...
              </p>
            </div>
          )}

          {wpStatus?.conectado && !qrCode && (
            <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 ring-1 ring-emerald-500/30">
              WhatsApp conectado! Você receberá uma mensagem a cada novo pedido.
            </div>
          )}

          <div className="flex gap-2">
            {wpStatus && !wpStatus.conectado && (
              <button
                type="button"
                onClick={() => verificarStatus()}
                disabled={verificandoStatus}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${verificandoStatus ? 'animate-spin' : ''}`} />
                Verificar
              </button>
            )}
            {wpStatus?.conectado && (
              <button
                type="button"
                onClick={desconectarWhatsApp}
                disabled={desconectando || conectando}
                className="flex items-center gap-1.5 rounded-xl border border-red-800 bg-red-950 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-900 disabled:opacity-50"
              >
                {desconectando
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <PhoneOff className="h-4 w-4" />
                }
                Desconectar
              </button>
            )}
            <button
              type="button"
              onClick={conectarWhatsApp}
              disabled={conectando || desconectando}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {conectando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Conectando...</>
                : wpStatus?.conectado
                  ? 'Reconectar / Trocar número'
                  : 'Conectar WhatsApp'
              }
            </button>
          </div>
        </div>

        {/* Mercado Pago */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-zinc-200">Mercado Pago</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Conecte sua conta para receber pagamentos Pix diretamente, com confirmação automática.
              </p>
            </div>
            {mpStatus && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                mpStatus.conectado
                  ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                  : 'bg-zinc-700 text-zinc-400 ring-zinc-600'
              }`}>
                {mpStatus.conectado ? 'Conectado' : 'Não conectado'}
              </span>
            )}
          </div>

          {avisoMp && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 ring-1 ring-emerald-500/30">
              {avisoMp}
            </p>
          )}
          {erroMp && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erroMp}
            </p>
          )}

          {mpStatus?.conectado ? (
            <button
              type="button"
              onClick={desconectarMercadoPago}
              disabled={desconectandoMp}
              className="flex items-center gap-1.5 rounded-xl border border-red-800 bg-red-950 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-900 disabled:opacity-50"
            >
              {desconectandoMp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={conectarMercadoPago}
              disabled={conectandoMp}
              className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {conectandoMp ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecionando...</> : 'Conectar Mercado Pago'}
            </button>
          )}
        </div>

        {/* Senha de reabertura de pedido */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-zinc-200">Reabrir pedido</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Define a senha que qualquer operador da Cozinha vai precisar digitar pra reabrir um
              pedido já entregue ou cancelado (ex: cliente pediu mais um item depois de concluído).
              Deixe em branco e salve pra desativar essa função.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              senhaReabrirConfigurada
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                : 'bg-zinc-700 text-zinc-400 ring-zinc-600'
            }`}>
              {senhaReabrirConfigurada ? 'Senha configurada' : 'Nenhuma senha definida'}
            </span>
          </div>

          {erroSenhaReabrir && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
              {erroSenhaReabrir}
            </p>
          )}
          {sucessoSenhaReabrir && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 ring-1 ring-emerald-500/30">
              Salvo com sucesso!
            </p>
          )}

          <form onSubmit={salvarSenhaReabrir} className="flex gap-2">
            <input
              type="password"
              value={novaSenhaReabrir}
              onChange={(e) => setNovaSenhaReabrir(e.target.value)}
              placeholder={senhaReabrirConfigurada ? 'Nova senha (deixe em branco pra desativar)' : 'Defina uma senha'}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={salvandoSenhaReabrir}
              className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {salvandoSenhaReabrir ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </button>
          </form>
        </div>

        {/* Info somente leitura */}
        {dados && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-200">Informações da conta</h2>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Slug (URL)</span>
              <span className="font-mono text-zinc-300">{dados.slug}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Status</span>
              <span className={`font-medium ${dados.status === 'ativo' ? 'text-green-400' : 'text-yellow-400'}`}>
                {dados.status}
              </span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
