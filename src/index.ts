import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

fastify.get('/', async (request, reply) => {
  return { 
    mensagem: 'Olá! Bem-vindo à API do comanda-ia 🍗',
    versao: '0.0.1',
  };
});

const iniciar = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor rodando em http://localhost:3000');
  } catch (erro) {
    fastify.log.error(erro);
    process.exit(1);
  }
};

iniciar();