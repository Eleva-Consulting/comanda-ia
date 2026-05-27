import { FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// MODULE AUGMENTATION — define o payload do JWT
// ============================================================================

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      estabelecimentoId: string;
      role: 'DONO' | 'OPERADOR';
    };
    user: {
      userId: string;
      estabelecimentoId: string;
      role: 'DONO' | 'OPERADOR';
    };
  }
}

// ============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================================================

/**
 * Hook onRequest que valida o JWT. Em caso de sucesso, popula request.user
 * com o payload. Em caso de falha, responde 401 e interrompe o pipeline.
 */
export async function autenticar(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // request.jwtVerify() faz tudo:
    // 1. Lê o header Authorization
    // 2. Extrai o "Bearer <token>"
    // 3. Verifica a assinatura usando JWT_SECRET
    // 4. Verifica se não expirou
    // 5. Popula request.user com o payload
    await request.jwtVerify();
  } catch (erro) {
    return reply.status(401).send({ erro: 'Token inválido ou ausente' });
  }
}