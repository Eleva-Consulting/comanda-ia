import { describe, it, expect, vi } from 'vitest';
import { temPermissao, moduloAtivo } from './auth.js';

vi.mock('../database.js', () => ({
  prisma: {
    estabelecimento: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../database.js';

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
