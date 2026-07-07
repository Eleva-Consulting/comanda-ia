import { describe, it, expect } from 'vitest';
import { calcularResumoConta, validarItensParaPagamento, type ContaParaResumo } from './fechamentoConta.js';

function contaBase(overrides: Partial<ContaParaResumo> = {}): ContaParaResumo {
  return {
    descontoValor: null,
    comandas: [
      {
        id: 'comanda-1',
        nome: 'Geral',
        itens: [
          { id: 'item-1', nomeItem: 'Picanha', precoUnit: '80.00', quantidade: 1, status: 'entregue' },
          { id: 'item-2', nomeItem: 'Refrigerante', precoUnit: '8.50', quantidade: 2, status: 'entregue' },
        ],
      },
    ],
    pagamentos: [],
    ...overrides,
  };
}

describe('calcularResumoConta', () => {
  it('soma o total dos itens sem pagamento nem desconto', () => {
    const resumo = calcularResumoConta(contaBase());
    expect(resumo.totalConta).toBe(97);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.descontoValor).toBe(0);
    expect(resumo.saldoDevedor).toBe(97);
    expect(resumo.podeFechar).toBe(false);
  });

  it('exclui itens cancelados do total', () => {
    const conta = contaBase({
      comandas: [
        {
          id: 'comanda-1',
          nome: 'Geral',
          itens: [
            { id: 'item-1', nomeItem: 'Picanha', precoUnit: '80.00', quantidade: 1, status: 'entregue' },
            { id: 'item-2', nomeItem: 'Suco', precoUnit: '10.00', quantidade: 1, status: 'cancelado' },
          ],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.totalConta).toBe(80);
  });

  it('pagamento confirmado reduz o saldo devedor', () => {
    const conta = contaBase({
      pagamentos: [
        { id: 'pag-1', valor: '50.00', status: 'confirmado', formaPagamento: 'pix', criadoEm: new Date(), itens: [] },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.totalPago).toBe(50);
    expect(resumo.saldoDevedor).toBe(47);
  });

  it('pagamento estornado NÃO reduz o saldo devedor', () => {
    const conta = contaBase({
      pagamentos: [
        { id: 'pag-1', valor: '50.00', status: 'estornado', formaPagamento: 'pix', criadoEm: new Date(), itens: [] },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.totalPago).toBe(0);
    expect(resumo.saldoDevedor).toBe(97);
  });

  it('desconto reduz o saldo devedor', () => {
    const conta = contaBase({ descontoValor: '17.00' });
    const resumo = calcularResumoConta(conta);
    expect(resumo.descontoValor).toBe(17);
    expect(resumo.saldoDevedor).toBe(80);
  });

  it('podeFechar é true quando o saldo chega a zero', () => {
    const conta = contaBase({
      pagamentos: [
        { id: 'pag-1', valor: '97.00', status: 'confirmado', formaPagamento: 'dinheiro', criadoEm: new Date(), itens: [] },
      ],
    });
    const resumo = calcularResumoConta(conta);
    expect(resumo.saldoDevedor).toBe(0);
    expect(resumo.podeFechar).toBe(true);
  });

  it('marca item como pago quando coberto por pagamento confirmado, e como não pago se o pagamento foi estornado', () => {
    const conta = contaBase({
      pagamentos: [
        {
          id: 'pag-1', valor: '80.00', status: 'confirmado', formaPagamento: 'pix', criadoEm: new Date(),
          itens: [{ itemComandaId: 'item-1' }],
        },
        {
          id: 'pag-2', valor: '17.00', status: 'estornado', formaPagamento: 'pix', criadoEm: new Date(),
          itens: [{ itemComandaId: 'item-2' }],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    const item1 = resumo.porComanda[0].itens.find((i) => i.id === 'item-1')!;
    const item2 = resumo.porComanda[0].itens.find((i) => i.id === 'item-2')!;
    expect(item1.pago).toBe(true);
    expect(item2.pago).toBe(false);
    expect(resumo.porComanda[0].totalNaoPago).toBe(17);
  });
});

describe('validarItensParaPagamento', () => {
  it('retorna o valor somado dos itens válidos e não pagos', () => {
    const resumo = calcularResumoConta(contaBase());
    const resultado = validarItensParaPagamento(resumo, ['item-1', 'item-2']);
    expect(resultado.erro).toBeUndefined();
    expect(resultado.valor).toBe(97);
  });

  it('retorna erro se o item já está pago', () => {
    const conta = contaBase({
      pagamentos: [
        {
          id: 'pag-1', valor: '80.00', status: 'confirmado', formaPagamento: 'pix', criadoEm: new Date(),
          itens: [{ itemComandaId: 'item-1' }],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    const resultado = validarItensParaPagamento(resumo, ['item-1']);
    expect(resultado.erro).toMatch(/já foi pago/);
  });

  it('retorna erro se o item está cancelado', () => {
    const conta = contaBase({
      comandas: [
        {
          id: 'comanda-1',
          nome: 'Geral',
          itens: [{ id: 'item-1', nomeItem: 'Suco', precoUnit: '10.00', quantidade: 1, status: 'cancelado' }],
        },
      ],
    });
    const resumo = calcularResumoConta(conta);
    const resultado = validarItensParaPagamento(resumo, ['item-1']);
    expect(resultado.erro).toMatch(/cancelado/);
  });

  it('retorna erro se o item não existe na conta', () => {
    const resumo = calcularResumoConta(contaBase());
    const resultado = validarItensParaPagamento(resumo, ['item-inexistente']);
    expect(resultado.erro).toMatch(/não encontrado/);
  });
});
