import { Routes, Route, Navigate } from 'react-router'
import Login from './pages/Login'
import Cozinha from './pages/Cozinha'
import RotaProtegida from './components/RotaProtegida'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/cozinha" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/cozinha"
        element={
          <RotaProtegida>
            <Cozinha />
          </RotaProtegida>
        }
      />
      {/* Qualquer URL desconhecida vai pra cozinha (que redireciona pro login se não autenticado) */}
      <Route path="*" element={<Navigate to="/cozinha" replace />} />
    </Routes>
  )
}

export default App