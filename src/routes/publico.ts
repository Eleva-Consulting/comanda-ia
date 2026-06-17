import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { getIO } from '../socket.js';
import { enviarEmail, templates } from '../mailer.js';
import type { FormaPagamento } from '../generated/prisma/enums.js';

const SlugParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 100 }),
});

const FazerPedidoSchema = Type.Object({
  clienteNome:     Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone:     Type.String({ minLength: 8, maxLength: 20 }),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
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

type ItemPedidoInput  = { itemCardapioId: string; quantidade: number };
type CategoriaRow = { id: string; nome: string; ordem: number } | null;

type ItemCardapioRow  = {
  id:         string;
  nome:       string;
  preco:      unknown;
  descricao:  string | null | undefined;
  foto:       string | null | undefined;
  categoria?: CategoriaRow;
};

export async function publicoRoutes(fastify: FastifyInstance) {
  // GET /publico/:slug — cardápio público (sem auth)
  // Bloqueado para estabelecimentos não ativos.
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
      },
      cardapio: estabelecimento.itens.map((item: ItemCardapioRow) => ({
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
    const { clienteNome, clienteFone, enderecoEntrega, formaPagamento, itens } = request.body as {
      clienteNome:      string;
      clienteFone:      string;
      enderecoEntrega?: string;
      formaPagamento:   FormaPagamento;
      itens:            ItemPedidoInput[];
    };

    // Carrega o estabelecimento e o email do DONO em uma única query
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

    const itemIds      = itens.map((i: ItemPedidoInput) => i.itemCardapioId);
    const itensCardapio: ItemCardapioRow[] = await prisma.itemCardapio.findMany({
      where: { id: { in: itemIds }, estabelecimentoId: estabelecimento.id, disponivel: true },
    });

    if (itensCardapio.length !== itens.length) {
      return reply.status(400).send({ erro: 'Algum item do pedido não está mais disponível' });
    }

    const itensComSnapshot = itens.map((pedidoItem: ItemPedidoInput) => {
      const ic = itensCardapio.find((ic: ItemCardapioRow) => ic.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem:   ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit:  Number(ic.preco),
      };
    });

    const total = itensComSnapshot.reduce(
      (soma: number, item: { precoUnit: number; quantidade: number }) =>
        soma + item.precoUnit * item.quantidade,
      0,
    );

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome, clienteFone, enderecoEntrega, total, formaPagamento,
        estabelecimentoId: estabelecimento.id,
        itens: { create: itensComSnapshot },
      },
      include: { itens: true },
    });

    getIO().to(estabelecimento.id).emit('pedido:novo', pedido);

    // Notifica o DONO por email — fire-and-forget, nunca bloqueia o response
    const dono = estabelecimento.usuarios[0];
    if (dono) {
      const urlFrontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
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

    return reply.status(201).send({
      id:       pedido.id,
      total:    Number(pedido.total),
      mensagem: 'Pedido recebido! A cozinha foi avisada.',
    });
  });
}
