import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { getIO } from '../socket.js';
import { serializarConta } from './contas.js';
import { calcularResumoConta, validarItensParaPagamento } from '../utils/fechamentoConta.js';
import type { ContaParaResumo } from '../utils/fechamentoConta.js';
import type { FormaPagamento } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';

const ContaParamsSchema = Type.Object({ id: Type.String() });
const PagamentoParamsSchema = Type.Object({ id: Type.String() });

const RegistrarPagamentoSchema = Type.Object({
  formaPagamento: Type.Union([
    Type.Literal('pix'),
    Type.Literal('dinheiro'),
    Type.Literal('cartao_credito'),
    Type.Literal('cartao_debito'),
  ]),
  itensComandaIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  valor: Type.Optional(Type.Number({ minimum: 0.01 })),
});

const AplicarDescontoSchema = Type.Object({
  valor:  Type.Number({ minimum: 0.01 }),
  motivo: Type.String({ minLength: 1, maxLength: 200 }),
  senha:  Type.String({ minLength: 1 }),
});

const EstornarPagamentoSchema = Type.Object({
  motivo: Type.String({ minLength: 1, maxLength: 200 }),
  senha:  Type.String({ minLength: 1 }),
});

const CONTA_INCLUDE_RESUMO = {
  comandas: { include: { itens: true } },
  pagamentos: { include: { itens: true }, orderBy: { criadoEm: 'asc' as const } },
};

type ContaComResumoPrisma = Prisma.ContaGetPayload<{ include: typeof CONTA_INCLUDE_RESUMO }>;

// `calcularResumoConta` (Task 2, src/utils/fechamentoConta.ts) foi desenhada para ser
// independente do ORM: seus campos monetários aceitam `number | string`, nunca o tipo
// `Decimal` que o Prisma retorna. Este adaptador converte a Conta (com comandas/itens e
// pagamentos/itens) para o formato puro esperado, sem mutar o resultado original do Prisma.
function paraContaParaResumo(conta: ContaComResumoPrisma): ContaParaResumo {
  return {
    descontoValor: conta.descontoValor === null ? null : Number(conta.descontoValor),
    comandas: conta.comandas.map((comanda) => ({
      id: comanda.id,
      nome: comanda.nome,
      itens: comanda.itens.map((item) => ({
        id: item.id,
        nomeItem: item.nomeItem,
        precoUnit: Number(item.precoUnit),
        quantidade: item.quantidade,
        status: item.status,
      })),
    })),
    pagamentos: conta.pagamentos.map((pagamento) => ({
      id: pagamento.id,
      valor: Number(pagamento.valor),
      status: pagamento.status,
      formaPagamento: pagamento.formaPagamento,
      criadoEm: pagamento.criadoEm,
      itens: pagamento.itens.map((item) => ({ itemComandaId: item.itemComandaId })),
    })),
  };
}

async function buscarContaComResumo(estabelecimentoId: string, contaId: string) {
  const conta = await prisma.conta.findFirst({
    where: { id: contaId, estabelecimentoId },
    include: CONTA_INCLUDE_RESUMO,
  });
  if (!conta) return null;
  return { conta, resumo: calcularResumoConta(paraContaParaResumo(conta)) };
}

async function emitirContaAtualizada(estabelecimentoId: string, contaId: string) {
  const contaCompleta = await prisma.conta.findUnique({
    where: { id: contaId },
    include: { mesa: true, comandas: { include: { itens: true } } },
  });
  if (contaCompleta) {
    getIO().to(estabelecimentoId).emit('conta:atualizada', serializarConta(contaCompleta));
  }
}

export async function pagamentosRoutes(fastify: FastifyInstance) {
  // ── GET /contas/:id/resumo ───────────────────────────────────────────────────
  fastify.get('/contas/:id/resumo', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });

    return { contaId: encontrada.conta.id, status: encontrada.conta.status, ...encontrada.resumo };
  });

  // ── POST /contas/:id/pagamentos ──────────────────────────────────────────────
  // Dois modos: itensComandaIds (cobre itens específicos, valor calculado no servidor)
  // ou valor livre (divisão igual ÷ N, ou qualquer valor parcial sem vincular a itens).
  fastify.post('/contas/:id/pagamentos', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: RegistrarPagamentoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { formaPagamento, itensComandaIds, valor } = request.body as {
      formaPagamento: FormaPagamento;
      itensComandaIds?: string[];
      valor?: number;
    };
    const { estabelecimentoId, userId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });
    const { conta, resumo } = encontrada;

    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta para pagamento' });
    }

    let valorFinal: number;
    let itensParaVincular: string[] = [];

    if (itensComandaIds && itensComandaIds.length > 0) {
      const validacao = validarItensParaPagamento(resumo, itensComandaIds);
      if (validacao.erro) return reply.status(422).send({ erro: validacao.erro });
      valorFinal = validacao.valor;
      itensParaVincular = itensComandaIds;
    } else if (typeof valor === 'number' && valor > 0) {
      valorFinal = valor;
    } else {
      return reply.status(400).send({ erro: 'Informe itensComandaIds ou valor' });
    }

    const todosItens = resumo.porComanda.flatMap((c) => c.itens);
    await prisma.pagamento.create({
      data: {
        valor: valorFinal,
        formaPagamento,
        status: 'confirmado',
        estabelecimentoId: estabelecimentoId!,
        contaId: id,
        usuarioId: userId ?? null,
        itens: {
          create: itensParaVincular.map((itemComandaId) => ({
            itemComandaId,
            valorCoberto: todosItens.find((i) => i.id === itemComandaId)!.total,
            estabelecimentoId: estabelecimentoId!,
          })),
        },
      },
    });

    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return reply.status(201).send({ contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo });
  });

  // ── POST /contas/:id/desconto ────────────────────────────────────────────────
  // Substitui qualquer desconto anterior nesta conta (não é cumulativo). Exige a
  // senha de supervisor (mesma senha de reabertura de pedido, reusada por design).
  fastify.post('/contas/:id/desconto', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, body: AplicarDescontoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { valor, motivo, senha } = request.body as { valor: number; motivo: string; senha: string };
    const { estabelecimentoId, userId } = request.user;

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });
    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.senhaReabrirPedido) {
      return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de aplicar descontos' });
    }
    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
    if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });

    await prisma.conta.update({ where: { id }, data: { descontoValor: valor, descontoMotivo: motivo } });
    await prisma.logAuditoria.create({
      data: {
        acao:         'conta:desconto',
        entidadeTipo: 'Conta',
        entidadeId:   id,
        motivo,
        dadosDepois:  { valor },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    userId,
      },
    });

    await emitirContaAtualizada(estabelecimentoId!, id);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, id);
    return { contaId: id, status: atualizada!.conta.status, ...atualizada!.resumo };
  });

  // ── PATCH /pagamentos/:id/estornar ───────────────────────────────────────────
  // Nunca apaga o pagamento original — só marca status=estornado (mantém histórico).
  // Se a conta já estava fechada e o estorno reabre saldo devedor, reabre a conta.
  fastify.patch('/pagamentos/:id/estornar', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: PagamentoParamsSchema, body: EstornarPagamentoSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { motivo, senha } = request.body as { motivo: string; senha: string };
    const { estabelecimentoId, userId } = request.user;

    const pagamento = await prisma.pagamento.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!pagamento) return reply.status(404).send({ erro: 'Pagamento não encontrado' });
    if (pagamento.status !== 'confirmado') {
      return reply.status(422).send({ erro: 'Só é possível estornar pagamentos confirmados' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.senhaReabrirPedido) {
      return reply.status(400).send({ erro: 'Configure a senha de supervisor em Configurações antes de estornar pagamentos' });
    }
    const senhaCorreta = await bcrypt.compare(senha, estabelecimento.senhaReabrirPedido);
    if (!senhaCorreta) return reply.status(403).send({ erro: 'Senha incorreta' });

    await prisma.pagamento.update({ where: { id }, data: { status: 'estornado' } });
    await prisma.logAuditoria.create({
      data: {
        acao:         'pagamento:estorno',
        entidadeTipo: 'Pagamento',
        entidadeId:   id,
        motivo,
        dadosAntes:   { valor: Number(pagamento.valor), status: pagamento.status },
        estabelecimentoId: estabelecimentoId!,
        usuarioId:    userId,
      },
    });

    const contaId = pagamento.contaId;
    const posEstorno = await buscarContaComResumo(estabelecimentoId!, contaId);
    if (posEstorno && posEstorno.conta.status === 'fechada' && !posEstorno.resumo.podeFechar) {
      try {
        await prisma.conta.update({ where: { id: contaId }, data: { status: 'aguardando_pagamento', fechadaEm: null } });
      } catch (err) {
        // Safety net para a janela de corrida em que a mesa desta conta já foi
        // reaberta com uma NOVA Conta antes deste estorno terminar: o índice único
        // parcial `contas_mesa_aberta_unica` barra esta reabertura. Nesse caso a
        // conta simplesmente permanece fechada (a mesa já pertence a outra conta
        // agora, então reabri-la seria incorreto de qualquer forma).
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
          throw err;
        }
      }
    }

    await emitirContaAtualizada(estabelecimentoId!, contaId);
    const atualizada = await buscarContaComResumo(estabelecimentoId!, contaId);
    return { contaId, status: atualizada!.conta.status, ...atualizada!.resumo };
  });

  // ── POST /contas/:id/fechar ───────────────────────────────────────────────────
  // Só fecha quando o saldo devedor chega a zero (ou fica negativo por troco).
  // A mesa volta a aparecer como "livre" automaticamente — GET /mesas já filtra
  // por status aberta/aguardando_pagamento, então fechada cai fora dessa contagem.
  fastify.post('/contas/:id/fechar', {
    onRequest: [autenticar, temPermissao('caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const encontrada = await buscarContaComResumo(estabelecimentoId!, id);
    if (!encontrada) return reply.status(404).send({ erro: 'Conta não encontrada' });
    const { conta, resumo } = encontrada;

    if (conta.status !== 'aberta' && conta.status !== 'aguardando_pagamento') {
      return reply.status(422).send({ erro: 'Conta não está aberta' });
    }
    if (!resumo.podeFechar) {
      return reply.status(422).send({ erro: 'Saldo devedor pendente', saldoDevedor: resumo.saldoDevedor });
    }

    await prisma.conta.update({ where: { id }, data: { status: 'fechada', fechadaEm: new Date() } });
    await emitirContaAtualizada(estabelecimentoId!, id);

    return { contaId: id, status: 'fechada', ...resumo };
  });
}
