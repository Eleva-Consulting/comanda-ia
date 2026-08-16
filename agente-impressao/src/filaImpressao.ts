// Fila de retry pra ticket que falhou ao imprimir (impressora offline/inalcançável). Persistida
// em arquivo JSON local (`carregarFila`/`salvarFila`) pra sobreviver a reinício do
// agente/serviço — o resto é lógica pura em memória. Sem backoff exponencial por item:
// `listarProntosParaRetry` sempre devolve a fila inteira, o intervalo entre tentativas é
// controlado por quem chama (o `setInterval` do `index.ts`).

import { readFile, writeFile } from 'node:fs/promises';

export interface TicketEnfileirado {
  id:           string;
  impressoraIp: string;
  ticket:       Buffer;
  criadoEm:     number;
  tentativas:   number;
}

export function enfileirar(fila: TicketEnfileirado[], item: TicketEnfileirado): TicketEnfileirado[] {
  return [...fila, item];
}

export function removerDaFila(fila: TicketEnfileirado[], id: string): TicketEnfileirado[] {
  return fila.filter((item) => item.id !== id);
}

export function descartarExpirados(
  fila:  TicketEnfileirado[],
  agora: number,
  ttlMs: number,
): { ativos: TicketEnfileirado[]; expirados: TicketEnfileirado[] } {
  const ativos: TicketEnfileirado[] = [];
  const expirados: TicketEnfileirado[] = [];

  for (const item of fila) {
    if (agora - item.criadoEm > ttlMs) {
      expirados.push(item);
    } else {
      ativos.push(item);
    }
  }

  return { ativos, expirados };
}

export function listarProntosParaRetry(fila: TicketEnfileirado[]): TicketEnfileirado[] {
  return fila;
}

// `Buffer` não sobrevive a JSON.stringify/parse — vira base64 só na hora de gravar/ler o
// arquivo, o resto do módulo trabalha só com o `TicketEnfileirado` em memória (com Buffer).
interface TicketSerializado {
  id:           string;
  impressoraIp: string;
  ticketBase64: string;
  criadoEm:     number;
  tentativas:   number;
}

export async function carregarFila(caminho: string): Promise<TicketEnfileirado[]> {
  let conteudo: string;
  try {
    conteudo = await readFile(caminho, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const itens: TicketSerializado[] = JSON.parse(conteudo);
  return itens.map(({ ticketBase64, ...resto }) => ({ ...resto, ticket: Buffer.from(ticketBase64, 'base64') }));
}

export async function salvarFila(caminho: string, fila: TicketEnfileirado[]): Promise<void> {
  const serializado: TicketSerializado[] = fila.map(({ ticket, ...resto }) => ({
    ...resto,
    ticketBase64: ticket.toString('base64'),
  }));
  await writeFile(caminho, JSON.stringify(serializado, null, 2), 'utf-8');
}
