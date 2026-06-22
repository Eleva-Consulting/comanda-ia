import { Resend } from 'resend';

const remetente = process.env.SMTP_FROM ?? 'Comanda IA <onboarding@resend.dev>';

function obterCliente(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[mailer] RESEND_API_KEY não configurado — emails desativados');
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

/** Fire-and-forget seguro: não lança exceção se Resend não estiver configurado. */
export async function enviarEmail(opts: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<void> {
  const resend = obterCliente();
  if (!resend) return;

  const { error } = await resend.emails.send({
    from:    remetente,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  });

  if (error) {
    console.error('[mailer] Falha ao enviar email para', opts.to, '—', error);
    throw error;
  }

  console.info('[mailer] Email enviado para', opts.to, '—', opts.subject);
}

export const templates = {
  cadastroPendente(nome: string, nomeEstabelecimento: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header laranja -->
        <tr>
          <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:36px 40px;text-align:center">
            <div style="display:inline-flex;align-items:center;gap:10px">
              <span style="font-size:28px">🍽️</span>
              <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px">Comanda IA</span>
            </div>
            <p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:13px">Plataforma de pedidos para food service</p>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:40px 40px 32px">
            <h1 style="margin:0 0 8px;font-size:22px;color:#18181b">Bem-vindo(a), ${nome}! 🎉</h1>
            <p style="margin:0 0 24px;color:#52525b;font-size:15px;line-height:1.6">
              O cadastro do <strong style="color:#18181b">${nomeEstabelecimento}</strong> foi recebido com sucesso.
              Nossa equipe irá revisar e aprovar o seu acesso em breve.
            </p>

            <!-- Status box -->
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;margin-bottom:32px">
              <p style="margin:0;font-size:14px;color:#9a3412">
                ⏳ <strong>Cadastro em análise</strong> — Você receberá um email assim que o acesso for liberado.
              </p>
            </div>

            <!-- O que você vai poder fazer -->
            <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#18181b">Com a Comanda IA você vai:</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;vertical-align:top;width:36px;font-size:18px">📋</td>
                <td style="padding:10px 0 10px 12px;border-bottom:1px solid #f4f4f5;vertical-align:top">
                  <span style="font-size:14px;font-weight:600;color:#18181b;display:block">Montar seu cardápio digital</span>
                  <span style="font-size:13px;color:#71717a">Cadastre pratos, preços e fotos em minutos</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;vertical-align:top;font-size:18px">📲</td>
                <td style="padding:10px 0 10px 12px;border-bottom:1px solid #f4f4f5;vertical-align:top">
                  <span style="font-size:14px;font-weight:600;color:#18181b;display:block">Compartilhar o link por WhatsApp</span>
                  <span style="font-size:13px;color:#71717a">Seus clientes pedem direto pelo celular, sem app</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;vertical-align:top;font-size:18px">👨‍🍳</td>
                <td style="padding:10px 0 10px 12px;vertical-align:top">
                  <span style="font-size:14px;font-weight:600;color:#18181b;display:block">Gerenciar pedidos em tempo real</span>
                  <span style="font-size:13px;color:#71717a">A cozinha recebe tudo na hora, sem confusão</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f4f4f5;text-align:center">
            <p style="margin:0;font-size:12px;color:#a1a1aa">
              Comanda IA · <a href="https://comanda.cloud" style="color:#f97316;text-decoration:none">comanda.cloud</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `;
  },

  definirSenha(nome: string, nomeEstabelecimento: string, urlDefinicao: string): string {
    return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#18181b">
      <h2 style="color:#f97316">Bem-vindo(a) à Comanda IA! 🎉</h2>
      <p>Olá, <strong>${nome}</strong>!</p>
      <p>
        O estabelecimento <strong>${nomeEstabelecimento}</strong> foi criado e já está ativo na plataforma.
        Para acessar o painel, defina sua senha clicando no botão abaixo.
      </p>
      <p>O link expira em <strong>7 dias</strong>.</p>
      <p>
        <a href="${urlDefinicao}"
           style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
          Definir minha senha →
        </a>
      </p>
      <p style="color:#71717a;font-size:13px">Se você não esperava este email, ignore-o com segurança.</p>
      <p style="color:#a1a1aa;font-size:12px;margin-top:32px">Comanda IA — Plataforma de pedidos para food service</p>
    </div>
  `;
  },

  resetSenha(nome: string, urlRedefinicao: string): string {
    return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#18181b">
      <h2 style="color:#f97316">Redefinição de senha</h2>
      <p>Olá, <strong>${nome}</strong>!</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta na Comanda IA.</p>
      <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
      <p>
        <a href="${urlRedefinicao}"
           style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
          Redefinir senha →
        </a>
      </p>
      <p style="color:#71717a;font-size:13px">Se você não solicitou a redefinição, ignore este email com segurança.</p>
      <p style="color:#a1a1aa;font-size:12px;margin-top:32px">Comanda IA — Plataforma de pedidos para food service</p>
    </div>
  `;
  },

  cadastroAprovado(nome: string, nomeEstabelecimento: string, urlFrontend: string): string {
    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#18181b">
        <h2 style="color:#22c55e">Estabelecimento aprovado! ✅</h2>
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>
          Ótima notícia: <strong>${nomeEstabelecimento}</strong> foi aprovado
          e já está <strong>ativo</strong> na plataforma.
        </p>
        <p>
          <a href="${urlFrontend}/login"
             style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
            Acessar o painel →
          </a>
        </p>
        <p style="color:#a1a1aa;font-size:12px;margin-top:32px">Comanda IA — Plataforma de pedidos para food service</p>
      </div>
    `;
  },

  novoPedido(params: {
    nomeEstabelecimento: string;
    clienteNome: string;
    itens: Array<{ nomeItem: string; quantidade: number; precoUnit: number }>;
    total: number;
    urlFrontend: string;
  }): string {
    const linhasItens = params.itens
      .map(
        (i) => `
          <tr>
            <td style="padding:7px 10px;border-bottom:1px solid #e4e4e7">${i.nomeItem}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e4e4e7;text-align:center">${i.quantidade}x</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e4e4e7;text-align:right">R$ ${(i.precoUnit * i.quantidade).toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#18181b">
        <h2 style="color:#f97316;margin-bottom:4px">Novo pedido! 🔔</h2>
        <p style="color:#71717a;margin:0 0 16px">${params.nomeEstabelecimento}</p>
        <p><strong>${params.clienteNome}</strong> acabou de fazer um pedido.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f4f4f5">
              <th style="padding:8px 10px;text-align:left;font-weight:600">Item</th>
              <th style="padding:8px 10px;text-align:center;font-weight:600">Qtd</th>
              <th style="padding:8px 10px;text-align:right;font-weight:600">Subtotal</th>
            </tr>
          </thead>
          <tbody>${linhasItens}</tbody>
          <tfoot>
            <tr style="background:#fff7ed">
              <td colspan="2" style="padding:10px;font-weight:700">Total</td>
              <td style="padding:10px;font-weight:700;text-align:right;color:#f97316">R$ ${params.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <a href="${params.urlFrontend}/cozinha"
           style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
          Ver na cozinha →
        </a>
        <p style="color:#a1a1aa;font-size:12px;margin-top:32px">Comanda IA — Plataforma de pedidos para food service</p>
      </div>
    `;
  },
};
