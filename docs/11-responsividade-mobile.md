# 11 — Responsividade e UX mobile

Este documento registra as decisões e aprendizados sobre responsividade no comanda-ia.

## Contexto

O comanda-ia tem dois públicos distintos com necessidades opostas:

| Tela | Público | Dispositivo principal |
|---|---|---|
| `/c/:slug` (cardápio público) | Cliente final | Celular (link via WhatsApp) |
| `/dashboard`, `/cozinha`, `/cardapio` | Dono / operador | Desktop ou tablet na cozinha |

O painel do estabelecimento foi construído pensando em desktop, mas precisa ser usável no celular também — o dono pode precisar verificar pedidos pelo celular.

## Tailwind v4 e breakpoints

O comanda-ia usa Tailwind v4. Os breakpoints funcionam igual ao v3:

| Prefixo | Largura mínima | Contexto |
|---|---|---|
| (sem prefixo) | 0px | Mobile first — regra padrão |
| `sm:` | 640px | Tablet pequeno / landscape |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Desktop pequeno |
| `xl:` | 1280px | Desktop |

**Mobile first:** escreva o estilo base para mobile, sobrescreva para telas maiores com `sm:`, `md:` etc.

```tsx
// ❌ Errado — pensa em desktop, quebra no mobile
<div className="flex items-center gap-6 px-6">

// ✅ Certo — mobile first
<div className="flex items-center gap-2 px-4 sm:gap-6 sm:px-6">
```

## Navbar responsiva

### O problema

A navbar original tinha logo + links + botão sair todos em linha horizontal. No iPhone (~390px), isso ultrapassava a largura disponível, criando scroll horizontal e faixa branca à direita.

### A solução

Dois comportamentos diferentes por breakpoint:

**Mobile (< 640px):**
- Linha superior: só ícone do logo (sem texto) + botão sair
- Segunda linha: nav com links em `overflow-x-auto` para não estourar

**Desktop (≥ 640px):**
- Linha única: logo completo + nav central + botão sair
- Comportamento original preservado

```tsx
{/* Logo: ícone sempre visível, texto só em sm+ */}
<div className="flex h-9 w-9 ... sm:h-10 sm:w-10">
  <ChefHat ... />
</div>
<h1 className="hidden ... sm:block">Comanda IA</h1>

{/* Nav desktop: hidden no mobile, flex em sm+ */}
<nav className="hidden ... sm:flex">
  <NavLink to="/dashboard">Dashboard</NavLink>
  ...
</nav>

{/* Nav mobile: visível só abaixo de sm */}
<div className="flex ... sm:hidden">
  <NavLink to="/dashboard">Dashboard</NavLink>
  ...
</div>
```

## Viewport height no mobile

### O problema

`min-h-screen` usa `100vh` — que no Safari iOS considera a altura total da tela, incluindo a barra de endereço. Quando a barra aparece/desaparece ao rolar, o conteúdo não preenche o espaço real visível, deixando fundo branco aparecer.

Além disso, o `body` e `#root` não tinham background definido — qualquer área não coberta pelo componente React mostrava o branco padrão do browser.

### A solução

**1. `min-h-dvh` no container raiz:**

```tsx
// Layout.tsx
<div className="min-h-dvh bg-zinc-950 ...">
```

`dvh` = dynamic viewport height. Atualiza automaticamente quando a barra do navegador aparece ou desaparece. É o valor correto para mobile moderno.

**2. Background no `body` e `#root`:**

```css
/* index.css */
html, body, #root {
  min-height: 100dvh;
  background-color: #09090b; /* zinc-950 */
}
```

Garante que mesmo áreas fora do componente React (ex: conteúdo pequeno que não preenche a tela toda) tenham o fundo escuro correto.

### Suporte

`dvh` tem suporte amplo desde 2023 (Chrome 108+, Safari 15.4+, Firefox 101+). Para os casos raros de browsers mais antigos, o comportamento degrada graciosamente para `vh`.

## Padding e espaçamento

Reduza padding em telas pequenas:

```tsx
// ❌
<div className="px-6 py-4">

// ✅
<div className="px-4 py-3 sm:px-6 sm:py-4">
```

4px de diferença por lado = 8px extras de conteúdo útil no mobile. Em uma tela de 390px, isso importa.

## Checklist de responsividade

Ao criar um novo componente de layout, verifique:

- [ ] Funciona em 390px de largura sem scroll horizontal?
- [ ] Textos não cortam nem transbordam?
- [ ] Botões têm área de toque mínima de 44x44px?
- [ ] Usa `min-h-dvh` em vez de `min-h-screen` para containers de tela cheia?
- [ ] `body` e `#root` têm background definido no CSS global?
- [ ] Padding responsivo com `px-4 sm:px-6`?
