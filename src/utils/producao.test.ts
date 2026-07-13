import { describe, it, expect } from 'vitest';
import { filtroSetorProducao, salaProducao, serializarItemProducao } from './producao.js';

describe('filtroSetorProducao', () => {
  it('filtra por setor quando o usuário tem um setor fixo', () => {
    expect(filtroSetorProducao('setor-123')).toEqual({ setorId: 'setor-123' });
  });

  it('não filtra (vê todos os setores) quando o usuário não tem setor fixo', () => {
    expect(filtroSetorProducao(null)).toEqual({});
  });
});

describe('salaProducao', () => {
  it('inclui a sala ampla e a sala do setor quando o item tem setor', () => {
    expect(salaProducao('est-1', 'setor-1')).toEqual(['est-1', 'est-1:setor-1']);
  });

  it('inclui só a sala ampla quando o item não tem setor', () => {
    expect(salaProducao('est-1', null)).toEqual(['est-1']);
  });
});

describe('serializarItemProducao', () => {
  it('inclui rodadaId no payload serializado', () => {
    const item = {
      id: '1', nomeItem: 'Galeto', quantidade: 1, observacao: null, acompanhamento: null,
      status: 'recebido' as const, recebidoEm: new Date('2026-01-01T12:00:00Z'),
      setorId: null, rodadaId: 'rodada-1',
      setor: null, comanda: { nome: 'Geral', conta: { mesa: { numero: '5' } } },
    };
    expect(serializarItemProducao(item).rodadaId).toBe('rodada-1');
  });

  it('rodadaId null quando o item não pertence a nenhuma rodada (legado)', () => {
    const item = {
      id: '1', nomeItem: 'Galeto', quantidade: 1, observacao: null, acompanhamento: null,
      status: 'recebido' as const, recebidoEm: new Date('2026-01-01T12:00:00Z'),
      setorId: null, rodadaId: null,
      setor: null, comanda: { nome: 'Geral', conta: { mesa: { numero: '5' } } },
    };
    expect(serializarItemProducao(item).rodadaId).toBe(null);
  });
});
