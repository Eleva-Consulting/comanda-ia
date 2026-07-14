import { Routes, Route, Navigate } from 'react-router'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import AguardandoAprovacao from './pages/AguardandoAprovacao'
import Cozinha from './pages/Cozinha'
import Mesas from './pages/Mesas'
import Producao from './pages/Producao'
import Caixa from './pages/Caixa'
import Dashboard from './pages/Dashboard'
import Cardapio from './pages/Cardapio'
import CardapioPublico from './pages/CardapioPublico'
import RotaProtegida from './components/RotaProtegida'
import RotaAdmin from './components/RotaAdmin'
import RotaDono from './components/RotaDono'
import RotaPermissao from './components/RotaPermissao'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminEstabelecimentos from './pages/admin/AdminEstabelecimentos'
import EsqueciSenha from './pages/EsqueciSenha'
import RedefinirSenha from './pages/RedefinirSenha'
import DefinirSenha from './pages/DefinirSenha'
import Operadores from './pages/Operadores'
import Auditoria from './pages/Auditoria'
import Financeiro from './pages/Financeiro'
import Insumos from './pages/Insumos'
import Estoque from './pages/Estoque'
import Historico from './pages/Historico'
import ImprimirComanda from './pages/ImprimirComanda'
import ImprimirRodada from './pages/ImprimirRodada'
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
      <Route path="/definir-senha"         element={<DefinirSenha />} />

      {/* Painel do estabelecimento (DONO / OPERADOR) */}
      <Route path="/"          element={<Landing />} />
      <Route path="/dashboard" element={<RotaDono><Dashboard /></RotaDono>} />
      <Route path="/cozinha"   element={<RotaPermissao permissao="cozinha"><Cozinha /></RotaPermissao>} />
      <Route path="/mesas"     element={<RotaPermissao permissao="mesas"><Mesas /></RotaPermissao>} />
      <Route path="/producao"  element={<RotaPermissao permissao="mesas"><Producao /></RotaPermissao>} />
      <Route path="/caixa"     element={<RotaPermissao permissao="caixa"><Caixa /></RotaPermissao>} />
      <Route path="/cardapio"  element={<RotaPermissao permissao="cardapio"><Cardapio /></RotaPermissao>} />
      <Route path="/operadores" element={<RotaDono><Operadores /></RotaDono>} />
      <Route path="/auditoria" element={<RotaDono><Auditoria /></RotaDono>} />
      <Route path="/financeiro" element={<RotaDono><Financeiro /></RotaDono>} />
      <Route path="/insumos" element={<RotaPermissao permissao="estoque"><Insumos /></RotaPermissao>} />
      <Route path="/estoque" element={<RotaPermissao permissao="estoque"><Estoque /></RotaPermissao>} />
      <Route path="/historico"      element={<RotaPermissao permissao="historico"><Historico /></RotaPermissao>} />
      <Route path="/configuracoes"  element={<RotaPermissao permissao="configuracoes"><Configuracoes /></RotaPermissao>} />
      <Route path="/imprimir/:pedidoId" element={<RotaProtegida><ImprimirComanda /></RotaProtegida>} />
      <Route path="/imprimir/rodada/:rodadaId" element={<RotaProtegida><ImprimirRodada /></RotaProtegida>} />

      {/* Painel da plataforma (SUPER_ADMIN) */}
      <Route path="/admin"                    element={<RotaAdmin><AdminDashboard /></RotaAdmin>} />
      <Route path="/admin/estabelecimentos"   element={<RotaAdmin><AdminEstabelecimentos /></RotaAdmin>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
