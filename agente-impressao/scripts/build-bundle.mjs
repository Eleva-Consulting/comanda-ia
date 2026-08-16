// Gera um único arquivo CJS com todo o código do agente (incluindo o import cross-pacote de
// ../../src/utils/escPosTicket.ts) — entrada pro Node SEA na Task 4. Formato CJS por escolha
// deliberada: suporte a ESM em Single Executable Applications ainda é experimental no Node 22,
// CJS é o caminho documentado e estável.
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-bundle', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle:      true,
  platform:    'node',
  target:      'node22',
  format:      'cjs',
  outfile:     'dist-bundle/agente.cjs',
  banner:      { js: '// Bundle gerado por `npm run build:bundle` — não editar diretamente.' },
});

console.log('[build] bundle gerado em dist-bundle/agente.cjs');
