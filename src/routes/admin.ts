import { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { autenticar, apenasAdmin } from '../plugins/auth.js';

type EstabelecimentoComCount = {
  id: string;
  nome: string;
  slug: string;
  telefone: string;
  status: string;
  criadoEm: Date;
  _count: { usuarios: number; pedidos: number; itens: number };
};

/**
 * Rotas exclusivas do Super Admin da plataforma.
 * Todas protegidas por autenticar + apenasAdmin.
 */
export async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', autenticar);
  fastify.addHook('onRequest', apenasAdmin);

  // ── GET /admin/estabelecimentos ──────────────────────────────────────────
  fastify.get('/admin/estabelecimentos', async () => {
    const estabelecimentos = await prisma.estabelecimento.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        _count: { select: { usuarios: true, pedidos: true, itens: true } },
      },
    });

    return estabelecimentos.map((e: EstabelecimentoComCount) => ({
      id: e.id,
      nome: e.nome,
      slug: e.slug,
      telefone: e.telefone,
      status: e.status,
      criadoEm: e.criadoEm,
      totalUsuarios: e._count.usuarios,
      totalPedidos: e._count.pedidos,
      totalItens: e._count.itens,
    }));
  });

  // ── PATCH /admin/estabelecimentos/:id/status ─────────────────────────────
  // Aprova (ativo), suspende (suspenso) ou coloca pendente
  fastify.patch('/admin/estabelecimentos/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: 'pendente' | 'ativo' | 'suspenso' };

    if (!['pendente', 'ativo', 'suspenso'].includes(status)) {
      return reply.status(400).send({ erro: 'Status inválido' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id } });
    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const atualizado = await prisma.estabelecimento.update({
      where: { id },
      data: { status },
    });

    return { id: atualizado.id, nome: atualizado.nome, status: atualizado.status };
  });

  // ── GET /admin/metricas ──────────────────────────────────────────────────
  fastify.get('/admin/metricas', async () => {
    const [
      totalEstabelecimentos,
      ativos,
      pendentes,
      suspensos,
      totalPedidos,
      faturamentoAgregado,
      totalUsuarios,
    ] = await Promise.all([
      prisma.estabelecimento.count(),
      prisma.estabelecimento.count({ where: { status: 'ativo' } }),
      prisma.estabelecimento.count({ where: { status: 'pendente' } }),
      prisma.estabelecimento.count({ where: { status: 'suspenso' } }),
      prisma.pedido.count(),
      prisma.pedido.aggregate({ _sum: { total: true } }),
      prisma.usuario.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    ]);

    return {
      totalEstabelecimentos,
      estabelecimentosAtivos: ativos,
      estabelecimentosPendentes: pendentes,
      estabelecimentosSuspensos: suspensos,
      totalPedidos,
      faturamentoTotal: Number(faturamentoAgregado._sum.total ?? 0),
      totalUsuarios,
    };
  });
}
