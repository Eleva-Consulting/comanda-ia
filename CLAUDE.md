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
R2_PUBLIC_URL=...
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

## Log de mudanças

> Registrar aqui um resumo de cada sessão de trabalho (mais recente no topo), com base nos commits feitos (`git log`) e no que ainda estiver em andamento sem commit. Objetivo: consultar rapidamente "o que foi feito" sem precisar vasculhar o histórico do git.

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

**Decisão-chave da spec:** módulos habilitáveis por estabelecimento
(`Estabelecimento.modulosAtivos: String[]`, mesmo padrão de `Usuario.permissoes`) — mesas e estoque
avançado são add-ons pagos que não mudam nada pra quem não usa (ex: a galeteria, que é só
balcão/delivery).

**Fases 2-5 da spec original** (numeração própria da spec, diferente das sub-fases 1a-1f acima):
Fase 2 (papéis `mesas`/`caixa` + tela de Caixa + senha de supervisor generalizada) **já foi
entregue** — saiu de graça dentro da Fase 1e. Restam: Fase 3 (pagamento via gateway,
`TransacaoAdquirente`/Adapter, primeiro provedor PagBank), Fase 4 (estoque avançado —
ficha técnica/CMV), Fase 5 (relatórios avançados + auditoria completa/dashboards/exportação).
Todas visão futura já desenhada no documento — não implementar sem revisitar a spec primeiro.

## Próximas features planejadas

1. **Mercado Pago** — PIX real no checkout (substituir exibição de chave manual) — spec e plano já
   escritos em `docs/superpowers/specs/2026-07-03-mercado-pago-checkout-design.md` e
   `docs/superpowers/plans/2026-07-03-mercado-pago-checkout.md`, implementação ainda não começou
2. **Painel de avaliações** — ver média de estrelas e comentários no Dashboard
3. **Relatórios avançados** — exportar histórico em CSV, filtro por período
4. **QR Code** — gerar QR no link do cardápio para imprimir e colocar na mesa
5. **Multi-unidades** — um DONO com vários estabelecimentos sob a mesma conta
