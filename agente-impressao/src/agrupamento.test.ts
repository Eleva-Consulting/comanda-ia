import { describe, expect, it } from 'vitest';
import { agruparPorSetorEImpressora, type ComandaComItens, type ItemComSetor, type SetorComImpressora } from './agrupamento.js';

function item(over: Partial<ItemComSetor> = {}): ItemComSetor {
  return { setorId: 'setor-cozinha', quantidade: 1, nomeItem: 'Item', observacao: null, acompanhamento: null, ...over };
}

const setorCozinha: SetorComImpressora = { id: 'setor-cozinha', impressoraIp: '192.168.1.10' };
const setorChurrasco: SetorComImpressora = { id: 'setor-churrasco', impressoraIp: '192.168.1.20' };
const setorSemImpressora: SetorComImpressora = { id: 'setor-bar', impressoraIp: null };

describe('agruparPorSetorEImpressora', () => {
  it('agrupa itens de uma única comanda no setor certo', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Cláudio', itens: [item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinha]);
    expect(grupos).toEqual([
      { setorId: 'setor-cozinha', impressoraIp: '192.168.1.10', comandas: [{ nome: 'Cláudio', itens: [item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' })] }] },
    ]);
  });

  it('separa itens da mesma comanda em grupos diferentes por setor', () => {
    const comandas: ComandaComItens[] = [
      {
        nome: 'Ana',
        itens: [
          item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' }),
          item({ setorId: 'setor-churrasco', nomeItem: 'Picanha' }),
        ],
      },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinha, setorChurrasco]);

    expect(grupos).toHaveLength(2);
    const cozinha = grupos.find((g) => g.setorId === 'setor-cozinha')!;
    const churrasco = grupos.find((g) => g.setorId === 'setor-churrasco')!;
    expect(cozinha.comandas[0].itens).toEqual([item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' })]);
    expect(churrasco.comandas[0].itens).toEqual([item({ setorId: 'setor-churrasco', nomeItem: 'Picanha' })]);
  });

  it('agrupa comandas diferentes que mandam pro mesmo setor', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Ana',     itens: [item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' })] },
      { nome: 'Cláudio', itens: [item({ setorId: 'setor-cozinha', nomeItem: 'Feijão' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinha]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].comandas.map((c) => c.nome)).toEqual(['Ana', 'Cláudio']);
  });

  it('ignora item sem setor vinculado — não imprime automaticamente', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Ana', itens: [item({ setorId: null, nomeItem: 'Sobremesa' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinha]);
    expect(grupos).toEqual([]);
  });

  it('ignora item de setor sem impressora configurada', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Ana', itens: [item({ setorId: 'setor-bar', nomeItem: 'Caipirinha' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorSemImpressora]);
    expect(grupos).toEqual([]);
  });

  it('uma comanda com só item sem setor não aparece em nenhum grupo, mas outra comanda com item válido aparece', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Ana',     itens: [item({ setorId: null, nomeItem: 'Sobremesa' })] },
      { nome: 'Cláudio', itens: [item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinha]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].comandas.map((c) => c.nome)).toEqual(['Cláudio']);
  });
});
