// Monta o ticket de comanda em comandos ESC/POS crus, prontos pra mandar direto pra uma
// impressora térmica de rede (porta 9100), sem precisar de driver/navegador — a mesma
// impressora testada nesta iniciativa (Tanca TP-650) já confirmou aceitar esses comandos.
// Mantém em paralelo o mesmo conteúdo que ImprimirRodada.tsx/ImprimirEnvio.tsx renderizam
// em HTML pra impressão via navegador (esse arquivo NÃO substitui aqueles — o modelo de
// impressão por computador em quiosque continua existindo até o agente local ser construído).
//
// Validado na impressora real (Tanca TP-650, 2026-08-01): code page n=16 (WPC1252/
// Windows-1252) é a que interpreta certo os acentos em português — testada contra as
// outras (incluindo n=3/PC860, o "óbvio" pela tabela padrão Epson, que saiu errado).
// Com WPC1252 selecionada, o texto codificado como 'latin1' bate byte a byte (Latin-1 e
// Windows-1252 são idênticos na faixa dos acentos usados aqui).

const ESC = '\x1b';
const GS  = '\x1d';

const INICIALIZAR       = `${ESC}@`;
const CODE_PAGE_WPC1252 = `${ESC}t\x10`;
const CORTE_PAPEL       = `${GS}V\x00`;
const ALINHAR_ESQUERDA = `${ESC}a\x00`;
const ALINHAR_CENTRO   = `${ESC}a\x01`;
const MODO_NORMAL         = `${ESC}!\x00`;
const MODO_NEGRITO        = `${ESC}!\x08`;
const MODO_TITULO         = `${ESC}!\x38`; // negrito + altura dupla + largura dupla

const LARGURA_LINHA = 42; // caracteres por linha em fonte normal, 80mm — mesmo padrão do node-thermal-printer

// Distância física entre a cabeça de impressão e a guilhotina — sem esse avanço, o corte
// acontece antes do fim do texto sair pra fora, obrigando a abrir a impressora pra pegar o
// ticket. 8 linhas em branco validado na impressora real (Tanca TP-650, 2026-08-01).
const AVANCO_ANTES_DO_CORTE = '\n'.repeat(8);

const linhaSeparadora = '-'.repeat(LARGURA_LINHA) + '\n';

export interface ItemTicket {
  quantidade:     number;
  nomeItem:       string;
  observacao:     string | null;
  acompanhamento: string | null;
}

export interface DadosTicketRodada {
  estabelecimentoNome: string;
  mesaNumero:           string | null;
  comandaNome:          string;
  criadaEm:             Date;
  numeroPessoas:        number | null;
  abertaPorNome:        string | null;
  itens:                ItemTicket[];
}

export interface ComandaEnvio {
  nome:  string;
  itens: ItemTicket[];
}

export interface DadosTicketEnvio {
  estabelecimentoNome: string;
  mesaNumero:           string | null;
  criadaEm:             Date;
  numeroPessoas:        number | null;
  abertaPorNome:        string | null;
  comandas:             ComandaEnvio[];
}

function formatarDataHora(data: Date): string {
  const dataStr = data.toLocaleDateString('pt-BR');
  const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dataStr} ${horaStr}`;
}

function linhaItem(item: ItemTicket): string {
  let saida = MODO_NORMAL + `${item.quantidade}x ${item.nomeItem}\n`;
  if (item.acompanhamento) saida += `  Acompanhamento: ${item.acompanhamento}\n`;
  if (item.observacao)     saida += `  obs: ${item.observacao}\n`;
  return saida;
}

function cabecalho(params: {
  estabelecimentoNome: string;
  mesaNumero:           string | null;
  subtitulo:            string;
  criadaEm:             Date;
  numeroPessoas:        number | null;
  abertaPorNome:        string | null;
}): string {
  let saida = ALINHAR_CENTRO;
  saida += MODO_TITULO + `${params.estabelecimentoNome}\n`;
  saida += MODO_NORMAL + linhaSeparadora;
  saida += MODO_NEGRITO + `${params.mesaNumero ? `Mesa ${params.mesaNumero}` : 'Sem mesa'}${params.subtitulo}\n`;
  saida += MODO_NORMAL + `${formatarDataHora(params.criadaEm)}\n`;
  if (params.numeroPessoas)  saida += `Pessoas na mesa: ${params.numeroPessoas}\n`;
  if (params.abertaPorNome)  saida += `Aberta por: ${params.abertaPorNome}\n`;
  saida += linhaSeparadora;
  saida += ALINHAR_ESQUERDA;
  return saida;
}

export function montarTicketRodada(dados: DadosTicketRodada): Buffer {
  let texto = INICIALIZAR + CODE_PAGE_WPC1252;
  texto += cabecalho({
    estabelecimentoNome: dados.estabelecimentoNome,
    mesaNumero:           dados.mesaNumero,
    subtitulo:            ` · ${dados.comandaNome}`,
    criadaEm:             dados.criadaEm,
    numeroPessoas:        dados.numeroPessoas,
    abertaPorNome:        dados.abertaPorNome,
  });
  for (const item of dados.itens) texto += linhaItem(item);
  texto += AVANCO_ANTES_DO_CORTE + CORTE_PAPEL;
  return Buffer.from(texto, 'latin1');
}

export function montarTicketEnvio(dados: DadosTicketEnvio): Buffer {
  let texto = INICIALIZAR + CODE_PAGE_WPC1252;
  texto += cabecalho({
    estabelecimentoNome: dados.estabelecimentoNome,
    mesaNumero:           dados.mesaNumero,
    subtitulo:            '',
    criadaEm:             dados.criadaEm,
    numeroPessoas:        dados.numeroPessoas,
    abertaPorNome:        dados.abertaPorNome,
  });
  for (const comanda of dados.comandas) {
    texto += MODO_NEGRITO + `${comanda.nome}\n` + MODO_NORMAL;
    for (const item of comanda.itens) texto += linhaItem(item);
  }
  texto += AVANCO_ANTES_DO_CORTE + CORTE_PAPEL;
  return Buffer.from(texto, 'latin1');
}
