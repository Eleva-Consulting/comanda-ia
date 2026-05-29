import { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

export async function estabelecimentosRoutes(fastify: FastifyInstance) {
  fastify.get('/meu-estabelecimento', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId },
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
      where: { id: estabelecimentoId },
      include: {
        itens: { orderBy: { nome: 'asc' } },
        pedidos: { orderBy: { criadoEm: 'desc' }, take: 10 },
      },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    // Contagem por status
    const estatisticas = await prisma.pedido.groupBy({
      by: ['status'],
      where: { estabelecimentoId },
      _count: { id: true },
    });

    const totalPedidos = estatisticas.reduce(
      (soma, item) => soma + item._count.id,
      0
    );

    // Agregações financeiras — soma e média do total dos pedidos
    // (excluindo cancelados, que não geram receita real)
    const agregacoes = await prisma.pedido.aggregate({
      where: {
        estabelecimentoId,
        status: { not: 'cancelado' },
      },
      _sum: { total: true },
      _avg: { total: true },
    });

    // Decimal → number (mesmo trick do contexto da IA)
    const faturamentoTotal = Number(agregacoes._sum.total ?? 0);
    const ticketMedio = Number(agregacoes._avg.total ?? 0);

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
        faturamentoTotal,
        ticketMedio,
        porStatus: estatisticas.map((item) => ({
          status: item.status,
          quantidade: item._count.id,
        })),
      },
    };
  });
}