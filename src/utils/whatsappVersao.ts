export type VersaoWhatsApp = [number, number, number];

export interface ResultadoFonteVersao {
  version: VersaoWhatsApp;
  isLatest: boolean;
  error?: unknown;
}

export type FonteVersao = () => Promise<ResultadoFonteVersao>;

export interface OpcoesResolvedorVersao {
  agora?: () => number;
  validadeMs?: number;
  timeoutFonteMs?: number;
  aoFalhar?: (erro: unknown) => void;
}

export const VALIDADE_CACHE_VERSAO_MS = 6 * 60 * 60 * 1000;
export const TIMEOUT_FONTE_VERSAO_MS = 5_000;

// As consultas de versão do Baileys usam fetch sem timeout nenhum — uma resposta travada
// seguraria toda conexão/reconexão por minutos.
function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout de ${ms}ms ao consultar a versão do WhatsApp Web`)), ms);
    promessa.then(
      (valor) => { clearTimeout(timer); resolve(valor); },
      (erro) => { clearTimeout(timer); reject(erro); },
    );
  });
}

// O Baileys anuncia pro servidor do WhatsApp uma versão do WhatsApp Web fixa no código da
// lib. Quando o WhatsApp deixa de aceitar essa versão, toda conexão — inclusive uma pareação
// nova, sem sessão salva — é recusada com 405 antes de gerar o QR code (incidente real em
// produção em 2026-10-02). Consultar a versão atual em tempo de execução evita depender de
// um bump da lib a cada vez que isso acontece.
//
// Tenta as fontes em ordem e fica com a primeira que devolver a versão atual. Se nenhuma
// responder, usa a última versão conhecida; sem nenhuma, devolve undefined (o Baileys cai
// na versão embutida). Falha nunca é guardada em cache. Chamadas simultâneas compartilham
// a mesma consulta (no boot, toda sessão salva reconecta ao mesmo tempo).
export function criarResolvedorVersao(
  fontes: FonteVersao[],
  opcoes: OpcoesResolvedorVersao = {},
): () => Promise<VersaoWhatsApp | undefined> {
  const {
    agora = Date.now,
    validadeMs = VALIDADE_CACHE_VERSAO_MS,
    timeoutFonteMs = TIMEOUT_FONTE_VERSAO_MS,
    aoFalhar,
  } = opcoes;

  let cache: { version: VersaoWhatsApp; obtidaEm: number } | undefined;
  let emAndamento: Promise<VersaoWhatsApp | undefined> | undefined;

  const consultarFontes = async (): Promise<VersaoWhatsApp | undefined> => {
    for (const fonte of fontes) {
      try {
        const { version, isLatest, error } = await comTimeout(fonte(), timeoutFonteMs);
        if (isLatest) {
          cache = { version, obtidaEm: agora() };
          return version;
        }
        // o Baileys não lança quando a consulta falha: devolve a versão embutida + o erro
        aoFalhar?.(error ?? new Error('fonte devolveu apenas a versão embutida'));
      } catch (erro) {
        aoFalhar?.(erro);
      }
    }

    return cache?.version;
  };

  return () => {
    if (cache && agora() - cache.obtidaEm < validadeMs) return Promise.resolve(cache.version);

    emAndamento ??= consultarFontes().finally(() => { emAndamento = undefined; });
    return emAndamento;
  };
}
