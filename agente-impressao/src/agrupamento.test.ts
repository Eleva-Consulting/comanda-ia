import { describe, expect, it } from 'vitest';
import { agruparPorSetorEImpressora, type ComandaComItens, type ItemComSetor, type SetorComImpressora } from './agrupamento.js';

function item(over: Partial<ItemComSetor> = {}): ItemComSetor {
  return { setorId: 'setor-cozinha', quantidade: 1, nomeItem: 'Item', observacao: null, acompanhamento: null, ...over };
}

const setorCozinha: SetorComImpressora = { id: 'setor-cozinha', nome: 'Cozinha', impressoraIp: '192.168.1.10', recebeTicketCompleto: false };
const setorCozinhaHub: SetorComImpressora = { ...setorCozinha, recebeTicketCompleto: true };
const setorChurrasco: SetorComImpressora = { id: 'setor-churrasco', nome: 'Churrasqueira', impressoraIp: '192.168.1.20', recebeTicketCompleto: false };
const setorSemImpressora: SetorComImpressora = { id: 'setor-bar', nome: 'Bar', impressoraIp: null, recebeTicketCompleto: false };

describe('agruparPorSetorEImpressora — sem setor hub', () => {
  it('agrupa itens de uma única comanda no setor certo', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Cláudio', itens: [item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinha]);
    expect(grupos).toEqual([
      {
        setorId: 'setor-cozinha',
        setorNome: 'Cozinha',
        impressoraIp: '192.168.1.10',
        comandas: [{ nome: 'Cláudio', itens: [{ ...item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' }), nomeSetorReferencia: null }] }],
      },
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
    expect(cozinha.comandas[0].itens.map((i) => i.nomeItem)).toEqual(['Arroz']);
    expect(churrasco.comandas[0].itens.map((i) => i.nomeItem)).toEqual(['Picanha']);
    // itens do próprio setor nunca levam marcação de referência
    expect(cozinha.comandas[0].itens[0].nomeSetorReferencia).toBeNull();
    expect(churrasco.comandas[0].itens[0].nomeSetorReferencia).toBeNull();
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

describe('agruparPorSetorEImpressora — com setor hub (recebeTicketCompleto)', () => {
  it('o setor hub recebe TODOS os itens da comanda, não só os dele', () => {
    const comandas: ComandaComItens[] = [
      {
        nome: 'Ana',
        itens: [
          item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' }),
          item({ setorId: 'setor-churrasco', nomeItem: 'Picanha' }),
        ],
      },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinhaHub, setorChurrasco]);

    const hub = grupos.find((g) => g.setorId === 'setor-cozinha')!;
    expect(hub.comandas[0].itens.map((i) => i.nomeItem)).toEqual(['Arroz', 'Picanha']);
  });

  it('item de outro setor no hub sai marcado com o nome do setor de origem; item do próprio setor não', () => {
    const comandas: ComandaComItens[] = [
      {
        nome: 'Ana',
        itens: [
          item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' }),
          item({ setorId: 'setor-churrasco', nomeItem: 'Picanha' }),
        ],
      },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinhaHub, setorChurrasco]);

    const hub = grupos.find((g) => g.setorId === 'setor-cozinha')!;
    const arroz = hub.comandas[0].itens.find((i) => i.nomeItem === 'Arroz')!;
    const picanha = hub.comandas[0].itens.find((i) => i.nomeItem === 'Picanha')!;
    expect(arroz.nomeSetorReferencia).toBeNull();
    expect(picanha.nomeSetorReferencia).toBe('Churrasqueira');
  });

  it('item sem setor aparece no hub sem marcação (é só referência de "existe", não indica outra estação)', () => {
    const comandas: ComandaComItens[] = [
      { nome: 'Ana', itens: [item({ setorId: null, nomeItem: 'Sobremesa' })] },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinhaHub]);

    const hub = grupos.find((g) => g.setorId === 'setor-cozinha')!;
    expect(hub.comandas[0].itens[0].nomeSetorReferencia).toBeNull();
  });

  it('setor não-hub continua só vendo os itens dele mesmo quando existe um hub', () => {
    const comandas: ComandaComItens[] = [
      {
        nome: 'Ana',
        itens: [
          item({ setorId: 'setor-cozinha', nomeItem: 'Arroz' }),
          item({ setorId: 'setor-churrasco', nomeItem: 'Picanha' }),
        ],
      },
    ];
    const grupos = agruparPorSetorEImpressora(comandas, [setorCozinhaHub, setorChurrasco]);

    const churrasco = grupos.find((g) => g.setorId === 'setor-churrasco')!;
    expect(churrasco.comandas[0].itens.map((i) => i.nomeItem)).toEqual(['Picanha']);
  });
});
