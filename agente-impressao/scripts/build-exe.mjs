// Gera o executável único (Node SEA) a partir do bundle da Task 3. Roda em qualquer plataforma
// (macOS/Linux/Windows) — produz um binário nativo da plataforma onde é executado, seguindo o
// fluxo oficial documentado em https://nodejs.org/api/single-executable-applications.html.
// O .exe distribuído pro restaurante (Windows) precisa ser gerado rodando este script NUM
// WINDOWS de verdade — um binário gerado aqui no Mac não roda lá (ver Task 4 do plano).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { platform } from 'node:process';

const NOME_SAIDA = 'comanda-ia-agente-impressao' + (platform === 'win32' ? '.exe' : '');
const CAMINHO_SAIDA = `dist/${NOME_SAIDA}`;
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function rodar(cmd, args) {
  console.log(`[build:exe] ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

if (!existsSync('dist-bundle/agente.cjs')) {
  console.error('[build:exe] dist-bundle/agente.cjs não existe — rode "npm run build:bundle" antes.');
  process.exit(1);
}

mkdirSync('dist', { recursive: true });

// 1. Gera o blob SEA a partir do bundle (sea-config.json aponta pro bundle e pro blob de saída).
rodar(process.execPath, ['--experimental-sea-config', 'sea-config.json']);

// 2. Copia o binário do Node atual como base do executável.
copyFileSync(process.execPath, CAMINHO_SAIDA);

if (platform === 'darwin') {
  // macOS exige remover a assinatura do node.exe copiado antes de injetar o blob.
  rodar('codesign', ['--remove-signature', CAMINHO_SAIDA]);
}

// 3. Injeta o blob no binário copiado via postject (ferramenta oficial recomendada pelo Node).
const argsPostject = [
  'postject',
  CAMINHO_SAIDA,
  'NODE_SEA_BLOB',
  'dist-bundle/sea-prep.blob',
  '--sentinel-fuse',
  SENTINEL_FUSE,
];
if (platform === 'darwin') {
  argsPostject.push('--macho-segment-name', 'NODE_SEA');
}
rodar('npx', argsPostject);

if (platform === 'darwin') {
  // Reassina ad-hoc — sem isso o macOS recusa rodar o binário depois da injeção.
  rodar('codesign', ['--sign', '-', CAMINHO_SAIDA]);
}

console.log(`[build:exe] executável gerado em ${CAMINHO_SAIDA}`);
if (platform !== 'win32') {
  console.warn(
    '[build:exe] AVISO: binário gerado para a plataforma atual (' +
      platform +
      '), não Windows. ' +
      'Pra distribuir pro restaurante, rode este mesmo script numa máquina Windows real.',
  );
}
