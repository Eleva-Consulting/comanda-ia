import 'dotenv/config';
import { buildServer } from './server.js';
import { inicializarSocket } from './socket.js';
import { whatsApp } from './whatsapp.js';

async function main() {
  const fastify = await buildServer();

  await fastify.ready();
  inicializarSocket(fastify);
  whatsApp.inicializarSessoes().catch((err) => fastify.log.error({ err }, 'Falha ao inicializar sessões WhatsApp'));

  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`Servidor rodando em ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();