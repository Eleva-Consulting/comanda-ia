import { describe, it, expect } from 'vitest';
import { filtroSetorProducao, salaProducao } from './producao.js';

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
