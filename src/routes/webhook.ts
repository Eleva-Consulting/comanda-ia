import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import {
  ProvedorIA,
  MensagemIA,
  ContextoEstabelecimento,
} from '../ia/provedor.js';
import { MockProvedorIA } from '../ia/mock.js';
import { getIO } from '../socket.js';

const provedorIA: ProvedorIA = new MockProvedorIA();

const SimularSchema = Type.Object({
  estabelecimentoId: Type.String(),
  clienteFone: Type.String({ minLength: 8, maxLength: 20 }),
  mensagem: Type.String({ minLength: 1, maxLength: 1000 }),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post('/webhook/simular', {
    schema: { body: SimularSchema },
  }, async (request, reply) => {
    const { estabelecimentoId, clienteFone, mensagem } = request.body as {
      estabelecimentoId: string;
      clienteFone: string;
      mensagem: string;
    };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId },
      include: {
        itens: { where: { disponivel: true }, orderBy: { nome: 'asc' } },
      },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    let conversa = await prisma.conversa.findFirst({
      where: { clienteFone, estabelecimentoId, status: 'ativa' },
    });

    if (!conversa) {
      conversa = await prisma.conversa.create({
        data: { clienteFone, estabelecimentoId },
      });
    }

    await prisma.mensagem.create({
      data: { conversaId: conversa.id, papel: 'cliente', conteudo: mensagem },
    });

    const mensagensDb = await prisma.mensagem.findMany({
      where: { conversaId: conversa.id },
      orderBy: { criadoEm: 'asc' },
    });

    const contexto: ContextoEstabelecimento = {
      nome: estabelecimento.nome,
      cardapio: estabelecimento.itens.map((item) => ({
        nome: item.nome,
        descricao: item.descricao,
        preco: Number(item.preco),
      })),
    };

    const mensagensIA: MensagemIA[] = mensagensDb.map((m) => ({
      papel: m.papel,
      conteudo: m.conteudo,
    }));

    const resposta = await provedorIA.responder(mensagensIA, contexto);

    let pedidoCriadoId: string | null = null;
    if (resposta.pedidoParaRegistrar) {
      const p = resposta.pedidoParaRegistrar;
      const pedido = await prisma.pedido.create({
        data: {
          clienteNome: p.clienteNome,
          clienteFone,
          enderecoEntrega: p.enderecoEntrega,
          total: p.total,
          estabelecimentoId,
          itens: {
            create: p.itens.map((item) => ({
              nomeItem: item.nomeItem,
              quantidade: item.quantidade,
              precoUnit: item.precoUnit,
            })),
          },
        },
        include: { itens: true },
      });
      pedidoCriadoId = pedido.id;

      // EMITE o pedido em tempo real SÓ pra sala desse estabelecimento
      getIO().to(estabelecimentoId).emit('pedido:novo', pedido);

      await prisma.conversa.update({
        where: { id: conversa.id },
        data: { status: 'finalizada' },
      });
    }

    await prisma.mensagem.create({
      data: {
        conversaId: conversa.id,
        papel: 'assistente',
        conteudo: resposta.texto,
      },
    });

    return reply.send({
      conversaId: conversa.id,
      resposta: resposta.texto,
      pedidoCriado: pedidoCriadoId,
    });
  });
}