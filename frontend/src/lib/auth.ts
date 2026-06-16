/**
 * Utilitários de autenticação compartilhados no frontend.
 * Decodifica o JWT do localStorage sem verificar assinatura
 * (verificação é feita no backend a cada requisição).
 */

interface JwtPayload {
  userId: string
  estabelecimentoId: string | null
  role: 'SUPER_ADMIN' | 'DONO' | 'OPERADOR'
  exp: number
}

export function getTokenPayload(): JwtPayload | null {
  const token = localStorage.getItem('token')
  if (!token) return null

  try {
    const base64 = token.split('.')[1]
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function getRole(): JwtPayload['role'] | null {
  return getTokenPayload()?.role ?? null
}

export function isSuperAdmin(): boolean {
  return getRole() === 'SUPER_ADMIN'
}
