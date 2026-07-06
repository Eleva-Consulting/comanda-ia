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

// Cancelamento de item pronto/entregue exige senha de supervisor — feature ainda não construída
// (fica pra quando a Fase 2 da spec adicionar isso). Por enquanto essa função é o gate que bloqueia
// cancelar item já pronto/entregue nesta rota.
export function podeCancelarLivremente(status: StatusProducao): boolean {
  return status === 'recebido' || status === 'em_preparo';
}
