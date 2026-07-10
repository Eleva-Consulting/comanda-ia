import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { montarUrlAutorizacao, trocarCodePorToken, criarPagamentoPix, buscarPagamento } from './mercadopago.js';

beforeAll(() => {
  process.env.MP_CLIENT_ID = 'client-123';
  process.env.MP_CLIENT_SECRET = 'secret-456';
  process.env.MP_REDIRECT_URI = 'https://api.comanda-ia.dev/mercadopago/callback';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('montarUrlAutorizacao', () => {
  it('inclui client_id, redirect_uri e state', () => {
    const url = montarUrlAutorizacao('estado-teste');
    expect(url).toMatch(/^https:\/\/auth\.mercadopago\.com\.br\/authorization\?/);
    expect(url).toMatch(/client_id=client-123/);
    expect(url).toMatch(/state=estado-teste/);
  });
});

describe('trocarCodePorToken', () => {
  it('retorna tokens a partir da resposta da API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token:  'access-abc',
      refresh_token: 'refresh-xyz',
      user_id:       999,
      expires_in:    15552000,
    }), { status: 200 })));

    const tokens = await trocarCodePorToken('code-123');
    expect(tokens.accessToken).toBe('access-abc');
    expect(tokens.refreshToken).toBe('refresh-xyz');
    expect(tokens.userId).toBe('999');
    expect(tokens.expiraEm).toBeInstanceOf(Date);
  });
});

describe('criarPagamentoPix', () => {
  it('retorna id, qrCode e qrCodeBase64', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 555,
      point_of_interaction: {
        transaction_data: { qr_code: '000201copiaecola', qr_code_base64: 'aGVsbG8=' },
      },
    }), { status: 201 })));

    const pagamento = await criarPagamentoPix({
      accessToken:       'token-abc',
      valor:             49.9,
      descricao:         'Pedido #123',
      externalReference: 'pedido-123',
      payerEmail:        'cliente@comanda-ia.dev',
    });
    expect(pagamento.id).toBe('555');
    expect(pagamento.qrCode).toBe('000201copiaecola');
    expect(pagamento.qrCodeBase64).toBe('aGVsbG8=');
  });

  it('lança erro quando a API responde com falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('erro', { status: 400 })));
    await expect(criarPagamentoPix({
      accessToken: 'token-abc', valor: 10, descricao: 'x',
      externalReference: 'y', payerEmail: 'a@b.com',
    })).rejects.toThrow();
  });
});

describe('buscarPagamento', () => {
  it('retorna status e external_reference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'approved', external_reference: 'pedido-123',
    }), { status: 200 })));

    const resultado = await buscarPagamento('token-abc', '555');
    expect(resultado.status).toBe('approved');
    expect(resultado.externalReference).toBe('pedido-123');
  });
});
