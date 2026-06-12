import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { getIO } from '../socket.js';

const SlugParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 100 }),
});

const FazerPedidoSchema = Type.Object({
  clienteNome: Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone: Type.String({ minLength: 8, maxLength: 20 }),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String(),
      quantidade: Type.Integer({ minimum: 1, maximum: 100 }),
    }),
    { minItems: 1 }
  ),
});

export async function publicoRoutes(fastify: FastifyInstance) {
  // GET /publico/:slug — carrega cardápio público (sem auth)
  fastify.get('/publico/:slug', {
    schema: { params: SlugParamsSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { slug },
      include: {
        itens: {
          where: { disponivel: true },
          orderBy: { nome: 'asc' },
        },
      },
    });

    if (!estabelecimento || !estabelecimento.ativo) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    // Retornamos só dados não-sensíveis — sem email do dono, sem IDs internos
    return {
      estabelecimento: {
        nome: estabelecimento.nome,
        slug: estabelecimento.slug,
      },
      cardapio: estabelecimento.itens.map((item) => ({
        id: item.id,
        nome: item.nome,
        descricao: item.descricao,
        preco: Number(item.preco),
      })),
    };
  });

  // POST /publico/:slug/pedido — cliente final cria pedido (sem auth)
  fastify.post('/publico/:slug/pedido', {
    schema: { params: SlugParamsSchema, body: FazerPedidoSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { clienteNome, clienteFone, enderecoEntrega, itens } = request.body as {
      clienteNome: string;
      clienteFone: string;
      enderecoEntrega?: string;
      itens: Array<{ itemCardapioId: string; quantidade: number }>;
    };

    // 1. Valida estabelecimento
    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { slug },
    });

    if (!estabelecimento || !estabelecimento.ativo) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    // 2. Busca os itens do cardápio de uma vez
    const itemIds = itens.map((i) => i.itemCardapioId);
    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id: { in: itemIds },
        estabelecimentoId: estabelecimento.id,
        disponivel: true,
      },
    });

    // 3. Valida que todos os itens existem e estão disponíveis
    if (itensCardapio.length !== itens.length) {
      return reply.status(400).send({
        erro: 'Algum item do pedido não está mais disponível',
      });
    }

    // 4. Monta os itens do pedido com SNAPSHOT (nome + preço do momento)
    const itensComSnapshot = itens.map((pedidoItem) => {
      const itemCardapio = itensCardapio.find(
        (ic) => ic.id === pedidoItem.itemCardapioId
      )!;
      return {
        nomeItem: itemCardapio.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit: Number(itemCardapio.preco),
      };
    });

    const total = itensComSnapshot.reduce(
      (soma, item) => soma + item.precoUnit * item.quantidade,
      0
    );

    // 5. Cria o pedido com seus itens (nested write, transação implícita)
    const pedido = await prisma.pedido.create({
      data: {
        clienteNome,
        clienteFone,
        enderecoEntrega,
        total,
        estabelecimentoId: estabelecimento.id,
        itens: {
          create: itensComSnapshot,
        },
      },
      include: { itens: true },
    });

    // 6. Emite via Socket.IO pra cozinha
    getIO().to(estabelecimento.id).emit('pedido:novo', pedido);

    return reply.status(201).send({
      id: pedido.id,
      total: Number(pedido.total),
      mensagem: 'Pedido recebido! A cozinha foi avisada.',
    });
  });
}