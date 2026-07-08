import type { StatusProducao } from '../generated/prisma/enums.js';

// Cancelamento é sempre estruturalmente válido a partir de qualquer status ativo — a restrição de
// "precisa de senha de supervisor pra cancelar item pronto/entregue" é uma regra operacional
// (podeCancelarLivremente), não uma regra da máquina de estado em si.
export const transicoesProducaoPermitidas: Record<StatusProducao, StatusProducao[]> = {
  recebido:   ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto:     ['entregue', 'cancelado'],
  entregue:   ['cancelado'],
  cancelado:  [],
};

export function transicaoProducaoValida(de: StatusProducao, para: StatusProducao): boolean {
  return transicoesProducaoPermitidas[de].includes(para);
}

// Cancelamento de item pronto/entregue exige senha de supervisor — feature já construída
// (ver PATCH /itens-comanda/:id/status em src/routes/contas.ts, que usa senhaReabrirPedido
// do estabelecimento). Esta função é o gate que decide quando essa exigência se aplica.
export function podeCancelarLivremente(status: StatusProducao): boolean {
  return status === 'recebido' || status === 'em_preparo';
}
