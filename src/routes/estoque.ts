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

async function buscarDadosDoDia(estabelecimentoId: string, dataStr: string) {
  const { inicio, fim } = inicioFimDoDia(dataStr);

  const [pedidos, pagamentos, movimentacoes] = await Promise.all([
    prisma.pedido.findMany({
      where:   { estabelecimentoId, status: { not: 'cancelado' }, criadoEm: { gte: inicio, lte: fim } },
      select:  { id: true, clienteNome: true, tipoEntrega: true, formaPagamento: true, total: true, criadoEm: true },
      orderBy: { criadoEm: 'asc' },
    }),
    prisma.pagamento.findMany({
      where:  { estabelecimentoId, status: 'confirmado', criadoEm: { gte: inicio, lte: fim } },
      select: {
        id: true, valor: true, formaPagamento: true, criadoEm: true,
        conta: { select: { mesa: { select: { numero: true } } } },
      },
      orderBy: { criadoEm: 'asc' },
    }),
    prisma.movimentacaoEstoque.findMany({
      where:   { estabelecimentoId, tipo: 'consumo_diario', data: dataDoDia(dataStr) },
      include: { insumo: { select: { nome: true, unidade: true } } },
    }),
  ]);

  return { pedidos, pagamentos, movimentacoes };
}

function montarResumo(dataStr: string, dados: Awaited<ReturnType<typeof buscarDadosDoDia>>) {
  const faturamento = dados.pedidos.reduce((soma, p) => soma + Number(p.total), 0)
    + dados.pagamentos.reduce((soma, pg) => soma + Number(pg.valor), 0);
  const custoInsumos = dados.movimentacoes.reduce(
    (soma, m) => soma + Number(m.quantidade) * Number(m.custoUnitarioSnapshot),
    0
  );

  return { data: dataStr, faturamento, custoInsumos, lucro: faturamento - custoInsumos };
}

async function calcularLucroDia(estabelecimentoId: string, dataStr: string) {
  const dados = await buscarDadosDoDia(estabelecimentoId, dataStr);
  return montarResumo(dataStr, dados);
}

// Versão detalhada — inclui a descrição de cada venda (pedido/pagamento) e de
// cada insumo consumido. Usada só nas rotas de dia único (lucro-dia,
// consumo-diario); o histórico (múltiplos dias) usa a versão resumida acima
// pra não buscar registro a registro de 30 dias de uma vez.
async function detalharLucroDia(estabelecimentoId: string, dataStr: string) {
  const dados  = await buscarDadosDoDia(estabelecimentoId, dataStr);
  const resumo = montarResumo(dataStr, dados);

  const vendas = [
    ...dados.pedidos.map((p) => ({
      tipo:           'pedido' as const,
      id:             p.id,
      descricao:      `Pedido de ${p.clienteNome} (${p.tipoEntrega === 'retirada' ? 'retirada' : 'entrega'})`,
      formaPagamento: p.formaPagamento,
      valor:          Number(p.total),
    })),
    ...dados.pagamentos.map((pg) => ({
      tipo:           'pagamento' as const,
      id:             pg.id,
      descricao:      pg.conta.mesa ? `Pagamento — Mesa ${pg.conta.mesa.numero}` : 'Pagamento — conta sem mesa',
      formaPagamento: pg.formaPagamento,
      valor:          Number(pg.valor),
    })),
  ];

  const insumos = dados.movimentacoes.map((m) => ({
    insumoId:              m.insumoId,
    nome:                  m.insumo.nome,
    unidade:               m.insumo.unidade,
    quantidade:            Number(m.quantidade),
    custoUnitarioSnapshot: Number(m.custoUnitarioSnapshot),
    custoTotal:            Number(m.quantidade) * Number(m.custoUnitarioSnapshot),
  }));

  return { ...resumo, vendas, insumos };
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

    if (quantidade > Number(insumo.estoqueAtual)) {
      return reply.status(422).send({
        erro: `Estoque insuficiente: você tem ${Number(insumo.estoqueAtual)} ${insumo.unidade} de ${insumo.nome}, mas tentou registrar ${quantidade} ${insumo.unidade}`,
      });
    }

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

    if (quantidade < 0 && Number(insumo.estoqueAtual) + quantidade < 0) {
      return reply.status(422).send({
        erro: `Estoque insuficiente: você tem ${Number(insumo.estoqueAtual)} ${insumo.unidade} de ${insumo.nome}, não é possível reduzir ${Math.abs(quantidade)} ${insumo.unidade}`,
      });
    }

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

    const quantidadePorInsumo = new Map<string, number>();
    for (const item of itens) {
      quantidadePorInsumo.set(item.insumoId, (quantidadePorInsumo.get(item.insumoId) ?? 0) + item.quantidade);
    }

    const insuficientes = insumos.filter((insumo) => (quantidadePorInsumo.get(insumo.id) ?? 0) > Number(insumo.estoqueAtual));
    if (insuficientes.length > 0) {
      const detalhe = insuficientes
        .map((i) => `${i.nome} (disponível ${Number(i.estoqueAtual)} ${i.unidade}, solicitado ${quantidadePorInsumo.get(i.id)} ${i.unidade})`)
        .join('; ');
      return reply.status(422).send({ erro: `Estoque insuficiente para: ${detalhe}` });
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

    return reply.status(201).send(await detalharLucroDia(estabelecimentoId!, data));
  });

  // ── GET /estoque/lucro-dia?data=YYYY-MM-DD ──────────────────────────────────
  fastify.get('/estoque/lucro-dia', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { querystring: LucroDiaQuerySchema },
  }, async (request) => {
    const { data } = request.query as { data: string };
    const { estabelecimentoId } = request.user;
    return detalharLucroDia(estabelecimentoId!, data);
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
