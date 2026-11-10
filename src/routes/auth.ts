import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { prisma } from '../database.js';
import { enviarEmail, templates } from '../mailer.js';

// Rate limit por CONTA visada (email), não por IP — combate os dois problemas do
// limite por IP num endpoint de login/reset: (1) várias pessoas atrás do mesmo IP
// compartilhado (ex: Wi-Fi único do restaurante) não são bloqueadas por causa de UMA
// conta sofrendo ataque; (2) o atacante não consegue contornar o limite só trocando de
// IP — a chave persegue a conta específica, não a origem da requisição. Cai pra IP só
// Usa hook `preHandler` (roda depois da validação do schema da rota) — o email já chega
// validado; o fallback pra IP é só defensivo, não deveria disparar na prática.
function chavePorEmailDoCorpo(request: FastifyRequest): string {
  const email = (request.body as { email?: string } | undefined)?.email;
  return email ? `conta:${email.toLowerCase()}` : request.ip;
}

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
  // Cadastro público desativado — novos estabelecimentos são liberados pelo WhatsApp / Super Admin
  fastify.post('/auth/signup', async (_request, reply) => {
    return reply.status(403).send({
      erro: 'O cadastro público foi desativado. Solicite acesso através do nosso WhatsApp: (16) 99230-1119',
    });
  });

  // ── POST /auth/login ─────────────────────────────────────────────────────
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes', hook: 'preHandler', keyGenerator: chavePorEmailDoCorpo } },
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
      setorId:           usuario.setorId,
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
    config: { rateLimit: { max: 3, timeWindow: '15 minutes', hook: 'preHandler', keyGenerator: chavePorEmailDoCorpo } },
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
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
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
