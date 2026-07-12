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

private async handleMensagem(
    estabelecimentoId: string,
    socket: ReturnType<typeof makeWASocket>,
    msg: any,
  ): Promise<void> {
    const jid = msg.key.remoteJid as string | undefined
    if (!jid || jid.endsWith('@g.us')) return

    const foneRaw = jid.replace('@s.whatsapp.net', '')
    const tipoMsg = msg.message ? Object.keys(msg.message)[0] : null

    // Imagem recebida fora de qualquer fluxo de confirmação (pagamento confirma sozinho agora)
    if (tipoMsg === 'imageMessage') {
      await socket.sendMessage(jid, {
        text: 'Para fazer um pedido, é só usar o link do cardápio que te mandei por aqui! Se já pediu, a confirmação chega automaticamente assim que o pagamento é processado.',
      })
      return
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where:  { id: estabelecimentoId },
      select: { nome: true, slug: true },
    })
    if (!estabelecimento) return

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
