import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { ChefHat, LogOut, LayoutDashboard, Building2, Sun, Moon } from 'lucide-react'
import { useTema } from '../hooks/useTema'

interface Props {
  children: ReactNode
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'bg-orange-500/15 text-orange-400'
      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
  }`

export default function LayoutAdmin({ children }: Props) {
  const navigate = useNavigate()
  const { tema, alternar: alternarTema } = useTema()

  function handleSair() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="min-h-dvh bg-zinc-950 font-sans text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        {/* Linha superior */}
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">

          {/* Logo + badge Super Admin */}
          <NavLink to="/admin" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 sm:h-10 sm:w-10">
              <ChefHat className="h-5 w-5 text-white sm:h-6 sm:w-6" />
            </div>
            <div className="hidden sm:block">
              <p className="text-base font-bold leading-tight text-zinc-100">Comanda IA</p>
              <p className="text-xs font-semibold text-orange-400">Super Admin</p>
            </div>
          </NavLink>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink to="/admin" end className={linkClass}>
              <LayoutDashboard className="h-4 w-4" />
              Visão Geral
            </NavLink>
            <NavLink to="/admin/estabelecimentos" className={linkClass}>
              <Building2 className="h-4 w-4" />
              Estabelecimentos
            </NavLink>
          </nav>

          <button
            onClick={alternarTema}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            aria-label={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          >
            {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Sair */}
          <button
            onClick={handleSair}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title="Sair"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Nav mobile */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2 sm:hidden">
          <NavLink to="/admin" end className={linkClass}>
            <LayoutDashboard className="h-4 w-4" />
            Visão Geral
          </NavLink>
          <NavLink to="/admin/estabelecimentos" className={linkClass}>
            <Building2 className="h-4 w-4" />
            Estabelecimentos
          </NavLink>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
