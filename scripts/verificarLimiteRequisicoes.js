/**
 * Confere, de fora, se o limite de requisições conta por PESSOA.
 *
 * Por que existe: em 04/11/2026, seis requisições seguidas do mesmo IPv4 a
 * /api/settings/public devolveram `x-ratelimit-remaining` 298, 295, 298, 298,
 * 297, 297. O contador tem de cair de um em um para o mesmo cliente; subir e
 * descer quer dizer que a chave do limitador NÃO é o IP de quem chama. As duas
 * causas possíveis moram fora do código:
 *
 * - o nginx entre o Cloudflare e o Node não restaura o IP real
 *   (`real_ip_header CF-Connecting-IP`), e com `trust proxy 1` (server.js:77)
 *   o `req.ip` vira o IP da borda do Cloudflare. Cada requisição cai no balde
 *   de uma borda, dividido com todo mundo que passa por ela;
 * - há mais de um processo do app, cada um com seu contador em memória
 *   (server.js:188-199 não define `store`).
 *
 * Numa campanha, o primeiro caso faz o limite global (300 a cada 15 min) e o
 * de login (5 a cada 10 min) estourarem para centenas de pessoas ao mesmo
 * tempo. Ver docs/verificacao-de-bugs-2026-11-04.md, item 1.
 *
 * Não precisa de segredo. Gasta N requisições do balde de quem roda (padrão 8,
 * de um limite de 300):
 *
 *   node scripts/verificarLimiteRequisicoes.js
 *   node scripts/verificarLimiteRequisicoes.js --url https://www.lorflux.com/api/settings/public --n 8
 *
 * Sai com 1 se o contador não cair de um em um.
 */
const URL_PADRAO = 'https://www.lorflux.com/api/settings/public';

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? null : process.argv[i + 1];
}

/**
 * Julga a sequência de `remaining`. Uma volta ao topo (janela nova do
 * limitador) é aceita uma vez; qualquer outra subida, ou queda diferente de
 * um, é o defeito.
 */
function julgarSequencia(valores, limite) {
  const problemas = [];
  let reinicios = 0;
  for (let i = 1; i < valores.length; i++) {
    const antes = valores[i - 1];
    const agora = valores[i];
    if (agora === antes - 1) continue;
    if (agora === limite - 1 && reinicios === 0) { reinicios++; continue; }
    problemas.push(`requisição ${i + 1}: ${antes} -> ${agora}`);
  }
  return { ok: problemas.length === 0, problemas };
}

async function main() {
  const url = arg('url') || URL_PADRAO;
  const n = Number.parseInt(arg('n') || '8', 10);
  const valores = [];
  let limite = null;

  for (let i = 0; i < n; i++) {
    const resp = await fetch(url, { headers: { 'user-agent': 'lorflux-verificador-limite' } });
    const resto = resp.headers.get('x-ratelimit-remaining') ?? resp.headers.get('ratelimit-remaining');
    const lim = resp.headers.get('x-ratelimit-limit') ?? resp.headers.get('ratelimit-limit');
    if (resto === null) {
      console.error(`Resposta ${resp.status} sem cabeçalho de limite. O limitador está montado nesta rota?`);
      process.exit(1);
    }
    valores.push(Number(resto));
    limite = Number(lim);
  }

  console.log(`${url}`);
  console.log(`  limite ${limite}, remaining: ${valores.join(', ')}`);
  const { ok, problemas } = julgarSequencia(valores, limite);
  if (ok) {
    console.log('  ok: o contador cai de um em um, a chave é quem chama.');
    process.exit(0);
  }
  console.error('  FALHA: o contador não é deste cliente sozinho.');
  for (const p of problemas) console.error(`    ${p}`);
  console.error('  Conferir na VPS: `pm2 list` (mais de um lorflux-app?) e');
  console.error('  `grep -rn "real_ip\\|CF-Connecting-IP" /etc/nginx/` (o nginx restaura o IP real?).');
  process.exit(1);
}

module.exports = { julgarSequencia };

if (require.main === module) {
  main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}
