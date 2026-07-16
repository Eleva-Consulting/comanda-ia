import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';
import { whatsApp } from '../whatsapp.js';
import { resolverIntervaloPeriodo } from '../utils/periodoRelatorio.js';

const AtualizarEstabelecimentoSchema = Type.Object({
  aceitandoPedidos: Type.Optional(Type.Boolean()),
  nome:             Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  telefone:         Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  chavePix:         Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  cidade:           Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
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

    const { senhaReabrirPedido, ...resto } = estabelecimento;
    return { ...resto, senhaReabrirPedidoConfigurada: senhaReabrirPedido !== null };
  });

  fastify.patch('/meu-estabelecimento', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: { body: AtualizarEstabelecimentoSchema },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const dados = request.body as {
      aceitandoPedidos?: boolean;
      nome?:             string;
      telefone?:         string;
      chavePix?:         string | null;
      cidade?:           string | null;
    };

    const atualizado = await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data:  dados,
    });

    return atualizado;
  });

  // ── PATCH /meu-estabelecimento/aceitando-pedidos ──────────────────────────
  // Botão "Pausar/Reabrir" da Cozinha — separado do PATCH geral para não exigir
  // a permissão "configuracoes" de quem só precisa pausar/retomar pedidos.
  fastify.patch('/meu-estabelecimento/aceitando-pedidos', {
    onRequest: [autenticar, temPermissao('cozinha', 'configuracoes')],
    schema: { body: Type.Object({ aceitandoPedidos: Type.Boolean() }) },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const { aceitandoPedidos } = request.body as { aceitandoPedidos: boolean };

    const atualizado = await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data:  { aceitandoPedidos },
    });

    return atualizado;
  });

  // ── PATCH /meu-estabelecimento/imprimir-automatico-balcao ────────────────
  // Liga/desliga a impressão automática de pedidos de balcão. Delivery e
  // retirada via link público sempre imprimem automático, independente disso.
  fastify.patch('/meu-estabelecimento/imprimir-automatico-balcao', {
    onRequest: [autenticar, temPermissao('cozinha', 'configuracoes')],
    schema: { body: Type.Object({ imprimirAutomaticoBalcao: Type.Boolean() }) },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const { imprimirAutomaticoBalcao } = request.body as { imprimirAutomaticoBalcao: boolean };

    const atualizado = await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data:  { imprimirAutomaticoBalcao },
    });

    return { imprimirAutomaticoBalcao: atualizado.imprimirAutomaticoBalcao };
  });

  // ── PATCH /meu-estabelecimento/senha-reabrir-pedido ───────────────────────
  // DONO define/altera a senha usada por qualquer operador de Cozinha pra
  // reabrir um pedido já concluído/cancelado. Enviar senha: null desativa.
  fastify.patch('/meu-estabelecimento/senha-reabrir-pedido', {
    onRequest: [autenticar, temPermissao('configuracoes')],
    schema: {
      body: Type.Object({
        senha: Type.Union([Type.String({ minLength: 4, maxLength: 50 }), Type.Null()]),
      }),
    },
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    const { senha } = request.body as { senha: string | null };

    const senhaReabrirPedido = senha ? await bcrypt.hash(senha, 12) : null;

    await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data:  { senhaReabrirPedido },
    });

    return { senhaReabrirPedidoConfigurada: senhaReabrirPedido !== null };
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

    // Dashboard mostra só o dia de hoje (em Brasília) — histórico/período fica na tela Financeiro.
    const { inicioUTC, fimUTC } = resolverIntervaloPeriodo();

    // "Em andamento" é sempre o estado atual da cozinha — nunca filtrado por período.
    const emAndamentoAgregado = await prisma.pedido.groupBy({
      by: ['status'],
      where: { estabelecimentoId: estabelecimentoId!, status: { in: ['recebido', 'em_preparo', 'pronto'] } },
      _count: { id: true },
    });
    const emAndamento = emAndamentoAgregado.reduce((soma, item) => soma + item._count.id, 0);

    // Estatísticas de hoje.
    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: { not: 'cancelado' },
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      select: { total: true },
    });

    // Venda do módulo de Mesas conta pelo Pagamento confirmado no Caixa: dinheiro que
    // de fato entrou hoje; estorno muda o status e sai da soma sozinho.
    const pagamentosMesasHoje = await prisma.pagamento.aggregate({
      where: {
        estabelecimentoId: estabelecimentoId!,
        status: 'confirmado',
        criadoEm: { gte: inicioUTC, lte: fimUTC },
      },
      _sum: { valor: true },
    });

    // Movimento de mesas conta por rodada enviada — o análogo de "pedido chegou" no
    // mundo mesas (spec da Cozinha unificada, Fase 0).
    const totalRodadas = await prisma.rodadaComanda.count({
      where: {
        comanda: { conta: { estabelecimentoId: estabelecimentoId! } },
        criadaEm: { gte: inicioUTC, lte: fimUTC },
      },
    });

    const totalPedidos = pedidosHoje.length;
    const faturamentoPedidos = pedidosHoje.reduce((soma, p) => soma + Number(p.total), 0);
    const faturamentoMesas   = Number(pagamentosMesasHoje._sum.valor ?? 0);
    const faturamentoTotal   = faturamentoPedidos + faturamentoMesas;
    // Ticket médio segue só sobre Pedido — pagamento de mesa não é 1 pedido = 1 pagamento.
    const ticketMedio = totalPedidos > 0 ? faturamentoPedidos / totalPedidos : 0;

    // Avaliações (sem filtro de período — mesmo comportamento de antes).
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
        emAndamento,
        totalPedidos,
        totalRodadas,
        faturamentoTotal,
        faturamentoPedidos,
        faturamentoMesas,
        ticketMedio,
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
    onRequest: [autenticar, temPermissao('configuracoes')],
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
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    await whatsApp.desconectar(estabelecimentoId!);
    return reply.status(204).send();
  });

  // ── GET /meu-estabelecimento/whatsapp/status ──────────────────────────────
  fastify.get('/meu-estabelecimento/whatsapp/status', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const estado = whatsApp.getStatus(estabelecimentoId!);
    return { conectado: estado === 'open', estado };
  });
}
