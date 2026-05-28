// ============================================================================
// TIPOS DE DOMÍNIO
// ============================================================================

export interface MensagemIA {
  papel: 'cliente' | 'assistente';
  conteudo: string;
}

export interface ContextoEstabelecimento {
  nome: string;
  cardapio: Array<{
    nome: string;
    descricao: string | null;
    preco: number;
  }>;
}

// Um item dentro de um pedido que a IA quer registrar
export interface ItemPedidoIA {
  nomeItem: string;
  quantidade: number;
  precoUnit: number;
}

// Quando a IA decide fechar um pedido, devolve isto (a "ação")
export interface PedidoParaRegistrar {
  clienteNome: string;
  enderecoEntrega?: string;
  itens: ItemPedidoIA[];
  total: number;
}

export interface RespostaIA {
  texto: string;
  pedidoParaRegistrar?: PedidoParaRegistrar; // opcional — só quando fecha pedido
}

// ============================================================================
// O CONTRATO
// ============================================================================

export interface ProvedorIA {
  responder(
    mensagens: MensagemIA[],
    contexto: ContextoEstabelecimento
  ): Promise<RespostaIA>;
}