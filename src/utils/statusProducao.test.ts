import { describe, it, expect } from 'vitest';
import { transicaoProducaoValida, podeCancelarLivremente } from './statusProducao.js';

describe('transicaoProducaoValida', () => {
  it('permite recebido -> em_preparo', () => {
    expect(transicaoProducaoValida('recebido', 'em_preparo')).toBe(true);
  });

  it('permite em_preparo -> pronto', () => {
    expect(transicaoProducaoValida('em_preparo', 'pronto')).toBe(true);
  });

  it('permite pronto -> entregue', () => {
    expect(transicaoProducaoValida('pronto', 'entregue')).toBe(true);
  });

  it('não permite pular de recebido direto pra pronto', () => {
    expect(transicaoProducaoValida('recebido', 'pronto')).toBe(false);
  });

  it('permite cancelar a partir de qualquer status ativo', () => {
    expect(transicaoProducaoValida('recebido', 'cancelado')).toBe(true);
    expect(transicaoProducaoValida('em_preparo', 'cancelado')).toBe(true);
    expect(transicaoProducaoValida('pronto', 'cancelado')).toBe(true);
    expect(transicaoProducaoValida('entregue', 'cancelado')).toBe(true);
  });

  it('não permite nenhuma transição a partir de entregue além de cancelado', () => {
    expect(transicaoProducaoValida('entregue', 'em_preparo')).toBe(false);
    expect(transicaoProducaoValida('entregue', 'recebido')).toBe(false);
  });

  it('não permite nenhuma transição a partir de cancelado', () => {
    expect(transicaoProducaoValida('cancelado', 'recebido')).toBe(false);
  });
});

describe('podeCancelarLivremente', () => {
  it('permite cancelamento livre em recebido e em_preparo', () => {
    expect(podeCancelarLivremente('recebido')).toBe(true);
    expect(podeCancelarLivremente('em_preparo')).toBe(true);
  });

  it('bloqueia cancelamento livre em pronto e entregue (exige senha de supervisor — feature futura)', () => {
    expect(podeCancelarLivremente('pronto')).toBe(false);
    expect(podeCancelarLivremente('entregue')).toBe(false);
  });
});
