import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar, apenasDono } from '../plugins/auth.js';
import { r2Configurado, uploadParaR2, deletarDeR2 } from '../r2.js';

const ItemParamsSchema = Type.Object({ id: Type.String() });

const CriarCategoriaSchema = Type.Object({
  nome:  Type.String({ minLength: 1, maxLength: 100 }),
  ordem: Type.Optional(Type.Integer({ minimum: 0 })),
});

const AtualizarCategoriaSchema = Type.Object({
  nome:  Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  ordem: Type.Optional(Type.Integer({ minimum: 0 })),
});

const CriarItemSchema = Type.Object({
  nome:        Type.String({ minLength: 2, maxLength: 100 }),
  descricao:   Type.Optional(Type.String({ maxLength: 500 })),
  preco:       Type.Number({ minimum: 0 }),
  disponivel:  Type.Optional(Type.Boolean()),
  categoriaId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const AtualizarItemSchema = Type.Object({
  nome:        Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  descricao:   Type.Optional(Type.String({ maxLength: 500 })),
  preco:       Type.Optional(Type.Number({ minimum: 0 })),
  disponivel:  Type.Optional(Type.Boolean()),
  categoriaId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const categoriaSelect = { select: { id: true, nome: true, ordem: true } } as const;

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
    onRequest: [autenticar, apenasDono],
    schema: { body: CriarCategoriaSchema },
  }, async (request, reply) => {
    const { nome, ordem } = request.body as { nome: string; ordem?: number };
    const { estabelecimentoId } = request.user;

    const categoria = await prisma.categoria.create({
      data: { nome, ordem: ordem ?? 0, estabelecimentoId: estabelecimentoId! },
    });
    return reply.status(201).send(categoria);
  });

  // ── PATCH /cardapio/categorias/:id ────────────────────────────────────────
  fastify.patch('/cardapio/categorias/:id', {
    onRequest: [autenticar, apenasDono],
    schema: { params: ItemParamsSchema, body: AtualizarCategoriaSchema },
  }, async (request, reply) => {
    const { id }    = request.params as { id: string };
    const dados     = request.body as { nome?: string; ordem?: number };
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
    onRequest: [autenticar, apenasDono],
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
    return prisma.itemCardapio.findMany({
      where:   { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
      include: { categoria: categoriaSelect },
    });
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
    return item;
  });

  // ── POST /cardapio ────────────────────────────────────────────────────────
  fastify.post('/cardapio', {
    onRequest: [autenticar, apenasDono],
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
    return reply.status(201).send(item);
  });

  // ── PATCH /cardapio/:id ───────────────────────────────────────────────────
  fastify.patch('/cardapio/:id', {
    onRequest: [autenticar, apenasDono],
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
    return prisma.itemCardapio.findUnique({ where: { id }, include: { categoria: categoriaSelect } });
  });

  // ── DELETE /cardapio/:id ──────────────────────────────────────────────────
  fastify.delete('/cardapio/:id', {
    onRequest: [autenticar, apenasDono],
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
    onRequest: [autenticar, apenasDono],
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
    return prisma.itemCardapio.update({
      where:   { id },
      data:    { foto: fotoUrl },
      include: { categoria: categoriaSelect },
    });
  });

  // ── DELETE /cardapio/:id/foto ─────────────────────────────────────────────
  fastify.delete('/cardapio/:id/foto', {
    onRequest: [autenticar, apenasDono],
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
    return prisma.itemCardapio.update({
      where:   { id },
      data:    { foto: null },
      include: { categoria: categoriaSelect },
    });
  });
}
