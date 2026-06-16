import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { enviarEmail, templates } from '../mailer.js';

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
    const existente = await prisma.estabelecimento.findUnique({ where: { slug: candidato } });
    if (!existente) return candidato;
    tentativa++;
    candidato = `${slugBase}-${tentativa}`;
  }
}

export async function authRoutes(fastify: FastifyInstance) {
  // ── POST /auth/signup ────────────────────────────────────────────────────
  // Cria estabelecimento com status 'pendente' — aguarda aprovação do Super Admin
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

    const emailExistente = await prisma.usuario.findUnique({ where: { email: dados.email } });
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
        status: 'pendente', // aguarda aprovação do Super Admin
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

    // Notifica o novo DONO — fire-and-forget
    const dono = resultado.usuarios[0];
    enviarEmail({
      to:      dono.email,
      subject: `Cadastro recebido — ${resultado.nome}`,
      html:    templates.cadastroPendente(dono.nome, resultado.nome),
    }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de cadastro'));

    return reply.status(201).send({
      mensagem: 'Cadastro realizado! Aguarde a aprovação da plataforma para acessar o sistema.',
      estabelecimento: {
        nome: resultado.nome,
        slug: resultado.slug,
        status: resultado.status,
      },
    });
  });

  // ── POST /auth/login ─────────────────────────────────────────────────────
  fastify.post('/auth/login', {
    schema: { body: LoginSchema },
  }, async (request, reply) => {
    const { email, senha } = request.body as { email: string; senha: string };

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { estabelecimento: true },
    });

    if (!usuario) {
      return reply.status(401).send({ erro: 'Credenciais inválidas' });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaCorreta) {
      return reply.status(401).send({ erro: 'Credenciais inválidas' });
    }

    // Bloqueia login se o estabelecimento estiver pendente ou suspenso
    // (SUPER_ADMIN não tem estabelecimento — passa direto)
    if (usuario.estabelecimento && usuario.estabelecimento.status !== 'ativo') {
      const mensagens: Record<string, string> = {
        pendente:  'Seu cadastro ainda está aguardando aprovação da plataforma.',
        suspenso:  'Seu estabelecimento foi suspenso. Entre em contato com o suporte.',
      };
      return reply.status(403).send({
        erro: mensagens[usuario.estabelecimento.status] ?? 'Acesso bloqueado',
        status: usuario.estabelecimento.status,
      });
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
