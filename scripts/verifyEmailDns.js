#!/usr/bin/env node
const dns = require('dns');
const { promisify } = require('util');

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

const DOMAIN = process.argv[2] || 'lorflux.com';
const DKIM_SELECTOR = process.argv[3] || 'default';

let score = 0;
const total = 4;

function pass(tag, msg) { console.log(`[${tag}]\t\x1b[32mPASS\x1b[0m  ${msg}`); score++; }
function fail(tag, msg) { console.log(`[${tag}]\t\x1b[31mFAIL\x1b[0m  ${msg}`); }

async function checkMX() {
  try {
    const records = await resolveMx(DOMAIN);
    if (records.length > 0) {
      pass('MX', `${records[0].exchange} (prioridade ${records[0].priority})`);
    } else {
      fail('MX', 'Nenhum registro MX encontrado');
    }
  } catch (e) {
    fail('MX', e.message);
  }
}

async function checkSPF() {
  try {
    const records = await resolveTxt(DOMAIN);
    const spf = records.flat().find(r => r.startsWith('v=spf1'));
    if (spf) {
      pass('SPF', spf);
    } else {
      fail('SPF', 'Nenhum registro SPF encontrado');
    }
  } catch (e) {
    fail('SPF', e.message);
  }
}

async function checkDKIM() {
  try {
    const records = await resolveTxt(`${DKIM_SELECTOR}._domainkey.${DOMAIN}`);
    const dkim = records.flat().find(r => r.includes('v=DKIM1'));
    if (dkim) {
      pass('DKIM', dkim.substring(0, 60) + '...');
    } else {
      fail('DKIM', `Nenhum registro DKIM em ${DKIM_SELECTOR}._domainkey.${DOMAIN}`);
    }
  } catch (e) {
    fail('DKIM', e.message);
  }
}

async function checkDMARC() {
  try {
    const records = await resolveTxt(`_dmarc.${DOMAIN}`);
    const dmarc = records.flat().find(r => r.startsWith('v=DMARC1'));
    if (dmarc) {
      pass('DMARC', dmarc);
    } else {
      fail('DMARC', 'Nenhum registro DMARC encontrado');
    }
  } catch (e) {
    fail('DMARC', e.message);
  }
}

(async () => {
  console.log(`\nVerificando DNS de e-mail para: ${DOMAIN}\n`);
  await checkMX();
  await checkSPF();
  await checkDKIM();
  await checkDMARC();
  console.log(`\nScore:  ${score}/${total}`);
  if (score < total) {
    console.log('\nConsulte EMAIL_SETUP.md para instrucoes de configuracao.\n');
  }
  process.exit(score === total ? 0 : 1);
})();
