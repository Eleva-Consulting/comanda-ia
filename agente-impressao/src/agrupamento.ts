// Decide pra quais impressoras mandar os itens de uma rodada/envio, e como agrupá-los.
//
// Regra combinada com o usuário (2026-08-01): item sem Setor vinculado NÃO imprime
// automaticamente (só fica visível no Kanban da Cozinha, que continua funcionando igual) —
// evita "esquecimento silencioso" de pra onde mandar. Setor sem impressora configurada
// também não gera grupo nenhum (nada pra onde mandar).
//
// Regra adicionada em 2026-08-02, achado real de uso: um setor pode ser marcado como
// "recebe ticket completo" (`recebeTicketCompleto`) — normalmente a Cozinha, que funciona
// como ponto central de conferência (o garçom busca o pedido ali, vê que tem um item de
// outro setor tipo Churrasqueira, e já sabe que precisa passar lá também). Esse setor
// recebe TODOS os itens da rodada/envio (não só os dele) — os que são de outro setor saem
// com o nome do setor de origem ao lado (`nomeSetorReferencia`), como referência, não como
// item pra ele preparar.

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
  id:                   string;
  nome:                 string;
  impressoraIp:         string | null;
  recebeTicketCompleto: boolean;
}

export interface ItemParaImprimir extends ItemComSetor {
  nomeSetorReferencia: string | null;
}

export interface ComandaParaImprimir {
  nome:  string;
  itens: ItemParaImprimir[];
}

export interface GrupoParaImprimir {
  setorId:      string;
  impressoraIp: string;
  comandas:     ComandaParaImprimir[]; // só as comandas (e só os itens delas) relevantes pra esse setor
}

export function agruparPorSetorEImpressora(
  comandas: ComandaComItens[],
  setores:  SetorComImpressora[],
): GrupoParaImprimir[] {
  const nomePorSetorId = new Map(setores.map((s) => [s.id, s.nome]));
  const setoresComImpressora = setores.filter(
    (s): s is SetorComImpressora & { impressoraIp: string } => Boolean(s.impressoraIp),
  );

  const grupos: GrupoParaImprimir[] = [];

  for (const setor of setoresComImpressora) {
    const comandasFiltradas: ComandaParaImprimir[] = [];

    for (const comanda of comandas) {
      const itensRelevantes = setor.recebeTicketCompleto
        ? comanda.itens
        : comanda.itens.filter((item) => item.setorId === setor.id);
      if (itensRelevantes.length === 0) continue;

      const itens: ItemParaImprimir[] = itensRelevantes.map((item) => ({
        ...item,
        nomeSetorReferencia:
          item.setorId && item.setorId !== setor.id ? (nomePorSetorId.get(item.setorId) ?? null) : null,
      }));
      comandasFiltradas.push({ nome: comanda.nome, itens });
    }

    if (comandasFiltradas.length > 0) {
      grupos.push({ setorId: setor.id, impressoraIp: setor.impressoraIp, comandas: comandasFiltradas });
    }
  }

  return grupos;
}
