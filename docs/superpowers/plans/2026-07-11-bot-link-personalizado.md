# Bot personaliza o link do cardápio + mensagens atualizadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um cliente manda mensagem pro bot de WhatsApp do estabelecimento, o link do
cardápio que ele recebe já vem com o telefone dele embutido (pré-preenchendo o checkout), e as
mensagens do bot deixam de mencionar o fluxo obsoleto de "enviar comprovante".

**Architecture:** `src/whatsapp.ts` já conhece o telefone de quem manda mensagem (`foneRaw`,
extraído do `jid` do remetente) — só precisa passar esse valor como query param no link que já
monta hoje. O frontend (`CardapioPublico.tsx`) lê esse query param na montagem do modal de
checkout e usa como valor inicial do campo de telefone, que continua editável. Junto, removemos
código morto (`handleComprovante` e o que só ele usava) que dava suporte a um fluxo de pagamento
manual que não existe mais em nenhum caminho do checkout atual.

**Tech Stack:** Node 22 + TypeScript + Baileys (`@whiskeysockets/baileys`) no backend; React 19 +
Vite no frontend. Sem infraestrutura de teste automatizado para nenhum dos dois arquivos tocados
neste plano (nem para `src/whatsapp.ts`, nem para nenhum componente em `frontend/`) — verificação
será manual em todas as tarefas, seguindo o padrão já usado no projeto para essa área.

## Global Constraints

- Captura automática de telefone só funciona quando o cliente inicia a conversa pelo bot de
  WhatsApp — não implementar nenhum workaround pra capturar telefone de links genéricos/QR code
  (limitação aceita, documentada na spec).
- O campo de telefone no checkout (`ModalCheckout` em `CardapioPublico.tsx`) continua **editável e
  opcional** — o pré-preenchimento é só uma conveniência, nunca trava o campo nem torna obrigatório.
- Não remover a dependência `@anthropic-ai/sdk` do `package.json` neste plano — checar outros usos
  no projeto antes é tarefa separada, fora de escopo.
- Sem testes automatizados novos para `src/whatsapp.ts` ou `CardapioPublico.tsx` — nenhum dos dois
  tem infraestrutura de teste hoje; verificação é manual (rodar `tsc --noEmit`, ler o diff, e para
  o frontend, testar no navegador).

---

### Task 1: Personalizar o link do bot e atualizar as mensagens de texto

**Files:**
- Modify: `src/whatsapp.ts` (dentro do método `handleMensagem`, e o handler de `imageMessage`)

**Interfaces:**
- Consumes: nada de tarefas anteriores (primeira tarefa do plano).
- Produces: a variável `menuLink` (dentro de `handleMensagem`) passa a incluir `?telefone=${foneRaw}`
  — nenhuma tarefa depois deste plano depende diretamente dessa variável (é interna ao método).

- [ ] **Step 1: Atualizar a resposta a imagens recebidas**

Em `src/whatsapp.ts`, dentro de `handleMensagem`, localize este bloco (é o primeiro `if` do
método, tratando mensagens de imagem):

```ts
    // Imagem = comprovante enviado pelo cliente (operador confirma manualmente no painel)
    if (tipoMsg === 'imageMessage') {
      await socket.sendMessage(jid, {
        text: 'Comprovante recebido! 📋 Nosso operador irá verificar o pagamento e confirmar seu pedido em breve.',
      })
      return
    }
```

Substitua por:

```ts
    // Imagem recebida fora de qualquer fluxo de confirmação (pagamento confirma sozinho agora)
    if (tipoMsg === 'imageMessage') {
      await socket.sendMessage(jid, {
        text: 'Para fazer um pedido, é só usar o link do cardápio que te mandei por aqui! Se já pediu, a confirmação chega automaticamente assim que o pagamento é processado.',
      })
      return
    }
```

- [ ] **Step 2: Incluir o telefone no link e atualizar as 3 mensagens que o usam**

Mais abaixo no mesmo método, localize este bloco completo (da montagem de `menuLink` até o fim do
`if/else` que decide qual mensagem mandar):

```ts
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0].trim() ?? 'https://comanda-ia.vercel.app'
    const menuLink    = `${frontendUrl}/c/${estabelecimento.slug}`
    const primeiroNome = (msg.pushName as string | undefined)?.split(' ')[0]
    const saudacao     = primeiroNome ? `, ${primeiroNome}` : ''

    // Sessão ativa = qualquer conversa com atividade nas últimas 24h
    const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const conversaAtiva = await prisma.conversa.findFirst({
      where: { estabelecimentoId, clienteFone: foneRaw, atualizadoEm: { gte: vinteQuatroHorasAtras } },
    })

    if (conversaAtiva) {
      // Sessão em andamento: atualiza timestamp e manda só o link (sem repetir o boas-vindas)
      await prisma.conversa.update({
        where: { id: conversaAtiva.id },
        data:  { status: 'ativa' }, // força @updatedAt para manter a sessão viva
      })
      await socket.sendMessage(jid, {
        text: `Aqui está o link do cardápio:\n\n🛒 ${menuLink}\n\nSe já fez o pedido e pagou, envie o comprovante PIX aqui que confirmamos na hora! 😊`,
      })
      return
    }

    // Fora da sessão: verifica se é cliente recorrente
    const conversaAnterior = await prisma.conversa.findFirst({
      where:   { estabelecimentoId, clienteFone: foneRaw },
      orderBy: { criadoEm: 'desc' },
    })

    await prisma.conversa.create({
      data: {
        estabelecimentoId,
        clienteFone: foneRaw,
        clienteNome: (msg.pushName as string | undefined) ?? null,
      },
    })

    if (conversaAnterior) {
      // Cliente que já comprou antes — nova visita
      await socket.sendMessage(jid, {
        text: `Que bom ter você de volta${saudacao}! 😊\n\nVeja nosso cardápio e faça seu pedido:\n\n🛒 ${menuLink}\n\nApós o PIX, envie o comprovante aqui que confirmamos rapidinho!`,
      })
    } else {
      // Novo cliente
      await socket.sendMessage(jid, {
        text: `Olá${saudacao}! 👋 Bem-vindo(a) à *${estabelecimento.nome}*!\n\nVeja nosso cardápio e faça seu pedido pelo link:\n\n🛒 ${menuLink}\n\nApós realizar o pedido e efetuar o PIX, envie o comprovante aqui que confirmamos na hora! 😊`,
      })
    }
```

Substitua por (só duas mudanças: `menuLink` ganha `?telefone=${foneRaw}`, e as 3 mensagens trocam
a linha final sobre comprovante):

```ts
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0].trim() ?? 'https://comanda-ia.vercel.app'
    const menuLink    = `${frontendUrl}/c/${estabelecimento.slug}?telefone=${foneRaw}`
    const primeiroNome = (msg.pushName as string | undefined)?.split(' ')[0]
    const saudacao     = primeiroNome ? `, ${primeiroNome}` : ''

    // Sessão ativa = qualquer conversa com atividade nas últimas 24h
    const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const conversaAtiva = await prisma.conversa.findFirst({
      where: { estabelecimentoId, clienteFone: foneRaw, atualizadoEm: { gte: vinteQuatroHorasAtras } },
    })

    if (conversaAtiva) {
      // Sessão em andamento: atualiza timestamp e manda só o link (sem repetir o boas-vindas)
      await prisma.conversa.update({
        where: { id: conversaAtiva.id },
        data:  { status: 'ativa' }, // força @updatedAt para manter a sessão viva
      })
      await socket.sendMessage(jid, {
        text: `Aqui está o link do cardápio:\n\n🛒 ${menuLink}\n\nDepois de fazer o pedido, você recebe a confirmação automaticamente por aqui! 😊`,
      })
      return
    }

    // Fora da sessão: verifica se é cliente recorrente
    const conversaAnterior = await prisma.conversa.findFirst({
      where:   { estabelecimentoId, clienteFone: foneRaw },
      orderBy: { criadoEm: 'desc' },
    })

    await prisma.conversa.create({
      data: {
        estabelecimentoId,
        clienteFone: foneRaw,
        clienteNome: (msg.pushName as string | undefined) ?? null,
      },
    })

    if (conversaAnterior) {
      // Cliente que já comprou antes — nova visita
      await socket.sendMessage(jid, {
        text: `Que bom ter você de volta${saudacao}! 😊\n\nVeja nosso cardápio e faça seu pedido:\n\n🛒 ${menuLink}\n\nDepois de fazer o pedido, você recebe a confirmação automaticamente por aqui!`,
      })
    } else {
      // Novo cliente
      await socket.sendMessage(jid, {
        text: `Olá${saudacao}! 👋 Bem-vindo(a) à *${estabelecimento.nome}*!\n\nVeja nosso cardápio e faça seu pedido pelo link:\n\n🛒 ${menuLink}\n\nDepois de fazer o pedido, você recebe a confirmação automaticamente por aqui! 😊`,
      })
    }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual do conteúdo do link**

Não há infraestrutura de teste automatizado para `src/whatsapp.ts` neste projeto. Confirme
manualmente, lendo o diff, que:
- `menuLink` agora termina em `?telefone=${foneRaw}` (não em query string vazia nem faltando o `?`).
- Nenhuma das 3 mensagens de texto restantes menciona a palavra "comprovante".
- A mensagem de resposta a `imageMessage` não promete mais verificação por "operador".

- [ ] **Step 5: Rodar suíte de testes existente (não deve haver regressão)**

Run: `cd /Users/vinicius/comanda-ia && npm test`
Expected: 50 testes passando, 7 arquivos (nenhum teste cobre `whatsapp.ts`, mas confirme que nada
mais quebrou).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add src/whatsapp.ts
git commit -m "feat: bot personaliza link do cardápio com telefone e atualiza mensagens sobre comprovante"
```

---

### Task 2: Remover código morto do fluxo antigo de comprovante manual

**Files:**
- Modify: `src/whatsapp.ts` (imports no topo do arquivo, e remoção de `ResultadoValidacao`,
  `validarComprovanteIA`, `nomesBatem`, `handleComprovante`)

**Interfaces:**
- Consumes: nenhuma interface produzida pela Task 1 (esta tarefa só remove código não utilizado,
  não toca nas linhas que a Task 1 modificou).
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Remover os imports que só o código morto usava**

No topo de `src/whatsapp.ts`, localize:

```ts
import makeWASocket, {
  DisconnectReason,
  BufferJSON,
  initAuthCreds,
  downloadMediaMessage,
  type AuthenticationCreds,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import Anthropic from '@anthropic-ai/sdk'
import pino from 'pino'
import QRCode from 'qrcode'
import { prisma } from './database.js'
import { getIO } from './socket.js'
```

Substitua por (remove `downloadMediaMessage` do import do Baileys, remove a linha inteira do
import do `Anthropic`):

```ts
import makeWASocket, {
  DisconnectReason,
  BufferJSON,
  initAuthCreds,
  type AuthenticationCreds,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import QRCode from 'qrcode'
import { prisma } from './database.js'
import { getIO } from './socket.js'
```

- [ ] **Step 2: Remover a interface e as duas funções de validação por IA**

Localize e apague este bloco inteiro (começa no comentário `// ── Helpers de validação`, termina
logo antes do comentário `// ── WhatsApp Manager`):

```ts
// ── Helpers de validação ──────────────────────────────────────────────────────

interface ResultadoValidacao {
  isComprovante: boolean
  valor:         number | null
  nomePagador:   string | null
}

async function validarComprovanteIA(imageBuffer: Buffer, mimeType: string): Promise<ResultadoValidacao> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { isComprovante: true, valor: null, nomePagador: null }

  const anthropic = new Anthropic({ apiKey })
  const base64    = imageBuffer.toString('base64')

  const tipo = (
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
      ? mimeType
      : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  try {
    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipo, data: base64 } },
          {
            type: 'text',
            text: `Analise esta imagem. É um comprovante de pagamento PIX brasileiro?
Se sim, extraia o valor pago e o nome do pagador.
Responda APENAS com JSON, sem texto adicional:
{"is_comprovante": bool, "valor": number|null, "nome_pagador": string|null}`,
          },
        ],
      }],
    })

    const texto = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '{}'
    const json  = JSON.parse(texto)
    return {
      isComprovante: Boolean(json.is_comprovante),
      valor:         typeof json.valor === 'number' ? json.valor : null,
      nomePagador:   typeof json.nome_pagador === 'string' ? json.nome_pagador : null,
    }
  } catch {
    // Em caso de erro na IA, aceita sem validar (não bloqueia o cliente)
    return { isComprovante: true, valor: null, nomePagador: null }
  }
}

// Retorna true se ao menos uma palavra do nome do pedido aparece no nome do comprovante
function nomesBatem(nomeOrdem: string, nomeComprovante: string | null): boolean {
  if (!nomeComprovante) return true

  const normalizar = (s: string) =>
    s.toLowerCase()
     .normalize('NFD')
     .replace(/[̀-ͯ]/g, '')
     .split(/\s+/)
     .filter(w => w.length > 2)

  const palavrasOrdem = normalizar(nomeOrdem)
  const palavrasComp  = normalizar(nomeComprovante)

  return palavrasOrdem.some(w => palavrasComp.includes(w))
}

```

- [ ] **Step 3: Remover o método `handleComprovante`**

Dentro da classe `WhatsAppManager`, localize e apague este método inteiro (fica logo antes de
`private async handleMensagem`):

```ts
  private async handleComprovante(
    estabelecimentoId: string,
    socket: ReturnType<typeof makeWASocket>,
    jid: string,
    foneRaw: string,
    msg: any,
  ): Promise<void> {
    const ontemAtras  = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const foneDigitos = foneRaw.replace(/\D/g, '').slice(-8)
    const mimeType    = (msg.message?.imageMessage?.mimetype as string | undefined) ?? 'image/jpeg'

    // Baixa a imagem
    let imageBuffer: Buffer | null = null
    try {
      imageBuffer = await downloadMediaMessage(
        msg, 'buffer', {},
        { logger: this.logger, reuploadRequest: socket.updateMediaMessage },
      ) as Buffer
    } catch {
      // Se não conseguir baixar, tenta só pelo telefone
    }

    // Valida com IA (se não conseguiu baixar, retorna aceito sem validar)
    const validacao = imageBuffer
      ? await validarComprovanteIA(imageBuffer, mimeType)
      : { isComprovante: true, valor: null, nomePagador: null }

    if (!validacao.isComprovante) {
      await socket.sendMessage(jid, {
        text: 'Não consegui identificar um comprovante PIX nessa imagem. Por favor, envie uma foto clara do comprovante de pagamento.',
      })
      return
    }

    // Busca pedidos PIX pendentes nas últimas 24h
    const pedidosPendentes = await prisma.pedido.findMany({
      where:   { estabelecimentoId, status: 'recebido', formaPagamento: 'pix', mpPaymentId: null, criadoEm: { gte: ontemAtras } },
      orderBy: { criadoEm: 'desc' },
      include: { itens: true },
    })

    if (pedidosPendentes.length === 0) {
      await socket.sendMessage(jid, {
        text: `Não há pedidos PIX pendentes no momento.\n\nFaça seu pedido pelo cardápio e depois envie o comprovante aqui! 😊`,
      })
      return
    }

    // 1ª tentativa: match por telefone
    let pedido = pedidosPendentes.find(
      p => p.clienteFone && p.clienteFone.replace(/\D/g, '').endsWith(foneDigitos)
    )

    // 2ª tentativa: match por valor (quando o cliente usa número diferente)
    if (!pedido && validacao.valor !== null) {
      pedido = pedidosPendentes.find(
        p => Math.abs(Number(p.total) - validacao.valor!) < 0.02
      )
    }

    if (!pedido) {
      const valorTxt = validacao.valor !== null ? ` de R$ ${validacao.valor.toFixed(2)}` : ''
      await socket.sendMessage(jid, {
        text: `Não encontrei um pedido PIX pendente${valorTxt} para confirmar. Verifique se realizou o pedido pelo link do cardápio ou se o pagamento foi feito no valor correto.`,
      })
      return
    }

    // Valida o valor
    if (validacao.valor !== null && Math.abs(validacao.valor - Number(pedido.total)) > 0.02) {
      await socket.sendMessage(jid, {
        text: `⚠️ O valor no comprovante (*R$ ${validacao.valor.toFixed(2)}*) não confere com o pedido (*R$ ${Number(pedido.total).toFixed(2)}*). Verifique se enviou o comprovante correto.`,
      })
      return
    }

    // Valida o nome (fuzzy)
    if (validacao.nomePagador && !nomesBatem(pedido.clienteNome, validacao.nomePagador)) {
      await socket.sendMessage(jid, {
        text: `⚠️ O nome no comprovante (*${validacao.nomePagador}*) não confere com o nome do pedido (*${pedido.clienteNome}*). Se houver algum engano, entre em contato conosco.`,
      })
      return
    }

    // Tudo certo — confirma o pedido
    const pedidoAtualizado = await prisma.pedido.update({
      where:   { id: pedido.id },
      data:    { status: 'em_preparo' },
      include: { itens: true },
    })
    getIO().to(estabelecimentoId).emit('pedido:atualizado', pedidoAtualizado)

    const codigo = pedido.id.slice(-6).toUpperCase()
    await socket.sendMessage(jid, {
      text: `✅ *Pagamento confirmado!*\n\nSeu pedido *#${codigo}* entrou para a cozinha agora. Te avisamos quando estiver pronto! 🍳`,
    })
  }

```

- [ ] **Step 4: Verificar que compila (confirma que nada mais referenciava o código removido)**

Run: `cd /Users/vinicius/comanda-ia && npx tsc --noEmit`
Expected: sem erros. Se der erro de import não utilizado ou símbolo não encontrado, confira se
sobrou alguma referência a `downloadMediaMessage`, `Anthropic`, `ResultadoValidacao`,
`validarComprovanteIA`, `nomesBatem` ou `handleComprovante` em outro lugar do arquivo.

- [ ] **Step 5: Rodar suíte de testes existente**

Run: `cd /Users/vinicius/comanda-ia && npm test`
Expected: 50 testes passando, 7 arquivos.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia
git add src/whatsapp.ts
git commit -m "refactor: remove código morto do fluxo antigo de comprovante manual via IA"
```

---

### Task 3: Pré-preencher telefone no checkout a partir do link

**Files:**
- Modify: `frontend/src/pages/CardapioPublico.tsx` (adiciona uma função helper e usa no estado
  inicial de `clienteFone` dentro do componente `ModalCheckout`)

**Interfaces:**
- Consumes: nada das tarefas anteriores (Tasks 1 e 2 são só backend, arquivo diferente).
- Produces: nada consumido depois (última tarefa do plano).

- [ ] **Step 1: Adicionar a função que lê e formata o telefone da URL**

Em `frontend/src/pages/CardapioPublico.tsx`, logo após a função `chaveCarrinho` (linha 28-30 hoje):

```ts
function chaveCarrinho(itemId: string, acompanhamento: string | null): string {
  return `${itemId}::${acompanhamento ?? ''}`
}
```

Adicione, logo depois:

```ts

function formatarTelefoneDaUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const bruto = params.get('telefone')
  if (!bruto) return ''
  const digitos = bruto.replace(/\D/g, '').replace(/^55/, '')
  if (digitos.length < 3) return digitos
  return `${digitos.slice(0, 2)} ${digitos.slice(2)}`
}
```

- [ ] **Step 2: Usar a função como valor inicial do campo de telefone**

Dentro do componente `ModalCheckout`, localize:

```ts
  const [clienteNome, setClienteNome] = useState('')
  const [clienteFone, setClienteFone] = useState('')
```

Substitua por:

```ts
  const [clienteNome, setClienteNome] = useState('')
  const [clienteFone, setClienteFone] = useState(() => formatarTelefoneDaUrl())
```

(O campo continua exatamente como antes — mesmo `input`, mesmo `onChange`, mesmo `placeholder`,
opcional e editável. Só o valor inicial muda.)

- [ ] **Step 3: Verificar que compila**

Run: `cd /Users/vinicius/comanda-ia/frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no navegador**

Não há infraestrutura de teste automatizado de componentes React neste projeto (`frontend/`) —
verificação é manual, no navegador:

1. Rodar `cd /Users/vinicius/comanda-ia/frontend && npm run dev`.
2. Acessar `http://localhost:5173/c/{slug-de-um-estabelecimento-de-teste}?telefone=5585991152680`
   (troque `{slug-de-um-estabelecimento-de-teste}` por um slug real do banco local).
3. Abrir o checkout (botão de carrinho) e confirmar que o campo "Telefone (WhatsApp)" já vem
   preenchido com `85 991152680`.
4. Confirmar que o campo continua editável (apagar e digitar outro valor funciona normalmente).
5. Acessar a mesma URL **sem** o parâmetro `?telefone=` e confirmar que o campo continua vazio por
   padrão, como hoje.
6. Completar um pedido de teste com o telefone pré-preenchido e confirmar que ele chega
   corretamente no campo `clienteFone` do pedido criado (visível na Cozinha ou Histórico).

- [ ] **Step 5: Rodar suíte de testes existente do backend (garante que nada quebrou)**

Run: `cd /Users/vinicius/comanda-ia && npm test`
Expected: 50 testes passando, 7 arquivos (este projeto não tem testes de frontend; esta suíte
cobre só o backend, mas confirma que a Task 3 — só frontend — não afetou o backend).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinicius/comanda-ia/frontend
git add src/pages/CardapioPublico.tsx
git commit -m "feat: pré-preenche telefone no checkout a partir do link enviado pelo bot"
```
