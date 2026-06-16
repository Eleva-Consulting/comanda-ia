import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { ChefHat, LogOut, Users, X } from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { getRole } from '../lib/auth'

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

function tocarBeep() {
  try {
    const ctx = new AudioContext()
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

export default function Layout({ children, headerExtra }: Props) {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const role = getRole()
  const { socket } = useSocket(token)
  const [toasts, setToasts] = useState<Toast[]>([])

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
          <nav className="hidden items-center gap-1 sm:flex">
            {isDono && <NavLink to="/dashboard" className={linkClass}>Home</NavLink>}
            <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
            {isDono && <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink>}
            {isDono && (
              <NavLink to="/operadores" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Operadores
                </span>
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              onClick={handleSair}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Nav mobile */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2 sm:hidden">
          {isDono && <NavLink to="/dashboard" className={linkClass}>Home</NavLink>}
          <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
          {isDono && <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink>}
          {isDono && (
            <NavLink to="/operadores" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Operadores
              </span>
            </NavLink>
          )}
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
