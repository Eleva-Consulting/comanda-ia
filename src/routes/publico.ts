import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { getIO } from '../socket.js';
import { enviarEmail, templates } from '../mailer.js';
import { enviarPush } from '../push.js';
import { whatsApp } from '../whatsapp.js';
import { resolverTaxaEntrega } from '../utils/entrega.js';
import { montarResumoWhatsApp } from '../utils/resumoPedido.js';
import { criarPagamentoPix, obterAccessTokenValido } from '../mercadopago.js';
import { paraOpcoesAcompanhamento, resolverAcompanhamento } from '../utils/acompanhamento.js';
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
  clienteFone:     Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  bairroId:        Type.Optional(Type.String()),
  tipoEntrega: Type.Union([Type.Literal('entrega'), Type.Literal('retirada')]),
  formaPagamento:  Type.Union([
    Type.Literal('pix'),
    Type.Literal('dinheiro'),
    Type.Literal('cartao_credito'),
    Type.Literal('cartao_debito'),
  ]),
  precisaTroco: Type.Optional(Type.Boolean()),
  trocoPara:    Type.Optional(Type.Number({ minimum: 0 })),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String(),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
      acompanhamento: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
    }),
    { minItems: 1 }
  ),
});

const AvaliarPedidoSchema = Type.Object({
  avaliacao:           Type.Integer({ minimum: 1, maximum: 5 }),
  comentarioAvaliacao: Type.Optional(Type.String({ maxLength: 500 })),
});

type ItemPedidoInput  = { itemCardapioId: string; quantidade: number; acompanhamento?: string };
type CategoriaRow = { id: string; nome: string; ordem: number; opcoesAcompanhamento: unknown } | null;

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
          include: { categoria: { select: { id: true, nome: true, ordem: true, opcoesAcompanhamento: true } } },
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
        mpConectado:      estabelecimento.mpConectado,
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
          categoria: item.categoria
            ? { id: item.categoria.id, nome: item.categoria.nome, ordem: item.categoria.ordem }
            : null,
          opcoesAcompanhamento: paraOpcoesAcompanhamento(item.categoria?.opcoesAcompanhamento),
        })),
    };
  });

  // GET /publico/:slug/bairros — lista de bairros com taxa (sem auth)
  fastify.get('/publico/:slug/bairros', {
    schema: { params: SlugParamsSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { slug } });
    if (!estabelecimento) return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });

    const bairros = await prisma.bairro.findMany({
      where:   { estabelecimentoId: estabelecimento.id },
      orderBy: { nome: 'asc' },
    });
    return bairros.map((b) => ({ id: b.id, nome: b.nome, taxaEntrega: b.taxaEntrega !== null ? Number(b.taxaEntrega) : null }));
  });

  // POST /publico/:slug/pedido — cliente final cria pedido (sem auth)
  fastify.post('/publico/:slug/pedido', {
    schema: { params: SlugParamsSchema, body: FazerPedidoSchema },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { clienteNome, clienteFone, enderecoEntrega, bairroId, tipoEntrega, formaPagamento, precisaTroco, trocoPara, itens } = request.body as {
      clienteNome:      string;
      clienteFone?:     string;
      enderecoEntrega?: string;
      bairroId?:        string;
      tipoEntrega:      TipoEntrega;
      formaPagamento:   FormaPagamento;
      precisaTroco?:    boolean;
      trocoPara?:       number;
      itens:            ItemPedidoInput[];
    };
    const clienteFoneNormalizado = clienteFone?.trim() || null;

    if (tipoEntrega === 'entrega' && !enderecoEntrega?.trim()) {
      return reply.status(400).send({ erro: 'Endereço de entrega é obrigatório' });
    }

    if (formaPagamento === 'dinheiro' && precisaTroco && !trocoPara) {
      return reply.status(400).send({ erro: 'Informe o valor para o troco' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where: { slug },
      include: {
        usuarios: {
          where:  { role: 'DONO' },
          select: { email: true, nome: true },
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

    if (formaPagamento === 'pix' && !estabelecimento.mpConectado) {
      return reply.status(400).send({ erro: 'Pagamento via Pix indisponível no momento' });
    }

    const itemIds = itens.map((i: ItemPedidoInput) => i.itemCardapioId);
    const itensCardapio: ItemCardapioRow[] = await prisma.itemCardapio.findMany({
      where:   { id: { in: itemIds }, estabelecimentoId: estabelecimento.id, disponivel: true },
      include: { categoria: { select: { id: true, nome: true, ordem: true, opcoesAcompanhamento: true } } },
    });

    if (itensCardapio.length !== itens.length) {
      return reply.status(400).send({ erro: 'Algum item do pedido não está mais disponível' });
    }

    // Verificar estoque suficiente e resolver acompanhamento (quando a categoria exige)
    for (const pedidoItem of itens) {
      const ic = itensCardapio.find((i: ItemCardapioRow) => i.id === pedidoItem.itemCardapioId)!;
      if (ic.estoque !== null && ic.estoque !== undefined && ic.estoque < pedidoItem.quantidade) {
        return reply.status(400).send({ erro: `Estoque insuficiente para "${ic.nome}"` });
      }

      const resultado = resolverAcompanhamento(ic.categoria?.opcoesAcompanhamento, pedidoItem.acompanhamento, ic.nome);
      if (resultado.erro) return reply.status(400).send({ erro: resultado.erro });
    }

    const itensComSnapshot = itens.map((pedidoItem: ItemPedidoInput) => {
      const ic = itensCardapio.find((i: ItemCardapioRow) => i.id === pedidoItem.itemCardapioId)!;
      const resultado = resolverAcompanhamento(ic.categoria?.opcoesAcompanhamento, pedidoItem.acompanhamento, ic.nome);
      return {
        nomeItem:       ic.nome,
        quantidade:     pedidoItem.quantidade,
        precoUnit:      Number(ic.preco) + (resultado.precoAdicional ?? 0),
        acompanhamento: pedidoItem.acompanhamento ?? null,
      };
    });

    const subtotal = itensComSnapshot.reduce(
      (soma: number, item: { precoUnit: number; quantidade: number }) =>
        soma + item.precoUnit * item.quantidade,
      0,
    );

    const resultadoTaxa = await resolverTaxaEntrega({
      estabelecimentoId: estabelecimento.id,
      tipoEntrega,
      bairroId,
      taxaEntregaGeral: estabelecimento.taxaEntrega,
    });
    if (resultadoTaxa.erro) {
      return reply.status(400).send({ erro: resultadoTaxa.erro });
    }

    const total = subtotal + resultadoTaxa.taxa;

    if (formaPagamento === 'dinheiro' && precisaTroco && trocoPara! < total) {
      return reply.status(400).send({ erro: 'O valor do troco precisa ser maior ou igual ao total do pedido' });
    }

    let dadosPix: { mpPaymentId: string; pixCopiaCola: string; pixQrCodeBase64: string } | null = null;
    if (formaPagamento === 'pix') {
      try {
        const payerEmail = `cliente-${Date.now()}@${estabelecimento.slug}.comanda-ia.dev`;
        const accessToken = await obterAccessTokenValido(estabelecimento);
        const pagamento = await criarPagamentoPix({
          accessToken,
          valor:              total,
          descricao:          `Pedido — ${estabelecimento.nome}`,
          externalReference:  crypto.randomUUID(),
          payerEmail,
        });
        dadosPix = {
          mpPaymentId:     pagamento.id,
          pixCopiaCola:    pagamento.qrCode,
          pixQrCodeBase64: pagamento.qrCodeBase64,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Falha ao criar pagamento Pix');
        return reply.status(502).send({ erro: 'Não foi possível gerar o pagamento Pix. Tente novamente.' });
      }
    }

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome, clienteFone: clienteFoneNormalizado, enderecoEntrega, total, formaPagamento, tipoEntrega,
        precisaTroco: formaPagamento === 'dinheiro' ? !!precisaTroco : false,
        trocoPara:    formaPagamento === 'dinheiro' && precisaTroco ? trocoPara : null,
        bairroNome:  resultadoTaxa.bairroNome,
        taxaEntrega: resultadoTaxa.taxa,
        estabelecimentoId: estabelecimento.id,
        itens: { create: itensComSnapshot },
        ...(dadosPix ? { ...dadosPix, aguardandoPagamento: true } : {}),
      },
      include: { itens: true },
    });

    // Decrementar estoque — fire-and-forget (mantém comportamento atual mesmo pro Pix aguardando pagamento)
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

    if (!pedido.aguardandoPagamento) {
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

      // WhatsApp para o DONO — fire-and-forget
      if (estabelecimento.telefone) {
        const itensTxt = itensComSnapshot
          .map((i: { nomeItem: string; quantidade: number; precoUnit: number }) =>
            `• ${i.quantidade}x ${i.nomeItem}`)
          .join('\n');
        const msgDono = `🍽️ Novo pedido — *${estabelecimento.nome}*\n\nCliente: *${clienteNome}*\nFone: ${clienteFoneNormalizado ?? 'não informado'}\nTotal: *R$ ${total.toFixed(2)}*\n\nItens:\n${itensTxt}`;
        whatsApp.enviarMensagem(estabelecimento.id, estabelecimento.telefone, msgDono)
          .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp dono'));
      }

      // WhatsApp para o CLIENTE — resumo do pedido (fire-and-forget)
      if (clienteFoneNormalizado) {
        const msgCliente = montarResumoWhatsApp({
          nomeEstabelecimento: estabelecimento.nome,
          clienteNome,
          itens: itensComSnapshot,
          subtotal,
          taxaEntrega: resultadoTaxa.taxa,
          bairroNome: resultadoTaxa.bairroNome,
          enderecoEntrega: enderecoEntrega ?? null,
          tipoEntrega,
          formaPagamento,
          precisaTroco: formaPagamento === 'dinheiro' ? !!precisaTroco : false,
          trocoPara: formaPagamento === 'dinheiro' && precisaTroco ? trocoPara ?? null : null,
          total,
          chavePix: estabelecimento.chavePix,
        });
        whatsApp.enviarMensagem(estabelecimento.id, clienteFoneNormalizado, msgCliente)
          .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp cliente'));
      }
    }

    return reply.status(201).send({
      id:              pedido.id,
      total:           Number(pedido.total),
      mensagem:        pedido.aguardandoPagamento
        ? 'Escaneie o QR Code ou copie o código Pix para pagar.'
        : 'Pedido recebido! A cozinha foi avisada.',
      pixCopiaCola:    pedido.pixCopiaCola,
      pixQrCodeBase64: pedido.pixQrCodeBase64,
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

  // GET /publico/:slug/pedidos/:id/status — polling do status de pagamento (sem auth)
  fastify.get('/publico/:slug/pedidos/:id/status', {
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { slug } });
    if (!estabelecimento) return reply.status(404).send({ erro: 'Estabelecimento não encontrado' });

    const pedido = await prisma.pedido.findFirst({
      where:  { id, estabelecimentoId: estabelecimento.id },
      select: { status: true, aguardandoPagamento: true },
    });
    if (!pedido) return reply.status(404).send({ erro: 'Pedido não encontrado' });

    return { status: pedido.status, pago: !pedido.aguardandoPagamento };
  });
}
