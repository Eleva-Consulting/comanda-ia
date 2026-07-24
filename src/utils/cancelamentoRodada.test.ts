import { describe, it, expect } from 'vitest';
import { separarItensCancelaveisDaRodada, decidirLiberacaoConta } from './cancelamentoRodada.js';

describe('separarItensCancelaveisDaRodada', () => {
  it('ignora itens já entregues ou já cancelados', () => {
    const itens = [
      { id: '1', nomeItem: 'Galeto', status: 'recebido' as const },
      { id: '2', nomeItem: 'Arroz',  status: 'entregue' as const },
      { id: '3', nomeItem: 'Farofa', status: 'cancelado' as const },
    ];
    const { itensAtivos, itensCancelaveis } = separarItensCancelaveisDaRodada(itens, new Set());
    expect(itensAtivos.map((i) => i.id)).toEqual(['1']);
    expect(itensCancelaveis.map((i) => i.id)).toEqual(['1']);
  });

  it('separa item já pago pra itensNaoCancelados em vez de cancelar', () => {
    const itens = [
      { id: '1', nomeItem: 'Galeto', status: 'em_preparo' as const },
      { id: '2', nomeItem: 'Pizza',  status: 'pronto' as const },
    ];
    const { itensCancelaveis, itensNaoCancelados } = separarItensCancelaveisDaRodada(itens, new Set(['2']));
    expect(itensCancelaveis.map((i) => i.id)).toEqual(['1']);
    expect(itensNaoCancelados).toEqual([
      { id: '2', nomeItem: 'Pizza', motivo: 'Item já foi pago — estorne o pagamento antes de cancelar' },
    ]);
  });

  it('todos ativos pagos resulta em itensCancelaveis vazio', () => {
    const itens = [{ id: '1', nomeItem: 'Galeto', status: 'recebido' as const }];
    const { itensCancelaveis } = separarItensCancelaveisDaRodada(itens, new Set(['1']));
    expect(itensCancelaveis).toEqual([]);
  });
});

describe('decidirLiberacaoConta', () => {
  it('não libera quando ainda há item pendente em outra comanda/rodada da mesma conta', () => {
    const resultado = decidirLiberacaoConta({ itensPendentes: 1, podeFechar: true, itensEntreguesNaConta: 0, totalPago: 0 });
    expect(resultado).toBe(null);
  });

  it('não libera quando ainda há saldo devedor', () => {
    const resultado = decidirLiberacaoConta({ itensPendentes: 0, podeFechar: false, itensEntreguesNaConta: 0, totalPago: 0 });
    expect(resultado).toBe(null);
  });

  it('libera como cancelada quando nada da mesa chegou a ser consumido ou pago', () => {
    const resultado = decidirLiberacaoConta({ itensPendentes: 0, podeFechar: true, itensEntreguesNaConta: 0, totalPago: 0 });
    expect(resultado).toBe('cancelada');
  });

  it('libera como fechada quando algo já foi entregue antes', () => {
    const resultado = decidirLiberacaoConta({ itensPendentes: 0, podeFechar: true, itensEntreguesNaConta: 2, totalPago: 0 });
    expect(resultado).toBe('fechada');
  });

  it('libera como fechada quando algo já foi pago antes, mesmo sem item entregue', () => {
    const resultado = decidirLiberacaoConta({ itensPendentes: 0, podeFechar: true, itensEntreguesNaConta: 0, totalPago: 50 });
    expect(resultado).toBe('fechada');
  });
});
