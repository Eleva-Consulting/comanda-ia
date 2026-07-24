import { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { filtroSetorProducao, serializarItemProducao } from '../utils/producao.js';
import type { StatusProducao } from '../generated/prisma/enums.js';

export async function producaoRoutes(fastify: FastifyInstance) {
  // ── GET /producao/itens ──────────────────────────────────────────────────
  // Itens de ItemComanda ainda em produção (recebido/em_preparo/pronto), filtrados
  // pelo setor fixo do usuário logado — ou todos os setores, se ele não tiver um.
  fastify.get('/producao/itens', {
    onRequest: [autenticar, temPermissao('cozinha', 'producao'), moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId, setorId } = request.user;

    const itens = await prisma.itemComanda.findMany({
      where: {
        status: { in: ['recebido', 'em_preparo', 'pronto'] as StatusProducao[] },
        comanda: { conta: { estabelecimentoId: estabelecimentoId! } },
        ...filtroSetorProducao(setorId),
      },
      include: {
        setor: true,
        comanda: { include: { conta: { include: { mesa: true, abertaPor: { select: { nome: true } } } } } },
      },
      orderBy: { recebidoEm: 'asc' },
    });

    return itens.map(serializarItemProducao);
  });
}
