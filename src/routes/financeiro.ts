import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';
import { resolverIntervaloPeriodo, calcularVendasPorDia } from '../utils/periodoRelatorio.js';

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

    // Duas origens de venda: Pedido (balcão/delivery/link) e Pagamento confirmado do
    // módulo de Mesas — mesmo par que o Dashboard já soma pro "hoje" (2026-07-16), agora
    // também no período escolhido aqui. Estabelecimento que vende só por mesa (sem nenhum
    // Pedido) até então não tinha nenhuma tela pra ver o histórico financeiro.
    const [agregadoPedidos, agregadoMesas, pedidosPeriodo, pagamentosMesasPeriodo] = await Promise.all([
      prisma.pedido.groupBy({
        by: ['formaPagamento'],
        where: {
          estabelecimentoId: estabelecimentoId!,
          status: { not: 'cancelado' },
          criadoEm: { gte: inicioUTC, lte: fimUTC },
        },
        _count: { id: true },
        _sum:   { total: true },
      }),
      prisma.pagamento.groupBy({
        by: ['formaPagamento'],
        where: {
          estabelecimentoId: estabelecimentoId!,
          status: 'confirmado',
          criadoEm: { gte: inicioUTC, lte: fimUTC },
        },
        _count: { id: true },
        _sum:   { valor: true },
      }),
      prisma.pedido.findMany({
        where: {
          estabelecimentoId: estabelecimentoId!,
          status: { not: 'cancelado' },
          criadoEm: { gte: inicioUTC, lte: fimUTC },
        },
        select: { criadoEm: true, total: true },
      }),
      prisma.pagamento.findMany({
        where: {
          estabelecimentoId: estabelecimentoId!,
          status: 'confirmado',
          criadoEm: { gte: inicioUTC, lte: fimUTC },
        },
        select: { criadoEm: true, valor: true },
      }),
    ]);

    const porFormaPagamentoMapa = new Map<string, { quantidade: number; total: number }>();
    for (const item of agregadoPedidos) {
      const atual = porFormaPagamentoMapa.get(item.formaPagamento) ?? { quantidade: 0, total: 0 };
      porFormaPagamentoMapa.set(item.formaPagamento, {
        quantidade: atual.quantidade + item._count.id,
        total:      atual.total + Number(item._sum.total ?? 0),
      });
    }
    for (const item of agregadoMesas) {
      const atual = porFormaPagamentoMapa.get(item.formaPagamento) ?? { quantidade: 0, total: 0 };
      porFormaPagamentoMapa.set(item.formaPagamento, {
        quantidade: atual.quantidade + item._count.id,
        total:      atual.total + Number(item._sum.valor ?? 0),
      });
    }
    const porFormaPagamento = Array.from(porFormaPagamentoMapa.entries()).map(([formaPagamento, valores]) => ({
      formaPagamento,
      quantidade: valores.quantidade,
      total:      valores.total,
    }));

    const totalGeral = porFormaPagamento.reduce((soma, item) => soma + item.total, 0);

    const registrosParaVendas = [
      ...pedidosPeriodo.map((p) => ({ criadoEm: p.criadoEm, total: Number(p.total) })),
      ...pagamentosMesasPeriodo.map((p) => ({ criadoEm: p.criadoEm, total: Number(p.valor) })),
    ];

    const { vendasPorDia, topDias } = calcularVendasPorDia(registrosParaVendas);

    return {
      periodo: { inicio: inicioLabel, fim: fimLabel },
      porFormaPagamento,
      totalGeral,
      vendasPorDia,
      topDias,
    };
  });
}
