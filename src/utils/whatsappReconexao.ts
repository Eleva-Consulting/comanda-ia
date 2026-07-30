export const LOGGED_OUT = 401;

// Baileys só limpa a sessão sozinho no código 401 (loggedOut). Qualquer outro código
// (ex: 405, retornado cru pelo servidor do WhatsApp) tentava reconectar pra sempre a
// cada 5s, mesmo quando a sessão salva está permanentemente inválida — causou um loop
// infinito real em produção. Depois de N tentativas consecutivas sem sucesso, desiste e
// limpa a sessão, forçando uma pareação nova (QR code) na próxima tentativa manual.
export const MAX_TENTATIVAS_RECONEXAO = 5;

export interface DecisaoReconexao {
  deveLimparSessao: boolean;
  deveReconectar: boolean;
}

export function decidirAposDesconexao(codigo: number | undefined, tentativasAnteriores: number): DecisaoReconexao {
  if (codigo === LOGGED_OUT) {
    return { deveLimparSessao: true, deveReconectar: false };
  }

  if (tentativasAnteriores + 1 >= MAX_TENTATIVAS_RECONEXAO) {
    return { deveLimparSessao: true, deveReconectar: false };
  }

  return { deveLimparSessao: false, deveReconectar: true };
}
