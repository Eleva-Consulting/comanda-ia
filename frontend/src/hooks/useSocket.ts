import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseSocketReturn {
  socket: Socket | null
  conectado: boolean
  erro: string | null
}

/**
 * Hook que gerencia uma conexão Socket.IO autenticada.
 * - Conecta automaticamente quando recebe um token
 * - Desconecta quando o token é removido ou o componente desmonta
 * - Expõe o estado da conexão e o socket pra escutar eventos
 */
export function useSocket(token: string | null): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [conectado, setConectado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setSocket(null)
      setConectado(false)
      return
    }

    const novoSocket = io('http://localhost:3000', {
      auth: { token },
    })

    novoSocket.on('connect', () => {
      setConectado(true)
      setErro(null)
    })

    novoSocket.on('connect_error', (err) => {
      setConectado(false)
      setErro(err.message)
    })

    novoSocket.on('disconnect', () => {
      setConectado(false)
    })

    setSocket(novoSocket)

    // Cleanup quando o componente desmonta ou o token muda
    return () => {
      novoSocket.disconnect()
    }
  }, [token])

  return { socket, conectado, erro }
}