import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';
import { whatsApp } from '../whatsapp.js';

const AtualizarEstabelecimentoSchema = Type.Object({
  aceitandoPedidos: Type.Optional(Type.Boolean()),
  nome:             Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  telefone:         Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  chavePix:         Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  taxaEntrega:      Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  evolutionUrl:     Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  evolutionToken:   Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
});

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

  fastify.patch('/meu-estabelecimento', {
    onRequest: [autenticar],
    schema: { body: AtualizarEstabelecimentoSchema },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const dados = request.body as {
      aceitandoPedidos?: boolean;
      nome?:             string;
      telefone?:         string;
      chavePix?:         string | null;
    };

    const atualizado = await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data:  dados,
    });

    return atualizado;
  });

  fastify.get('/meu-estabelecimento/dashboard', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId! },
      include: {
        itens:   { orderBy: { nome: 'asc' } },
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

    // Vendas dos últimos 30 dias, agrupadas por data
    const inicio30Dias = new Date();
    inicio30Dias.setDate(inicio30Dias.getDate() - 29);
    inicio30Dias.setHours(0, 0, 0, 0);

    const pedidos30Dias = await prisma.pedido.findMany({
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: { not: 'cancelado' },
        criadoEm: { gte: inicio30Dias },
      },
      select: { criadoEm: true, total: true },
    });

    const vendasPorDia = pedidos30Dias.reduce<Record<string, { data: string; pedidos: number; faturamento: number }>>(
      (acc, p) => {
        const dia = p.criadoEm.toISOString().slice(0, 10);
        const anterior = acc[dia] ?? { data: dia, pedidos: 0, faturamento: 0 };
        return {
          ...acc,
          [dia]: {
            ...anterior,
            pedidos:     anterior.pedidos + 1,
            faturamento: anterior.faturamento + Number(p.total),
          },
        };
      },
      {},
    );

    // Avaliações
    const avaliacoesAgregadas = await prisma.pedido.aggregate({
      where: { estabelecimentoId: estabelecimentoId!, avaliacao: { not: null } },
      _avg:   { avaliacao: true },
      _count: { avaliacao: true },
    });

    const distribuicaoNotas = await prisma.pedido.groupBy({
      by:    ['avaliacao'],
      where: { estabelecimentoId: estabelecimentoId!, avaliacao: { not: null } },
      _count: { id: true },
      orderBy: { avaliacao: 'desc' },
    });

    const avaliacoesRecentes = await prisma.pedido.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, avaliacao: { not: null } },
      orderBy: { criadoEm: 'desc' },
      take:    5,
      select:  { clienteNome: true, avaliacao: true, comentarioAvaliacao: true, criadoEm: true },
    });

    return {
      estabelecimento: {
        id:       estabelecimento.id,
        nome:     estabelecimento.nome,
        telefone: estabelecimento.telefone,
        status:   estabelecimento.status,
      },
      cardapio:        estabelecimento.itens,
      pedidosRecentes: estabelecimento.pedidos,
      estatisticas: {
        totalPedidos,
        faturamentoTotal: Number(agregacoes._sum.total ?? 0),
        ticketMedio:      Number(agregacoes._avg.total ?? 0),
        porStatus: estatisticas.map((item: { status: string; _count: { id: number } }) => ({
          status:     item.status,
          quantidade: item._count.id,
        })),
        vendasPorDia: Object.values(vendasPorDia).sort((a, b) => a.data.localeCompare(b.data)),
      },
      avaliacoes: {
        media:        avaliacoesAgregadas._avg.avaliacao
          ? Math.round(avaliacoesAgregadas._avg.avaliacao * 10) / 10
          : null,
        total:        avaliacoesAgregadas._count.avaliacao,
        distribuicao: distribuicaoNotas.map((d) => ({
          nota:       d.avaliacao as number,
          quantidade: d._count.id,
        })),
        recentes: avaliacoesRecentes.map((a) => ({
          clienteNome:         a.clienteNome,
          avaliacao:           a.avaliacao as number,
          comentarioAvaliacao: a.comentarioAvaliacao,
          criadoEm:            a.criadoEm,
        })),
      },
    };
  });

  // ── POST /meu-estabelecimento/whatsapp/conectar ───────────────────────────
  // Cria a instância no Evolution API e retorna o QR code base64
  fastify.post('/meu-estabelecimento/whatsapp/conectar', {
    onRequest: [autenticar, apenasDono],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const { qrCode, status } = await whatsApp.conectar(estabelecimentoId!);

    if (status === 'open') {
      return { qrCode: null, conectado: true };
    }
    if (!qrCode) {
      return reply.status(504).send({ erro: 'Não foi possível gerar o QR code. Tente novamente.' });
    }

    return { qrCode, conectado: false };
  });

  // ── DELETE /meu-estabelecimento/whatsapp/desconectar ─────────────────────
  fastify.delete('/meu-estabelecimento/whatsapp/desconectar', {
    onRequest: [autenticar, apenasDono],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    await whatsApp.desconectar(estabelecimentoId!);
    return reply.status(204).send();
  });

  // ── GET /meu-estabelecimento/whatsapp/status ──────────────────────────────
  fastify.get('/meu-estabelecimento/whatsapp/status', {
    onRequest: [autenticar, apenasDono],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estado = whatsApp.getStatus(estabelecimentoId!);
    return { conectado: estado === 'open', estado };
  });
}
