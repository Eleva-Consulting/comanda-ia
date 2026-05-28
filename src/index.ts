import { buildServer } from './server.js';
import { inicializarSocket } from './socket.js';

const iniciar = async () => {
  const fastify = await buildServer();

  // Garante que todos os plugins (inclusive JWT) carregaram antes de usar fastify.jwt
  await fastify.ready();

  // Anexa o Socket.IO ao servidor HTTP do Fastify
  inicializarSocket(fastify);

  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor rodando em http://localhost:3000');
  } catch (erro) {
    fastify.log.error(erro);
    process.exit(1);
  }
};

iniciar();