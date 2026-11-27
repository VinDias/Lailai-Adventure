/**
 * Item 5 da frente A: posta pastas de episódio PELO MEU ESTÚDIO, num ambiente
 * inteiramente local, e confere o resultado no leitor em cada idioma, no
 * Chrome de desktop e em emulação de celular Android, com print.
 *
 *   node scripts/e2eEnvioPasta.cjs <pasta de saída> <pasta do episódio> [<pasta> ...]
 *
 * O que sobe aqui (nada sai para a rede, nada toca a produção):
 *  - MongoDB em memória (mongodb-memory-server, o mesmo dos testes);
 *  - o servidor da Lorflux (server.js) em localhost:3456, NODE_ENV=test;
 *  - Bunny falso: o envio grava em <saída>/cdn e um servidor estático em
 *    localhost:3457 serve os arquivos como se fosse o CDN;
 *  - a tela pelo Vite em localhost:5173;
 *  - Chromium do Playwright.
 *
 * Por pasta: cria um episódio em rascunho numa obra do canal do autor, entra
 * como o autor, abre Meu Estúdio > Obras > obra > "Enviar pasta do episódio",
 * escolhe a PASTA (webkitdirectory), confere, confirma e envia. Depois marca a
 * obra e o episódio como publicados direto no banco (é o que a aprovação
 * faria; a aprovação tem teste próprio) e abre o leitor: um print por idioma
 * no primeiro painel com balão, desktop e celular. Por fim confere no banco e
 * no "CDN" que cada balão tem o tamanho da fatia da página dele.
 *
 * Sai com 1 se algo não bateu. Os prints e o relatorio.json ficam na saída.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const raiz = path.resolve(__dirname, '..');
const [saidaArg, ...pastasArg] = process.argv.slice(2);
if (!saidaArg || pastasArg.length === 0) {
  console.error('Uso: node scripts/e2eEnvioPasta.cjs <pasta de saída> <pasta do episódio> [...]');
  process.exit(2);
}
const saida = path.resolve(saidaArg);
const dirCdn = path.join(saida, 'cdn');
fs.mkdirSync(dirCdn, { recursive: true });

const PORTA_API = 3456;
const PORTA_CDN = 3457;
const PORTA_TELA = 5173;
const EMAIL = 'autor-e2e@lorflux.local';
const SENHA = 'Senha@12345';

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'e2e-jwt-local',
  REFRESH_SECRET: 'e2e-refresh-local',
  REDIS_URL: 'redis://localhost:6379', // sem Redis aqui: a fila de vídeo só reclama no log
  FRONTEND_URL: `http://localhost:${PORTA_TELA}`,
  BUNNY_STORAGE_ZONE: 'zona-local-e2e',
  BUNNY_STORAGE_KEY: 'chave-local-e2e',
  BUNNY_STORAGE_HOSTNAME: `localhost:${PORTA_CDN}`,
  VITE_API_URL: `http://localhost:${PORTA_API}/api`,
});

function chromiumInstalado() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cache)) return undefined;
  for (const d of fs.readdirSync(cache).filter(x => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = path.join(cache, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const falhas = [];
let paginaAtual = null; // para o print do erro
let pedidosApiGlobal; // contagem dos pedidos à API, também no erro
const conferir = (ok, msg) => { if (!ok) { falhas.push(msg); console.error('  FALHOU:', msg); } else console.log('  ok:', msg); };

(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  const express = require('express');
  const mongoose = require('mongoose');
  const app = require(path.join(raiz, 'server'));
  await new Promise(r => (mongoose.connection.readyState === 1 ? r() : mongoose.connection.once('connected', r)));
  const servidores = [app.listen(PORTA_API), express().use(express.static(dirCdn)).listen(PORTA_CDN)];
  const pedidosApi = { total: 0, recusados429: 0, porRota: {} };
  pedidosApiGlobal = pedidosApi;
  servidores[0].on('request', (req, res) => res.on('finish', () => {
    pedidosApi.total++;
    if (res.statusCode === 429) pedidosApi.recusados429++;
    const rota = req.method + ' ' + req.url.split('?')[0].replace(/[0-9a-f]{24}/g, ':id');
    pedidosApi.porRota[rota] = (pedidosApi.porRota[rota] || 0) + 1;
  }));

  const bunny = require(path.join(raiz, 'utils/bunnyStorage'));
  bunny.__setUploaderForTests(async (buffer, caminho) => {
    const destino = path.join(dirCdn, caminho);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, buffer);
    return `http://localhost:${PORTA_CDN}/${caminho}`;
  });
  bunny.__setDeleterForTests(async (caminho) => fs.rmSync(path.join(dirCdn, caminho), { force: true }));

  const bcrypt = require('bcrypt');
  const User = require(path.join(raiz, 'models/User'));
  const Channel = require(path.join(raiz, 'models/Channel'));
  const Series = require(path.join(raiz, 'models/Series'));
  const Episode = require(path.join(raiz, 'models/Episode'));
  const autor = await User.create({ email: EMAIL, passwordHash: await bcrypt.hash(SENHA, 4), nome: 'Autor E2E', role: 'user' });
  const canal = await Channel.create({ ownerId: autor._id, name: 'Canal E2E' });
  const obra = await Series.create({ title: 'Obra E2E', content_type: 'hiqua', channelId: canal._id, isPublished: false, genre: 'Drama', description: 'Obra de teste local' });

  const { createServer } = await import('vite');
  const vite = await createServer({ root: raiz, logLevel: 'error', server: { port: PORTA_TELA, host: 'localhost', strictPort: true } });
  await vite.listen();

  const { chromium, devices } = require('playwright');
  const navegador = await chromium.launch({ executablePath: chromiumInstalado() });
  const sharp = require('sharp');
  const relatorio = [];

  const novoContexto = async (opcoes) => {
    const ctx = await navegador.newContext({ locale: 'pt-BR', ...opcoes });
    await ctx.addInitScript(() => {
      localStorage.setItem('lorflux_onboarded', '1');
      // O seletor do leitor troca também o idioma da interface; cada página
      // nova começa em português para os textos que o roteiro procura.
      localStorage.setItem('lorflux_language', 'pt');
      localStorage.setItem('lorflux_cookie_consent', JSON.stringify({ status: 'rejected', date: new Date().toISOString(), version: 1 }));
    });
    return ctx;
  };
  // O servidor guarda um refresh token por conta: o login de um contexto
  // derruba a sessão do outro. Entra de novo logo antes de cada uso.
  // Limite global de 300 pedidos à API por IP a cada 15 min (server.js): o
  // roteiro inteiro sai do mesmo IP e, em ambiente local, cada pedido ainda
  // tem a pré-verificação de CORS. Cada página nova ganha um IP de origem
  // próprio (o servidor confia no X-Forwarded-For, trust proxy 1).
  let ipFalso = 0;
  const novaPagina = async (ctx) => {
    const pg = await ctx.newPage();
    await pg.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.99.0.${++ipFalso}` });
    return pg;
  };
  const entrar = async (ctx) => {
    const login = await ctx.request.post(`http://localhost:${PORTA_API}/api/auth/login`, { data: { email: EMAIL, password: SENHA }, headers: { 'X-Forwarded-For': `10.98.0.${++ipFalso}` } });
    if (!login.ok()) throw new Error(`login falhou: ${login.status()}`);
  };

  const desktop = await novoContexto({ viewport: { width: 1280, height: 900 } });
  const celular = await novoContexto({ ...devices['Pixel 7'] });

  for (const [n, pastaArg] of pastasArg.entries()) {
    const pasta = path.resolve(pastaArg);
    const nome = path.basename(pasta);
    const prefixo = path.join(saida, `${String(n + 1).padStart(2, '0')}-${nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
    console.log(`\n== ${nome}`);
    const episodio = await Episode.create({ seriesId: obra._id, episode_number: n + 1, title: `EP E2E ${n + 1}`, status: 'draft', panels: [] });

    // ── envio pelo Meu Estúdio ──
    await entrar(desktop);
    const p = await novaPagina(desktop);
    paginaAtual = p;
    const erros = [];
    p.on('pageerror', e => erros.push(String(e)));
    await p.goto(`http://localhost:${PORTA_TELA}/`);
    await p.getByText('Conta', { exact: true }).first().click();
    await p.getByText('Meu Estúdio').first().click();
    await p.getByText('Obras', { exact: true }).click();
    await p.getByText('Obra E2E').first().click();
    const blocoEp = p.locator('div.rounded-2xl', { has: p.getByText(`EP E2E ${n + 1}`, { exact: true }) }).last();
    await blocoEp.getByText('Enviar pasta do episódio').click();
    await p.locator('[data-testid=envio-input-pasta]').setInputFiles(pasta);
    await p.locator('[data-testid=conferencia-envio]').waitFor();
    const resumo = await p.locator('[data-testid=resumo-paineis]').innerText();
    const tamanho = await p.locator('[data-testid=resumo-tamanho]').innerText();
    await p.locator('details summary').first().click().catch(() => {});
    await p.screenshot({ path: `${prefixo}-1-conferencia.png`, fullPage: true });
    const problemas = await p.locator('[data-testid=problema]').allInnerTexts();
    conferir(problemas.length === 0, `${nome}: conferência sem problemas (${problemas.join(' | ') || 'nenhum'})`);
    await p.locator('[data-testid=envio-confirmo]').check();
    const t0 = Date.now();
    await p.locator('[data-testid=envio-enviar]').click();
    await p.getByRole('status').waitFor({ timeout: 180000 });
    const segundos = Math.round((Date.now() - t0) / 100) / 10;
    const status = await p.getByRole('status').innerText();
    await p.screenshot({ path: `${prefixo}-2-enviado.png` });
    conferir(erros.length === 0, `${nome}: tela sem erro de JavaScript (${erros.join(' | ')})`);
    await p.close();

    // ── banco e "CDN": cada balão do tamanho da fatia da página dele ──
    const ep = await Episode.findById(episodio._id).lean();
    let baloesConferidos = 0;
    let baloesErrados = 0;
    const porIdioma = { pt: 0, en: 0, es: 0, zh: 0 };
    let bytesNoCdn = 0;
    for (const painel of ep.panels) {
      const arq = path.join(dirCdn, new URL(painel.image_url).pathname);
      const mp = await sharp(arq).metadata();
      bytesNoCdn += fs.statSync(arq).size;
      if (mp.height > 1280) baloesErrados++;
      for (const c of painel.translationLayers) {
        const arqB = path.join(dirCdn, new URL(c.imageUrl).pathname);
        const mb = await sharp(arqB).metadata();
        bytesNoCdn += fs.statSync(arqB).size;
        porIdioma[c.language]++;
        baloesConferidos++;
        if (mb.width !== mp.width || mb.height !== mp.height) baloesErrados++;
      }
    }
    conferir(baloesErrados === 0, `${nome}: ${ep.panels.length} painéis até 1280 px, ${baloesConferidos} balões do tamanho da fatia`);

    // ── leitor ──
    await Series.updateOne({ _id: obra._id }, { $set: { isPublished: true, content_rating: 'teen' } });
    await Episode.updateOne({ _id: episodio._id }, { $set: { status: 'published', publishedAt: new Date() } });
    const primeiroComBalao = ep.panels.findIndex(x => x.translationLayers.length > 0);
    const prints = [];
    for (const [rotulo, ctx] of [['desktop', desktop], ['celular', celular]]) {
      await entrar(ctx);
      const leitor = await novaPagina(ctx);
      paginaAtual = leitor;
      await leitor.goto(`http://localhost:${PORTA_TELA}/?abrir=${obra._id}&tipo=hiqua`);
      await leitor.getByText(`EP E2E ${n + 1}`).first().click();
      const alvo = leitor.locator(`img[alt="Página ${Math.max(primeiroComBalao, 0) + 1}"]`);
      await alvo.waitFor({ timeout: 30000 });
      // Rótulos do seletor do WebtoonReader.
      const rotulos = { pt: 'Port', en: 'Eng', es: 'Esp', zh: 'Zhon' };
      const doEpisodio = Object.keys(rotulos).filter(i => porIdioma[i] > 0);
      // O leitor mostra o seletor quando há balão fora do PT (o PT é o
      // original e sempre entra); só PT: sem seletor, já abre em PT.
      const soPt = doEpisodio.length === 1 && doEpisodio[0] === 'pt';
      const idiomas = doEpisodio.length === 0 ? [[null, null]] : soPt ? [[null, 'pt']] : doEpisodio.map(i => [rotulos[i], i]);
      for (const [botao, idioma] of idiomas) {
        // O cabeçalho do leitor rola junto com os painéis: clique por script.
        if (botao) await leitor.getByRole('button', { name: botao, exact: true }).first().evaluate(b => b.click());
        await alvo.scrollIntoViewIfNeeded();
        await leitor.waitForFunction(el => el.complete && el.naturalWidth > 0, await alvo.elementHandle());
        await leitor.waitForTimeout(300);
        const arquivo = `${prefixo}-3-leitor-${rotulo}-${idioma || 'sem-balao'}.png`;
        await leitor.screenshot({ path: arquivo });
        prints.push(path.basename(arquivo));
        if (idioma) {
          const camada = await alvo.locator('xpath=following-sibling::img').getAttribute('src').catch(() => null);
          conferir(!!camada && camada.includes(`-${idioma}.png`), `${nome} (${rotulo}): balão ${idioma} sobre o painel ${primeiroComBalao + 1}`);
        }
      }
      // Emenda entre duas fatias da MESMA página (risco R2 do recorte de
      // 23/11: linha fina entre fatias no celular), no meio da tela.
      const cortado = ep.panels.findIndex((x, i) => i > 0 && /-2(-[a-z]{2})?\.jpg$/.test(x.image_url));
      if (cortado > 0) {
        await leitor.locator(`img[alt="Página ${cortado + 1}"]`).evaluate(el => {
          // Topo da 2a fatia no meio da tela, role quem rolar (janela ou o leitor).
          el.scrollIntoView({ block: 'start' });
          let rolador = el.parentElement;
          while (rolador && !(rolador.scrollHeight > rolador.clientHeight && /(auto|scroll)/.test(getComputedStyle(rolador).overflowY))) rolador = rolador.parentElement;
          (rolador || window).scrollBy(0, el.getBoundingClientRect().top - window.innerHeight / 2);
        });
        await leitor.waitForTimeout(500);
        const arquivo = `${prefixo}-4-emenda-${rotulo}.png`;
        await leitor.screenshot({ path: arquivo });
        prints.push(path.basename(arquivo));
        // Mede a emenda no print: a linha de pixels na borda entre as duas
        // fatias não pode ser mais escura que as vizinhas (as fatias em si
        // são contínuas; uma fresta deixa ver o fundo preto do leitor).
        // Todas as bordas de painel visíveis no print, em pixels do aparelho.
        const bordas = await leitor.evaluate(() => Array.from(document.querySelectorAll('img[alt^="Página "]'))
          .map(el => el.getBoundingClientRect().top * window.devicePixelRatio)
          .filter(y => y > 8 && y < window.innerHeight * window.devicePixelRatio - 8));
        const { data, info } = await sharp(arquivo).raw().toBuffer({ resolveWithObject: true });
        const media = (y) => {
          let soma = 0;
          for (let x = 0; x < info.width; x++) for (let c = 0; c < 3; c++) soma += data[(y * info.width + x) * info.channels + c];
          return soma / info.width / 3;
        };
        let piorQueda = 0;
        for (const borda of bordas) {
          const y0 = Math.round(borda);
          const vizinhas = (media(y0 - 5) + media(y0 + 5)) / 2;
          const pior = Math.min(media(y0 - 2), media(y0 - 1), media(y0), media(y0 + 1), media(y0 + 2));
          piorQueda = Math.max(piorQueda, vizinhas - pior);
        }
        conferir(bordas.length > 0 && piorQueda < 12, `${nome} (${rotulo}): ${bordas.length} emenda(s) no print sem linha escura (pior queda de brilho ${piorQueda.toFixed(0)})`);
      }
      await leitor.close();
    }
    await Series.updateOne({ _id: obra._id }, { $set: { isPublished: false } });

    relatorio.push({ pasta: nome, resumo, tamanho, status, segundosDoEnvio: segundos, paineis: ep.panels.length, porIdioma, mbNoCdn: Math.round(bytesNoCdn / 10485.76) / 100, prints });
  }

  fs.writeFileSync(path.join(saida, 'relatorio.json'), JSON.stringify({ quando: new Date().toISOString(), falhas, relatorio, pedidosApi }, null, 1));
  console.log('pedidos à API:', JSON.stringify({ total: pedidosApi.total, recusados429: pedidosApi.recusados429 }));
  console.log('\n' + JSON.stringify(relatorio, null, 1));
  await navegador.close();
  await vite.close();
  servidores.forEach(s => s.close());
  await mongoose.disconnect();
  await mongod.stop();
  console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nTudo conferido.');
  process.exit(falhas.length ? 1 : 0);
})().catch(async e => {
  console.error(e);
  if (typeof pedidosApiGlobal !== 'undefined') console.error('pedidos à API:', JSON.stringify(pedidosApiGlobal));
  if (paginaAtual) await paginaAtual.screenshot({ path: path.join(saida, 'erro.png'), fullPage: true }).catch(() => {});
  process.exit(1);
});
