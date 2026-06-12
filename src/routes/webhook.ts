import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';

const SimularSchema = Type.Object({
  estabelecimentoId: Type.String(),
  clienteFone: Type.String({ minLength: 8, maxLength: 20 }),
  mensagem: Type.String({ minLength: 1, maxLength: 1000 }),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  // Simula uma mensagem chegando pelo WhatsApp.
  // Responde com mensagem template + link do cardápio público.
  // No futuro, a Evolution API vai enviar essa resposta de volta pro cliente.
  fastify.post('/webhook/simular', {
    schema: { body: SimularSchema },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.body as {
      estabelecimentoId: string;
      clienteFone: string;
      mensagem: string;
    };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const linkCardapio = `${baseUrl}/c/${estabelecimento.slug}`;

    const resposta = `Olá! Bem-vindo ao ${estabelecimento.nome} 🍽️\n\nPara fazer seu pedido, acesse o link abaixo:\n${linkCardapio}\n\nAssim que você finalizar, nossa cozinha começa a preparar! 🔥`;

    return reply.send({ resposta });
  });
}