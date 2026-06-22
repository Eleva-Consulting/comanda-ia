import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { prisma } from '../database.js';
import { enviarEmail, templates } from '../mailer.js';
import { gerarSlugUnico } from '../utils/slug.js';

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

const EsqueciSenhaSchema = Type.Object({
  email: Type.String({ format: 'email' }),
});

const RedefinirSenhaSchema = Type.Object({
  token:     Type.String({ minLength: 1 }),
  novaSenha: Type.String({ minLength: 8, maxLength: 100 }),
});

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
      userId:            usuario.id,
      estabelecimentoId: usuario.estabelecimentoId,
      role:              usuario.role,
      permissoes:        usuario.role === 'OPERADOR' ? usuario.permissoes : [],
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

  // ── POST /auth/esqueci-senha ─────────────────────────────────────────────────
  fastify.post('/auth/esqueci-senha', {
    schema: { body: EsqueciSenhaSchema },
  }, async (request) => {
    const { email } = request.body as { email: string };

    const usuario = await prisma.usuario.findUnique({ where: { email } });

    // Resposta idêntica seja o email cadastrado ou não — não vaza informação
    const resposta = { mensagem: 'Se este email estiver cadastrado, você receberá as instruções em instantes.' };

    if (!usuario) return resposta;

    const token = randomUUID();
    const expiracao = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { resetToken: token, resetTokenExpiracao: expiracao },
    });

    const urlFrontend = (process.env.FRONTEND_URL?.split(',')[0]?.trim()) ?? 'http://localhost:5173';
    const urlRedefinicao = `${urlFrontend}/redefinir-senha?token=${token}`;

    enviarEmail({
      to:      usuario.email,
      subject: 'Redefinição de senha — Comanda IA',
      html:    templates.resetSenha(usuario.nome, urlRedefinicao),
    }).catch((err) => fastify.log.error({ err }, 'Falha ao enviar email de reset'));

    return resposta;
  });

  // ── POST /auth/redefinir-senha ───────────────────────────────────────────────
  fastify.post('/auth/redefinir-senha', {
    schema: { body: RedefinirSenhaSchema },
  }, async (request, reply) => {
    const { token, novaSenha } = request.body as { token: string; novaSenha: string };

    const usuario = await prisma.usuario.findUnique({
      where: { resetToken: token },
    });

    if (!usuario || !usuario.resetTokenExpiracao || usuario.resetTokenExpiracao < new Date()) {
      return reply.status(400).send({ erro: 'Link inválido ou expirado. Solicite um novo.' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 12);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash, resetToken: null, resetTokenExpiracao: null },
    });

    return { mensagem: 'Senha redefinida com sucesso' };
  });
}
