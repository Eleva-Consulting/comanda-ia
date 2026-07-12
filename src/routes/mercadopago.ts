import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';
import { montarUrlAutorizacao, trocarCodePorToken, buscarPagamento, obterAccessTokenValido } from '../mercadopago.js';
import { getIO } from '../socket.js';
import { enviarPush } from '../push.js';
import { whatsApp } from '../whatsapp.js';
import { montarResumoWhatsApp } from '../utils/resumoPedido.js';

const CallbackQuerySchema = Type.Object({
  code:  Type.Optional(Type.String()),
  state: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

// Chave separada da sessão normal do app — usada só pra assinar/verificar o `state` do OAuth do MP.
// Assim, mesmo que o `state` vaze (URL, Referer, logs do MP), ele nunca é aceito por `autenticar()`,
// que sempre verifica com o segredo padrão configurado no plugin @fastify/jwt.
const MP_OAUTH_STATE_KEY = `${process.env.JWT_SECRET}:mp-oauth-state`;

export async function mercadoPagoRoutes(fastify: FastifyInstance) {
  // GET /meu-estabelecimento/mercadopago/conectar — gera a URL de autorização OAuth
  fastify.get('/meu-estabelecimento/mercadopago/conectar', {
    onRequest: [autenticar, temPermissao('configuracoes')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    // O payload do JWT global exige o shape completo de sessão (ver plugins/auth.ts), mas não
    // reaproveitamos request.user de verdade nem o segredo padrão: isso assinaria a sessão real
    // do usuário (role/permissoes reais) com a mesma chave usada por `autenticar()`, e o `state`
    // passa por URL/Referer/logs do MP — um vazamento viraria replay de sessão válida. Assinamos
    // um payload sem privilégio real (role não-DONO, sem permissões) com uma chave separada.
    const state = fastify.jwt.sign(
      { userId: 'mp-oauth-state', estabelecimentoId, role: 'OPERADOR', permissoes: [], setorId: null },
      { expiresIn: '10m', key: MP_OAUTH_STATE_KEY },
    );
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
      const payload = fastify.jwt.verify<{ estabelecimentoId: string }>(state, { key: MP_OAUTH_STATE_KEY });
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

  // POST /webhooks/mercadopago — notificação de pagamento (sem auth)
  fastify.post('/webhooks/mercadopago', async (request, reply) => {
    const query = request.query as { 'data.id'?: string; id?: string; topic?: string; type?: string };
    const body  = request.body as { data?: { id?: string }; type?: string } | undefined;

    const paymentId = query['data.id'] ?? query.id ?? body?.data?.id;
    const tipo       = query.topic ?? query.type ?? body?.type;

    if (tipo !== 'payment' || !paymentId) {
      return reply.status(200).send({ recebido: true });
    }

    const pedidoPendente = await prisma.pedido.findFirst({ where: { mpPaymentId: String(paymentId) } });
    if (!pedidoPendente || !pedidoPendente.aguardandoPagamento) {
      // Não é nosso pagamento, ou já foi processado antes (idempotência) — ignora sem erro.
      return reply.status(200).send({ recebido: true });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { id: pedidoPendente.estabelecimentoId },
    });
    if (!estabelecimento?.mpAccessToken) {
      return reply.status(200).send({ recebido: true });
    }

    let pedidoConfirmado;
    try {
      const accessToken = await obterAccessTokenValido(estabelecimento);
      const pagamento = await buscarPagamento(accessToken, String(paymentId));
      if (pagamento.status !== 'approved') {
        return reply.status(200).send({ recebido: true });
      }

      // Update condicional e atômico: só confirma (e só dispara as notificações abaixo) se
      // `aguardandoPagamento` ainda estava true no momento do write. Evita duplicar notificações
      // quando o Mercado Pago reenvia o mesmo webhook concorrentemente (retry).
      const { count } = await prisma.pedido.updateMany({
        where: { id: pedidoPendente.id, aguardandoPagamento: true },
        data:  { status: 'pagamento_confirmado', aguardandoPagamento: false, pagoEm: new Date() },
      });
      if (count === 0) {
        return reply.status(200).send({ recebido: true });
      }

      pedidoConfirmado = await prisma.pedido.findUniqueOrThrow({
        where:   { id: pedidoPendente.id },
        include: { itens: true },
      });
    } catch (err) {
      fastify.log.error({ err }, 'Falha ao consultar/confirmar pagamento (webhook MP)');
      return reply.status(200).send({ recebido: true });
    }

    try {
      getIO().to(estabelecimento.id).emit('pedido:novo', pedidoConfirmado);
    } catch (err) {
      fastify.log.error({ err }, 'Falha ao emitir pedido:novo via Socket.IO (webhook MP)');
    }

    // Push notification pro DONO — fire-and-forget
    prisma.pushSubscription.findMany({
      where: { usuario: { estabelecimentoId: estabelecimento.id } },
    }).then((subs) =>
      Promise.allSettled(subs.map((s) => enviarPush(s, {
        titulo: `Novo pedido — ${pedidoConfirmado.clienteNome}`,
        corpo:  `R$ ${Number(pedidoConfirmado.total).toFixed(2)} · Pix confirmado`,
        url:    '/cozinha',
      })))
    ).catch((err) => fastify.log.error({ err }, 'Falha push notifications (webhook MP)'));

    // WhatsApp pro DONO — fire-and-forget
    if (estabelecimento.telefone) {
      whatsApp.enviarMensagem(
        estabelecimento.id, estabelecimento.telefone,
        `💰 Pix confirmado — *${pedidoConfirmado.clienteNome}*\nTotal: R$ ${Number(pedidoConfirmado.total).toFixed(2)}`,
      ).catch((err) => fastify.log.error({ err }, 'Falha WhatsApp dono (webhook MP)'));
    }

    // WhatsApp pro CLIENTE — fire-and-forget (suspenso até aqui pra não vazar pedido não pago)
    if (pedidoConfirmado.clienteFone) {
      // Mesma mensagem padrão de "pagamento_confirmado" usada em PATCH /pedidos/:id/status,
      // pra manter consistência com as próximas mensagens de status (em_preparo, pronto etc).
      whatsApp.enviarMensagem(
        estabelecimento.id, pedidoConfirmado.clienteFone,
        '💰 *Pagamento confirmado!* Seu pedido foi aceito e logo entra em preparo.',
      ).catch((err) => fastify.log.error({ err }, 'Falha WhatsApp confirmação cliente (webhook MP)'));

      const msgCliente = montarResumoWhatsApp({
        nomeEstabelecimento: estabelecimento.nome,
        clienteNome:         pedidoConfirmado.clienteNome,
        itens:               pedidoConfirmado.itens.map((i) => ({
          nomeItem: i.nomeItem, quantidade: i.quantidade, precoUnit: Number(i.precoUnit),
        })),
        subtotal:            Number(pedidoConfirmado.total) - Number(pedidoConfirmado.taxaEntrega ?? 0),
        taxaEntrega:         Number(pedidoConfirmado.taxaEntrega ?? 0),
        bairroNome:          pedidoConfirmado.bairroNome,
        enderecoEntrega:     pedidoConfirmado.enderecoEntrega,
        tipoEntrega:         pedidoConfirmado.tipoEntrega,
        formaPagamento:      pedidoConfirmado.formaPagamento,
        precisaTroco:        false,
        trocoPara:           null,
        total:               Number(pedidoConfirmado.total),
        chavePix:            null,
      });
      whatsApp.enviarMensagem(estabelecimento.id, pedidoConfirmado.clienteFone, msgCliente)
        .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp cliente (webhook MP)'));
    }

    return reply.status(200).send({ recebido: true });
  });
}
