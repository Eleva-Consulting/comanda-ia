import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';
import { resolverIntervaloPeriodo } from '../utils/periodoRelatorio.js';

const PeriodoQuerySchema = Type.Object({
  inicio: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  fim:    Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
});

export async function financeiroRoutes(fastify: FastifyInstance) {
  fastify.get('/meu-estabelecimento/financeiro', {
    onRequest: [autenticar, apenasDono],
    schema: { querystring: PeriodoQuerySchema },
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const { inicio, fim } = request.query as { inicio?: string; fim?: string };

    const { inicioUTC, fimUTC, inicioLabel, fimLabel } = resolverIntervaloPeriodo(inicio, fim);

    const agregadoPorForma = await prisma.pedido.groupBy({
      by: ['formaPagamento'],
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: { not: 'cancelado' },
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      _count: { id: true },
      _sum:   { total: true },
    });

    const porFormaPagamento = agregadoPorForma.map((item) => ({
      formaPagamento: item.formaPagamento,
      quantidade:     item._count.id,
      total:          Number(item._sum.total ?? 0),
    }));

    const totalGeral = porFormaPagamento.reduce((soma, item) => soma + item.total, 0);

    return {
      periodo: { inicio: inicioLabel, fim: fimLabel },
      porFormaPagamento,
      totalGeral,
    };
  });
}
