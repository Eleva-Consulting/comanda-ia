import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { prisma } from './database.js';
import { salasParaConexao } from './utils/salasSocket.js';

let io: Server;

function origensPermitidas(): string[] {
  const dev = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const prod = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((u) => u.trim()).filter(Boolean)
    : [];
  return [...dev, ...prod];
}

export function inicializarSocket(fastify: FastifyInstance) {
  io = new Server(fastify.server, {
    cors: {
      origin: origensPermitidas(),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    // Conexão do agente de impressão local (não é uma pessoa fazendo login) — autentica
    // por token de dispositivo próprio em vez de JWT, gerado em Configurações
    // (POST /meu-estabelecimento/agente-impressao/token). Sempre entra na sala ampla do
    // estabelecimento (mesmo comportamento de qualquer conexão sem `contexto: 'producao'`)
    // — precisa ver item novo de qualquer setor pra decidir em qual impressora imprimir.
    if (socket.handshake.auth?.tipoConexao === 'agente-impressao') {
      const { estabelecimentoId, deviceToken } = socket.handshake.auth as { estabelecimentoId?: string; deviceToken?: string };
      if (!estabelecimentoId || !deviceToken) return next(new Error('Credenciais do agente ausentes'));

      const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId } });
      if (!estabelecimento?.tokenAgenteImpressao) return next(new Error('Agente de impressão não configurado'));

      const valido = await bcrypt.compare(deviceToken, estabelecimento.tokenAgenteImpressao);
      if (!valido) return next(new Error('Token inválido'));

      socket.data.estabelecimentoId = estabelecimentoId;
      socket.join(estabelecimentoId);
      return next();
    }

    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token ausente'));

    try {
      const payload = fastify.jwt.verify<{ estabelecimentoId: string; userId: string; setorId: string | null }>(token);
      const contexto = (socket.handshake.auth?.contexto as string | undefined) ?? null;
      socket.data.estabelecimentoId = payload.estabelecimentoId;

      for (const sala of salasParaConexao({
        estabelecimentoId: payload.estabelecimentoId,
        setorId:           payload.setorId,
        contexto,
      })) {
        socket.join(sala);
      }

      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  fastify.log.info('Socket.IO inicializado');
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO não foi inicializado');
  return io;
}
