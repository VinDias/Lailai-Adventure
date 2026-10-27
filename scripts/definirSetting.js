/**
 * Lê e grava chaves de Setting direto no banco, do mesmo jeito que o painel de
 * administração grava (routes/settings.js PUT /:key faz upsert de
 * value/label/group; o valor é SEMPRE string e quem lê número usa parseFloat —
 * services/royaltyReportService.js:44).
 *
 * Por que existe: algumas Settings que decidem o dinheiro de terceiros não têm
 * campo no formulário do Admin. `royalty_premium_per_sub` é lida em
 * services/royaltyReportService.js:110 para calcular o repasse ao autor e o
 * formulário só expõe `premium_cpm_rate` (components/Admin/AdminDashboard.tsx:216).
 * Resultado: dá para subir o preço da assinatura e deixar o autor recebendo
 * sobre o valor antigo sem ninguém perceber.
 *
 * Rodar na VPS, a partir da raiz do projeto (precisa de MONGO_URI no .env):
 *
 *   node scripts/definirSetting.js --listar
 *   node scripts/definirSetting.js --chave premium_cpm_rate --valor 4.00 --label "CPM Rate (R$)"
 *   node scripts/definirSetting.js --chave premium_cpm_rate --valor 4.00 --label "CPM Rate (R$)" --aplicar
 *
 * Sem --aplicar não escreve nada: mostra o valor de hoje e o que mudaria.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Setting = require('../models/Setting');

// As que mexem em dinheiro de terceiros. --listar mostra estas, e o que mais
// existir no banco aparece depois, para nada ficar invisível.
const DO_DINHEIRO = ['premium_cpm_rate', 'royalty_premium_per_sub', 'premium_price_display'];

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? null : process.argv[i + 1];
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorflux');

  const chave = arg('chave');
  const listar = process.argv.includes('--listar') || !chave;

  if (listar) {
    const docs = await Setting.find({}).lean();
    const mapa = new Map(docs.map(d => [d.key, d]));
    console.log('chaves que decidem dinheiro:');
    for (const k of DO_DINHEIRO) {
      const d = mapa.get(k);
      console.log(`  ${k.padEnd(26)} = ${d ? JSON.stringify(d.value) : '(não existe no banco)'}`);
    }
    const resto = docs.filter(d => !DO_DINHEIRO.includes(d.key)).map(d => d.key).sort();
    if (resto.length) console.log(`\noutras chaves gravadas: ${resto.join(' ')}`);
    if (!chave) console.log('\nSem --chave, este script só lê.');
    await mongoose.disconnect();
    return;
  }

  const valor = arg('valor');
  if (valor === null) {
    console.error('--valor é obrigatório junto com --chave.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const antes = await Setting.findOne({ key: chave }).lean();
  console.log(`${chave}`);
  console.log(`  antes:  ${antes ? JSON.stringify(antes.value) : '(não existe no banco)'}`);
  console.log(`  depois: ${JSON.stringify(valor)}`);

  // parseFloat é o que o código usa para ler número; avisa se o valor não vira
  // número, porque `4,00` vira 4 e `R$ 4,00` vira NaN, e NaN cai no fallback.
  if (DO_DINHEIRO.includes(chave)) {
    const n = Number.parseFloat(valor);
    if (!Number.isFinite(n)) {
      console.error(`  ATENÇÃO: ${JSON.stringify(valor)} não vira número com parseFloat. O código usaria o padrão.`);
    } else if (String(n) !== String(valor).trim()) {
      console.log(`  (o código vai ler isso como ${n})`);
    }
  }

  if (!process.argv.includes('--aplicar')) {
    console.log('\n--- simulação, nada foi gravado. Repita com --aplicar. ---');
    await mongoose.disconnect();
    return;
  }

  const label = arg('label') || antes?.label;
  const group = arg('group') || antes?.group || 'general';
  const salvo = await Setting.findOneAndUpdate(
    { key: chave },
    { $set: { value: valor ?? '', label, group } },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  console.log(`\ngravado: ${salvo.key} = ${JSON.stringify(salvo.value)} (label ${JSON.stringify(salvo.label)}, grupo ${salvo.group})`);
  console.log('Sem cache no servidor (routes/settings.js GET /public lê o banco a cada chamada): vale na hora, sem restart. Quem está com a página aberta vê no próximo carregamento.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async err => { console.error('ERRO:', err.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
}

module.exports = { DO_DINHEIRO };
