import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';

// Dados que anexamos a cada socket conectado
interface SocketData {
  estabelecimentoId: string;
}

// Singleton — guardamos a instância pra usar em outros módulos (ex: webhook)
let io: Server<any, any, any, SocketData> | null = null;

export function inicializarSocket(fastify: FastifyInstance) {
  io = new Server<any, any, any, SocketData>(fastify.server, {
    cors: {
      origin: '*', // DEV — em produção, restringir ao domínio do painel
    },
  });

  // Middleware de autenticação — roda no handshake de cada conexão.
  // A cozinha precisa apresentar um JWT válido pra conectar.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Token ausente'));
    }

    try {
      const payload = fastify.jwt.verify<{
        userId: string;
        estabelecimentoId: string;
        role: string;
      }>(token);
      socket.data.estabelecimentoId = payload.estabelecimentoId;
      next();
    } catch (erro) {
      next(new Error('Token inválido'));
    }
  });

  // Quando um painel conecta com sucesso
  io.on('connection', (socket) => {
    const { estabelecimentoId } = socket.data;

    // Entra na SALA do seu estabelecimento — isolamento multi-tenant
    socket.join(estabelecimentoId);

    fastify.log.info(`Painel conectado ao estabelecimento ${estabelecimentoId}`);

    socket.on('disconnect', () => {
      fastify.log.info(`Painel desconectado do estabelecimento ${estabelecimentoId}`);
    });
  });

  return io;
}

// Acessa a instância em qualquer lugar (ex: webhook ao criar pedido)
export function getIO(): Server<any, any, any, SocketData> {
  if (!io) {
    throw new Error('Socket.IO ainda não foi inicializado');
  }
  return io;
}