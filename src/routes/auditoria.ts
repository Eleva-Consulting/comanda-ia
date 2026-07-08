import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';

const ListarAuditoriaQuerySchema = Type.Object({
  de:   Type.Optional(Type.String()),
  ate:  Type.Optional(Type.String()),
  acao: Type.Optional(Type.String()),
});

export async function auditoriaRoutes(fastify: FastifyInstance) {
  // ── GET /auditoria ───────────────────────────────────────────────────────────
  // Lista básica, mais recente primeiro, limitada a 200 linhas — "auditoria completa"
  // (dashboards, exportação) é escopo de uma fase futura separada.
  fastify.get('/auditoria', {
    onRequest: [autenticar, apenasDono],
    schema: { querystring: ListarAuditoriaQuerySchema },
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const { de, ate, acao } = request.query as { de?: string; ate?: string; acao?: string };

    const registros = await prisma.logAuditoria.findMany({
      where: {
        estabelecimentoId: estabelecimentoId!,
        ...(acao ? { acao } : {}),
        ...(de || ate
          ? {
              criadoEm: {
                ...(de ? { gte: new Date(de) } : {}),
                ...(ate ? { lte: new Date(ate) } : {}),
              },
            }
          : {}),
      },
      include: { usuario: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });

    return registros.map((registro) => ({
      id:           registro.id,
      acao:         registro.acao,
      entidadeTipo: registro.entidadeTipo,
      entidadeId:   registro.entidadeId,
      motivo:       registro.motivo,
      dadosAntes:   registro.dadosAntes,
      dadosDepois:  registro.dadosDepois,
      criadoEm:     registro.criadoEm,
      usuarioNome:  registro.usuario?.nome ?? null,
    }));
  });
}
