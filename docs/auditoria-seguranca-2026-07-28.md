# Auditoria de Segurança — comanda-ia

**Data:** 2026-07-28
**Escopo:** sistema completo (backend + frontend), com foco em vulnerabilidades exploráveis, não em estilo de código.
**Branch/commit de referência:** `staging` @ `d70eaa2` (working tree limpo no momento da auditoria).

## Sumário executivo

A auditoria cobriu cinco áreas em paralelo: autenticação/sessão, isolamento multi-tenant e
autorização (IDOR), endpoints públicos e webhooks, upload de arquivos/integrações
externas/segredos, e frontend/dependências.

**A boa notícia:** o ponto estruturalmente mais arriscado de um SaaS multi-tenant — vazamento de
dado entre estabelecimentos (IDOR) — está sólido. Todas as ~70 rotas autenticadas que recebem
`:id` de recurso filtram consistentemente por `estabelecimentoId` do JWT, sem exceção encontrada.
CORS é allowlist explícita, a validação de input nas rotas públicas usa schema (TypeBox/zod) com
`removeAdditional`, e o webhook do Mercado Pago nunca confia no payload recebido — sempre
reconsulta a API antes de confirmar um pagamento.

**Os pontos reais a corrigir** são, em ordem de prioridade: ausência total de rate limiting
(login e endpoints públicos ficam abertos a força bruta e flood), dois segredos de integração
armazenados em texto puro no banco (Mercado Pago e sessão do WhatsApp), e uma pequena falha de
autorização no endpoint de push notifications. O restante são itens de robustez adicional
(defesa em profundidade), não brechas críticas isoladas.

Nenhum achado desta auditoria é especulativo — cada item foi confirmado lendo o código real
(arquivo:linha) antes de entrar neste documento.

---

## Achados, por severidade

### 1. [Alto] Nenhum rate limiting em nenhuma rota do backend — ✅ Resolvido em 2026-08-06

> **Correção:** `@fastify/rate-limit` instalado e registrado globalmente em `src/server.ts`
> (300 req/min por IP, default pra qualquer rota sem override). Limites específicos por
> rota via `config: { rateLimit: {...} }`: `POST /auth/login` (5/15min),
> `POST /auth/esqueci-senha` (3/15min — resolve também o achado #6),
> `POST /auth/redefinir-senha` (10/15min), `POST /publico/:slug/pedido` (20/min). Validado
> com testes de integração (`src/rateLimit.test.ts`, via `fastify.inject()`) confirmando
> que o bloqueio (429) realmente acontece após o limite, é por rota, e não vaza pra outras
> rotas.
>
> **Iteração adicional em 2026-08-08** (achado do usuário testando ao vivo, com razão):
> bloqueio por IP em `POST /auth/login`/`esqueci-senha` tem dois problemas sérios —
> (1) várias contas atrás do mesmo IP compartilhado (ex: Wi-Fi único do restaurante) ficam
> bloqueadas por causa de UMA conta sofrendo ataque, um risco real de disponibilidade;
> (2) um atacante de verdade contorna o limite só trocando de IP (VPN/proxy/rede móvel),
> já que o limite nunca perseguia a conta-alvo. Essas duas rotas passaram a usar
> `keyGenerator` customizado (chave = email do corpo da requisição, normalizado
> case-insensitive, hook `preHandler` pra rodar depois da validação do schema) em vez do
> IP — o bloqueio agora persegue a conta específica sob ataque, sobrevive troca de IP do
> atacante, e não afeta nenhuma outra conta no mesmo IP/rede. `POST /auth/redefinir-senha`
> e `POST /publico/:slug/pedido` continuam por IP (não têm o mesmo risco: o primeiro não é
> usado no dia a dia normal, o segundo não tem "conta" pra perseguir). 3 testes novos
> provando o comportamento (persegue mesmo com IP trocando, não bloqueia conta vizinha no
> mesmo IP, normalização de maiúsculas).

**Local:** `src/server.ts` (nenhum registro de `@fastify/rate-limit` ou equivalente em nenhum
lugar do backend — confirmado por leitura completa do arquivo e do `package.json`, que não lista
essa dependência).

**Descrição:** Todo o backend — rotas autenticadas e públicas — está sem qualquer limite de
tentativas, requisições por IP, ou throttling.

**Cenário de exploração:**
- **Força bruta / credential stuffing:** um atacante pode testar milhares de senhas por segundo
  contra um email conhecido (ex: `vinicius@teste.com`) em `POST /auth/login`, sem bloqueio,
  lockout ou delay progressivo.
- **Flood de pedidos falsos:** `POST /publico/:slug/pedido` (`src/routes/publico.ts:130`) dispara
  email (Resend), WhatsApp e push a cada chamada bem-sucedida. Um script em loop consegue floodar
  o dono de um estabelecimento com pedidos falsos, esgotar a cota do Resend/WhatsApp, e sujar o
  banco.
- **Flood de reset de senha:** ver achado #6 abaixo (agrava o mesmo problema).
- O webhook `POST /webhooks/mercadopago` também está sem limite (impacto menor, ver achado
  correlato mais abaixo na seção "sem achado").

**Recomendação:** instalar `@fastify/rate-limit`, com política diferenciada:
- `POST /auth/login` e `POST /auth/esqueci-senha`: limite agressivo por IP + por email (ex: 5
  tentativas / 15 min).
- `POST /publico/:slug/pedido` e demais rotas públicas de escrita: limite por IP (ex: 20
  requisições / min).
- Rotas autenticadas em geral: limite mais permissivo, só para conter abuso grosseiro.

---

### 2. [Alto] Tokens OAuth do Mercado Pago em texto puro no banco

**Local:** `prisma/schema.prisma:121-122` (`Estabelecimento.mpAccessToken`, `mpRefreshToken`,
ambos `String?`) — gravados sem criptografia via `prisma.estabelecimento.update` em
`src/mercadopago.ts:156-158`.

**Descrição:** os tokens de OAuth que dão acesso à conta real do Mercado Pago de cada
estabelecimento (para criar cobranças Pix e ler pagamentos) são armazenados como texto puro no
Postgres.

**Cenário de exploração:** qualquer acesso de leitura ao banco de produção — backup exposto,
dump baixado, credencial de banco comprometida, insider malicioso — expõe imediatamente o
`mpAccessToken` (usável direto na API do Mercado Pago até expirar) e o `mpRefreshToken` (permite
renovar indefinidamente, sem expiração prática). Isso compromete a integração financeira de
**todos os estabelecimentos de uma vez**, não só um.

**Recomendação:** criptografar esses dois campos em repouso antes de persistir — criptografia
simétrica na camada de aplicação (ex: AES-256-GCM) com uma chave dedicada, separada da
`DATABASE_URL` e gerenciada como os demais segredos do Railway (nunca reaproveitar o
`JWT_SECRET` para isso). Descriptografar só no momento de uso.

---

### 3. [Alto] Sessão do WhatsApp (Baileys) em texto puro no banco

**Local:** `src/whatsapp.ts:39-42`, tabela `WhatsAppSession` (`creds`/`keys`).

**Descrição:** as credenciais de sessão do bot WhatsApp (Baileys) de cada estabelecimento são
persistidas sem criptografia no Postgres.

**Cenário de exploração:** o mesmo vetor do achado #2 — acesso de leitura ao banco permite
sequestrar a sessão do WhatsApp de qualquer estabelecimento, sem precisar escanear o QR code de
novo: enviar mensagens em nome do número do restaurante e ler o histórico de conversas.

**Recomendação:** mesma solução do achado #2 — criptografar `creds`/`keys` em repouso com chave
de aplicação dedicada. Se a superfície permitir, considerar também rotação/invalidação de sessão
mais agressiva quando houver suspeita de comprometimento do banco.

---

### 4. [Médio] `POST /push/subscribe` permite sobrescrever a inscrição de outro usuário

**Local:** `src/routes/push.ts:25-29`.

**Descrição:** o handler faz `prisma.pushSubscription.upsert({ where: { endpoint }, update: {
p256dh, auth }, ... })`. No ramo de `update`, as chaves de criptografia da inscrição (`p256dh`,
`auth`) são sobrescritas **sem verificar se o `usuarioId` do registro existente bate com o
usuário autenticado na requisição**. Por contraste, `DELETE /push/unsubscribe` (linha 41) já
filtra corretamente por `usuarioId` — o `subscribe` deveria seguir o mesmo padrão.

**Cenário de exploração:** um atacante que descubra ou reutilize o `endpoint` de push de outro
usuário (ex: computador compartilhado, log vazado) consegue substituir as chaves de criptografia
da inscrição alheia, podendo interceptar ou quebrar as notificações dela. Severidade considerada
**média, não alta**, porque o `endpoint` é uma URL longa e opaca gerada pelo próprio navegador —
não é enumerável nem previsível na prática.

**Recomendação:** trocar o `upsert` por um filtro composto (`endpoint` + `usuarioId`) — se o
endpoint já existe para outro usuário, criar um registro novo ou rejeitar, nunca sobrescrever
silenciosamente. Fix pequeno, isolado em um arquivo.

---

### 5. [Médio] JWT sem mecanismo de revogação, validade de 7 dias

**Local:** `src/server.ts:64-67` (emissão, `expiresIn: '7d'`); `src/plugins/auth.ts:40`
(verificação, só checa assinatura/expiração).

**Descrição:** não existe blacklist, versão de token, ou qualquer consulta ao banco na
verificação do JWT — um token válido continua aceito até expirar, não importa o que aconteça
depois com a conta.

**Cenário de exploração:** se um token vazar (XSS no frontend, log, dispositivo compartilhado
esquecido logado) ou um operador for desligado da empresa, não há forma de invalidar a sessão
antes dos 7 dias completos — nem trocar a senha do usuário invalida tokens já emitidos, porque a
verificação nunca volta ao banco para checar se a sessão ainda é válida.

**Recomendação:** opções em ordem de custo de implementação:
1. Reduzir `expiresIn` (ex: 1-2 dias) — mitigação simples, não resolve o problema de fundo.
2. Guardar um `tokenVersion` (ou `sessaoVersao`) no `Usuario`, incluir no payload do JWT, e
   comparar contra o banco na verificação — trocar a senha ou o DONO "deslogar" um operador
   incrementa a versão e invalida todos os tokens antigos de uma vez, sem precisar de tabela de
   blacklist.

---

### 6. [Baixo] Sem cooldown entre pedidos de reset de senha — ✅ Resolvido em 2026-08-06 (via achado #1)

> **Correção:** `POST /auth/esqueci-senha` agora limitado a 3 tentativas / 15 min por IP
> (mesmo rate limiting do achado #1) — não implementado o cooldown por-usuário sugerido
> como alternativa (reenviar o mesmo token em vez de gerar outro), avaliado como
> redundante depois do rate limit por IP já cobrir o cenário de exploração real.

**Local:** `src/routes/auth.ts:142-172` (`POST /auth/esqueci-senha`).

**Descrição:** cada chamada gera e sobrescreve o `resetToken` na hora, sem checar se já existe um
token válido recente para aquele usuário.

**Cenário de exploração:** combinado com a ausência geral de rate limiting (achado #1), um
atacante pode inundar a caixa de entrada da vítima com emails de "redefinir senha" repetidamente,
sem limite algum.

**Recomendação:** resolvido em boa parte pelo rate limiting do achado #1; adicionalmente, pode-se
recusar gerar um novo token se um ainda válido (não expirado) já existir para o mesmo usuário,
reenviando o mesmo email em vez de gerar outro.

**O que já está correto aqui (confirmado, sem vulnerabilidade):** `resetToken` gerado via
`randomUUID()` (aleatoriedade adequada, ~122 bits), expiração de 1h checada na validação, token
zerado após uso (uso único real), e resposta idêntica independente do email existir no banco ou
não (sem enumeração de contas por essa via).

---

### 7. [Baixo] HTML de cliente final não sanitizado nos templates de email

**Local:** `src/mailer.ts` (templates `novoPedido`, `cadastroPendente`, entre outros).

**Descrição:** os templates interpolam `clienteNome`/`nomeItem` — dados de entrada de cliente
final, vindos de rota pública sem autenticação (checkout) — diretamente no HTML do email, sem
escapar.

**Cenário de exploração:** um cliente malicioso preenche o campo de nome com markup/links no
checkout público; o dono do estabelecimento recebe esse conteúdo renderizado dentro do email
recebido (potencial phishing visual, ex: um link disfarçado de texto legítimo). Não é execução de
script — clientes de email bloqueiam JavaScript — mas é injeção de conteúdo não confiável no
canal.

**Recomendação:** escapar (`encodeURIComponent`/lib de escape HTML) qualquer campo de entrada de
usuário antes de interpolar nos templates de `mailer.ts`.

---

### 8. [Baixo/Manutenção] Dependência `ws` vulnerável a DoS por exaustão de memória

**Local:** `package.json` — `ws@8.0.0–8.20.1`, transitiva via `socket.io@4.8.3` (servidor
Socket.IO público, `src/socket.ts`) e via `@whiskeysockets/baileys` (sessão WhatsApp).
**CVE/Advisory:** GHSA-96hv-2xvq-fx4p.

**Descrição:** versão vulnerável da lib `ws`, usada por duas dependências diretas do projeto.

**Cenário de exploração:** um cliente WebSocket conectado ao Socket.IO (canal de tempo real da
Cozinha/Mesas, aberto a qualquer usuário autenticado do estabelecimento) envia fragments/chunks
minúsculos repetidos, esgotando a memória do processo Node.

**Recomendação:** rodar `npm audit fix` (correção já disponível via bump de versão) e testar a
reconexão do Socket.IO depois — Railway bloqueia XHR polling, então o transporte é sempre
WebSocket puro, vale confirmar que a atualização não muda esse comportamento.

---

### 9. [Baixo/Manutenção] `nodemailer` instalado mas nunca usado, carrega vulnerabilidade High

**Local:** `package.json` (dependencies + `@types/nodemailer`).

**Descrição:** `grep -rn nodemailer src/` não retorna nenhum import no código — a dependência
está listada no `package.json` mas não é referenciada em lugar nenhum. Carrega
**GHSA-p6gq-j5cr-w38f** (SSRF / leitura arbitrária de arquivo via opção `raw`) sem nenhum
benefício, e contradiz a própria observação do `CLAUDE.md` de que o projeto usa exclusivamente
Resend via HTTP API (Railway bloqueia SMTP nas portas 465/587).

**Cenário de exploração:** nenhum hoje — a lib não é chamada em runtime. O risco é de superfície
de ataque morta: se algum código futuro vier a usar essa dependência sem revisão cuidadosa,
herda a vulnerabilidade à toa.

**Recomendação:** remover `nodemailer` e `@types/nodemailer` do `package.json`.

---

### 10. [Info] Rota morta `/webhook/simular` sem autenticação

**Local:** `src/routes/webhook.ts:15`.

**Descrição:** recebe um `estabelecimentoId` livre e confirma a existência do estabelecimento
pela resposta (200 vs 404) — resquício da integração com Evolution API, que o próprio "Log de
mudanças" do `CLAUDE.md` registra como removida em 2026-07-04. Não há nenhuma referência a essa
rota em fluxo ativo do sistema.

**Cenário de exploração:** enumeração de baixo risco — os IDs são UUID v4, não sequenciais, então
não é praticamente explorável em massa. O risco real é só manter superfície de ataque
desnecessária de um recurso já morto.

**Recomendação:** remover o arquivo/rota, já que nada mais no sistema depende dela.

---

## Áreas verificadas sem achados relevantes

Para deixar claro o que foi checado e não apresentou vulnerabilidade:

- **Isolamento multi-tenant (IDOR):** todas as ~70 rotas autenticadas com `:id` de recurso
  (pedido, item, mesa, conta, comanda, operador, insumo, setor, bairro, categoria, rodada,
  pagamento) filtram por `estabelecimentoId` do JWT de forma consistente — via `findFirst`,
  `updateMany`/`deleteMany` com filtro composto, ou relação aninhada. Nenhuma rota usa
  `update`/`delete` bruto só por `id`.
- **Permissões granulares (`temPermissao`) e módulos (`moduloAtivo`):** lógica correta — DONO
  sempre passa, OPERADOR precisa de permissão explícita; `moduloAtivo` não libera DONO
  automaticamente (é checagem de plano contratado, não de papel).
- **Rotas `/admin/*`:** protegidas por `apenasAdmin` via hook de plugin, sem exceção.
- **Hashing de senha:** bcrypt custo 12 com salt automático.
- **CORS:** allowlist explícita de origem (`origensPermitidas()` em `src/server.ts`), sem
  wildcard.
- **Validação de input nas rotas públicas:** schema (TypeBox/zod) com `removeAdditional: true` e
  limites de tamanho.
- **Webhook do Mercado Pago:** nunca confia no payload recebido — sempre reconsulta a API do MP
  com o `accessToken` do próprio estabelecimento antes de confirmar um pagamento; usa
  `updateMany` condicional (`aguardandoPagamento: true`) para idempotência real contra retries
  concorrentes.
- **Fluxo OAuth do Mercado Pago:** o parâmetro `state` é assinado com uma chave JWT **separada**
  da chave de sessão real, evitando replay caso o `state` vaze.
- **Upload de fotos (Cloudflare R2):** MIME validado por whitelist, tamanho limitado a 5MB no
  multipart, chave do objeto gerada só a partir de `estabelecimentoId`/`id`/timestamp (sem path
  traversal, sem colisão/overwrite entre tenants).
- **`JWT_SECRET`:** usado via `process.env.JWT_SECRET!`, sem fallback hardcoded.
- **Logs:** nenhum `console.log`/`console.error` vazando segredo ou token real encontrado.
- **Frontend:** nenhum `dangerouslySetInnerHTML`, `eval` ou `new Function` em todo
  `frontend/src/`. Os guards de rota (`RotaProtegida`, `RotaAdmin`, `RotaPermissao`) são só
  redirects de UI — o backend revalida tudo de forma independente, então não há dado sensível
  decidido só no cliente.
- **Path traversal via filesystem:** nenhuma rota do backend serve arquivo por parâmetro de path
  — fotos são sempre servidas via URL pública do R2.

---

## Plano de ação sugerido (priorização)

1. ✅ **Rate limiting** (achado #1) — maior impacto, esforço baixo-médio (`@fastify/rate-limit`).
   Resolvido em 2026-08-06.
2. **Criptografar segredos em repouso** (achados #2 e #3) — impacto alto, esforço médio (definir
   estratégia de chave + migrar dados já persistidos).
3. **Corrigir `POST /push/subscribe`** (achado #4) — esforço muito baixo, fix isolado.
4. **Versão/invalidação de JWT** (achado #5) — esforço médio, decidir entre reduzir TTL ou
   implementar `tokenVersion`.
5. **Limpeza de dependências e rota morta** (achados #8, #9, #10) — esforço baixo,
   `npm audit fix` + remover `nodemailer` + remover `/webhook/simular`.
6. **Escapar HTML nos templates de email** (achado #7) — esforço baixo.
7. **Cooldown de reset de senha** (achado #6) — resolvido em grande parte pelo item 1.

---

## Metodologia

Auditoria feita via 5 revisões paralelas, cada uma cobrindo uma área do sistema, com leitura
direta do código-fonte (não apenas grep superficial) e descarte de qualquer achado não
confirmável no código real:

1. Autenticação e sessão (`src/routes/auth.ts`, `src/plugins/auth.ts`, JWT, hashing, reset de
   senha).
2. Isolamento multi-tenant e autorização/IDOR (todas as rotas autenticadas do backend).
3. Endpoints públicos e webhooks (`src/routes/publico.ts`, Mercado Pago, CORS, rate limiting).
4. Upload de arquivos, integrações externas e segredos (R2, Resend, WhatsApp/Baileys, Web Push,
   Mercado Pago).
5. Frontend e dependências (XSS, guards de rota, `npm audit` em backend e frontend).
