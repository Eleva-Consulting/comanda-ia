import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';

const SALT_ROUNDS = 12;

// ============================================================================
// SCHEMAS
// ============================================================================

const SignupSchema = Type.Object({
  estabelecimento: Type.Object({
    nome: Type.String({ minLength: 2, maxLength: 100 }),
    telefone: Type.String({ minLength: 8, maxLength: 20 }),
  }),
  dono: Type.Object({
    nome: Type.String({ minLength: 2, maxLength: 100 }),
    email: Type.String({
      minLength: 5,
      maxLength: 200,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    }),
    senha: Type.String({ minLength: 8, maxLength: 100 }),
  }),
});

const LoginSchema = Type.Object({
  email: Type.String({
    minLength: 5,
    maxLength: 200,
    pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  }),
  senha: Type.String({ minLength: 1, maxLength: 100 }),
});

// ============================================================================
// ROTAS
// ============================================================================

export async function authRoutes(fastify: FastifyInstance) {
  // --------------------------------------------------------------------------
  // POST /auth/signup
  // Cria estabelecimento + usuário DONO em uma operação atômica
  // --------------------------------------------------------------------------
  fastify.post('/auth/signup', {
    schema: { body: SignupSchema },
  }, async (request, reply) => {
    const { estabelecimento, dono } = request.body as {
      estabelecimento: { nome: string; telefone: string };
      dono: { nome: string; email: string; senha: string };
    };

    const senhaHash = await bcrypt.hash(dono.senha, SALT_ROUNDS);

    try {
      const resultado = await prisma.estabelecimento.create({
        data: {
          nome: estabelecimento.nome,
          telefone: estabelecimento.telefone,
          usuarios: {
            create: {
              nome: dono.nome,
              email: dono.email,
              senhaHash,
              role: 'DONO',
            },
          },
        },
        include: {
          usuarios: true,
        },
      });

      // Remove o hash da resposta — nunca expor senha (mesmo hasheada)
      const usuarioCriado = resultado.usuarios[0];
      const { senhaHash: _, ...usuarioSeguro } = usuarioCriado;

      return reply.status(201).send({
        estabelecimento: {
          id: resultado.id,
          nome: resultado.nome,
          telefone: resultado.telefone,
          ativo: resultado.ativo,
          criadoEm: resultado.criadoEm,
        },
        usuario: usuarioSeguro,
      });
    } catch (erro: any) {
      if (erro.code === 'P2002') {
        return reply.status(409).send({ erro: 'Email já cadastrado' });
      }
      throw erro;
    }
  });

  // --------------------------------------------------------------------------
  // POST /auth/login
  // Verifica credenciais e devolve um JWT
  // --------------------------------------------------------------------------
  fastify.post('/auth/login', {
    schema: { body: LoginSchema },
  }, async (request, reply) => {
    const { email, senha } = request.body as { email: string; senha: string };

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    // Mensagem genérica de propósito — evita user enumeration
    if (!usuario) {
      return reply.status(401).send({ erro: 'Credenciais inválidas' });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);

    if (!senhaCorreta) {
      return reply.status(401).send({ erro: 'Credenciais inválidas' });
    }

    const token = fastify.jwt.sign({
      userId: usuario.id,
      estabelecimentoId: usuario.estabelecimentoId,
      role: usuario.role,
    });

    return reply.send({
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        role: usuario.role,
      },
    });
  });
}