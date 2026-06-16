import { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { autenticar, apenasAdmin } from '../plugins/auth.js';

type EstabelecimentoComCount = {
  id: string;
  nome: string;
  slug: string;
  telefone: string;
  ativo: boolean;
  criadoEm: Date;
  _count: { usuarios: number; pedidos: number; itens: number };
};

/**
 * Rotas exclusivas do Super Admin da plataforma.
 * Todas protegidas por autenticar + apenasAdmin.
 * Nunca expostas no painel do estabelecimento.
 */
export async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', autenticar);
  fastify.addHook('onRequest', apenasAdmin);

  // ── GET /admin/estabelecimentos ──────────────────────────────────────────
  fastify.get('/admin/estabelecimentos', async () => {
    const estabelecimentos = await prisma.estabelecimento.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        _count: {
          select: { usuarios: true, pedidos: true, itens: true },
        },
      },
    });

    return estabelecimentos.map((e: EstabelecimentoComCount) => ({
      id: e.id,
      nome: e.nome,
      slug: e.slug,
      telefone: e.telefone,
      ativo: e.ativo,
      criadoEm: e.criadoEm,
      totalUsuarios: e._count.usuarios,
      totalPedidos: e._count.pedidos,
      totalItens: e._count.itens,
    }));
  });

  // ── PATCH /admin/estabelecimentos/:id/suspender ──────────────────────────
  fastify.patch('/admin/estabelecimentos/:id/suspender', async (request, reply) => {
    const { id } = request.params as { id: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id },
    });

    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const atualizado = await prisma.estabelecimento.update({
      where: { id },
      data: { ativo: !estabelecimento.ativo },
    });

    return { id: atualizado.id, nome: atualizado.nome, ativo: atualizado.ativo };
  });

  // ── GET /admin/metricas ──────────────────────────────────────────────────
  fastify.get('/admin/metricas', async () => {
    const [
      totalEstabelecimentos,
      estabelecimentosAtivos,
      totalPedidos,
      faturamentoAgregado,
      totalUsuarios,
    ] = await Promise.all([
      prisma.estabelecimento.count(),
      prisma.estabelecimento.count({ where: { ativo: true } }),
      prisma.pedido.count(),
      prisma.pedido.aggregate({ _sum: { total: true } }),
      prisma.usuario.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    ]);

    return {
      totalEstabelecimentos,
      estabelecimentosAtivos,
      estabelecimentosSuspensos: totalEstabelecimentos - estabelecimentosAtivos,
      totalPedidos,
      faturamentoTotal: Number(faturamentoAgregado._sum.total ?? 0),
      totalUsuarios,
    };
  });
}
