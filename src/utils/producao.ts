import type { StatusProducao } from '../generated/prisma/enums.js';

export function filtroSetorProducao(setorId: string | null): { setorId?: string } {
  return setorId ? { setorId } : {};
}

interface ItemComandaParaProducao {
  id: string;
  nomeItem: string;
  quantidade: number;
  observacao: string | null;
  acompanhamento: string | null;
  status: StatusProducao;
  recebidoEm: Date;
  setorId: string | null;
  rodadaId: string | null;
  setor: { nome: string; tempoAlvoMinutos: number | null } | null;
  comanda: { nome: string; conta: { mesa: { numero: string } | null; abertaPor: { nome: string } | null } };
}

export function serializarItemProducao(item: ItemComandaParaProducao) {
  return {
    id:               item.id,
    nomeItem:         item.nomeItem,
    quantidade:       item.quantidade,
    observacao:       item.observacao,
    acompanhamento:   item.acompanhamento,
    status:           item.status,
    recebidoEm:       item.recebidoEm,
    setorId:          item.setorId,
    rodadaId:         item.rodadaId,
    setorNome:        item.setor?.nome ?? null,
    tempoAlvoMinutos: item.setor?.tempoAlvoMinutos ?? null,
    mesaNumero:       item.comanda.conta.mesa?.numero ?? null,
    comandaNome:      item.comanda.nome,
    abertaPorNome:    item.comanda.conta.abertaPor?.nome ?? null,
  };
}

export function salaProducao(estabelecimentoId: string, setorId: string | null): string[] {
  return setorId ? [estabelecimentoId, `${estabelecimentoId}:${setorId}`] : [estabelecimentoId];
}
