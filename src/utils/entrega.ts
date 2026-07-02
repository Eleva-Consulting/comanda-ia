import { prisma } from '../database.js';

interface ResolverTaxaParams {
  estabelecimentoId: string;
  tipoEntrega:       'entrega' | 'retirada';
  bairroId?:         string;
  taxaEntregaGeral:  unknown; // Decimal | null vindo do Prisma
}

interface ResolverTaxaResultado {
  erro?:      string;
  taxa:       number;
  bairroNome: string | null;
}

/**
 * Resolve a taxa de entrega de um pedido:
 * - retirada → sempre 0
 * - entrega, sem bairros cadastrados no estabelecimento → usa a taxa geral (compatibilidade)
 * - entrega, com bairros cadastrados → exige bairroId válido, taxa vem do bairro (null = grátis)
 */
export async function resolverTaxaEntrega(params: ResolverTaxaParams): Promise<ResolverTaxaResultado> {
  const { estabelecimentoId, tipoEntrega, bairroId, taxaEntregaGeral } = params;

  if (tipoEntrega !== 'entrega') {
    return { taxa: 0, bairroNome: null };
  }

  const bairros = await prisma.bairro.findMany({ where: { estabelecimentoId } });

  if (bairros.length === 0) {
    return { taxa: taxaEntregaGeral ? Number(taxaEntregaGeral) : 0, bairroNome: null };
  }

  if (!bairroId) {
    return { erro: 'Selecione o bairro de entrega', taxa: 0, bairroNome: null };
  }

  const bairro = bairros.find((b) => b.id === bairroId);
  if (!bairro) {
    return { erro: 'Bairro inválido', taxa: 0, bairroNome: null };
  }

  return { taxa: bairro.taxaEntrega ? Number(bairro.taxaEntrega) : 0, bairroNome: bairro.nome };
}
