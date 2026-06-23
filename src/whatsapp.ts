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

type ConnectionStatus = 'connecting' | 'open' | 'close'

// ── Auth state ────────────────────────────────────────────────────────────────

function toDb(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data, BufferJSON.replacer))
}

function fromDb(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data), BufferJSON.reviver)
}

async function criarAuthState(estabelecimentoId: string) {
  const session = await prisma.whatsAppSession.findUnique({ where: { estabelecimentoId } })

  const creds: AuthenticationCreds = session?.creds
    ? fromDb(session.creds) as AuthenticationCreds
    : initAuthCreds()

  const rawKeys: Record<string, unknown> = session?.keys
    ? fromDb(session.keys) as Record<string, unknown>
    : {}

  const salvarSession = async () => {
    const credsJson = toDb(creds)  as object
    const keysJson  = toDb(rawKeys) as object
    await prisma.whatsAppSession.upsert({
      where:  { estabelecimentoId },
      create: { estabelecimentoId, creds: credsJson, keys: keysJson },
      update: { creds: credsJson, keys: keysJson },
    })
  }

  const keyStore = {
    get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
      const result: Record<string, unknown> = {}
      for (const id of ids) {
        const val = rawKeys[`${type}:${id}`]
        if (val !== undefined) result[id] = val
      }
      return result as any
    },
    set: async (data: Partial<Record<keyof SignalDataTypeMap, Record<string, unknown>>>) => {
      for (const [type, typeData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(typeData ?? {})) {
          const key = `${type}:${id}`
          if (value == null) delete rawKeys[key]
          else rawKeys[key] = value
        }
      }
      await salvarSession()
    },
  }

  return { state: { creds, keys: keyStore as any }, saveCreds: salvarSession }
}

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

// ── WhatsApp Manager ──────────────────────────────────────────────────────────

class WhatsAppManager {
  private sockets  = new Map<string, ReturnType<typeof makeWASocket>>()
  private statuses = new Map<string, ConnectionStatus>()
  private logger   = pino({ level: 'silent' })
  private log      = pino({ level: 'info', base: { pid: process.pid } })

  private criarSocket(
    estabelecimentoId: string,
    state: Awaited<ReturnType<typeof criarAuthState>>['state'],
    saveCreds: () => Promise<void>,
  ) {
    const socket = makeWASocket({ auth: state, logger: this.logger, printQRInTerminal: false })
    this.sockets.set(estabelecimentoId, socket)
    socket.ev.on('creds.update', saveCreds)
    socket.ev.on('messages.upsert', ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        if (msg.key.fromMe) continue
        this.handleMensagem(estabelecimentoId, socket, msg).catch(() => {})
      }
    })
    return socket
  }

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
      where:   { estabelecimentoId, status: 'recebido', formaPagamento: 'pix', criadoEm: { gte: ontemAtras } },
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
      p => p.clienteFone.replace(/\D/g, '').endsWith(foneDigitos)
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

  private async handleMensagem(
    estabelecimentoId: string,
    socket: ReturnType<typeof makeWASocket>,
    msg: any,
  ): Promise<void> {
    const jid = msg.key.remoteJid as string | undefined
    if (!jid || jid.endsWith('@g.us')) return

    const foneRaw = jid.replace('@s.whatsapp.net', '')
    const tipoMsg = msg.message ? Object.keys(msg.message)[0] : null

    // Imagem = comprovante enviado pelo cliente (operador confirma manualmente no painel)
    if (tipoMsg === 'imageMessage') {
      await socket.sendMessage(jid, {
        text: 'Comprovante recebido! 📋 Nosso operador irá verificar o pagamento e confirmar seu pedido em breve.',
      })
      return
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where:  { id: estabelecimentoId },
      select: { nome: true, slug: true },
    })
    if (!estabelecimento) return

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
  }

  async reconectar(estabelecimentoId: string): Promise<void> {
    const { state, saveCreds } = await criarAuthState(estabelecimentoId)
    const socket = this.criarSocket(estabelecimentoId, state, saveCreds)
    this.statuses.set(estabelecimentoId, 'connecting')

    socket.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        this.statuses.set(estabelecimentoId, 'open')
        this.log.info({ estabelecimentoId }, 'WhatsApp conectado (open)')
      }
      if (connection === 'close') {
        this.statuses.set(estabelecimentoId, 'close')
        this.sockets.delete(estabelecimentoId)
        const codigo = (lastDisconnect?.error as Boom)?.output?.statusCode
        this.log.warn({ estabelecimentoId, codigo }, 'WhatsApp desconectado')
        if (codigo !== DisconnectReason.loggedOut) {
          setTimeout(() => this.reconectar(estabelecimentoId), 5000)
        } else {
          await prisma.whatsAppSession.deleteMany({ where: { estabelecimentoId } })
        }
      }
    })
  }

  async conectar(estabelecimentoId: string): Promise<{ qrCode: string | null; status: ConnectionStatus }> {
    const socketExistente = this.sockets.get(estabelecimentoId)
    if (socketExistente) socketExistente.end(undefined)

    const { state, saveCreds } = await criarAuthState(estabelecimentoId)
    const socket = this.criarSocket(estabelecimentoId, state, saveCreds)
    this.statuses.set(estabelecimentoId, 'connecting')

    return new Promise((resolve) => {
      let resolvido = false

      const timer = setTimeout(() => {
        if (!resolvido) {
          resolvido = true
          resolve({ qrCode: null, status: 'close' })
        }
      }, 30_000)

      socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr && !resolvido) {
          resolvido = true
          clearTimeout(timer)
          const dataUrl = await QRCode.toDataURL(qr)
          resolve({ qrCode: dataUrl, status: 'connecting' })
        }

        if (connection === 'open') {
          this.statuses.set(estabelecimentoId, 'open')
          if (!resolvido) {
            resolvido = true
            clearTimeout(timer)
            resolve({ qrCode: null, status: 'open' })
          }
        }

        if (connection === 'close') {
          this.statuses.set(estabelecimentoId, 'close')
          this.sockets.delete(estabelecimentoId)
          const codigo = (lastDisconnect?.error as Boom)?.output?.statusCode
          if (codigo !== DisconnectReason.loggedOut) {
            setTimeout(() => this.reconectar(estabelecimentoId), 5000)
          } else {
            await prisma.whatsAppSession.deleteMany({ where: { estabelecimentoId } })
          }
          if (!resolvido) {
            resolvido = true
            clearTimeout(timer)
            resolve({ qrCode: null, status: 'close' })
          }
        }
      })
    })
  }

  getStatus(estabelecimentoId: string): ConnectionStatus {
    return this.statuses.get(estabelecimentoId) ?? 'close'
  }

  async enviarMensagem(estabelecimentoId: string, telefone: string, texto: string): Promise<void> {
    const status = this.statuses.get(estabelecimentoId)
    const socket = this.sockets.get(estabelecimentoId)
    if (!socket || status !== 'open') {
      this.log.error({ estabelecimentoId, status: status ?? 'undefined' }, 'WhatsApp: tentativa de envio com socket desconectado')
      throw new Error('WhatsApp não conectado')
    }
    const fone = telefone.replace(/\D/g, '')
    const jid  = fone.startsWith('55') ? `${fone}@s.whatsapp.net` : `55${fone}@s.whatsapp.net`
    this.log.info({ estabelecimentoId, foneOriginal: telefone, jid }, 'WhatsApp: enviando mensagem')
    await socket.sendMessage(jid, { text: texto })
    this.log.info({ jid }, 'WhatsApp: mensagem enviada com sucesso')
  }

  async desconectar(estabelecimentoId: string): Promise<void> {
    const socket = this.sockets.get(estabelecimentoId)
    if (socket) {
      socket.end(undefined)
      this.sockets.delete(estabelecimentoId)
    }
    this.statuses.set(estabelecimentoId, 'close')
    await prisma.whatsAppSession.deleteMany({ where: { estabelecimentoId } })
    this.log.info({ estabelecimentoId }, 'WhatsApp: desconectado e sessão removida')
  }

  async inicializarSessoes(): Promise<void> {
    const sessoes = await prisma.whatsAppSession.findMany({
      select: { estabelecimentoId: true },
    })
    this.log.info({ total: sessoes.length }, 'WhatsApp: inicializando sessões')
    for (const { estabelecimentoId } of sessoes) {
      this.reconectar(estabelecimentoId).catch((err) => {
        this.log.error({ err, estabelecimentoId }, 'WhatsApp: falha ao reconectar sessão')
      })
    }
  }
}

export const whatsApp = new WhatsAppManager()
