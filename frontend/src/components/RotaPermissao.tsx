import { Navigate } from 'react-router'
import { temPermissao, type Permissao } from '../lib/permissoes'
import { getRole } from '../lib/auth'

interface Props {
  permissao: Permissao
  children: React.ReactNode
}

export default function RotaPermissao({ permissao, children }: Props) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />

  const role = getRole()
  if (role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />

  if (!temPermissao(permissao)) return <Navigate to="/cozinha" replace />

  return <>{children}</>
}
