import { describe, it, expect } from 'vitest';
import { diaSaoPaulo, resolverIntervaloPeriodo, calcularVendasPorDia, agruparPorMesa } from './periodoRelatorio.js';

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

describe('calcularVendasPorDia', () => {
  it('agrupa pedidos do mesmo dia em Brasília, somando faturamento e contando pedidos', () => {
    const pedidos = [
      { criadoEm: new Date('2026-07-01T13:00:00Z'), total: 30 },
      { criadoEm: new Date('2026-07-01T20:00:00Z'), total: 20 },
    ];
    const { vendasPorDia } = calcularVendasPorDia(pedidos);
    expect(vendasPorDia).toEqual([{ data: '2026-07-01', pedidos: 2, faturamento: 50 }]);
  });

  it('ordena vendasPorDia do dia mais antigo pro mais recente', () => {
    const pedidos = [
      { criadoEm: new Date('2026-07-03T13:00:00Z'), total: 10 },
      { criadoEm: new Date('2026-07-01T13:00:00Z'), total: 20 },
    ];
    const { vendasPorDia } = calcularVendasPorDia(pedidos);
    expect(vendasPorDia.map((d) => d.data)).toEqual(['2026-07-01', '2026-07-03']);
  });

  it('topDias traz no máximo 5 dias, ordenados do maior faturamento pro menor', () => {
    const pedidos = [
      { criadoEm: new Date('2026-07-01T13:00:00Z'), total: 10 },
      { criadoEm: new Date('2026-07-02T13:00:00Z'), total: 50 },
      { criadoEm: new Date('2026-07-03T13:00:00Z'), total: 30 },
      { criadoEm: new Date('2026-07-04T13:00:00Z'), total: 5 },
      { criadoEm: new Date('2026-07-05T13:00:00Z'), total: 40 },
      { criadoEm: new Date('2026-07-06T13:00:00Z'), total: 60 },
    ];
    const { topDias } = calcularVendasPorDia(pedidos);
    expect(topDias).toHaveLength(5);
    expect(topDias.map((d) => d.faturamento)).toEqual([60, 50, 40, 30, 10]);
  });

  it('devolve arrays vazios quando não há pedidos', () => {
    const { vendasPorDia, topDias } = calcularVendasPorDia([]);
    expect(vendasPorDia).toEqual([]);
    expect(topDias).toEqual([]);
  });
});

describe('agruparPorMesa', () => {
  it('soma pagamentos da mesma mesa, mesmo vindo de contas/atendimentos diferentes', () => {
    const pagamentos = [
      { valor: 50, mesaNumero: '5' },
      { valor: 30, mesaNumero: '5' },
      { valor: 100, mesaNumero: '3' },
    ];
    const resultado = agruparPorMesa(pagamentos);
    expect(resultado).toEqual([
      { mesaNumero: '3', quantidade: 1, total: 100 },
      { mesaNumero: '5', quantidade: 2, total: 80 },
    ]);
  });

  it('ordena do maior faturamento pro menor', () => {
    const pagamentos = [
      { valor: 10, mesaNumero: '1' },
      { valor: 90, mesaNumero: '2' },
      { valor: 50, mesaNumero: '3' },
    ];
    const resultado = agruparPorMesa(pagamentos);
    expect(resultado.map((m) => m.mesaNumero)).toEqual(['2', '3', '1']);
  });

  it('agrupa pagamento sem mesa vinculada como "Sem mesa"', () => {
    const pagamentos = [{ valor: 20, mesaNumero: null }];
    const resultado = agruparPorMesa(pagamentos);
    expect(resultado).toEqual([{ mesaNumero: 'Sem mesa', quantidade: 1, total: 20 }]);
  });

  it('devolve array vazio quando não há pagamentos', () => {
    expect(agruparPorMesa([])).toEqual([]);
  });
});
