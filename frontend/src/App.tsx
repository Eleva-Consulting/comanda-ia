import { Routes, Route, Navigate } from 'react-router'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import AguardandoAprovacao from './pages/AguardandoAprovacao'
import Cozinha from './pages/Cozinha'
import Dashboard from './pages/Dashboard'
import Cardapio from './pages/Cardapio'
import CardapioPublico from './pages/CardapioPublico'
import RotaProtegida from './components/RotaProtegida'
import RotaAdmin from './components/RotaAdmin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminEstabelecimentos from './pages/admin/AdminEstabelecimentos'

function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/c/:slug"               element={<CardapioPublico />} />
      <Route path="/login"                 element={<Login />} />
      <Route path="/cadastro"              element={<Cadastro />} />
      <Route path="/aguardando-aprovacao"  element={<AguardandoAprovacao />} />

      {/* Painel do estabelecimento (DONO / OPERADOR) */}
      <Route path="/"          element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<RotaProtegida><Dashboard /></RotaProtegida>} />
      <Route path="/cozinha"   element={<RotaProtegida><Cozinha /></RotaProtegida>} />
      <Route path="/cardapio"  element={<RotaProtegida><Cardapio /></RotaProtegida>} />

      {/* Painel da plataforma (SUPER_ADMIN) */}
      <Route path="/admin"                    element={<RotaAdmin><AdminDashboard /></RotaAdmin>} />
      <Route path="/admin/estabelecimentos"   element={<RotaAdmin><AdminEstabelecimentos /></RotaAdmin>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
