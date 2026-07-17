import { useEffect, useState } from 'react'

export type Tema = 'dark' | 'light'

function temaSalvo(): Tema {
  return localStorage.getItem('tema') === 'light' ? 'light' : 'dark'
}

// Aplica data-theme no <html> e persiste a escolha. Default escuro (visual atual).
export function useTema() {
  const [tema, setTema] = useState<Tema>(temaSalvo)

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    localStorage.setItem('tema', tema)
  }, [tema])

  function alternar() {
    setTema((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return { tema, alternar }
}
