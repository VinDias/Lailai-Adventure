/**
 * Confere, de fora, que existe UM endereço do site: o domínio sem `www`
 * redireciona para o `www`, e o webhook do Stripe continua alcançável.
 *
 * Por que existe: em 04/11/2026 https://lorflux.com/ respondia 200, servindo
 * uma segunda cópia do app. Os cookies de sessão são do host
 * (utils/authCookies.js:18-25, sem `domain`), então quem entra por um não está
 * logado no outro, e a volta do checkout vai para o FRONTEND_URL
 * (routes/payment.js:102-103): quem assina pelo domínio sem `www` pode voltar
 * deslogado logo depois de pagar. Ver docs/verificacao-de-bugs-2026-11-04.md,
 * item 2.
 *
 * O conserto mora no nginx da VPS, e a ordem importa: o Stripe NÃO segue
 * redirecionamento, e o endpoint do webhook estava no domínio sem `www`. Antes
 * de ligar o 301, mover o endpoint (scripts/trocarEndpointWebhookStripe.js).
 *
 * Não precisa de segredo:
 *
 *   node scripts/verificarDominioCanonico.js
 *
 * Sai com 1 se o domínio sem `www` não redirecionar com 301 para o `www`, ou
 * se o webhook no `www` não responder como rota viva (400 de assinatura).
 */
const CANONICO = 'https://www.lorflux.com';
const SEM_WWW = 'https://lorflux.com';
const WEBHOOK = '/api/payment/webhook';

async function status(url, metodo = 'GET') {
  const resp = await fetch(url, {
    method: metodo,
    redirect: 'manual',
    headers: { 'user-agent': 'lorflux-verificador-dominio', 'content-type': 'application/json' },
    body: metodo === 'POST' ? '{}' : undefined,
  });
  return { codigo: resp.status, destino: resp.headers.get('location') };
}

/** O que conta como "redirecionou certo" para um caminho do domínio sem www. */
function redirecionaParaCanonico({ codigo, destino }, caminho) {
  return codigo === 301 && destino === `${CANONICO}${caminho}`;
}

async function main() {
  let falhou = false;

  for (const caminho of ['/', '/?origem=teste']) {
    const r = await status(`${SEM_WWW}${caminho}`);
    if (redirecionaParaCanonico(r, caminho)) {
      console.log(`${SEM_WWW}${caminho} -> 301 ${r.destino}  ok`);
    } else {
      falhou = true;
      console.error(`${SEM_WWW}${caminho} -> ${r.codigo}${r.destino ? ' ' + r.destino : ''}  FALHA: esperado 301 para ${CANONICO}${caminho}`);
    }
  }

  // O webhook no www tem de ser uma rota viva: sem assinatura, o handler
  // responde 400. 301/302 aqui seria o Stripe perdendo eventos em silêncio.
  const w = await status(`${CANONICO}${WEBHOOK}`, 'POST');
  if (w.codigo === 400) {
    console.log(`POST ${CANONICO}${WEBHOOK} -> 400 (rota viva, assinatura recusada)  ok`);
  } else {
    falhou = true;
    console.error(`POST ${CANONICO}${WEBHOOK} -> ${w.codigo}  FALHA: esperado 400 de assinatura inválida`);
  }

  // Informativo: enquanto o endpoint do Stripe estiver no domínio sem www,
  // este caminho NÃO pode redirecionar.
  const a = await status(`${SEM_WWW}${WEBHOOK}`, 'POST');
  console.log(`POST ${SEM_WWW}${WEBHOOK} -> ${a.codigo}${a.destino ? ' ' + a.destino : ''}  (informativo: tem de ser 400 enquanto o Stripe apontar para cá)`);

  process.exit(falhou ? 1 : 0);
}

module.exports = { redirecionaParaCanonico, CANONICO, SEM_WWW, WEBHOOK };

if (require.main === module) {
  main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}
