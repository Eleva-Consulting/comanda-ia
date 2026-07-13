import { describe, it, expect } from 'vitest';
import { diaSaoPaulo, resolverIntervaloPeriodo } from './periodoRelatorio.js';

describe('diaSaoPaulo', () => {
  it('converte um horário UTC de madrugada (ainda dia anterior em Brasília) pro dia certo', () => {
    // 2026-07-12T02:00:00Z = 2026-07-11T23:00:00-03:00 (ainda 11 em Brasília)
    const data = new Date('2026-07-12T02:00:00Z');
    expect(diaSaoPaulo(data)).toBe('2026-07-11');
  });

  it('converte um horário UTC já bem avançado no dia', () => {
    // 2026-07-12T15:00:00Z = 2026-07-12T12:00:00-03:00
    const data = new Date('2026-07-12T15:00:00Z');
    expect(diaSaoPaulo(data)).toBe('2026-07-12');
  });
});

describe('resolverIntervaloPeriodo', () => {
  it('sem parâmetros, usa o dia de hoje em Brasília como início e fim', () => {
    const resultado = resolverIntervaloPeriodo();
    const hojeEsperado = diaSaoPaulo(new Date());
    expect(resultado.inicioLabel).toBe(hojeEsperado);
    expect(resultado.fimLabel).toBe(hojeEsperado);
  });

  it('com parâmetros, usa exatamente as datas informadas', () => {
    const resultado = resolverIntervaloPeriodo('2026-07-01', '2026-07-10');
    expect(resultado.inicioLabel).toBe('2026-07-01');
    expect(resultado.fimLabel).toBe('2026-07-10');
  });

  it('inicioUTC é meia-noite em Brasília (03:00 UTC) do dia informado', () => {
    const resultado = resolverIntervaloPeriodo('2026-07-01', '2026-07-01');
    expect(resultado.inicioUTC.toISOString()).toBe('2026-07-01T03:00:00.000Z');
  });

  it('fimUTC é o último instante do dia em Brasília (02:59:59.999 UTC do dia seguinte)', () => {
    const resultado = resolverIntervaloPeriodo('2026-07-01', '2026-07-01');
    expect(resultado.fimUTC.toISOString()).toBe('2026-07-02T02:59:59.999Z');
  });
});
