import { describe, expect, it } from 'vitest';
import { montarTicketRodada, montarTicketEnvio, type ItemTicket } from './escPosTicket.js';

const ESC = '\x1b';
const GS  = '\x1d';

function texto(buffer: Buffer): string {
  return buffer.toString('latin1');
}

const item1: ItemTicket = { quantidade: 4, nomeItem: 'Baião de Carne de Sol', observacao: null, acompanhamento: null };
const item2: ItemTicket = { quantidade: 1, nomeItem: 'Refrigerante', observacao: 'sem gelo', acompanhamento: 'Arroz' };

describe('montarTicketRodada', () => {
  const base = {
    estabelecimentoNome: 'Pizzaria do Bairro',
    mesaNumero:           '7',
    comandaNome:           'Cláudio',
    criadaEm:              new Date('2026-08-01T14:30:00'),
    numeroPessoas:         null,
    abertaPorNome:         null,
    itens:                 [item1],
  };

  it('começa com o comando de inicializar e termina com o de cortar o papel', () => {
    const t = texto(montarTicketRodada(base));
    expect(t.startsWith(`${ESC}@`)).toBe(true);
    expect(t.endsWith(`${GS}V\x00`)).toBe(true);
  });

  it('inclui nome do estabelecimento, mesa e nome da comanda', () => {
    const t = texto(montarTicketRodada(base));
    expect(t).toContain('Pizzaria do Bairro');
    expect(t).toContain('Mesa 7');
    expect(t).toContain('Cláudio');
  });

  it('mostra "Sem mesa" quando mesaNumero é null', () => {
    const t = texto(montarTicketRodada({ ...base, mesaNumero: null }));
    expect(t).toContain('Sem mesa');
  });

  it('inclui quantidade e nome de cada item', () => {
    const t = texto(montarTicketRodada({ ...base, itens: [item1, item2] }));
    expect(t).toContain('4x Baião de Carne de Sol');
    expect(t).toContain('1x Refrigerante');
  });

  it('inclui acompanhamento e observação só quando presentes no item', () => {
    const t = texto(montarTicketRodada({ ...base, itens: [item1, item2] }));
    const [antesDoItem2, depoisDoItem2] = t.split('1x Refrigerante');
    expect(antesDoItem2).not.toContain('Acompanhamento:'); // item1 não tem acompanhamento/obs
    expect(antesDoItem2).not.toContain('obs:');
    expect(depoisDoItem2).toContain('Acompanhamento: Arroz');
    expect(depoisDoItem2).toContain('obs: sem gelo');
  });

  it('inclui número de pessoas e quem abriu só quando presentes', () => {
    const semNenhum = texto(montarTicketRodada(base));
    expect(semNenhum).not.toContain('Pessoas na mesa');
    expect(semNenhum).not.toContain('Aberta por');

    const comAmbos = texto(montarTicketRodada({ ...base, numeroPessoas: 4, abertaPorNome: 'Maria' }));
    expect(comAmbos).toContain('Pessoas na mesa: 4');
    expect(comAmbos).toContain('Aberta por: Maria');
  });
});

describe('montarTicketEnvio', () => {
  const base = {
    estabelecimentoNome: 'Pizzaria do Bairro',
    mesaNumero:           '7',
    criadaEm:              new Date('2026-08-01T14:30:00'),
    numeroPessoas:         null,
    abertaPorNome:         null,
    comandas: [
      { nome: 'Cláudio', itens: [item1] },
      { nome: 'Ana',     itens: [item2] },
    ],
  };

  it('começa com o comando de inicializar e termina com o de cortar o papel', () => {
    const t = texto(montarTicketEnvio(base));
    expect(t.startsWith(`${ESC}@`)).toBe(true);
    expect(t.endsWith(`${GS}V\x00`)).toBe(true);
  });

  it('imprime o nome de cada comanda antes dos itens dela, na ordem', () => {
    const t = texto(montarTicketEnvio(base));
    const posClaudio = t.indexOf('Cláudio');
    const posItem1    = t.indexOf('4x Baião de Carne de Sol');
    const posAna      = t.indexOf('Ana');
    const posItem2    = t.indexOf('1x Refrigerante');
    expect(posClaudio).toBeGreaterThan(-1);
    expect(posItem1).toBeGreaterThan(posClaudio);
    expect(posAna).toBeGreaterThan(posItem1);
    expect(posItem2).toBeGreaterThan(posAna);
  });

  it('mostra só "Mesa 7" no cabeçalho, sem nome de comanda junto (diferente do modo rodada)', () => {
    const t = texto(montarTicketEnvio(base));
    expect(t).toContain('Mesa 7\n');
    expect(t).not.toContain('Mesa 7 ·');
  });
});
