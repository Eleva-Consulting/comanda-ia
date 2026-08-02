// Decide pra quais impressoras mandar os itens de uma rodada/envio, e como agrupá-los.
//
// Regra combinada com o usuário (2026-08-01): item sem Setor vinculado NÃO imprime
// automaticamente (só fica visível no Kanban da Cozinha, que continua funcionando igual) —
// evita "esquecimento silencioso" de pra onde mandar. Setor sem impressora configurada
// também não gera grupo nenhum (nada pra onde mandar).

export interface ItemComSetor {
  setorId:        string | null;
  quantidade:     number;
  nomeItem:       string;
  observacao:     string | null;
  acompanhamento: string | null;
}

export interface ComandaComItens {
  nome:  string;
  itens: ItemComSetor[];
}

export interface SetorComImpressora {
  id:           string;
  impressoraIp: string | null;
}

export interface GrupoParaImprimir {
  setorId:      string;
  impressoraIp: string;
  comandas:     ComandaComItens[]; // só as comandas (e só os itens delas) que têm algo desse setor
}

export function agruparPorSetorEImpressora(
  comandas: ComandaComItens[],
  setores:  SetorComImpressora[],
): GrupoParaImprimir[] {
  const impressoraPorSetor = new Map(
    setores
      .filter((s): s is SetorComImpressora & { impressoraIp: string } => Boolean(s.impressoraIp))
      .map((s) => [s.id, s.impressoraIp]),
  );

  const comandasPorSetor = new Map<string, ComandaComItens[]>();

  for (const comanda of comandas) {
    const itensPorSetor = new Map<string, ItemComSetor[]>();
    for (const item of comanda.itens) {
      if (!item.setorId || !impressoraPorSetor.has(item.setorId)) continue;
      const lista = itensPorSetor.get(item.setorId) ?? [];
      lista.push(item);
      itensPorSetor.set(item.setorId, lista);
    }
    for (const [setorId, itens] of itensPorSetor) {
      const lista = comandasPorSetor.get(setorId) ?? [];
      lista.push({ nome: comanda.nome, itens });
      comandasPorSetor.set(setorId, lista);
    }
  }

  return [...comandasPorSetor.entries()].map(([setorId, comandas]) => ({
    setorId,
    impressoraIp: impressoraPorSetor.get(setorId)!,
    comandas,
  }));
}
