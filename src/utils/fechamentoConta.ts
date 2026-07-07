export interface ItemParaResumo {
  id: string;
  nomeItem: string;
  precoUnit: number | string;
  quantidade: number;
  status: string;
}

export interface ComandaParaResumo {
  id: string;
  nome: string;
  itens: ItemParaResumo[];
}

export interface PagamentoItemParaResumo {
  itemComandaId: string;
}

export interface PagamentoParaResumo {
  id: string;
  valor: number | string;
  status: string;
  formaPagamento: string;
  criadoEm: Date;
  itens: PagamentoItemParaResumo[];
}

export interface ContaParaResumo {
  descontoValor: number | string | null;
  comandas: ComandaParaResumo[];
  pagamentos: PagamentoParaResumo[];
}

export interface ItemDeResumo {
  id: string;
  nomeItem: string;
  precoUnit: number;
  quantidade: number;
  status: string;
  total: number;
  pago: boolean;
}

export interface ComandaDeResumo {
  comandaId: string;
  nome: string;
  itens: ItemDeResumo[];
  totalNaoPago: number;
}

export interface PagamentoDeResumo {
  id: string;
  valor: number;
  status: string;
  formaPagamento: string;
  criadoEm: Date;
  itensComandaIds: string[];
}

export interface ResumoConta {
  totalConta: number;
  descontoValor: number;
  totalPago: number;
  saldoDevedor: number;
  podeFechar: boolean;
  porComanda: ComandaDeResumo[];
  pagamentos: PagamentoDeResumo[];
}

function paraCentavos(valor: number | string): number {
  return Math.round(Number(valor) * 100);
}

export function calcularResumoConta(conta: ContaParaResumo): ResumoConta {
  const itensPagosIds = new Set<string>();
  for (const pagamento of conta.pagamentos) {
    if (pagamento.status !== 'confirmado') continue;
    for (const item of pagamento.itens) itensPagosIds.add(item.itemComandaId);
  }

  let totalContaCentavos = 0;
  const porComanda: ComandaDeResumo[] = conta.comandas.map((comanda) => {
    let totalNaoPagoCentavos = 0;
    const itens: ItemDeResumo[] = comanda.itens.map((item) => {
      const totalItemCentavos = item.status === 'cancelado'
        ? 0
        : paraCentavos(item.precoUnit) * item.quantidade;
      totalContaCentavos += totalItemCentavos;
      const pago = itensPagosIds.has(item.id);
      if (!pago) totalNaoPagoCentavos += totalItemCentavos;
      return {
        id: item.id,
        nomeItem: item.nomeItem,
        precoUnit: Number(item.precoUnit),
        quantidade: item.quantidade,
        status: item.status,
        total: totalItemCentavos / 100,
        pago,
      };
    });
    return { comandaId: comanda.id, nome: comanda.nome, itens, totalNaoPago: totalNaoPagoCentavos / 100 };
  });

  const totalPagoCentavos = conta.pagamentos
    .filter((p) => p.status === 'confirmado')
    .reduce((soma, p) => soma + paraCentavos(p.valor), 0);

  const descontoCentavos = conta.descontoValor ? paraCentavos(conta.descontoValor) : 0;
  const saldoDevedorCentavos = totalContaCentavos - descontoCentavos - totalPagoCentavos;

  return {
    totalConta: totalContaCentavos / 100,
    descontoValor: descontoCentavos / 100,
    totalPago: totalPagoCentavos / 100,
    saldoDevedor: saldoDevedorCentavos / 100,
    podeFechar: saldoDevedorCentavos <= 0,
    porComanda,
    pagamentos: conta.pagamentos.map((p) => ({
      id: p.id,
      valor: Number(p.valor),
      status: p.status,
      formaPagamento: p.formaPagamento,
      criadoEm: p.criadoEm,
      itensComandaIds: p.itens.map((i) => i.itemComandaId),
    })),
  };
}

export function validarItensParaPagamento(
  resumo: ResumoConta,
  itensComandaIds: string[]
): { valor: number; erro?: string } {
  const todosItens = resumo.porComanda.flatMap((c) => c.itens);
  let totalCentavos = 0;
  for (const id of itensComandaIds) {
    const item = todosItens.find((i) => i.id === id);
    if (!item) return { valor: 0, erro: `Item ${id} não encontrado nesta conta` };
    if (item.status === 'cancelado') return { valor: 0, erro: `Item ${id} está cancelado` };
    if (item.pago) return { valor: 0, erro: `Item ${id} já foi pago` };
    totalCentavos += Math.round(item.total * 100);
  }
  return { valor: totalCentavos / 100 };
}
