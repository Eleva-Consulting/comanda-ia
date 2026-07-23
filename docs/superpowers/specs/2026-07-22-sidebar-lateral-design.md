# Sidebar lateral colapsável — painel do restaurante

> Primeiro baby step de uma iniciativa maior de modernizar o layout do sistema (UI corporativa,
> intuitiva, clean, moderna). Escopo desta spec: só a navegação do painel do restaurante
> (`Layout.tsx`, usado por DONO/OPERADOR). O painel Super Admin (`LayoutAdmin.tsx`) não muda nesta
> etapa.

## Problema

A nav hoje é um header horizontal fixo no topo, com itens principais + um dropdown "Mais" pra
itens secundários (Estoque, Operadores, Auditoria, Financeiro, Histórico, Configurações). Funciona,
mas não é o padrão visual que o usuário quer daqui pra frente — um SaaS corporativo típico usa
sidebar lateral.

## Decisões (validadas com o usuário via brainstorming + mockup visual)

1. **Escopo:** só `Layout.tsx` (painel restaurante). `LayoutAdmin.tsx` fica como está.
2. **Comportamento de ocultar:** a sidebar **colapsa pra uma faixa só de ícones** (nunca some
   100%) — expandida mostra ícone + label, colapsada mostra só ícone (com `title` nativo pra
   tooltip). Alternado por um botão (chevron) na borda da própria sidebar.
3. **Itens "Mais":** o dropdown desaparece. Os itens hoje divididos entre `itensPrincipais` e
   `itensSecundarios` continuam vindo dos mesmos dois arrays (mesma lógica de permissão/módulo),
   só que renderizados como duas seções empilhadas dentro da sidebar, cada uma com um título
   pequeno (`Operacional` / `Gestão`), sem dropdown.
4. **Persistência:** o estado expandida/colapsada é salvo em `localStorage`, mesmo padrão do
   `useTema` — abre a página do jeito que a pessoa deixou da última vez.
5. **Estrutura visual (mockup opção B):** vira um app-shell de duas colunas — sidebar de altura
   cheia à esquerda, e à direita uma coluna com uma **barra superior fina** (título/ação de
   página à esquerda — é onde o `headerExtra` de hoje, ex. botão "Novo pedido" da Cozinha,
   continua aparecendo — mais os ícones de tema/push/sair à direita, exatamente onde estão hoje)
   seguida da área de conteúdo rolável.
6. **Mobile inalterado:** essa mudança vale só a partir do breakpoint `sm:` (mesmo ponto de corte
   já usado no projeto). Abaixo disso, a nav mobile atual (header + scroll horizontal) continua
   idêntica, sem nenhuma alteração.

## Componentes afetados

- `frontend/src/components/Layout.tsx` — reescrito: sai o `<header>` horizontal com nav+dropdown,
  entra `<aside>` (sidebar) + topbar fina + conteúdo, mantendo toda a lógica existente de
  permissões/módulos, toasts de pedido novo, beep, push, tema e logout intactos.
- `frontend/src/hooks/useSidebarColapsada.ts` (novo) — hook isolado, mesmo padrão do
  `useTema.ts`: `useState` inicializado a partir do `localStorage['sidebarColapsada']`, persiste
  a cada mudança via `useEffect`, expõe `{ colapsada, alternar }`.

## Fora de escopo (explícito)

- `LayoutAdmin.tsx` (painel Super Admin) — sem mudança nesta etapa.
- Qualquer mudança de comportamento na nav mobile.
- Qualquer mudança de rota, permissão, backend ou schema — é puramente visual/estrutural no
  frontend.

## Teste manual (verificação)

- Expandir/colapsar a sidebar alterna entre ícone+label e só ícone, sem quebrar layout.
- Estado persiste após reload da página (F5).
- Todos os itens de nav que existem hoje (principais + antigos "Mais") continuam navegáveis e
  respeitando a mesma lógica de permissão/módulo (ex: operador sem `estoque` não vê Estoque).
- `headerExtra` da Cozinha (botão "Novo pedido", pausar loja) continua aparecendo na topbar.
- Nav mobile (viewport < `sm`) sem nenhuma mudança visual/funcional.
- Tema claro/escuro continua funcionando igual, com a sidebar respeitando as duas paletas.
