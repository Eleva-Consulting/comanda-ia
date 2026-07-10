export interface DadosPixEstatico {
  chavePix: string;
  nomeBeneficiario: string;
  cidade: string;
  valor: number;
  txid: string;
}

function tlv(id: string, valor: string): string {
  const tamanho = valor.length.toString().padStart(2, '0');
  return `${id}${tamanho}${valor}`;
}

const REGEX_MARCAS_DIACRITICAS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizarTexto(texto: string, tamanhoMaximo: number): string {
  return texto
    .normalize('NFD')
    .replace(REGEX_MARCAS_DIACRITICAS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, tamanhoMaximo);
}

function calcularCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function gerarPayloadPix(dados: DadosPixEstatico): string {
  const nome = normalizarTexto(dados.nomeBeneficiario, 25);
  const cidade = normalizarTexto(dados.cidade, 15);
  const txid = dados.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  const merchantAccountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', dados.chavePix);

  const payloadSemCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', dados.valor.toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', nome) +
    tlv('60', cidade) +
    tlv('62', tlv('05', txid)) +
    '6304';

  return payloadSemCrc + calcularCRC16(payloadSemCrc);
}
