/**
 * Suíte inteira: frontend e backend, SEMPRE os dois, falhando se qualquer um
 * falhar. É o que `npm run test:all` chama.
 *
 * Por que não `npm run test && npm run test:backend`: com o `&&`, uma falha no
 * frontend (inclusive de ambiente, como worker que não sobe com a máquina
 * carregada, visto em 04/11/2026) fazia o backend nem rodar, e o resultado
 * dizia menos do que parecia. Em Node, e não em sintaxe de shell, para rodar
 * igual no Linux, no CI e no Windows.
 */
const { spawnSync } = require('child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const metades = [
  { nome: 'frontend', script: 'test' },
  { nome: 'backend', script: 'test:backend' },
];

const resultados = metades.map(({ nome, script }) => {
  const r = spawnSync(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
  return { nome, ok: r.status === 0 };
});

console.log('\n=== suíte inteira ===');
for (const { nome, ok } of resultados) console.log(`${nome.padEnd(9)} ${ok ? 'ok' : 'FALHOU'}`);
process.exit(resultados.every(r => r.ok) ? 0 : 1);
