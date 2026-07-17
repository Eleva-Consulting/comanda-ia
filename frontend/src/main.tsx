import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// Aplica o tema salvo antes da primeira renderização (evita flash do tema errado).
document.documentElement.dataset.theme = localStorage.getItem('tema') === 'light' ? 'light' : 'dark'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)