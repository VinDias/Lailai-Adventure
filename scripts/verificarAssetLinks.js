/**
 * Confere as impressões digitais declaradas no Digital Asset Links, no arquivo
 * versionado E no que o site serve de verdade.
 *
 * Por que existe: o App Link do TWA depende de uma lista de SHA-256 que mora
 * em DOIS lugares (o repositório e o ar) e que muda quando a chave de upload é
 * redefinida. Em 22/10/2026 a chave de upload original foi dada por perdida (o
 * computador foi formatado) e o Google liberou uma nova, válida desde 24/10
 * 23:33. O arquivo em produção continuou declarando só a chave de assinatura
 * do app e a chave de upload PERDIDA, o que produz dois efeitos opostos e
 * silenciosos:
 *
 * - o APK assinado localmente com a chave NOVA (`bubblewrap build --apk`, o
 *   teste em aparelho antes de subir) abre com a barra de endereço do Chrome
 *   em cima, que é exatamente o sintoma de "assetlinks errado". Quem não
 *   souber disso vai procurar o defeito no build;
 * - a chave perdida continua recebendo delegação para abrir as URLs de
 *   lorflux.com. Ela está fora do nosso controle, e foi essa a razão de pedir
 *   a redefinição ao Google.
 *
 * A chave de ASSINATURA DO APP (a que o Google guarda) é a única que o app
 * publicado usa, em qualquer faixa, inclusive teste interno. Tirá-la do
 * arquivo quebra o App Link de quem já instalou. Ela nunca sai daqui.
 *
 * Rodar em qualquer máquina com rede (não precisa de segredo nenhum):
 *
 *   node scripts/verificarAssetLinks.js
 *
 * Sai com 1 se faltar chave esperada, se sobrar chave revogada ou se o site
 * não servir o arquivo. Não altera nada.
 */
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '../public/.well-known/assetlinks.json');
const PACOTE = 'com.lorflux.twa';
const DOMINIO = 'www.lorflux.com';

// A chave que o Google guarda e usa para assinar o que chega ao usuário
// (Play Console > Protegido com o Google Play > Assinatura de apps). Nunca
// muda e NUNCA sai da lista.
const CHAVE_DE_ASSINATURA_DO_APP =
  '40:B3:F3:82:18:74:E2:C5:44:11:F7:AA:B4:DE:78:D4:4C:F6:A2:70:AA:48:21:AA:78:6D:B8:F5:96:32:26:74';

// A chave de upload em vigor, gerada em 22/10/2026 e válida desde 24/10 23:33.
// Entra na lista por causa do APK assinado localmente, que é o teste em
// aparelho antes de subir o AAB. Trocar a chave de upload de novo significa
// trocar esta linha e fazer deploy do site.
const CHAVE_DE_UPLOAD_ATUAL =
  '83:F3:E8:8C:86:94:8D:09:F8:3B:87:E9:86:DA:7B:A6:D7:29:3F:4E:E9:2B:77:03:E8:B6:0D:2E:F6:ED:AF:B8';

// Chave de upload perdida com a formatação do computador, substituída pela
// redefinição pedida em 22/10/2026. Não é entulho inofensivo: enquanto estiver
// declarada, qualquer APK assinado com ela abre as URLs de lorflux.com.
const CHAVES_REVOGADAS = [
  '84:3C:6D:B5:F6:50:8E:B4:E3:4B:76:52:F1:C5:CB:9B:13:C8:D8:73:41:11:D1:51:A5:CA:A1:78:8D:2E:43:76',
];

const ESPERADAS = [CHAVE_DE_ASSINATURA_DO_APP, CHAVE_DE_UPLOAD_ATUAL];

function normalizar(f) {
  return String(f || '').toUpperCase().replace(/[^0-9A-F]/g, '');
}

/** Impressões declaradas para `com.lorflux.twa` numa lista de statements. */
function impressoesDoPacote(statements) {
  const lista = Array.isArray(statements) ? statements : [];
  const achadas = [];
  for (const st of lista) {
    const alvo = st && st.target;
    if (!alvo) continue;
    // O arquivo usa snake_case; a API do Google devolve camelCase.
    const app = alvo.androidApp || alvo;
    const pacote = app.packageName || app.package_name;
    if (pacote !== PACOTE) continue;
    const fps = app.sha256_cert_fingerprints
      || (app.certificate && [app.certificate.sha256Fingerprint])
      || [];
    for (const fp of fps) if (fp) achadas.push(fp);
  }
  return achadas;
}

/** O que o arquivo VERSIONADO declara. É a metade que roda offline. */
function impressoesDoArquivo(caminho = ARQUIVO) {
  return impressoesDoPacote(JSON.parse(fs.readFileSync(caminho, 'utf8')));
}

/** Confere uma lista de impressões contra o esperado. Devolve os problemas. */
function conferir(impressoes) {
  const vistas = impressoes.map(normalizar);
  const faltando = ESPERADAS.filter(e => !vistas.includes(normalizar(e)));
  const revogadas = CHAVES_REVOGADAS.filter(r => vistas.includes(normalizar(r)));
  return { faltando, revogadas };
}

async function baixar(url) {
  const resp = await fetch(url, { redirect: 'manual' });
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  return JSON.parse(await resp.text());
}

function relatar(titulo, impressoes) {
  const { faltando, revogadas } = conferir(impressoes);
  console.log(`${titulo}: ${impressoes.length} impressao(oes) para ${PACOTE}`);
  for (const fp of impressoes) {
    const qual = normalizar(fp) === normalizar(CHAVE_DE_ASSINATURA_DO_APP) ? 'assinatura do app'
      : normalizar(fp) === normalizar(CHAVE_DE_UPLOAD_ATUAL) ? 'upload atual'
      : CHAVES_REVOGADAS.some(r => normalizar(r) === normalizar(fp)) ? 'REVOGADA'
      : 'desconhecida';
    console.log(`  ${fp.slice(0, 11)}... (${qual})`);
  }
  if (faltando.length) {
    console.error(`  FALTA declarar: ${faltando.map(f => f.slice(0, 11) + '...').join(' ')}`);
  }
  if (revogadas.length) {
    console.error(`  SOBRA chave revogada: ${revogadas.map(f => f.slice(0, 11) + '...').join(' ')}`);
  }
  if (!faltando.length && !revogadas.length) console.log('  ok');
  return faltando.length > 0 || revogadas.length > 0;
}

async function main() {
  let falhou = false;

  falhou = relatar('arquivo versionado', impressoesDoArquivo()) || falhou;

  const url = `https://${DOMINIO}/.well-known/assetlinks.json`;
  try {
    falhou = relatar(url, impressoesDoPacote(await baixar(url))) || falhou;
  } catch (err) {
    falhou = true;
    console.error(`${url}: ${err.message} — o site precisa servir esse arquivo ou o App Link nao verifica.`);
  }

  // O que o Chrome usa de verdade é a visão em cache do Google, não o arquivo.
  const api = 'https://digitalassetlinks.googleapis.com/v1/statements:list'
    + `?source.web.site=https://${DOMINIO}&relation=delegate_permission/common.handle_all_urls`;
  try {
    const corpo = await baixar(api);
    falhou = relatar('visao do Google (cache de ate 1h)', impressoesDoPacote(corpo.statements)) || falhou;
  } catch (err) {
    console.error(`API do Digital Asset Links: ${err.message} (nao conta como falha, pode ser rede)`);
  }

  process.exit(falhou ? 1 : 0);
}

module.exports = {
  ARQUIVO,
  PACOTE,
  CHAVE_DE_ASSINATURA_DO_APP,
  CHAVE_DE_UPLOAD_ATUAL,
  CHAVES_REVOGADAS,
  ESPERADAS,
  impressoesDoArquivo,
  impressoesDoPacote,
  conferir,
};

if (require.main === module) {
  main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}
