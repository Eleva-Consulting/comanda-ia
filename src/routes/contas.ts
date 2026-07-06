import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import type { StatusConta } from '../generated/prisma/enums.js';

const AbrirContaSchema = Type.Object({
  mesaId: Type.String({ minLength: 1 }),
});

const ContaParamsSchema = Type.Object({ id: Type.String() });

const AtualizarStatusContaSchema = Type.Object({
  status: Type.Union([
    Type.Literal('aberta'),
    Type.Literal('aguardando_pagamento'),
    Type.Literal('cancelada'),
  ]),
});

const transicoesContaPermitidas: Record<StatusConta, StatusConta[]> = {
  aberta:               ['aguardando_pagamento', 'cancelada'],
  aguardando_pagamento: ['aberta'],
  fechada:              [],
  cancelada:            [],
};

interface ItemComandaComPreco {
  precoUnit: unknown;
  [chave: string]: unknown;
}

function serializarItemComanda(item: ItemComandaComPreco) {
  return { ...item, precoUnit: Number(item.precoUnit) };
}

interface ComandaComItens {
  itens?: ItemComandaComPreco[];
  [chave: string]: unknown;
}

interface ContaComComandas {
  comandas?: ComandaComItens[];
  [chave: string]: unknown;
}

function serializarConta(conta: ContaComComandas) {
  return {
    ...conta,
    comandas: conta.comandas?.map((comanda) => ({
      ...comanda,
      itens: comanda.itens?.map(serializarItemComanda),
    })),
  };
}

export async function contasRoutes(fastify: FastifyInstance) {
  // ── GET /contas ─────────────────────────────────────────────────────────────
  // ?status=aberta,aguardando_pagamento,fechada,cancelada — default: só as em andamento.
  fastify.get('/contas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const q = request.query as { status?: string };
    const statusValidos: StatusConta[] = ['aberta', 'aguardando_pagamento', 'fechada', 'cancelada'];
    const status = q.status
      ? q.status.split(',').map((s) => s.trim()).filter((s): s is StatusConta => statusValidos.includes(s as StatusConta))
      : (['aberta', 'aguardando_pagamento'] as StatusConta[]);

    const contas = await prisma.conta.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, status: { in: status } },
      orderBy: { abertaEm: 'desc' },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });
    return contas.map(serializarConta);
  });

  // ── GET /contas/:id ─────────────────────────────────────────────────────────
  fastify.get('/contas/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({
      where:   { id, estabelecimentoId: estabelecimentoId! },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });
    return serializarConta(conta);
  });

  // ── POST /contas ────────────────────────────────────────────────────────────
  // Abre uma mesa: cria a Conta e já cria a Comanda "Geral" automaticamente.
  fastify.post('/contas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { body: AbrirContaSchema },
  }, async (request, reply) => {
    const { mesaId } = request.body as { mesaId: string };
    const { estabelecimentoId } = request.user;

    const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, estabelecimentoId: estabelecimentoId!, ativa: true } });
    if (!mesa) return reply.status(404).send({ erro: 'Mesa não encontrada' });

    const contaAberta = await prisma.conta.findFirst({
      where: { mesaId, status: { in: ['aberta', 'aguardando_pagamento'] } },
    });
    if (contaAberta) return reply.status(409).send({ erro: 'Esta mesa já está ocupada' });

    const conta = await prisma.conta.create({
      data: {
        mesaId,
        estabelecimentoId: estabelecimentoId!,
        comandas: { create: [{ nome: 'Geral' }] },
      },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });

    getIO().to(estabelecimentoId!).emit('conta:atualizada', serializarConta(conta));
    return reply.status(201).send(serializarConta(conta));
  });

  // ── PATCH /contas/:id/status ────────────────────────────────────────────────
  fastify.patch('/contas/:id/status', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: AtualizarStatusContaSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusConta };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });

    if (!transicoesContaPermitidas[conta.status].includes(status)) {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    const atualizada = await prisma.conta.update({
      where:   { id },
      data:    { status, fechadaEm: status === 'cancelada' ? new Date() : null },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });

    getIO().to(estabelecimentoId!).emit('conta:atualizada', serializarConta(atualizada));
    return serializarConta(atualizada);
  });
}
