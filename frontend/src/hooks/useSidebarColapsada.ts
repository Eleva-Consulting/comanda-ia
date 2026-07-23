import { useEffect, useState } from 'react'

function colapsadaSalva(): boolean {
  return localStorage.getItem('sidebarColapsada') === 'true'
}

// Colapsa a sidebar pra uma faixa só de ícones e persiste a escolha. Default expandida.
export function useSidebarColapsada() {
  const [colapsada, setColapsada] = useState<boolean>(colapsadaSalva)

  useEffect(() => {
    localStorage.setItem('sidebarColapsada', String(colapsada))
  }, [colapsada])

  function alternar() {
    setColapsada((v) => !v)
  }

  return { colapsada, alternar }
}
