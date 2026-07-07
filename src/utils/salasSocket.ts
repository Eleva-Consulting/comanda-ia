/**
 * Decide em quais salas do Socket.IO uma conexão deve entrar.
 *
 * Conexões comuns (Layout, Cozinha, Mesas) sempre entram na sala ampla do
 * estabelecimento, preservando o comportamento de hoje — não recebem/enviam
 * `contexto`. Só a tela de Produção (Fase 1d) abre uma conexão dedicada com
 * `contexto: 'producao'`; se o usuário tiver um setor fixo, essa conexão entra
 * SÓ na sala do setor (reduz tráfego); sem setor fixo (DONO, ou operador sem
 * setor definido — "vê tudo"), cai de volta na sala ampla.
 */
export function salasParaConexao(params: {
  estabelecimentoId: string;
  setorId: string | null;
  contexto: string | null;
}): string[] {
  const { estabelecimentoId, setorId, contexto } = params;
  if (contexto === 'producao' && setorId) {
    return [`${estabelecimentoId}:${setorId}`];
  }
  return [estabelecimentoId];
}
