import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database.js';

// ============================================================================
// MODULE AUGMENTATION — define o payload do JWT
// ============================================================================

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      estabelecimentoId: string | null; // null para SUPER_ADMIN
      role: 'SUPER_ADMIN' | 'DONO' | 'OPERADOR';
      permissoes: string[];
      setorId: string | null;
    };
    user: {
      userId: string;
      estabelecimentoId: string | null;
      role: 'SUPER_ADMIN' | 'DONO' | 'OPERADOR';
      permissoes: string[];
      setorId: string | null;
    };
  }
}

// ============================================================================
// MIDDLEWARES
// ============================================================================

/**
 * Valida o JWT. Em caso de sucesso, popula request.user com o payload.
 * Usado em todas as rotas autenticadas.
 */
export async function autenticar(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ erro: 'Token inválido ou ausente' });
  }
}

/**
 * Garante que o usuário autenticado é SUPER_ADMIN.
 * Deve ser usado APÓS o hook autenticar.
 * Rotas do painel admin nunca são acessíveis por DONO ou OPERADOR.
 */
export async function apenasAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.user.role !== 'SUPER_ADMIN') {
    return reply.status(403).send({ erro: 'Acesso restrito à plataforma' });
  }
}

/**
 * Garante que o usuário autenticado é DONO.
 * Deve ser usado APÓS o hook autenticar.
 * Bloqueia OPERADOR (e SUPER_ADMIN) de rotas de escrita do tenant.
 */
export async function apenasDono(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.user.role !== 'DONO') {
    return reply.status(403).send({ erro: 'Acesso negado' });
  }
}

/**
 * Garante que o usuário autenticado é DONO ou OPERADOR com a permissão informada.
 * Deve ser usado APÓS o hook autenticar.
 * Passar mais de uma permissão libera o acesso se o usuário tiver QUALQUER uma delas.
 */
export function temPermissao(...permissoes: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (request.user.role === 'DONO') return;
    if (permissoes.some((p) => request.user.permissoes.includes(p))) return;
    return reply.status(403).send({ erro: 'Você não tem permissão para acessar este recurso' });
  };
}

/**
 * Garante que o estabelecimento do usuário autenticado tem pelo menos um dos
 * módulos informados habilitado em `modulosAtivos`. Ao contrário de
 * `temPermissao`, NÃO libera o DONO automaticamente — é uma checagem sobre o plano
 * contratado pelo estabelecimento, não sobre o papel do usuário dentro dele.
 * Deve ser usado APÓS o hook autenticar.
 */
export function moduloAtivo(...modulos: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const { estabelecimentoId } = request.user;
    if (!estabelecimentoId) {
      return reply.status(403).send({ erro: 'Acesso negado' });
    }

    const estabelecimento = await prisma.estabelecimento.findUnique({
      where:  { id: estabelecimentoId },
      select: { modulosAtivos: true },
    });

    if (!estabelecimento || !modulos.some((m) => estabelecimento.modulosAtivos.includes(m))) {
      return reply.status(403).send({ erro: 'Módulo não habilitado para este estabelecimento' });
    }
  };
}
