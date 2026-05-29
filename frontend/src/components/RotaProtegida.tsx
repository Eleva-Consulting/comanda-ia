import { Navigate } from 'react-router'

interface Props {
  children: React.ReactNode
}

export default function RotaProtegida({ children }: Props) {
  const token = localStorage.getItem('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}