import { Routes, Route, Navigate } from 'react-router'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import AguardandoAprovacao from './pages/AguardandoAprovacao'
import Cozinha from './pages/Cozinha'
import Dashboard from './pages/Dashboard'
import Cardapio from './pages/Cardapio'
import CardapioPublico from './pages/CardapioPublico'
import RotaProtegida from './components/RotaProtegida'
import RotaAdmin from './components/RotaAdmin'
import RotaDono from './components/RotaDono'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminEstabelecimentos from './pages/admin/AdminEstabelecimentos'
import EsqueciSenha from './pages/EsqueciSenha'
import RedefinirSenha from './pages/RedefinirSenha'
import Operadores from './pages/Operadores'
import Historico from './pages/Historico'
import ImprimirComanda from './pages/ImprimirComanda'
import Configuracoes from './pages/Configuracoes'

function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/c/:slug"               element={<CardapioPublico />} />
      <Route path="/login"                 element={<Login />} />
      <Route path="/cadastro"              element={<Cadastro />} />
      <Route path="/aguardando-aprovacao"  element={<AguardandoAprovacao />} />
      <Route path="/esqueci-senha"         element={<EsqueciSenha />} />
      <Route path="/redefinir-senha"       element={<RedefinirSenha />} />

      {/* Painel do estabelecimento (DONO / OPERADOR) */}
      <Route path="/"          element={<Landing />} />
      <Route path="/dashboard" element={<RotaDono><Dashboard /></RotaDono>} />
      <Route path="/cozinha"   element={<RotaProtegida><Cozinha /></RotaProtegida>} />
      <Route path="/cardapio"  element={<RotaDono><Cardapio /></RotaDono>} />
      <Route path="/operadores" element={<RotaDono><Operadores /></RotaDono>} />
      <Route path="/historico"      element={<RotaDono><Historico /></RotaDono>} />
      <Route path="/configuracoes"  element={<RotaDono><Configuracoes /></RotaDono>} />
      <Route path="/imprimir/:pedidoId" element={<RotaProtegida><ImprimirComanda /></RotaProtegida>} />

      {/* Painel da plataforma (SUPER_ADMIN) */}
      <Route path="/admin"                    element={<RotaAdmin><AdminDashboard /></RotaAdmin>} />
      <Route path="/admin/estabelecimentos"   element={<RotaAdmin><AdminEstabelecimentos /></RotaAdmin>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
