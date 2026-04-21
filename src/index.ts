import { buildServer } from './server.js';

const iniciar = async () => {
  const fastify = await buildServer();

  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor rodando em http://localhost:3000');
  } catch (erro) {
    fastify.log.error(erro);
    process.exit(1);
  }
};

iniciar();