import type { ReactNode, ComponentType } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import {
  Bell, BellOff, ChefHat, LogOut, Users, X, Table2, Wallet, ShieldCheck,
  Package, TrendingUp, Landmark, Home, Flame, BookOpen, History, Settings,
  Sun, Moon, ChevronLeft,
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { usePush } from '../hooks/usePush'
import { useTema } from '../hooks/useTema'
import { useSidebarColapsada } from '../hooks/useSidebarColapsada'
import { getRole } from '../lib/auth'
import { temPermissao } from '../lib/permissoes'
import { API_URL } from '../lib/api'

interface NavItem {
  to:    string
  label: string
  icon:  ComponentType<{ className?: string }>
  show:  boolean
}

interface Toast {
  id:          number
  clienteNome: string
  total:       number
}

interface Props {
  children:     ReactNode
  headerExtra?: ReactNode
}

const linkColorClass = (isActive: boolean) =>
  isActive
    ? 'bg-orange-500/15 text-orange-400'
    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'

// Nav mobile: alvo de toque real (garçom/operador no celular) — mínimo ~44px de altura.
const linkClassMobile = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-3 text-sm font-medium transition ${linkColorClass(isActive)}`

export default function Layout({ children, headerExtra }: Props) {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const role = getRole()
  const { socket } = useSocket(token)
  const [toasts, setToasts] = useState<Toast[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)

  function tocarBeep() {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } catch {
      // AudioContext indisponível no ambiente
    }
  }

  useEffect(() => {
    if (!socket) return

    const handler = (pedido: { clienteNome: string; total: number | string }) => {
      const id = Date.now()
      tocarBeep()
      setToasts((prev) => [
        ...prev,
        { id, clienteNome: pedido.clienteNome, total: Number(pedido.total) },
      ])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
    }

    socket.on('pedido:novo', handler)
    return () => { socket.off('pedido:novo', handler) }
  }, [socket])

  function removerToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  function handleSair() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const isDono = role === 'DONO'
  const podeCardapio      = isDono || temPermissao('cardapio')
  const podeHistorico     = isDono || temPermissao('historico')
  const podeConfiguracoes = isDono || temPermissao('configuracoes')
  const podeMesas = isDono || temPermissao('mesas')
  const podeCozinha = isDono || temPermissao('cozinha') || temPermissao('producao')
  const [modulosAtivos, setModulosAtivos] = useState<string[]>([])

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(console.error)
  }, [token])

  const mostrarMesas = podeMesas && modulosAtivos.includes('mesas')
  const podeCaixa = isDono || temPermissao('caixa')
  const mostrarCaixa = podeCaixa && modulosAtivos.includes('mesas')
  const podeEstoque = isDono || temPermissao('estoque')
  const mostrarEstoque = podeEstoque && modulosAtivos.includes('estoque_avancado')
  const { ativo: pushAtivo, suportado: pushSuportado, ativar: ativarPush, desativar: desativarPush } = usePush(token)
  const { tema, alternar: alternarTema } = useTema()
  const { colapsada, alternar: alternarSidebar } = useSidebarColapsada()

  // Itens de uso operacional/frequente.
  const itensPrincipais: NavItem[] = [
    { to: '/dashboard', label: 'Home',     icon: Home,          show: isDono },
    { to: '/mesas',     label: 'Mesas',    icon: Table2,        show: mostrarMesas },
    { to: '/caixa',     label: 'Caixa',    icon: Wallet,        show: mostrarCaixa },
    { to: '/cozinha',   label: 'Cozinha',  icon: Flame,         show: podeCozinha },
    { to: '/cardapio',  label: 'Cardápio', icon: BookOpen,      show: podeCardapio },
  ].filter((item) => item.show)

  // Itens de gestão/back-office.
  const itensSecundarios: NavItem[] = [
    { to: '/insumos',       label: 'Estoque',       icon: Package,     show: mostrarEstoque },
    { to: '/estoque',       label: 'Resultados',    icon: TrendingUp,  show: mostrarEstoque },
    { to: '/operadores',    label: 'Operadores',    icon: Users,       show: isDono },
    { to: '/auditoria',     label: 'Auditoria',     icon: ShieldCheck, show: isDono },
    { to: '/financeiro',    label: 'Financeiro',    icon: Landmark,    show: isDono },
    { to: '/historico',     label: 'Histórico',     icon: History,     show: podeHistorico },
    { to: '/configuracoes', label: 'Configurações', icon: Settings,    show: podeConfiguracoes },
  ].filter((item) => item.show)

  const gruposSidebar = [
    { titulo: 'Operacional', itens: itensPrincipais },
    { titulo: 'Gestão',      itens: itensSecundarios },
  ].filter((grupo) => grupo.itens.length > 0)

  const linkClassSidebar = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${linkColorClass(isActive)} ${colapsada ? 'justify-center' : ''}`

  // Ícones de ação (tema/push/sair) — reaproveitados no header mobile e na topbar desktop.
  const acoesIcones = (
    <div className="flex items-center gap-2">
      <button
        onClick={alternarTema}
        className="rounded-lg p-3 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      >
        {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      {pushSuportado && (
        <button
          onClick={pushAtivo ? desativarPush : ativarPush}
          className={`rounded-lg p-3 transition hover:bg-zinc-800 ${pushAtivo ? 'text-orange-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          title={pushAtivo ? 'Desativar notificações push' : 'Ativar notificações push'}
          aria-label={pushAtivo ? 'Desativar notificações push' : 'Ativar notificações push'}
        >
          {pushAtivo ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </button>
      )}
      <button
        onClick={handleSair}
        className="rounded-lg p-3 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        title="Sair"
        aria-label="Sair"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh bg-zinc-950 font-sans text-zinc-100 sm:flex sm:h-dvh sm:overflow-hidden">
      {/* Header mobile — inalterado, oculto a partir do desktop */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sm:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500">
              <ChefHat className="h-5 w-5 text-white" />
            </div>
          </NavLink>
          <div className="flex items-center gap-2">
            {headerExtra}
            {acoesIcones}
          </div>
        </div>

        {/* Nav mobile — rolagem horizontal */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2">
          {[...itensPrincipais, ...itensSecundarios].map((item) => (
            <NavLink key={item.to} to={item.to} className={(state) => `shrink-0 ${linkClassMobile(state)}`}>
              <span className="flex items-center gap-1.5">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
            </NavLink>
          ))}
        </div>
      </header>

      {/* Sidebar desktop — oculta abaixo de sm: */}
      <aside
        className={`relative hidden shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-200 sm:flex ${
          colapsada ? 'w-16' : 'w-60'
        }`}
      >
        <NavLink
          to="/dashboard"
          className={`flex items-center gap-2 border-b border-zinc-800 px-4 py-4 ${colapsada ? 'justify-center' : ''}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500">
            <ChefHat className="h-5 w-5 text-white" />
          </div>
          {!colapsada && <h1 className="truncate text-base font-bold leading-tight text-zinc-100">Comanda IA</h1>}
        </NavLink>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {gruposSidebar.map((grupo) => (
            <div key={grupo.titulo}>
              {colapsada ? (
                <div className="mx-2 mb-2 border-t border-zinc-800" />
              ) : (
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {grupo.titulo}
                </p>
              )}
              <div className="space-y-0.5">
                {grupo.itens.map((item) => (
                  <NavLink key={item.to} to={item.to} className={linkClassSidebar} title={item.label}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!colapsada && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={alternarSidebar}
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 transition hover:bg-zinc-700"
          title={colapsada ? 'Expandir menu' : 'Colapsar menu'}
          aria-label={colapsada ? 'Expandir menu' : 'Colapsar menu'}
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${colapsada ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Coluna principal desktop: topbar fina + conteúdo rolável */}
      <div className="sm:flex sm:min-w-0 sm:flex-1 sm:flex-col sm:overflow-hidden">
        <div className="hidden h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 backdrop-blur sm:flex">
          <div>{headerExtra}</div>
          {acoesIcones}
        </div>

        <main className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>

      {/* Toasts de novo pedido */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start gap-3 rounded-2xl border border-orange-500/30 bg-zinc-900 p-4 shadow-lg ring-1 ring-orange-500/20"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                <ChefHat className="h-5 w-5 text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-100">Novo pedido!</p>
                <p className="text-xs text-zinc-400">
                  {toast.clienteNome} · R$ {toast.total.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => removerToast(toast.id)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
