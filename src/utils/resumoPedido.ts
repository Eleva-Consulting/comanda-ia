const formaPagamentoLabel: Record<string, string> = {
  pix:            'Pix',
  pix_maquininha: 'Pix (maquininha)',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito:  'Cartão de débito',
};

const formaPagamentoEmoji: Record<string, string> = {
  pix:            '💸',
  pix_maquininha: '💸',
  dinheiro:       '💵',
  cartao_credito: '💳',
  cartao_debito:  '💳',
};

// Estimativa fixa de tempo de entrega — ajuste aqui se quiser outro intervalo.
const TEMPO_ENTREGA_MIN_MINUTOS = 40;
const TEMPO_ENTREGA_MAX_MINUTOS = 60;

interface ItemResumo {
  nomeItem:   string;
  quantidade: number;
  precoUnit:  number;
}

interface MontarResumoParams {
  pedidoId:            string;
  nomeEstabelecimento: string;
  clienteNome:         string;
  itens:               ItemResumo[];
  subtotal:             number;
  taxaEntrega:          number;
  bairroNome:           string | null;
  enderecoEntrega:      string | null;
  tipoEntrega:          'entrega' | 'retirada';
  formaPagamento:       string;
  precisaTroco:         boolean;
  trocoPara:            number | null;
  total:                number;
}

function formatarHora(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour:     '2-digit',
    minute:   '2-digit',
  }).format(data);
}

function formatarMoeda(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
}

/** Monta a mensagem de confirmação de pedido enviada ao cliente pelo WhatsApp. */
export function montarResumoWhatsApp(p: MontarResumoParams): string {
  const codigoPedido = p.pedidoId.slice(0, 8);

  const itensTxt = p.itens
    .map((i, idx) => `\`\`\`${idx === 0 ? '➡ ' : '-'}${i.quantidade}x ${i.nomeItem}\`\`\``)
    .join('\n');

  const linhas = [
    `Olá *${p.clienteNome}*, aqui é o atendente virtual do *${p.nomeEstabelecimento}*`,
    'Vim te avisar que seu pedido foi *recebido com sucesso* e a cozinha já foi avisada!',
    '',
    'Fique tranquilo(a) que vou enviar as atualizações do status do seu pedido por aqui. 😄',
    '',
    `Nº do pedido *${codigoPedido}*`,
    '',
    '*Itens:*',
    itensTxt,
  ];

  if (p.taxaEntrega > 0) {
    linhas.push('', `Subtotal: R$ ${formatarMoeda(p.subtotal)}`, `Taxa de entrega${p.bairroNome ? ` (${p.bairroNome})` : ''}: R$ ${formatarMoeda(p.taxaEntrega)}`);
  }

  const emoji = formaPagamentoEmoji[p.formaPagamento] ?? '💰';
  linhas.push('', `${emoji} *${formaPagamentoLabel[p.formaPagamento] ?? p.formaPagamento}*`);
  if (p.formaPagamento === 'dinheiro' && p.precisaTroco && p.trocoPara) {
    linhas.push(`Troco para R$ ${formatarMoeda(p.trocoPara)} (leva R$ ${formatarMoeda(p.trocoPara - p.total)} de troco)`);
  }

  if (p.tipoEntrega === 'entrega') {
    const agora  = new Date();
    const inicio = new Date(agora.getTime() + TEMPO_ENTREGA_MIN_MINUTOS * 60_000);
    const fim    = new Date(agora.getTime() + TEMPO_ENTREGA_MAX_MINUTOS * 60_000);
    linhas.push('', `🕢 Tempo de entrega: *${TEMPO_ENTREGA_MIN_MINUTOS} - ${TEMPO_ENTREGA_MAX_MINUTOS}min* (entre ${formatarHora(inicio)} e ${formatarHora(fim)})`);
    if (p.enderecoEntrega) {
      linhas.push(`🛵 Local de entrega: ${p.enderecoEntrega}`);
    }
  } else {
    linhas.push('', '🏪 Retirada no local');
  }

  linhas.push('', `Total do pedido: *R$ ${formatarMoeda(p.total)}*`);

  return linhas.join('\n');
}
