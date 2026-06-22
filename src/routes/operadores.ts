import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes'] as const;

const CriarOperadorSchema = Type.Object({
  nome:  Type.String({ minLength: 2, maxLength: 100 }),
  email: Type.String({ format: 'email' }),
  senha: Type.String({ minLength: 8, maxLength: 100 }),
});

const AtualizarPermissoesSchema = Type.Object({
  permissoes: Type.Array(
    Type.Union(PERMISSOES_VALIDAS.map((p) => Type.Literal(p)) as [ReturnType<typeof Type.Literal>])
  ),
});

const selecionarOperador = {
  id: true, nome: true, email: true, criadoEm: true, permissoes: true,
} as const;

function apenasDono(request: Parameters<typeof autenticar>[0], reply: Parameters<typeof autenticar>[1]) {
  if (request.user.role !== 'DONO') {
    return reply.status(403).send({ erro: 'Apenas o DONO pode gerenciar operadores' });
  }
}

export async function operadoresRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', autenticar);

  // ── GET /estabelecimentos/operadores ──────────────────────────────────────
  fastify.get('/estabelecimentos/operadores', async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    return prisma.usuario.findMany({
      where:   { estabelecimentoId: request.user.estabelecimentoId!, role: 'OPERADOR' },
      select:  selecionarOperador,
      orderBy: { criadoEm: 'desc' },
    });
  });

  // ── POST /estabelecimentos/operadores ────────────────────────────────────
  fastify.post('/estabelecimentos/operadores', {
    schema: { body: CriarOperadorSchema },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { nome, email, senha } = request.body as { nome: string; email: string; senha: string };

    const emailExistente = await prisma.usuario.findUnique({ where: { email } });
    if (emailExistente) return reply.status(409).send({ erro: 'Email já cadastrado' });

    const senhaHash = await bcrypt.hash(senha, 12);

    const operador = await prisma.usuario.create({
      data: {
        nome,
        email,
        senhaHash,
        role:              'OPERADOR',
        estabelecimentoId: request.user.estabelecimentoId!,
        permissoes:        ['cozinha'],
      },
      select: selecionarOperador,
    });

    return reply.status(201).send(operador);
  });

  // ── PATCH /estabelecimentos/operadores/:id/permissoes ────────────────────
  fastify.patch('/estabelecimentos/operadores/:id/permissoes', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body:   AtualizarPermissoesSchema,
    },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { id } = request.params as { id: string };
    const { permissoes } = request.body as { permissoes: string[] };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (!operador || operador.estabelecimentoId !== request.user.estabelecimentoId || operador.role !== 'OPERADOR') {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    return prisma.usuario.update({
      where:  { id },
      data:   { permissoes },
      select: selecionarOperador,
    });
  });

  // ── DELETE /estabelecimentos/operadores/:id ──────────────────────────────
  fastify.delete('/estabelecimentos/operadores/:id', {
    schema: { params: Type.Object({ id: Type.String() }) },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { id } = request.params as { id: string };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (!operador || operador.estabelecimentoId !== request.user.estabelecimentoId || operador.role !== 'OPERADOR') {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    await prisma.usuario.delete({ where: { id } });
    return reply.status(204).send();
  });
}
