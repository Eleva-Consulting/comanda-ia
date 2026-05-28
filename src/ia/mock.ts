import {
  ProvedorIA,
  MensagemIA,
  ContextoEstabelecimento,
  RespostaIA,
} from './provedor.js';

export class MockProvedorIA implements ProvedorIA {
  async responder(
    mensagens: MensagemIA[],
    contexto: ContextoEstabelecimento
  ): Promise<RespostaIA> {
    const ultima = mensagens[mensagens.length - 1];
    const texto = ultima.conteudo.toLowerCase();

    // Saudação
    if (
      texto.includes('oi') ||
      texto.includes('olá') ||
      texto.includes('ola') ||
      texto.includes('bom dia') ||
      texto.includes('boa tarde') ||
      texto.includes('boa noite')
    ) {
      return {
        texto: `Olá! Bem-vindo ao ${contexto.nome}. Posso te mostrar o cardápio ou anotar seu pedido. Como posso ajudar?`,
      };
    }

    // Cardápio
    if (
      texto.includes('cardapio') ||
      texto.includes('cardápio') ||
      texto.includes('menu')
    ) {
      if (contexto.cardapio.length === 0) {
        return { texto: 'O cardápio ainda não tem itens cadastrados.' };
      }
      const lista = contexto.cardapio
        .map((item) => `• ${item.nome} — R$ ${item.preco.toFixed(2)}`)
        .join('\n');
      return { texto: `Cardápio do ${contexto.nome}:\n${lista}` };
    }

    // Fechar pedido (SIMULAÇÃO — pega o primeiro item do cardápio como exemplo)
    if (
      texto.includes('fechar') ||
      texto.includes('finalizar') ||
      texto.includes('confirmar')
    ) {
      if (contexto.cardapio.length === 0) {
        return { texto: 'Não há itens no cardápio para pedir.' };
      }
      const item = contexto.cardapio[0];
      const quantidade = 1;
      const total = item.preco * quantidade;

      return {
        texto: `Pedido confirmado! ${quantidade}x ${item.nome}. Total: R$ ${total.toFixed(
          2
        )}. (Pedido simulado pelo mock.)`,
        pedidoParaRegistrar: {
          clienteNome: 'Cliente (mock)',
          itens: [
            {
              nomeItem: item.nome,
              quantidade,
              precoUnit: item.preco,
            },
          ],
          total,
        },
      };
    }

    // Resposta padrão (eco)
    return {
      texto: `Recebi: "${ultima.conteudo}". (Resposta simulada — o cérebro real do Claude entra dia 10.)`,
    };
  }
}