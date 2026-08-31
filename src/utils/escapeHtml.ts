const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa os 5 caracteres especiais de HTML — usar antes de interpolar qualquer dado de
 *  entrada de usuário nos templates de email (`src/mailer.ts`), que são strings cruas sem
 *  o escape automático que o JSX já dá de graça no frontend. */
export function escapeHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (char) => ENTIDADES[char]);
}
