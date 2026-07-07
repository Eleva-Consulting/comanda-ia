import { describe, it, expect } from 'vitest';
import { salasParaConexao } from './salasSocket.js';

describe('salasParaConexao', () => {
  it('conexão de produção com setor fixo entra só na sala do setor', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: 'setor-1', contexto: 'producao' }))
      .toEqual(['est-1:setor-1']);
  });

  it('conexão de produção sem setor fixo (DONO) cai na sala ampla', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: null, contexto: 'producao' }))
      .toEqual(['est-1']);
  });

  it('conexão comum (sem contexto) entra na sala ampla mesmo com setor fixo', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: 'setor-1', contexto: null }))
      .toEqual(['est-1']);
  });

  it('conexão comum sem contexto e sem setor entra na sala ampla', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: null, contexto: null }))
      .toEqual(['est-1']);
  });
});
