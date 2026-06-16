import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import type { StatusPedido } from '../generated/prisma/enums.js';

// ── Schemas ────────────────────────────────────────────────────────────────────

const CriarPedidoSchema = Type.Object({
  clienteNome:     Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone:     Type.String({ minLength: 8, maxLength: 20 }),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String({ minLength: 1 }),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
    }),
    { minItems: 1 }
  ),
});

const AtualizarPedidoSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});

const AtualizarStatusSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('a_caminho'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});

const ManualPedidoSchema = Type.Object({
  clienteNome: Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone: Type.String({ minLength: 8, maxLength: 20 }),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String({ minLength: 1 }),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
      observacao:     Type.Optional(Type.String({ maxLength: 300 })),
    }),
    { minItems: 1 }
  ),
});

const PedidoParamsSchema = Type.Object({
  id: Type.String(),
});

// Transições de status permitidas
const transicoesPermitidas: Record<StatusPedido, StatusPedido[]> = {
  recebido:   ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto:     ['a_caminho', 'entregue', 'cancelado'],
  a_caminho:  ['entregue', 'cancelado'],
  entregue:   [],
  cancelado:  [],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Retorna lista de StatusPedido válidos a partir de string "a,b,c" */
function parsearFiltroStatus(raw: string | undefined): StatusPedido[] | undefined {
  if (!raw) return undefined;
  const validos: StatusPedido[] = ['recebido', 'em_preparo', 'pronto', 'a_caminho', 'entregue', 'cancelado'];
  const candidatos = raw.split(',').map((s) => s.trim()) as StatusPedido[];
  const filtrados = candidatos.filter((s) => validos.includes(s));
  return filtrados.length > 0 ? filtrados : undefined;
}

// ── Rotas ─────────────────────────────────────────────────────────────────────

export async function pedidosRoutes(fastify: FastifyInstance) {
  // ── GET /pedidos ────────────────────────────────────────────────────────────
  // Paginação cursor-based. Query params:
  //   limite     — itens por página (default 20, max 100)
  //   cursor     — id do último item da página anterior
  //   status     — comma-separated: recebido,em_preparo,pronto
  //   dataInicio — ISO date string (inclusivo)
  //   dataFim    — ISO date string (inclusivo, até 23:59:59)
  fastify.get('/pedidos', {
    onRequest: [autenticar],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const q = request.query as Record<string, string | undefined>;

    const limite = Math.min(Math.max(parseInt(q.limite ?? '20', 10) || 20, 1), 100);
    const cursor  = q.cursor ?? undefined;
    const status  = parsearFiltroStatus(q.status);
    const dataInicio = q.dataInicio ? new Date(q.dataInicio) : undefined;
    const dataFim    = q.dataFim
      ? new Date(new Date(q.dataFim).setHours(23, 59, 59, 999))
      : undefined;

    const where = {
      estabelecimentoId: estabelecimentoId!,
      ...(status    ? { status: { in: status } } : {}),
      ...(dataInicio || dataFim
        ? { criadoEm: { ...(dataInicio ? { gte: dataInicio } : {}), ...(dataFim ? { lte: dataFim } : {}) } }
        : {}),
    };

    const pedidos = await prisma.pedido.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: limite + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { itens: true },
    });

    const temProximo = pedidos.length > limite;
    const dados      = temProximo ? pedidos.slice(0, limite) : pedidos;
    const proximo    = temProximo ? dados[dados.length - 1].id : null;

    return { dados, proximo };
  });

  // ── GET /pedidos/:id ────────────────────────────────────────────────────────
  fastify.get('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
      include: { itens: true },
    });

    if (!pedido) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    return pedido;
  });

  // ── POST /pedidos ───────────────────────────────────────────────────────────
  // Total calculado no servidor — nunca confia no cliente.
  // Todos os itens devem pertencer ao estabelecimento e estar disponíveis.
  fastify.post('/pedidos', {
    onRequest: [autenticar],
    schema: { body: CriarPedidoSchema },
  }, async (request, reply) => {
    const { clienteNome, clienteFone, enderecoEntrega, itens } = request.body as {
      clienteNome: string;
      clienteFone: string;
      enderecoEntrega?: string;
      itens: { itemCardapioId: string; quantidade: number }[];
    };
    const { estabelecimentoId } = request.user;

    const itemIds = itens.map((i) => i.itemCardapioId);

    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id:                { in: itemIds },
        estabelecimentoId: estabelecimentoId!,
        disponivel:        true,
      },
    });

    if (itensCardapio.length !== itemIds.length) {
      return reply.status(400).send({
        erro: 'Um ou mais itens não estão disponíveis ou não pertencem a este estabelecimento',
      });
    }

    const itensComSnapshot = itens.map((pedidoItem) => {
      const ic = itensCardapio.find((ic) => ic.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem:  ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit:  Number(ic.preco),
      };
    });

    const total = itensComSnapshot.reduce(
      (soma, item) => soma + item.precoUnit * item.quantidade,
      0
    );

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome,
        clienteFone,
        enderecoEntrega,
        total,
        estabelecimentoId: estabelecimentoId!,
        itens: { create: itensComSnapshot },
      },
      include: { itens: true },
    });

    return reply.status(201).send(pedido);
  });

  // ── PATCH /pedidos/:id ──────────────────────────────────────────────────────
  // Transação garante que verificação de propriedade e update são atômicos.
  fastify.patch('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema, body: AtualizarStatusSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusPedido };
    const { estabelecimentoId } = request.user;

    const pedidoAtualizado = await prisma.$transaction(async (tx) => {
      const existente = await tx.pedido.findFirst({
        where: { id, estabelecimentoId: estabelecimentoId! },
      });
      if (!existente) return null;

      const permitidos = transicoesPermitidas[existente.status];
      if (!permitidos.includes(status)) return 'transicao_invalida' as const;

      return tx.pedido.update({
        where:   { id },
        data:    { status },
        include: { itens: true },
      });
    });

    if (!pedidoAtualizado) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    if (pedidoAtualizado === 'transicao_invalida') {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoAtualizado);
    return pedidoAtualizado;
  });

  // ── DELETE /pedidos/:id ─────────────────────────────────────────────────────
  fastify.delete('/pedidos/:id', {
    onRequest: [autenticar],
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.pedido.deleteMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    return reply.status(204).send();
  });
}
