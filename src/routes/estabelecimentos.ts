import { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

export async function estabelecimentosRoutes(fastify: FastifyInstance) {
  fastify.get('/meu-estabelecimento', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId! },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }
    return estabelecimento;
  });

  fastify.get('/meu-estabelecimento/dashboard', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId! },
      include: {
        itens: { orderBy: { nome: 'asc' } },
        pedidos: { orderBy: { criadoEm: 'desc' }, take: 10 },
      },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const estatisticas = await prisma.pedido.groupBy({
      by: ['status'],
      where: { estabelecimentoId: estabelecimentoId! },
      _count: { id: true },
    });

    const totalPedidos = estatisticas.reduce(
      (soma: number, item: { _count: { id: number } }) => soma + item._count.id,
      0
    );

    const agregacoes = await prisma.pedido.aggregate({
      where: { estabelecimentoId: estabelecimentoId!, status: { not: 'cancelado' } },
      _sum: { total: true },
      _avg: { total: true },
    });

    return {
      estabelecimento: {
        id: estabelecimento.id,
        nome: estabelecimento.nome,
        telefone: estabelecimento.telefone,
        ativo: estabelecimento.ativo,
      },
      cardapio: estabelecimento.itens,
      pedidosRecentes: estabelecimento.pedidos,
      estatisticas: {
        totalPedidos,
        faturamentoTotal: Number(agregacoes._sum.total ?? 0),
        ticketMedio: Number(agregacoes._avg.total ?? 0),
        porStatus: estatisticas.map((item: { status: string; _count: { id: number } }) => ({
          status: item.status,
          quantidade: item._count.id,
        })),
      },
    };
  });
}
