/**
 * Move o endpoint de webhook do Stripe para o domínio canônico (www), ANTES de
 * o domínio sem `www` passar a redirecionar.
 *
 * Por que existe: o Stripe NÃO segue redirecionamento. Em 27/10/2026 o
 * endpoint de produção era https://lorflux.com/api/payment/webhook. Ligar o
 * 301 de lorflux.com para www.lorflux.com sem mover o endpoint primeiro faria o
 * Stripe parar de entregar checkout.session.completed, invoice.paid e
 * customer.subscription.deleted: assinatura paga sem Premium, renovação que não
 * renova. É o mesmo tipo de defeito do invoice.paid de setembro (REGRESSOES.md).
 * Ver docs/verificacao-de-bugs-2026-11-04.md, item 2.
 *
 * Só a URL muda. O segredo de assinatura (STRIPE_WEBHOOK_SECRET) continua o
 * mesmo, então o .env não muda e não precisa de restart.
 *
 * Rodar na VPS, a partir da raiz do projeto (precisa de STRIPE_SECRET_KEY no
 * .env; nenhuma chave é impressa):
 *
 *   node scripts/trocarEndpointWebhookStripe.js              # só mostra o que faria
 *   node scripts/trocarEndpointWebhookStripe.js --aplicar    # troca a URL
 *
 * Depois, sempre: node scripts/verificarWebhookStripe.js
 */
const ALVO_PADRAO = 'https://www.lorflux.com/api/payment/webhook';
const SUFIXO = '/api/payment/webhook';

/**
 * Decide o que fazer com a lista de endpoints da conta. Puro, para ser testado
 * sem Stripe. Recusa quando a situação é ambígua, em vez de adivinhar.
 */
function planejarTroca(endpoints, alvo = ALVO_PADRAO) {
  const nossos = (endpoints || []).filter(e => typeof e.url === 'string' && e.url.endsWith(SUFIXO));
  if (nossos.length === 0) {
    return { acao: 'recusar', motivo: `nenhum endpoint terminando em ${SUFIXO} nesta conta` };
  }
  if (nossos.some(e => e.url === alvo)) {
    const outros = nossos.filter(e => e.url !== alvo);
    return outros.length
      ? { acao: 'recusar', motivo: `já existe endpoint em ${alvo} E outro(s) em ${outros.map(e => e.url).join(', ')}: dois endpoints entregam o mesmo evento duas vezes; resolver no painel` }
      : { acao: 'nada', motivo: `o endpoint já está em ${alvo}` };
  }
  if (nossos.length > 1) {
    return { acao: 'recusar', motivo: `há ${nossos.length} endpoints terminando em ${SUFIXO}; não vou escolher qual mover` };
  }
  return { acao: 'trocar', id: nossos[0].id, de: nossos[0].url, para: alvo };
}

async function main() {
  require('dotenv').config();
  const aplicar = process.argv.includes('--aplicar');
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Falta STRIPE_SECRET_KEY no ambiente. Rode na VPS, na raiz do projeto.');
    process.exit(1);
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data;
  const plano = planejarTroca(endpoints);

  if (plano.acao === 'recusar') {
    console.error(`Não troquei nada: ${plano.motivo}.`);
    process.exit(1);
  }
  if (plano.acao === 'nada') {
    console.log(`Nada a fazer: ${plano.motivo}.`);
    process.exit(0);
  }

  console.log(`Endpoint ${plano.id}`);
  console.log(`  de:   ${plano.de}`);
  console.log(`  para: ${plano.para}`);
  if (!aplicar) {
    console.log('\nSimulação. Para trocar de verdade, rode de novo com --aplicar.');
    process.exit(0);
  }
  await stripe.webhookEndpoints.update(plano.id, { url: plano.para });
  console.log('\nTrocado. Agora: node scripts/verificarWebhookStripe.js');
  console.log('Só depois disso ligar o 301 do domínio sem www, mantendo a exceção do');
  console.log(`${SUFIXO} no domínio sem www por 3 dias (reenvios já na fila do Stripe).`);
}

module.exports = { planejarTroca, ALVO_PADRAO };

if (require.main === module) {
  main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}
