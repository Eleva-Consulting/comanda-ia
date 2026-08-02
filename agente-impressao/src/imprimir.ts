import net from 'node:net';

const PORTA_PADRAO = 9100;
const TIMEOUT_MS = 8000;

// Manda o ticket (bytes ESC/POS já prontos, ver ../../src/utils/escPosTicket.ts) direto pra
// impressora via socket TCP cru — mesma técnica validada na Tanca TP-650 real (2026-08-01).
// `enderecoIp` aceita "IP" (assume porta 9100, padrão ESC/POS raw) ou "IP:porta".
export function enviarParaImpressora(enderecoIp: string, ticket: Buffer): Promise<void> {
  const [host, portaStr] = enderecoIp.split(':');
  const porta = portaStr ? Number(portaStr) : PORTA_PADRAO;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: porta }, () => {
      socket.write(ticket, () => socket.end());
    });

    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error(`Timeout ao conectar em ${enderecoIp}`));
    });

    socket.on('error', reject);
    socket.on('close', () => resolve());
  });
}
