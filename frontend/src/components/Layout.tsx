import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { ChefHat, LogOut } from 'lucide-react'

interface Props {
  children: ReactNode
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

  function handleSair() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
                <ChefHat className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-lg font-bold leading-tight">Comanda IA</h1>
            </div>
            <nav className="flex items-center gap-1">
              <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
              <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
              {/* TODO Passo B: <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink> */}
            </nav>
          </div>
          <div className="flex items-center gap-3">
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
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}