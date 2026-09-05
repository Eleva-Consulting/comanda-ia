import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carregarFila, descartarExpirados, enfileirar, listarProntosParaRetry, removerDaFila, salvarFila, type TicketEnfileirado } from './filaImpressao.js';

function ticket(over: Partial<TicketEnfileirado> = {}): TicketEnfileirado {
  return {
    id:           'ticket-1',
    impressoraIp: '192.168.1.10',
    ticket:       Buffer.from('conteúdo do ticket'),
    criadoEm:     1_000,
    tentativas:   0,
    ...over,
  };
}

describe('enfileirar', () => {
  it('adiciona o item ao fim da fila sem mutar o array original', () => {
    const filaOriginal: TicketEnfileirado[] = [];
    const filaNova = enfileirar(filaOriginal, ticket());

    expect(filaOriginal).toHaveLength(0);
    expect(filaNova).toHaveLength(1);
    expect(filaNova[0].id).toBe('ticket-1');
  });
});

describe('descartarExpirados', () => {
  const ttlMs = 45 * 60 * 1000; // 45min, mesmo default do plano

  it('mantém item mais novo que o TTL', () => {
    const agora = 1_000 + 1000; // 1s depois de criado
    const { ativos, expirados } = descartarExpirados([ticket({ criadoEm: 1_000 })], agora, ttlMs);

    expect(ativos).toHaveLength(1);
    expect(expirados).toHaveLength(0);
  });

  it('descarta item mais velho que o TTL', () => {
    const agora = 1_000 + ttlMs + 1;
    const { ativos, expirados } = descartarExpirados([ticket({ criadoEm: 1_000 })], agora, ttlMs);

    expect(ativos).toHaveLength(0);
    expect(expirados).toHaveLength(1);
    expect(expirados[0].id).toBe('ticket-1');
  });

  it('item exatamente no limite do TTL ainda não expirou', () => {
    const agora = 1_000 + ttlMs;
    const { ativos, expirados } = descartarExpirados([ticket({ criadoEm: 1_000 })], agora, ttlMs);

    expect(ativos).toHaveLength(1);
    expect(expirados).toHaveLength(0);
  });

  it('não muta o array de entrada', () => {
    const filaOriginal = [ticket({ criadoEm: 1_000 }), ticket({ id: 'ticket-2', criadoEm: 1_000 + ttlMs + 1 })];
    descartarExpirados(filaOriginal, 1_000 + ttlMs + 1, ttlMs);

    expect(filaOriginal).toHaveLength(2);
  });

  it('separa ativos e expirados numa fila mista', () => {
    const agora = 1_000 + ttlMs + 1;
    const fila = [
      ticket({ id: 'expira', criadoEm: 1_000 }),
      ticket({ id: 'fica', criadoEm: agora }),
    ];
    const { ativos, expirados } = descartarExpirados(fila, agora, ttlMs);

    expect(ativos.map((t) => t.id)).toEqual(['fica']);
    expect(expirados.map((t) => t.id)).toEqual(['expira']);
  });
});

describe('listarProntosParaRetry', () => {
  it('retorna a fila inteira (sem backoff por item)', () => {
    const fila = [ticket({ id: 'a' }), ticket({ id: 'b' })];
    expect(listarProntosParaRetry(fila)).toEqual(fila);
  });

  it('fila vazia retorna vazio', () => {
    expect(listarProntosParaRetry([])).toEqual([]);
  });
});

describe('removerDaFila', () => {
  it('remove só o item com o id dado, sem mutar o array original', () => {
    const filaOriginal = [ticket({ id: 'a' }), ticket({ id: 'b' })];
    const filaNova = removerDaFila(filaOriginal, 'a');

    expect(filaOriginal).toHaveLength(2);
    expect(filaNova.map((t) => t.id)).toEqual(['b']);
  });

  it('id inexistente não remove nada', () => {
    const filaOriginal = [ticket({ id: 'a' })];
    expect(removerDaFila(filaOriginal, 'não-existe')).toEqual(filaOriginal);
  });
});

describe('carregarFila / salvarFila (persistência em arquivo)', () => {
  let dir: string;
  let caminho: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fila-impressao-test-'));
    caminho = join(dir, 'fila-impressao.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('carregarFila retorna vazio quando o arquivo ainda não existe', async () => {
    expect(await carregarFila(caminho)).toEqual([]);
  });

  it('salva e recarrega a fila preservando o conteúdo do ticket (Buffer)', async () => {
    const original = [ticket({ id: 'a' }), ticket({ id: 'b', ticket: Buffer.from('outro conteúdo') })];
    await salvarFila(caminho, original);

    const recarregada = await carregarFila(caminho);

    expect(recarregada).toHaveLength(2);
    expect(recarregada[0].id).toBe('a');
    expect(recarregada[0].ticket).toBeInstanceOf(Buffer);
    expect(recarregada[0].ticket.equals(original[0].ticket)).toBe(true);
    expect(recarregada[1].ticket.equals(original[1].ticket)).toBe(true);
  });

  it('salvarFila com fila vazia sobrescreve arquivo existente', async () => {
    await salvarFila(caminho, [ticket()]);
    await salvarFila(caminho, []);

    expect(await carregarFila(caminho)).toEqual([]);
  });
});
