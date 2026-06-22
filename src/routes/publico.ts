import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { getIO } from '../socket.js';
import { enviarEmail, templates } from '../mailer.js';
import { enviarPush } from '../push.js';
import { enviarMensagemWhatsApp } from '../evolution.js';
import type { FormaPagamento, TipoEntrega } from '../generated/prisma/enums.js';

const SlugParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 100 }),
});

const PedidoParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 100 }),
  id:   Type.String({ minLength: 1 }),
});

const FazerPedidoSchema = Type.Object({
  clienteNome:     Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone:     Type.String({ minLength: 8, maxLength: 20 }),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  tipoEntrega: Type.Union([Type.Literal('entrega'), Type.Literal('retirada')]),
  formaPagamento:  Type.Union([
    Type.Literal('pix'),
    Type.Literal('dinheiro'),
    Type.Literal('cartao_credito'),
    Type.Literal('cartao_debito'),
  ]),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String(),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
    }),
    { minItems: 1 }
  ),
});

const AvaliarPedidoSchema = Type.Object({
  avaliacao:           Type.Integer({ minimum: 1, maximum: 5 }),
  comentarioAvaliacao: Type.Optional(Type.String({ maxLength: 500 })),
});

type ItemPedidoInput  = { itemCardapioId: string; quantidade: number };
type CategoriaRow = { id: string; nome: string; ordem: number } | null;

type ItemCardapioRow  = {
  id:         string;
  nome:       string;
  preco:      unknown;
  descricao:  string | null | undefined;
  foto:       string | null | undefined;
  estoque:    number | null | undefined;
  categoria?: CategoriaRow;
};

export async function publicoRoutes(fastify: FastifyInstance) {
  // GET /publico/:slug — cardápio público (sem auth)
  fastify.get('/publico/:slug', {
    schema: { params: SlugParamsSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { slug },
      include: {
        itens: {
          where:   { disponivel: true },
          orderBy: { nome: 'asc' },
          include: { categoria: { select: { id: true, nome: true, ordem: true } } },
        },
      },
    });

    if (!estabelecimento || estabelecimento.status !== 'ativo') {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    return {
      estabelecimento: {
        nome:             estabelecimento.nome,
        slug:             estabelecimento.slug,
        aceitandoPedidos: estabelecimento.aceitandoPedidos,
        chavePix:         estabelecimento.chavePix,
        taxaEntrega:      estabelecimento.taxaEntrega !== null
          ? Number(estabelecimento.taxaEntrega)
          : null,
      },
      cardapio: estabelecimento.itens
        .filter((item: ItemCardapioRow) => item.estoque == null || item.estoque > 0)
        .map((item: ItemCardapioRow) => ({
          id:        item.id,
          nome:      item.nome,
          descricao: item.descricao ?? null,
          preco:     Number(item.preco),
          foto:      item.foto ?? null,
          categoria: item.categoria ?? null,
        })),
    };
  });

  // POST /publico/:slug/pedido — cliente final cria pedido (sem auth)
  fastify.post('/publico/:slug/pedido', {
    schema: { params: SlugParamsSchema, body: FazerPedidoSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { clienteNome, clienteFone, enderecoEntrega, tipoEntrega, formaPagamento, itens } = request.body as {
      clienteNome:      string;
      clienteFone:      string;
      enderecoEntrega?: string;
      tipoEntrega:      TipoEntrega;
      formaPagamento:   FormaPagamento;
      itens:            ItemPedidoInput[];
    };

    if (tipoEntrega === 'entrega' && !enderecoEntrega?.trim()) {
      return reply.status(400).send({ erro: 'Endereço de entrega é obrigatório' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { slug },
      include: {
        usuarios: {
          where:  { role: 'DONO' },
          select: { email: true, nome: true, telefone: true },
          take:   1,
        },
      },
    });

    if (!estabelecimento || estabelecimento.status !== 'ativo') {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    if (!estabelecimento.aceitandoPedidos) {
      return reply.status(503).send({ erro: 'Estabelecimento temporariamente fechado' });
    }

    const itemIds = itens.map((i: ItemPedidoInput) => i.itemCardapioId);
    const itensCardapio: ItemCardapioRow[] = await prisma.itemCardapio.findMany({
      where: { id: { in: itemIds }, estabelecimentoId: estabelecimento.id, disponivel: true },
    });

    if (itensCardapio.length !== itens.length) {
      return reply.status(400).send({ erro: 'Algum item do pedido não está mais disponível' });
    }

    // Verificar estoque suficiente
    for (const pedidoItem of itens) {
      const ic = itensCardapio.find((i: ItemCardapioRow) => i.id === pedidoItem.itemCardapioId)!;
      if (ic.estoque !== null && ic.estoque !== undefined && ic.estoque < pedidoItem.quantidade) {
        return reply.status(400).send({ erro: `Estoque insuficiente para "${ic.nome}"` });
      }
    }

    const itensComSnapshot = itens.map((pedidoItem: ItemPedidoInput) => {
      const ic = itensCardapio.find((i: ItemCardapioRow) => i.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem:   ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit:  Number(ic.preco),
      };
    });

    const subtotal = itensComSnapshot.reduce(
      (soma: number, item: { precoUnit: number; quantidade: number }) =>
        soma + item.precoUnit * item.quantidade,
      0,
    );

    const taxa = tipoEntrega === 'entrega' && estabelecimento.taxaEntrega
      ? Number(estabelecimento.taxaEntrega)
      : 0;

    const total = subtotal + taxa;

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome, clienteFone, enderecoEntrega, total, formaPagamento, tipoEntrega,
        estabelecimentoId: estabelecimento.id,
        itens: { create: itensComSnapshot },
      },
      include: { itens: true },
    });

    // Decrementar estoque — fire-and-forget
    Promise.all(
      itens.map((pedidoItem: ItemPedidoInput) => {
        const ic = itensCardapio.find((i: ItemCardapioRow) => i.id === pedidoItem.itemCardapioId)!;
        if (ic.estoque === null || ic.estoque === undefined) return Promise.resolve();
        return prisma.itemCardapio.update({
          where: { id: pedidoItem.itemCardapioId },
          data:  { estoque: { decrement: pedidoItem.quantidade } },
        });
      })
    ).catch((err) => fastify.log.error({ err }, 'Falha ao decrementar estoque'));

    getIO().to(estabelecimento.id).emit('pedido:novo', pedido);

    // Push notification — fire-and-forget
    prisma.pushSubscription.findMany({
      where: { usuario: { estabelecimentoId: estabelecimento.id } },
    }).then((subs) =>
      Promise.allSettled(
        subs.map((s) => enviarPush(s, {
          titulo: `Novo pedido — ${clienteNome}`,
          corpo:  `R$ ${total.toFixed(2)} · ${itensComSnapshot.length} item(s)`,
          url:    '/cozinha',
        }))
      )
    ).catch((err) => fastify.log.error({ err }, 'Falha push notifications'));

    // Email para o DONO — fire-and-forget
    const dono = estabelecimento.usuarios[0];
    if (dono) {
      const urlFrontend = process.env.FRONTEND_URL?.split(',')[0].trim() ?? 'http://localhost:5173';
      enviarEmail({
        to:      dono.email,
        subject: `Novo pedido de ${clienteNome} — ${estabelecimento.nome}`,
        html:    templates.novoPedido({
          nomeEstabelecimento: estabelecimento.nome,
          clienteNome,
          itens: itensComSnapshot,
          total,
          urlFrontend,
        }),
      }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de novo pedido'));
    }

    // WhatsApp via Evolution API — fire-and-forget
    if (estabelecimento.evolutionUrl && estabelecimento.evolutionToken && dono?.telefone) {
      const itensTxt = itensComSnapshot
        .map((i: { nomeItem: string; quantidade: number; precoUnit: number }) =>
          `• ${i.quantidade}x ${i.nomeItem}`)
        .join('\n');
      const msg = `🍽️ Novo pedido — *${estabelecimento.nome}*\n\nCliente: *${clienteNome}*\nFone: ${clienteFone}\nTotal: *R$ ${total.toFixed(2)}*\n\nItens:\n${itensTxt}`;

      enviarMensagemWhatsApp(
        { url: estabelecimento.evolutionUrl, token: estabelecimento.evolutionToken },
        dono.telefone,
        msg,
      ).catch((err) => fastify.log.error({ err }, 'Falha Evolution API WhatsApp'));
    }

    return reply.status(201).send({
      id:       pedido.id,
      total:    Number(pedido.total),
      mensagem: 'Pedido recebido! A cozinha foi avisada.',
    });
  });

  // POST /publico/:slug/pedidos/:id/avaliar — cliente avalia pedido
  fastify.post('/publico/:slug/pedidos/:id/avaliar', {
    schema: { params: PedidoParamsSchema, body: AvaliarPedidoSchema },
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const { avaliacao, comentarioAvaliacao } = request.body as {
      avaliacao: number;
      comentarioAvaliacao?: string;
    };

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { slug } });
    if (!estabelecimento) {
      return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });
    }

    const resultado = await prisma.pedido.updateMany({
      where: { id, estabelecimentoId: estabelecimento.id, avaliacao: null },
      data:  { avaliacao, comentarioAvaliacao: comentarioAvaliacao ?? null },
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Pedido não encontrado ou já avaliado' });
    }

    return { mensagem: 'Avaliação registrada. Obrigado!' };
  });
}
