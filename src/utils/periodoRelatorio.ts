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

interface PedidoParaVendas {
  criadoEm: Date;
  total:    number;
}

/** Agrupa pedidos por dia-calendário (Brasília) e devolve tanto a série completa quanto os 5
 *  dias de maior faturamento, ordenados do maior pro menor. */
export function calcularVendasPorDia(pedidos: PedidoParaVendas[]): {
  vendasPorDia: Array<{ data: string; pedidos: number; faturamento: number }>;
  topDias:      Array<{ data: string; faturamento: number }>;
} {
  const porDiaMap = pedidos.reduce<Record<string, { data: string; pedidos: number; faturamento: number }>>(
    (acc, p) => {
      const dia = diaSaoPaulo(p.criadoEm);
      const anterior = acc[dia] ?? { data: dia, pedidos: 0, faturamento: 0 };
      return {
        ...acc,
        [dia]: {
          ...anterior,
          pedidos:     anterior.pedidos + 1,
          faturamento: anterior.faturamento + p.total,
        },
      };
    },
    {},
  );

  const vendasPorDia = Object.values(porDiaMap).sort((a, b) => a.data.localeCompare(b.data));
  const topDias = [...vendasPorDia]
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 5)
    .map((d) => ({ data: d.data, faturamento: d.faturamento }));

  return { vendasPorDia, topDias };
}
