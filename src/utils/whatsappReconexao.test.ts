import { describe, expect, it } from 'vitest';
import { decidirAposDesconexao, LOGGED_OUT, MAX_TENTATIVAS_RECONEXAO } from './whatsappReconexao.js';

describe('decidirAposDesconexao', () => {
  it('quando o código é loggedOut, limpa a sessão e não reconecta', () => {
    expect(decidirAposDesconexao(LOGGED_OUT, 0)).toEqual({
      deveLimparSessao: true,
      deveReconectar: false,
    });
  });

  it('quando ainda não atingiu o limite de tentativas, reconecta sem limpar a sessão', () => {
    expect(decidirAposDesconexao(405, 0)).toEqual({
      deveLimparSessao: false,
      deveReconectar: true,
    });
    expect(decidirAposDesconexao(405, MAX_TENTATIVAS_RECONEXAO - 2)).toEqual({
      deveLimparSessao: false,
      deveReconectar: true,
    });
  });

  it('quando atinge o limite de tentativas consecutivas, desiste e limpa a sessão', () => {
    expect(decidirAposDesconexao(405, MAX_TENTATIVAS_RECONEXAO - 1)).toEqual({
      deveLimparSessao: true,
      deveReconectar: false,
    });
  });

  it('conta tentativas acima do limite também como desistência (nunca deixa passar)', () => {
    expect(decidirAposDesconexao(405, MAX_TENTATIVAS_RECONEXAO + 10)).toEqual({
      deveLimparSessao: true,
      deveReconectar: false,
    });
  });

  it('código undefined (desconexão sem motivo explícito) segue a mesma regra de tentativas', () => {
    expect(decidirAposDesconexao(undefined, 0)).toEqual({
      deveLimparSessao: false,
      deveReconectar: true,
    });
  });
});
