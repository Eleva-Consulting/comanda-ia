import { Navigate } from 'react-router'
import { isSuperAdmin } from '../lib/auth'

interface Props {
  children: React.ReactNode
}

/**
 * Guard de rota exclusivo para SUPER_ADMIN.
 * - Sem token → redireciona para /login
 * - Token de DONO/OPERADOR → redireciona para /dashboard (acesso negado silencioso)
 * - Token de SUPER_ADMIN → renderiza normalmente
 */
export default function RotaAdmin({ children }: Props) {
  const token = localStorage.getItem('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (!isSuperAdmin()) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
