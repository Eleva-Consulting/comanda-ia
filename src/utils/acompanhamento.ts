export type OpcaoAcompanhamento = { nome: string; precoAdicional: number };

export function paraOpcoesAcompanhamento(json: unknown): OpcaoAcompanhamento[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (o): o is OpcaoAcompanhamento => typeof o === 'object' && o !== null && typeof (o as OpcaoAcompanhamento).nome === 'string'
  );
}

/**
 * Valida a escolha de acompanhamento de um item contra as opções configuradas
 * na categoria dele e retorna o preço adicional a somar no precoUnit.
 * Categoria sem opções cadastradas = item não pede acompanhamento (precoAdicional 0).
 */
export function resolverAcompanhamento(
  opcoesJson: unknown,
  acompanhamentoEscolhido: string | undefined,
  nomeItem: string
): { erro: string; precoAdicional?: never } | { erro?: never; precoAdicional: number } {
  const opcoes = paraOpcoesAcompanhamento(opcoesJson);
  if (opcoes.length === 0) return { precoAdicional: 0 };

  if (!acompanhamentoEscolhido) {
    return { erro: `Escolha o acompanhamento de "${nomeItem}"` };
  }
  const opcao = opcoes.find((o) => o.nome === acompanhamentoEscolhido);
  if (!opcao) {
    return { erro: `Acompanhamento inválido para "${nomeItem}"` };
  }
  return { precoAdicional: opcao.precoAdicional };
}
