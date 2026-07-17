import { describe, it, expect } from 'vitest';
import { montarItensParaCriar } from './rodadas.js';

// montarItensParaCriar é a parte pura: dado o mapa de cardápio e as entradas, retorna
// { itensParaCriar, itensDescartados } sem tocar no banco.
describe('montarItensParaCriar', () => {
  const cardapio = new Map<string, any>([
    ['a',  { id: 'a',  nome: 'Coca', preco: 5,  setorId: null, categoria: { opcoesAcompanhamento: [] } }],
    ['pf', { id: 'pf', nome: 'PF',   preco: 20, setorId: null, categoria: { opcoesAcompanhamento: [{ nome: 'Baião Cremoso', precoAdicional: 3 }] } }],
  ]);

  it('cria item simples e aplica preço', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'a', quantidade: 2, refId: 'r1' }]);
    expect(r.itensParaCriar).toHaveLength(1);
    expect(r.itensParaCriar[0].precoUnit).toBe(5);
    expect(r.itensDescartados).toHaveLength(0);
  });

  it('aplica preço adicional do acompanhamento', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'pf', quantidade: 1, acompanhamento: 'Baião Cremoso', refId: 'r2' }]);
    expect(r.itensParaCriar[0].precoUnit).toBe(23);
  });

  it('descarta item não encontrado no cardápio, com refId', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'x', quantidade: 1, refId: 'r3' }]);
    expect(r.itensParaCriar).toHaveLength(0);
    expect(r.itensDescartados).toEqual([{ itemCardapioId: 'x', motivo: expect.any(String), refId: 'r3' }]);
  });

  it('descarta item que exige acompanhamento sem escolha', () => {
    const r = montarItensParaCriar(cardapio, [{ itemCardapioId: 'pf', quantidade: 1, refId: 'r4' }]);
    expect(r.itensParaCriar).toHaveLength(0);
    expect(r.itensDescartados[0].refId).toBe('r4');
  });
});
