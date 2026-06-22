import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { randomUUID, randomBytes } from 'crypto';
import { prisma } from '../database.js';
import { autenticar, apenasAdmin } from '../plugins/auth.js';
import { enviarEmail, templates } from '../mailer.js';
import { gerarSlugUnico } from '../utils/slug.js';

const AdminParamsSchema = Type.Object({
  id: Type.String(),
});

const AtualizarStatusEstabelecimentoSchema = Type.Object({
  status: Type.Union([
    Type.Literal('pendente'),
    Type.Literal('ativo'),
    Type.Literal('suspenso'),
  ]),
});

const CriarEstabelecimentoSchema = Type.Object({
  nomeEstabelecimento: Type.String({ minLength: 2, maxLength: 100 }),
  telefone:            Type.String({ minLength: 8, maxLength: 20 }),
  nomeDono:            Type.String({ minLength: 2, maxLength: 100 }),
  emailDono:           Type.String({ format: 'email' }),
});

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

  // ── POST /admin/estabelecimentos ─────────────────────────────────────────────
  // Super Admin cria estabelecimento + DONO diretamente como 'ativo'
  fastify.post('/admin/estabelecimentos', {
    schema: { body: CriarEstabelecimentoSchema },
  }, async (request, reply) => {
    const dados = request.body as {
      nomeEstabelecimento: string;
      telefone: string;
      nomeDono: string;
      emailDono: string;
    };

    const emailExistente = await prisma.usuario.findUnique({ where: { email: dados.emailDono } });
    if (emailExistente) {
      return reply.status(409).send({ erro: 'Email já cadastrado' });
    }

    const slug = await gerarSlugUnico(dados.nomeEstabelecimento);
    // Senha inutilizável — o dono define a própria via link enviado por email
    const senhaHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const setupToken = randomUUID();
    const setupTokenExpiracao = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

    const resultado = await prisma.estabelecimento.create({
      data: {
        nome:     dados.nomeEstabelecimento,
        telefone: dados.telefone,
        slug,
        status:   'ativo',
        usuarios: {
          create: {
            nome:                dados.nomeDono,
            email:               dados.emailDono,
            senhaHash,
            role:                'DONO',
            resetToken:          setupToken,
            resetTokenExpiracao: setupTokenExpiracao,
          },
        },
      },
      include: {
        _count: { select: { usuarios: true, pedidos: true, itens: true } },
      },
    });

    const urlFrontend = (process.env.FRONTEND_URL?.split(',')[0]?.trim()) ?? 'http://localhost:5173';
    enviarEmail({
      to:      dados.emailDono,
      subject: `Bem-vindo(a) à Comanda IA — defina sua senha`,
      html:    templates.definirSenha(dados.nomeDono, dados.nomeEstabelecimento, `${urlFrontend}/definir-senha?token=${setupToken}`),
    }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de setup'));

    return reply.status(201).send({
      id:            resultado.id,
      nome:          resultado.nome,
      slug:          resultado.slug,
      telefone:      resultado.telefone,
      status:        resultado.status,
      criadoEm:      resultado.criadoEm,
      totalUsuarios: resultado._count.usuarios,
      totalPedidos:  resultado._count.pedidos,
      totalItens:    resultado._count.itens,
    });
  });

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
  // Aprova (ativo), suspende (suspenso) ou coloca pendente.
  // TypeBox valida e rejeita automaticamente status inválido com 400.
  fastify.patch('/admin/estabelecimentos/:id/status', {
    schema: {
      params: AdminParamsSchema,
      body:   AtualizarStatusEstabelecimentoSchema,
    },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: 'pendente' | 'ativo' | 'suspenso' };

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id } });
    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const atualizado = await prisma.estabelecimento.update({
      where: { id },
      data: { status },
    });

    // Envia email de aprovação ao DONO quando o estabelecimento é ativado — fire-and-forget
    if (status === 'ativo') {
      prisma.usuario.findFirst({
        where:  { estabelecimentoId: id, role: 'DONO' },
        select: { email: true, nome: true },
      }).then((dono) => {
        if (!dono) return;
        const urlFrontend = (process.env.FRONTEND_URL?.split(',')[0]?.trim()) ?? 'http://localhost:5173';
        return enviarEmail({
          to:      dono.email,
          subject: `${atualizado.nome} foi aprovado na Comanda IA!`,
          html:    templates.cadastroAprovado(dono.nome, atualizado.nome, urlFrontend),
        });
      }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de aprovação'));
    }

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
      totalUsuarios,
    ] = await Promise.all([
      prisma.estabelecimento.count(),
      prisma.estabelecimento.count({ where: { status: 'ativo' } }),
      prisma.estabelecimento.count({ where: { status: 'pendente' } }),
      prisma.estabelecimento.count({ where: { status: 'suspenso' } }),
      prisma.pedido.count(),
      prisma.usuario.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    ]);

    return {
      totalEstabelecimentos,
      estabelecimentosAtivos: ativos,
      estabelecimentosPendentes: pendentes,
      estabelecimentosSuspensos: suspensos,
      totalPedidos,
      totalUsuarios,
    };
  });

  // ── DELETE /admin/estabelecimentos/:id ───────────────────────────────────────
  fastify.delete('/admin/estabelecimentos/:id', {
    schema: { params: AdminParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existente = await prisma.estabelecimento.findUnique({ where: { id } });
    if (!existente) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    await prisma.$transaction([
      prisma.conversa.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.pedido.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.itemCardapio.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.categoria.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.usuario.deleteMany({ where: { estabelecimentoId: id } }),
      prisma.estabelecimento.delete({ where: { id } }),
    ]);

    return reply.status(204).send();
  });
}
