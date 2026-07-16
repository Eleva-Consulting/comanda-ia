# comanda-ia — Contexto para Claude Code

## O que é esse projeto

SaaS multi-tenant para food service. Restaurantes recebem pedidos via link público
enviado por WhatsApp. O cliente abre no celular, monta o carrinho e envia. O pedido
aparece na cozinha em tempo real via Socket.IO.

## Stack

**Backend:** Node.js 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL
**Frontend:** React 19 + Vite 7 + Tailwind v4 + React Router 7 + lucide-react + recharts
**Deploy:** Railway (backend + postgres) + Vercel (frontend)
**Repo:** github.com/viniciusalvestech/comanda-ia

## Estrutura do projeto

```
comanda-ia/
├── src/                    # Backend
│   ├── routes/             # Fastify routes
│   │   ├── auth.ts         # signup + login + redefinir-senha
│   │   ├── admin.ts        # rotas exclusivas SUPER_ADMIN
│   │   ├── cardapio.ts     # CRUD cardápio + categorias + fotos (R2)
│   │   ├── pedidos.ts      # CRUD pedidos (autenticado)
│   │   ├── publico.ts      # cardápio + pedido + avaliar (sem auth)
│   │   ├── estabelecimentos.ts  # dashboard + meu-estabelecimento
│   │   ├── operadores.ts   # CRUD operadores + permissões
│   │   └── push.ts         # Web Push: subscribe/unsubscribe/vapid-key
│   ├── plugins/
│   │   └── auth.ts         # middlewares: autenticar + apenasAdmin
│   ├── mailer.ts           # Resend HTTP API (Railway bloqueia SMTP)
│   ├── push.ts             # web-push / VAPID helper
│   ├── evolution.ts        # Evolution API WhatsApp helper
│   ├── r2.ts               # Cloudflare R2 upload/delete
│   ├── database.ts         # Prisma client
│   ├── socket.ts           # Socket.IO (transporte WebSocket apenas — Railway bloqueia XHR polling)
│   └── server.ts           # buildServer()
├── prisma/
│   ├── schema.prisma       # modelos e enums
│   ├── seed.ts             # dados de teste
│   └── migrations/         # histórico de migrations
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Cadastro.tsx
│       │   ├── AguardandoAprovacao.tsx
│       │   ├── Dashboard.tsx       # KPIs + BarChart vendas 30 dias (recharts)
│       │   ├── Cozinha.tsx
│       │   ├── Cardapio.tsx        # CRUD itens + categorias + fotos + estoque
│       │   ├── CardapioPublico.tsx # cardápio público + checkout + avaliação
│       │   ├── Configuracoes.tsx   # dados, chave PIX, taxa entrega, Evolution API
│       │   ├── Operadores.tsx      # CRUD operadores + permissões por checkbox
│       │   ├── Historico.tsx
│       │   ├── DefinirSenha.tsx    # define senha via link do email (primeiro acesso)
│       │   ├── EsqueciSenha.tsx
│       │   ├── RedefinirSenha.tsx
│       │   └── admin/
│       │       ├── AdminDashboard.tsx
│       │       └── AdminEstabelecimentos.tsx
│       ├── components/
│       │   ├── Layout.tsx          # painel do restaurante (inclui botão push bell)
│       │   ├── LayoutAdmin.tsx     # painel super admin
│       │   ├── RotaProtegida.tsx   # guard: qualquer autenticado
│       │   ├── RotaAdmin.tsx       # guard: apenas SUPER_ADMIN
│       │   └── RotaPermissao.tsx   # guard: DONO passa sempre, OPERADOR verifica permissão
│       ├── hooks/
│       │   ├── useSocket.ts        # Socket.IO (WebSocket only)
│       │   └── usePush.ts          # Web Push: ativar/desativar notificações
│       └── lib/
│           ├── api.ts              # API_URL centralizado
│           ├── auth.ts             # decodifica JWT no frontend
│           └── permissoes.ts       # lista de permissões + helpers getPermissoes/temPermissao
└── CLAUDE.md               # este arquivo
```

## Arquitetura multi-tenant

- Cada estabelecimento é um tenant com `id` único
- `estabelecimentoId` está em todo registro do banco
- JWT carrega `{ userId, estabelecimentoId, role, permissoes }` — injetado em toda query
- SUPER_ADMIN tem `estabelecimentoId: null` — não pertence a nenhum tenant

## Roles e acesso

```
SUPER_ADMIN  → /admin/* — gerencia a plataforma inteira
DONO         → /dashboard, /cozinha, /cardapio, /historico, /configuracoes, /operadores
OPERADOR     → acesso restrito por permissões configuráveis no painel
```

Permissões disponíveis para OPERADOR: `cozinha`, `cardapio`, `historico`, `pedido_manual`, `configuracoes`

## StatusEstabelecimento

```
pendente  → recém cadastrado, aguarda aprovação do Super Admin
ativo     → operando normalmente
suspenso  → bloqueado
```

Fluxo novo estabelecimento via Admin: Super Admin cria → email com link para DONO definir senha → DONO acessa e cria senha → status ativo

## Features implementadas

- **Autenticação completa** — signup/login, reset de senha por email, definir senha (primeiro acesso via link)
- **Cardápio** — CRUD itens + categorias + fotos (Cloudflare R2) + controle de estoque
- **Pedidos** — cardápio público, checkout, taxa de entrega configurável, avaliação (1-5 estrelas) após confirmação
- **Cozinha** — lista de pedidos em tempo real via Socket.IO, atualização de status
- **Notificações** — toast em tela + beep ao receber pedido; Web Push (bell no header); email via Resend; WhatsApp via Evolution API (opcional)
- **Analytics** — KPIs no dashboard + gráfico de barras (recharts) com faturamento dos últimos 30 dias
- **Operadores** — CRUD com permissões granulares configuráveis por checkbox; guards de rota no frontend
- **Super Admin** — painel para aprovar/suspender estabelecimentos, criar novos com email de convite

## Credenciais de teste

```
Super Admin:  admin@comanda-ia.dev   / superadmin123
Galeteria:    vinicius@teste.com     / senhaforte123  (ativo)
Pizzaria:     carlos@teste.com       / outrasenha123  (ativo)
Hamburgueria: joao@teste.com         / teste123456    (pendente)
```

Galeteria id fixo: `5619f2a5-dbc2-4dfc-ab38-6c537eada941`

## Como rodar localmente

```bash
# Backend
docker compose up -d
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Padrões que usamos

- **Arquivos completos** — nunca entregar trechos parciais, sempre o arquivo inteiro
- **TypeScript strict** — sem `any` implícito, sem `@ts-ignore`
- **Mobile first** — Tailwind sem prefixo = mobile, `sm:` = desktop
- **min-h-dvh** em vez de `min-h-screen` para viewport mobile correto
- **Non-null assertion** (`!`) em `estabelecimentoId` nas rotas de tenant — seguro pois SUPER_ADMIN nunca chega nessas rotas
- **Commits descritivos** — `feat:`, `fix:`, `docs:` no padrão conventional commits
- **Fire-and-forget** para operações secundárias (email, push, WhatsApp) — nunca bloqueiam o response HTTP
- **Socket.IO transports: ['websocket']** — Railway bloqueia XHR long-polling; nunca usar polling
- **Resend** para emails — Railway bloqueia SMTP (portas 465 e 587); nunca usar nodemailer com SMTP

## Metodologia de trabalho e skills do Claude Code

> Este projeto é desenvolvido com Claude Code usando um fluxo específico (plugins de skills +
> agentes). Se você é um colaborador novo, instale os plugins abaixo pra o seu Claude operar do
> mesmo jeito que o resto do time.

### Setup dos plugins

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers

/plugin marketplace add WorldFlowAI/everything-claude-code
/plugin install everything-claude-code
```

- **superpowers** (marketplace oficial da Anthropic) — dá o fluxo de trabalho (skills de processo:
  brainstorming, planos, TDD, revisão, etc.)
- **everything-claude-code** — dá os agentes especializados (planner, code-reviewer, tdd-guide etc.)
  e skills complementares de padrões de código (backend/frontend patterns, security-review)

### Fluxo de trabalho (feature nova ou mudança não-trivial)

Sempre nessa ordem, cada etapa é uma skill do superpowers:

1. **brainstorming** — explorar intenção/requisitos e desenhar a abordagem com o usuário antes de
   decidir qualquer coisa
2. **writing-plans** — spec de design em `docs/superpowers/specs/` e plano de implementação em
   `docs/superpowers/plans/`, escritos e aprovados pelo usuário antes de tocar em código
3. **subagent-driven-development** — o plano é quebrado em tarefas menores, cada uma executada por
   um subagente isolado, com o controller revisando o resultado de cada tarefa antes de seguir pra
   próxima
4. **test-driven-development** — dentro de cada tarefa: teste primeiro (RED) → implementação mínima
   pra passar (GREEN) → refactor
5. **requesting-code-review** — revisão final de todo o branch (não só da última tarefa) antes de
   mesclar
6. **verification-before-completion** — nunca declarar algo como "funcionando" ou "corrigido" sem
   antes rodar a verificação (teste, build, ou checagem manual) e ver o resultado
7. **finishing-a-development-branch** — ao final, decidir merge direto / PR / descarte de forma
   estruturada, não só sair commitando

Outras skills do superpowers usadas quando o caso pede: **systematic-debugging** (investigar bug
antes de propor fix), **using-git-worktrees** (isolar trabalho paralelo), **dispatching-parallel-agents**
(tarefas independentes em paralelo).

Esse é o fluxo usado em toda a iniciativa do Módulo de Mesas (ver `docs/superpowers/specs/` e
`docs/superpowers/plans/` — cada fase tem spec+plano próprios, e o histórico de "Log de mudanças"
abaixo registra o que cada subagente/revisão encontrou).

### Agentes usados

| Agente | Quando usar |
|---|---|
| `planner` | Planejamento de features complexas / refactors |
| `architect` | Decisões de arquitetura / design de sistema |
| `tdd-guide` | Toda feature nova ou bugfix — força escrever teste antes |
| `code-reviewer` | Sempre logo após escrever/alterar código |
| `security-reviewer` | Antes de commit em código que mexe com auth, input de usuário, secrets |
| `build-error-resolver` | Quando o build quebra ou dá erro de tipo |
| `e2e-runner` | Testes de fluxo crítico com Playwright |
| `refactor-cleaner` | Limpeza de código morto/duplicado |
| `doc-updater` | Atualizar codemaps/documentação |

### Padrões de código

- **Imutabilidade** — nunca mutar objeto/array recebido, sempre retornar cópia nova (`{...obj, campo}`)
- **Arquivos pequenos e focados** — 200-400 linhas típico, 800 no máximo; organizar por
  feature/domínio, não por tipo
- **Funções pequenas** (<50 linhas), sem aninhamento profundo (>4 níveis)
- **Erros sempre tratados** — try/catch com mensagem clara pro usuário, nunca engolir silenciosamente
- **Validação de input com zod** em toda rota que recebe dado de fora
- **TypeScript strict** — sem `any` implícito, sem `@ts-ignore`
- **Sem `console.log`** em código commitado

### Testes

- Cobertura mínima de **80%**, cobrindo unit + integration + E2E (Playwright)
- **TDD obrigatório**: teste falhando (RED) → implementação mínima (GREEN) → refactor
- Se um teste falha: investigar a implementação primeiro — só mexer no teste se ele estiver
  genuinamente errado

### Git / commits / PRs

- Commits no padrão conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`,
  `perf:`, `ci:`
- Só commitar/pushar quando a tarefa estiver verificada (build/testes passando) — não é preciso
  perguntar timing de commit a cada vez, mas sempre confirmar que passou antes de declarar pronto
- Ao abrir PR: analisar o histórico completo de commits do branch (não só o último), gerar o diff
  com `git diff [base]...HEAD`, escrever plano de teste com checklist
- **REGRA: `git pull` sempre antes de `git push`** — o projeto é trabalhado por mais de uma pessoa
  em paralelo (ex: alguém na Fase 2 do Módulo de Mesas enquanto outro está na Fase 3). Pushar sem
  puxar antes cria divergência entre local e remoto e pode sobrescrever/quebrar trabalho do outro
  no deploy. Antes de qualquer `git push`: rodar `git pull` (ou `git pull --rebase` se o repo local
  tiver commits ainda não enviados) e resolver qualquer conflito localmente antes de pushar. Nunca
  usar `git push --force` em branch compartilhada (`main`) sem confirmar com o time antes.

## Trabalho em equipe

> Regras obrigatórias porque o projeto passou a ser trabalhado por mais de uma pessoa (e mais de um
> Claude Code) em paralelo. Válidas pra qualquer sessão, independente de quem está operando.

- **Migration do Prisma é o ponto mais perigoso em paralelo.** Antes de mexer em `schema.prisma`,
  avisar o time. Depois de mesclar/puxar mudanças do `main`, rodar `npx prisma migrate dev` de novo
  localmente antes de continuar, pra garantir que a migration gerada é consistente com o que já
  existe (evita duas migrations concorrentes brigando pela mesma tabela).
- **Nunca dois `git push` pro `main` ao mesmo tempo.** Como o Railway roda `prisma migrate deploy`
  automático a cada push, um segundo push chegando no meio do deploy do primeiro pode rodar contra
  schema intermediário. Confirmar no log do Railway que o deploy anterior terminou antes do próximo
  push que tenha migration nova.
- **Fases do Módulo de Mesas (`docs/superpowers/specs/` e `docs/superpowers/plans/`) foram
  desenhadas sequenciais** (1a→1b→1c→1d→...). Antes de paralelizar duas fases entre pessoas
  diferentes, checar se a fase de trás depende de schema/rota que a de frente ainda não tem — combinar
  isso explicitamente, não só confiar no `git pull` pra resolver.
- **Eventos do Socket.IO são contrato implícito entre back e front.** Mudança em payload de evento
  existente (`item-comanda:novo`, `conta:atualizada` etc.) pode quebrar quem está em outro branch
  esperando o formato antigo. Preferir mudança aditiva (campo novo opcional) a alterar formato
  existente.
- **Segredos (`.env`) nunca vão pro git.** R2, Resend, VAPID, `DATABASE_URL` do Railway — compartilhar
  entre o time por canal seguro (gerenciador de senhas), nunca em texto puro por chat.
- **Atualizar o "Log de mudanças" deste arquivo ao final de cada sessão de trabalho**, com resumo do
  que foi feito (baseado em `git log` + o que ficou em andamento). É a forma de qualquer pessoa (ou
  Claude) do time saber rapidamente "o que já foi feito" sem vasculhar o histórico do zero.
- **Preferir branch por feature + PR** em vez de commitar direto no `main`, quando o trabalho for em
  paralelo com outra pessoa mexendo em área relacionada (ex: mesas/produção) — revisão via PR pega
  conflito de lógica antes do merge, não só conflito de texto do git.

## Variáveis de ambiente

**Backend (.env / Railway):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
FRONTEND_URL=https://comanda-ia.vercel.app,https://www.comanda-ia.com
NODE_ENV=production
RESEND_API_KEY=re_...              # emails (Resend)
VAPID_PUBLIC_KEY=...               # Web Push
VAPID_PRIVATE_KEY=...              # Web Push
R2_ENDPOINT=...                    # Cloudflare R2 (fotos)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=comanda-ia-fotos
R2_PUBLIC_URL=...                  # Cloudflare R2 (fotos)
MP_CLIENT_ID=...                   # Mercado Pago — OAuth (split de pagamentos)
MP_CLIENT_SECRET=...               # Mercado Pago — OAuth
MP_REDIRECT_URI=...                # Mercado Pago — URL de callback OAuth
```

**Frontend (frontend/.env.local):**
```
VITE_API_URL=http://localhost:3000
```

**Produção:**
- Backend: Railway (DATABASE_URL gerado automaticamente pelo serviço Postgres do Railway)
- Frontend: Vercel (VITE_API_URL aponta pro Railway)
- Migrations novas rodam sozinhas: o release process do Railway já executa `npx prisma migrate deploy`
  automaticamente antes de subir o servidor a cada deploy (confirmado nos logs do container na Fase 1d)
  — não precisa rodar manual no console. Se quiser confirmar/forçar manualmente mesmo assim (ex: pra
  debugar), usar `DATABASE_URL=<DATABASE_PUBLIC_URL do serviço Postgres> npx prisma migrate deploy`
  local, apontando pro proxy público do Postgres do Railway.
- Deploy manual Railway: `railway up --detach` (auto-deploy às vezes falha)

## Migração do repositório pra organização do GitHub (pendente, nada executado ainda)

> Intenção do usuário (levantada em 2026-07-15): mover `comanda-ia` da conta pessoal
> `github.com/viniciusalvestech` pra uma organização. **Só foi feita investigação (`gh api`),
> nenhuma ação de transferência foi executada.**

**Pendência a resolver antes de continuar:** o usuário se referiu à org como "Eleva", mas a
checagem via `gh api user/orgs` mostrou que a organização da qual ele é membro é
`Eleva-Consulting` — um login diferente. `gh api orgs/Eleva` também respondeu (login `eleva`,
name "Eleva"), mas isso pode ser só o perfil público de uma org que não é dele. **Confirmar o
login exato da organização de destino antes de transferir** (`gh org list` ou conferir em
github.com/settings/organizations logado).

**Impactos identificados de transferir um repo privado pra uma org (avaliar antes de executar):**
- **Integrações Railway/Vercel podem quebrar.** Os dois usam GitHub App instalado por
  conta/org — se o app não estiver autorizado na org de destino, o deploy automático some até
  reconectar. Plano seguro: autorizar o GitHub App do Railway e da Vercel na org **antes** de
  transferir, e validar um deploy de teste logo depois.
- **URL do repo muda** de `github.com/viniciusalvestech/comanda-ia` pra
  `github.com/<org>/comanda-ia`. O GitHub redireciona a URL antiga automaticamente por um tempo,
  mas o ideal é todo mundo do time rodar `git remote set-url origin <nova-url>` depois.
- **Plano da organização importa.** Org no plano Free tem limitações em repo privado (ex:
  proteção de branch/PR obrigatório) que a conta pessoal do usuário pode já ter de graça — checar
  o plano da org antes de depender de alguma feature específica de PR/branch protection.
- **Colaboradores precisam ser adicionados de novo** — acesso dado direto no repo pessoal não
  migra automaticamente pra permissão de time da org; melhor oportunidade pra organizar por Teams.
- Transferência em si é rápida e não derruba o repo, mas o **risco real está na reconexão do
  deploy** — por isso não fazer isso "de qualquer jeito" sem plano, dado que produção depende de
  push automático.

## Log de mudanças

> Registrar aqui um resumo de cada sessão de trabalho (mais recente no topo), com base nos commits feitos (`git log`) e no que ainda estiver em andamento sem commit. Objetivo: consultar rapidamente "o que foi feito" sem precisar vasculhar o histórico do git.

### 2026-07-16 (continuação 2)
- **Spec da Cozinha unificada + Fase 0 implementada.** Brainstorm estratégico com o usuário
  sobre a duplicidade Cozinha (`Pedido`) x Produção (`ItemComanda`): com módulo mesas ativo
  a Cozinha fica morta; a galeteria nunca ganha Kanban; e canais vão conviver (mesas +
  link/bot no mesmo estabelecimento — pedidos do link cairiam numa tela que ninguém olha).
  Visão aprovada em `docs/superpowers/specs/2026-07-16-cozinha-unificada-design.md`: uma
  única tela de produção **chamada "Cozinha"** (decisão explícita do usuário), Kanban com
  cards de rodada e de pedido lado a lado, **paridade total com a Cozinha atual como
  requisito inegociável** (tabela de inventário na spec), acesso `cozinha` OU `producao`
  (garçom só com `mesas` segue sem ver), tela deixa de exigir módulo mesas. Rollout em
  fases 0-3, cada uma com plano próprio antes de codar — **Fases 1-3 ainda não começaram**.
  - **Fase 0 (entregue):** KPI "Pedidos (hoje)" do Dashboard agora conta também as rodadas
    enviadas no dia (`RodadaComanda.criadaEm`, via relação, sem campo novo), com quebra
    "delivery/balcão X · mesas Y (rodadas)" no card — resolve "faturamento aparece mas
    pedido não" pra quem usa mesas. Payload aditivo `estatisticas.totalRodadas`; ticket
    médio segue só sobre `Pedido`.

### 2026-07-16 (continuação)
- **Tela de Caixa reescrita — fluxo guiado "Receber pagamento"** (spec:
  `docs/superpowers/specs/2026-07-16-caixa-redesign-design.md`). Motivada por 3 problemas
  reais: "Dividir por comanda" tinha nome errado (a ação real é pagar a comanda inteira);
  clicar no nome da comanda registrava um pagamento confirmado NA HORA, sem revisão nem
  confirmação (única ação financeira do sistema sem etapa de confirmação); e a forma de
  pagamento era escolhida no topo, longe da ação (default PIX silencioso pra tudo).
  Brainstorm com o visual companion do superpowers (mockups no navegador): usuário escolheu
  repensar a tela inteira e, entre 3 estruturas, o fluxo guiado. **Princípio central: nenhum
  pagamento é registrado sem passar pela revisão + botão "Confirmar R$ X em <forma>".**
  - 4 telas: conta (leitura + "Receber pagamento" + desconto/estorno/fechar) → "O que está
    sendo pago?" (conta toda / **Pagamento por comanda** / itens específicos / dividir
    igualmente / valor livre) → revisão (itens, total, forma escolhida AQUI, QR code Pix já
    com o valor certo) → saldo zerado (estado verde, "Fechar conta e liberar a mesa").
  - Dividir igualmente virou parcelas encadeadas ("Parcela 1 de N" → confirma → "Parcela 2
    de N" automática), cada uma com forma própria, valor recalculado sobre o saldo real —
    corrige defeito da tela antiga em que o "Registrar 1 parcela" clicado N vezes calculava
    errado a partir da 2ª (recalculava saldo/N com o saldo já menor).
  - Comanda já paga aparece desabilitada "✓ já pago" na escolha (antes sumia).
  - "Conta toda" com desconto ativo paga por valor (saldo devedor); sem desconto paga por
    itens (mantém vínculo `PagamentoItem`).
  - 100% frontend (backend intocado). `Caixa.tsx` (647 linhas) dividida em 7 arquivos por
    responsabilidade em `frontend/src/components/caixa/` (tipos, ResumoTotais,
    ComandasLeitura, ReceberPagamento, PagamentosRegistrados, FormDesconto).
  - Verificado ao vivo no navegador (extensão Chrome): pagamento por comanda em dinheiro,
    parcelas 2x com Pix + cartão de crédito encadeando certo (78+78 fechou os 156 exatos),
    bloqueio de fechamento com item em produção aparecendo na tela nova, fechamento
    liberando a mesa. Estorno/desconto portados sem mudança de lógica; itens específicos e
    valor livre passam pelo mesmo caminho de confirmação verificado.

### 2026-07-16
- **Impressão da rodada movida do garçom pra Produção + permissão `producao` + Dashboard
  com vendas de Mesas + trava de fechamento** — quatro correções/ajustes do módulo de Mesas
  levantados pelo usuário em uso real, no mesmo request (spec:
  `docs/superpowers/specs/2026-07-16-impressao-producao-permissao-dashboard-design.md`, plano:
  `docs/superpowers/plans/2026-07-16-impressao-producao-permissao-dashboard.md`).
  - **Impressão automática da rodada agora dispara na tela de Produção**, não mais no aparelho
    do garçom ao enviar o pedido (`Mesas.tsx` perdeu a impressão por completo — decisão
    explícita: garçom só vê, não imprime). `Producao.tsx` imprime ao receber
    `producao:item-novo` com `rodadaId`, com dedupe por rodada (`useRef<Set>`) porque a rodada
    chega como N eventos, um por item. Cada aba aberta de Produção imprime (mesmo comportamento
    da Cozinha — aceito).
  - **Nova permissão de operador `producao`, separada de `mesas`** — garçom só com `mesas` não
    vê nem acessa a tela de Produção (e portanto nunca recebe disparo de impressão).
    `GET /producao/itens` e `PATCH /rodadas/:id/avancar` exigem `producao`;
    `PATCH /itens-comanda/:id/status` e `GET /rodadas/:id` aceitam `mesas` OU `producao`
    (cancelar item existe nas duas telas; a leitura da rodada alimenta a impressão) — sem helper
    novo, `temPermissao` já era variádico/OR. **Sem backfill (decisão do usuário): depois do
    deploy, o DONO precisa marcar `producao` nos operadores que trabalham na Produção**, senão
    eles perdem o acesso; operador editado precisa deslogar/logar pra pegar o JWT novo.
  - **Dashboard passou a somar venda do módulo de Mesas** — `Pagamento` com status `confirmado`
    registrado no dia (dinheiro que entrou no Caixa; estorno sai da soma sozinho), no mesmo
    recorte de calendário de Brasília. Card de faturamento mostra a quebra "delivery/balcão ·
    mesas" (só quando houve venda de mesa no dia). Ticket médio continua só sobre `Pedido`.
    Tela Financeiro segue só com `Pedido` (escopo deliberado, de novo).
  - **Fechar conta agora exige todos os itens entregues** — `POST /contas/:id/fechar` responde
    422 se houver `ItemComanda` fora de `entregue`/`cancelado` (antes dava pra fechar o caixa
    com pedido ainda em produção). `Caixa.tsx` já exibia o erro do backend, sem mudança de front.
  - Verificação: vitest (67 testes) + tsc (back e front) verdes; fluxo completo verificado ao
    vivo via API local (14 checagens: guards por papel, trava de fechamento, pagamento →
    dashboard → fechamento). **Impressão física não foi testada por automação** (diálogo de
    impressão do navegador trava a extensão) — testar no ambiente real: enviar rodada pela tela
    de Mesas com uma aba de Produção aberta em outro aparelho.

### 2026-07-15
- **Rodadas de pedido na comanda (Mesas) — feature completa, fora da numeração das fases do
  Módulo de Mesas.** Motivada por três pontos reais levantados pelo usuário no mesmo request:
  (1) o modal de adicionar item na comanda mandava cada item pro backend na hora, um por clique
  — sem noção de "pedido" agrupado; (2) não existia impressão nenhuma pro módulo de Mesas
  (delivery/balcão já imprimem automaticamente há tempos); (3) não dava pra avançar vários itens
  de uma vez no Kanban de Produção. Passou pelo processo completo do projeto: brainstorm (3
  perguntas de escopo) → spec (`docs/superpowers/specs/2026-07-13-rodada-pedidos-mesas-design.md`)
  → plano (`docs/superpowers/plans/2026-07-13-rodada-pedidos-mesas.md`) → subagent-driven-development
  (8 tasks + revisão final de todo o branch).
  - Novo model `RodadaComanda` agrupa um lote de `ItemComanda` enviados juntos (migration sem
    backfill — itens antigos ficam com `rodadaId: null` e continuam funcionando como antes).
  - `Mesas.tsx`: o modal de adicionar item virou carrinho — o garçom seleciona vários itens,
    ajusta quantidade, e só ao clicar "Enviar pedido" tudo vai pro backend numa chamada só
    (`POST /comandas/:id/rodadas`, transação única). A rota antiga de item avulso
    (`POST /comandas/:id/itens`) foi removida (só a Mesas.tsx chamava).
  - Impressão automática da rodada ao enviar (`ImprimirRodada.tsx`, mesmo padrão já usado no
    balcão/delivery).
  - Kanban de Produção agrupa os itens da mesma rodada num card só, com avanço em lote
    (`PATCH /rodadas/:id/avancar` — sem status-alvo no body, cada item avança pro seu próprio
    próximo estágio) **respeitando o isolamento por setor** já existente (operador só avança
    itens do próprio setor dentro da rodada) — verificado ao vivo com dois operadores de setores
    diferentes.
  - **Simplificação em relação à spec original:** em vez de inventar eventos de socket novos
    (`rodada:nova`), reaproveita 100% os eventos por item que já existiam
    (`item-comanda:novo`/`atualizado`, `producao:item-novo`/`atualizado`) — o agrupamento visual
    da rodada acontece inteiramente no frontend via `item.rodadaId`, sem precisar de payload novo.
  - Achados de revisão corrigidos antes do merge: (1) Task 4 usava `Promise.all` disparando
    criações concorrentes dentro de uma transação interativa do Prisma — anti-padrão documentado
    pela própria Prisma; corrigido pra sequencial. (2) Task 7 tinha o aviso de itens descartados
    (indisponíveis entre montar o carrinho e enviar) completamente invisível — o carrinho era
    limpo no mesmo trecho que setava o erro, e o JSX do erro só renderizava com carrinho não-vazio;
    corrigido, e a mensagem passou a mostrar nome do item em vez de UUID cru. (3) Na revisão final
    de todo o branch: se o operador avançasse só um item de uma rodada multi-item via "(só este)",
    a rodada "dividia" entre colunas do Kanban, e cada fragmento continuava mostrando "Avançar
    rodada" — um clique num card mostrando só 1 de 2 itens podia avançar silenciosamente o outro
    item, nem visível ali; corrigido escondendo o botão de lote enquanto a rodada estiver dividida
    (só os botões individuais ficam disponíveis até ela voltar a ficar sincronizada).
  - Achado de processo (mais uma vez nesta iniciativa): a Task 8 foi interrompida no meio por
    limite de sessão de API do subagente, deixando dados de teste órfãos (mesas, operadores, setor
    e item de cardápio de teste, uma conta ainda aberta) e o módulo `mesas` ainda habilitado no
    estabelecimento de teste — limpo pelo controller antes de retomar com um subagente novo.
  - Limitação conhecida, não resolvida nesta feature (fora do pedido original): continua não
    existindo nenhuma UI no Cardápio pra vincular um item a um Setor — ver entrada de
    `960da53` abaixo.

### 2026-07-13
- **Renomear mesa + tempo real na Produção pra itens sem setor (`960da53`).** Duas correções
  do módulo de Mesas, achadas em uso real: (1) não havia como editar uma mesa depois de
  cadastrada — se o dono digitasse "Mesa 1" no campo número (confusão razoável, já que o
  cabeçalho de Mesas/Caixa sempre prefixa "Mesa " antes do número), o resultado virava
  "Mesa Mesa 1" em todo lugar, sem jeito de corrigir. Agora cada mesa da grade tem um ícone de
  lápis que abre "Editar mesa" (reaproveita o `PATCH /mesas/:id`, que já existia sem UI).
  (2) Tempo real na tela de Produção não funcionava — causa raiz: **não existe nenhuma forma,
  hoje, de vincular um item do Cardápio a um Setor** (o campo `ItemCardapio.setorId` nunca é
  setado por nenhuma rota/tela), então todo item real sempre tem `setorId: null`; o código que
  emite os eventos de produção só disparava `if (item.setorId)`, ou seja, nunca disparava de
  verdade — a tela só atualizava com F5 manual. Corrigido removendo essa guarda nos 3 pontos
  (novo item, status, transferência); `salaProducao()` já lidava certo com `setorId` nulo (cai
  na sala ampla do estabelecimento), só faltava não pular o emit. **Limitação que continua**: a
  separação da Produção por setor (ex: Bar x Cozinha) continua sem uso real enquanto não existir
  uma tela pra vincular item→setor no Cardápio — fica como possível próximo passo, não construído
  ainda (fora do pedido original, que era só "tempo real não funciona").
- **Nav do header reorganizada — parava de caber e sobrepunha os ícones (`a8cd006`).** Com
  todos os módulos ativos (Mesas + Caixa + Estoque avançado) o DONO chegava a ter 13 links
  numa única linha `flex` sem quebra nem rolagem — os últimos itens (Configurações e às vezes
  os próprios ícones de notificação/sair) saíam da viewport ou ficavam cobertos, dependendo da
  largura da tela. Reorganizada em nav orientada por dados: itens operacionais de uso frequente
  (Home, Mesas, Produção, Caixa, Cozinha, Cardápio) sempre visíveis; itens de gestão/back-office
  (Estoque, Resultados, Operadores, Auditoria, Financeiro, Histórico, Configurações) agrupados
  num dropdown "Mais" (destaca em laranja quando a rota ativa está dentro dele). Nav mobile
  (scroll horizontal) sem mudança de comportamento, só passou a reaproveitar os mesmos arrays de
  itens em vez de duplicar todo o JSX entre desktop/mobile. Reproduzido e verificado ao vivo no
  navegador habilitando todos os módulos temporariamente na galeteria de teste.
  **Complementado (`df9fe7f`)** com passe de acessibilidade/toque: Escape fecha o dropdown "Mais"
  (além de clique fora), `aria-haspopup`/`aria-expanded`/`role=menu` no menu, `aria-label` nos
  botões de notificação e sair, e alvo de toque da nav mobile e dos botões de ícone aumentado pra
  ~44px (nav desktop continua compacta, pensada pra mouse).
- **Botão "Cadastrar mesa" na tela de Mesas (`907b3bd`).** A tela de Mesas dizia "Cadastre em
  Configurações" mas Configurações nunca teve essa UI — o backend já expunha `POST /mesas` desde
  a Fase 1b (numero/área/capacidade), só faltava um jeito de chamá-lo. Botão + modal adicionados
  direto na tela de Mesas, visível só pra quem tem a permissão `configuracoes` (mesma que o
  endpoint já exige — DONO sempre vê, operador só se tiver essa permissão). Testado ao vivo no
  navegador: cadastro de mesa nova, erro 409 de número duplicado exibido corretamente.
- **Dashboard com filtro de período + tela Financeiro mesclados no main (`d61e2ae`) e em
  produção.** O "Faturamento total" do Dashboard era, na verdade, a soma de tudo desde sempre
  (sem filtro de data nenhum) — confundia o dono tentando ver "quanto vendi hoje". Agora o
  Dashboard tem um filtro de período reutilizável (Hoje/7 dias/30 dias/Este mês + intervalo
  customizado), com "Hoje" como padrão; KPIs de faturamento/pedidos/ticket médio passam a
  respeitar o período selecionado, "Em andamento" continua sempre ao vivo (nunca filtrado, é o
  estado atual da cozinha). Novo card "Dias que mais venderam" (top 5 do período). Nova tela
  `/financeiro` (só DONO, mesmo padrão da Auditoria) com a quebra do faturamento por forma de
  pagamento (Pix, Dinheiro, Cartão Crédito/Débito). Corrigido de brinde um bug pré-existente de
  timezone: o agrupamento de vendas por dia usava `toISOString()` (UTC bruto), o que podia
  contar um pedido feito à noite em Brasília no dia seguinte — agora usa o calendário de
  `America/Sao_Paulo` de verdade. Escopo deliberado: só `Pedido` (delivery/balcão/link
  público) — módulo de Mesas fica de fora por agora. Implementado via
  subagent-driven-development (6 tasks + revisão final). Achado de processo (2ª vez nesta
  iniciativa): o subagente da Task 1 commitou por engano na `main` do checkout principal —
  pego pela revisão da tarefa, confirmado sem impacto (nunca chegou no `origin/main`), corrigido
  com reset + cherry-pick no worktree correto. Achado de UX real (Task 5, depois propagado
  também pra Financeiro.tsx na revisão final): o spinner de carregamento cobria a página inteira
  a cada troca de período, fazendo o filtro desmontar e perder o destaque do preset ativo (dados
  sempre corretos, só o indicador visual resetava) — corrigido em 1 linha nas duas telas,
  verificado ao vivo no navegador.
- **Pedido de balcão ganhou "Pix (maquininha)" como forma de pagamento (`799f2c2`).** Cliente às
  vezes paga Pix na maquininha física do próprio estabelecimento, não pelo checkout online — até
  então isso travava o pedido (tentava criar uma cobrança real via Mercado Pago, bloqueando se
  não conectado, ou ficando preso "aguardando pagamento" pra sempre se conectado, já que o
  pagamento real acontece fora do sistema). Novo valor no enum `FormaPagamento`,
  `pix_maquininha`, se comporta como dinheiro/cartão — registro simples, pedido direto pra
  cozinha. Escopo: pedido manual/balcão e Caixa/Mesas; checkout público não ganhou essa opção
  (não tem "maquininha física" numa compra remota).
- **⚠️ Flag temporária desliga a exigência de Mercado Pago pra Pix em toda a plataforma
  (`9f8a32e`).** Decisão do usuário enquanto ajusta processos internos — `Pix` (checkout público
  e balcão) virou só um registro simples em todos os estabelecimentos, sem cobrança real nem
  confirmação automática, até ser reativado. Controlado por
  `EXIGIR_MERCADO_PAGO_PARA_PIX` em `src/mercadopago.ts`, hoje `false`. Reverter: só mudar essa
  flag pra `true`, nenhum outro código muda — o resto da integração (webhook, confirmação
  automática) continua intacto por baixo. **Não confundir com bug se Pix não confirmar
  automaticamente enquanto essa flag estiver assim.**

### 2026-07-11 (continuação)
- **Checkout com Mercado Pago mesclado no main e em produção (`324d081`) — credenciais reais
  configuradas e fluxo testado de ponta a ponta.** Reconciliação com o trabalho paralelo do
  Estoque Avançado (Fase 4a) feita manualmente (merge com conflitos reais em
  `CardapioPublico.tsx`/`publico.ts`/`pedidos.ts`, resolvidos preservando a lógica dos dois
  lados). A revisão final da branch (opus) encontrou um bug Crítico: o webhook comparava
  `pagamento.externalReference` (UUID descartável, nunca persistido no Pedido) com `pedido.id`
  — comparação sempre falsa, então **nenhum pagamento Pix jamais seria confirmado**. Corrigido
  removendo a comparação (o lookup por `mpPaymentId` já identifica o pedido com segurança), além
  de uma race de idempotência (retries do MP podiam duplicar notificações — agora `updateMany`
  condicional) e um vazamento de privilégio no `state` do OAuth (assinava a sessão real do
  usuário com o segredo padrão do app — agora usa chave de assinatura separada). Depois do
  merge: usuário criou a aplicação real no Mercado Pago Developers (Checkout Transparente, API
  de Pagamentos, setor "Serviços de TI"), configurou `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/
  `MP_REDIRECT_URI` no Railway, e testou um Pix real de ponta a ponta — achado real na primeira
  tentativa: **faltava configurar o Webhook na aplicação do Mercado Pago** (URL de notificação
  nunca cadastrada), então o pagamento confirmava no MP mas o backend nunca era avisado; corrigido
  configurando a URL de produção (`/webhooks/mercadopago`) + evento "Pagamentos (legacy)" no
  painel do MP. Confirmado depois: pedido chega na Cozinha, WhatsApp de confirmação ao cliente
  funciona (quando há telefone). Um fix adicional pequeno: o webhook passou a mandar também a
  mensagem padrão "💰 Pagamento confirmado!" (mesma usada pelas outras transições de status),
  além do resumo detalhado, mantendo consistência entre os dois fluxos.
- **Bot do WhatsApp personaliza o link do cardápio com o telefone do cliente** — quando um
  cliente manda mensagem pro bot do estabelecimento, o link do cardápio que ele recebe agora
  carrega `?telefone=...` (o número já é conhecido, vem do remetente da própria mensagem
  recebida via Baileys), pré-preenchendo o campo de telefone no checkout público (continua
  editável e opcional). Resolve parcialmente o problema de clientes não preencherem telefone no
  checkout — só funciona pra quem chega pelo bot (link genérico/QR code continua sem essa
  informação, limitação de privacidade do próprio WhatsApp, não contornável). Junto, atualizadas
  as mensagens do bot que ainda falavam em "envie o comprovante" (fluxo manual obsoleto agora que
  o Pix confirma sozinho via Mercado Pago) e removido código morto (`handleComprovante` +
  validação de comprovante por IA via Claude Haiku, nunca chamados). Implementado via
  subagent-driven-development (3 tasks + revisão final). Achado de processo na Task 2: o
  subagente implementador commitou por engano na `main` do checkout principal (não no worktree),
  a partir de um ponto anterior à Task 1 — o diff descartava silenciosamente as mudanças da
  Task 1. Pego pela revisão da tarefa, confirmado que nunca foi enviado pro `origin/main` (sem
  impacto em produção), corrigido pelo controller via reset da `main` local + cherry-pick do
  código correto em cima da Task 1. Revisão final da branch (opus) confirmou nenhum resíduo do
  incidente e aprovou sem ressalvas.

### 2026-07-10
- **Estoque avançado — Fase 4a mesclada no main e em produção** — módulo `estoque_avancado`
  (flag já existia desde a Fase 1a, sem uso). Brainstorming descartou ficha técnica por prato
  (achado real do usuário: prato preparado tipo baião não pode "descozinhar" se o pedido for
  cancelado, diferente de item revendável tal como está, ex. bebida lacrada) em favor de um
  modelo manual: `Insumo` (cadastro simples com unidade/custo/estoque) + `MovimentacaoEstoque`
  (ledger append-only: entrada/perda/ajuste/consumo_diario) + lançamento diário de consumo,
  cruzado com faturamento confirmado do dia (`Pedido` não cancelado + `Pagamento` confirmado)
  pra calcular lucro real. Nova permissão `estoque`, telas `/insumos` e `/estoque`. Spec e
  plano em `docs/superpowers/specs/2026-07-08-estoque-avancado-fase4a-design.md` e
  `docs/superpowers/plans/2026-07-08-estoque-avancado-fase4a.md`. Achados pós-implementação
  (testados pelo usuário e corrigidos na hora): faltava validação de estoque insuficiente
  (dava pra registrar consumo/perda maior que o disponível, inclusive negativo); `GET
  /cardapio` devolvia `preco` como string (bug pré-existente, não desta fase) que só virou
  problema visível quando a feature de acompanhamento (abaixo) passou a somar valores com
  `+`; valores monetários/quantidade formatados com 4 casas decimais em vez de moeda BRL.
- **Acompanhamento configurável por categoria, com preço adicional** — qualquer categoria do
  cardápio pode ter uma lista de opções de acompanhamento (ex: categoria "PF" → Baião, Arroz,
  Baião Cremoso), cada uma com preço adicional próprio (ex: +R$3,00). Desenho genérico por
  categoria (não hardcoded pra uma categoria "PF" específica), decidido em brainstorming com o
  usuário. `Categoria.opcoesAcompanhamento` (Json), `ItemPedido.acompanhamento` e
  `ItemComanda.acompanhamento` (snapshot da escolha). Validado e com preço aplicado nas 3
  origens de pedido (cardápio público, pedido manual/balcão, mesas) via utilitário
  compartilhado `src/utils/acompanhamento.ts`; exibido na Produção (Kanban), comanda impressa
  e Histórico, pra cozinha saber o que preparar. Cardápio público precisou de um pequeno
  redesenho do modelo de carrinho (de `itemId → quantidade` pra suportar múltiplas variantes
  do mesmo item com acompanhamentos diferentes no mesmo pedido).
- **Merge com o trabalho em paralelo do QR code Pix** (`ad38d16`) — sem conflito de lógica,
  só duas partes diferentes do `schema.prisma` mudando ao mesmo tempo (o campo `cidade` e as
  tabelas novas de estoque). Sobrou um drift pequeno pós-merge (`opcoesAcompanhamento` sem
  `NOT NULL` no banco — a migration manual da conversão pra Json não reafirmou a constraint),
  corrigido com uma migration adicional antes do push.
- **Checkout com Mercado Pago — Pix com split de pagamentos** — implementação completa do fluxo de integração OAuth com Mercado Pago, habilitando cada estabelecimento a receber pagamentos diretamente em sua própria conta. Pix real criado no checkout público e pedido manual do balcão; confirmação automática via webhook (sempre reconsulta API do MP, nunca confia no payload isolado). QR code estático Pix + polling no checkout do cliente. Correção de segurança: fluxo de comprovante por foto do WhatsApp (`handleComprovante`), código morto mas protegido contra manipulação. Implementado em 11 tarefas via subagent-driven-development + revisão final. **Integração de ponta a ponta depende de credenciais reais:** criar app no Mercado Pago (developers.mercadopago.com, tipo "Marketplace/Plataforma") e configurar `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_REDIRECT_URI` em `.env`/Railway — sem isso, fluxo OAuth e pagamento não funcionam, embora todo código esteja pronto e testado conforme possível sem credenciais reais.
- **Merge com o trabalho em paralelo do Estoque Avançado/Acompanhamento** (`c4df9d9`) — este
  branch (Mercado Pago) e o de Estoque Avançado tocaram os mesmos dois arquivos
  (`src/routes/publico.ts`, `src/routes/pedidos.ts`) na lógica de criação de pedido, além do
  `schema.prisma`. `schema.prisma` e `server.ts` mesclaram sozinhos sem conflito (modelos/campos
  disjuntos). Conflito real em 3 arquivos: duas linhas de import adjacentes em `publico.ts`/
  `pedidos.ts` (resolvido mantendo os dois imports) e um conflito de verdade em
  `CardapioPublico.tsx` — o Estoque Avançado redesenhou o modelo do carrinho (de
  `itemId → quantidade` pra `Record<chave, {itemId, acompanhamento, quantidade}>`) bem no meio
  de onde este branch adicionava `handleSucessoPedido`; resolvido preservando o novo modelo de
  carrinho do Estoque Avançado e a lógica de sucesso do checkout (limpar carrinho + desviar pra
  tela de QR Pix) deste branch, lado a lado. `npm test` (50 testes, 7 arquivos) e
  `tsc --noEmit` (backend e frontend) conferidos depois do merge, sem regressão.

### 2026-07-09
- **QR code Pix na tela de Caixa mesclado no main (`ae81a2a`) e em produção** — gera um QR
  code de Pix estático (BR Code, padrão Banco Central) localmente, sem gateway/webhook/conta
  em provedor, usando a chave Pix + cidade que o estabelecimento já cadastra. Surgiu de uma
  conversa sobre integração com maquininha que revelou que o usuário não queria travar num
  fornecedor específico — essa feature entrega o que realmente faltava (mostrar QR na mesa,
  confirmação ainda manual) sem esse trade-off. 5 tarefas via subagent-driven-development +
  revisão final (opus), que pegou 1 bug Importante (função de geração do payload TLV podia
  corromper silenciosamente o código pra chaves Pix muito longas — agora lança erro tratado
  como 400). Migration (`Estabelecimento.cidade`) aplicada automaticamente. Ver detalhes
  completos na seção do roadmap do Módulo de Mesas acima.

### 2026-07-08
- **Módulo de Mesas — Fase 1f mesclada no main (`1bb1c60`) e em produção** — auditoria básica:
  finalmente construiu cancelar item pronto/entregue com senha de supervisor (bloqueado desde
  a Fase 1b), auditoria de cancelamento e transferência de item em `LogAuditoria`, guarda
  contra cancelar item já pago, tela `/auditoria` (DONO). 7 tarefas via
  subagent-driven-development + revisão final de todo o branch (opus) + 1 commit de correção
  pós-revisão (rota de cancelamento não checava `conta.status`; guarda de item pago só cobre
  pagamento vinculado a item específico, não valor livre — aceito como limitação conhecida).
  Sem migration nova. Ver detalhes completos na seção da Fase 1f do roadmap acima.

### 2026-07-03
- **Pedido de balcão sem status pro cliente + impressão automática configurável** — `Pedido.origem` (`balcao`/`publico`) distingue pedido manual do painel vs via link público. Balcão deixa de mandar WhatsApp de status (delivery e retirada via link continuam mandando normal). Botão liga/desliga na Cozinha controla se pedido de balcão imprime sozinho (delivery/retirada via link sempre imprimem).
- **Reabrir pedido concluído/cancelado** — DONO define uma senha em Configurações; qualquer operador com permissão de Cozinha pode reabrir um pedido `entregue`/`cancelado` digitando essa senha (entregue volta pra "em preparo", cancelado volta pra "recebido"). Botão fica no Histórico.
- **Cardápio público em grade responsiva** — 2 colunas no celular, 3-4 no desktop, ao invés de lista vertical.
- **Busca por nome** no cardápio público e nos modais de pedido manual/adicionar item na Cozinha.
- **Nome do cliente opcional** no pedido manual (balcão) — usa "Cliente" como padrão quando em branco.
- **Fonte maior na comanda impressa** — base 12px → 15px, título e total 14px → 18px.

### 2026-07-06
- **Módulo de Mesas — Fase 1a implementada e em produção (`fdaed53`)** — schema Prisma completo (Mesa, Setor, Conta, Comanda, ItemComanda, ItemComandaRateio, Pagamento, PagamentoItem, LogAuditoria), migration com backfill de setor padrão, módulos habilitáveis por estabelecimento (`Estabelecimento.modulosAtivos`) com toggle no Super Admin, permissões `mesas`/`caixa` no backend. Implementado via subagent-driven-development (7 tarefas + 1 correção pós-revisão final: `DELETE /admin/estabelecimentos` quebrava por causa das novas FKs `RESTRICT`). Primeira infraestrutura de teste automatizado do projeto (Vitest). Migration já rodada em produção via Railway, verificado sem quebra pros estabelecimentos reais existentes.
- **Módulo de Mesas — Fase 1b mesclada no main (`30c88c8`) e em produção** — backend completo de Mesas/Contas/Comandas: middleware `moduloAtivo` (a Fase 1a só tinha o toggle, faltava a rota de fato bloquear quem não contratou), CRUD de Setor (base, sem exigir módulo) e Mesa (exige módulo), abrir mesa (Conta + Comanda "Geral" automática), criar/renomear comanda, adicionar item (com snapshot de setor), avançar status de produção (bloqueando cancelamento pós-pronto, que exige senha de supervisor ainda não construída), transferir item entre comandas. 9 tarefas via subagent-driven-development + 2 correções pós-revisão: uma corrida real (duas Contas abertas na mesma mesa, corrigida com índice único parcial no Postgres + tratamento do erro de constraint) e uma inconsistência de serialização (Decimal vs Number). Migration do índice único já rodada em produção via Railway.

### 2026-07-07 (continuação)
- **Módulo de Mesas — Fase 1e mesclada no main (`c3db6b3`) e em produção** — tela de Caixa
  (`/caixa`, nova permissão `caixa`): fechar conta dividindo por comanda/igualmente/itens
  específicos/valor livre, desconto e estorno de pagamento com senha de supervisor (reusa
  `senhaReabrirPedido`), primeira escrita real em `LogAuditoria`. 11 tarefas via
  subagent-driven-development + revisão final de todo o branch (opus) + 2 correções
  Importantes pós-revisão (loop de redirecionamento em `RotaPermissao.tsx` pra operador só
  com `caixa`; estorno podia derrubar a request com 500 numa corrida rara de mesa reaberta).
  Migration (`Conta.descontoValor`/`descontoMotivo`) aplicada automaticamente pelo Railway.
  Ver detalhes completos na seção da Fase 1e do roadmap acima.

### 2026-07-07
- **Módulo de Mesas — Fase 1c mesclada no main (`896ec49`) e enviada pro GitHub** — primeira tela do módulo: link "Mesas" no menu (permissão + módulo ativo, checagens independentes), grade de mesas por status, abrir mesa e ver comandas/itens, modal de adicionar item, criar/renomear comanda, transferir item entre comandas, cancelar mesa, tudo com atualização em tempo real via Socket.IO. 8 tarefas via subagent-driven-development + revisão final de todo o branch (aprovada sem ressalvas bloqueantes). Sem migration nova (fase 100% frontend). Achados: um bug real de serialização (`preco` chega como string do backend, não number — corrigido na Task 4) e duas quebras de infraestrutura de subagente sem relação com o código (Task 7 caiu por erro de rede com o código já correto; Tasks 6/7/8 não tinham acesso à extensão do Chrome no ambiente do subagente, então a verificação visual/tempo-real foi completada pelo controller diretamente).
- **Módulo de Mesas — Fase 1d mesclada no main (`d11fcf9`) e em produção** — Kanban de produção multi-setor: `Usuario.setorId` (operador fixo num setor, opcional), `GET /producao/itens` filtrado por setor do usuário logado (DONO/sem setor vê tudo), salas de Socket.IO por setor (opt-in via `contexto: 'producao'` na conexão — só a tela nova usa, resto do app continua na sala ampla de sempre), tela `/producao` com 3 colunas e cronômetro colorido por `tempoAlvoMinutos`. 10 tarefas via subagent-driven-development + revisão final de todo o branch. Migration aplicada automaticamente pelo Railway no deploy (confirmado: o release process já roda `prisma migrate deploy` antes de subir o servidor — não precisei rodar manual dessa vez). Achados: a spec do plano tinha um bug real (`Conta.mesa` assumido não-nulo, mas é `Mesa?` no schema) pego pelo implementador da Task 5; a verificação de isolamento entre setores (ponto mais arriscado da fase) foi feita manualmente com dois operadores de teste em abas separadas, confirmando que eventos de um setor não vazam pra conexões de outro setor.

### 2026-07-04
- **Remoção do Evolution API / Fly.io (`a14380c`)** — análise confirmou que `src/evolution.ts` e `evolution-fly/fly.toml` (trabalho em andamento da sessão de 2026-07-03, nunca commitado/deployado) não eram referenciados por nenhum código ativo. O WhatsApp do produto já roda inteiramente via bot próprio com Baileys (`src/whatsapp.ts`), com sessão persistida em `WhatsAppSession` no Postgres. Os campos `evolutionUrl`/`evolutionToken` continuam no schema/rota de estabelecimento por enquanto (não usados, remoção adiada para não mexer em migration agora). Também foi removido do Railway um serviço `evolution-api` (imagem `atendai/evolution-api`) que estava provisionado no mesmo projeto sem estar conectado ao backend.
- **Barra de controles da Cozinha redesenhada (`4fb75b8`)** — "Pausar/Reabrir" e o indicador de status de conexão (que mostravam a mesma informação duas vezes) viraram um único controle clicável; o toggle "Balcão: auto/manual" virou um botão compacto por ícone. Os dois ficam juntos numa pílula única, com "Novo pedido" isolado como ação primária — resolve o header ficando apertado/poluído com muito texto.

### 2026-07-02
- **Impressão automática da comanda + email fictício facilitado no operador** (`edf6997`) — comanda imprime sozinha ao chegar pedido novo na Cozinha; cadastro de operador ganha botão pra gerar email fictício automaticamente.
- **Email fictício do operador usa nome do estabelecimento como domínio** (`2822dbe`, `be7d9f6`) — formato `primeiro.ultimo@slug-do-estabelecimento.com`, sem sufixo aleatório nem travessão.
- **Telefone do cliente vira opcional no pedido** (`dc7dacd`) — no pedido manual e no checkout público; notificações WhatsApp (status, PIX) são puladas quando não há telefone.
- **Editar dados do operador e redefinir senha** (`5b79576`) — DONO corrige nome/email do operador e redefine senha direto, sem depender do fluxo de email.
- **Comanda impressa em negrito por padrão** (`d436580`) — melhora legibilidade em impressora térmica.
- **Aplicar permissões granulares do operador no backend** (`6693137`) — antes só existiam dois níveis de acesso (autenticado ou DONO); adiciona middleware `temPermissao()` aplicado por rota (cardápio, pedido manual, configurações, WhatsApp). Pausar/retomar pedido vira endpoint próprio pra não exigir permissão "configuracoes".
- **Editar itens de um pedido já criado** (`c3e4141`) — adicionar/ajustar quantidade/remover item direto no card da Cozinha, sem cancelar o pedido inteiro.
- **Mostrar links de navegação conforme permissão do operador** (`9f92b54`) — menu (Cardápio, Histórico, Configurações) agora aparece quando o operador tem a permissão, mesmo sem ser DONO.
- **Taxa de entrega por bairro + endereço no pedido** (`079f9bc`) — bairros com taxa própria cadastrados em Configurações (opcional, em branco = grátis); checkout e pedido manual pedem bairro/endereço; aparece na comanda, histórico e dashboard.
- **Troco no pagamento em dinheiro, status por tipo de entrega, resumo do pedido** (`44437aa`) — indicar troco em pagamento dinheiro; retirada pula "saiu para entrega" (vai direto pra "retirado"); tela de confirmação com resumo completo passa a valer pra qualquer forma de pagamento (antes só PIX) e o resumo é enviado por WhatsApp em qualquer pedido.

## Iniciativa em andamento: Módulo de Mesas

> Se este chat foi reiniciado: leia primeiro `docs/superpowers/specs/2026-07-04-modulo-mesas-design.md`
> — tem toda a análise de negócio, problemas identificados, modelagem de domínio (Mesa/Conta/Comanda/
> Setor/Pagamento/Auditoria) e decisões já validadas com o usuário. Não repita o brainstorming, só
> continue da fase em andamento.

**Status:** dentro da Fase 1 (visão completa na spec), quebrada em sub-planos sequenciais menores:

1. [x] **Fase 1a — Fundação de dados** — `docs/superpowers/plans/2026-07-04-modulo-mesas-fase1.md`.
   Schema Prisma completo (Mesa, Setor, Conta, Comanda, ItemComanda, ItemComandaRateio, Pagamento,
   PagamentoItem, LogAuditoria), migration com backfill, módulos habilitáveis por estabelecimento,
   permissões `mesas`/`caixa` no backend. **Mesclado no main (`fdaed53`) e em produção** — migration
   já rodada no Railway, verificado sem quebra pros clientes existentes.
2. [x] **Fase 1b — Backend de Mesas/Contas/Comandas** — `docs/superpowers/plans/2026-07-06-modulo-mesas-fase1b.md`.
   Middleware `moduloAtivo` (checagem server-side do módulo contratado — a Fase 1a só tinha o
   toggle), máquina de estado `StatusProducao`, CRUD de Setor/Mesa, abrir mesa (Conta + Comanda
   "Geral" automática), criar/renomear comanda, adicionar/transferir item, mudar status de produção
   (com bloqueio de cancelamento pós-pronto). **Mesclado no main (`30c88c8`), enviado pro GitHub e em
   produção** — migration do índice único parcial em `contas.mesaId` (corrige uma corrida real de
   "duas contas abertas na mesma mesa") já rodada no Railway. Nenhuma tela nova nessa fase — tudo via
   API/curl.
3. [x] **Fase 1c — Tela do garçom (frontend)** — `docs/superpowers/plans/2026-07-06-modulo-mesas-fase1c.md`.
   Primeira UI do módulo: link "Mesas" no menu (permissão `mesas` **e** módulo ativo, checagens
   independentes), grade de mesas coloridas por status, abrir mesa/ver comandas e itens, modal de
   adicionar item, criar/renomear comanda, transferir item entre comandas, cancelar mesa, tudo em
   tempo real via Socket.IO (5 eventos: `conta:atualizada`, `comanda:criada`, `comanda:atualizada`,
   `item-comanda:novo`, `item-comanda:atualizado`). Implementado via subagent-driven-development
   (8 tarefas + revisão final de todo o branch). **Mesclado no main (`896ec49`) e enviado pro
   GitHub** — sem migration nova (fase 100% frontend, só chama rotas já existentes da Fase 1b).
   Vercel faz deploy automático no push. Achados de interesse: Task 4 pegou um bug real (backend
   retorna `preco` como string por serialização de Decimal, não number) e corrigiu; Task 7 teve um
   subagente que caiu por erro de rede no meio da verificação manual (o código já estava correto,
   controller terminou a verificação e commitou); Task 8 (tempo real) precisou de verificação manual
   com duas abas do navegador feita pelo controller, já que subagentes não têm acesso à extensão do
   Chrome nesse ambiente.
4. [x] **Fase 1d — Produção multi-setor (Kanban)** — `docs/superpowers/plans/2026-07-07-modulo-mesas-fase1d.md`.
   Tela de Kanban (Recebido/Em preparo/Pronto) com um card por item de `ItemComanda`, filtrada pelo
   setor fixo do operador logado (`Usuario.setorId`, novo — DONO e operador sem setor definido veem
   tudo). Tempo real via Socket.IO com salas por setor (`estabelecimentoId:setorId`), opt-in via
   `contexto: 'producao'` na conexão — só a tela nova usa isso, Layout/Cozinha/Mesas continuam na
   sala ampla de sempre, sem nenhuma mudança de comportamento. Cronômetro no card muda de cor
   passado o `tempoAlvoMinutos` do setor. **Não inclui** unificação com pedidos de balcão/delivery —
   ficou de fora do escopo (decisão explícita, feed unificado com `ItemPedido` é feature futura
   separada). Implementado via subagent-driven-development (10 tarefas + revisão final de todo o
   branch, aprovada sem ressalvas bloqueantes). **Mesclado no main (`d11fcf9`), enviado pro GitHub e
   em produção** — migration (`Usuario.setorId` + índice em `ItemComanda`) aplicada automaticamente
   pelo Railway no deploy (o release process já roda `prisma migrate deploy` antes de subir o
   servidor). Achados de interesse: a spec do plano tinha um bug real (assumia `Conta.mesa`
   não-nulo, mas é `Mesa?` no schema de verdade) — pego e corrigido pelo implementador da Task 5,
   reproduzido de forma independente pelo revisor; a verificação de isolamento entre setores (o
   ponto mais arriscado da fase) foi feita manualmente pelo controller com dois operadores de teste
   em abas separadas, confirmando que um operador do setor "Bar" não recebe eventos de itens do
   setor "Cozinha" em tempo real, e vice-versa recebe corretamente os do próprio setor.
5. [x] **Fase 1e — Fechamento de conta** — `docs/superpowers/plans/2026-07-07-modulo-mesas-fase1e.md`.
   Tela `/caixa` (nova permissão `caixa`, separada de `mesas`): fechar a conta de uma mesa
   dividindo por comanda, igualmente por N pessoas, por itens específicos, ou valor livre;
   aplicar desconto e estornar pagamento (ambos exigem a senha de supervisor já existente —
   `Estabelecimento.senhaReabrirPedido`, reusada por design) — primeira vez que o projeto
   escreve de fato em `LogAuditoria` (tabela existia desde a Fase 1a, nunca usada). Fechar só
   é permitido com saldo devedor zerado; estornar um pagamento numa conta já fechada reabre
   ela automaticamente se voltar a dever. **Fora do escopo, por decisão explícita:** rateio de
   item entre comandas (`ItemComandaRateio`, cenário "duas pessoas dividem uma pizza") fica pra
   uma fase futura; "baixa manual" (cenário G da spec) não precisou de rota própria — dá pra
   fazer aplicando um desconto igual ao saldo devedor, mesmo mecanismo com senha e auditoria.
   Implementado via subagent-driven-development (11 tarefas + revisão final de todo o branch).
   **Mesclado no main (`c3db6b3`), enviado pro GitHub e em produção** — migration
   (`Conta.descontoValor`/`descontoMotivo`, ambos nullable) aplicada automaticamente pelo
   Railway no deploy. Achados de interesse: a Task 3 pegou um bug real de tipagem — o código do
   plano passava `Decimal` do Prisma direto pra função pura de cálculo (que espera
   `number | string`), quebrando `tsc --noEmit` em modo estrito; corrigido com um adaptador
   isolado no arquivo novo, sem tocar a função pura da Task 2. A revisão final do branch (opus)
   encontrou dois problemas Importantes, ambos corrigidos antes do merge: (1) o mesmo loop de
   redirecionamento que o Login.tsx corrigia também existia em `RotaPermissao.tsx` — um
   operador só com `caixa` (sem `cozinha`) caía num loop ao navegar pra qualquer rota sem
   permissão, não só no login; resolvido centralizando a lógica em `lib/permissoes.ts`; (2)
   estornar um pagamento que reabriria uma conta fechada podia derrubar a request com 500 se a
   mesa da conta já tivesse sido reaberta com uma Conta nova nesse meio tempo (corrida rara,
   pega pelo índice único parcial) — corrigido com o mesmo padrão de tratamento de P2002 já
   usado em `POST /contas`.
6. [x] **Fase 1f — Auditoria básica** — `docs/superpowers/plans/2026-07-08-modulo-mesas-fase1f.md`.
   Finalmente construiu "cancelar item pronto/entregue com senha de supervisor" — feature
   bloqueada desde a Fase 1b com a mensagem literal "ainda não disponível nesta versão", que o
   comentário no código dizia estar esperando exatamente a senha de supervisor generalizada
   (entregue na Fase 1e). Cancelamento livre (antes de pronto) e transferência de item entre
   comandas passam a gravar em `LogAuditoria`. Nova guarda de integridade financeira (não
   pedida pela spec original, decisão de design desta fase): item já coberto por um
   `PagamentoItem` de pagamento confirmado não pode ser cancelado — força estornar primeiro.
   Botão "Cancelar item" novo tanto em Mesas.tsx (garçom) quanto Producao.tsx (cozinha/Kanban)
   — não existia nenhuma forma de cancelar um item individual até agora, só a mesa inteira.
   Nova tela `/auditoria` (DONO-only, via `apenasDono`) lista o log com filtro por data/ação.
   Implementado via subagent-driven-development (7 tarefas + revisão final de todo o branch).
   **Mesclado no main (`1bb1c60`), enviado pro GitHub e em produção** — sem migration nova
   (reaproveita a tabela `LogAuditoria` que já existia desde a Fase 1a, sem uso até a Fase 1e).
   Achados de interesse: a Task 1 pegou um bug real no próprio código do plano — um
   `LogAuditoria.create` usava a forma curta `usuarioId,` referenciando uma variável nunca
   declarada (o handler desestrutura `userId`, não `usuarioId`), corrigido pra
   `usuarioId: userId`. A revisão final do branch (opus) encontrou 2 problemas Importantes,
   ambos corrigidos antes do merge: (1) a rota de cancelamento nunca checava
   `conta.status` — dava pra cancelar item de uma conta já fechada/cancelada; corrigido com a
   mesma guarda de `aberta`/`aguardando_pagamento` que as rotas de pagamento já usam; (2) a
   guarda de "item já pago" só cobre pagamentos vinculados a itens específicos
   (`PagamentoItem`) — um pagamento em "valor livre" (divisão igual, por exemplo) não fica
   rastreado por item, então não bloqueia cancelamento por essa via. Aceito como limitação
   conhecida documentada em comentário (a guarda de `conta.status` já reduz bastante a janela
   real de risco); resolver de verdade exigiria redesenhar como pagamento em valor livre
   rastreia cobertura por item — fica pra uma fase futura se vira problema na prática.

7. [x] **QR code Pix na tela de Caixa (fora da numeração de fases)** —
   `docs/superpowers/plans/2026-07-09-pix-qrcode-caixa.md`. Surgiu de uma conversa sobre
   "Fase 3" (gateway de pagamento) que revelou que o usuário não queria integração de
   verdade com a maquininha (isso exigiria travar num fornecedor específico — PagBank, Stone
   etc. — com app Android nativo rodando dentro da maquininha, incompatível com "funcionar
   com qualquer maquininha"). O que realmente faltava era só: gerar um QR code de Pix
   estático ("BR Code"/"Pix Copia e Cola", padrão do Banco Central) usando a chave Pix que o
   estabelecimento já cadastra, pra mostrar na mesa sem precisar da maquininha — sem gateway,
   sem conta em nenhum provedor, sem confirmação automática (o garçom/caixa ainda confirma
   manualmente, exatamente como já fazia desde a Fase 1e). Novo campo
   `Estabelecimento.cidade` (exigido pelo padrão BR Code, junto da `chavePix` que já
   existia). Função pura `src/utils/pixBrCode.ts` gera o payload TLV+CRC16 localmente — é a
   primeira vez que o projeto gera um formato financeiro padronizado do zero, sem nenhum
   precedente no código pra copiar. Botão "Gerar QR code" novo na tela de Caixa,
   desacoplado do fluxo de registrar pagamento (só mostra o código, quem registra o
   pagamento em si continua sendo a mesma ação de sempre). Implementado via
   subagent-driven-development (5 tarefas + revisão final de todo o branch). **Mesclado no
   main (`ae81a2a`), enviado pro GitHub e em produção** — migration (`Estabelecimento.cidade`,
   nullable) aplicada automaticamente pelo Railway. Achados de interesse: a Task 2 pegou um
   bug real no teste do próprio plano (CRC16 recalculado com o campo `'6304'` duplicado,
   corrigido só no teste, sem tocar no algoritmo) — o revisor da tarefa rodou o código de
   verdade em Node e validou o CRC16 contra o vetor de teste padrão CRC-16/CCITT-FALSE
   ("123456789" → "29B1") pra confirmar. A revisão final do branch (opus) encontrou 1
   problema Importante: a função `tlv()` gerava um payload BR Code silenciosamente corrompido
   pra valores com 100+ caracteres (ex: uma chave Pix artificialmente longa) — corrigido pra
   lançar erro nesse caso, capturado pela rota e convertido num 400 limpo em vez de um 500
   não tratado.

**Decisão-chave da spec:** módulos habilitáveis por estabelecimento
(`Estabelecimento.modulosAtivos: String[]`, mesmo padrão de `Usuario.permissoes`) — mesas e estoque
avançado são add-ons pagos que não mudam nada pra quem não usa (ex: a galeteria, que é só
balcão/delivery).

**Fases 2-5 da spec original** (numeração própria da spec, diferente das sub-fases 1a-1f acima):
Fase 2 (papéis `mesas`/`caixa` + tela de Caixa + senha de supervisor generalizada) **já foi
entregue** — saiu de graça dentro da Fase 1e. Fase 3 (pagamento via gateway de verdade —
`TransacaoAdquirente`/Adapter, cobrança automática, webhook) **não vai ser construída como
originalmente desenhada** — decisão do usuário de não travar num fornecedor específico de
maquininha; o que essa fase realmente precisava (QR code de Pix + confirmação manual) já foi
entregue acima, fora da numeração. Se no futuro fizer sentido reabrir a integração de verdade
com maquininha, é uma escolha consciente de fornecedor único (app Android nativo), documentada
como trade-off explícito, não uma continuação natural da Fase 3 original. Fase 4 (estoque
avançado) também não foi construída como originalmente desenhada — o brainstorming da Fase 4a
(ver `docs/superpowers/specs/2026-07-08-estoque-avancado-fase4a-design.md`) descartou ficha
técnica por prato/CMV automático (complexidade real: prato preparado não pode "descozinhar" se
cancelado, diferente de item revendável tal como está) em favor de um modelo bem mais simples —
lançamento manual diário de consumo de insumo, cruzado com o faturamento confirmado do dia pra
calcular lucro real. Mesclada no main e em produção — ver entrada de 2026-07-10 no log abaixo.
Resta: Fase 5 (relatórios avançados + auditoria completa/dashboards/exportação). Visão futura já
desenhada no documento — não implementar sem revisitar a spec primeiro.

## Próximas features planejadas

1. **Relatórios avançados** — exportar histórico/financeiro em CSV (filtro por período já
   entregue em 2026-07-13, no Dashboard e na tela Financeiro)
2. **QR Code** — gerar QR no link do cardápio para imprimir e colocar na mesa
3. **Multi-unidades** — um DONO com vários estabelecimentos sob a mesma conta

> Painel de avaliações (média de estrelas + comentários no Dashboard) já estava entregue antes
> desta lista ser revisada — ver seção "Avaliações dos clientes" em `Dashboard.tsx`.
