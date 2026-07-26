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

interface PagamentoParaMesa {
  valor: number;
  mesaNumero: string | null;
}

/** Agrupa pagamentos confirmados do módulo de Mesas por número de mesa, somando tudo que foi
 *  vendido nela no período — mesmo critério de "venda" já usado no resto do Financeiro (soma
 *  pagamento confirmado, não espera a conta fechar). Uma mesa usada por clientes diferentes no
 *  mesmo período soma tudo junto numa linha só. Ordenado do maior pro menor faturamento. */
export function agruparPorMesa(pagamentos: PagamentoParaMesa[]): Array<{ mesaNumero: string; quantidade: number; total: number }> {
  const porMesaMap = pagamentos.reduce<Record<string, { mesaNumero: string; quantidade: number; total: number }>>(
    (acc, p) => {
      const mesaNumero = p.mesaNumero ?? 'Sem mesa';
      const anterior = acc[mesaNumero] ?? { mesaNumero, quantidade: 0, total: 0 };
      return {
        ...acc,
        [mesaNumero]: {
          ...anterior,
          quantidade: anterior.quantidade + 1,
          total:      anterior.total + p.valor,
        },
      };
    },
    {},
  );

  return Object.values(porMesaMap).sort((a, b) => b.total - a.total);
}

interface ItemParaRanking {
  nomeItem:   string;
  quantidade: number;
}

/** Ranking dos itens mais e menos vendidos no período, por quantidade (unidades), somando as
 *  duas origens (Pedido balcão/delivery/link + ItemComanda do módulo de Mesas) — agrupado por
 *  nomeItem (nem todo item tem itemCardapioId, ex.: ItemPedido nunca tem). "Menos vendidos" só
 *  ranqueia entre itens que tiveram pelo menos 1 unidade vendida — nunca inclui item do
 *  cardápio com zero venda no período. */
export function agruparMaisEMenosVendidos(itens: ItemParaRanking[], limite = 5): {
  maisVendidos:  Array<{ nomeItem: string; quantidade: number }>;
  menosVendidos: Array<{ nomeItem: string; quantidade: number }>;
} {
  const porItemMap = itens.reduce<Record<string, number>>((acc, i) => {
    acc[i.nomeItem] = (acc[i.nomeItem] ?? 0) + i.quantidade;
    return acc;
  }, {});
  const lista = Object.entries(porItemMap).map(([nomeItem, quantidade]) => ({ nomeItem, quantidade }));

  const maisVendidos  = [...lista].sort((a, b) => b.quantidade - a.quantidade).slice(0, limite);
  const menosVendidos = [...lista].sort((a, b) => a.quantidade - b.quantidade).slice(0, limite);

  return { maisVendidos, menosVendidos };
}
