import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_URL } from '../lib/api'

interface UseSocketReturn {
  socket: Socket | null
  conectado: boolean
  erro: string | null
}

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

    const novoSocket = io(API_URL, {
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

    return () => {
      novoSocket.disconnect()
    }
  }, [token])

  return { socket, conectado, erro }
}