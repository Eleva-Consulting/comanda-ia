const formaPagamentoLabel: Record<string, string> = {
  pix:            'PIX',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito:  'Cartão de débito',
};

interface ItemResumo {
  nomeItem:   string;
  quantidade: number;
  precoUnit:  number;
}

interface MontarResumoParams {
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
  chavePix:             string | null;
}

/** Monta a mensagem de confirmação de pedido enviada ao cliente pelo WhatsApp. */
export function montarResumoWhatsApp(p: MontarResumoParams): string {
  const itensTxt = p.itens.map((i) => `• ${i.quantidade}x ${i.nomeItem} — R$ ${(i.precoUnit * i.quantidade).toFixed(2)}`).join('\n');

  const linhas = [
    `✅ *Pedido recebido, ${p.clienteNome}!*`,
    '',
    `🍽️ *${p.nomeEstabelecimento}*`,
    '',
    itensTxt,
  ];

  if (p.taxaEntrega > 0) {
    linhas.push('', `Subtotal: R$ ${p.subtotal.toFixed(2)}`, `Taxa de entrega${p.bairroNome ? ` (${p.bairroNome})` : ''}: R$ ${p.taxaEntrega.toFixed(2)}`);
  }

  linhas.push('', `*Total: R$ ${p.total.toFixed(2)}*`);

  linhas.push('', p.tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏪 Retirada no local');
  if (p.tipoEntrega === 'entrega' && p.enderecoEntrega) {
    linhas.push(`Endereço: ${p.enderecoEntrega}`);
  }

  linhas.push('', `Pagamento: ${formaPagamentoLabel[p.formaPagamento] ?? p.formaPagamento}`);
  if (p.formaPagamento === 'dinheiro' && p.precisaTroco && p.trocoPara) {
    linhas.push(`Troco para R$ ${p.trocoPara.toFixed(2)} (leva R$ ${(p.trocoPara - p.total).toFixed(2)} de troco)`);
  }

  if (p.formaPagamento === 'pix' && p.chavePix) {
    linhas.push('', `💸 Chave PIX: *${p.chavePix}*`, 'Envie o comprovante aqui neste WhatsApp para confirmarmos seu pedido na hora! 😊');
  }

  return linhas.join('\n');
}
