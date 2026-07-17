# Modo claro/escuro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar modo claro/escuro ao app com um botão no header que alterna e salva a escolha, sem reescrever as ~404 classes `zinc` existentes — remapeando a escala `zinc` por tema via variáveis CSS.

**Architecture:** O Tailwind v4 emite cada cor do tema como variável CSS que as utilities referenciam. No modo claro, sobrescrevemos a escala `zinc` (fundo, cards, texto, bordas) com valores claros; o escuro fica idêntico ao atual. Um hook `useTema` aplica `data-theme` no `<html>` e persiste em localStorage.

**Tech Stack:** React 19 + Tailwind v4 + lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-17-modo-claro-escuro-design.md`

## Global Constraints

- Modo **escuro é o default** e fica **idêntico ao atual** (sem override no escuro).
- Botão **manual**; escolha salva em `localStorage['tema']` (`'dark'` | `'light'`).
- Não trocar os 404 usos de `zinc` — só remapear a escala por tema.
- TypeScript strict; sem `console.log` novo; commits conventional.
- Verificação: `cd frontend && npx tsc -b` por task; verificação visual ao vivo nos dois temas na última.
- Sem migration, sem backend — 100% frontend.

## File Structure

- `frontend/src/index.css` — override da escala `zinc` no tema claro + fundo via var.
- `frontend/src/hooks/useTema.ts` (novo) — estado/persistência do tema.
- `frontend/src/main.tsx` — aplica `data-theme` cedo (evita flash).
- `frontend/src/components/Layout.tsx` e `LayoutAdmin.tsx` — botão sol/lua no header.

---

### Task 1: CSS — tema claro remapeando a escala zinc

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Reescrever `index.css`**

```css
@import "tailwindcss";

@theme {
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
}

/* Modo claro: inverte a escala zinc (o app inteiro usa zinc pra fundo/card/texto/borda).
   As classes bg-zinc-900, text-zinc-100 etc. continuam iguais no código e ficam corretas
   nos dois temas. O modo escuro (default) usa os valores padrão do Tailwind, sem override. */
:root[data-theme="light"] {
  --color-zinc-950: #ffffff; /* fundo da página */
  --color-zinc-900: #f4f4f5; /* card/superfície */
  --color-zinc-800: #e4e4e7; /* input/borda/hover */
  --color-zinc-700: #d4d4d8; /* borda mais forte */
  --color-zinc-600: #a1a1aa;
  --color-zinc-500: #71717a; /* muted (bom nos dois) */
  --color-zinc-400: #52525b; /* texto secundário (escurecido pra ler no claro) */
  --color-zinc-300: #3f3f46;
  --color-zinc-200: #27272a; /* texto */
  --color-zinc-100: #18181b; /* texto primário */
  --color-zinc-50:  #09090b;
}

html, body, #root {
  min-height: 100dvh;
  background-color: var(--color-zinc-950); /* preto no escuro, branco no claro */
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npx tsc -b` (CSS não é checado por tsc, mas garante que nada quebrou) e `npm run build`
Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: escala zinc remapeada pro tema claro (escuro segue default)"
```

---

### Task 2: Hook useTema + aplicação antecipada

**Files:**
- Create: `frontend/src/hooks/useTema.ts`
- Modify: `frontend/src/main.tsx`

**Interfaces (Produces):** `export function useTema(): { tema: 'dark' | 'light'; alternar: () => void }`

- [ ] **Step 1: Criar `frontend/src/hooks/useTema.ts`**

```ts
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
```

- [ ] **Step 2: Aplicar o tema cedo em `main.tsx` (evita flash do tema errado)**

No topo de `frontend/src/main.tsx`, antes do `createRoot`, adicionar:

```ts
document.documentElement.dataset.theme = localStorage.getItem('tema') === 'light' ? 'light' : 'dark'
```

- [ ] **Step 3: Verificar**

Run: `cd frontend && npx tsc -b`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useTema.ts frontend/src/main.tsx
git commit -m "feat: hook useTema (data-theme no html + persistência) aplicado cedo"
```

---

### Task 3: Botão sol/lua no header (Layout + LayoutAdmin)

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (import lucide + hook; botão antes do sino, ~linha 226)
- Modify: `frontend/src/components/LayoutAdmin.tsx` (botão antes do "Sair", ~linha 55)

**Interfaces:**
- Consumes: `useTema` (Task 2).

- [ ] **Step 1: Layout.tsx — importar Sun/Moon e o hook**

No import de lucide (`Bell, BellOff, ChefHat, LogOut, Users, X, Table2, Wallet, ShieldCheck,` ...) adicionar `Sun, Moon`. Adicionar `import { useTema } from '../hooks/useTema'`. Dentro do componente `Layout`, adicionar `const { tema, alternar } = useTema()`.

- [ ] **Step 2: Layout.tsx — botão antes do sino**

Antes do bloco `{pushSuportado && (` (linha ~226), inserir:

```tsx
            <button
              onClick={alternar}
              className="rounded-lg p-3 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              aria-label={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            >
              {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
```

- [ ] **Step 3: LayoutAdmin.tsx — mesmo botão antes do "Sair"**

Adicionar `Sun, Moon` ao import de lucide (`ChefHat, LogOut, LayoutDashboard, Building2`), `import { useTema } from '../hooks/useTema'`, `const { tema, alternar } = useTema()` no componente, e inserir o mesmo botão (Step 2) imediatamente antes do botão de `LogOut` (linha ~55).

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b`
Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/components/LayoutAdmin.tsx
git commit -m "feat: botão sol/lua no header alterna tema claro/escuro"
```

---

### Task 4: Verificação ao vivo + ajuste fino + docs + push

- [ ] **Step 1: Subir o frontend** (`cd frontend && npm run dev`) e abrir no navegador.
- [ ] **Step 2: Verificar nos DOIS temas** — logar, alternar no botão sol/lua, e conferir tela por tela no claro (e confirmar que o escuro segue idêntico): Login, Dashboard, Mesas (grade + detalhe + modais de item/rascunho/revisão), Cozinha (Kanban), Caixa (fluxo de recebimento), Cardápio, Configurações. Conferir: legibilidade do texto, contraste de cards/bordas, laranja e cores de status, e que a escolha persiste no reload (F5 mantém o tema).
- [ ] **Step 3: Ajuste fino** — corrigir os poucos pontos que ficarem ruins no claro. Casos prováveis: `text-white` usado como texto (não em botão colorido) que fique invisível sobre fundo claro → trocar por `text-zinc-100`; algum `bg-black`/`text-black` solto; contraste do `text-orange-400` sobre branco (se preciso, `text-orange-600` no claro via `zinc`-independent). Cada ajuste verificado ao vivo.
- [ ] **Step 4: Docs** — atualizar "Log de mudanças" do CLAUDE.md.
- [ ] **Step 5: Push** — `git pull --rebase && git push` (sem migration; Vercel faz deploy do front).
