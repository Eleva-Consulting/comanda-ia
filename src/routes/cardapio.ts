import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, temPermissao } from '../plugins/auth.js';
import { r2Configurado, uploadParaR2, deletarDeR2 } from '../r2.js';

const ItemParamsSchema = Type.Object({ id: Type.String() });

const OpcaoAcompanhamentoSchema = Type.Object({
  nome:           Type.String({ minLength: 1, maxLength: 60 }),
  precoAdicional: Type.Number({ minimum: 0 }),
});

const CriarCategoriaSchema = Type.Object({
  nome:                 Type.String({ minLength: 1, maxLength: 100 }),
  ordem:                Type.Optional(Type.Integer({ minimum: 0 })),
  opcoesAcompanhamento: Type.Optional(Type.Array(OpcaoAcompanhamentoSchema)),
});

const AtualizarCategoriaSchema = Type.Object({
  nome:                 Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  ordem:                Type.Optional(Type.Integer({ minimum: 0 })),
  opcoesAcompanhamento: Type.Optional(Type.Array(OpcaoAcompanhamentoSchema)),
});

const CriarItemSchema = Type.Object({
  nome:        Type.String({ minLength: 2, maxLength: 100 }),
  descricao:   Type.Optional(Type.String({ maxLength: 500 })),
  preco:       Type.Number({ minimum: 0 }),
  disponivel:  Type.Optional(Type.Boolean()),
  categoriaId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  estoque:     Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
});

const AtualizarItemSchema = Type.Object({
  nome:        Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  descricao:   Type.Optional(Type.String({ maxLength: 500 })),
  preco:       Type.Optional(Type.Number({ minimum: 0 })),
  disponivel:  Type.Optional(Type.Boolean()),
  categoriaId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  estoque:     Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
});

const categoriaSelect = { select: { id: true, nome: true, ordem: true, opcoesAcompanhamento: true } } as const;

type OpcaoAcompanhamento = { nome: string; precoAdicional: number };

// preco é Decimal no Postgres — sem essa conversão, o Fastify serializa como
// string ("20") em vez de número, quebrando qualquer conta feita no frontend
// (ex: "20" + 3 vira concatenação "203", não soma 23).
function serializarItem<T extends { preco: unknown }>(item: T) {
  return { ...item, preco: Number(item.preco) };
}

export async function cardapioRoutes(fastify: FastifyInstance) {
  // ── GET /cardapio/categorias ──────────────────────────────────────────────
  fastify.get('/cardapio/categorias', {
    onRequest: [autenticar],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    return prisma.categoria.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { ordem: 'asc' },
    });
  });

  // ── POST /cardapio/categorias ─────────────────────────────────────────────
  fastify.post('/cardapio/categorias', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { body: CriarCategoriaSchema },
  }, async (request, reply) => {
    const { nome, ordem, opcoesAcompanhamento } = request.body as { nome: string; ordem?: number; opcoesAcompanhamento?: OpcaoAcompanhamento[] };
    const { estabelecimentoId } = request.user;

    const categoria = await prisma.categoria.create({
      data: { nome, ordem: ordem ?? 0, opcoesAcompanhamento: opcoesAcompanhamento ?? [], estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(categoria);
  });

  // ── PATCH /cardapio/categorias/:id ────────────────────────────────────────
  fastify.patch('/cardapio/categorias/:id', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { params: ItemParamsSchema, body: AtualizarCategoriaSchema },
  }, async (request, reply) => {
    const { id }    = request.params as { id: string };
    const dados     = request.body as { nome?: string; ordem?: number; opcoesAcompanhamento?: OpcaoAcompanhamento[] };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.categoria.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Categoria não encontrada' });
    }
    return prisma.categoria.findUnique({ where: { id } });
  });

  // ── DELETE /cardapio/categorias/:id ───────────────────────────────────────
  fastify.delete('/cardapio/categorias/:id', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id }    = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const categoria = await prisma.categoria.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (!categoria) {
      return reply.status(404).send({ erro: 'Categoria não encontrada' });
    }

    // Desvincula os itens antes de deletar a categoria
    await prisma.itemCardapio.updateMany({
      where: { categoriaId: id },
      data:  { categoriaId: null },
    });

    await prisma.categoria.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ── GET /cardapio ─────────────────────────────────────────────────────────
  fastify.get('/cardapio', {
    onRequest: [autenticar],
  }, async (request) => {
    const { estabelecimentoId } = request.user;
    const itens = await prisma.itemCardapio.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
      include: { categoria: categoriaSelect },
    });
    return itens.map(serializarItem);
  });

  // ── GET /cardapio/:id ─────────────────────────────────────────────────────
  fastify.get('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where:   { id, estabelecimentoId: estabelecimentoId! },
      include: { categoria: categoriaSelect },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });
    return serializarItem(item);
  });

  // ── POST /cardapio ────────────────────────────────────────────────────────
  fastify.post('/cardapio', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { body: CriarItemSchema },
  }, async (request, reply) => {
    const dados = request.body as {
      nome: string; descricao?: string; preco: number; disponivel?: boolean; categoriaId?: string | null;
    };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.create({
      data:    { ...dados, estabelecimentoId: estabelecimentoId! },
      include: { categoria: categoriaSelect },
    });
    return reply.status(201).send(serializarItem(item));
  });

  // ── PATCH /cardapio/:id ───────────────────────────────────────────────────
  fastify.patch('/cardapio/:id', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { params: ItemParamsSchema, body: AtualizarItemSchema },
  }, async (request, reply) => {
    const { id }  = request.params as { id: string };
    const dados   = request.body as {
      nome?: string; descricao?: string; preco?: number; disponivel?: boolean; categoriaId?: string | null;
    };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.itemCardapio.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data:  dados,
    });
    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
    const atualizado = await prisma.itemCardapio.findUnique({ where: { id }, include: { categoria: categoriaSelect } });
    return serializarItem(atualizado!);
  });

  // ── DELETE /cardapio/:id ──────────────────────────────────────────────────
  fastify.delete('/cardapio/:id', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    if (item.foto) await deletarDeR2(item.foto).catch(() => {});
    await prisma.itemCardapio.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ── POST /cardapio/:id/foto ───────────────────────────────────────────────
  fastify.post('/cardapio/:id/foto', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    if (!r2Configurado()) {
      return reply.status(503).send({ erro: 'Armazenamento de fotos não configurado.' });
    }

    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });

    const data = await request.file();
    if (!data) return reply.status(400).send({ erro: 'Nenhum arquivo enviado' });

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(data.mimetype)) {
      return reply.status(400).send({ erro: 'Apenas imagens JPEG, PNG e WEBP são aceitas' });
    }

    const chunks: Buffer[] = [];
    let limitExcedido = false;
    data.file.on('limit', () => { limitExcedido = true; });
    for await (const chunk of data.file) chunks.push(chunk);
    if (limitExcedido) return reply.status(400).send({ erro: 'Imagem deve ter no máximo 5 MB' });

    const buffer = Buffer.concat(chunks);
    const ext    = data.mimetype === 'image/jpeg' ? 'jpg' : data.mimetype.split('/')[1];
    const chave  = `cardapio/${estabelecimentoId}/${id}-${Date.now()}.${ext}`;

    if (item.foto) await deletarDeR2(item.foto).catch(() => {});

    const fotoUrl = await uploadParaR2(chave, buffer, data.mimetype);
    const atualizado = await prisma.itemCardapio.update({
      where:   { id },
      data:    { foto: fotoUrl },
      include: { categoria: categoriaSelect },
    });
    return serializarItem(atualizado);
  });

  // ── DELETE /cardapio/:id/foto ─────────────────────────────────────────────
  fastify.delete('/cardapio/:id/foto', {
    onRequest: [autenticar, temPermissao('cardapio')],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (!item) return reply.status(404).send({ erro: 'Item não encontrado' });
    if (!item.foto) return reply.status(404).send({ erro: 'Item não possui foto' });

    await deletarDeR2(item.foto).catch(() => {});
    const atualizado = await prisma.itemCardapio.update({
      where:   { id },
      data:    { foto: null },
      include: { categoria: categoriaSelect },
    });
    return serializarItem(atualizado);
  });
}
