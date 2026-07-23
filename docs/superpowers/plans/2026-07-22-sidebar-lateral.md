# Sidebar lateral colapsável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o header horizontal do painel do restaurante (`Layout.tsx`) por uma sidebar
lateral colapsável (ícones + labels, colapsa pra só ícones) no desktop, mantendo a nav mobile
100% inalterada.

**Architecture:** App-shell de duas colunas no breakpoint `sm:` e acima (sidebar de altura cheia
+ coluna com topbar fina e conteúdo rolável), construído com um novo hook de estado
(`useSidebarColapsada`, mesmo padrão do `useTema` existente) e uma reescrita contida do
`Layout.tsx`. Abaixo de `sm:`, o `<header>` mobile atual é preservado byte-a-byte, só
condicionado a `sm:hidden`.

**Tech Stack:** React 19 + TypeScript + Tailwind v4 (classes utilitárias, sem CSS novo) +
lucide-react (ícone novo: `ChevronLeft`).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-22-sidebar-lateral-design.md`.
- Escopo: só `frontend/src/components/Layout.tsx` (painel restaurante). `LayoutAdmin.tsx` não muda.
- Nav mobile (< `sm:`) não pode ter NENHUMA mudança visual ou funcional.
- Não existe framework de teste automatizado no frontend deste projeto (confirmado:
  `frontend/package.json` não tem vitest/testing-library, nenhum arquivo `*.test.*` existe hoje).
  A verificação de cada task aqui é **type-check (`tsc -b`) + inspeção visual/manual no
  navegador**, seguindo o padrão já usado em todas as features de frontend anteriores deste
  projeto (ver "Log de mudanças" do `CLAUDE.md` — sempre "Verificado ao vivo no navegador").
- TypeScript strict, sem `any` implícito, sem `@ts-ignore` (padrão do projeto).
- Reaproveitar a paleta de cores já existente (`zinc-*` + `orange-500`) — o remapeamento
  claro/escuro em `index.css` já cobre qualquer classe `zinc-*` nova automaticamente, sem
  precisar de ajuste por tema.

---

### Task 1: Hook `useSidebarColapsada`

**Files:**
- Create: `frontend/src/hooks/useSidebarColapsada.ts`

**Interfaces:**
- Consumes: nada (hook isolado, só usa `localStorage` do browser).
- Produces: `useSidebarColapsada(): { colapsada: boolean; alternar: () => void }` — consumido
  pela Task 2 dentro de `Layout.tsx`.

- [ ] **Step 1: Instalar dependências do frontend (necessário pra rodar `tsc` nesta e nas
  próximas tasks)**

Run: `cd frontend && npm install`
Expected: instala sem erro (gera `frontend/node_modules`).

- [ ] **Step 2: Criar o hook, seguindo o mesmo padrão de `frontend/src/hooks/useTema.ts`**

```typescript
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
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: sem erros novos relacionados ao arquivo criado (o projeto pode já ter o build limpo
antes desta task — confirme que continua limpo depois).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useSidebarColapsada.ts
git commit -m "feat: hook useSidebarColapsada pro estado da sidebar lateral"
```

---

### Task 2: Reescrever `Layout.tsx` com sidebar + topbar (desktop) e mobile inalterado

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (arquivo inteiro — ver conteúdo abaixo)

**Interfaces:**
- Consumes: `useSidebarColapsada()` da Task 1 — `{ colapsada, alternar }`.
- Produces: nada consumido por outra task (é o componente final desta iniciativa). O componente
  `Layout` continua com a mesma assinatura pública (`{ children, headerExtra }`), então nenhuma
  página que já usa `<Layout headerExtra={...}>` (ex: `Cozinha.tsx`) precisa mudar.

- [ ] **Step 1: Substituir o conteúdo inteiro de `frontend/src/components/Layout.tsx`**

```tsx
import type { ReactNode, ComponentType } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import {
  Bell, BellOff, ChefHat, LogOut, Users, X, Table2, Wallet, ShieldCheck,
  Package, TrendingUp, Landmark, Home, Flame, BookOpen, History, Settings,
  Sun, Moon, ChevronLeft,
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { usePush } from '../hooks/usePush'
import { useTema } from '../hooks/useTema'
import { useSidebarColapsada } from '../hooks/useSidebarColapsada'
import { getRole } from '../lib/auth'
import { temPermissao } from '../lib/permissoes'
import { API_URL } from '../lib/api'

interface NavItem {
  to:    string
  label: string
  icon:  ComponentType<{ className?: string }>
  show:  boolean
}

interface Toast {
  id:          number
  clienteNome: string
  total:       number
}

interface Props {
  children:     ReactNode
  headerExtra?: ReactNode
}

const linkColorClass = (isActive: boolean) =>
  isActive
    ? 'bg-orange-500/15 text-orange-400'
    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'

// Nav mobile: alvo de toque real (garçom/operador no celular) — mínimo ~44px de altura.
const linkClassMobile = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-3 text-sm font-medium transition ${linkColorClass(isActive)}`

export default function Layout({ children, headerExtra }: Props) {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const role = getRole()
  const { socket } = useSocket(token)
  const [toasts, setToasts] = useState<Toast[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)

  function tocarBeep() {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } catch {
      // AudioContext indisponível no ambiente
    }
  }

  useEffect(() => {
    if (!socket) return

    const handler = (pedido: { clienteNome: string; total: number | string }) => {
      const id = Date.now()
      tocarBeep()
      setToasts((prev) => [
        ...prev,
        { id, clienteNome: pedido.clienteNome, total: Number(pedido.total) },
      ])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
    }

    socket.on('pedido:novo', handler)
    return () => { socket.off('pedido:novo', handler) }
  }, [socket])

  function removerToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  function handleSair() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const isDono = role === 'DONO'
  const podeCardapio      = isDono || temPermissao('cardapio')
  const podeHistorico     = isDono || temPermissao('historico')
  const podeConfiguracoes = isDono || temPermissao('configuracoes')
  const podeMesas = isDono || temPermissao('mesas')
  const podeCozinha = isDono || temPermissao('cozinha') || temPermissao('producao')
  const [modulosAtivos, setModulosAtivos] = useState<string[]>([])

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(console.error)
  }, [token])

  const mostrarMesas = podeMesas && modulosAtivos.includes('mesas')
  const podeCaixa = isDono || temPermissao('caixa')
  const mostrarCaixa = podeCaixa && modulosAtivos.includes('mesas')
  const podeEstoque = isDono || temPermissao('estoque')
  const mostrarEstoque = podeEstoque && modulosAtivos.includes('estoque_avancado')
  const { ativo: pushAtivo, suportado: pushSuportado, ativar: ativarPush, desativar: desativarPush } = usePush(token)
  const { tema, alternar: alternarTema } = useTema()
  const { colapsada, alternar: alternarSidebar } = useSidebarColapsada()

  // Itens de uso operacional/frequente.
  const itensPrincipais: NavItem[] = [
    { to: '/dashboard', label: 'Home',     icon: Home,          show: isDono },
    { to: '/mesas',     label: 'Mesas',    icon: Table2,        show: mostrarMesas },
    { to: '/caixa',     label: 'Caixa',    icon: Wallet,        show: mostrarCaixa },
    { to: '/cozinha',   label: 'Cozinha',  icon: Flame,         show: podeCozinha },
    { to: '/cardapio',  label: 'Cardápio', icon: BookOpen,      show: podeCardapio },
  ].filter((item) => item.show)

  // Itens de gestão/back-office.
  const itensSecundarios: NavItem[] = [
    { to: '/insumos',       label: 'Estoque',       icon: Package,     show: mostrarEstoque },
    { to: '/estoque',       label: 'Resultados',    icon: TrendingUp,  show: mostrarEstoque },
    { to: '/operadores',    label: 'Operadores',    icon: Users,       show: isDono },
    { to: '/auditoria',     label: 'Auditoria',     icon: ShieldCheck, show: isDono },
    { to: '/financeiro',    label: 'Financeiro',    icon: Landmark,    show: isDono },
    { to: '/historico',     label: 'Histórico',     icon: History,     show: podeHistorico },
    { to: '/configuracoes', label: 'Configurações', icon: Settings,    show: podeConfiguracoes },
  ].filter((item) => item.show)

  const gruposSidebar = [
    { titulo: 'Operacional', itens: itensPrincipais },
    { titulo: 'Gestão',      itens: itensSecundarios },
  ].filter((grupo) => grupo.itens.length > 0)

  const linkClassSidebar = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${linkColorClass(isActive)} ${colapsada ? 'justify-center' : ''}`

  // Ícones de ação (tema/push/sair) — reaproveitados no header mobile e na topbar desktop.
  const acoesIcones = (
    <div className="flex items-center gap-2">
      <button
        onClick={alternarTema}
        className="rounded-lg p-3 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      >
        {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      {pushSuportado && (
        <button
          onClick={pushAtivo ? desativarPush : ativarPush}
          className={`rounded-lg p-3 transition hover:bg-zinc-800 ${pushAtivo ? 'text-orange-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          title={pushAtivo ? 'Desativar notificações push' : 'Ativar notificações push'}
          aria-label={pushAtivo ? 'Desativar notificações push' : 'Ativar notificações push'}
        >
          {pushAtivo ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </button>
      )}
      <button
        onClick={handleSair}
        className="rounded-lg p-3 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        title="Sair"
        aria-label="Sair"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh bg-zinc-950 font-sans text-zinc-100 sm:flex sm:h-dvh sm:overflow-hidden">
      {/* Header mobile — inalterado, oculto a partir do desktop */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sm:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500">
              <ChefHat className="h-5 w-5 text-white" />
            </div>
          </NavLink>
          <div className="flex items-center gap-2">
            {headerExtra}
            {acoesIcones}
          </div>
        </div>

        {/* Nav mobile — rolagem horizontal */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800/60 px-4 py-2">
          {[...itensPrincipais, ...itensSecundarios].map((item) => (
            <NavLink key={item.to} to={item.to} className={(state) => `shrink-0 ${linkClassMobile(state)}`}>
              <span className="flex items-center gap-1.5">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
            </NavLink>
          ))}
        </div>
      </header>

      {/* Sidebar desktop — oculta abaixo de sm: */}
      <aside
        className={`relative hidden shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-200 sm:flex ${
          colapsada ? 'w-16' : 'w-60'
        }`}
      >
        <NavLink
          to="/dashboard"
          className={`flex items-center gap-2 border-b border-zinc-800 px-4 py-4 ${colapsada ? 'justify-center' : ''}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500">
            <ChefHat className="h-5 w-5 text-white" />
          </div>
          {!colapsada && <h1 className="truncate text-base font-bold leading-tight text-zinc-100">Comanda IA</h1>}
        </NavLink>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {gruposSidebar.map((grupo) => (
            <div key={grupo.titulo}>
              {colapsada ? (
                <div className="mx-2 mb-2 border-t border-zinc-800" />
              ) : (
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {grupo.titulo}
                </p>
              )}
              <div className="space-y-0.5">
                {grupo.itens.map((item) => (
                  <NavLink key={item.to} to={item.to} className={linkClassSidebar} title={item.label}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!colapsada && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={alternarSidebar}
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 transition hover:bg-zinc-700"
          title={colapsada ? 'Expandir menu' : 'Colapsar menu'}
          aria-label={colapsada ? 'Expandir menu' : 'Colapsar menu'}
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${colapsada ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Coluna principal desktop: topbar fina + conteúdo rolável */}
      <div className="sm:flex sm:min-w-0 sm:flex-1 sm:flex-col sm:overflow-hidden">
        <div className="hidden h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 backdrop-blur sm:flex">
          <div>{headerExtra}</div>
          {acoesIcones}
        </div>

        <main className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>

      {/* Toasts de novo pedido */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start gap-3 rounded-2xl border border-orange-500/30 bg-zinc-900 p-4 shadow-lg ring-1 ring-orange-500/20"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                <ChefHat className="h-5 w-5 text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-100">Novo pedido!</p>
                <p className="text-xs text-zinc-400">
                  {toast.clienteNome} · R$ {toast.total.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => removerToast(toast.id)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: sem erros (nenhum import não usado — `ChevronDown` e o antigo dropdown "Mais" saíram
junto da lógica removida; `ChevronLeft` é o único ícone novo).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: sidebar lateral colapsável no painel do restaurante"
```

---

### Task 3: Verificação manual no navegador

**Files:** nenhum arquivo novo — só execução e checklist manual.

**Interfaces:**
- Consumes: app rodando localmente (`npm run dev` no backend e no frontend), login com uma das
  credenciais de teste do `CLAUDE.md`.

- [ ] **Step 1: Subir o app localmente**

Run (dois terminais):
```bash
npm run dev              # backend, na raiz do projeto
cd frontend && npm run dev  # frontend
```
Expected: backend em `http://localhost:3000`, frontend em `http://localhost:5173` (ou porta que
o Vite indicar).

- [ ] **Step 2: Checklist de verificação no navegador (desktop, viewport >= 640px)**

Login com `vinicius@teste.com` / `senhaforte123` (Galeteria, sem módulo mesas — cobre o caso
"sem Mesas/Caixa/Estoque") e depois, se possível, com um estabelecimento que tenha os módulos
`mesas`/`estoque_avancado` ativos (ou ativar temporariamente via Super Admin) pra ver a sidebar
com todos os itens.

Confirmar, um por um:
- [ ] Sidebar aparece à esquerda, com logo no topo e os itens agrupados em "Operacional"/"Gestão"
      (só "Gestão" aparece se houver algum item secundário visível pro papel/módulos ativos).
- [ ] Clicar no botão de colapsar (chevron na borda da sidebar) encolhe pra só ícones; os labels
      somem e passar o mouse sobre um ícone mostra o tooltip nativo (`title`) com o nome.
- [ ] Clicar de novo expande de volta, com transição suave.
- [ ] Recarregar a página (F5) mantém o estado (colapsada ou expandida) que estava antes —
      confirma a persistência em `localStorage`.
- [ ] Cada item de nav navega pra rota certa e fica destacado em laranja quando ativo.
- [ ] Logar como um OPERADOR com permissões restritas (ex: só `cozinha`) e confirmar que só os
      itens permitidos aparecem na sidebar — mesma lógica de permissão de antes, sem regressão.
- [ ] Ir em `/cozinha` e confirmar que o botão "Novo pedido" (`headerExtra`) aparece na topbar
      fina, ao lado esquerdo, com os ícones de tema/push/sair à direita.
- [ ] Clicar no ícone de tema (sol/lua) alterna entre claro/escuro, com a sidebar e a topbar
      respeitando as duas paletas (fundo, texto, bordas continuam legíveis nos dois temas).
- [ ] Ícone de sair desloga e volta pro login.

- [ ] **Step 3: Checklist de verificação no navegador (mobile, viewport < 640px — usar as
  ferramentas de dev do navegador em modo responsivo)**

- [ ] A sidebar não aparece; o header de topo (logo + ícones) e a barra de nav com rolagem
      horizontal abaixo dele continuam exatamente como antes da mudança.
- [ ] Todos os itens de nav (principais + antigos "Mais") aparecem na rolagem horizontal, na
      mesma ordem de antes.
- [ ] `headerExtra` (botão "Novo pedido" na Cozinha) continua aparecendo no header mobile.

- [ ] **Step 4: Rodar o build de produção do frontend, garantindo que não há erro de tipo nem de
  bundling**

Run: `cd frontend && npm run build`
Expected: build conclui sem erro.

Se qualquer item do checklist falhar, voltar pra Task 2 e corrigir antes de seguir — não commitar
por cima, ajustar o mesmo commit da Task 2 só se ainda não foi enviado a nenhum PR, ou criar um
commit de correção pequeno se já tiver ido além.

---

## Self-Review (checagem feita ao escrever este plano)

1. **Cobertura da spec:** os 6 itens de "Decisões" da spec
   (`docs/superpowers/specs/2026-07-22-sidebar-lateral-design.md`) estão cobertos — escopo
   (Task 2 só mexe em `Layout.tsx`), colapsar-pra-ícones (Task 2, classe `w-16`/`w-60` +
   condicional de label), remoção do dropdown "Mais" (Task 2, `gruposSidebar` substitui o
   `menuMaisAberto`), persistência (Task 1), estrutura visual opção B (Task 2, sidebar + topbar
   separados), mobile inalterado (Task 2 preserva o `<header>` mobile igual, Task 3 confirma na
   prática).
2. **Placeholders:** nenhum "TBD"/"implementar depois" — todo código de cada step está completo.
3. **Consistência de tipos:** `useSidebarColapsada()` retorna `{ colapsada: boolean; alternar: () => void }`
   na Task 1 e é consumido com essa mesma forma (`const { colapsada, alternar: alternarSidebar } = useSidebarColapsada()`)
   na Task 2 — nomes batem.
