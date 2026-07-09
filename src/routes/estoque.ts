import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';

const EntradaSchema = Type.Object({
  insumoId:   Type.String({ minLength: 1 }),
  quantidade: Type.Number({ exclusiveMinimum: 0 }),
  data:       Type.Optional(Type.String()),
});

const PerdaSchema = Type.Object({
  insumoId:   Type.String({ minLength: 1 }),
  quantidade: Type.Number({ exclusiveMinimum: 0 }),
  motivo:     Type.String({ minLength: 1, maxLength: 200 }),
  data:       Type.Optional(Type.String()),
});

// quantidade pode ser negativa (correção pra baixo) ou positiva (correção pra
// cima) — o único tipo de movimentação onde o sinal do valor importa.
const AjusteSchema = Type.Object({
  insumoId:   Type.String({ minLength: 1 }),
  quantidade: Type.Number(),
  motivo:     Type.String({ minLength: 1, maxLength: 200 }),
});

const ConsumoDiarioSchema = Type.Object({
  data:  Type.String(),
  itens: Type.Array(
    Type.Object({
      insumoId:   Type.String({ minLength: 1 }),
      quantidade: Type.Number({ exclusiveMinimum: 0 }),
    }),
    { minItems: 1 }
  ),
});

const LucroDiaQuerySchema = Type.Object({ data: Type.String() });

function dataDoDia(dataStr: string): Date {
  return new Date(`${dataStr}T00:00:00.000Z`);
}

function inicioFimDoDia(dataStr: string) {
  return {
    inicio: new Date(`${dataStr}T00:00:00.000Z`),
    fim:    new Date(`${dataStr}T23:59:59.999Z`),
  };
}

async function calcularLucroDia(estabelecimentoId: string, dataStr: string) {
  const { inicio, fim } = inicioFimDoDia(dataStr);

  const [pedidos, pagamentos, movimentacoes] = await Promise.all([
    prisma.pedido.aggregate({
      where: { estabelecimentoId, status: { not: 'cancelado' }, criadoEm: { gte: inicio, lte: fim } },
      _sum:  { total: true },
    }),
    prisma.pagamento.aggregate({
      where: { estabelecimentoId, status: 'confirmado', criadoEm: { gte: inicio, lte: fim } },
      _sum:  { valor: true },
    }),
    prisma.movimentacaoEstoque.findMany({
      where: { estabelecimentoId, tipo: 'consumo_diario', data: dataDoDia(dataStr) },
    }),
  ]);

  const faturamento  = Number(pedidos._sum.total ?? 0) + Number(pagamentos._sum.valor ?? 0);
  const custoInsumos = movimentacoes.reduce(
    (soma, m) => soma + Number(m.quantidade) * Number(m.custoUnitarioSnapshot),
    0
  );

  return { data: dataStr, faturamento, custoInsumos, lucro: faturamento - custoInsumos };
}

export async function estoqueRoutes(fastify: FastifyInstance) {
  // ── POST /estoque/entrada ───────────────────────────────────────────────────
  fastify.post('/estoque/entrada', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: EntradaSchema },
  }, async (request, reply) => {
    const { insumoId, quantidade, data } = request.body as { insumoId: string; quantidade: number; data?: string };
    const { estabelecimentoId, userId } = request.user;

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: {
          tipo: 'entrada', quantidade,
          custoUnitarioSnapshot: insumo.custoUnitario,
          data:      data ? dataDoDia(data) : dataDoDia(new Date().toISOString().slice(0, 10)),
          insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
        },
      }),
      prisma.insumo.update({ where: { id: insumoId }, data: { estoqueAtual: { increment: quantidade } } }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // ── POST /estoque/perda ─────────────────────────────────────────────────────
  fastify.post('/estoque/perda', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: PerdaSchema },
  }, async (request, reply) => {
    const { insumoId, quantidade, motivo, data } = request.body as {
      insumoId: string; quantidade: number; motivo: string; data?: string;
    };
    const { estabelecimentoId, userId } = request.user;

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: {
          tipo: 'saida_perda', quantidade, motivo,
          custoUnitarioSnapshot: insumo.custoUnitario,
          data:      data ? dataDoDia(data) : dataDoDia(new Date().toISOString().slice(0, 10)),
          insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
        },
      }),
      prisma.insumo.update({ where: { id: insumoId }, data: { estoqueAtual: { decrement: quantidade } } }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // ── POST /estoque/ajuste ────────────────────────────────────────────────────
  fastify.post('/estoque/ajuste', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: AjusteSchema },
  }, async (request, reply) => {
    const { insumoId, quantidade, motivo } = request.body as { insumoId: string; quantidade: number; motivo: string };
    const { estabelecimentoId, userId } = request.user;

    if (quantidade === 0) return reply.status(400).send({ erro: 'Informe uma quantidade diferente de zero' });

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: {
          tipo: 'ajuste', quantidade, motivo,
          custoUnitarioSnapshot: insumo.custoUnitario,
          data:      dataDoDia(new Date().toISOString().slice(0, 10)),
          insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
        },
      }),
      prisma.insumo.update({ where: { id: insumoId }, data: { estoqueAtual: { increment: quantidade } } }),
    ]);

    return reply.status(201).send({ ok: true });
  });

  // ── POST /estoque/consumo-diario ────────────────────────────────────────────
  fastify.post('/estoque/consumo-diario', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: ConsumoDiarioSchema },
  }, async (request, reply) => {
    const { data, itens } = request.body as { data: string; itens: { insumoId: string; quantidade: number }[] };
    const { estabelecimentoId, userId } = request.user;

    const insumoIds = itens.map((i) => i.insumoId);
    const insumos = await prisma.insumo.findMany({
      where: { id: { in: insumoIds }, estabelecimentoId: estabelecimentoId! },
    });
    if (insumos.length !== new Set(insumoIds).size) {
      return reply.status(400).send({ erro: 'Um ou mais insumos não encontrados' });
    }

    const dataAlvo = dataDoDia(data);

    await prisma.$transaction(
      itens.flatMap((item) => {
        const insumo = insumos.find((i) => i.id === item.insumoId)!;
        return [
          prisma.movimentacaoEstoque.create({
            data: {
              tipo: 'consumo_diario', quantidade: item.quantidade,
              custoUnitarioSnapshot: insumo.custoUnitario, data: dataAlvo,
              insumoId: item.insumoId, estabelecimentoId: estabelecimentoId!, usuarioId: userId,
            },
          }),
          prisma.insumo.update({
            where: { id: item.insumoId },
            data:  { estoqueAtual: { decrement: item.quantidade } },
          }),
        ];
      })
    );

    return reply.status(201).send(await calcularLucroDia(estabelecimentoId!, data));
  });

  // ── GET /estoque/lucro-dia?data=YYYY-MM-DD ──────────────────────────────────
  fastify.get('/estoque/lucro-dia', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { querystring: LucroDiaQuerySchema },
  }, async (request) => {
    const { data } = request.query as { data: string };
    const { estabelecimentoId } = request.user;
    return calcularLucroDia(estabelecimentoId!, data);
  });

  // ── GET /estoque/historico ──────────────────────────────────────────────────
  // Últimos 30 dias com algum lançamento de consumo_diario, mais recente primeiro.
  fastify.get('/estoque/historico', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;

    const dias = await prisma.movimentacaoEstoque.findMany({
      where:    { estabelecimentoId: estabelecimentoId!, tipo: 'consumo_diario' },
      distinct: ['data'],
      orderBy:  { data: 'desc' },
      take:     30,
      select:   { data: true },
    });

    return Promise.all(
      dias.map((d) => calcularLucroDia(estabelecimentoId!, d.data.toISOString().slice(0, 10)))
    );
  });
}
