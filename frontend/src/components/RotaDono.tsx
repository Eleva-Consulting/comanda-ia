import { Navigate } from 'react-router'
import { getRole } from '../lib/auth'

interface Props {
  children: React.ReactNode
}

export default function RotaDono({ children }: Props) {
  const token = localStorage.getItem('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const role = getRole()

  if (role === 'OPERADOR') {
    return <Navigate to="/cozinha" replace />
  }

  if (role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
