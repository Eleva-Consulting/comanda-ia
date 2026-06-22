import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';

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

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token ausente'));

    try {
      const payload = fastify.jwt.verify<{ estabelecimentoId: string; userId: string }>(token);
      socket.data.estabelecimentoId = payload.estabelecimentoId;
      socket.join(payload.estabelecimentoId);
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