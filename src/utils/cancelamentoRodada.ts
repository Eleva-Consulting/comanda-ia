import type { StatusProducao } from '../generated/prisma/enums.js';

interface ItemParaCancelar {
  id: string;
  nomeItem: string;
  status: StatusProducao;
}

interface SeparacaoItensRodada {
  itensAtivos: ItemParaCancelar[];
  itensCancelaveis: ItemParaCancelar[];
  itensNaoCancelados: { id: string; nomeItem: string; motivo: string }[];
}

// Separa os itens ainda ativos (nem entregues nem já cancelados) de uma rodada entre os
// que podem ser cancelados em lote e os que precisam ficar de fora por já terem
// pagamento confirmado vinculado (via PagamentoItem) — precisa estornar antes.
export function separarItensCancelaveisDaRodada(
  itens: ItemParaCancelar[],
  itensJaPagosIds: Set<string>,
): SeparacaoItensRodada {
  const itensAtivos = itens.filter((item) => item.status !== 'entregue' && item.status !== 'cancelado');
  const itensCancelaveis = itensAtivos.filter((item) => !itensJaPagosIds.has(item.id));
  const itensNaoCancelados = itensAtivos
    .filter((item) => itensJaPagosIds.has(item.id))
    .map((item) => ({ id: item.id, nomeItem: item.nomeItem, motivo: 'Item já foi pago — estorne o pagamento antes de cancelar' }));
  return { itensAtivos, itensCancelaveis, itensNaoCancelados };
}

// Decide se a conta (mesa) deve ser liberada automaticamente depois de cancelar uma
// rodada: só quando não sobra nenhum item ativo em NENHUMA comanda/rodada da conta e o
// saldo devedor está zerado. 'fechada' quando algo já foi entregue ou pago antes
// (consumo de verdade); 'cancelada' quando nada da mesa chegou a ser consumido.
export function decidirLiberacaoConta(params: {
  itensPendentes: number;
  podeFechar: boolean;
  itensEntreguesNaConta: number;
  totalPago: number;
}): 'fechada' | 'cancelada' | null {
  if (params.itensPendentes > 0) return null;
  if (!params.podeFechar) return null;
  return params.itensEntreguesNaConta > 0 || params.totalPago > 0 ? 'fechada' : 'cancelada';
}
