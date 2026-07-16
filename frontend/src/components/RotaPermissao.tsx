import { Navigate } from 'react-router'
import { temPermissao, primeiraRotaPermitida, type Permissao } from '../lib/permissoes'
import { getRole } from '../lib/auth'

interface Props {
  /** Uma permissão, ou uma lista — passa quem tiver QUALQUER uma delas (DONO passa sempre). */
  permissao: Permissao | Permissao[]
  children: React.ReactNode
}

export default function RotaPermissao({ permissao, children }: Props) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />

  const role = getRole()
  if (role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />

  const permissoes = Array.isArray(permissao) ? permissao : [permissao]
  if (!permissoes.some((p) => temPermissao(p))) return <Navigate to={primeiraRotaPermitida()} replace />

  return <>{children}</>
}
