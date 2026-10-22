/**
 * Confere se o endpoint de webhook do Stripe assina TODOS os `event.type` que
 * routes/payment.js trata.
 *
 * Por que existe: em 16/09/2026 o commit 517bb54 passou a tratar
 * `invoice.paid` (a renovação mensal da assinatura), e o teste
 * tests/backend/assinaturaPremium.test.js provou que o CÓDIGO trata. Só que o
 * evento nunca foi habilitado no painel do Stripe, então o Stripe nunca o
 * enviou: o handler ficou morto em produção de 16/09 a 22/10/2026. Ninguém
 * perdeu Premium apenas porque não havia assinatura ativa. Metade do conserto
 * mora fora do repositório, e é essa metade que este script cobre.
 *
 * Rodar na VPS, a partir da raiz do projeto (precisa de STRIPE_SECRET_KEY no
 * .env; a chave NÃO é impressa):
 *
 *   node scripts/verificarWebhookStripe.js
 *
 * Sai com 1 se faltar evento, se o endpoint estiver desabilitado ou se a rota
 * tratar evento fora da lista. Não altera nada no Stripe.
 */
const fs = require('fs');
const path = require('path');

const ROTA = path.join(__dirname, '../routes/payment.js');

// Os eventos que routes/payment.js trata HOJE. Tratar um `event.type` novo
// exige DUAS coisas: (1) acrescentar nesta lista e (2) habilitar o evento no
// endpoint do Stripe. O teste tests/backend/webhookEventosStripe.test.js falha
// se (1) não for feito; este script falha se (2) não for feito.
const EVENTOS_ESPERADOS = [
  'checkout.session.completed',
  'customer.subscription.deleted',
  'invoice.paid',
];

// `invoice.payment_failed` NÃO entra: não existe handler para ele, e o Premium
// expira sozinho no fim do período já pago (utils/premium.ts:9), que é o
// comportamento desejado. `checkout.session.completed` serve a dois caminhos,
// Premium e Super Reader (session.metadata.tipo === 'super_reader'), então
// nunca desabilitar esse.

function eventosTratadosNaRota(caminho = ROTA) {
  const fonte = fs.readFileSync(caminho, 'utf8');
  const achados = new Set();
  const re = /event\.type\s*===\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(fonte)) !== null) achados.add(m[1]);
  return [...achados].sort();
}

async function main() {
  require('dotenv').config();
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Falta STRIPE_SECRET_KEY no ambiente. Rode na VPS, na raiz do projeto.');
    process.exit(1);
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  let falhou = false;

  const tratados = eventosTratadosNaRota();
  const foraDaLista = tratados.filter(e => !EVENTOS_ESPERADOS.includes(e));
  if (foraDaLista.length) {
    falhou = true;
    console.error(`routes/payment.js trata ${foraDaLista.join(' ')} fora de EVENTOS_ESPERADOS. Atualize a lista deste script.`);
  }

  const endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data
    .filter(e => e.url.endsWith('/api/payment/webhook'));

  if (!endpoints.length) {
    console.error('Nenhum endpoint terminando em /api/payment/webhook nesta conta do Stripe.');
    process.exit(1);
  }

  for (const ep of endpoints) {
    const todos = ep.enabled_events.includes('*');
    const faltando = todos ? [] : EVENTOS_ESPERADOS.filter(e => !ep.enabled_events.includes(e));
    const semHandler = todos ? [] : ep.enabled_events.filter(e => !EVENTOS_ESPERADOS.includes(e));

    console.log(`${ep.url} [${ep.status}]`);
    console.log(`  assinados: ${ep.enabled_events.join(' ')}`);

    if (faltando.length) {
      falhou = true;
      console.error(`  FALTA habilitar: ${faltando.join(' ')} — enquanto faltar, o handler desses eventos nunca roda em produção.`);
    }
    if (semHandler.length) {
      console.log(`  assinados sem handler (inofensivo, só tráfego): ${semHandler.join(' ')}`);
    }
    if (ep.status !== 'enabled') {
      falhou = true;
      console.error(`  endpoint com status ${ep.status} — o Stripe não entrega nada.`);
    }
    if (!faltando.length && ep.status === 'enabled') console.log('  ok');
  }

  process.exit(falhou ? 1 : 0);
}

module.exports = { EVENTOS_ESPERADOS, eventosTratadosNaRota, ROTA };

if (require.main === module) {
  main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}
