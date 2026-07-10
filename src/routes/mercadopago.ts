import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';
import { montarUrlAutorizacao, trocarCodePorToken } from '../mercadopago.js';

const CallbackQuerySchema = Type.Object({
  code:  Type.Optional(Type.String()),
  state: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

export async function mercadoPagoRoutes(fastify: FastifyInstance) {
  // GET /meu-estabelecimento/mercadopago/conectar — gera a URL de autorização OAuth
  fastify.get('/meu-estabelecimento/mercadopago/conectar', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    // O payload do JWT global exige o shape completo de sessão (ver plugins/auth.ts);
    // reaproveitamos request.user (já validado por `autenticar`) para o token de state,
    // mas o callback só confia no campo `estabelecimentoId` ao verificar.
    const state = fastify.jwt.sign(request.user, { expiresIn: '10m' });
    return { url: montarUrlAutorizacao(state) };
  });

  // GET /meu-estabelecimento/mercadopago/status
  fastify.get('/meu-estabelecimento/mercadopago/status', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    return { conectado: estabelecimento?.mpConectado ?? false };
  });

  // DELETE /meu-estabelecimento/mercadopago/desconectar
  fastify.delete('/meu-estabelecimento/mercadopago/desconectar', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;
    await prisma.estabelecimento.update({
      where: { id: estabelecimentoId! },
      data: {
        mpAccessToken: null, mpRefreshToken: null, mpUserId: null,
        mpTokenExpiraEm: null, mpConectado: false,
      },
    });
    return reply.status(204).send();
  });

  // GET /mercadopago/callback — redirect do Mercado Pago após autorização (sem auth)
  fastify.get('/mercadopago/callback', {
    schema: { querystring: CallbackQuerySchema },
  }, async (request, reply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0].trim() ?? 'http://localhost:5173';

    if (error || !code || !state) {
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=erro`);
    }

    let estabelecimentoId: string;
    try {
      const payload = fastify.jwt.verify<{ estabelecimentoId: string }>(state);
      estabelecimentoId = payload.estabelecimentoId;
    } catch {
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=erro`);
    }

    try {
      const tokens = await trocarCodePorToken(code);
      await prisma.estabelecimento.update({
        where: { id: estabelecimentoId },
        data: {
          mpAccessToken:   tokens.accessToken,
          mpRefreshToken:  tokens.refreshToken,
          mpUserId:        tokens.userId,
          mpTokenExpiraEm: tokens.expiraEm,
          mpConectado:     true,
        },
      });
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=conectado`);
    } catch (err) {
      fastify.log.error({ err }, 'Falha ao trocar code por token do Mercado Pago');
      return reply.redirect(`${frontendUrl}/configuracoes?mercadopago=erro`);
    }
  });
}
