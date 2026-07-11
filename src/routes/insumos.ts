import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import type { UnidadeMedida } from '../generated/prisma/enums.js';

const UNIDADES = ['g', 'kg', 'ml', 'l', 'un'] as const;

const CriarInsumoSchema = Type.Object({
  nome:           Type.String({ minLength: 1, maxLength: 80 }),
  unidade:        Type.Union(UNIDADES.map((u) => Type.Literal(u)) as [ReturnType<typeof Type.Literal>]),
  custoUnitario:  Type.Number({ minimum: 0 }),
  estoqueInicial: Type.Optional(Type.Number({ minimum: 0 })),
});

const AtualizarInsumoSchema = Type.Object({
  nome:          Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  unidade:       Type.Optional(Type.Union(UNIDADES.map((u) => Type.Literal(u)) as [ReturnType<typeof Type.Literal>])),
  custoUnitario: Type.Optional(Type.Number({ minimum: 0 })),
});

const InsumoParamsSchema = Type.Object({ id: Type.String() });

function serializarInsumo(insumo: { custoUnitario: unknown; estoqueAtual: unknown; [k: string]: unknown }) {
  return { ...insumo, custoUnitario: Number(insumo.custoUnitario), estoqueAtual: Number(insumo.estoqueAtual) };
}

export async function insumosRoutes(fastify: FastifyInstance) {
  // ── GET /insumos ────────────────────────────────────────────────────────────
  fastify.get('/insumos', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const insumos = await prisma.insumo.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
    });
    return insumos.map(serializarInsumo);
  });

  // ── POST /insumos ───────────────────────────────────────────────────────────
  // estoqueInicial (opcional) gera automaticamente uma MovimentacaoEstoque tipo
  // 'entrada' — mantém a regra de que estoqueAtual nunca é escrito fora do ledger.
  fastify.post('/insumos', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { body: CriarInsumoSchema },
  }, async (request, reply) => {
    const { nome, unidade, custoUnitario, estoqueInicial } = request.body as {
      nome: string; unidade: UnidadeMedida; custoUnitario: number; estoqueInicial?: number;
    };
    const { estabelecimentoId, userId } = request.user;

    const existente = await prisma.insumo.findUnique({
      where: { estabelecimentoId_nome: { estabelecimentoId: estabelecimentoId!, nome } },
    });
    if (existente) return reply.status(409).send({ erro: 'Já existe um insumo com esse nome' });

    const insumo = await prisma.$transaction(async (tx) => {
      const criado = await tx.insumo.create({
        data: {
          nome,
          unidade,
          custoUnitario,
          estoqueAtual: estoqueInicial ?? 0,
          estabelecimentoId: estabelecimentoId!,
        },
      });
      if (estoqueInicial && estoqueInicial > 0) {
        await tx.movimentacaoEstoque.create({
          data: {
            tipo:                  'entrada',
            quantidade:            estoqueInicial,
            custoUnitarioSnapshot: custoUnitario,
            data:                  new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
            insumoId:              criado.id,
            estabelecimentoId:     estabelecimentoId!,
            usuarioId:             userId,
          },
        });
      }
      return criado;
    });

    return reply.status(201).send(serializarInsumo(insumo));
  });

  // ── PATCH /insumos/:id ──────────────────────────────────────────────────────
  // Nunca altera estoqueAtual — só nome/unidade/custoUnitario.
  fastify.patch('/insumos/:id', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { params: InsumoParamsSchema, body: AtualizarInsumoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as { nome?: string; unidade?: UnidadeMedida; custoUnitario?: number };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.insumo.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    const atualizado = await prisma.insumo.findUnique({ where: { id } });
    return serializarInsumo(atualizado!);
  });

  // ── DELETE /insumos/:id ─────────────────────────────────────────────────────
  // Bloqueado se já existir alguma movimentação — preserva o ledger histórico
  // (mesmo padrão de bloqueio que Setor já usa contra ItemCardapio vinculado).
  fastify.delete('/insumos/:id', {
    onRequest: [autenticar, temPermissao('estoque'), moduloAtivo('estoque_avancado')],
    schema: { params: InsumoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const insumo = await prisma.insumo.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!insumo) return reply.status(404).send({ erro: 'Insumo não encontrado' });

    const movimentacoes = await prisma.movimentacaoEstoque.count({ where: { insumoId: id } });
    if (movimentacoes > 0) {
      return reply.status(422).send({ erro: 'Este insumo já tem movimentações registradas e não pode ser excluído' });
    }

    await prisma.insumo.delete({ where: { id } });
    return reply.status(204).send();
  });
}
