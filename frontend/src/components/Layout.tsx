import type { ReactNode, ComponentType } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import {
  Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList, Wallet, ShieldCheck,
  Package, TrendingUp, Landmark, Home, Flame, BookOpen, History, Settings, ChevronDown,
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { usePush } from '../hooks/usePush'
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

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'bg-orange-500/15 text-orange-400'
      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
  }`

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

  // Itens de uso operacional/frequente — sempre visíveis na barra principal.
  const itensPrincipais: NavItem[] = [
    { to: '/dashboard', label: 'Home',     icon: Home,          show: isDono },
    { to: '/mesas',     label: 'Mesas',    icon: Table2,        show: mostrarMesas },
    { to: '/producao',  label: 'Produção', icon: ClipboardList, show: mostrarMesas },
    { to: '/caixa',     label: 'Caixa',    icon: Wallet,        show: mostrarCaixa },
    { to: '/cozinha',   label: 'Cozinha',  icon: Flame,         show: true },
    { to: '/cardapio',  label: 'Cardápio', icon: BookOpen,      show: podeCardapio },
  ].filter((item) => item.show)

  // Itens de gestão/back-office — usados com menos frequência, agrupados no menu "Mais".
  const itensSecundarios: NavItem[] = [
    { to: '/insumos',       label: 'Estoque',       icon: Package,     show: mostrarEstoque },
    { to: '/estoque',       label: 'Resultados',    icon: TrendingUp,  show: mostrarEstoque },
    { to: '/operadores',    label: 'Operadores',    icon: Users,       show: isDono },
    { to: '/auditoria',     label: 'Auditoria',     icon: ShieldCheck, show: isDono },
    { to: '/financeiro',    label: 'Financeiro',    icon: Landmark,    show: isDono },
    { to: '/historico',     label: 'Histórico',     icon: History,     show: podeHistorico },
    { to: '/configuracoes', label: 'Configurações', icon: Settings,    show: podeConfiguracoes },
  ].filter((item) => item.show)

  const location = useLocation()
  const [menuMaisAberto, setMenuMaisAberto] = useState(false)
  const menuMaisRef = useRef<HTMLDivElement>(null)
  const maisAtivo = itensSecundarios.some((item) => location.pathname === item.to)

  useEffect(() => {
    if (!menuMaisAberto) return
    function aoClicarFora(e: MouseEvent) {
      if (menuMaisRef.current && !menuMaisRef.current.contains(e.target as Node)) setMenuMaisAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [menuMaisAberto])

  return (
    <div className="min-h-dvh bg-zinc-950 font-sans text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        {/* Linha superior: logo + ações */}
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">

          <NavLink to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 sm:h-10 sm:w-10">
              <ChefHat className="h-5 w-5 text-white sm:h-6 sm:w-6" />
            </div>
            <h1 className="hidden text-lg font-bold leading-tight text-zinc-100 sm:block">Comanda IA</h1>
          </NavLink>

          {/* Nav desktop */}
          <nav className="hidden min-w-0 items-center gap-1 sm:flex">
            {itensPrincipais.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </span>
              </NavLink>
            ))}

            {itensSecundarios.length > 0 && (
              <div className="relative" ref={menuMaisRef}>
                <button
                  onClick={() => setMenuMaisAberto((v) => !v)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    maisAtivo ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  Mais
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuMaisAberto ? 'rotate-180' : ''}`} />
                </button>
                {menuMaisAberto && (
                  <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-lg">
                    {itensSecundarios.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMenuMaisAberto(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                            isActive ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                          }`
                        }
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {headerExtra}
            {pushSuportado && (
              <button
                onClick={pushAtivo ? desativarPush : ativarPush}
                className={`rounded-lg p-2 transition hover:bg-zinc-800 ${pushAtivo ? 'text-orange-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                title={pushAtivo ? 'Desativar notificações push' : 'Ativar notificações push'}
              >
                {pushAtivo ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={handleSair}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Nav mobile — rolagem horizontal, sem menu "Mais" (não há problema de espaço num row scrollável) */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2 sm:hidden">
          {[...itensPrincipais, ...itensSecundarios].map((item) => (
            <NavLink key={item.to} to={item.to} className={(state) => `shrink-0 ${linkClass(state)}`}>
              <span className="flex items-center gap-1.5">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
            </NavLink>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

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
