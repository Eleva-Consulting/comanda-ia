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

// Cancelamento de item que a cozinha já começou (em_preparo/pronto/entregue) exige senha
// de supervisor (ver PATCH /itens-comanda/:id/status em src/routes/contas.ts, que usa
// senhaReabrirPedido do estabelecimento). Só item ainda "recebido" cancela livre —
// decisão do usuário em 2026-07-17 (antes, em_preparo também era livre).
export function podeCancelarLivremente(status: StatusProducao): boolean {
  return status === 'recebido';
}

// Avanço "positivo" (nunca pra cancelado) usado pelo avanço em lote de uma rodada inteira
// (PATCH /rodadas/:id/avancar) — cada item avança pro seu próprio próximo estágio ativo.
const proximoStatusAtivoMap: Partial<Record<StatusProducao, StatusProducao>> = {
  recebido:   'em_preparo',
  em_preparo: 'pronto',
  pronto:     'entregue',
};

export function proximoStatusAtivo(status: StatusProducao): StatusProducao | null {
  return proximoStatusAtivoMap[status] ?? null;
}
