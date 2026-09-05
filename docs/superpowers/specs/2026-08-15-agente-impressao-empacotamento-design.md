# Empacotamento do agente de impressão local (Windows)

**Data:** 2026-08-15
**Status:** aprovado pelo usuário (design validado em conversa)

## Problema

O agente de impressão local (`agente-impressao/`, em produção desde 2026-08-02 — ver roadmap
"Impressão via agente local" no `CLAUDE.md`, passo 4) já funciona de ponta a ponta, mas instalar
ele num restaurante novo hoje é manual e frágil:

1. Baixar o repositório inteiro (git clone ou "Download ZIP" do GitHub) — o repo é **público**,
   então isso também expõe todo o código-fonte do SaaS pro computador do restaurante, não só o
   agente.
2. `npm install` na pasta `agente-impressao/` — exige Node instalado na máquina.
3. Criar um `.env` manualmente com `ESTABELECIMENTO_ID`/`DEVICE_TOKEN` (documentado hoje em
   `docs/agente-impressao-windows-passo-a-passo.pdf`).
4. Rodar `npm start` manual — não sobrevive a reboot do PC; alguém precisa lembrar de religar
   toda vez.
5. Se a impressora cair da rede no meio do expediente, `enviarParaImpressora`
   (`agente-impressao/src/imprimir.ts`) só rejeita a Promise, o erro é logado em
   `processarRodada` (`agente-impressao/src/index.ts`) e o ticket é perdido pra sempre — sem
   fila, sem retry.

## Escopo confirmado com o usuário

Só **Windows** por enquanto (único ambiente real validado é a galeteria de teste, PC Windows —
igual ao passo 4 original). As três frentes abaixo são todas prioridade, endereçadas juntas
nesta iniciativa.

## Abordagem

### 1. Executável único via Node SEA

Node 22 tem suporte nativo a **Single Executable Applications**
(`node --experimental-sea-config`), sem depender de `pkg`/`nexe` de terceiros. O agente tem só
duas dependências de runtime (`dotenv`, `socket.io-client`), ambas puro JS sem addons nativos —
nada que historicamente complique esse tipo de bundling.

- Um bundler (`esbuild`, já leve o suficiente pra não virar dependência pesada) compila
  `agente-impressao/src/index.ts` — incluindo o import cross-pacote de
  `src/utils/escPosTicket.ts` (o mesmo usado pelas páginas de impressão via navegador) — num
  único arquivo JS.
- O blob SEA é gerado a partir desse bundle e injetado numa cópia local do `node.exe`,
  resultando em `comanda-ia-agente-impressao.exe`, autocontido (não precisa de Node/npm
  instalado na máquina do restaurante).
- Configuração via `.env` ao lado do `.exe` continua exatamente igual — não muda a experiência
  de quem configura.
- Resolve de brinde o vazamento de código-fonte: o que circula agora é um binário compilado do
  agente, não mais um clone do repositório público inteiro.

### 2. Serviço do Windows via NSSM

[NSSM](https://nssm.cc/) (Non-Sucking Service Manager) registra o `.exe` como serviço do
Windows:

- Sobrevive sem usuário logado.
- Reinicia sozinho o processo se ele cair.
- Loga stdout/stderr em arquivo nativamente — hoje o agente só tem `console.log`, sem nenhuma
  persistência de log.

Alternativa considerada e descartada: `node-windows` (lib npm que gera wrapper de serviço) —
adicionaria dependência ao `package.json` do agente e ainda exige instalar como admin, sem
vantagem clara sobre baixar o `nssm.exe` (ferramenta única, sem instalação própria, gratuita,
amplamente usada pra exatamente esse caso). Decisão: NSSM como ferramenta externa referenciada
no guia de instalação, não como dependência npm do projeto.

### 3. Fila de retry com expiração

- Novo módulo `agente-impressao/src/filaImpressao.ts`: fila persistida em arquivo JSON local
  (ao lado do `.exe`/`.env`) — sobrevive a reinício do agente/serviço, não só a falhas em
  memória.
- Ao falhar `enviarParaImpressora`, o ticket entra na fila com timestamp de quando foi gerado.
- Um `setInterval` tenta reprocessar a fila periodicamente (ex.: a cada 30s).
- Item expira depois de um tempo configurável (ex.: 30–60min) — descartado com log de erro
  claro ("ticket descartado após expirar, impressora seguiu offline"), pra nunca imprimir um
  pedido de horas atrás quando a impressora enfim voltar.
- Fila por impressora (`impressoraIp`) — uma impressora offline não deve travar o reenvio pras
  demais.

## Fora de escopo (decisão explícita do usuário)

- Empacotamento pra Linux/Raspberry Pi — mencionado na visão de longo prazo do roadmap original
  ("roda em qualquer PC ou até um Raspberry Pi"), fica pra quando houver demanda real.
- Decidir se o agente roda em paralelo ao modelo antigo (quiosque) ou substitui — cada
  restaurante decide na hora de instalar; o quiosque continua existindo, nada nele muda aqui.
- Assinatura de código do `.exe` (Windows SmartScreen pode alertar "editor desconhecido") —
  aceitável por ora, é instalação manual assistida num único restaurante, não distribuição em
  massa.

## Migração

Sem migration de banco — puramente empacotamento/infra do agente já existente. Nenhuma
rota/schema do backend principal muda.
