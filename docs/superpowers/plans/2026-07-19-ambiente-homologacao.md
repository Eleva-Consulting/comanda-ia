# Ambiente de Homologação (Staging) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um ambiente de homologação fixo e sempre-no-ar (staging) pro comanda-ia, isolado de produção em dados e integrações externas, com um fluxo de branch de duas etapas (feature → staging → main).

**Architecture:** Railway Environment novo (`staging`) dentro do projeto existente `glorious-playfulness`, com Postgres e backend próprios, deploy a partir da branch `staging`. Vercel gera Preview Deployment automático da mesma branch. Integrações externas (WhatsApp, Resend, R2, Mercado Pago) isoladas por ambiente.

**Tech Stack:** Railway CLI (`railway`, já autenticado), Vercel Dashboard, Cloudflare R2 Dashboard, Resend Dashboard, GitHub CLI (`gh`, já autenticado com escopo `admin:org`), git.

## Global Constraints

- Banco de staging nunca recebe dados reais de produção — só o seed sintético (`prisma/seed.ts`), rodado manualmente na criação do ambiente, não a cada deploy.
- Nenhuma integração externa real deve disparar efeito colateral em staging: sem sessão de WhatsApp conectada, `RESEND_API_KEY` própria de staging, bucket R2 próprio (`comanda-ia-fotos-staging`), sem `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_REDIRECT_URI` (confirmado no código — `src/mercadopago.ts` só lança erro se alguém *tentar* conectar OAuth, não no boot do servidor; sem essas envs o resto do sistema funciona normal).
- `JWT_SECRET` de staging deve ser **diferente** do de produção (token emitido em staging não pode validar contra produção).
- `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` podem ser os mesmos de produção (sem risco de abuso externo — é só o par de chaves do Web Push do próprio app).
- Toda mudança de código nesta implementação segue o fluxo já formalizado no `CLAUDE.md`: branch própria → PR → CI verde → merge. Como a branch `staging` ainda não existe, os PRs desta implementação miram `main` normalmente; a partir da conclusão desta iniciativa, PRs futuras passam a mirar `staging`.

---

### Task 1: Criar a branch `staging` e ensinar o CI a rodar nela também

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: branch `staging` publicada em `origin`, existente pra todas as tasks seguintes (Railway e Vercel vão apontar deploy pra ela).

- [ ] **Step 1: Criar a branch a partir da `main` atualizada**

```bash
git checkout main
git pull
git checkout -b staging
```

- [ ] **Step 2: Atualizar o gatilho do CI pra rodar em PRs contra `staging` também**

Editar `.github/workflows/ci.yml`, trocar:

```yaml
on:
  pull_request:
    branches: [main]
```

por:

```yaml
on:
  pull_request:
    branches: [main, staging]
```

- [ ] **Step 3: Verificar a mudança**

```bash
git diff .github/workflows/ci.yml
```

Esperado: só a linha `branches: [main]` → `branches: [main, staging]` mudou.

- [ ] **Step 4: Commitar e publicar a branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: roda pipeline também em PRs contra a branch staging"
git push -u origin staging
```

- [ ] **Step 5: Confirmar que a branch existe no remoto**

```bash
gh api repos/Eleva-Consulting/comanda-ia/branches/staging --jq '.name'
```

Esperado: `staging`

---

### Task 2: Criar bucket R2 de staging no Cloudflare

**Files:** nenhum (só infraestrutura — o valor gerado aqui alimenta a Task 5)

**Interfaces:**
- Produces: `R2_ACCOUNT_ID` (mesmo da produção), `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` novos (token escopado só pro bucket de staging), `R2_BUCKET_NAME=comanda-ia-fotos-staging`, `R2_PUBLIC_URL` do bucket novo — usados na Task 5.

- [ ] **Step 1: Abrir o painel do Cloudflare R2**

Navegar (browser, sessão já autenticada) até `https://dash.cloudflare.com/?to=/:account/r2/overview`. Se pedir escolher conta, usar a mesma conta onde já existe o bucket `comanda-ia-fotos` (produção).

- [ ] **Step 2: Criar o bucket de staging**

Clicar em "Create bucket", nome exato: `comanda-ia-fotos-staging`. Região: mesma da produção (Automatic, salvo se o bucket de produção tiver região fixa — nesse caso usar a mesma).

- [ ] **Step 3: Criar um token de API escopado só pro bucket novo**

Em R2 → "Manage R2 API Tokens" → "Create API Token". Nome: `comanda-ia-staging`. Permissão: "Object Read & Write". Escopo: "Apply to specific buckets only" → selecionar `comanda-ia-fotos-staging` (não dar acesso a `comanda-ia-fotos` de produção). Copiar o `Access Key ID` e o `Secret Access Key` gerados — eles só aparecem uma vez.

- [ ] **Step 4: Anotar o Account ID e montar a URL pública**

O "Account ID" aparece no canto direito da página do R2 — é o mesmo valor já usado em produção (`R2_ACCOUNT_ID`). Se o bucket de produção usa R2.dev público ou um domínio customizado pra `R2_PUBLIC_URL`, replicar o mesmo padrão pro bucket novo (em R2 → bucket `comanda-ia-fotos-staging` → Settings → "Public Access" → habilitar e copiar a URL pública gerada).

- [ ] **Step 5: Guardar os 5 valores pra Task 5**

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` (novo), `R2_SECRET_ACCESS_KEY` (novo), `R2_BUCKET_NAME=comanda-ia-fotos-staging`, `R2_PUBLIC_URL` (novo). Não colar esses valores em nenhum arquivo do repo — vão direto pra variável de ambiente do Railway na Task 5.

---

### Task 3: Criar API key do Resend pra staging

**Files:** nenhum (infraestrutura — alimenta a Task 5)

**Interfaces:**
- Produces: `RESEND_API_KEY` de staging, usada na Task 5.

- [ ] **Step 1: Abrir o painel do Resend**

Navegar até `https://resend.com/api-keys` (mesma conta usada em produção, ou criar uma conta free separada — decisão livre, plano free do Resend cobre o volume de testes de staging).

- [ ] **Step 2: Criar a chave**

"Create API Key" → nome `comanda-ia-staging` → permissão "Sending access" (não precisa de acesso admin/domain). Copiar a chave gerada (`re_...`) — só aparece uma vez.

- [ ] **Step 3: Guardar o valor pra Task 5**

`RESEND_API_KEY` (staging) — vai direto pra variável de ambiente do Railway na Task 5.

---

### Task 4: Criar o Environment `staging` no Railway com Postgres e backend vazios

**Files:** nenhum (infraestrutura)

**Interfaces:**
- Consumes: nada das tasks anteriores diretamente (independente).
- Produces: Environment `staging` no projeto Railway `glorious-playfulness` (id `801a3057-ad1d-4f7e-81b3-d1fd2bf9e191`), com serviço `Postgres` (banco vazio) e serviço `comanda-ia` (sem deploy ainda — só conectado à branch `staging`), consumidos nas Tasks 5 e 6.

- [ ] **Step 1: Confirmar que está linkado no projeto certo**

```bash
cd /Users/vinicius/comanda-ia
railway status --json | jq -r '.name, .id'
```

Esperado:
```
glorious-playfulness
801a3057-ad1d-4f7e-81b3-d1fd2bf9e191
```

- [ ] **Step 2: Criar o Environment `staging` vazio**

```bash
railway environment new staging --json
```

Esperado: JSON de sucesso com `"name": "staging"`. **Não usar `--duplicate production`** — isso copiaria as variáveis (incluindo segredos de produção) e potencialmente os dados do Postgres de produção, violando a regra de isolamento de dados.

- [ ] **Step 3: Trocar o Environment linkado localmente pra `staging`**

```bash
railway environment link staging
railway status --json | jq -r '.environments.edges[] | select(.node.name=="staging") | .node.isLinked'
```

Esperado: `true`

- [ ] **Step 4: Criar o Postgres de staging (banco vazio, sem clonar dados)**

```bash
railway add --database postgres --service Postgres --json
```

Esperado: JSON confirmando o serviço `Postgres` criado no environment `staging`.

- [ ] **Step 5: Criar o serviço de backend conectado à branch `staging`**

```bash
railway add --repo Eleva-Consulting/comanda-ia --branch staging --service comanda-ia --json
```

Esperado: JSON confirmando o serviço `comanda-ia` criado, com source `Eleva-Consulting/comanda-ia` na branch `staging`.

- [ ] **Step 6: Verificar os dois serviços no environment `staging`**

```bash
railway status --json | jq -r '.environments.edges[] | select(.node.name=="staging") | .node.serviceInstances.edges[].node.serviceName'
```

Esperado (em qualquer ordem):
```
Postgres
comanda-ia
```

---

### Task 5: Configurar variáveis de ambiente do backend de staging e gerar domínio

**Files:** nenhum (infraestrutura)

**Interfaces:**
- Consumes: valores de R2 da Task 2, `RESEND_API_KEY` da Task 3, serviços criados na Task 4.
- Produces: backend de staging deployado e respondendo; domínio público gerado pelo Railway (formato `comanda-ia-staging.up.railway.app` ou similar — confirmado no Step 6), usado na Task 7.

- [ ] **Step 1: Confirmar que ainda está linkado em `staging`**

```bash
railway status --json | jq -r '.environments.edges[] | select(.node.isLinked==true) | .node.name'
```

Esperado: `staging`. Se não estiver, rodar `railway environment link staging` de novo.

- [ ] **Step 2: Gerar um `JWT_SECRET` novo (diferente do de produção)**

```bash
STAGING_JWT_SECRET=$(openssl rand -base64 48)
railway variable set "JWT_SECRET=$STAGING_JWT_SECRET" --service comanda-ia --environment staging --skip-deploys --json
```

- [ ] **Step 3: Copiar os valores de VAPID de produção pra staging (seguro reusar — sem risco de abuso externo)**

```bash
VAPID_PUB=$(railway variable list --service comanda-ia --environment production --kv --json | jq -r '.VAPID_PUBLIC_KEY')
VAPID_PRIV=$(railway variable list --service comanda-ia --environment production --kv --json | jq -r '.VAPID_PRIVATE_KEY')
railway variable set "VAPID_PUBLIC_KEY=$VAPID_PUB" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "VAPID_PRIVATE_KEY=$VAPID_PRIV" --service comanda-ia --environment staging --skip-deploys --json
```

- [ ] **Step 4: Setar as variáveis do Resend e do R2 (valores das Tasks 2 e 3)**

```bash
railway variable set "RESEND_API_KEY=<valor da Task 3>" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "R2_ACCOUNT_ID=<valor da Task 2>" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "R2_ACCESS_KEY_ID=<valor da Task 2>" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "R2_SECRET_ACCESS_KEY=<valor da Task 2>" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "R2_BUCKET_NAME=comanda-ia-fotos-staging" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "R2_PUBLIC_URL=<valor da Task 2>" --service comanda-ia --environment staging --skip-deploys --json
```

Nota: os nomes corretos são `R2_ACCOUNT_ID`/`R2_BUCKET_NAME` (confirmado lendo `src/r2.ts`) — **não** `R2_ENDPOINT`/`R2_BUCKET` como o `CLAUDE.md` documenta hoje (docs desatualizadas; corrigir isso faz parte da Task 9).

- [ ] **Step 5: Setar `NODE_ENV` e um `FRONTEND_URL` provisório (a Task 7 atualiza com a URL real do Vercel)**

```bash
railway variable set "NODE_ENV=production" --service comanda-ia --environment staging --skip-deploys --json
railway variable set "FRONTEND_URL=https://staging-placeholder.vercel.app" --service comanda-ia --environment staging --json
```

(Sem `--skip-deploys` neste último de propósito — dispara o primeiro deploy real do backend de staging.)

- [ ] **Step 6: Gerar o domínio público do backend de staging**

```bash
railway domain --service comanda-ia --environment staging --json
```

Esperado: JSON com um domínio gerado tipo `comanda-ia-staging-<hash>.up.railway.app`. **Anotar esse valor** — é usado na Task 7.

- [ ] **Step 7: Confirmar que o deploy do backend de staging terminou com sucesso**

```bash
railway status --json | jq -r '.environments.edges[] | select(.node.name=="staging") | .node.serviceInstances.edges[] | select(.node.serviceName=="comanda-ia") | .node.latestDeployment.status'
```

Esperado: `SUCCESS` (pode levar 1-2 minutos — repetir o comando até sair desse status se ainda estiver `BUILDING`/`DEPLOYING`).

- [ ] **Step 8: Testar o endpoint de saúde do backend de staging**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<domínio gerado no Step 6>/"
```

Esperado: um código de resposta HTTP (200, 404 de rota — qualquer coisa diferente de erro de conexão/timeout já confirma que o servidor está de pé e respondendo).

---

### Task 6: Rodar o seed inicial no banco de staging

**Files:** nenhum (usa `prisma/seed.ts`, já existente, sem mudança de código)

**Interfaces:**
- Consumes: Environment `staging` criado na Task 4, backend deployado na Task 5.
- Produces: banco de staging populado com os dados sintéticos de `prisma/seed.ts` — consumido na Task 8 (verificação end-to-end, login com as credenciais de teste do seed).

- [ ] **Step 1: Confirmar que as migrations já rodaram (acontece automaticamente no boot, via `npm run start` → `npx prisma migrate deploy`)**

```bash
railway logs --service comanda-ia --environment staging | grep -i "migrate" | tail -20
```

Esperado: linhas confirmando migrations aplicadas, sem erro.

- [ ] **Step 2: Pegar a URL pública do Postgres de staging (a interna não é alcançável de fora do Railway)**

```bash
STAGING_DB_PUBLIC_URL=$(railway variable list --service Postgres --environment staging --kv --json | jq -r '.DATABASE_PUBLIC_URL')
echo "${STAGING_DB_PUBLIC_URL:0:20}..." # confirma que veio algo, sem expor a string toda no log
```

Esperado: algo começando com `postgresql://`.

- [ ] **Step 3: Rodar o seed localmente, apontando pro Postgres de staging**

```bash
DATABASE_URL="$STAGING_DB_PUBLIC_URL" npx prisma db seed
```

Esperado: saída do `prisma/seed.ts` confirmando criação dos estabelecimentos/usuários de teste (mesmo texto que aparece ao rodar `npx prisma db seed` localmente em dev).

- [ ] **Step 4: Confirmar que os dados existem no banco de staging**

```bash
DATABASE_URL="$STAGING_DB_PUBLIC_URL" npx prisma db execute --stdin <<< "SELECT count(*) FROM \"Estabelecimento\";"
```

Esperado: contagem maior que 0.

---

### Task 7: Configurar o frontend de staging no Vercel e fechar o loop com o Railway

**Files:** nenhum (infraestrutura)

**Interfaces:**
- Consumes: domínio do backend de staging gerado na Task 5, Step 6.
- Produces: URL estável do frontend de staging, usada na Task 8 e documentada na Task 9.

- [ ] **Step 1: Adicionar `VITE_API_URL` escopada só pra branch `staging`**

Navegar (browser) até `https://vercel.com/comanda-project/comanda-ia/settings/environment-variables`. Criar variável `VITE_API_URL`, valor = `https://<domínio do backend de staging da Task 5>`, e no seletor de ambiente escolher "Preview" com a opção de restringir por branch específica → digitar `staging` (Vercel permite escopar env var de Preview por branch exata, sem precisar de plano pago).

- [ ] **Step 2: Disparar o primeiro deploy do frontend de staging**

```bash
git checkout staging
git commit --allow-empty -m "chore: dispara primeiro deploy de staging no Vercel"
git push origin staging
```

- [ ] **Step 3: Confirmar o deploy no Vercel e pegar a URL gerada**

```bash
gh api repos/Eleva-Consulting/comanda-ia/commits/staging/status --jq '.state' 2>/dev/null || true
```

E navegar (browser) até `https://vercel.com/comanda-project/comanda-ia/deployments`, filtrar por branch `staging`, abrir o deployment mais recente, copiar a URL gerada (formato `https://comanda-ia-git-staging-<scope>.vercel.app` — Vercel gera essa URL automaticamente e estável pra qualquer branch, sem precisar configurar domínio customizado).

- [ ] **Step 4: Atualizar `FRONTEND_URL` no backend de staging com a URL real do Vercel (substitui o placeholder da Task 5)**

```bash
railway variable set "FRONTEND_URL=<URL do Vercel copiada no Step 3>" --service comanda-ia --environment staging --json
```

- [ ] **Step 5: Confirmar que o backend redeployou com o CORS correto**

```bash
sleep 20
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: <URL do Vercel copiada no Step 3>" "https://<domínio do backend de staging>/"
```

Esperado: resposta sem erro de conexão (o objetivo aqui é confirmar que o servidor voltou a responder depois do redeploy do `FRONTEND_URL` — a verificação de CORS de verdade acontece via browser na Task 8).

---

### Task 8: Verificação end-to-end no navegador

**Files:** nenhum

**Interfaces:**
- Consumes: URL do frontend de staging (Task 7), dados do seed (Task 6).

- [ ] **Step 1: Abrir o frontend de staging no navegador**

Navegar até a URL do Vercel copiada na Task 7, Step 3.

- [ ] **Step 2: Fazer login com uma credencial de teste do seed**

Usar uma das credenciais documentadas em `CLAUDE.md` (seção "Credenciais de teste", ex: `vinicius@teste.com` / `senhaforte123`).

- [ ] **Step 3: Confirmar que o dashboard carrega sem erro de CORS/rede**

Checar o console do navegador (`read_console_messages`, padrão `error|CORS`) — esperado: nenhum erro de CORS ou falha de rede pro domínio do backend de staging.

- [ ] **Step 4: Confirmar isolamento — nenhuma integração real disparada**

Navegar até a tela de Configurações do estabelecimento de teste logado; confirmar que WhatsApp aparece desconectado (sem QR code ativo) e Mercado Pago aparece como não-conectado — comportamento esperado pro ambiente de staging, sem nenhuma ação extra necessária.

---

### Task 9: Atualizar `CLAUDE.md` com o novo fluxo de duas etapas e a documentação do ambiente de staging

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: URLs geradas nas Tasks 5 e 7 (domínio do backend de staging, URL do frontend de staging).

- [ ] **Step 1: Substituir a regra de PR única por PR duas etapas**

Localizar o bullet `**REGRA: sempre passar por Pull Request antes de mesclar na `main`...**` (adicionado em 2026-07-19) e substituir pelo fluxo novo:

```markdown
- **REGRA: fluxo de branch em duas etapas — feature → `staging` → `main`.** A `staging` é um
  ambiente de homologação sempre no ar (Railway Environment + Vercel branch deploy), com banco
  de dados e integrações externas isolados de produção. Nenhuma feature vai direto pra `main`:
  1. `git checkout -b feat/xyz` (a partir de `staging` atualizada) → commits → PR contra
     `staging` → CI verde → merge. Dispara deploy automático de homologação — testar
     manualmente lá antes do próximo passo.
  2. Quando validado em staging: PR de `staging` → `main` → CI verde → merge → vai pra
     produção.
  Continua sem trava técnica (plano Free do GitHub) — depende de disciplina do time nas duas
  etapas, não é imposto pelo GitHub.
```

- [ ] **Step 2: Adicionar uma seção nova documentando o ambiente de staging**

Inserir depois da seção "Variáveis de ambiente", antes de "Migração do repositório...":

```markdown
## Ambiente de homologação (staging)

Railway Environment `staging` (mesmo projeto `glorious-playfulness`) + Vercel branch deploy da
branch `staging`. Backend: `https://<domínio gerado na Task 5>`. Frontend:
`https://<URL do Vercel da Task 7>`.

**Isolado de produção**: banco de dados próprio (só dados sintéticos do
`prisma/seed.ts`, populado manualmente na criação — não a cada deploy), `JWT_SECRET` próprio,
bucket R2 próprio (`comanda-ia-fotos-staging`), `RESEND_API_KEY` própria, sem sessão de
WhatsApp conectada, sem `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_REDIRECT_URI` (Mercado Pago fica
naturalmente desabilitado — nenhum estabelecimento de teste tem conexão OAuth real).
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` são os mesmos de produção (sem risco de reuso).

Resetar os dados de teste de staging (ex: depois de testes que sujaram os dados):

```bash
railway environment link staging
STAGING_DB_PUBLIC_URL=$(railway variable list --service Postgres --environment staging --kv --json | jq -r '.DATABASE_PUBLIC_URL')
DATABASE_URL="$STAGING_DB_PUBLIC_URL" npx prisma db seed
railway environment link production
```
```

- [ ] **Step 3: Corrigir os nomes de variável do R2 na seção "Variáveis de ambiente" (achado durante esta implementação)**

Trocar, no bloco de variáveis de ambiente do backend:

```
R2_ENDPOINT=...                    # Cloudflare R2 (fotos)
```

por:

```
R2_ACCOUNT_ID=...                  # Cloudflare R2 (fotos)
```

e trocar:

```
R2_BUCKET=comanda-ia-fotos
```

por:

```
R2_BUCKET_NAME=comanda-ia-fotos
```

(Nomes confirmados lendo `src/r2.ts` — a documentação antiga estava desatualizada.)

- [ ] **Step 4: Adicionar entrada no Log de mudanças**

No topo do "Log de mudanças", adicionar uma entrada `### 2026-07-19 (continuação)` resumindo: ambiente de staging criado (Railway Environment + Vercel branch deploy), fluxo de branch em duas etapas, isolamento de integrações externas confirmado, correção da documentação de variáveis do R2.

- [ ] **Step 5: Commitar e abrir PR contra `main` (última mudança desta iniciativa que ainda mira `main` diretamente — a partir daqui, PRs futuras miram `staging`)**

```bash
git checkout main
git pull
git checkout -b docs/staging-env
git add CLAUDE.md
git commit -m "docs: documenta ambiente de homologação e novo fluxo staging->main"
git push -u origin docs/staging-env
gh pr create --base main --head docs/staging-env --title "docs: ambiente de homologação (staging)" --body "Documenta o novo ambiente de staging (Railway + Vercel) e o fluxo de branch em duas etapas (feature → staging → main). Ver docs/superpowers/specs/2026-07-19-ambiente-homologacao-design.md e docs/superpowers/plans/2026-07-19-ambiente-homologacao.md."
```

- [ ] **Step 6: Aguardar o CI passar e mesclar**

```bash
gh pr checks docs/staging-env --watch
gh pr merge docs/staging-env --merge
```

Esperado: os dois checks (`Backend (build + test)`, `Frontend (build)`) verdes, merge concluído.
