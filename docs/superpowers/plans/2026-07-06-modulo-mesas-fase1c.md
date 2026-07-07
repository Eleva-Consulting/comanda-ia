# Módulo de Mesas — Fase 1c: Tela do Garçom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a primeira tela do módulo de mesas — o garçom vê a grade de mesas, abre uma mesa,
lança pedidos nas comandas, cria/renomeia comandas, transfere itens entre elas e acompanha o status
de produção, tudo em tempo real via Socket.IO.

**Architecture:** As Fases 1a e 1b (já em produção) construíram o schema completo e todas as rotas
de backend (`GET/POST /mesas`, `GET/POST /contas`, `GET /contas/:id`, `PATCH /contas/:id/status`,
`POST /contas/:id/comandas`, `PATCH /comandas/:id`, `POST /comandas/:id/itens`,
`PATCH /itens-comanda/:id/status`, `PATCH /itens-comanda/:id/transferir`). Esta fase é 100% frontend:
uma página nova (`Mesas.tsx`) que consome essas rotas, seguindo exatamente os padrões visuais e de
código já usados em `Cozinha.tsx` (busca de item, modais, Socket.IO) e `Layout.tsx` (navegação
condicionada por permissão). Ver `docs/superpowers/specs/2026-07-04-modulo-mesas-design.md` para o
desenho completo do domínio.

**Tech Stack:** React 19 + Vite + Tailwind + React Router 7 + lucide-react + socket.io-client. Sem
testes automatizados nesta fase — é UI/CRUD, verificado manualmente no navegador, mesma convenção já
usada em todas as outras telas do projeto (Cozinha, Cardápio, Operadores...).

## Global Constraints

- TypeScript strict, sem `any` implícito, sem `@ts-ignore`.
- Mobile first — Tailwind sem prefixo é mobile, `sm:`/`md:`/`lg:` é telas maiores. O garçom usa isso
  no celular.
- `min-h-dvh` em vez de `min-h-screen` (já é convenção do `Layout.tsx`, não precisa repetir aqui).
- A tela de Mesas só aparece pra quem tem a permissão `mesas` **e** o estabelecimento tem o módulo
  `"mesas"` em `Estabelecimento.modulosAtivos` — as duas checagens são independentes (mesma regra já
  aplicada no backend nas Fases 1a/1b).
- Arquivos completos nas edições — nunca entregar trecho parcial.
- Sem `console.log` — `console.error` em catch é o padrão já usado no projeto.

---

### Task 1: Permissão `mesas` no frontend + link de navegação

A Fase 1a decidiu deliberadamente **não** expor a permissão `mesas` no checkbox de Operadores ainda,
porque não existia nenhuma tela real pra ela controlar — só existia no backend. Agora a tela existe,
então é hora de completar isso dos dois lados: o DONO passa a poder conceder a permissão `mesas` a um
operador, e o link "Mesas" aparece no menu pra quem tem a permissão E o estabelecimento tem o módulo
ativo.

**Files:**
- Modify: `frontend/src/lib/permissoes.ts`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Produces: `'mesas'` passa a ser um valor de `Permissao` reconhecido no frontend, com checkbox
  visível na tela de Operadores (que já mapeia `TODAS_PERMISSOES` dinamicamente — nenhuma mudança
  necessária lá). `Layout.tsx` expõe internamente `modulosAtivos: string[]` (carregado uma vez de
  `/meu-estabelecimento`) — não exportado, mas o padrão (`fetch` + `useState` + `useEffect`) é o que
  a Task 2 replica dentro de `Mesas.tsx` (cada página busca isso de forma independente, mesmo padrão
  já usado em `Dashboard.tsx`/`Cozinha.tsx`/etc. pra outros dados).

- [ ] **Step 1: Adicionar `mesas` à lista de permissões**

Em `frontend/src/lib/permissoes.ts`, trocar:

```typescript
export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes'

export const TODAS_PERMISSOES: { id: Permissao; label: string }[] = [
  { id: 'cozinha',       label: 'Cozinha — ver e atualizar pedidos' },
  { id: 'cardapio',      label: 'Cardápio — editar itens e categorias' },
  { id: 'historico',     label: 'Histórico — ver pedidos anteriores' },
  { id: 'pedido_manual', label: 'Criar pedido manualmente' },
  { id: 'configuracoes', label: 'Configurações do estabelecimento' },
]
```

por:

```typescript
export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes' | 'mesas'

export const TODAS_PERMISSOES: { id: Permissao; label: string }[] = [
  { id: 'cozinha',       label: 'Cozinha — ver e atualizar pedidos' },
  { id: 'cardapio',      label: 'Cardápio — editar itens e categorias' },
  { id: 'historico',     label: 'Histórico — ver pedidos anteriores' },
  { id: 'pedido_manual', label: 'Criar pedido manualmente' },
  { id: 'configuracoes', label: 'Configurações do estabelecimento' },
  { id: 'mesas',         label: 'Mesas — abrir mesas e lançar pedidos' },
]
```

- [ ] **Step 2: Adicionar o link de navegação em `Layout.tsx`, gated por permissão E módulo**

Em `frontend/src/components/Layout.tsx`, adicionar o import de `API_URL` e o ícone `Table2` no topo:

```typescript
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2 } from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { usePush } from '../hooks/usePush'
import { getRole } from '../lib/auth'
import { temPermissao } from '../lib/permissoes'
import { API_URL } from '../lib/api'
```

Dentro do componente `Layout`, logo abaixo de `const podeConfiguracoes = ...` (perto da linha 85),
adicionar:

```typescript
  const podeMesas = isDono || temPermissao('mesas')
  const [modulosAtivos, setModulosAtivos] = useState<string[]>([])

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(console.error)
  }, [token])

  const mostrarMesas = podeMesas && modulosAtivos.includes('mesas')
```

Na navegação desktop (bloco `<nav className="hidden items-center gap-1 sm:flex">`), adicionar o link
logo depois de `{isDono && <NavLink to="/dashboard" ...>Home</NavLink>}` e antes do link "Cozinha":

```tsx
            {mostrarMesas && (
              <NavLink to="/mesas" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Table2 className="h-3.5 w-3.5" />
                  Mesas
                </span>
              </NavLink>
            )}
```

Repetir o mesmo bloco na navegação mobile (`<div className="flex items-center gap-1 overflow-x-auto ...">`), na mesma posição relativa (depois de "Home", antes de "Cozinha").

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Com backend e frontend rodando, logar como DONO da Pizzaria do Bairro (`carlos@teste.com` /
`outrasenha123` — já tem o módulo `mesas` habilitado desde a Fase 1a). Confirmar que o link "Mesas"
aparece no menu (desktop e mobile). Logar como DONO da Galeteria (`vinicius@teste.com` /
`senhaforte123` — módulo não habilitado) e confirmar que o link **não** aparece. Ir em Operadores e
confirmar que o checkbox "Mesas — abrir mesas e lançar pedidos" aparece na lista de permissões.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/permissoes.ts frontend/src/components/Layout.tsx
git commit -m "feat: permissão mesas no frontend e link de navegação condicionado a permissão e módulo"
```

---

### Task 2: Rota `/mesas` e grade de mesas

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `GET /meu-estabelecimento` (campo `modulosAtivos`), `GET /mesas` (campos `id`, `numero`,
  `area`, `capacidade`, `contaAbertaId`, `statusMesa`)
- Produces: tipos `Mesa`, `StatusProducao`, `ItemComanda`, `Comanda`, `Conta`, `ItemCardapio` e as
  constantes `corStatusMesa`/`labelStatusMesa`/`corStatusItem`/`labelStatusItem`, todos usados pelas
  Tasks 3-8, que **editam este mesmo arquivo** `Mesas.tsx`, adicionando estado, funções e JSX — não
  criam arquivos novos.

- [ ] **Step 1: Adicionar a rota**

Em `frontend/src/App.tsx`, adicionar o import:

```typescript
import Mesas from './pages/Mesas'
```

E a rota, logo depois de `<Route path="/cozinha" ...>`:

```tsx
      <Route path="/mesas" element={<RotaPermissao permissao="mesas"><Mesas /></RotaPermissao>} />
```

- [ ] **Step 2: Criar a página com a grade de mesas**

Create `frontend/src/pages/Mesas.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface Mesa {
  id: string
  numero: string
  area: string | null
  capacidade: number | null
  contaAbertaId: string | null
  statusMesa: 'livre' | 'aberta' | 'aguardando_pagamento'
}

type StatusProducao = 'recebido' | 'em_preparo' | 'pronto' | 'entregue' | 'cancelado'

interface ItemComanda {
  id: string
  nomeItem: string
  quantidade: number
  precoUnit: number
  observacao: string | null
  status: StatusProducao
  comandaId: string
}

interface Comanda {
  id: string
  nome: string
  contaId: string
  itens: ItemComanda[]
}

interface Conta {
  id: string
  status: 'aberta' | 'aguardando_pagamento' | 'fechada' | 'cancelada'
  mesa: Mesa
  comandas: Comanda[]
}

interface ItemCardapio {
  id: string
  nome: string
  preco: number
  disponivel: boolean
}

// ── Helpers visuais ────────────────────────────────────────────────────────

const corStatusMesa: Record<Mesa['statusMesa'], string> = {
  livre:                'border-zinc-800 bg-zinc-900 hover:border-orange-500/50',
  aberta:               'border-orange-500/40 bg-orange-500/10',
  aguardando_pagamento: 'border-blue-500/40 bg-blue-500/10',
}

const labelStatusMesa: Record<Mesa['statusMesa'], string> = {
  livre:                'Livre',
  aberta:               'Ocupada',
  aguardando_pagamento: 'Aguardando pagamento',
}

const corStatusItem: Record<StatusProducao, string> = {
  recebido:   'bg-zinc-800 text-zinc-300',
  em_preparo: 'bg-yellow-500/10 text-yellow-400',
  pronto:     'bg-emerald-500/10 text-emerald-400',
  entregue:   'bg-zinc-800 text-zinc-500',
  cancelado:  'bg-red-500/10 text-red-400 line-through',
}

const labelStatusItem: Record<StatusProducao, string> = {
  recebido:   'Recebido',
  em_preparo: 'Em preparo',
  pronto:     'Pronto',
  entregue:   'Entregue',
  cancelado:  'Cancelado',
}

export default function Mesas() {
  const token = localStorage.getItem('token')

  const [modulosAtivos, setModulosAtivos] = useState<string[] | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [carregandoMesas, setCarregandoMesas] = useState(true)
  const [abrindoMesaId, setAbrindoMesaId] = useState<string | null>(null)
  const [carregandoConta, setCarregandoConta] = useState(false)
  const [erroGrade, setErroGrade] = useState<string | null>(null)

  const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null)

  function carregarMesas() {
    fetch(`${API_URL}/mesas`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setMesas)
      .catch((err) => { console.error(err); setErroGrade('Falha ao carregar mesas') })
      .finally(() => setCarregandoMesas(false))
  }

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(() => setModulosAtivos([]))
  }, [token])

  useEffect(() => {
    if (modulosAtivos?.includes('mesas')) carregarMesas()
  }, [modulosAtivos])

  if (modulosAtivos !== null && !modulosAtivos.includes('mesas')) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-semibold">Módulo de mesas não habilitado</p>
          <p className="text-sm text-zinc-400">Fale com o suporte pra habilitar esse módulo no seu plano.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {!contaSelecionada ? (
        <div>
          <h2 className="mb-6 text-2xl font-extrabold">Mesas</h2>
          {erroGrade && <p className="mb-4 text-sm text-red-400">{erroGrade}</p>}
          {carregandoMesas ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          ) : mesas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhuma mesa cadastrada. Cadastre em Configurações.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {mesas.map((mesa) => (
                <button
                  key={mesa.id}
                  disabled={abrindoMesaId === mesa.id || carregandoConta}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition disabled:opacity-50 ${corStatusMesa[mesa.statusMesa]}`}
                >
                  {abrindoMesaId === mesa.id
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <span className="text-xl font-bold">{mesa.numero}</span>}
                  <span className="text-xs text-zinc-400">{labelStatusMesa[mesa.statusMesa]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-zinc-400">Detalhe da conta — Task 3</p>
        </div>
      )}
    </Layout>
  )
}
```

Note: os botões de mesa ainda não têm `onClick` — isso é implementado na Task 3, que também
substitui o placeholder "Detalhe da conta — Task 3" pela view real.

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Logar como DONO da Pizzaria do Bairro, ir em "Mesas" no menu. Confirmar que a grade aparece com as
mesas cadastradas nas Fases anteriores, cada uma colorida conforme seu `statusMesa` (verde-acinzentado
= livre, laranja = ocupada). Redimensionar a janela pra confirmar o grid responsivo (2 colunas no
celular, mais colunas em telas maiores).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/Mesas.tsx
git commit -m "feat: rota e grade de mesas"
```

---

### Task 3: Abrir mesa e ver detalhe da conta

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `POST /contas` (body `{ mesaId }`), `GET /contas/:id`
- Produces: `abrirMesa`, `abrirContaExistente`, `fecharDetalhe` — funções internas, não exportadas.
  A view de detalhe (comandas + itens) fica montada e é o que as Tasks 4-7 adicionam controles em
  cima (modais, botões).

- [ ] **Step 1: Adicionar as funções de abrir/fechar conta**

Em `frontend/src/pages/Mesas.tsx`, logo depois da função `carregarMesas`, adicionar:

```typescript
  async function abrirMesa(mesaId: string) {
    setAbrindoMesaId(mesaId)
    setErroGrade(null)
    try {
      const resp = await fetch(`${API_URL}/contas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesaId }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroGrade(dados.erro ?? 'Falha ao abrir mesa'); return }
      setContaSelecionada(dados)
      carregarMesas()
    } catch {
      setErroGrade('Falha de conexão')
    } finally {
      setAbrindoMesaId(null)
    }
  }

  async function abrirContaExistente(mesa: Mesa) {
    if (!mesa.contaAbertaId) return
    setCarregandoConta(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${mesa.contaAbertaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const dados = await resp.json()
      if (resp.ok) setContaSelecionada(dados)
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoConta(false)
    }
  }

  function fecharDetalhe() {
    setContaSelecionada(null)
    carregarMesas()
  }
```

- [ ] **Step 2: Ligar o clique da mesa às funções**

No JSX da grade, trocar:

```tsx
                <button
                  key={mesa.id}
                  disabled={abrindoMesaId === mesa.id || carregandoConta}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition disabled:opacity-50 ${corStatusMesa[mesa.statusMesa]}`}
                >
```

por:

```tsx
                <button
                  key={mesa.id}
                  onClick={() => mesa.statusMesa === 'livre' ? abrirMesa(mesa.id) : abrirContaExistente(mesa)}
                  disabled={abrindoMesaId === mesa.id || carregandoConta}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition disabled:opacity-50 ${corStatusMesa[mesa.statusMesa]}`}
                >
```

- [ ] **Step 3: Substituir o placeholder pela view de detalhe real**

Trocar:

```tsx
      ) : (
        <div>
          <p className="text-sm text-zinc-400">Detalhe da conta — Task 3</p>
        </div>
      )}
```

por:

```tsx
      ) : (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <button onClick={fecharDetalhe} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              ← Mesas
            </button>
            <h2 className="text-xl font-extrabold">Mesa {contaSelecionada.mesa.numero}</h2>
          </div>

          <div className="space-y-4">
            {contaSelecionada.comandas.map((comanda) => (
              <div key={comanda.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{comanda.nome}</span>
                </div>

                {comanda.itens.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhum item ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {comanda.itens.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <span className="font-medium">{item.quantidade}x {item.nomeItem}</span>
                          {item.observacao && <p className="text-xs text-zinc-500">{item.observacao}</p>}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                          {labelStatusItem[item.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Testar manualmente**

Clicar numa mesa "Livre" — confirmar que abre e mostra a Comanda "Geral" vazia, com o número da mesa
no cabeçalho. Voltar pra grade ("← Mesas") e confirmar que essa mesa agora aparece como "Ocupada".
Clicar nela de novo (agora ocupada) — confirmar que abre a mesma conta (mesma comanda "Geral").
Adicionar um item via curl direto na API (`POST /comandas/:id/itens`, usando o id da comanda visível
na tela) pra confirmar que o item aparece ao reabrir a tela (sem tempo real ainda — isso é a Task 8).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: abrir mesa e visualizar comandas/itens da conta"
```

---

### Task 4: Modal de adicionar item

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `GET /cardapio`, `POST /comandas/:id/itens`
- Produces: modal reaproveitável pelas próximas tasks só como referência visual (não expõe interface
  pra outras tasks consumirem programaticamente).

- [ ] **Step 1: Adicionar o import de ícones e o estado do modal**

No topo do arquivo, trocar:

```typescript
import { Loader2 } from 'lucide-react'
```

por:

```typescript
import { Loader2, Plus, Search, X } from 'lucide-react'
```

Dentro do componente, logo abaixo de `const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null)`, adicionar:

```typescript
  const [modalItemAberto, setModalItemAberto] = useState<string | null>(null) // comandaId
  const [cardapio, setCardapio] = useState<ItemCardapio[]>([])
  const [carregandoCardapio, setCarregandoCardapio] = useState(false)
  const [buscaItem, setBuscaItem] = useState('')
  const [adicionandoItemId, setAdicionandoItemId] = useState<string | null>(null)
```

- [ ] **Step 2: Adicionar as funções**

Logo depois da função `fecharDetalhe`, adicionar:

```typescript
  async function carregarCardapioSeNecessario() {
    if (cardapio.length > 0) return
    setCarregandoCardapio(true)
    try {
      const resp = await fetch(`${API_URL}/cardapio`, { headers: { Authorization: `Bearer ${token}` } })
      const dados = await resp.json()
      if (resp.ok) setCardapio(dados.filter((i: ItemCardapio) => i.disponivel))
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoCardapio(false)
    }
  }

  async function abrirModalItem(comandaId: string) {
    setModalItemAberto(comandaId)
    setBuscaItem('')
    await carregarCardapioSeNecessario()
  }

  async function recarregarContaAtual() {
    if (!contaSelecionada) return
    const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (resp.ok) setContaSelecionada(await resp.json())
  }

  async function adicionarItem(itemCardapioId: string) {
    if (!modalItemAberto) return
    setAdicionandoItemId(itemCardapioId)
    try {
      const resp = await fetch(`${API_URL}/comandas/${modalItemAberto}/itens`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemCardapioId, quantidade: 1 }),
      })
      if (resp.ok) await recarregarContaAtual()
    } catch (err) {
      console.error(err)
    } finally {
      setAdicionandoItemId(null)
    }
  }

  const itensFiltrados = cardapio.filter((item) =>
    item.nome.toLowerCase().includes(buscaItem.trim().toLowerCase())
  )
```

- [ ] **Step 3: Adicionar o botão "Item" em cada comanda e o modal**

No JSX de cada comanda, trocar:

```tsx
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{comanda.nome}</span>
                </div>
```

por:

```tsx
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{comanda.nome}</span>
                  <button
                    onClick={() => abrirModalItem(comanda.id)}
                    className="flex items-center gap-1 rounded-lg bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/20"
                  >
                    <Plus className="h-3.5 w-3.5" /> Item
                  </button>
                </div>
```

Logo antes do `</Layout>` de fechamento (no final do JSX retornado pelo componente), adicionar:

```tsx
      {modalItemAberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setModalItemAberto(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-zinc-900 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">Adicionar item</h3>
              <button onClick={() => setModalItemAberto(null)}><X className="h-5 w-5 text-zinc-400" /></button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={buscaItem}
                onChange={(e) => setBuscaItem(e.target.value)}
                placeholder="Buscar item..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {carregandoCardapio ? (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            ) : itensFiltrados.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum item encontrado.</p>
            ) : (
              <ul className="space-y-1">
                {itensFiltrados.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => adicionarItem(item.id)}
                      disabled={adicionandoItemId === item.id}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <span>{item.nome}</span>
                      <span className="text-zinc-400">R$ {item.preco.toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Testar manualmente**

Abrir uma mesa, clicar em "Item" na comanda "Geral", buscar um item do cardápio, clicar nele.
Confirmar que o modal fecha... espera, o modal não fecha automaticamente (não implementado) — mas o
item deve aparecer na lista da comanda depois de recarregar a conta. Testar a busca filtrando por
nome. Confirmar que fechar o modal (X ou clicar fora) não adiciona nada.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: modal de adicionar item à comanda"
```

---

### Task 5: Criar e renomear comanda

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `POST /contas/:id/comandas`, `PATCH /comandas/:id`

- [ ] **Step 1: Adicionar o import de `FormEvent` e o estado**

No topo do arquivo, trocar:

```typescript
import { useEffect, useState } from 'react'
```

por:

```typescript
import { useEffect, useState, type FormEvent } from 'react'
```

Logo abaixo do estado adicionado na Task 4 (`adicionandoItemId`), adicionar:

```typescript
  const [novaComandaAberta, setNovaComandaAberta] = useState(false)
  const [nomeNovaComanda, setNomeNovaComanda] = useState('')
  const [salvandoComanda, setSalvandoComanda] = useState(false)

  const [renomeandoComandaId, setRenomeandoComandaId] = useState<string | null>(null)
  const [nomeRenomeacao, setNomeRenomeacao] = useState('')
```

- [ ] **Step 2: Adicionar as funções**

Logo depois da função `adicionarItem`, adicionar:

```typescript
  async function criarComanda(e: FormEvent) {
    e.preventDefault()
    if (!contaSelecionada || !nomeNovaComanda.trim()) return
    setSalvandoComanda(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/comandas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeNovaComanda.trim() }),
      })
      if (resp.ok) {
        const novaComanda = await resp.json()
        setContaSelecionada((prev) => prev ? { ...prev, comandas: [...prev.comandas, novaComanda] } : prev)
        setNovaComandaAberta(false)
        setNomeNovaComanda('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSalvandoComanda(false)
    }
  }

  function iniciarRenomeacao(comanda: Comanda) {
    setRenomeandoComandaId(comanda.id)
    setNomeRenomeacao(comanda.nome)
  }

  async function salvarRenomeacao(e: FormEvent) {
    e.preventDefault()
    if (!renomeandoComandaId || !nomeRenomeacao.trim()) return
    try {
      const resp = await fetch(`${API_URL}/comandas/${renomeandoComandaId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeRenomeacao.trim() }),
      })
      if (resp.ok) {
        const atualizada = await resp.json()
        setContaSelecionada((prev) => prev
          ? { ...prev, comandas: prev.comandas.map((c) => c.id === atualizada.id ? atualizada : c) }
          : prev)
        setRenomeandoComandaId(null)
      }
    } catch (err) {
      console.error(err)
    }
  }
```

- [ ] **Step 3: Adicionar o botão "Nova comanda", tornar o nome editável, e adicionar o modal**

No JSX, logo abaixo do `<div className="mb-6 flex items-center justify-between">...</div>` (o
cabeçalho "← Mesas" / "Mesa X") e antes de `<div className="space-y-4">`, adicionar:

```tsx
          <button
            onClick={() => setNovaComandaAberta(true)}
            className="mb-4 flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Plus className="h-4 w-4" /> Nova comanda
          </button>
```

Trocar o `<span className="font-semibold">{comanda.nome}</span>` (dentro do `.map` de comandas) por:

```tsx
                  {renomeandoComandaId === comanda.id ? (
                    <form onSubmit={salvarRenomeacao} className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={nomeRenomeacao}
                        onChange={(e) => setNomeRenomeacao(e.target.value)}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
                      />
                      <button type="submit" className="text-sm text-orange-400">Salvar</button>
                      <button type="button" onClick={() => setRenomeandoComandaId(null)} className="text-sm text-zinc-500">Cancelar</button>
                    </form>
                  ) : (
                    <button onClick={() => iniciarRenomeacao(comanda)} className="font-semibold hover:text-orange-400">
                      {comanda.nome}
                    </button>
                  )}
```

Logo depois do modal de adicionar item (antes do `</Layout>` final), adicionar:

```tsx
      {novaComandaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNovaComandaAberta(false)}>
          <form onSubmit={criarComanda} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Nova comanda</h3>
            <input
              autoFocus
              value={nomeNovaComanda}
              onChange={(e) => setNomeNovaComanda(e.target.value)}
              placeholder="Nome (ex: Luiz)"
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={salvandoComanda || !nomeNovaComanda.trim()}
              className="w-full rounded-xl bg-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Criar
            </button>
          </form>
        </div>
      )}
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Testar manualmente**

Abrir uma mesa, clicar em "Nova comanda", criar "Luiz" — confirmar que aparece na lista. Clicar no
nome "Luiz" pra renomear pra "Luiz Silva" — confirmar que salva e volta ao modo de exibição normal.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: criar e renomear comanda"
```

---

### Task 6: Transferir item entre comandas

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `PATCH /itens-comanda/:id/transferir`

- [ ] **Step 1: Adicionar o import do ícone e o estado**

Trocar:

```typescript
import { Loader2, Plus, Search, X } from 'lucide-react'
```

por:

```typescript
import { Loader2, Plus, Search, X, ArrowRightLeft } from 'lucide-react'
```

Logo abaixo do estado `nomeRenomeacao`, adicionar:

```typescript
  const [transferindoItemId, setTransferindoItemId] = useState<string | null>(null)
```

- [ ] **Step 2: Adicionar a função**

Logo depois da função `salvarRenomeacao`, adicionar:

```typescript
  async function transferirItem(itemId: string, comandaDestinoId: string) {
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${itemId}/transferir`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comandaId: comandaDestinoId }),
      })
      if (resp.ok) await recarregarContaAtual()
    } catch (err) {
      console.error(err)
    } finally {
      setTransferindoItemId(null)
    }
  }
```

- [ ] **Step 3: Adicionar o botão de transferir em cada item e o modal de seleção**

No JSX de cada item (dentro do `.map` de `comanda.itens`), trocar:

```tsx
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                          {labelStatusItem[item.status]}
                        </span>
```

por:

```tsx
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatusItem[item.status]}`}>
                            {labelStatusItem[item.status]}
                          </span>
                          {contaSelecionada.comandas.length > 1 && (
                            <button
                              onClick={() => setTransferindoItemId(item.id)}
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Transferir pra outra comanda"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
```

Logo depois do modal de nova comanda (antes do `</Layout>` final), adicionar:

```tsx
      {transferindoItemId && contaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTransferindoItemId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold">Transferir pra qual comanda?</h3>
            <ul className="space-y-1">
              {contaSelecionada.comandas
                .filter((c) => !c.itens.some((i) => i.id === transferindoItemId))
                .map((comanda) => (
                  <li key={comanda.id}>
                    <button
                      onClick={() => transferirItem(transferindoItemId, comanda.id)}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                    >
                      {comanda.nome}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Testar manualmente**

Com uma mesa que tenha 2+ comandas e ao menos um item na comanda "Geral", clicar no ícone de
transferir do item, escolher a outra comanda. Confirmar que o item muda de comanda. Confirmar que o
botão de transferir **não aparece** quando só existe 1 comanda na conta.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: transferir item entre comandas"
```

---

### Task 7: Cancelar mesa

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `PATCH /contas/:id/status` (body `{ status: 'cancelada' }`)

- [ ] **Step 1: Adicionar o estado**

Logo abaixo do estado `transferindoItemId`, adicionar:

```typescript
  const [cancelandoConta, setCancelandoConta] = useState(false)
```

- [ ] **Step 2: Adicionar a função**

Logo depois da função `transferirItem`, adicionar:

```typescript
  async function cancelarConta() {
    if (!contaSelecionada) return
    setCancelandoConta(true)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelada' }),
      })
      if (resp.ok) fecharDetalhe()
    } catch (err) {
      console.error(err)
    } finally {
      setCancelandoConta(false)
    }
  }
```

- [ ] **Step 3: Adicionar o botão no cabeçalho do detalhe**

Trocar:

```tsx
          <div className="mb-6 flex items-center justify-between">
            <button onClick={fecharDetalhe} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              ← Mesas
            </button>
            <h2 className="text-xl font-extrabold">Mesa {contaSelecionada.mesa.numero}</h2>
          </div>
```

por:

```tsx
          <div className="mb-6 flex items-center justify-between">
            <button onClick={fecharDetalhe} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
              ← Mesas
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold">Mesa {contaSelecionada.mesa.numero}</h2>
              <button
                onClick={cancelarConta}
                disabled={cancelandoConta}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                title="Cancelar mesa"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Testar manualmente**

Abrir uma mesa de teste (crie uma mesa nova em Configurações se não quiser mexer nas de teste
existentes), clicar no X vermelho ao lado do nome, confirmar que volta pra grade e a mesa aparece
como "Livre" de novo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: cancelar mesa"
```

---

### Task 8: Tempo real via Socket.IO

Sem isso, dois garçons usando a tela ao mesmo tempo (ou a cozinha atualizando o status de um item)
não veem a mudança até recarregar a página manualmente.

**Files:**
- Modify: `frontend/src/pages/Mesas.tsx`

**Interfaces:**
- Consumes: `useSocket` (hook já existente em `frontend/src/hooks/useSocket.ts`), eventos
  `conta:atualizada`, `comanda:criada`, `comanda:atualizada`, `item-comanda:novo`,
  `item-comanda:atualizado` (todos já emitidos pelo backend desde a Fase 1b, na sala
  `estabelecimentoId`).

- [ ] **Step 1: Adicionar o import e o hook**

No topo do arquivo, adicionar:

```typescript
import { useSocket } from '../hooks/useSocket'
```

Logo na primeira linha do componente (`const token = localStorage.getItem('token')`), adicionar
logo abaixo:

```typescript
  const { socket } = useSocket(token)
```

- [ ] **Step 2: Adicionar o efeito de escuta dos eventos**

Logo depois da declaração de `itensFiltrados` (a última linha antes do primeiro `if` que retorna o
JSX), adicionar:

```typescript
  useEffect(() => {
    if (!socket) return

    function atualizarSeForContaAtual(conta: Conta) {
      setContaSelecionada((prev) => (prev && prev.id === conta.id) ? conta : prev)
    }

    function recarregarContaEGrade() {
      recarregarContaAtual()
      carregarMesas()
    }

    socket.on('conta:atualizada', atualizarSeForContaAtual)
    socket.on('comanda:criada', recarregarContaEGrade)
    socket.on('comanda:atualizada', recarregarContaEGrade)
    socket.on('item-comanda:novo', recarregarContaEGrade)
    socket.on('item-comanda:atualizado', recarregarContaEGrade)

    return () => {
      socket.off('conta:atualizada', atualizarSeForContaAtual)
      socket.off('comanda:criada', recarregarContaEGrade)
      socket.off('comanda:atualizada', recarregarContaEGrade)
      socket.off('item-comanda:novo', recarregarContaEGrade)
      socket.off('item-comanda:atualizado', recarregarContaEGrade)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, contaSelecionada?.id])
```

Nota: `recarregarContaAtual` e `carregarMesas` são estáveis o bastante pro propósito aqui (recriadas
a cada render, mas isso não causa loop porque o efeito só reage a `socket`/`contaSelecionada?.id`,
mesmo padrão de dependências já usado em outros hooks deste arquivo) — não é necessário memoizá-las
com `useCallback` pra este caso.

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Testar manualmente**

Abrir a tela de Mesas em duas abas do navegador logadas com o mesmo usuário. Na aba 1, abrir uma
mesa e adicionar um item. Confirmar que a aba 2 (ainda na grade) reflete a mesa como "Ocupada" sem
precisar recarregar a página. Abrir a mesma conta na aba 2 e confirmar que o item aparece lá também.
Numa aba, usar curl pra mudar o status de um item (`PATCH /itens-comanda/:id/status`) e confirmar que
o badge de status muda na tela sem recarregar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Mesas.tsx
git commit -m "feat: atualização em tempo real via Socket.IO na tela de mesas"
```

---

## Verificação final do plano

- [ ] `cd frontend && npx tsc --noEmit` — sem erros
- [ ] Fluxo completo no navegador: login DONO Pizzaria → Mesas → abrir mesa livre → criar segunda
      comanda → adicionar item em cada uma → transferir um item → cancelar a mesa → confirmar que
      volta a aparecer livre
- [ ] Confirmar que o link "Mesas" não aparece pra Galeteria (sem o módulo)
- [ ] Confirmar tempo real com duas abas abertas
- [ ] Testar em largura de celular (DevTools responsive mode) — grade e detalhe usáveis com o
      polegar, sem texto cortado
