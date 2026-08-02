import 'dotenv/config';
import { io } from 'socket.io-client';
import { montarTicketEnvio } from '../../src/utils/escPosTicket.js';
import { agruparPorSetorEImpressora, type ComandaComItens, type SetorComImpressora } from './agrupamento.js';
import { enviarParaImpressora } from './imprimir.js';

// Lê de um arquivo `.env` na pasta do agente (mais fácil de configurar em qualquer sistema,
// principalmente Windows) — ou de variável de ambiente de verdade, se preferir. Ver
// `.env.example` pro formato esperado.
const BACKEND_URL        = process.env.BACKEND_URL ?? 'https://comanda-ia-production.up.railway.app';
const ESTABELECIMENTO_ID = process.env.ESTABELECIMENTO_ID;
const DEVICE_TOKEN       = process.env.DEVICE_TOKEN;

if (!ESTABELECIMENTO_ID || !DEVICE_TOKEN) {
  console.error('[agente] defina ESTABELECIMENTO_ID e DEVICE_TOKEN no arquivo .env (copie .env.example pra .env e preencha) — gere o token em Configurações → Agente de impressão local, no painel do restaurante.');
  process.exit(1);
}

const headersAgente = {
  'x-device-token':       DEVICE_TOKEN,
  'x-estabelecimento-id': ESTABELECIMENTO_ID,
} as const;

const RECARREGAR_CONTEXTO_MS = 5 * 60 * 1000; // pega impressora nova cadastrada em Configurações sem precisar reiniciar
const ATRASO_ANTES_DE_BUSCAR_MS = 300; // o envio de rascunho emite 1 evento por item — espera todos chegarem antes de buscar a rodada completa

let estabelecimentoNome = '';
let setoresCache: SetorComImpressora[] = [];

async function carregarContexto(): Promise<void> {
  const [estResp, setoresResp] = await Promise.all([
    fetch(`${BACKEND_URL}/meu-estabelecimento`, { headers: headersAgente }),
    fetch(`${BACKEND_URL}/setores`, { headers: headersAgente }),
  ]);
  if (!estResp.ok || !setoresResp.ok) throw new Error(`Falha ao carregar estabelecimento/setores (${estResp.status}/${setoresResp.status})`);

  estabelecimentoNome = (await estResp.json()).nome;
  setoresCache = await setoresResp.json();
  const comImpressora = setoresCache.filter((s) => s.impressoraIp).length;
  console.log(`[agente] contexto carregado — "${estabelecimentoNome}" — ${comImpressora} setor(es) com impressora configurada`);
}

interface RodadaOuEnvioApi {
  mesaNumero:    string | null;
  criadaEm:      string;
  numeroPessoas: number | null;
  abertaPorNome: string | null;
  comandaNome?:  string;
  itens?:        ComandaComItens['itens'];
  comandas?:     ComandaComItens[];
}

const rodadasProcessadas = new Set<string>();

async function processarRodada(rodadaId: string, envioId: string | null): Promise<void> {
  try {
    const url = envioId ? `${BACKEND_URL}/rodadas/envio/${envioId}` : `${BACKEND_URL}/rodadas/${rodadaId}`;
    const resp = await fetch(url, { headers: headersAgente });
    if (!resp.ok) { console.error(`[agente] falha ao buscar ${url}: ${resp.status}`); return; }
    const dados: RodadaOuEnvioApi = await resp.json();

    const comandas: ComandaComItens[] = dados.comandas ?? [{ nome: dados.comandaNome ?? '', itens: dados.itens ?? [] }];
    const grupos = agruparPorSetorEImpressora(comandas, setoresCache);

    if (grupos.length === 0) {
      console.log(`[agente] rodada ${rodadaId} sem item vinculado a setor com impressora configurada — nada impresso`);
      return;
    }

    for (const grupo of grupos) {
      const ticket = montarTicketEnvio({
        estabelecimentoNome,
        mesaNumero:    dados.mesaNumero,
        criadaEm:      new Date(dados.criadaEm),
        numeroPessoas: dados.numeroPessoas,
        abertaPorNome: dados.abertaPorNome,
        comandas:      grupo.comandas,
        setorDestino:  grupo.setorNome,
      });
      try {
        await enviarParaImpressora(grupo.impressoraIp, ticket);
        console.log(`[agente] impresso — setor ${grupo.setorId} (${grupo.impressoraIp})`);
      } catch (err) {
        console.error(`[agente] falha ao imprimir no setor ${grupo.setorId} (${grupo.impressoraIp}):`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error(`[agente] erro processando rodada ${rodadaId}:`, (err as Error).message);
  }
}

function aoReceberItemNovo(item: { rodadaId: string | null; envioId: string | null }): void {
  if (!item.rodadaId) return; // item lançado direto no Caixa, sem passar por rodada — não imprime aqui (já é o comportamento hoje)
  const chave = item.envioId ?? item.rodadaId;
  if (rodadasProcessadas.has(chave)) return;
  rodadasProcessadas.add(chave);
  setTimeout(() => processarRodada(item.rodadaId!, item.envioId), ATRASO_ANTES_DE_BUSCAR_MS);
}

async function main(): Promise<void> {
  await carregarContexto();

  const socket = io(BACKEND_URL, {
    auth:       { tipoConexao: 'agente-impressao', estabelecimentoId: ESTABELECIMENTO_ID, deviceToken: DEVICE_TOKEN },
    transports: ['websocket'],
  });

  socket.on('connect',       () => console.log('[agente] conectado ao backend'));
  socket.on('connect_error', (err) => console.error('[agente] erro de conexão:', err.message));
  socket.on('disconnect',    () => console.log('[agente] desconectado — tentando reconectar automaticamente...'));
  socket.on('producao:item-novo', aoReceberItemNovo);

  setInterval(() => {
    carregarContexto().catch((err) => console.error('[agente] falha ao recarregar contexto:', (err as Error).message));
  }, RECARREGAR_CONTEXTO_MS);
}

main().catch((err) => {
  console.error('[agente] erro fatal ao iniciar:', (err as Error).message);
  process.exit(1);
});
