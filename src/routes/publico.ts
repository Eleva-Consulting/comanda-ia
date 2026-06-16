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

type ItemPedidoInput = { itemCardapioId: string; quantidade: number };
type ItemCardapioRow = { id: string; nome: string; preco: unknown; descricao?: string | null; [key: string]: unknown };

export async function publicoRoutes(fastify: FastifyInstance) {
  // GET /publico/:slug — carrega cardápio público (sem auth)
  // Bloqueado para estabelecimentos não ativos
  fastify.get('/publico/:slug', {
    schema: { params: SlugParamsSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { slug },
      include: {
        itens: { where: { disponivel: true }, orderBy: { nome: 'asc' } },
      },
    });

    // Só estabelecimentos com status 'ativo' são acessíveis publicamente
    if (!estabelecimento || estabelecimento.status !== 'ativo') {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    return {
      estabelecimento: { nome: estabelecimento.nome, slug: estabelecimento.slug },
      cardapio: estabelecimento.itens.map((item: ItemCardapioRow) => ({
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
      itens: ItemPedidoInput[];
    };

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { slug } });
    if (!estabelecimento || estabelecimento.status !== 'ativo') {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const itemIds = itens.map((i: ItemPedidoInput) => i.itemCardapioId);
    const itensCardapio: ItemCardapioRow[] = await prisma.itemCardapio.findMany({
      where: { id: { in: itemIds }, estabelecimentoId: estabelecimento.id, disponivel: true },
    });

    if (itensCardapio.length !== itens.length) {
      return reply.status(400).send({ erro: 'Algum item do pedido não está mais disponível' });
    }

    const itensComSnapshot = itens.map((pedidoItem: ItemPedidoInput) => {
      const ic = itensCardapio.find((ic: ItemCardapioRow) => ic.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem: ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit: Number(ic.preco),
      };
    });

    const total = itensComSnapshot.reduce(
      (soma: number, item: { precoUnit: number; quantidade: number }) =>
        soma + item.precoUnit * item.quantidade,
      0
    );

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome, clienteFone, enderecoEntrega, total,
        estabelecimentoId: estabelecimento.id,
        itens: { create: itensComSnapshot },
      },
      include: { itens: true },
    });

    getIO().to(estabelecimento.id).emit('pedido:novo', pedido);

    return reply.status(201).send({
      id: pedido.id,
      total: Number(pedido.total),
      mensagem: 'Pedido recebido! A cozinha foi avisada.',
    });
  });
}
