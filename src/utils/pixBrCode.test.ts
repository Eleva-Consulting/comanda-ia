import { describe, it, expect } from 'vitest';
import { gerarPayloadPix } from './pixBrCode.js';

// Parser TLV mínimo, só para os testes — confirma que o payload gerado é
// estruturalmente válido lendo ele de volta, em vez de comparar com um valor
// mágico decorado (nenhuma fonte externa foi usada pra gerar um "gabarito").
function parsearTlv(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let pos = 0;
  while (pos < payload.length) {
    const id = payload.slice(pos, pos + 2);
    const tamanho = Number(payload.slice(pos + 2, pos + 4));
    const valor = payload.slice(pos + 4, pos + 4 + tamanho);
    campos[id] = valor;
    pos += 4 + tamanho;
  }
  return campos;
}

function calcularCRC16ParaTeste(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

describe('gerarPayloadPix', () => {
  const dadosBase = {
    chavePix: 'contato@pizzariadobairro.com.br',
    nomeBeneficiario: 'Pizzaria do Bairro',
    cidade: 'São Paulo',
    valor: 38,
    txid: 'b93f8f82-b236-45b4-9def-ae457dbe39ba',
  };

  it('gera um payload cuja estrutura TLV é internamente consistente', () => {
    const payload = gerarPayloadPix(dadosBase);
    const campos = parsearTlv(payload.slice(0, -4)); // tudo exceto os 4 dígitos do CRC

    expect(campos['00']).toBe('01'); // payload format indicator
    expect(campos['52']).toBe('0000'); // merchant category code
    expect(campos['53']).toBe('986'); // moeda BRL
    expect(campos['54']).toBe('38.00'); // valor
    expect(campos['58']).toBe('BR'); // país
    expect(campos['59']).toBe('PIZZARIA DO BAIRRO'); // nome normalizado
    expect(campos['60']).toBe('SAO PAULO'); // cidade normalizada (sem acento)
  });

  it('o campo 26 (merchant account information) contém o GUI do Pix e a chave', () => {
    const payload = gerarPayloadPix(dadosBase);
    const campos = parsearTlv(payload.slice(0, -4));
    const subcampos = parsearTlv(campos['26']);

    expect(subcampos['00']).toBe('br.gov.bcb.pix');
    expect(subcampos['01']).toBe('contato@pizzariadobairro.com.br');
  });

  it('o campo 62 (dados adicionais) contém o txid sanitizado (só alfanumérico, até 25 chars)', () => {
    const payload = gerarPayloadPix(dadosBase);
    const campos = parsearTlv(payload.slice(0, -4));
    const subcampos = parsearTlv(campos['62']);

    expect(subcampos['05']).toBe('b93f8f82b23645b49defae457dbe39ba'.slice(0, 25));
  });

  it('o CRC16 nos últimos 4 caracteres bate com o recalculado sobre o restante do payload', () => {
    const payload = gerarPayloadPix(dadosBase);
    const semCrc = payload.slice(0, -4);
    const crcInformado = payload.slice(-4);

    // `semCrc` já termina com o literal "6304" (ID 63 + tamanho 04, o cabeçalho
    // do próprio campo do CRC) emitido pela implementação — o CRC16 é calculado
    // sobre o payload até e incluindo esse cabeçalho, excluindo só o valor do
    // CRC em si. Concatenar '6304' de novo aqui duplicaria esse trecho.
    expect(crcInformado).toBe(calcularCRC16ParaTeste(semCrc));
  });

  it('trunca nome do beneficiário em 25 caracteres e cidade em 15', () => {
    const payload = gerarPayloadPix({
      ...dadosBase,
      nomeBeneficiario: 'Um Nome de Estabelecimento Bem Comprido Demais',
      cidade: 'Uma Cidade Com Nome Bem Longo',
    });
    const campos = parsearTlv(payload.slice(0, -4));

    expect(campos['59'].length).toBeLessThanOrEqual(25);
    expect(campos['60'].length).toBeLessThanOrEqual(15);
  });

  it('formata valores com centavos corretamente', () => {
    const payload = gerarPayloadPix({ ...dadosBase, valor: 12.5 });
    const campos = parsearTlv(payload.slice(0, -4));

    expect(campos['54']).toBe('12.50');
  });

  it('normaliza acentos no nome do beneficiário também, não só na cidade', () => {
    const payload = gerarPayloadPix({ ...dadosBase, nomeBeneficiario: 'João da Silva Restaurante' });
    const campos = parsearTlv(payload.slice(0, -4));

    expect(campos['59']).toBe('JOAO DA SILVA RESTAURANTE');
  });

  it('usa "***" como txid quando o valor sanitizado fica vazio', () => {
    const payload = gerarPayloadPix({ ...dadosBase, txid: '!!!---###' });
    const campos = parsearTlv(payload.slice(0, -4));
    const subcampos = parsearTlv(campos['62']);

    expect(subcampos['05']).toBe('***');
  });

  it('lança erro quando a chave Pix é longa demais para o campo 26 (TLV > 99 caracteres)', () => {
    const chavePixLonga = 'a'.repeat(82);

    expect(() => gerarPayloadPix({ ...dadosBase, chavePix: chavePixLonga })).toThrow();
  });
});
