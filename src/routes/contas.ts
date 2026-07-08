import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { transicaoProducaoValida, podeCancelarLivremente } from '../utils/statusProducao.js';
import { serializarItemProducao, salaProducao } from '../utils/producao.js';
import type { StatusConta, StatusProducao } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';

const AbrirContaSchema = Type.Object({
  mesaId: Type.String({ minLength: 1 }),
});

const ContaParamsSchema = Type.Object({ id: Type.String() });

const CriarComandaSchema = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 40 }),
});

const AtualizarComandaSchema = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 40 }),
});

const ComandaParamsSchema = Type.Object({ id: Type.String() });

const AdicionarItemComandaSchema = Type.Object({
  itemCardapioId: Type.String({ minLength: 1 }),
  quantidade:     Type.Integer({ minimum: 1, maximum: 100 }),
  observacao:     Type.Optional(Type.String({ maxLength: 300 })),
});

const ItemComandaParamsSchema = Type.Object({ id: Type.String() });

const AtualizarStatusItemComandaSchema = Type.Object({
  status: Type.Union([
    Type.Literal('recebido'),
    Type.Literal('em_preparo'),
    Type.Literal('pronto'),
    Type.Literal('entregue'),
    Type.Literal('cancelado'),
  ]),
  motivo: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  senha: Type.Optional(Type.String({ minLength: 1 })),
});

const TransferirItemComandaSchema = Type.Object({
  comandaId: Type.String({ minLength: 1 }),
});

const AtualizarStatusContaSchema = Type.Object({
  status: Type.Union([
    Type.Literal('aberta'),
    Type.Literal('aguardando_pagamento'),
    Type.Literal('cancelada'),
  ]),
});

const transicoesContaPermitidas: Record<StatusConta, StatusConta[]> = {
  aberta:               ['aguardando_pagamento', 'cancelada'],
  aguardando_pagamento: ['aberta'],
  fechada:              [],
  cancelada:            [],
};

interface ItemComandaComPreco {
  precoUnit: unknown;
  [chave: string]: unknown;
}

function serializarItemComanda(item: ItemComandaComPreco) {
  return { ...item, precoUnit: Number(item.precoUnit) };
}

interface ComandaComItens {
  itens?: ItemComandaComPreco[];
  [chave: string]: unknown;
}

export interface ContaComComandas {
  comandas?: ComandaComItens[];
  [chave: string]: unknown;
}

export function serializarConta(conta: ContaComComandas) {
  return {
    ...conta,
    comandas: conta.comandas?.map((comanda) => ({
      ...comanda,
      itens: comanda.itens?.map(serializarItemComanda),
    })),
  };
}

export async function contasRoutes(fastify: FastifyInstance) {
  // ── GET /contas ─────────────────────────────────────────────────────────────
  // ?status=aberta,aguardando_pagamento,fechada,cancelada — default: só as em andamento.
  fastify.get('/contas', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const q = request.query as { status?: string };
    const statusValidos: StatusConta[] = ['aberta', 'aguardando_pagamento', 'fechada', 'cancelada'];
    const status = q.status
      ? q.status.split(',').map((s) => s.trim()).filter((s): s is StatusConta => statusValidos.includes(s as StatusConta))
      : (['aberta', 'aguardando_pagamento'] as StatusConta[]);

    const contas = await prisma.conta.findMany({
      where:   { estabelecimentoId: estabelecimentoId!, status: { in: status } },
      orderBy: { abertaEm: 'desc' },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });
    return contas.map(serializarConta);
  });

  // ── GET /contas/:id ─────────────────────────────────────────────────────────
  fastify.get('/contas/:id', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({
      where:   { id, estabelecimentoId: estabelecimentoId! },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });
    return serializarConta(conta);
  });

  // ── POST /contas ────────────────────────────────────────────────────────────
  // Abre uma mesa: cria a Conta e já cria a Comanda "Geral" automaticamente.
  fastify.post('/contas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { body: AbrirContaSchema },
  }, async (request, reply) => {
    const { mesaId } = request.body as { mesaId: string };
    const { estabelecimentoId } = request.user;

    const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, estabelecimentoId: estabelecimentoId!, ativa: true } });
    if (!mesa) return reply.status(404).send({ erro: 'Mesa não encontrada' });

    const contaAberta = await prisma.conta.findFirst({
      where: { mesaId, status: { in: ['aberta', 'aguardando_pagamento'] } },
    });
    if (contaAberta) return reply.status(409).send({ erro: 'Esta mesa já está ocupada' });

    try {
      const conta = await prisma.conta.create({
        data: {
          mesaId,
          estabelecimentoId: estabelecimentoId!,
          comandas: { create: [{ nome: 'Geral' }] },
        },
        include: { mesa: true, comandas: { include: { itens: true } } },
      });

      getIO().to(estabelecimentoId!).emit('conta:atualizada', serializarConta(conta));
      return reply.status(201).send(serializarConta(conta));
    } catch (err) {
      // Safety net para a janela de corrida entre o findFirst acima e este create:
      // o índice único parcial `contas_mesa_aberta_unica` (ver migration) barra a
      // segunda Conta aberta simultânea na mesma mesa quando duas requisições
      // concorrentes passam ambas pelo findFirst antes de qualquer create commitar.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.status(409).send({ erro: 'Esta mesa já está ocupada' });
      }
      throw err;
    }
  });

  // ── PATCH /contas/:id/status ────────────────────────────────────────────────
  fastify.patch('/contas/:id/status', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: AtualizarStatusContaSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status } = request.body as { status: StatusConta };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });

    if (!transicoesContaPermitidas[conta.status].includes(status)) {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    const atualizada = await prisma.conta.update({
      where:   { id },
      data:    { status, fechadaEm: status === 'cancelada' ? new Date() : null },
      include: { mesa: true, comandas: { include: { itens: true } } },
    });

    getIO().to(estabelecimentoId!).emit('conta:atualizada', serializarConta(atualizada));
    return serializarConta(atualizada);
  });

  // ── POST /contas/:id/comandas ───────────────────────────────────────────────
  // Cria uma nova comanda dentro de uma conta aberta (ex: separar "Luiz" do "Geral").
  fastify.post('/contas/:id/comandas', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: CriarComandaSchema },
  }, async (request, reply) => {
    const { id }   = request.params as { id: string };
    const { nome } = request.body as { nome: string };
    const { estabelecimentoId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId!, status: 'aberta' } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada ou não está aberta' });

    const comanda = await prisma.comanda.create({ data: { contaId: id, nome }, include: { itens: true } });
    getIO().to(estabelecimentoId!).emit('comanda:criada', comanda);
    return reply.status(201).send(comanda);
  });

  // ── PATCH /comandas/:id ─────────────────────────────────────────────────────
  fastify.patch('/comandas/:id', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: AtualizarComandaSchema },
  }, async (request, reply) => {
    const { id }   = request.params as { id: string };
    const { nome } = request.body as { nome: string };
    const { estabelecimentoId } = request.user;

    const comanda = await prisma.comanda.findFirst({
      where: { id, conta: { estabelecimentoId: estabelecimentoId! } },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    const atualizada = await prisma.comanda.update({ where: { id }, data: { nome }, include: { itens: true } });
    const serializada = { ...atualizada, itens: atualizada.itens.map(serializarItemComanda) };
    getIO().to(estabelecimentoId!).emit('comanda:atualizada', serializada);
    return serializada;
  });

  // ── POST /comandas/:id/itens ────────────────────────────────────────────────
  fastify.post('/comandas/:id/itens', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ComandaParamsSchema, body: AdicionarItemComandaSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itemCardapioId, quantidade, observacao } = request.body as {
      itemCardapioId: string; quantidade: number; observacao?: string;
    };
    const { estabelecimentoId, userId } = request.user;

    const comanda = await prisma.comanda.findFirst({
      where: { id, conta: { estabelecimentoId: estabelecimentoId! } },
    });
    if (!comanda) return reply.status(404).send({ erro: 'Comanda não encontrada' });

    const itemCardapio = await prisma.itemCardapio.findFirst({
      where: { id: itemCardapioId, estabelecimentoId: estabelecimentoId!, disponivel: true },
    });
    if (!itemCardapio) return reply.status(400).send({ erro: 'Item não disponível ou não pertence a este estabelecimento' });

    const itemComanda = await prisma.itemComanda.create({
      data: {
        comandaId:          id,
        itemCardapioId:     itemCardapio.id,
        nomeItem:           itemCardapio.nome,
        quantidade,
        precoUnit:          itemCardapio.preco,
        observacao:         observacao ?? null,
        setorId:            itemCardapio.setorId,
        criadoPorUsuarioId: userId,
      },
    });

    const serializado = serializarItemComanda(itemComanda);
    getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializado);

    if (itemComanda.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: itemComanda.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-novo', serializarItemProducao(itemParaProducao));
      }
    }

    return reply.status(201).send(serializado);
  });

  // ── PATCH /itens-comanda/:id/status ─────────────────────────────────────────
  fastify.patch('/itens-comanda/:id/status', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ItemComandaParamsSchema, body: AtualizarStatusItemComandaSchema },
  }, async (request, reply) => {
    const { id }     = request.params as { id: string };
    const { status, motivo, senha } = request.body as { status: StatusProducao; motivo?: string; senha?: string };
    const { estabelecimentoId, userId } = request.user;

    const item = await prisma.itemComanda.findFirst({
      where: { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    if (!transicaoProducaoValida(item.status, status)) {
      return reply.status(422).send({ erro: 'Transição de status não permitida' });
    }

    if (status === 'cancelado') {
      const pagamentoConfirmado = await prisma.pagamentoItem.findFirst({
        where: { itemComandaId: id, pagamento: { status: 'confirmado' } },
      });
      if (pagamentoConfirmado) {
        return reply.status(422).send({ erro: 'Item já foi pago — estorne o pagamento antes de cancelar' });
      }

      if (!podeCancelarLivremente(item.status)) {
        if (!motivo) return reply.status(400).send({ erro: 'Motivo é obrigatório para cancelar item pronto/entregue' });
        if (!senha) return reply.status(400).send({ erro: 'Senha de supervisor é obrigatória para cancelar item pronto/entregue' });

        const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
        if (!estabelecimento?.senhaReabrirPedido) {
          return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de cancelar itens prontos/entregues' });
        }
        const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
        if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });
      }
    }

    const timestamps: { prontoEm?: Date; entregueEm?: Date; canceladoEm?: Date } = {};
    if (status === 'pronto')    timestamps.prontoEm    = new Date();
    if (status === 'entregue')  timestamps.entregueEm  = new Date();
    if (status === 'cancelado') timestamps.canceladoEm = new Date();

    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { status, ...timestamps } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    if (status === 'cancelado') {
      await prisma.logAuditoria.create({
        data: {
          acao:         'item:cancelado',
          entidadeTipo: 'ItemComanda',
          entidadeId:   id,
          motivo:       motivo ?? null,
          dadosAntes:   { status: item.status },
          dadosDepois:  { status: 'cancelado' },
          estabelecimentoId: estabelecimentoId!,
          usuarioId:    userId,
        },
      });
    }

    if (atualizado.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: atualizado.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
      }
    }

    return serializado;
  });

  // ── PATCH /itens-comanda/:id/transferir ─────────────────────────────────────
  // Move o item pra outra comanda da MESMA conta (mesma mesa) — nunca entre mesas diferentes.
  fastify.patch('/itens-comanda/:id/transferir', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
    schema: { params: ItemComandaParamsSchema, body: TransferirItemComandaSchema },
  }, async (request, reply) => {
    const { id }        = request.params as { id: string };
    const { comandaId } = request.body as { comandaId: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemComanda.findFirst({
      where:   { id, comanda: { conta: { estabelecimentoId: estabelecimentoId! } } },
      include: { comanda: true },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    const comandaDestino = await prisma.comanda.findFirst({
      where: { id: comandaId, contaId: item.comanda.contaId },
    });
    if (!comandaDestino) {
      return reply.status(400).send({ erro: 'Comanda de destino não encontrada ou não pertence à mesma conta' });
    }

    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { comandaId } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    await prisma.logAuditoria.create({
      data: {
        acao:         'item:transferido',
        entidadeTipo: 'ItemComanda',
        entidadeId:   id,
        dadosAntes:   { comandaId: item.comanda.id },
        dadosDepois:  { comandaId },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    request.user.userId,
      },
    });

    if (atualizado.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: atualizado.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
      }
    }

    return serializado;
  });
}
