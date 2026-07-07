import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { serializarConta } from './contas.js';
import { calcularResumoConta, validarItensParaPagamento } from '../utils/fechamentoConta.js';
import type { ContaParaResumo } from '../utils/fechamentoConta.js';
import type { FormaPagamento } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

const ContaParamsSchema = Type.Object({ id: Type.String() });
const PagamentoParamsSchema = Type.Object({ id: Type.String() });

const RegistrarPagamentoSchema = Type.Object({
  formaPagamento: Type.Union([
    Type.Literal('pix'),
    Type.Literal('dinheiro'),
    Type.Literal('cartao_credito'),
    Type.Literal('cartao_debito'),
  ]),
  itensComandaIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  valor: Type.Optional(Type.Number({ minimum: 0.01 })),
});

const CONTA_INCLUDE_RESUMO = {
  comandas: { include: { itens: true } },
  pagamentos: { include: { itens: true }, orderBy: { criadoEm: 'asc' as const } },
};

type ContaComResumoPrisma = Prisma.ContaGetPayload<{ include: typeof CONTA_INCLUDE_RESUMO }>;

// `calcularResumoConta` (Task 2, src/utils/fechamentoConta.ts) foi desenhada para ser
// independente do ORM: seus campos monetários aceitam `number | string`, nunca o tipo
// `Decimal` que o Prisma retorna. Este adaptador converte a Conta (com comandas/itens e
// pagamentos/itens) para o formato puro esperado, sem mutar o resultado original do Prisma.
function paraContaParaResumo(conta: ContaComResumoPrisma): ContaParaResumo {
  return {
    descontoValor: conta.descontoValor === null ? null : Number(conta.descontoValor),
    comandas: conta.comandas.map((comanda) => ({
      id: comanda.id,
      nome: comanda.nome,
      itens: comanda.itens.map((item) => ({
        id: item.id,
        nomeItem: item.nomeItem,
        precoUnit: Number(item.precoUnit),
        quantidade: item.quantidade,
        status: item.status,
      })),
    })),
    pagamentos: conta.pagamentos.map((pagamento) => ({
      id: pagamento.id,
      valor: Number(pagamento.valor),
      status: pagamento.status,
      formaPagamento: pagamento.formaPagamento,
      criadoEm: pagamento.criadoEm,
      itens: pagamento.itens.map((item) => ({ itemComandaId: item.itemComandaId })),
    })),
  };
}

async function buscarContaComResumo(estabelecimentoId: string, contaId: string) {
  const conta = await prisma.conta.findFirst({
    where: { id: contaId, estabelecimentoId },
    include: CONTA_INCLUDE_RESUMO,
  });
  if (!conta) return null;
  return { conta, resumo: calcularResumoConta(paraContaParaResumo(conta)) };
}

async function emitirContaAtualizada(estabelecimentoId: string, contaId: string) {
  const contaCompleta = await prisma.conta.findUnique({
    where: { id: contaId },
    include: { mesa: true, comandas: { include: { itens: true } } },
  });
  if (contaCompleta) {
    getIO().to(estabelecimentoId).emit('conta:atualizada', serializarConta(contaCompleta));
  }
}

export async function pagamentosRoutes(fastify: FastifyInstance) {
  // ── GET /contas/:id/resumo ───────────────────────────────────────────────────
  fastify.get('/contas/:id/resumo', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });

    return { contaId: encontrada.conta.id, status: encontrada.conta.status, ...encontrada.resumo };
  });

  // ── POST /contas/:id/pagamentos ──────────────────────────────────────────────
  // Dois modos: itensComandaIds (cobre itens específicos, valor calculado no servidor)
  // ou valor livre (divisão igual ÷ N, ou qualquer valor parcial sem vincular a itens).
  fastify.post('/contas/:id/pagamentos', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: RegistrarPagamentoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { formaPagamento, itensComandaIds, valor } = request.body as {
      formaPagamento: FormaPagamento;
      itensComandaIds?: string[];
      valor?: number;
    };
    const { estabelecimentoId, userId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });
    const { conta, resumo } = encontrada;

    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta para pagamento' });
    }

    let valorFinal: number;
    let itensParaVincular: string[] = [];

    if (itensComandaIds && itensComandaIds.length > 0) {
      const validacao = validarItensParaPagamento(resumo, itensComandaIds);
      if (validacao.erro) return reply.status(422).send({ erro: validacao.erro });
      valorFinal = validacao.valor;
      itensParaVincular = itensComandaIds;
    } else if (typeof valor === 'number' && valor > 0) {
      valorFinal = valor;
    } else {
      return reply.status(400).send({ erro: 'Informe itensComandaIds ou valor' });
    }

    const todosItens = resumo.porComanda.flatMap((c) => c.itens);
    await prisma.pagamento.create({
      data: {
        valor: valorFinal,
        formaPagamento,
        status: 'confirmado',
        estabelecimentoId: estabelecimentoId!,
        contaId: id,
        usuarioId: userId ?? null,
        itens: {
          create: itensParaVincular.map((itemComandaId) => ({
            itemComandaId,
            valorCoberto: todosItens.find((i) => i.id === itemComandaId)!.total,
            estabelecimentoId: estabelecimentoId!,
          })),
        },
      },
    });

    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return reply.status(201).send({ contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo });
  });
}
