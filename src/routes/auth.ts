import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';

const SignupSchema = Type.Object({
  nomeEstabelecimento: Type.String({ minLength: 2, maxLength: 100 }),
  telefoneEstabelecimento: Type.String({ minLength: 8, maxLength: 20 }),
  nome: Type.String({ minLength: 2, maxLength: 100 }),
  email: Type.String({ format: 'email' }),
  senha: Type.String({ minLength: 8, maxLength: 100 }),
});

const LoginSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  senha: Type.String(),
});

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function gerarSlugUnico(base: string): Promise<string> {
  const slugBase = slugify(base);
  let candidato = slugBase;
  let tentativa = 1;

  while (true) {
    const existente = await prisma.estabelecimento.findUnique({
      where: { slug: candidato },
    });
    if (!existente) return candidato;
    tentativa++;
    candidato = `${slugBase}-${tentativa}`;
  }
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/signup', {
    schema: { body: SignupSchema },
  }, async (request, reply) => {
    const dados = request.body as {
      nomeEstabelecimento: string;
      telefoneEstabelecimento: string;
      nome: string;
      email: string;
      senha: string;
    };

    const emailExistente = await prisma.usuario.findUnique({
      where: { email: dados.email },
    });
    if (emailExistente) {
      return reply.status(409).send({ erro: 'Email já cadastrado' });
    }

    const slug = await gerarSlugUnico(dados.nomeEstabelecimento);
    const senhaHash = await bcrypt.hash(dados.senha, 12);

    const resultado = await prisma.estabelecimento.create({
      data: {
        nome: dados.nomeEstabelecimento,
        telefone: dados.telefoneEstabelecimento,
        slug,
        usuarios: {
          create: {
            nome: dados.nome,
            email: dados.email,
            senhaHash,
            role: 'DONO',
          },
        },
      },
      include: { usuarios: true },
    });

    const usuarioCriado = resultado.usuarios[0];

    const token = fastify.jwt.sign({
      userId: usuarioCriado.id,
      estabelecimentoId: resultado.id,
      role: usuarioCriado.role,
    });

    return reply.status(201).send({
      token,
      usuario: {
        id: usuarioCriado.id,
        nome: usuarioCriado.nome,
        email: usuarioCriado.email,
        role: usuarioCriado.role,
      },
      estabelecimento: {
        id: resultado.id,
        nome: resultado.nome,
        slug: resultado.slug,
      },
    });
  });

  fastify.post('/auth/login', {
    schema: { body: LoginSchema },
  }, async (request, reply) => {
    const { email, senha } = request.body as { email: string; senha: string };

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

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

    return {
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
      },
    };
  });
}