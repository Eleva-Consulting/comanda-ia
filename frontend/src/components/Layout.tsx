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
    <div className="min-h-dvh bg-zinc-950 font-sans text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        {/* Linha superior: logo + ações */}
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">

          {/* Logo clicável — leva para Home */}
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 sm:h-10 sm:w-10">
              <ChefHat className="h-5 w-5 text-white sm:h-6 sm:w-6" />
            </div>
            <h1 className="hidden text-lg font-bold leading-tight text-zinc-100 sm:block">Comanda IA</h1>
          </NavLink>

          {/* Nav desktop — visível só em sm+ */}
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink to="/dashboard" className={linkClass}>Home</NavLink>
            <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
            <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink>
          </nav>

          {/* Ações direita */}
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

        {/* Nav mobile — barra inferior do header */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2 sm:hidden">
          <NavLink to="/dashboard" className={linkClass}>Home</NavLink>
          <NavLink to="/cozinha" className={linkClass}>Cozinha</NavLink>
          <NavLink to="/cardapio" className={linkClass}>Cardápio</NavLink>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
