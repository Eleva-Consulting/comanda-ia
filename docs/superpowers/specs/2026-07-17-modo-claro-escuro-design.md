# Modo claro/escuro — remapeamento da escala zinc por tema

**Data:** 2026-07-17
**Status:** aprovado pelo usuário (design validado em conversa)

## Problema

O app (frontend React + Tailwind v4) é 100% tema escuro fixo: `html/body/#root` com
`background-color: #09090b` fixo, **zero variantes `dark:`**, e **~404 usos** da escala de
cinzas `zinc` (bg-zinc-900, text-zinc-100, border-zinc-800...) espalhados por 43 arquivos
`.tsx`. O usuário quer um modo claro/escuro — útil pra operar o app tanto em ambiente
claro (salão de dia) quanto escuro.

Decisões do usuário: **botão manual** que alterna claro/escuro, escolha **salva no
aparelho** (localStorage), **começa no escuro** (visual atual preservado).

## Abordagem: remapear a escala `zinc` por tema (não reescrever as telas)

Em vez de trocar os 404 usos por tokens semânticos novos (muito trabalho, alto risco de
deixar tela quebrada), **redefinir a própria escala `zinc` do Tailwind por tema** via
variáveis CSS. O Tailwind v4 emite cada cor do tema como variável CSS
(`--color-zinc-900`) e as utilities a referenciam (`.bg-zinc-900 { background-color:
var(--color-zinc-900) }`). Basta **sobrescrever essas variáveis no modo claro**.

No modo claro a escala "inverte" de papel:
- `zinc-950` (fundo da página, hoje quase preto) → branco
- `zinc-900` (card/superfície) → cinza bem claro
- `zinc-800` (input/borda/hover) → cinza claro
- `zinc-100/200` (texto primário, hoje claro) → quase preto
- `zinc-400/500` (texto secundário/muted) → cinza médio legível sobre claro

Assim as 404 classes existentes **continuam iguais no código** e ficam corretas nos dois
temas automaticamente. O modo **escuro não muda nada** (usa os valores padrão do Tailwind).

Cores de marca e status (`orange-*`, `emerald-*`, `red-*`, `blue-*`, `amber-*`, `violet-*`,
`sky-*`, `yellow-*`), `text-white` em botões, e overlays `bg-black/60` funcionam bem nos dois
temas e **não mudam** (ajuste pontual só se algum contraste ficar ruim no claro).

## Componentes

1. **CSS (`src/index.css`):**
   - Sobrescrita da escala `zinc` sob `:root[data-theme="light"]` com valores claros
     (escala invertida). Modo escuro = padrão do Tailwind, sem override.
   - `html/body/#root`: trocar o `background-color: #09090b` fixo por
     `var(--color-zinc-950)` (que já vira claro no tema claro).

2. **Hook `useTema` (`src/hooks/useTema.ts`):** lê o tema salvo no localStorage (default
   `'dark'`), aplica `document.documentElement.dataset.theme = tema` no mount e a cada
   troca, e expõe `{ tema, alternar }`. Persiste em `localStorage['tema']`.

3. **Botão no header (`components/Layout.tsx` e `LayoutAdmin.tsx`):** ícone sol/lua
   (lucide `Sun`/`Moon`) ao lado do sino de notificação; ao clicar, `alternar()`.
   `aria-label` descritivo. Aplicado nos dois layouts (painel do restaurante e do super
   admin) pra o tema valer no app inteiro.
   - Telas sem Layout (Login, Cadastro, cardápio público, telas de senha): herdam o tema
     via `data-theme` no `<html>` (o hook roda no App/раiz), então também respeitam a
     escolha. O botão em si fica nos Layouts autenticados; as telas públicas seguem o
     último tema salvo (default escuro).

4. **Aplicar o tema cedo:** um pequeno script/efeito na raiz (`main.tsx` ou `App.tsx`)
   aplica `data-theme` do localStorage antes/na primeira renderização, evitando "flash"
   do tema errado.

## Fora de escopo

- Não trocar os 404 usos de `zinc` por tokens semânticos (a inversão da escala resolve).
- Não mudar o visual do modo escuro (fica idêntico ao de hoje).
- Não adicionar "seguir o sistema do aparelho" (decisão do usuário: só manual + salvo).

## Verificação

Sem testes automatizados de cor (é visual). Verificação ao vivo no navegador, nos **dois
temas**, nas telas principais: Login, Dashboard, Mesas (grade + detalhe + modais), Cozinha
(Kanban), Caixa (fluxo de recebimento), Cardápio, Configurações. Conferir legibilidade de
texto, contraste de bordas/cards, e o laranja/status. Ajustar pontualmente os poucos casos
que ficarem ruins no claro (ex.: um `text-white` sobre fundo que virou claro, um `bg-black`
solto). Confirmar que a escolha persiste no reload e que o escuro segue idêntico ao atual.
