import nodemailer from 'nodemailer';

function obterTransporte(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const remetente = () => process.env.SMTP_FROM ?? 'Comanda IA <noreply@comanda-ia.dev>';

/** Fire-and-forget seguro: não lança exceção se SMTP não estiver configurado. */
export async function enviarEmail(opts: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<void> {
  const transporte = obterTransporte();
  if (!transporte) return;
  await transporte.sendMail({ from: remetente(), ...opts });
}

export const templates = {
  cadastroPendente(nome: string, nomeEstabelecimento: string): string {
    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#18181b">
        <h2 style="color:#f97316">Cadastro recebido! 🎉</h2>
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>
          O estabelecimento <strong>${nomeEstabelecimento}</strong> foi cadastrado com sucesso
          e está <strong>aguardando aprovação</strong> da plataforma.
        </p>
        <p>Você receberá um email assim que o acesso for liberado.</p>
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
