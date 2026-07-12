// Brasil não observa horário de verão desde 2019 — offset fixo é seguro sem
// precisar de biblioteca de timezone.
const OFFSET_BRASIL = '-03:00';

/** Dia-calendário (YYYY-MM-DD) de uma data, no fuso de Brasília — nunca use
 *  `Date.toISOString().slice(0,10)` pra isso (agrupa pelo dia em UTC, que pode
 *  já estar "amanhã" perto da meia-noite em Brasília). */
export function diaSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(data);
}

/** Resolve um período de relatório a partir de datas opcionais (YYYY-MM-DD).
 *  Sem parâmetros, usa o dia de hoje (em Brasília) como início e fim. */
export function resolverIntervaloPeriodo(inicioStr?: string, fimStr?: string): {
  inicioUTC: Date;
  fimUTC: Date;
  inicioLabel: string;
  fimLabel: string;
} {
  const hoje = diaSaoPaulo(new Date());
  const inicioLabel = inicioStr ?? hoje;
  const fimLabel = fimStr ?? hoje;

  const inicioUTC = new Date(`${inicioLabel}T00:00:00${OFFSET_BRASIL}`);
  const fimUTC    = new Date(`${fimLabel}T23:59:59.999${OFFSET_BRASIL}`);

  return { inicioUTC, fimUTC, inicioLabel, fimLabel };
}
