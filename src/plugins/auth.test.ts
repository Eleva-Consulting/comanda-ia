import { describe, it, expect, vi, beforeEach } from 'vitest';
import { temPermissao, moduloAtivo, autenticar } from './auth.js';

vi.mock('../database.js', () => ({
  prisma: {
    estabelecimento: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn() },
}));

import { prisma } from '../database.js';
import bcrypt from 'bcrypt';

beforeEach(() => {
  vi.clearAllMocks();
});

function criarRequestFake(role: string, permissoes: string[]) {
  return { user: { role, permissoes, estabelecimentoId: 'test-id' } } as unknown as Parameters<ReturnType<typeof temPermissao>>[0];
}

function criarReplyFake() {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as unknown as Parameters<ReturnType<typeof temPermissao>>[1] & {
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

function criarAutenticarRequestFake(headers: Record<string, string> = {}, jwtVerify = vi.fn().mockResolvedValue(undefined)) {
  return { headers, jwtVerify, user: undefined } as unknown as Parameters<typeof autenticar>[0] & {
    headers: Record<string, string>;
    jwtVerify: ReturnType<typeof vi.fn>;
    user?: { userId: string; estabelecimentoId: string | null; role: string; permissoes: string[]; setorId: string | null };
  };
}

describe('autenticar — agente de impressão local (device token)', () => {
  it('autentica com x-device-token + x-estabelecimento-id válidos, populando role DONO', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ tokenAgenteImpressao: 'hash-salvo' } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const request = criarAutenticarRequestFake({ 'x-device-token': 'token-certo', 'x-estabelecimento-id': 'estab-1' });
    const reply = criarReplyFake();

    await autenticar(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.jwtVerify).not.toHaveBeenCalled();
    expect(request.user).toEqual({ userId: 'agente-impressao', estabelecimentoId: 'estab-1', role: 'DONO', permissoes: [], setorId: null });
  });

  it('bloqueia com 401 quando o token não bate', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ tokenAgenteImpressao: 'hash-salvo' } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const request = criarAutenticarRequestFake({ 'x-device-token': 'token-errado', 'x-estabelecimento-id': 'estab-1' });
    const reply = criarReplyFake();

    await autenticar(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('bloqueia com 401 quando o estabelecimento não tem token de agente configurado', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ tokenAgenteImpressao: null } as any);

    const request = criarAutenticarRequestFake({ 'x-device-token': 'qualquer', 'x-estabelecimento-id': 'estab-1' });
    const reply = criarReplyFake();

    await autenticar(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('sem os headers de device token, cai pro fluxo normal de JWT', async () => {
    const jwtVerify = vi.fn().mockResolvedValue(undefined);
    const request = criarAutenticarRequestFake({}, jwtVerify);
    const reply = criarReplyFake();

    await autenticar(request, reply);

    expect(jwtVerify).toHaveBeenCalled();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('bloqueia com 401 quando o JWT é inválido', async () => {
    const jwtVerify = vi.fn().mockRejectedValue(new Error('inválido'));
    const request = criarAutenticarRequestFake({}, jwtVerify);
    const reply = criarReplyFake();

    await autenticar(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });
});

describe('temPermissao', () => {
  it('libera DONO mesmo sem a permissão explícita na lista', async () => {
    const middleware = temPermissao('mesas');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('libera OPERADOR que tem a permissão "mesas"', async () => {
    const middleware = temPermissao('mesas');
    const request = criarRequestFake('OPERADOR', ['mesas']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('bloqueia OPERADOR sem a permissão "caixa" com 403', async () => {
    const middleware = temPermissao('caixa');
    const request = criarRequestFake('OPERADOR', ['mesas']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      erro: 'Você não tem permissão para acessar este recurso',
    });
  });

  it('libera OPERADOR que tem QUALQUER uma das permissões informadas', async () => {
    const middleware = temPermissao('mesas', 'caixa');
    const request = criarRequestFake('OPERADOR', ['caixa']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});

describe('moduloAtivo', () => {
  it('libera quando o estabelecimento tem o módulo ativo', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: ['mesas'] } as any);
    const middleware = moduloAtivo('mesas');
    const request = criarRequestFake('OPERADOR', ['mesas']);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('bloqueia com 403 quando o módulo não está ativo', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: [] } as any);
    const middleware = moduloAtivo('mesas');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ erro: 'Módulo não habilitado para este estabelecimento' });
  });

  it('NÃO libera o DONO automaticamente — módulo é sobre o estabelecimento, não sobre o papel do usuário', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: [] } as any);
    const middleware = moduloAtivo('mesas');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('libera quando o estabelecimento tem QUALQUER um dos módulos informados', async () => {
    vi.mocked(prisma.estabelecimento.findUnique).mockResolvedValue({ modulosAtivos: ['estoque_avancado'] } as any);
    const middleware = moduloAtivo('mesas', 'estoque_avancado');
    const request = criarRequestFake('DONO', []);
    const reply = criarReplyFake();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});
