# Empacotamento do Agente de Impressão Local (Windows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o agente de impressão local (`agente-impressao/`, já em produção) num
executável Windows autocontido, que roda como serviço (sobrevive a reboot, reinicia sozinho se
cair) e não perde ticket quando a impressora está temporariamente offline.

**Architecture:** Ver
`docs/superpowers/specs/2026-08-15-agente-impressao-empacotamento-design.md` pro design completo.
Resumo: (1) fila de retry persistida em arquivo, integrada no fluxo de impressão existente; (2)
bundle via `esbuild` + Node SEA (`--experimental-sea-config`, nativo do Node 22) gerando um
`.exe` único; (3) script de instalação Windows que registra esse `.exe` como serviço via NSSM.

**Tech Stack:** Node 22, TypeScript (agente já é assim). Novo: `esbuild` como devDependency do
`agente-impressao/` (bundling), NSSM como ferramenta externa (não é dependência npm — baixada
separadamente na hora de instalar, documentada no guia).

## Global Constraints

- Não alterar o comportamento do agente quando a impressora está **online** — a fila de retry só
  entra em ação no caminho de falha; o caminho feliz (`enviarParaImpressora` bem-sucedido)
  continua idêntico.
- Não introduzir dependência nativa (addon C++) em nenhuma etapa — isso quebraria o bundling SEA.
  `esbuild` é só ferramenta de build (devDependency), não entra no bundle final.
- O import cross-pacote de `agente-impressao/src/index.ts` pra `src/utils/escPosTicket.ts` (fora
  da pasta do agente) precisa continuar funcionando dentro do bundle — `esbuild` resolve isso
  naturalmente (segue imports relativos), mas confirmar no bundle gerado antes de seguir pro
  empacotamento SEA.
- Scripts novos (build do `.exe`, instalação do serviço) ficam dentro de `agente-impressao/`
  (`scripts/` ou na raiz do pacote) — não tocar em nada do backend principal (`src/`,
  `package.json` da raiz).
- Sem migration de banco, sem rota nova no backend principal — todo o trabalho é local ao pacote
  `agente-impressao/`.

---

## File Structure

- **`agente-impressao/src/filaImpressao.ts`** (create) — fila persistida em JSON: `enfileirar`,
  `processarFila`, `descartarExpirados`, funções puras testáveis separadas de I/O de arquivo onde
  possível.
- **`agente-impressao/src/filaImpressao.test.ts`** (create) — testes unitários da lógica pura
  (expiração, agrupamento por impressora).
- **`agente-impressao/src/imprimir.ts`** (modify) — `enviarParaImpressora` continua igual;
  chamador (`index.ts`) passa a enfileirar em caso de falha em vez de só logar.
- **`agente-impressao/src/index.ts`** (modify) — integra a fila: tenta imprimir direto, enfileira
  se falhar, dispara o loop de reprocessamento periódico no `main()`.
- **`agente-impressao/package.json`** (modify) — `esbuild` como devDependency; novos scripts
  `build:bundle` e `build:exe`.
- **`agente-impressao/scripts/build-exe.mjs`** (create) — orquestra: `esbuild` bundle →
  `node --experimental-sea-config` → injeta blob no `node.exe` copiado → gera
  `dist/comanda-ia-agente-impressao.exe`.
- **`agente-impressao/sea-config.json`** (create) — config do Node SEA (aponta pro bundle
  gerado).
- **`agente-impressao/instalar-servico-windows.bat`** (create) — script batch que baixa/usa o
  `nssm.exe` local e registra o `.exe` como serviço do Windows.
- **`docs/agente-impressao-windows-passo-a-passo.pdf`** — atualizado por último (fora do plano de
  código, ver Task 5) pra refletir o novo fluxo de instalação.

---

### Task 1: Fila de retry com expiração — lógica pura

**Files:**
- Create: `agente-impressao/src/filaImpressao.ts`
- Create: `agente-impressao/src/filaImpressao.test.ts`

**Interfaces:**
- Produces: `enfileirar(item: TicketEnfileirado)`, `listarProntosParaRetry(fila, agora)`,
  `descartarExpirados(fila, agora, ttlMs)` — funções puras sobre um array em memória (I/O de
  arquivo fica pra Task 2, separado de propósito pra ficar testável sem tocar disco).
- Consumed by: Task 2 (integração com `index.ts`).

- [ ] **Step 1: Modelar o item da fila**
  - Tipo `TicketEnfileirado`: `{ id: string; impressoraIp: string; ticket: Buffer; criadoEm: number; tentativas: number }`.
  - `Buffer` precisa ser serializável em JSON (Task 2 persiste em arquivo) — usar
    `ticket.toString('base64')` na serialização, não o Buffer cru.

- [ ] **Step 2: Funções puras de fila**
  - `descartarExpirados(fila, agora, ttlMs)`: remove itens com `agora - criadoEm > ttlMs`,
    retorna `{ ativos, expirados }` (pra Task 2 logar os expirados).
  - `listarProntosParaRetry(fila)`: por ora retorna a fila inteira (retry de todos a cada tick) —
    manter simples, sem backoff exponencial por item (não pedido, YAGNI).

- [ ] **Step 3: Testes**
  - Item mais novo que o TTL não é descartado; item mais velho é.
  - `descartarExpirados` não muta o array de entrada (retorna novo array).
  - Rodar `npm test` dentro de `agente-impressao/` — confirmar verde.

---

### Task 2: Persistência em arquivo + integração no fluxo de impressão

**Files:**
- Modify: `agente-impressao/src/filaImpressao.ts` (adiciona `salvarFila`/`carregarFila`)
- Modify: `agente-impressao/src/index.ts`

**Interfaces:**
- Consumes: Task 1 (`descartarExpirados`, `listarProntosParaRetry`).
- Produces: comportamento observável — ticket que falha ao imprimir aparece em
  `fila-impressao.json` (path configurável via env, default ao lado do `.env`); some da fila
  quando a impressora volta e o retry funciona.

- [ ] **Step 1: `salvarFila`/`carregarFila`**
  - JSON no disco (path: `process.env.FILA_IMPRESSAO_PATH ?? './fila-impressao.json'`).
  - Carregar na inicialização do `main()`; se o arquivo não existir ainda, começa com fila vazia
    (não é erro).

- [ ] **Step 2: Enfileirar em caso de falha**
  - Em `processarRodada` (`index.ts`), o `catch` do `enviarParaImpressora` (hoje só
    `console.error`) passa a também chamar `enfileirar(...)` e persistir a fila.

- [ ] **Step 3: Loop de retry**
  - Novo `setInterval` em `main()` (constante `RETRY_FILA_MS`, ex. 30s): descarta expirados
    (logando cada um), tenta reimprimir os que sobraram, remove da fila os que tiveram sucesso,
    persiste o resultado.
  - TTL configurável via `process.env.FILA_IMPRESSAO_TTL_MS` (default 45min).

- [ ] **Step 4: Verificação manual**
  - Rodar o agente local (`npm start` dentro de `agente-impressao/`) apontando pra um IP de
    impressora inválido de propósito — confirmar que o ticket aparece no
    `fila-impressao.json`, e que reiniciar o agente não perde o item (é recarregado do arquivo).
  - `npm test` e `tsc` (build do agente) sem regressão.

---

### Task 3: Bundle único via esbuild

**Files:**
- Modify: `agente-impressao/package.json`
- Create: `agente-impressao/scripts/build-bundle.mjs` (ou config inline do esbuild)

**Interfaces:**
- Produces: `agente-impressao/dist-bundle/agente.cjs` (ou `.mjs`, decidir conforme
  compatibilidade do Node SEA — checar na Task 4 se SEA exige CJS) — um único arquivo, sem
  `node_modules`, pronto pra virar o input do Node SEA.
- Consumed by: Task 4.

- [ ] **Step 1: Instalar esbuild como devDependency**
  - `npm install --save-dev esbuild` dentro de `agente-impressao/`.

- [ ] **Step 2: Script de bundle**
  - `esbuild agente-impressao/src/index.ts --bundle --platform=node --target=node22 --outfile=dist-bundle/agente.cjs`
    (ajustar formato conforme o que o Node SEA aceitar — validar na Task 4).
  - Confirmar que o import cross-pacote pra `src/utils/escPosTicket.ts` (fora de
    `agente-impressao/`) é resolvido e embutido no bundle — inspecionar o arquivo gerado.

- [ ] **Step 3: Verificação**
  - Rodar `node dist-bundle/agente.cjs` diretamente (com um `.env` de teste ao lado) — deve se
    comportar identicamente a `npm start` hoje (conecta no socket, mesma saída de log).

---

### Task 4: Executável único via Node SEA

**Files:**
- Create: `agente-impressao/sea-config.json`
- Create: `agente-impressao/scripts/build-exe.mjs`
- Modify: `agente-impressao/package.json` (script `build:exe`)

**Interfaces:**
- Consumes: Task 3 (bundle).
- Produces: `agente-impressao/dist/comanda-ia-agente-impressao.exe` — executável Windows
  autocontido.

- [ ] **Step 1: `sea-config.json`**
  - Aponta `main` pro bundle da Task 3, `output` pro blob `.blob` intermediário, conforme
    formato exigido pelo `node --experimental-sea-config` (Node 22).

- [ ] **Step 2: Script de build**
  - Automatiza a sequência documentada pelo Node pra SEA: gerar o blob
    (`node --experimental-sea-config sea-config.json`), copiar `node.exe` local, remover
    assinatura existente se necessário, injetar o blob via `postject`
    (`npx postject comanda-ia-agente-impressao.exe NODE_SEA_BLOB sea-prep.blob ...`).
  - `postject` entra como devDependency (é a ferramenta oficial recomendada pela doc do Node
    pra esse passo, não dependência de runtime do agente).

- [ ] **Step 3: Verificação**
  - **Requer Windows real** (ou VM/CI Windows) — o `.exe` gerado num Mac não roda nativamente.
    Se o ambiente de build for macOS/Linux, documentar claramente que este passo precisa ser
    validado numa máquina Windows (a mesma forma como o passo 4 original do roadmap foi validado
    — testando na prática, não só no papel).
  - No Windows: copiar o `.exe` + um `.env` de teste pra uma pasta, rodar direto (duplo-clique
    ou `.\comanda-ia-agente-impressao.exe` no terminal) — deve conectar e imprimir igual ao
    `npm start` de sempre.

---

### Task 5: Serviço do Windows via NSSM + atualização do guia

**Files:**
- Create: `agente-impressao/instalar-servico-windows.bat`
- Modify: `docs/agente-impressao-windows-passo-a-passo.pdf` (ou o fonte dele, se existir
  separado do PDF — checar antes de editar o PDF diretamente)

**Interfaces:**
- Consumes: Task 4 (`.exe`), Task 2 (fila — só precisa estar funcionando, nada de interface
  nova aqui).

- [ ] **Step 1: Script de instalação**
  - `.bat` que espera `nssm.exe` na mesma pasta (baixado manualmente da nssm.cc — não
    redistribuído no repo, licença própria) e roda:
    `nssm install ComandaIA-AgenteImpressao "<caminho>\comanda-ia-agente-impressao.exe"`,
    `nssm set ComandaIA-AgenteImpressao AppDirectory "<caminho>"`,
    `nssm set ComandaIA-AgenteImpressao AppStdout "<caminho>\agente.log"`,
    `nssm set ComandaIA-AgenteImpressao AppStderr "<caminho>\agente.log"`,
    `nssm start ComandaIA-AgenteImpressao`.
  - Precisa rodar como Administrador — o `.bat` deve checar isso e avisar claramente se não
    estiver elevado, em vez de falhar com erro genérico do `nssm`.

- [ ] **Step 2: Atualizar o guia de instalação**
  - Novo fluxo: baixar `.exe` (não mais clonar o repo), configurar `.env` (igual hoje), baixar
    `nssm.exe`, rodar `instalar-servico-windows.bat` como admin.
  - Documentar como desinstalar/parar o serviço (`nssm stop`/`nssm remove`), útil pra
    debug/atualização de versão.

- [ ] **Step 3: Verificação end-to-end (Windows real)**
  - Instalar como serviço numa máquina Windows limpa (ou a mesma usada nos testes do passo 4
    original), reiniciar o Windows, confirmar que o agente sobe sozinho sem login e imprime um
    ticket de teste.
  - Matar o processo manualmente (Gerenciador de Tarefas) — confirmar que o NSSM reinicia
    sozinho.

---

## Verificação final (todo o branch)

- [ ] `npm test` dentro de `agente-impressao/` — verde, incluindo os testes novos da fila
  (Task 1).
- [ ] `tsc` (build TS do agente) sem erro.
- [ ] Bundle (Task 3) roda com `node` puro, comportamento idêntico ao `npm start` de hoje.
- [ ] `.exe` (Task 4) validado numa máquina Windows real — este é o ponto de maior risco do
  plano (ambiente de execução do agente controlador pode não ter Windows disponível
  diretamente; sinalizar isso já na Task 4 em vez de descobrir no fim).
- [ ] Serviço via NSSM (Task 5) validado numa máquina Windows real: sobrevive a reboot, reinicia
  sozinho após crash.
- [ ] Guia de instalação atualizado refletindo o novo fluxo (sem git clone do repo inteiro).
- [ ] Atualizar o "Log de mudanças" do `CLAUDE.md` ao final, e marcar o passo 5 do roadmap
  "Impressão via agente local" como concluído (ou como parcialmente concluído, se a validação em
  Windows real não puder ser feita nesta sessão).
