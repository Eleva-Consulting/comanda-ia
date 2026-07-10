import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { whatsApp } from '../whatsapp.js';
import { resolverTaxaEntrega } from '../utils/entrega.js';
import { montarResumoWhatsApp } from '../utils/resumoPedido.js';
import { criarPagamentoPix, obterAccessTokenValido } from '../mercadopago.js';
import type { StatusPedido, FormaPagamento, TipoEntrega } from '../generated/prisma/enums.js';

// ── Schemas ────────────────────────────────────────────────────────────────────

const CriarPedidoSchema = Type.Object({
  clienteNome:     Type.String({ minLength: 2, maxLength: 100 }),
  clienteFone:     Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String({ minLength: 1 }),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
    }),
    { minItems: 1 }
  ),
});

const AtualizarPedidoSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('pagamento_confirmado'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});

const AtualizarStatusSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('pagamento_confirmado'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('a_caminho'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
});

const ManualPedidoSchema = Type.Object({
  clienteNome:     Type.Optional(Type.String({ maxLength: 100 })),
  clienteFone:     Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  enderecoEntrega: Type.Optional(Type.String({ maxLength: 500 })),
  bairroId:        Type.Optional(Type.String()),
  tipoEntrega: Type.Optional(Type.Union([Type.Literal('entrega'), Type.Literal('retirada')])),
  formaPagamento: Type.Optional(Type.Union([
    Type.Literal('pix'),
    Type.Literal('dinheiro'),
    Type.Literal('cartao_credito'),
    Type.Literal('cartao_debito'),
  ])),
  precisaTroco: Type.Optional(Type.Boolean()),
  trocoPara:    Type.Optional(Type.Number({ minimum: 0 })),
  itens: Type.Array(
    Type.Object({
      itemCardapioId: Type.String({ minLength: 1 }),
      quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
      observacao:     Type.Optional(Type.String({ maxLength: 300 })),
    }),
    { minItems: 1 }
  ),
});

const PedidoParamsSchema = Type.Object({
  id: Type.String(),
});

const ItemPedidoParamsSchema = Type.Object({
  id:          Type.String(),
  itemPedidoId: Type.String(),
});

const AdicionarItemSchema = Type.Object({
  itemCardapioId: Type.String({ minLength: 1 }),
  quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
  observacao:     Type.Optional(Type.String({ maxLength: 300 })),
});

const AtualizarQuantidadeItemSchema = Type.Object({
  quantidade: Type.Integer({ minimum: 1, maximum: 100 }),
});

// Status em que o pedido ainda pode ter os itens editados
const statusEditaveis: StatusPedido[] = ['recebido', 'pagamento_confirmado', 'em_preparo', 'pronto', 'a_caminho'];

function recalcularTotal(itens: { precoUnit: unknown; quantidade: number }[]): number {
  return itens.reduce((soma, item) => soma + Number(item.precoUnit) * item.quantidade, 0);
}

// Transições de status permitidas
const transicoesPermitidas: Record<StatusPedido, StatusPedido[]> = {
  recebido:              ['pagamento_confirmado', 'cancelado'],
  pagamento_confirmado:  ['em_preparo', 'cancelado'],
  em_preparo:            ['pronto', 'cancelado'],
  pronto:                ['a_caminho', 'entregue', 'cancelado'],
  a_caminho:             ['entregue', 'cancelado'],
  entregue:              [],
  cancelado:             [],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Retorna lista de StatusPedido válidos a partir de string "a,b,c" */
function parsearFiltroStatus(raw: string | undefined): StatusPedido[] | undefined {
  if (!raw) return undefined;
  const validos: StatusPedido[] = ['recebido', 'pagamento_confirmado', 'em_preparo', 'pronto', 'a_caminho', 'entregue', 'cancelado'];
  const candidatos = raw.split(',').map((s) => s.trim()) as StatusPedido[];
  const filtrados = candidatos.filter((s) => validos.includes(s));
  return filtrados.length > 0 ? filtrados : undefined;
}

// ── Rotas ─────────────────────────────────────────────────────────────────────

export async function pedidosRoutes(fastify: FastifyInstance) {
  // ── GET /pedidos ────────────────────────────────────────────────────────────
  // Paginação cursor-based. Query params:
  //   limite     — itens por página (default 20, max 100)
  //   cursor     — id do último item da página anterior
  //   status     — comma-separated: recebido,em_preparo,pronto
  //   dataInicio — ISO date string (inclusivo)
  //   dataFim    — ISO date string (inclusivo, até 23:59:59)
  fastify.get('/pedidos', {
    onRequest: [autenticar, temPermissao('cozinha', 'historico')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const q = request.query as Record<string, string | undefined>;

    const limite = Math.min(Math.max(parseInt(q.limite ?? '20', 10) || 20, 1), 100);
    const cursor  = q.cursor ?? undefined;
    const status  = parsearFiltroStatus(q.status);
    const dataInicio = q.dataInicio ? new Date(q.dataInicio) : undefined;
    const dataFim    = q.dataFim
      ? new Date(new Date(q.dataFim).setHours(23, 59, 59, 999))
      : undefined;

    const where = {
      estabelecimentoId: estabelecimentoId!,
      aguardandoPagamento: false,
      ...(status    ? { status: { in: status } } : {}),
      ...(dataInicio || dataFim
        ? { criadoEm: { ...(dataInicio ? { gte: dataInicio } : {}), ...(dataFim ? { lte: dataFim } : {}) } }
        : {}),
    };

    const pedidos = await prisma.pedido.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: limite + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { itens: true },
    });

    const temProximo = pedidos.length > limite;
    const dados      = temProximo ? pedidos.slice(0, limite) : pedidos;
    const proximo    = temProximo ? dados[dados.length - 1].id : null;

    return { dados, proximo };
  });

  // ── GET /pedidos/:id ────────────────────────────────────────────────────────
  fastify.get('/pedidos/:id', {
    onRequest: [autenticar, temPermissao('cozinha', 'historico')],
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
      include: { itens: true },
    });

    if (!pedido) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    return pedido;
  });

  // ── POST /pedidos ───────────────────────────────────────────────────────────
  // Total calculado no servidor — nunca confia no cliente.
  // Todos os itens devem pertencer ao estabelecimento e estar disponíveis.
  fastify.post('/pedidos', {
    onRequest: [autenticar, temPermissao('pedido_manual')],
    schema: { body: CriarPedidoSchema },
  }, async (request, reply) => {
    const { clienteNome, clienteFone, enderecoEntrega, itens } = request.body as {
      clienteNome: string;
      clienteFone?: string;
      enderecoEntrega?: string;
      itens: { itemCardapioId: string; quantidade: number }[];
    };
    const { estabelecimentoId } = request.user;

    const itemIds = itens.map((i) => i.itemCardapioId);

    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id:                { in: itemIds },
        estabelecimentoId: estabelecimentoId!,
        disponivel:        true,
      },
    });

    if (itensCardapio.length !== itemIds.length) {
      return reply.status(400).send({
        erro: 'Um ou mais itens não estão disponíveis ou não pertencem a este estabelecimento',
      });
    }

    const itensComSnapshot = itens.map((pedidoItem) => {
      const ic = itensCardapio.find((ic) => ic.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem:  ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit:  Number(ic.preco),
      };
    });

    const total = itensComSnapshot.reduce(
      (soma, item) => soma + item.precoUnit * item.quantidade,
      0
    );

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome,
        clienteFone: clienteFone?.trim() || null,
        enderecoEntrega,
        total,
        origem: 'balcao',
        estabelecimentoId: estabelecimentoId!,
        itens: { create: itensComSnapshot },
      },
      include: { itens: true },
    });

    return reply.status(201).send(pedido);
  });

  // ── PATCH /pedidos/:id ──────────────────────────────────────────────────────
  // Transação garante que verificação de propriedade e update são atômicos.
  fastify.patch('/pedidos/:id', {
    onRequest: [autenticar, temPermissao('cozinha')],
    schema: { params: PedidoParamsSchema, body: AtualizarStatusSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusPedido };
    const { estabelecimentoId } = request.user;

    const pedidoAtualizado = await prisma.$transaction(async (tx) => {
      const existente = await tx.pedido.findFirst({
        where: { id, estabelecimentoId: estabelecimentoId! },
      });
      if (!existente) return null;

      const permitidos = transicoesPermitidas[existente.status];
      if (!permitidos.includes(status)) return 'transicao_invalida' as const;

      return tx.pedido.update({
        where:   { id },
        data:    { status },
        include: { itens: true },
      });
    });

    if (!pedidoAtualizado) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    if (pedidoAtualizado === 'transicao_invalida') {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoAtualizado);

    // WhatsApp para o cliente — fire-and-forget
    const mensagensStatus: Partial<Record<StatusPedido, string>> = {
      pagamento_confirmado: '💰 *Pagamento confirmado!* Seu pedido foi aceito e logo entra em preparo.',
      em_preparo:  '👨‍🍳 Seu pedido está sendo preparado!',
      pronto:      '🎉 Seu pedido está pronto para retirada!',
      a_caminho:   '🛵 Seu pedido saiu para entrega!',
      entregue:    '✅ Pedido entregue! Obrigado pela preferência. 😊',
      cancelado:   '❌ Seu pedido foi cancelado. Qualquer dúvida, entre em contato conosco.',
    };
    const textoWp = mensagensStatus[status];
    if (textoWp && pedidoAtualizado.clienteFone && pedidoAtualizado.origem !== 'balcao') {
      fastify.log.info({ clienteFone: pedidoAtualizado.clienteFone, status }, 'WhatsApp: disparando notificação de status')
      whatsApp.enviarMensagem(estabelecimentoId!, pedidoAtualizado.clienteFone, textoWp)
        .catch((err) => fastify.log.error({ err, clienteFone: pedidoAtualizado.clienteFone, status }, 'Falha WhatsApp status pedido'));
    }

    return pedidoAtualizado;
  });

  // ── POST /pedidos/:id/reabrir ───────────────────────────────────────────────
  // Reverte um pedido entregue/cancelado de volta pra um status ativo, pra
  // corrigir engano (ex: cliente pede mais um item depois de "concluído").
  // Exige a senha configurada pelo DONO em Configurações.
  fastify.post('/pedidos/:id/reabrir', {
    onRequest: [autenticar, temPermissao('cozinha')],
    schema: { params: PedidoParamsSchema, body: Type.Object({ senha: Type.String({ minLength: 1 }) }) },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { senha } = request.body as { senha: string };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!pedido) return reply.status(404).send({ erro: 'Pedido não encontrado' });

    if (pedido.status !== 'entregue' && pedido.status !== 'cancelado') {
      return reply.status(422).send({ erro: 'Só é possível reabrir pedidos entregues ou cancelados' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.senhaReabrirPedido) {
      return reply.status(400).send({ erro: 'Configure uma senha de reabertura em Configurações antes de usar essa função' });
    }

    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
    if (!senhaCorreta) {
      return reply.status(403).send({ erro: 'Senha incorreta' });
    }

    const novoStatus: StatusPedido = pedido.status === 'entregue' ? 'em_preparo' : 'recebido';
    const pedidoReaberto = await prisma.pedido.update({
      where:   { id },
      data:    { status: novoStatus },
      include: { itens: true },
    });

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoReaberto);

    return pedidoReaberto;
  });

  // ── POST /pedidos/manual ────────────────────────────────────────────────────
  fastify.post('/pedidos/manual', {
    onRequest: [autenticar, temPermissao('pedido_manual')],
    schema: { body: ManualPedidoSchema },
  }, async (request, reply) => {
    const { clienteNome, clienteFone, enderecoEntrega, bairroId, tipoEntrega, formaPagamento, precisaTroco, trocoPara, itens } = request.body as {
      clienteNome?:     string;
      clienteFone?:     string;
      enderecoEntrega?: string;
      bairroId?:        string;
      tipoEntrega?:     TipoEntrega;
      formaPagamento?:  FormaPagamento;
      precisaTroco?:    boolean;
      trocoPara?:       number;
      itens: { itemCardapioId: string; quantidade: number; observacao?: string }[];
    };
    const { estabelecimentoId } = request.user;
    const tipoEntregaFinal = tipoEntrega ?? 'retirada';
    const formaPagamentoFinal = formaPagamento ?? 'dinheiro';
    const clienteNomeFinal = clienteNome?.trim() || 'Cliente';
    const clienteFoneNormalizado = clienteFone?.trim() || null;

    if (tipoEntregaFinal === 'entrega' && !enderecoEntrega?.trim()) {
      return reply.status(400).send({ erro: 'Endereço de entrega é obrigatório' });
    }

    if (formaPagamentoFinal === 'dinheiro' && precisaTroco && !trocoPara) {
      return reply.status(400).send({ erro: 'Informe o valor para o troco' });
    }

    const itemIds = itens.map((i) => i.itemCardapioId);

    const itensCardapio = await prisma.itemCardapio.findMany({
      where: {
        id:                { in: itemIds },
        estabelecimentoId: estabelecimentoId!,
        disponivel:        true,
      },
    });

    if (itensCardapio.length !== itemIds.length) {
      return reply.status(400).send({
        erro: 'Um ou mais itens não estão disponíveis ou não pertencem a este estabelecimento',
      });
    }

    const itensComSnapshot = itens.map((pedidoItem) => {
      const ic = itensCardapio.find((ic) => ic.id === pedidoItem.itemCardapioId)!;
      return {
        nomeItem:   ic.nome,
        quantidade: pedidoItem.quantidade,
        precoUnit:  Number(ic.preco),
        observacao: pedidoItem.observacao,
      };
    });

    const subtotal = itensComSnapshot.reduce(
      (soma, item) => soma + item.precoUnit * item.quantidade,
      0
    );

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });

    if (formaPagamentoFinal === 'pix' && !estabelecimento?.mpConectado) {
      return reply.status(400).send({ erro: 'Pagamento via Pix indisponível — conecte o Mercado Pago em Configurações' });
    }

    const resultadoTaxa = await resolverTaxaEntrega({
      estabelecimentoId: estabelecimentoId!,
      tipoEntrega: tipoEntregaFinal,
      bairroId,
      taxaEntregaGeral: estabelecimento?.taxaEntrega,
    });
    if (resultadoTaxa.erro) {
      return reply.status(400).send({ erro: resultadoTaxa.erro });
    }

    const total = subtotal + resultadoTaxa.taxa;

    if (formaPagamentoFinal === 'dinheiro' && precisaTroco && trocoPara! < total) {
      return reply.status(400).send({ erro: 'O valor do troco precisa ser maior ou igual ao total do pedido' });
    }

    let dadosPix: { mpPaymentId: string; pixCopiaCola: string; pixQrCodeBase64: string } | null = null;
    if (formaPagamentoFinal === 'pix') {
      try {
        const payerEmail = `cliente-${Date.now()}@${estabelecimento!.slug}.comanda-ia.dev`;
        const accessToken = await obterAccessTokenValido(estabelecimento!);
        const pagamento = await criarPagamentoPix({
          accessToken,
          valor:              total,
          descricao:          `Pedido — ${estabelecimento!.nome}`,
          externalReference:  crypto.randomUUID(),
          payerEmail,
        });
        dadosPix = {
          mpPaymentId:     pagamento.id,
          pixCopiaCola:    pagamento.qrCode,
          pixQrCodeBase64: pagamento.qrCodeBase64,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Falha ao criar pagamento Pix (pedido manual)');
        return reply.status(502).send({ erro: 'Não foi possível gerar o pagamento Pix. Tente novamente.' });
      }
    }

    const pedido = await prisma.pedido.create({
      data: {
        clienteNome: clienteNomeFinal,
        clienteFone: clienteFoneNormalizado,
        enderecoEntrega: enderecoEntrega?.trim() || null,
        bairroNome:  resultadoTaxa.bairroNome,
        taxaEntrega: resultadoTaxa.taxa,
        total,
        tipoEntrega: tipoEntregaFinal,
        formaPagamento: formaPagamentoFinal,
        precisaTroco: formaPagamentoFinal === 'dinheiro' ? !!precisaTroco : false,
        trocoPara:    formaPagamentoFinal === 'dinheiro' && precisaTroco ? trocoPara : null,
        origem: 'balcao',
        estabelecimentoId: estabelecimentoId!,
        itens: { create: itensComSnapshot },
        ...(dadosPix ? { ...dadosPix, aguardandoPagamento: true } : {}),
      },
      include: { itens: true },
    });

    if (!pedido.aguardandoPagamento) {
      getIO().to(estabelecimentoId!).emit('pedido:novo', pedido);

      // WhatsApp para o CLIENTE — resumo do pedido (fire-and-forget)
      if (clienteFoneNormalizado) {
        const msgCliente = montarResumoWhatsApp({
          nomeEstabelecimento: estabelecimento!.nome,
          clienteNome: clienteNomeFinal,
          itens: itensComSnapshot,
          subtotal,
          taxaEntrega: resultadoTaxa.taxa,
          bairroNome: resultadoTaxa.bairroNome,
          enderecoEntrega: enderecoEntrega?.trim() || null,
          tipoEntrega: tipoEntregaFinal,
          formaPagamento: formaPagamentoFinal,
          precisaTroco: formaPagamentoFinal === 'dinheiro' ? !!precisaTroco : false,
          trocoPara: formaPagamentoFinal === 'dinheiro' && precisaTroco ? trocoPara ?? null : null,
          total,
          chavePix: estabelecimento!.chavePix,
        });
        whatsApp.enviarMensagem(estabelecimentoId!, clienteFoneNormalizado, msgCliente)
          .catch((err) => fastify.log.error({ err }, 'Falha WhatsApp cliente (pedido manual)'));
      }
    }

    return reply.status(201).send(pedido);
  });

  // ── DELETE /pedidos/:id ─────────────────────────────────────────────────────
  fastify.delete('/pedidos/:id', {
    onRequest: [autenticar, temPermissao('cozinha')],
    schema: { params: PedidoParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.pedido.deleteMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Pedido não encontrado' });
    }
    return reply.status(204).send();
  });

  // ── POST /pedidos/:id/itens ──────────────────────────────────────────────────
  // Adiciona um item a um pedido existente, usando o preço atual do cardápio.
  fastify.post('/pedidos/:id/itens', {
    onRequest: [autenticar, temPermissao('cozinha')],
    schema: { params: PedidoParamsSchema, body: AdicionarItemSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itemCardapioId, quantidade, observacao } = request.body as {
      itemCardapioId: string; quantidade: number; observacao?: string;
    };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!pedido) return reply.status(404).send({ erro: 'Pedido não encontrado' });
    if (!statusEditaveis.includes(pedido.status)) {
      return reply.status(422).send({ erro: 'Este pedido não pode mais ser editado' });
    }

    const itemCardapio = await prisma.itemCardapio.findFirst({
      where: { id: itemCardapioId, estabelecimentoId: estabelecimentoId!, disponivel: true },
    });
    if (!itemCardapio) return reply.status(400).send({ erro: 'Item não disponível ou não pertence a este estabelecimento' });

    await prisma.itemPedido.create({
      data: {
        pedidoId:   id,
        nomeItem:   itemCardapio.nome,
        quantidade,
        precoUnit:  itemCardapio.preco,
        observacao: observacao ?? null,
      },
    });

    const itens = await prisma.itemPedido.findMany({ where: { pedidoId: id } });
    const pedidoAtualizado = await prisma.pedido.update({
      where:   { id },
      data:    { total: recalcularTotal(itens) },
      include: { itens: true },
    });

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoAtualizado);
    return reply.status(201).send(pedidoAtualizado);
  });

  // ── PATCH /pedidos/:id/itens/:itemPedidoId ───────────────────────────────────
  // Muda a quantidade de um item já existente no pedido — preço travado não muda.
  fastify.patch('/pedidos/:id/itens/:itemPedidoId', {
    onRequest: [autenticar, temPermissao('cozinha')],
    schema: { params: ItemPedidoParamsSchema, body: AtualizarQuantidadeItemSchema },
  }, async (request, reply) => {
    const { id, itemPedidoId } = request.params as { id: string; itemPedidoId: string };
    const { quantidade } = request.body as { quantidade: number };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!pedido) return reply.status(404).send({ erro: 'Pedido não encontrado' });
    if (!statusEditaveis.includes(pedido.status)) {
      return reply.status(422).send({ erro: 'Este pedido não pode mais ser editado' });
    }

    const itemExistente = await prisma.itemPedido.findFirst({ where: { id: itemPedidoId, pedidoId: id } });
    if (!itemExistente) return reply.status(404).send({ erro: 'Item não encontrado neste pedido' });

    await prisma.itemPedido.update({ where: { id: itemPedidoId }, data: { quantidade } });

    const itens = await prisma.itemPedido.findMany({ where: { pedidoId: id } });
    const pedidoAtualizado = await prisma.pedido.update({
      where:   { id },
      data:    { total: recalcularTotal(itens) },
      include: { itens: true },
    });

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoAtualizado);
    return pedidoAtualizado;
  });

  // ── DELETE /pedidos/:id/itens/:itemPedidoId ──────────────────────────────────
  // Remove um item do pedido. Bloqueado se for o último item restante.
  fastify.delete('/pedidos/:id/itens/:itemPedidoId', {
    onRequest: [autenticar, temPermissao('cozinha')],
    schema: { params: ItemPedidoParamsSchema },
  }, async (request, reply) => {
    const { id, itemPedidoId } = request.params as { id: string; itemPedidoId: string };
    const { estabelecimentoId } = request.user;

    const pedido = await prisma.pedido.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!pedido) return reply.status(404).send({ erro: 'Pedido não encontrado' });
    if (!statusEditaveis.includes(pedido.status)) {
      return reply.status(422).send({ erro: 'Este pedido não pode mais ser editado' });
    }

    const itensAtuais = await prisma.itemPedido.findMany({ where: { pedidoId: id } });
    const itemExistente = itensAtuais.find((i) => i.id === itemPedidoId);
    if (!itemExistente) return reply.status(404).send({ erro: 'Item não encontrado neste pedido' });
    if (itensAtuais.length === 1) {
      return reply.status(422).send({ erro: 'O pedido precisa ter pelo menos 1 item. Para remover tudo, cancele o pedido.' });
    }

    await prisma.itemPedido.delete({ where: { id: itemPedidoId } });

    const itensRestantes = itensAtuais.filter((i) => i.id !== itemPedidoId);
    const pedidoAtualizado = await prisma.pedido.update({
      where:   { id },
      data:    { total: recalcularTotal(itensRestantes) },
      include: { itens: true },
    });

    getIO().to(estabelecimentoId!).emit('pedido:atualizado', pedidoAtualizado);
    return pedidoAtualizado;
  });
}
