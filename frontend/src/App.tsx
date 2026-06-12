import { Routes, Route, Navigate } from 'react-router'
import Login from './pages/Login'
import Cozinha from './pages/Cozinha'
import Dashboard from './pages/Dashboard'
import Cardapio from './pages/Cardapio'
import CardapioPublico from './pages/CardapioPublico'
import RotaProtegida from './components/RotaProtegida'

function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/c/:slug" element={<CardapioPublico />} />
      <Route path="/login" element={<Login />} />

      {/* Protegidas */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={<RotaProtegida><Dashboard /></RotaProtegida>}
      />
      <Route
        path="/cozinha"
        element={<RotaProtegida><Cozinha /></RotaProtegida>}
      />
      <Route
        path="/cardapio"
        element={<RotaProtegida><Cardapio /></RotaProtegida>}
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App