# Ambiente de homologação (staging)

**Data:** 2026-07-19
**Status:** aprovado pelo usuário (design validado em conversa)

## Problema

Hoje só existe um ambiente: produção. Toda mudança que chega na `main` vai direto pro ar
(Railway roda `prisma migrate deploy` automático a cada push, Vercel faz deploy automático do
frontend). Com 3 pessoas trabalhando no projeto agora (dono + 2 colaboradores recém-adicionados
na org Eleva-Consulting), não existe onde testar uma mudança antes dela virar produção de
verdade — e a única proteção contra push indevido na `main` hoje é convenção documentada no
`CLAUDE.md` (a org está no plano GitHub Free, que não permite branch protection técnica em repo
privado).

O usuário quer um ambiente de homologação separado, sempre no ar, pra validar mudanças antes de
liberar pra produção.

## Abordagem: reaproveitar os recursos nativos do Railway e da Vercel

Em vez de montar infraestrutura nova, usar o que as duas plataformas já oferecem pra isso:

- **Railway** tem o conceito nativo de **Environments** dentro de um mesmo projeto — cada
  ambiente roda sua própria cópia de cada serviço (backend + Postgres), com variáveis de
  ambiente e dados isolados, sob o mesmo projeto/billing. É o padrão recomendado pela própria
  plataforma pra staging, em vez de criar um projeto Railway inteiramente separado.
- **Vercel** já gera automaticamente um Preview Deployment pra qualquer push numa branch que não
  seja a de produção. Basta a branch `staging` existir e ter um domínio customizado atribuído
  (branch domain) pra virar uma URL estável de homologação, sem depender de nenhum recurso pago
  extra.

Isso mantém tudo dentro das mesmas duas plataformas que o time já usa e já sabe operar.

## Fluxo de branch e PR

Duas etapas de validação:

1. **Feature → `staging`**: `git checkout -b feat/xyz` → PR contra `staging` → CI
   (`.github/workflows/ci.yml`) verde → merge. O merge em `staging` dispara o deploy automático
   no ambiente de homologação (Railway + Vercel). O time testa manualmente na URL de staging.
2. **`staging` → `main`**: depois de validado em homologação, abre-se um PR de `staging` pra
   `main` → CI verde de novo → merge → vai pra produção.

Isso substitui a regra formalizada em 2026-07-19 no `CLAUDE.md` ("toda feature branch mira a
`main`") por: **toda feature branch mira `staging`; `main` só recebe merge vindo de `staging`**.
O `CLAUDE.md` precisa ser atualizado como parte da implementação desta iniciativa.

Continua valendo sem trava técnica (mesma limitação de plano Free do GitHub já documentada) —
é convenção do time nos dois estágios, não bloqueio do GitHub.

## Ambiente Railway (`staging`)

- Novo Environment `staging` dentro do projeto Railway existente (`glorious-playfulness`),
  com seu próprio serviço de backend (deploy a partir da branch `staging` do repo) e seu próprio
  banco Postgres — completamente isolado do Environment `production` (variáveis de ambiente
  próprias, banco de dados próprio).
- Migrations rodam automaticamente a cada deploy, igual produção (`npx prisma migrate deploy`,
  já embutido no script `start`).
- **Seed roda só na criação inicial do banco de staging**, não a cada deploy (senão duplicaria
  dados de teste toda vez). Resetar os dados de teste vira uma ação manual quando o time quiser
  (`railway run --environment staging npx prisma db seed`).
- Variáveis de ambiente de staging espelham as de produção (`JWT_SECRET`, `FRONTEND_URL` etc.),
  exceto onde a Seção de integrações externas abaixo pede algo diferente.

## Ambiente Vercel (`staging`)

- A branch `staging` do repo gera Preview Deployments automáticos no Vercel (comportamento
  padrão, sem configuração extra).
- Um domínio customizado é atribuído especificamente à branch `staging` (branch domain), pra
  gerar uma URL estável (ex: `staging.comanda-ia.com`, domínio exato a definir na
  implementação) em vez de uma URL de preview que muda a cada deploy.
- `VITE_API_URL` do ambiente de staging do Vercel aponta pra URL do backend de staging gerada
  pelo Railway.

## Dados de teste e isolamento das integrações externas

- **WhatsApp (Baileys)**: nenhuma sessão conectada no ambiente de staging (sem escanear QR
  code). O código já trata a sessão de WhatsApp como opcional/best-effort por estabelecimento —
  sem sessão, simplesmente não envia nada, sem quebrar o resto do fluxo.
- **Resend (email)**: `RESEND_API_KEY` própria de staging (conta/chave separada da de produção,
  plano free do Resend é suficiente) — emails de teste não se misturam com envio real de
  produção.
- **Cloudflare R2 (fotos)**: bucket separado (`comanda-ia-fotos-staging`) — upload de foto de
  teste não polui as fotos reais dos estabelecimentos em produção.
- **Mercado Pago**: nenhuma configuração extra necessária. A conexão OAuth é feita por
  estabelecimento; como os dados de staging vêm só do seed (nenhum estabelecimento real
  conectado), o Pix via Mercado Pago simplesmente não aparece no checkout de staging —
  isolamento automático.

## Custo

Ambiente adicional no Railway (backend + Postgres de staging) soma um custo de uso mensal
recorrente, além do que já é pago hoje em produção — o usuário aprovou seguir com esse custo
adicional, a dimensão exata é confirmada durante a implementação (Railway cobra por uso real de
compute/storage, não por ambiente em si). Vercel não deve adicionar custo (Preview Deployments
já fazem parte do plano atual).

## Fora do escopo

- Preview deployment por Pull Request (efêmero, um por PR) — descartado em favor de um único
  ambiente fixo de staging, mais simples de manter e suficiente pro tamanho do time atual.
- Cópia/anonimização periódica de dados de produção pra staging — descartado em favor de seed
  fixo sintético, mais simples e sem risco de vazamento de dado real de cliente.
- Branch protection técnica em `staging` ou `main` — segue de fora por limitação de plano do
  GitHub (já documentado), não faz parte desta iniciativa.
