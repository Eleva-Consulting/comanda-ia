import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';
import { r2Configurado, uploadParaR2, deletarDeR2 } from '../r2.js';

const CriarItemSchema = Type.Object({
  nome: Type.String({ minLength: 2, maxLength: 100 }),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  preco: Type.Number({ minimum: 0 }),
  disponivel: Type.Optional(Type.Boolean()),
});

const AtualizarItemSchema = Type.Object({
  nome: Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  preco: Type.Optional(Type.Number({ minimum: 0 })),
  disponivel: Type.Optional(Type.Boolean()),
});

const ItemParamsSchema = Type.Object({
  id: Type.String(),
});

export async function cardapioRoutes(fastify: FastifyInstance) {
  // LIST — itens do meu estabelecimento
  fastify.get('/cardapio', {
    onRequest: [autenticar],
  }, async (request, reply) => {
    const { estabelecimentoId } = request.user;

    const itens = await prisma.itemCardapio.findMany({
      where: { estabelecimentoId: estabelecimentoId! },
      orderBy: { nome: 'asc' },
    });
    return itens;
  });

  // READ — busca composta
  fastify.get('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });

    if (!item) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
    return item;
  });

  // CREATE — estabelecimentoId do token
  fastify.post('/cardapio', {
    onRequest: [autenticar],
    schema: { body: CriarItemSchema },
  }, async (request, reply) => {
    const dados = request.body as {
      nome: string;
      descricao?: string;
      preco: number;
      disponivel?: boolean;
    };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.create({
      data: {
        ...dados,
        estabelecimentoId: estabelecimentoId!,
      },
    });
    return reply.status(201).send(item);
  });

  // UPDATE — updateMany composto
  fastify.patch('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema, body: AtualizarItemSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dados = request.body as {
      nome?: string;
      descricao?: string;
      preco?: number;
      disponivel?: boolean;
    };
    const { estabelecimentoId } = request.user;

    const resultado = await prisma.itemCardapio.updateMany({
      where: { id, estabelecimentoId: estabelecimentoId! },
      data: dados,
    });

    if (resultado.count === 0) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }

    const itemAtualizado = await prisma.itemCardapio.findUnique({ where: { id } });
    return itemAtualizado;
  });

  // DELETE — deleteMany composto
  fastify.delete('/cardapio/:id', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });

    if (!item) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }

    // Remove foto do R2 antes de deletar o item
    if (item.foto) {
      await deletarDeR2(item.foto).catch(() => {});
    }

    await prisma.itemCardapio.delete({ where: { id } });

    return reply.status(204).send();
  });

  // ── POST /cardapio/:id/foto ─────────────────────────────────────────────────
  // Recebe multipart/form-data com campo "foto" (imagem).
  // Valida tipo e tamanho, envia ao R2, salva URL no banco.
  fastify.post('/cardapio/:id/foto', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    if (!r2Configurado()) {
      return reply.status(503).send({
        erro: 'Armazenamento de fotos não configurado. Defina as variáveis R2_* no .env.',
      });
    }

    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (!item) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ erro: 'Nenhum arquivo enviado' });
    }

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(data.mimetype)) {
      return reply.status(400).send({ erro: 'Apenas imagens JPEG, PNG e WEBP são aceitas' });
    }

    // Lê o stream com verificação do evento 'limit' (dispara quando > 5 MB)
    const chunks: Buffer[] = [];
    let limitExcedido = false;
    data.file.on('limit', () => { limitExcedido = true; });
    for await (const chunk of data.file) chunks.push(chunk);

    if (limitExcedido) {
      return reply.status(400).send({ erro: 'Imagem deve ter no máximo 5 MB' });
    }

    const buffer = Buffer.concat(chunks);
    const ext    = data.mimetype === 'image/jpeg' ? 'jpg' : data.mimetype.split('/')[1];
    const chave  = `cardapio/${estabelecimentoId}/${id}-${Date.now()}.${ext}`;

    // Remove foto anterior do R2 se existir
    if (item.foto) await deletarDeR2(item.foto).catch(() => {});

    const fotoUrl = await uploadParaR2(chave, buffer, data.mimetype);

    const atualizado = await prisma.itemCardapio.update({
      where: { id },
      data:  { foto: fotoUrl },
    });

    return atualizado;
  });

  // ── DELETE /cardapio/:id/foto ───────────────────────────────────────────────
  // Remove a foto do R2 e limpa o campo no banco.
  fastify.delete('/cardapio/:id/foto', {
    onRequest: [autenticar],
    schema: { params: ItemParamsSchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { estabelecimentoId } = request.user;

    const item = await prisma.itemCardapio.findFirst({
      where: { id, estabelecimentoId: estabelecimentoId! },
    });
    if (!item) {
      return reply.status(404).send({ erro: 'Item não encontrado' });
    }
    if (!item.foto) {
      return reply.status(404).send({ erro: 'Item não possui foto' });
    }

    await deletarDeR2(item.foto).catch(() => {});

    const atualizado = await prisma.itemCardapio.update({
      where: { id },
      data:  { foto: null },
    });

    return atualizado;
  });
}