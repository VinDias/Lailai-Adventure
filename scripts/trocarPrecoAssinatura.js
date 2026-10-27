/**
 * Cria um Price novo da assinatura mensal no Stripe e diz exatamente o que
 * trocar no .env da VPS.
 *
 * Por que existe: Price do Stripe é IMUTÁVEL. Não se edita o valor de um
 * Price, cria-se outro e aponta-se o site para ele — routes/payment.js lê
 * STRIPE_PRICE_ID_BRL/_USD/_EUR em :19-28 (checkout) e :46-49 (vitrine de
 * preços). Fazer isso na mão no painel é onde se erra o produto, o intervalo
 * ou a moeda, e Price errado só aparece no primeiro checkout de verdade.
 *
 * Em 21/10/2026 o cliente fechou R$ 10,90 no Brasil mantendo US$ 4,99 e
 * EUR 4,99, que já eram os valores cobrados: só o real muda.
 *
 * Rodar na VPS, a partir da raiz do projeto (precisa de STRIPE_SECRET_KEY e do
 * STRIPE_PRICE_ID_<MOEDA> atual no .env; nenhuma chave é impressa):
 *
 *   node scripts/trocarPrecoAssinatura.js --moeda brl --centavos 1090
 *   node scripts/trocarPrecoAssinatura.js --moeda brl --centavos 1090 --aplicar
 *
 * Sem --aplicar não escreve nada: mostra o preço atual, quantas assinaturas
 * vivas estão nele e o que seria criado. Com --aplicar cria o Price e imprime
 * a linha do .env e o restart. NÃO edita o .env, NÃO reinicia nada e NÃO
 * desativa o Price antigo — ele continua valendo para quem já assina, e é por
 * onde se volta atrás.
 */
require('dotenv').config();

const MOEDAS = { brl: 'STRIPE_PRICE_ID_BRL', usd: 'STRIPE_PRICE_ID_USD', eur: 'STRIPE_PRICE_ID_EUR' };

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? null : process.argv[i + 1];
}

function dinheiro(centavos, moeda) {
  return `${(centavos / 100).toFixed(2).replace('.', ',')} ${String(moeda).toUpperCase()}`;
}

async function main() {
  const moeda = String(arg('moeda') || '').toLowerCase();
  const centavosBruto = arg('centavos');
  const centavos = Number.parseInt(centavosBruto, 10);
  const aplicar = process.argv.includes('--aplicar');

  if (!MOEDAS[moeda]) {
    console.error(`--moeda precisa ser uma de: ${Object.keys(MOEDAS).join(' ')}`);
    process.exit(1);
  }
  // parseInt('10,90') devolve 10 e passaria como inteiro válido: criaria um
  // Price de R$ 0,10 sem avisar ninguém. Por isso a checagem é no texto cru.
  if (!/^\d+$/.test(String(centavosBruto || '')) || !Number.isInteger(centavos) || centavos <= 0) {
    console.error(`--centavos precisa ser inteiro em CENTAVOS, só dígitos (R$ 10,90 = 1090). Recebi ${JSON.stringify(centavosBruto)}.`);
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY ausente no ambiente. Rode na VPS, na raiz do projeto.');
    process.exit(1);
  }

  const variavel = MOEDAS[moeda];
  const idAtual = process.env[variavel] || process.env.STRIPE_PRICE_ID;
  if (!idAtual) {
    console.error(`${variavel} (e STRIPE_PRICE_ID) ausentes: não há preço atual para copiar o produto.`);
    process.exit(1);
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const atual = await stripe.prices.retrieve(idAtual, { expand: ['product'] });

  if (atual.currency !== moeda) {
    console.error(`${variavel} aponta para um Price em ${atual.currency.toUpperCase()}, não em ${moeda.toUpperCase()}. Pare e confira o .env.`);
    process.exit(1);
  }
  if (!atual.recurring) {
    console.error('O Price atual não é recorrente. Este script só troca preço de assinatura.');
    process.exit(1);
  }

  const produto = typeof atual.product === 'object' ? atual.product : { id: atual.product, name: '(não expandido)' };

  console.log(`produto:        ${produto.id} — ${produto.name}`);
  console.log(`preço atual:    ${atual.id} = ${dinheiro(atual.unit_amount, atual.currency)} a cada ${atual.recurring.interval_count} ${atual.recurring.interval}`);
  console.log(`preço novo:     ${dinheiro(centavos, moeda)} a cada ${atual.recurring.interval_count} ${atual.recurring.interval}`);

  // Quem já assina continua no Price que contratou até cancelar. Este número é
  // a resposta da pergunta "e quem já assina?" — sem ele a conversa é chute.
  const vivas = await stripe.subscriptions.list({ price: atual.id, status: 'active', limit: 100 });
  console.log(`assinaturas ativas no preço atual: ${vivas.data.length}${vivas.has_more ? '+ (há mais de 100)' : ''}`);
  if (vivas.data.length > 0) {
    console.log('  essas pessoas seguem pagando o valor antigo até cancelarem. Migrar exige mexer em cada assinatura.');
  }

  if (!aplicar) {
    console.log('\n--- simulação, nada foi criado. Repita com --aplicar para criar o Price. ---');
    process.exit(0);
  }

  const novo = await stripe.prices.create({
    product: produto.id,
    currency: moeda,
    unit_amount: centavos,
    recurring: { interval: atual.recurring.interval, interval_count: atual.recurring.interval_count },
    nickname: `Assinatura mensal ${dinheiro(centavos, moeda)}`,
  });

  console.log(`\nPrice criado: ${novo.id}`);
  console.log('\nFalta apontar o site para ele. Na VPS, na raiz do projeto:');
  console.log(`  cp .env .env.bak-$(date +%F-%H%M)`);
  console.log(`  sed -i 's|^${variavel}=.*|${variavel}=${novo.id}|' .env`);
  console.log(`  grep -c '^${variavel}=${novo.id}$' .env   # tem de imprimir 1`);
  console.log('  pm2 restart lorflux-app');
  console.log('\nDepois do restart, conferir o valor que o site publica:');
  console.log('  curl -s https://www.lorflux.com/api/payment/precos');
  console.log('\nLembrete: o preço da assinatura alimenta o repasse ao autor por');
  console.log('`royalty_premium_per_sub` (services/royaltyReportService.js:110), que NÃO acompanha');
  console.log('o Stripe sozinho. Conferir com: node scripts/definirSetting.js --listar');
}

if (require.main === module) {
  main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}

module.exports = { MOEDAS };
