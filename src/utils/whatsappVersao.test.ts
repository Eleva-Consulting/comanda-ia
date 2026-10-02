import { describe, expect, it, vi } from 'vitest';
import { criarResolvedorVersao, VALIDADE_CACHE_VERSAO_MS, type VersaoWhatsApp } from './whatsappVersao.js';

const VERSAO_A: VersaoWhatsApp = [2, 3000, 111];
const VERSAO_B: VersaoWhatsApp = [2, 3000, 222];

const ok = (version: VersaoWhatsApp) => vi.fn(async () => ({ version, isLatest: true }));
// Baileys não lança quando a consulta falha: devolve a versão embutida com isLatest: false
const desatualizada = (version: VersaoWhatsApp) => vi.fn(async () => ({ version, isLatest: false }));
const quebrada = () => vi.fn(async () => { throw new Error('sem rede'); });

describe('criarResolvedorVersao', () => {
  it('usa a versão da primeira fonte que responde com a versão atual', async () => {
    const segunda = ok(VERSAO_B);
    const resolver = criarResolvedorVersao([ok(VERSAO_A), segunda]);

    expect(await resolver()).toEqual(VERSAO_A);
    expect(segunda).not.toHaveBeenCalled();
  });

  it('cai pra próxima fonte quando a primeira devolve só a versão embutida (isLatest: false)', async () => {
    const resolver = criarResolvedorVersao([desatualizada(VERSAO_A), ok(VERSAO_B)]);

    expect(await resolver()).toEqual(VERSAO_B);
  });

  it('cai pra próxima fonte quando a primeira lança erro', async () => {
    const resolver = criarResolvedorVersao([quebrada(), ok(VERSAO_B)]);

    expect(await resolver()).toEqual(VERSAO_B);
  });

  it('devolve undefined quando nenhuma fonte responde e não há versão conhecida', async () => {
    const resolver = criarResolvedorVersao([quebrada(), desatualizada(VERSAO_A)]);

    expect(await resolver()).toBeUndefined();
  });

  it('reaproveita a versão em cache dentro da validade, sem consultar de novo', async () => {
    const fonte = ok(VERSAO_A);
    let agora = 1_000;
    const resolver = criarResolvedorVersao([fonte], { agora: () => agora });

    await resolver();
    agora += VALIDADE_CACHE_VERSAO_MS - 1;

    expect(await resolver()).toEqual(VERSAO_A);
    expect(fonte).toHaveBeenCalledTimes(1);
  });

  it('consulta de novo depois que o cache expira', async () => {
    const fonte = vi.fn()
      .mockResolvedValueOnce({ version: VERSAO_A, isLatest: true })
      .mockResolvedValueOnce({ version: VERSAO_B, isLatest: true });
    let agora = 1_000;
    const resolver = criarResolvedorVersao([fonte], { agora: () => agora });

    await resolver();
    agora += VALIDADE_CACHE_VERSAO_MS;

    expect(await resolver()).toEqual(VERSAO_B);
  });

  it('mantém a última versão conhecida quando o cache expira e todas as fontes falham', async () => {
    const fonte = vi.fn()
      .mockResolvedValueOnce({ version: VERSAO_A, isLatest: true })
      .mockRejectedValueOnce(new Error('sem rede'));
    let agora = 1_000;
    const resolver = criarResolvedorVersao([fonte], { agora: () => agora });

    await resolver();
    agora += VALIDADE_CACHE_VERSAO_MS;

    expect(await resolver()).toEqual(VERSAO_A);
  });

  it('desiste de uma fonte que não responde dentro do timeout e cai pra próxima', async () => {
    const travada = vi.fn(() => new Promise<never>(() => {}));
    const resolver = criarResolvedorVersao([travada, ok(VERSAO_B)], { timeoutFonteMs: 10 });

    expect(await resolver()).toEqual(VERSAO_B);
  });

  it('chamadas simultâneas com cache vazio compartilham uma única consulta', async () => {
    const fonte = ok(VERSAO_A);
    const resolver = criarResolvedorVersao([fonte]);

    const resultados = await Promise.all([resolver(), resolver(), resolver()]);

    expect(resultados).toEqual([VERSAO_A, VERSAO_A, VERSAO_A]);
    expect(fonte).toHaveBeenCalledTimes(1);
  });

  it('avisa o motivo de cada fonte que falhou', async () => {
    const aoFalhar = vi.fn();
    const resolver = criarResolvedorVersao([quebrada(), ok(VERSAO_B)], { aoFalhar });

    await resolver();

    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('não guarda falha em cache: tenta de novo na chamada seguinte', async () => {
    const fonte = vi.fn()
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValueOnce({ version: VERSAO_A, isLatest: true });
    const resolver = criarResolvedorVersao([fonte]);

    expect(await resolver()).toBeUndefined();
    expect(await resolver()).toEqual(VERSAO_A);
  });
});
