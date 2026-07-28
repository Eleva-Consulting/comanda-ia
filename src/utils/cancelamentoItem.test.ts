import { describe, expect, it } from 'vitest';
import { calcularDivisaoCancelamento } from './cancelamentoItem.js';

describe('calcularDivisaoCancelamento', () => {
  it('cancela tudo quando a quantidade a cancelar é igual à quantidade atual', () => {
    expect(calcularDivisaoCancelamento(4, 4)).toEqual({ restante: 0, dividir: false });
  });

  it('divide o item quando cancela só parte da quantidade', () => {
    expect(calcularDivisaoCancelamento(4, 2)).toEqual({ restante: 2, dividir: true });
  });

  it('divide mesmo cancelando só 1 unidade de um item com quantidade maior', () => {
    expect(calcularDivisaoCancelamento(3, 1)).toEqual({ restante: 2, dividir: true });
  });

  it('lança erro se a quantidade a cancelar for maior que a quantidade atual', () => {
    expect(() => calcularDivisaoCancelamento(3, 4)).toThrow();
  });

  it('lança erro se a quantidade a cancelar for zero', () => {
    expect(() => calcularDivisaoCancelamento(3, 0)).toThrow();
  });

  it('lança erro se a quantidade a cancelar for negativa', () => {
    expect(() => calcularDivisaoCancelamento(3, -1)).toThrow();
  });

  it('lança erro se a quantidade a cancelar não for inteira', () => {
    expect(() => calcularDivisaoCancelamento(3, 1.5)).toThrow();
  });
});
