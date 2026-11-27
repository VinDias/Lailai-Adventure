/**
 * Roteiro E2E da frente A (itens 5, 6, 7 e 8) em navegador de verdade.
 *
 *   node tests/e2e/roteiroFrenteA.cjs <pasta de saída> <pasta de episódio> [<pasta> ...]
 *
 * Precisa de pelo menos 3 pastas de episódio (páginas .jpg e balões .png com
 * _PORT/_ENG/_ESP/_ZHO), e que a 1a e a 2a tenham pelo menos 8 páginas e 2
 * páginas com balão nos 4 idiomas. Sem pastas, usa uma tira sintética gerada
 * na hora (diga `--sintetico` no lugar das pastas). Nenhum dado de cliente
 * fica no repositório: as pastas vêm de fora e os prints vão para a saída.
 *
 * O ambiente é o de tests/e2e/ambienteLocal.cjs (Mongo em memória, Bunny
 * falso, Vite, Chromium). O que o roteiro faz, sempre pela tela:
 *  a. autor: Meu Estúdio, cria obra e capítulos, envia cada pasta (tela de
 *     conferência, envio em partes);
 *  b. autor: "Editar painéis" num rascunho: apaga um, apaga vários, troca a
 *     imagem de um painel, troca, remove e acrescenta balão;
 *  c. moderador: Fila de Aprovação, "Ler episódio" nos 4 idiomas; quem não é
 *     admin não abre a rota;
 *  d. moderador aprova; leitor lê nos 4 idiomas; autor edita o publicado
 *     (vira edição), leitor continua na versão do ar; moderador devolve com
 *     motivo; autor vê o motivo e reenvia; moderador aprova; leitor troca;
 *     reenvio da pasta em publicado e descarte da edição;
 *  e. celular (Pixel 7): leitor sem linha escura entre fatias, envio por
 *     "vários arquivos" e grade de painéis.
 *
 * Sai com 1 se algo não bateu. Prints, relatorio.json e passos.md na saída.
 */
const path = require('path');
const fs = require('fs');
const { subirAmbiente, chromiumInstalado, raiz } = require('./ambienteLocal.cjs');

const args = process.argv.slice(2);
const sintetico = args.includes('--sintetico');
const [saidaArg, ...pastasArg] = args.filter(a => a !== '--sintetico');
if (!saidaArg || (!sintetico && pastasArg.length < 3)) {
  console.error('Uso: node tests/e2e/roteiroFrenteA.cjs <pasta de saída> <pasta do episódio> <pasta> <pasta> [...]\n     ou: node tests/e2e/roteiroFrenteA.cjs <pasta de saída> --sintetico');
  process.exit(2);
}
const saida = path.resolve(saidaArg);
fs.mkdirSync(saida, { recursive: true });
const dirCdn = process.env.E2E_CDN_DIR ? path.resolve(process.env.E2E_CDN_DIR) : path.join(saida, 'cdn');

const SENHA = 'Senha@12345';
const CONTAS = {
  autor: 'autor-e2e@lorflux.local',
  admin: 'admin-e2e@lorflux.local',
  leitor: 'leitor-e2e@lorflux.local',
  leitorCelular: 'leitor-celular-e2e@lorflux.local',
  outroAutor: 'outro-autor-e2e@lorflux.local',
};
const OBRA = 'Obra de Teste E2E';
const ROTULOS = { pt: 'Port', en: 'Eng', es: 'Esp', zh: 'Zhon' };
const IDIOMAS = ['pt', 'en', 'es', 'zh'];

// ── registro dos passos ──
const passos = [];
let blocoAtual = '';
let nFoto = 0;
let paginaAtual = null;
const conferir = (ok, passo, esperado, obtido, prints = []) => {
  passos.push({ bloco: blocoAtual, passo, esperado, obtido: String(obtido), ok: !!ok, prints });
  console.log(`  ${ok ? 'ok    ' : 'FALHOU'} [${blocoAtual}] ${passo}: ${obtido}`);
  return !!ok;
};
const foto = async (pg, nome, opcoes = {}) => {
  const arquivo = `${blocoAtual}${String(++nFoto).padStart(3, '0')}-${nome}.png`;
  await pg.screenshot({ path: path.join(saida, arquivo), ...opcoes });
  return arquivo;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const retrato = (ep) => (ep.panels || []).map(p => ({
  id: String(p._id),
  img: p.image_url,
  camadas: Object.fromEntries((p.translationLayers || []).map(c => [c.language, c.imageUrl])),
}));

(async () => {
  const amb = await subirAmbiente({
    dirCdn,
    portaApi: Number(process.env.E2E_PORTA_API) || 3466,
    portaTela: Number(process.env.E2E_PORTA_TELA) || 5183,
  });
  const TELA = amb.tela;
  const sharp = require('sharp');
  const bcrypt = require('bcrypt');
  const User = amb.modelo('User');
  const Channel = amb.modelo('Channel');
  const Series = amb.modelo('Series');
  const Episode = amb.modelo('Episode');
  const RevisaoEpisodio = amb.modelo('RevisaoEpisodio');

  // ── imagens sintéticas (o que o roteiro troca é sempre figura de teste) ──
  const svgTexto = (w, h, linhas, caixa) => Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    (caixa ? `<rect x="60" y="60" width="${w - 120}" height="${80 + linhas.length * 70}" rx="40" fill="white" stroke="black" stroke-width="6"/>` : '') +
    linhas.map((l, i) => `<text x="${w / 2}" y="${150 + i * 70}" font-family="sans-serif" font-size="52" font-weight="bold" text-anchor="middle" fill="${caixa ? 'black' : 'white'}">${l}</text>`).join('') +
    '</svg>');
  const pagina = (texto, cor, w = 800, h = 1280) => sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .composite([{ input: svgTexto(w, h, [].concat(texto), false), top: 0, left: 0 }]).jpeg({ quality: 80 }).toBuffer();
  const balao = (texto, w = 800, h = 1280) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: svgTexto(w, h, [].concat(texto), true), top: 0, left: 0 }]).png().toBuffer();
  const arq = (name, mimeType, buffer) => ({ name, mimeType, buffer });

  // ── pastas de episódio ──
  let pastas = pastasArg.map(p => path.resolve(p));
  if (sintetico) {
    const base = path.join(saida, 'pastas-sinteticas');
    pastas = [];
    for (const [k, n] of [['Tira Sintetica EP1', 10], ['Tira Sintetica EP2', 10], ['Tira Sintetica EP3', 9]]) {
      const dir = path.join(base, k);
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 1; i <= n; i++) {
        const alta = k.endsWith('EP3') && i === 2; // uma página alta, cortada em 3 fatias
        const h = alta ? 3000 : 1280;
        const nome = `${k} Pagina ${String(i).padStart(3, '0')}`;
        fs.writeFileSync(path.join(dir, `${nome}.jpg`), await pagina([`${k}`, `pagina ${i}`], { r: 20 + i * 20, g: 60, b: 120 }, 800, h));
        if (i % 2 === 0) for (const [suf, id] of [['PORT', 'pt'], ['ENG', 'en'], ['ESP', 'es'], ['ZHO', 'zh']]) {
          fs.writeFileSync(path.join(dir, `${nome}_${suf}.png`), await balao([`balao ${id}`, `pagina ${i}`], 800, h));
        }
      }
      pastas.push(dir);
    }
  }
  const eps = pastas.map((pasta, i) => ({ pasta, numero: i + 1, titulo: `EP ${i + 1} ${path.basename(pasta)}`.slice(0, 60) }));

  // ── contas ──
  const hash = await bcrypt.hash(SENHA, 4);
  const autor = await User.create({ email: CONTAS.autor, passwordHash: hash, nome: 'Autor E2E', role: 'user' });
  await User.create({ email: CONTAS.admin, passwordHash: hash, nome: 'Moderador E2E', role: 'superadmin' });
  await User.create({ email: CONTAS.leitor, passwordHash: hash, nome: 'Leitor E2E', role: 'user' });
  await User.create({ email: CONTAS.leitorCelular, passwordHash: hash, nome: 'Leitor Celular E2E', role: 'user' });
  const outro = await User.create({ email: CONTAS.outroAutor, passwordHash: hash, nome: 'Outro Autor E2E', role: 'user' });
  await Channel.create({ ownerId: autor._id, name: 'Canal E2E' });
  await Channel.create({ ownerId: outro._id, name: 'Outro Canal E2E' });

  const { chromium, devices } = require('playwright');
  const navegador = await chromium.launch({ executablePath: chromiumInstalado() });
  const novoContexto = async (opcoes) => {
    const ctx = await navegador.newContext({ locale: 'pt-BR', ...opcoes });
    await amb.atenderCdn(ctx);
    await ctx.addInitScript(() => {
      localStorage.setItem('lorflux_onboarded', '1');
      // O seletor do leitor troca também o idioma da interface; cada página
      // nova começa em português para os textos que o roteiro procura.
      localStorage.setItem('lorflux_language', 'pt');
      localStorage.setItem('lorflux_cookie_consent', JSON.stringify({ status: 'rejected', date: new Date().toISOString(), version: 1 }));
    });
    return ctx;
  };
  // Limite global de 300 pedidos por IP a cada 15 min (server.js): o roteiro
  // inteiro sai de um IP só. Cada página ganha um IP de origem próprio (o
  // servidor confia no X-Forwarded-For, trust proxy 1).
  let ipFalso = 0;
  const errosDeTela = [];
  const respostasRuins = [];
  const novaPagina = async (ctx, quem) => {
    const pg = await ctx.newPage();
    await pg.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.99.${Math.floor(++ipFalso / 250)}.${ipFalso % 250 + 1}` });
    pg.on('dialog', d => d.accept());
    pg.on('pageerror', e => errosDeTela.push(`${quem} [${blocoAtual}]: ${e}`));
    pg.on('response', r => {
      const u = r.url();
      if (r.status() >= 400 && u.includes('/api/')) respostasRuins.push(`${quem} [${blocoAtual}] ${r.status()} ${r.request().method()} ${u.replace(TELA, '').replace(/[0-9a-f]{24}/g, ':id')}`);
    });
    paginaAtual = pg;
    return pg;
  };
  // O servidor guarda um refresh token por conta: o login num contexto
  // derruba a sessão da mesma conta em outro. Entra de novo antes de cada uso.
  const entrar = async (ctx, email) => {
    const r = await ctx.request.post(`${TELA}/api/auth/login`, { data: { email, password: SENHA }, headers: { 'X-Forwarded-For': `10.98.0.${++ipFalso % 250 + 1}` } });
    if (!r.ok()) throw new Error(`login de ${email} falhou: ${r.status()}`);
  };
  const pedir = async (ctx, metodo, rota) => {
    const r = await ctx.request.fetch(`${TELA}/api${rota}`, { method: metodo, headers: { 'X-Forwarded-For': `10.97.0.${++ipFalso % 250 + 1}` } });
    return r.status();
  };

  const desktop = { viewport: { width: 1280, height: 800 } };
  const ctxAutor = await novoContexto(desktop);
  const ctxAdmin = await novoContexto(desktop);
  const ctxLeitor = await novoContexto(desktop);
  const ctxOutro = await novoContexto(desktop);
  const ctxAnonimo = await novoContexto(desktop);
  const ctxAutorCel = await novoContexto({ ...devices['Pixel 7'] });
  const ctxLeitorCel = await novoContexto({ ...devices['Pixel 7'] });

  // ── ajudantes de tela ──
  const abrirEstudio = async (ctx, quem = 'autor') => {
    await entrar(ctx, CONTAS.autor);
    const p = await novaPagina(ctx, quem);
    await p.goto(`${TELA}/`);
    await p.getByText('Conta', { exact: true }).first().click();
    await p.locator('[data-testid=meu-estudio-card]').click();
    await p.getByRole('button', { name: 'Obras', exact: true }).click();
    return p;
  };
  const abrirObra = async (p) => {
    const cartao = p.locator('[data-testid^=portal-obra-card-]', { hasText: OBRA });
    // Clicar numa obra já aberta fecharia a lista de capítulos.
    if (await cartao.getByText('Capítulos', { exact: true }).count() === 0) await cartao.getByText(OBRA, { exact: true }).click();
    await cartao.getByText('Capítulos', { exact: true }).waitFor();
    return cartao;
  };
  const blocoDoEp = (p, titulo) => p.locator('div.rounded-2xl', { has: p.getByText(titulo, { exact: true }) }).last();
  const abrirGrade = async (p, titulo) => {
    await blocoDoEp(p, titulo).getByRole('button', { name: 'Editar painéis' }).click();
    const grade = p.locator('[data-testid=grade-paineis]');
    await grade.waitFor();
    return grade;
  };
  const fecharGrade = async (p) => {
    await p.getByRole('button', { name: 'Fechar', exact: true }).last().click();
    await p.locator('[data-testid=grade-paineis]').waitFor({ state: 'detached' });
  };
  const cartoes = (p) => p.locator('[data-testid=grade-painel]');
  const esperarCartoes = (p, n) => p.waitForFunction(q => document.querySelectorAll('[data-testid=grade-painel]').length === q, n, { timeout: 30000 });
  const dialogoBalao = (p) => p.getByRole('dialog', { name: /^Balão / });
  const abrirBalao = async (p, idioma, n) => {
    await p.getByRole('button', { name: `Balão ${idioma.toUpperCase()} #${n}`, exact: true }).click();
    await dialogoBalao(p).waitFor();
    return dialogoBalao(p);
  };
  const fecharBalao = async (p) => {
    await dialogoBalao(p).getByRole('button', { name: 'Fechar', exact: true }).click();
    await dialogoBalao(p).waitFor({ state: 'detached' });
  };
  // Espera o banco chegar ao estado pedido (a tela grava e só depois redesenha).
  const esperarBanco = async (ler, teste, rotulo) => {
    for (let i = 0; i < 100; i++) {
      const v = await ler();
      if (teste(v)) return v;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`o banco não chegou ao estado esperado: ${rotulo}`);
  };
  const epDoBanco = (id) => Episode.findById(id).lean();

  const contarPartes = () => Object.entries(amb.pedidos.porRota).filter(([k]) => /^POST \/api\/envio-episodio\/[^/]+\/partes$/.test(k)).reduce((s, [, n]) => s + n, 0);
  const enviarPasta = async (p, ep, { arquivosSoltos = false, rotulo = '' } = {}) => {
    const partesAntes = contarPartes();
    await blocoDoEp(p, ep.titulo).getByRole('button', { name: 'Enviar pasta do episódio' }).click();
    if (arquivosSoltos) {
      const lista = fs.readdirSync(ep.pasta, { recursive: true }).map(f => path.join(ep.pasta, f)).filter(f => fs.statSync(f).isFile());
      await p.locator('[data-testid=envio-input-arquivos]').setInputFiles(lista);
    } else {
      await p.locator('[data-testid=envio-input-pasta]').setInputFiles(ep.pasta);
    }
    await p.locator('[data-testid=conferencia-envio]').waitFor({ timeout: 120000 });
    const resumo = await p.locator('[data-testid=resumo-paineis]').innerText();
    const tamanho = await p.locator('[data-testid=resumo-tamanho]').innerText();
    await p.locator('details summary').first().click().catch(() => {});
    const problemas = await p.locator('[data-testid=problema]').allInnerTexts();
    const fConf = await foto(p, `conferencia${rotulo}-ep${ep.numero}`, { fullPage: true });
    conferir(problemas.length === 0, `${ep.titulo}: tela de conferência`, 'resumo de páginas e painéis, sem problema', `${resumo} ${tamanho} Problemas: ${problemas.join(' | ') || 'nenhum'}`, [fConf]);
    await p.locator('[data-testid=envio-confirmo]').check();
    await p.locator('[data-testid=envio-enviar]').click();
    // Print no meio do envio, se der tempo de ver a barra.
    let fMeio = null;
    let textoMeio = '';
    try {
      await p.locator('[data-testid=envio-progresso]').waitFor({ timeout: 3000 });
      textoMeio = await p.locator('[data-testid=envio-progresso]').innerText({ timeout: 500 });
      fMeio = await foto(p, `enviando${rotulo}-ep${ep.numero}`);
    } catch { /* envio rápido demais para a barra aparecer */ }
    await p.getByRole('status').waitFor({ timeout: 240000 });
    const status = await p.getByRole('status').innerText();
    const fFim = await foto(p, `enviado${rotulo}-ep${ep.numero}`);
    const partes = (contarPartes()) - partesAntes;
    conferir(/Episódio enviado: \d+ painéis/.test(status) && partes >= 1, `${ep.titulo}: envio em partes`, 'envio conclui, em um ou mais pedidos de parte', `${status} ${partes} parte(s). ${textoMeio}`, [fMeio, fFim].filter(Boolean));
    await p.getByRole('button', { name: 'Fechar', exact: true }).last().click();
    return { resumo, tamanho, status, partes };
  };

  // ── leitor ──
  const esperarLeitor = async (pg) => {
    await pg.locator('[data-testid=painel-leitor]').first().waitFor({ timeout: 60000 });
  };
  const abrirLeitorPublico = async (ctx, quem, titulo) => {
    const pg = await novaPagina(ctx, quem);
    await pg.goto(`${TELA}/?abrir=${obraId}&tipo=hiqua`);
    await pg.getByText(titulo, { exact: true }).first().click();
    await esperarLeitor(pg);
    return pg;
  };
  const trocarIdioma = async (pg, idioma) => {
    const botao = pg.getByRole('button', { name: new RegExp(`^${ROTULOS[idioma]}( \\d+/\\d+)?$`) }).first();
    if (await botao.count() === 0) return false;
    // O cabeçalho do leitor some ao rolar: clique por script.
    await botao.evaluate(b => b.click());
    return true;
  };
  // O que o leitor mostra: imagem e balão de cada painel, na ordem da tela.
  const lerLeitor = (pg) => pg.evaluate(() => Array.from(document.querySelectorAll('[data-testid=painel-leitor]')).map(d => {
    const imgs = d.querySelectorAll('img');
    return { img: imgs[0]?.getAttribute('src') || null, camada: imgs[1]?.getAttribute('src') || null };
  }));
  const mostrarPainel = async (pg, n) => {
    const alvo = pg.locator('[data-testid=painel-leitor]').nth(n - 1);
    await alvo.scrollIntoViewIfNeeded();
    await alvo.evaluate(async d => {
      d.scrollIntoView({ block: 'start' });
      await Promise.all(Array.from(d.querySelectorAll('img')).map(i => (i.complete && i.naturalWidth > 0 ? null : new Promise(r => { i.onload = r; i.onerror = r; }))));
    });
    await pg.waitForTimeout(350);
  };
  // Confere o leitor inteiro contra uma lista de painéis esperada, em cada idioma.
  const conferirLeitor = async (pg, esperado, rotulo, painelDoPrint, nomeFoto) => {
    const prints = [];
    const diferencas = [];
    let idiomasVistos = 0;
    for (const idioma of IDIOMAS) {
      const temBotao = await trocarIdioma(pg, idioma);
      const algumBalao = esperado.some(x => x.camadas[idioma]);
      if (!temBotao && idioma !== 'pt') {
        if (algumBalao) diferencas.push(`sem botão ${ROTULOS[idioma]}`);
        continue;
      }
      idiomasVistos++;
      await pg.waitForTimeout(150);
      const visto = await lerLeitor(pg);
      if (visto.length !== esperado.length) diferencas.push(`${idioma}: ${visto.length} painéis na tela, esperados ${esperado.length}`);
      visto.forEach((v, i) => {
        const e = esperado[i];
        if (!e) return;
        if (v.img !== e.img) diferencas.push(`${idioma}: painel ${i + 1} com outra imagem`);
        if ((v.camada || null) !== (e.camadas[idioma] || null)) diferencas.push(`${idioma}: painel ${i + 1} com balão ${v.camada ? path.basename(v.camada) : 'nenhum'}, esperado ${e.camadas[idioma] ? path.basename(e.camadas[idioma]) : 'nenhum'}`);
      });
      await mostrarPainel(pg, painelDoPrint);
      prints.push(await foto(pg, `${nomeFoto}-${idioma}`));
    }
    conferir(diferencas.length === 0, rotulo, `${esperado.length} painéis, cada um com a imagem e o balão do banco, em cada idioma`, diferencas.length ? diferencas.slice(0, 6).join('; ') : `${esperado.length} painéis conferidos em ${idiomasVistos} idioma(s)`, prints);
  };
  // Emenda entre fatias: a linha de pixels na borda entre dois painéis não
  // pode ser mais escura que as vizinhas (uma fresta deixa ver o fundo preto).
  const medirEmenda = async (pg, n, nomeFoto, rotulo) => {
    await pg.locator('[data-testid=painel-leitor]').nth(n - 1).evaluate(el => {
      el.scrollIntoView({ block: 'start' });
      let rolador = el.parentElement;
      while (rolador && !(rolador.scrollHeight > rolador.clientHeight && /(auto|scroll)/.test(getComputedStyle(rolador).overflowY))) rolador = rolador.parentElement;
      (rolador || window).scrollBy(0, el.getBoundingClientRect().top - window.innerHeight / 2);
    });
    await pg.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid=painel-leitor] img')).filter(i => {
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }).every(i => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
    await pg.waitForTimeout(500);
    const arquivo = await foto(pg, nomeFoto);
    const bordas = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-testid=painel-leitor]'))
      .map(el => el.getBoundingClientRect().top * window.devicePixelRatio)
      .filter(y => y > 8 && y < window.innerHeight * window.devicePixelRatio - 8));
    const { data, info } = await sharp(path.join(saida, arquivo)).raw().toBuffer({ resolveWithObject: true });
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
    conferir(bordas.length > 0 && piorQueda < 12, rotulo, 'nenhuma linha escura na emenda entre fatias (queda de brilho abaixo de 12)', `${bordas.length} emenda(s) no print, pior queda de brilho ${piorQueda.toFixed(1)}`, [arquivo]);
  };

  // ── fila do moderador ──
  const abrirFila = async () => {
    await entrar(ctxAdmin, CONTAS.admin);
    const p = await novaPagina(ctxAdmin, 'moderador');
    await p.goto(`${TELA}/`);
    await p.getByRole('button', { name: 'Admin' }).click();
    await p.getByText('Aprovações', { exact: true }).first().click();
    await p.getByRole('heading', { name: 'Fila de Aprovação' }).waitFor();
    return p;
  };
  const itemDaFila = (p, titulo) => p.locator('div.rounded-3xl', { has: p.getByRole('heading', { name: titulo, exact: true }) });
  const fecharLeitorDaFila = async (p) => {
    await p.locator('header button').first().evaluate(b => b.click());
    await p.locator('[data-testid=painel-leitor]').first().waitFor({ state: 'detached' });
  };

  let obraId = null;

  // ═══════════════ a. autor: obra, capítulos, envio da pasta ═══════════════
  blocoAtual = 'a';
  console.log('\n== a. autor: Meu Estúdio, obra, capítulos e envio das pastas');
  let p = await abrirEstudio(ctxAutor);
  let f1 = await foto(p, 'meu-estudio-obras-vazio');
  await p.getByRole('button', { name: 'Nova obra' }).click();
  await p.locator('#portal-obra-title').fill(OBRA);
  await p.locator('#portal-obra-desc').fill('Obra criada pelo roteiro E2E local. Dados de teste.');
  await p.locator('#portal-obra-rating').selectOption('teen');
  await p.locator('[data-testid=portal-cover-input]').setInputFiles(arq('capa-e2e.jpg', 'image/jpeg', await pagina(['CAPA', 'DE TESTE'], { r: 150, g: 30, b: 60 }, 600, 800)));
  let f2 = await foto(p, 'nova-obra-formulario');
  await p.getByRole('button', { name: 'Criar', exact: true }).click();
  await p.locator('[data-testid^=portal-obra-card-]', { hasText: OBRA }).waitFor();
  const obra = await esperarBanco(() => Series.findOne({ title: OBRA }).lean(), s => s && s.cover_image, 'obra criada com capa');
  obraId = String(obra._id);
  let f3 = await foto(p, 'obra-criada');
  conferir(obra.content_type === 'hiqua' && !obra.isPublished && amb.existeNoCdn(obra.cover_image), 'criar obra Hi-Qua pelo Meu Estúdio', 'obra em rascunho, tipo hiqua, capa gravada no Bunny falso', `tipo ${obra.content_type}, publicada ${obra.isPublished}, capa ${path.basename(obra.cover_image)}`, [f1, f2, f3]);

  await abrirObra(p);
  for (const ep of eps) {
    await p.getByRole('button', { name: 'Novo capítulo' }).click();
    await p.locator('#portal-ep-title').fill(ep.titulo);
    await p.locator('#portal-ep-number').fill(String(ep.numero));
    await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByText(ep.titulo, { exact: true }).first().waitFor();
    ep.id = String((await esperarBanco(() => Episode.findOne({ title: ep.titulo }).lean(), x => !!x, 'capítulo criado'))._id);
  }
  f1 = await foto(p, 'capitulos-criados', { fullPage: true });
  conferir((await Episode.countDocuments({ seriesId: obra._id, status: 'draft' })) === eps.length, 'criar capítulos pelo Meu Estúdio', `${eps.length} capítulos em rascunho`, `${await Episode.countDocuments({ seriesId: obra._id })} capítulos no banco`, [f1]);

  for (const ep of eps) {
    console.log(`  -- ${ep.titulo}`);
    ep.envio = await enviarPasta(p, ep);
    const doc = await epDoBanco(ep.id);
    let errados = 0;
    let baloes = 0;
    ep.porIdioma = { pt: 0, en: 0, es: 0, zh: 0 };
    for (const painel of doc.panels) {
      const mp = await sharp(amb.arquivoNoCdn(painel.image_url)).metadata();
      if (mp.height > 1280) errados++;
      for (const c of painel.translationLayers) {
        const mb = await sharp(amb.arquivoNoCdn(c.imageUrl)).metadata();
        ep.porIdioma[c.language]++;
        baloes++;
        if (mb.width !== mp.width || mb.height !== mp.height) errados++;
      }
    }
    conferir(errados === 0 && doc.panels.length > 0, `${ep.titulo}: gravação`, 'painéis de até 1280 px no Bunny falso, cada balão do tamanho do painel dele', `${doc.panels.length} painéis, ${baloes} balões (${JSON.stringify(ep.porIdioma)}), ${errados} fora do tamanho`);
  }

  // ═══════════════ b. item 6: Editar painéis (rascunho) ═══════════════
  blocoAtual = 'b';
  console.log('\n== b. item 6: Editar painéis num rascunho');
  const epB = eps[0];
  let antes = retrato(await epDoBanco(epB.id));
  const total0 = antes.length;
  let grade = await abrirGrade(p, epB.titulo);
  await esperarCartoes(p, total0);
  f1 = await foto(p, 'grade-aberta');

  // b1: apagar um (o painel #2)
  await p.getByRole('button', { name: 'Apagar painel #2', exact: true }).click();
  let depois = retrato(await esperarBanco(() => epDoBanco(epB.id), e => e.panels.length === total0 - 1, 'apagar um'));
  await esperarCartoes(p, total0 - 1);
  f2 = await foto(p, 'apagou-painel-2');
  let esperado = antes.filter((_, i) => i !== 1);
  conferir(igual(depois, esperado) && !amb.existeNoCdn(antes[1].img), 'apagar um painel (#2)', 'só o #2 sai, os outros ficam como estavam, o arquivo dele some do Bunny falso', `${depois.length} painéis; resto intacto: ${igual(depois, esperado)}; arquivo apagado: ${!amb.existeNoCdn(antes[1].img)}`, [f1, f2]);

  // b2: apagar vários (#1 e #3 de agora)
  antes = depois;
  await p.getByRole('button', { name: 'Selecionar painel #1', exact: true }).click();
  await p.getByRole('button', { name: 'Selecionar painel #3', exact: true }).click();
  f1 = await foto(p, 'dois-selecionados');
  await p.getByRole('button', { name: 'Excluir 2' }).click();
  depois = retrato(await esperarBanco(() => epDoBanco(epB.id), e => e.panels.length === total0 - 3, 'apagar vários'));
  await esperarCartoes(p, total0 - 3);
  f2 = await foto(p, 'apagou-dois');
  esperado = antes.filter((_, i) => i !== 0 && i !== 2);
  conferir(igual(depois, esperado) && !amb.existeNoCdn(antes[0].img) && !amb.existeNoCdn(antes[2].img), 'apagar vários (#1 e #3)', 'só os dois selecionados saem, na ordem certa', `${depois.length} painéis; resto intacto: ${igual(depois, esperado)}`, [f1, f2]);

  // Alvos: um painel COM balão nos 4 idiomas (A) e o seguinte que também tem (B).
  antes = depois;
  const comQuatro = antes.map((x, i) => (IDIOMAS.every(l => x.camadas[l]) ? i : -1)).filter(i => i >= 0);
  if (comQuatro.length < 2) throw new Error('a 1a pasta precisa de 2 painéis com balão nos 4 idiomas');
  const iA = comQuatro[0];
  const iB = comQuatro[1];
  const semBalao = antes.findIndex(x => Object.keys(x.camadas).length === 0);
  const dim = await sharp(amb.arquivoNoCdn(antes[iB].img)).metadata();

  // b3: trocar a imagem do painel B (tem balões: posição e balões ficam)
  await p.getByLabel(`Trocar imagem do painel #${iB + 1}`, { exact: true }).setInputFiles(arq('imagem-trocada.jpg', 'image/jpeg', await pagina(['IMAGEM TROCADA', `painel ${iB + 1}`, 'teste E2E'], { r: 20, g: 110, b: 60 }, dim.width, dim.height)));
  depois = retrato(await esperarBanco(() => epDoBanco(epB.id), e => e.panels[iB].image_url !== antes[iB].img, 'trocar imagem'));
  await p.waitForFunction(([i, src]) => document.querySelectorAll('[data-testid=grade-painel] img')[i]?.getAttribute('src') === src, [iB, depois[iB].img]);
  await cartoes(p).nth(iB).scrollIntoViewIfNeeded();
  f1 = await foto(p, 'imagem-trocada');
  esperado = antes.map((x, i) => (i === iB ? { ...x, img: depois[iB].img } : x));
  conferir(igual(depois, esperado) && !amb.existeNoCdn(antes[iB].img) && amb.existeNoCdn(depois[iB].img), `trocar a imagem do painel #${iB + 1}`, 'só a imagem desse painel muda; posição, _id e balões ficam; a imagem antiga some do Bunny falso', `só o #${iB + 1} mudou: ${igual(depois, esperado)}; antiga apagada: ${!amb.existeNoCdn(antes[iB].img)}`, [f1]);

  // b4: trocar o balão EN do painel A
  antes = depois;
  let dlg = await abrirBalao(p, 'en', iA + 1);
  f1 = await foto(p, 'balao-en-antes');
  await dlg.getByLabel('Trocar balão (PNG)').setInputFiles(arq('balao-en-novo.png', 'image/png', await balao(['BALAO EN TROCADO', 'teste E2E'], dim.width, dim.height)));
  depois = retrato(await esperarBanco(() => epDoBanco(epB.id), e => (e.panels[iA].translationLayers.find(c => c.language === 'en') || {}).imageUrl !== antes[iA].camadas.en, 'trocar balão'));
  await p.waitForFunction(src => document.querySelector('[data-testid=grade-balao-atual]')?.getAttribute('src') === src, depois[iA].camadas.en);
  await p.waitForTimeout(400);
  f2 = await foto(p, 'balao-en-trocado');
  esperado = antes.map((x, i) => (i === iA ? { ...x, camadas: { ...x.camadas, en: depois[iA].camadas.en } } : x));
  conferir(igual(depois, esperado) && !amb.existeNoCdn(antes[iA].camadas.en), `trocar o balão EN do painel #${iA + 1}`, 'só o balão EN desse painel muda; o antigo some do Bunny falso', `só esse balão mudou: ${igual(depois, esperado)}; antigo apagado: ${!amb.existeNoCdn(antes[iA].camadas.en)}`, [f1, f2]);

  // b5: remover o balão ES do painel A
  antes = depois;
  await dlg.getByRole('button', { name: /^es/i }).click();
  await dlg.getByRole('button', { name: 'Remover balão' }).click();
  depois = retrato(await esperarBanco(() => epDoBanco(epB.id), e => !e.panels[iA].translationLayers.some(c => c.language === 'es'), 'remover balão'));
  await dlg.getByText('Este painel ainda não tem balão neste idioma.').waitFor();
  f1 = await foto(p, 'balao-es-removido');
  esperado = antes.map((x, i) => {
    if (i !== iA) return x;
    const { es: _fora, ...resto } = x.camadas;
    return { ...x, camadas: resto };
  });
  conferir(igual(depois, esperado) && !amb.existeNoCdn(antes[iA].camadas.es), `remover o balão ES do painel #${iA + 1}`, 'só o ES desse painel sai; PT, EN e ZH ficam', `só esse balão saiu: ${igual(depois, esperado)}; arquivo apagado: ${!amb.existeNoCdn(antes[iA].camadas.es)}`, [f1]);
  await fecharBalao(p);

  // b6: acrescentar balão ZH num painel que não tinha nenhum
  if (semBalao >= 0) {
    antes = depois;
    const dimS = await sharp(amb.arquivoNoCdn(antes[semBalao].img)).metadata();
    dlg = await abrirBalao(p, 'zh', semBalao + 1);
    await dlg.getByLabel('Enviar balão (PNG)').setInputFiles(arq('balao-zh-novo.png', 'image/png', await balao(['BALAO ZH NOVO', 'teste E2E'], dimS.width, dimS.height)));
    depois = retrato(await esperarBanco(() => epDoBanco(epB.id), e => e.panels[semBalao].translationLayers.some(c => c.language === 'zh'), 'acrescentar balão'));
    await p.locator('[data-testid=grade-balao-atual]').waitFor();
    await p.waitForTimeout(400);
    f1 = await foto(p, 'balao-zh-acrescentado');
    esperado = antes.map((x, i) => (i === semBalao ? { ...x, camadas: { zh: depois[semBalao].camadas.zh } } : x));
    conferir(igual(depois, esperado), `acrescentar balão ZH no painel #${semBalao + 1} (não tinha balão)`, 'só esse painel ganha o balão ZH', `só ele mudou: ${igual(depois, esperado)}`, [f1]);
    await fecharBalao(p);
  }

  // b7: imagem de outro tamanho num painel com balão é recusada, com aviso
  antes = depois;
  await p.getByLabel(`Trocar imagem do painel #${iA + 1}`, { exact: true }).setInputFiles(arq('tamanho-errado.jpg', 'image/jpeg', await pagina(['TAMANHO ERRADO'], { r: 90, g: 0, b: 0 }, dim.width, Math.max(200, dim.height - 400))));
  const aviso = p.locator('[data-testid=grade-paineis] [role=alert]').first();
  await aviso.waitFor({ timeout: 15000 });
  const textoAviso = await aviso.innerText();
  await aviso.scrollIntoViewIfNeeded();
  f1 = await foto(p, 'imagem-de-outro-tamanho-recusada');
  depois = retrato(await epDoBanco(epB.id));
  conferir(igual(depois, antes) && textoAviso.length > 5, 'imagem de outro tamanho em painel com balão', 'recusada com aviso na tela, nada muda', `aviso: "${textoAviso}"; episódio intacto: ${igual(depois, antes)}`, [f1]);
  await p.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  const esperadoB = depois; // é o que o leitor tem de mostrar para este episódio

  // ═══════════════ c. item 8: moderador lê o episódio da fila ═══════════════
  blocoAtual = 'c';
  console.log('\n== c. item 8: autor envia; moderador lê na Fila de Aprovação');
  await p.locator('[data-testid^=portal-obra-card-]', { hasText: OBRA }).getByRole('button', { name: 'Enviar para aprovação' }).click();
  await esperarBanco(() => Series.findById(obraId).lean(), s => !!s.submittedAt, 'obra enviada');
  await abrirObra(p);
  for (const ep of eps) {
    await blocoDoEp(p, ep.titulo).getByRole('button', { name: 'Enviar capítulo' }).click();
    await esperarBanco(() => epDoBanco(ep.id), e => !!e.submittedAt, `capítulo ${ep.numero} enviado`);
  }
  await p.waitForTimeout(500);
  f1 = await foto(p, 'autor-enviou-tudo', { fullPage: true });
  const emAnalise = await p.getByText('Em análise', { exact: true }).count();
  conferir(emAnalise >= eps.length + 1, 'autor envia a obra e os capítulos para aprovação', 'obra e capítulos aparecem como "Em análise"', `${emAnalise} marcações "Em análise" na tela`, [f1]);
  await p.close();

  let fila = await abrirFila();
  await itemDaFila(fila, epB.titulo).waitFor();
  f1 = await foto(fila, 'fila-de-aprovacao', { fullPage: true });
  const itensNaFila = await fila.getByRole('button', { name: 'Aprovar' }).count();
  conferir(itensNaFila === eps.length + 1, 'Fila de Aprovação do moderador', `1 obra e ${eps.length} episódios na fila`, `${itensNaFila} itens com botão Aprovar`, [f1]);

  await itemDaFila(fila, epB.titulo).getByRole('button', { name: 'Ler episódio' }).click();
  await esperarLeitor(fila);
  const cabecalho = await fila.locator('header').first().innerText();
  conferir(/PRÉVIA DA FILA/.test(cabecalho) && IDIOMAS.every(l => new RegExp(`${ROTULOS[l]} \\d+/\\d+`).test(cabecalho)), '"Ler episódio" abre o leitor em prévia', 'cabeçalho "PRÉVIA DA FILA" e os 4 idiomas com contagem de balões', cabecalho.replace(/\s+/g, ' '));
  await conferirLeitor(fila, esperadoB, `moderador lê ${epB.titulo} (com as edições do item 6) nos 4 idiomas, painel #${iA + 1}`, iA + 1, `fila-leitor-painel${iA + 1}`);
  await trocarIdioma(fila, 'pt');
  await mostrarPainel(fila, iB + 1);
  f1 = await foto(fila, `fila-leitor-painel${iB + 1}-imagem-trocada`);
  conferir((await lerLeitor(fila))[iB].img === esperadoB[iB].img, `leitor da fila mostra a imagem trocada no painel #${iB + 1}`, 'a imagem nova, no lugar certo, com os balões que já tinha', `painel #${iB + 1}: ${path.basename(esperadoB[iB].img)}`, [f1]);
  await fecharLeitorDaFila(fila);

  // Um episódio com página alta cortada, se houver, também pela fila.
  const epAlto = eps.find(e => /cortada/.test(e.envio.resumo) || Number((e.envio.resumo.match(/(\d+) página/) || [])[1]) < Number((e.envio.resumo.match(/viram (\d+)/) || [])[1]));
  if (epAlto && epAlto !== epB) {
    await itemDaFila(fila, epAlto.titulo).getByRole('button', { name: 'Ler episódio' }).click();
    await esperarLeitor(fila);
    await conferirLeitor(fila, retrato(await epDoBanco(epAlto.id)), `moderador lê ${epAlto.titulo} (página alta cortada) nos 4 idiomas`, 2, 'fila-leitor-pagina-alta');
    await fecharLeitorDaFila(fila);
  }

  // Quem não é admin não abre a rota de leitura da fila.
  await entrar(ctxLeitor, CONTAS.leitor);
  await entrar(ctxOutro, CONTAS.outroAutor);
  await entrar(ctxAutor, CONTAS.autor);
  const rotaLeitura = `/admin/aprovacoes/episodes/${epB.id}/leitura`;
  const negados = {
    'sem login': await pedir(ctxAnonimo, 'GET', rotaLeitura),
    leitor: await pedir(ctxLeitor, 'GET', rotaLeitura),
    'outro autor': await pedir(ctxOutro, 'GET', rotaLeitura),
    'o próprio autor': await pedir(ctxAutor, 'GET', rotaLeitura),
    'leitor, lista da fila': await pedir(ctxLeitor, 'GET', '/admin/aprovacoes'),
  };
  const admin200 = await pedir(ctxAdmin, 'GET', rotaLeitura);
  const pLeitor = await novaPagina(ctxLeitor, 'leitor');
  await pLeitor.goto(`${TELA}/`);
  await pLeitor.getByText('Conta', { exact: true }).first().waitFor();
  await pLeitor.waitForTimeout(1500);
  const botaoAdmin = await pLeitor.getByRole('button', { name: 'Admin' }).count();
  f1 = await foto(pLeitor, 'leitor-sem-botao-admin');
  await pLeitor.close();
  conferir(admin200 === 200 && negados['sem login'] === 401 && ['leitor', 'outro autor', 'o próprio autor', 'leitor, lista da fila'].every(k => negados[k] === 403) && botaoAdmin === 0,
    'outro usuário não abre a leitura da fila', 'admin 200; sem login 401; leitor, autor e outro autor 403; leitor sem botão Admin na tela', `admin ${admin200}; ${JSON.stringify(negados)}; botões Admin na tela do leitor: ${botaoAdmin}`, [f1]);

  // ═══════════════ d. item 7: aprovar, publicar, editar publicado ═══════════════
  blocoAtual = 'd';
  console.log('\n== d. item 7: aprovar e publicar; edição de publicado');
  const itemObra = itemDaFila(fila, OBRA);
  await itemObra.getByPlaceholder(/Gênero/).fill('Drama');
  await itemObra.getByLabel('Classificação etária').selectOption('teen');
  await itemObra.getByRole('button', { name: 'Aprovar' }).click();
  await esperarBanco(() => Series.findById(obraId).lean(), s => s.isPublished, 'obra publicada');
  for (const ep of eps) {
    await itemDaFila(fila, ep.titulo).getByRole('button', { name: 'Aprovar' }).click();
    await esperarBanco(() => epDoBanco(ep.id), e => e.status === 'published', `episódio ${ep.numero} publicado`);
    await itemDaFila(fila, ep.titulo).waitFor({ state: 'detached' });
  }
  await fila.getByText('Nenhum item pendente na fila').waitFor();
  f1 = await foto(fila, 'fila-vazia-depois-de-aprovar');
  conferir(true, 'moderador aprova a obra e os episódios', 'obra publicada, episódios publicados, fila vazia', `obra publicada; ${await Episode.countDocuments({ seriesId: obra._id, status: 'published' })} episódios publicados`, [f1]);
  await fila.close();

  await entrar(ctxLeitor, CONTAS.leitor);
  for (const ep of eps) {
    const doc = retrato(await epDoBanco(ep.id));
    const alvo = ep === epB ? iA + 1 : Math.max(1, doc.findIndex(x => Object.keys(x.camadas).length > 0) + 1);
    const pg = await abrirLeitorPublico(ctxLeitor, 'leitor', ep.titulo);
    await conferirLeitor(pg, doc, `leitor público (desktop) lê ${ep.titulo} nos idiomas do episódio, painel #${alvo}`, alvo, `leitor-desktop-ep${ep.numero}`);
    await pg.close();
  }

  // Edição de publicado: o 2o episódio.
  const epD = eps[1];
  const noAr = retrato(await epDoBanco(epD.id));
  const comBalaoD = noAr.map((x, i) => (IDIOMAS.every(l => x.camadas[l]) ? i : -1)).filter(i => i >= 1);
  if (comBalaoD.length < 1) throw new Error('a 2a pasta precisa de um painel (que não o 1o) com balão nos 4 idiomas');
  const jD = comBalaoD[0]; // índice no ar; na edição vira jD - 1 (o #1 sai)
  const dimD = await sharp(amb.arquivoNoCdn(noAr[jD].img)).metadata();
  const revisaoDoBanco = () => RevisaoEpisodio.findById(epD.id).lean();

  p = await abrirEstudio(ctxAutor);
  await abrirObra(p);
  grade = await abrirGrade(p, epD.titulo);
  await esperarCartoes(p, noAr.length);
  const avisoRev = await p.locator('[data-testid=grade-aviso-revisao]').innerText();
  f1 = await foto(p, 'grade-do-publicado-com-aviso');
  await p.getByRole('button', { name: 'Apagar painel #1', exact: true }).click();
  await esperarBanco(revisaoDoBanco, r => r && r.panels.length === noAr.length - 1, 'edição sem o painel 1');
  await esperarCartoes(p, noAr.length - 1);
  dlg = await abrirBalao(p, 'pt', jD);
  await dlg.getByLabel('Trocar balão (PNG)').setInputFiles(arq('balao-pt-edicao.png', 'image/png', await balao(['BALAO PT DA EDICAO', 'teste E2E'], dimD.width, dimD.height)));
  let rev = await esperarBanco(revisaoDoBanco, r => (r.panels[jD - 1].translationLayers.find(c => c.language === 'pt') || {}).imageUrl !== noAr[jD].camadas.pt, 'balão PT da edição');
  await p.waitForFunction(src => document.querySelector('[data-testid=grade-balao-atual]')?.getAttribute('src') === src, retrato(rev)[jD - 1].camadas.pt);
  await p.waitForTimeout(400);
  f2 = await foto(p, 'edicao-balao-pt-trocado');
  await fecharBalao(p);
  await fecharGrade(p);
  const blocoRev = p.locator(`[data-testid=portal-revisao-${epD.id}]`);
  await blocoRev.getByText(/Edição não enviada/).waitFor();
  f3 = await foto(p, 'autor-edicao-nao-enviada', { fullPage: true });
  let arNoBanco = retrato(await epDoBanco(epD.id));
  conferir(/publicado/i.test(avisoRev) && igual(arNoBanco, noAr) && rev.panels.length === noAr.length - 1, `autor edita o publicado (${epD.titulo}): apaga o #1 e troca o balão PT do #${jD + 1}`, 'aviso de que vira edição; a edição fica à parte com 1 painel a menos; o episódio no ar não muda', `aviso: "${avisoRev.slice(0, 60)}..."; no ar intacto: ${igual(arNoBanco, noAr)}; edição com ${rev.panels.length} painéis (no ar ${noAr.length}); tela: "${(await blocoRev.locator('p').first().innerText()).trim()}"`, [f1, f2, f3]);

  let pg = await abrirLeitorPublico(ctxLeitor, 'leitor', epD.titulo);
  await conferirLeitor(pg, noAr, `leitor público continua na versão do ar (${epD.titulo}) com a edição em rascunho`, jD + 1, 'leitor-ainda-versao-do-ar');
  await pg.close();

  await blocoRev.getByRole('button', { name: 'Enviar edição para aprovação' }).click();
  await blocoRev.getByText(/Edição em análise/).waitFor();
  f1 = await foto(p, 'autor-edicao-em-analise', { fullPage: true });
  await abrirGrade(p, epD.titulo);
  const botoesNaGradeTravada = await p.locator('[data-testid=grade-paineis] button[aria-label^="Apagar painel"]').count();
  f2 = await foto(p, 'grade-so-leitura-em-analise');
  await fecharGrade(p);
  conferir((await revisaoDoBanco()).status === 'enviada' && botoesNaGradeTravada === 0, 'autor envia a edição para aprovação', '"Edição em análise"; a grade fica só para ver, sem botão de ação', `status ${(await revisaoDoBanco()).status}; botões de apagar na grade: ${botoesNaGradeTravada}`, [f1, f2]);
  await p.close();

  // Moderador: lê a edição e devolve com motivo.
  const MOTIVO = 'Teste E2E: o balão novo cobre o rosto do personagem, ajuste e reenvie.';
  fila = await abrirFila();
  let item = itemDaFila(fila, epD.titulo);
  await item.waitFor();
  const textoItem = (await item.innerText()).replace(/\s+/g, ' ');
  f1 = await foto(fila, 'fila-com-edicao-de-publicado');
  await item.getByRole('button', { name: 'Ler edição' }).click();
  await esperarLeitor(fila);
  await conferirLeitor(fila, retrato(await revisaoDoBanco()), `moderador lê a EDIÇÃO de ${epD.titulo} (1 painel a menos, balão PT novo)`, jD, 'fila-leitor-da-edicao');
  await fecharLeitorDaFila(fila);
  conferir(/Edição de publicado/i.test(textoItem) && new RegExp(`${noAr.length - 1} painéis na edição \\(no ar: ${noAr.length}\\)`).test(textoItem), 'fila mostra a edição de publicado', `selo "Edição de publicado" e "${noAr.length - 1} painéis na edição (no ar: ${noAr.length})"`, textoItem.slice(0, 200), [f1]);
  await item.getByRole('button', { name: 'Devolver' }).click();
  await fila.getByPlaceholder(/Motivo da devolução/).fill(MOTIVO);
  f1 = await foto(fila, 'moderador-devolve-com-motivo');
  await fila.getByRole('button', { name: 'Confirmar devolução' }).click();
  await esperarBanco(revisaoDoBanco, r => r && r.status !== 'enviada', 'edição devolvida');
  await fila.getByText('Nenhum item pendente na fila').waitFor();
  await fila.close();
  arNoBanco = retrato(await epDoBanco(epD.id));
  conferir(igual(arNoBanco, noAr), 'moderador devolve a edição com motivo', 'a edição sai da fila; nada muda no ar', `no ar intacto: ${igual(arNoBanco, noAr)}; edição: status ${(await revisaoDoBanco()).status}`, [f1]);

  pg = await abrirLeitorPublico(ctxLeitor, 'leitor', epD.titulo);
  await conferirLeitor(pg, noAr, `leitor público continua na versão do ar depois da devolução (${epD.titulo})`, jD + 1, 'leitor-depois-da-devolucao');
  await pg.close();

  // Autor vê o motivo, ajusta e reenvia.
  p = await abrirEstudio(ctxAutor);
  await abrirObra(p);
  const blocoRev2 = p.locator(`[data-testid=portal-revisao-${epD.id}]`);
  await blocoRev2.getByText(/Edição devolvida/).waitFor();
  const textoDevolvida = (await blocoRev2.innerText()).replace(/\s+/g, ' ');
  await blocoRev2.scrollIntoViewIfNeeded();
  f1 = await foto(p, 'autor-ve-o-motivo');
  await p.getByRole('button', { name: 'Mensagens', exact: true }).click();
  await p.waitForTimeout(1200);
  const naAbaMensagens = await p.getByText(MOTIVO).count();
  f2 = await foto(p, 'autor-mensagens');
  await p.getByRole('button', { name: 'Obras', exact: true }).click();
  await abrirObra(p);
  conferir(textoDevolvida.includes(MOTIVO), 'autor vê o motivo da devolução', `"Edição devolvida" e "Motivo: ${MOTIVO}" no capítulo`, `${textoDevolvida.slice(0, 220)} | na aba Mensagens: ${naAbaMensagens} vez(es)`, [f1, f2]);

  await abrirGrade(p, epD.titulo);
  await esperarCartoes(p, noAr.length - 1);
  dlg = await abrirBalao(p, 'es', jD);
  await dlg.getByRole('button', { name: 'Remover balão' }).click();
  rev = await esperarBanco(revisaoDoBanco, r => !r.panels[jD - 1].translationLayers.some(c => c.language === 'es'), 'ES removido na edição');
  f1 = await foto(p, 'autor-ajusta-a-edicao');
  await fecharBalao(p);
  await fecharGrade(p);
  await p.locator(`[data-testid=portal-revisao-${epD.id}]`).getByRole('button', { name: 'Enviar edição para aprovação' }).click();
  await p.locator(`[data-testid=portal-revisao-${epD.id}]`).getByText(/Edição em análise/).waitFor();
  f2 = await foto(p, 'autor-reenviou-a-edicao', { fullPage: true });
  conferir((await revisaoDoBanco()).status === 'enviada', 'autor ajusta (remove o balão ES) e reenvia a edição', '"Edição em análise" de novo', `status ${(await revisaoDoBanco()).status}`, [f1, f2]);
  const edicaoFinal = retrato(await revisaoDoBanco());

  // Moderador aprova; o leitor troca.
  fila = await abrirFila();
  item = itemDaFila(fila, epD.titulo);
  await item.getByRole('button', { name: 'Aprovar' }).click();
  await esperarBanco(() => epDoBanco(epD.id), e => e.panels.length === noAr.length - 1, 'edição no ar');
  await fila.getByText('Nenhum item pendente na fila').waitFor();
  f1 = await foto(fila, 'moderador-aprovou-a-edicao');
  await fila.close();
  arNoBanco = retrato(await epDoBanco(epD.id));
  const semIds = (l) => l.map(x => ({ img: x.img, camadas: x.camadas }));
  const sairam = [noAr[0].img, ...Object.values(noAr[0].camadas), noAr[jD].camadas.pt, noAr[jD].camadas.es];
  conferir(igual(semIds(arNoBanco), semIds(edicaoFinal)) && sairam.every(u => !amb.existeNoCdn(u)) && !(await revisaoDoBanco()), 'moderador aprova a edição', 'os painéis no ar passam a ser os da edição, de uma vez; os arquivos que saíram somem do Bunny falso; a edição deixa de existir', `no ar = edição: ${igual(semIds(arNoBanco), semIds(edicaoFinal))}; arquivos antigos apagados: ${sairam.filter(u => !amb.existeNoCdn(u)).length}/${sairam.length}; edição ainda no banco: ${!!(await revisaoDoBanco())}`, [f1]);

  pg = await abrirLeitorPublico(ctxLeitor, 'leitor', epD.titulo);
  await conferirLeitor(pg, arNoBanco, `leitor público passa a ver a edição aprovada (${epD.titulo})`, jD, 'leitor-versao-nova');
  await pg.close();

  // Reenvio da PASTA em episódio publicado vira edição; descartar não mexe no ar.
  const epR = eps[2];
  const noArR = retrato(await epDoBanco(epR.id));
  await p.reload();
  await p.getByText('Conta', { exact: true }).first().click();
  await p.locator('[data-testid=meu-estudio-card]').click();
  await p.getByRole('button', { name: 'Obras', exact: true }).click();
  await abrirObra(p);
  await blocoDoEp(p, epR.titulo).getByRole('button', { name: 'Enviar pasta do episódio' }).click();
  const avisoEnvio = await p.locator('[data-testid=envio-aviso-revisao]').innerText();
  await p.locator('[data-testid=envio-input-pasta]').setInputFiles(epR.pasta);
  await p.locator('[data-testid=conferencia-envio]').waitFor({ timeout: 120000 });
  f1 = await foto(p, 'reenvio-da-pasta-em-publicado', { fullPage: true });
  await p.locator('[data-testid=envio-confirmo]').check();
  await p.locator('[data-testid=envio-enviar]').click();
  await p.getByRole('status').waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  const blocoRevR = p.locator(`[data-testid=portal-revisao-${epR.id}]`);
  await blocoRevR.getByText(/Edição não enviada/).waitFor();
  const revR = await RevisaoEpisodio.findById(epR.id).lean();
  await blocoRevR.scrollIntoViewIfNeeded();
  f2 = await foto(p, 'pasta-reenviada-virou-edicao');
  const arquivosDaEdicao = retrato(revR).flatMap(x => [x.img, ...Object.values(x.camadas)]);
  conferir(/publicado/i.test(avisoEnvio) && igual(retrato(await epDoBanco(epR.id)), noArR) && revR.panels.length > 0 && arquivosDaEdicao.every(u => amb.existeNoCdn(u)), `reenvio da pasta em publicado (${epR.titulo})`, 'aviso de que vira edição; a pasta fica guardada como edição; o episódio no ar não muda', `no ar intacto: ${igual(retrato(await epDoBanco(epR.id)), noArR)}; edição com ${revR.panels.length} painéis`, [f1, f2]);
  await blocoRevR.getByRole('button', { name: 'Descartar edição' }).click();
  await esperarBanco(() => RevisaoEpisodio.findById(epR.id).lean(), r => !r, 'edição descartada');
  await p.waitForTimeout(500);
  f1 = await foto(p, 'edicao-descartada', { fullPage: true });
  const noArDepois = retrato(await epDoBanco(epR.id));
  const sobraram = arquivosDaEdicao.filter(u => amb.existeNoCdn(u)).length;
  const doArInteiros = noArR.flatMap(x => [x.img, ...Object.values(x.camadas)]).every(u => amb.existeNoCdn(u));
  conferir(igual(noArDepois, noArR) && doArInteiros && sobraram === 0, 'autor descarta a edição', 'a edição some, os arquivos dela saem do Bunny falso, o episódio no ar e os arquivos dele ficam', `no ar intacto: ${igual(noArDepois, noArR)}; arquivos do ar inteiros: ${doArInteiros}; arquivos da edição que sobraram: ${sobraram}/${arquivosDaEdicao.length}`, [f1]);
  await p.close();

  // ═══════════════ e. celular (Pixel 7) ═══════════════
  blocoAtual = 'e';
  console.log('\n== e. celular (emulação Pixel 7)');
  await entrar(ctxLeitorCel, CONTAS.leitorCelular);
  for (const ep of eps) {
    const doc = retrato(await epDoBanco(ep.id));
    const alvo = Math.max(1, doc.findIndex(x => Object.keys(x.camadas).length > 0) + 1);
    pg = await abrirLeitorPublico(ctxLeitorCel, 'leitor no celular', ep.titulo);
    await conferirLeitor(pg, doc, `leitor público (celular) lê ${ep.titulo}, painel #${alvo}`, alvo, `leitor-celular-ep${ep.numero}`);
    // Emenda: entre duas fatias da mesma página, se o episódio tem página
    // cortada; senão entre dois painéis seguidos (páginas diferentes).
    const fatia2 = doc.findIndex((x, i) => i > 0 && /-2(-[a-z]{2})?\.(jpg|png)$/.test(x.img));
    await medirEmenda(pg, fatia2 > 0 ? fatia2 + 1 : 2, `emenda-celular-ep${ep.numero}`, `${ep.titulo} no celular: emenda ${fatia2 > 0 ? `entre fatias da mesma página (painel #${fatia2 + 1})` : 'entre os painéis #1 e #2'}`);
    await pg.close();
  }

  // Autor no celular: capítulo novo, envio por "vários arquivos", grade.
  const epCel = { pasta: eps[2].pasta, numero: eps.length + 1, titulo: `EP ${eps.length + 1} pelo celular` };
  p = await abrirEstudio(ctxAutorCel, 'autor no celular');
  await abrirObra(p);
  await p.getByRole('button', { name: 'Novo capítulo' }).tap();
  await p.locator('#portal-ep-title').fill(epCel.titulo);
  await p.locator('#portal-ep-number').fill(String(epCel.numero));
  await p.getByRole('button', { name: 'Criar', exact: true }).tap();
  await p.getByText(epCel.titulo, { exact: true }).first().waitFor();
  epCel.id = String((await esperarBanco(() => Episode.findOne({ title: epCel.titulo }).lean(), x => !!x, 'capítulo do celular'))._id);
  await blocoDoEp(p, epCel.titulo).scrollIntoViewIfNeeded();
  f1 = await foto(p, 'celular-meu-estudio-capitulos');
  conferir(true, 'Meu Estúdio no celular: criar capítulo', 'capítulo criado em rascunho', epCel.titulo, [f1]);
  await enviarPasta(p, epCel, { arquivosSoltos: true, rotulo: '-celular' });
  await blocoDoEp(p, epCel.titulo).getByRole('button', { name: 'Editar painéis' }).waitFor();

  antes = retrato(await epDoBanco(epCel.id));
  await blocoDoEp(p, epCel.titulo).getByRole('button', { name: 'Editar painéis' }).tap();
  await p.locator('[data-testid=grade-paineis]').waitFor();
  await esperarCartoes(p, antes.length);
  await p.waitForTimeout(800);
  f1 = await foto(p, 'celular-grade');
  // Usável com o dedo: botões visíveis sem passar o mouse e com área de toque.
  const medidas = await p.evaluate(() => {
    const cartao = document.querySelector('[data-testid=grade-painel]');
    const caixa = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), opacidade: Number(getComputedStyle(el.closest('div.absolute') || el).opacity) }; };
    const apagar = cartao.querySelector('button[aria-label^="Apagar painel"]');
    const trocar = cartao.querySelector('label');
    const selecionar = cartao.querySelector('button[aria-label^="Selecionar painel"]');
    const idioma = cartao.querySelector('button[aria-label^="Balão"]');
    const grade = document.querySelector('[data-testid=grade-paineis]');
    return {
      apagar: caixa(apagar), trocar: caixa(trocar),
      selecionar: { ...caixa(selecionar), opacidade: Number(getComputedStyle(selecionar).opacity) },
      idioma: caixa(idioma),
      colunas: getComputedStyle(grade.querySelector('.grid')).gridTemplateColumns.split(' ').length,
      larguraCartao: Math.round(cartao.getBoundingClientRect().width),
      transbordaNaHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  const menorAlvo = Math.min(medidas.apagar.w, medidas.apagar.h, medidas.trocar.w, medidas.trocar.h, medidas.selecionar.w, medidas.selecionar.h, medidas.idioma.h);
  conferir(medidas.apagar.opacidade >= 0.7 && medidas.selecionar.opacidade >= 0.5 && !medidas.transbordaNaHorizontal && menorAlvo >= 24, 'grade de painéis no celular: botões à vista e tocáveis', 'botões visíveis sem mouse, sem rolagem lateral, alvo de toque de pelo menos 24 px (mínimo da WCAG 2.2)', JSON.stringify(medidas), [f1]);

  await p.getByRole('button', { name: 'Apagar painel #2', exact: true }).tap();
  depois = retrato(await esperarBanco(() => epDoBanco(epCel.id), e => e.panels.length === antes.length - 1, 'apagar no celular'));
  await esperarCartoes(p, antes.length - 1);
  f1 = await foto(p, 'celular-apagou-painel-2');
  conferir(igual(depois, antes.filter((_, i) => i !== 1)), 'celular: apagar um painel com o dedo (#2)', 'só o #2 sai', `${depois.length} painéis; resto intacto: ${igual(depois, antes.filter((_, i) => i !== 1))}`, [f1]);

  antes = depois;
  const dimC = await sharp(amb.arquivoNoCdn(antes[0].img)).metadata();
  await p.getByRole('button', { name: 'Balão PT #1', exact: true }).tap();
  dlg = dialogoBalao(p);
  await dlg.waitFor();
  f1 = await foto(p, 'celular-dialogo-do-balao');
  const rotuloEnvio = antes[0].camadas.pt ? 'Trocar balão (PNG)' : 'Enviar balão (PNG)';
  await dlg.getByLabel(rotuloEnvio).setInputFiles(arq('balao-pt-celular.png', 'image/png', await balao(['BALAO PT', 'pelo celular'], dimC.width, dimC.height)));
  depois = retrato(await esperarBanco(() => epDoBanco(epCel.id), e => (e.panels[0].translationLayers.find(c => c.language === 'pt') || {}).imageUrl && (e.panels[0].translationLayers.find(c => c.language === 'pt') || {}).imageUrl !== antes[0].camadas.pt, 'balão no celular'));
  await p.locator('[data-testid=grade-balao-atual]').waitFor();
  await p.waitForTimeout(500);
  f2 = await foto(p, 'celular-balao-enviado');
  const caixaDlg = await dlg.locator('> div').boundingBox();
  const vp = p.viewportSize();
  conferir(igual(depois.slice(1), antes.slice(1)) && caixaDlg.x >= 0 && caixaDlg.x + caixaDlg.width <= vp.width + 1 && caixaDlg.y >= 0 && caixaDlg.y + caixaDlg.height <= vp.height + 1, 'celular: balão PT do painel #1 pela janela do balão', 'a janela cabe na tela do celular; só o balão desse painel muda', `janela ${Math.round(caixaDlg.width)}x${Math.round(caixaDlg.height)} em tela ${vp.width}x${vp.height}; resto intacto: ${igual(depois.slice(1), antes.slice(1))}`, [f1, f2]);
  await p.close();

  // ── fecho ──
  blocoAtual = 'z';
  conferir(errosDeTela.length === 0, 'erros de JavaScript nas telas', 'nenhum', errosDeTela.length ? errosDeTela.slice(0, 5).join(' | ') : 'nenhum');
  // Esperados: 401 de visitante sem sessão; 403 do Meu Estúdio de quem não tem
  // canal; a imagem recusada de propósito (b7); e 403 no refresh-token, que é
  // do modo de desenvolvimento (o StrictMode do React roda a restauração da
  // sessão duas vezes e a segunda chega com o token já trocado).
  const inesperadas = respostasRuins.filter(r => !/ 401 | 403 GET \/api\/portal\/meu-estudio| 403 POST \/api\/auth\/refresh-token| 40\d PUT \/api\/edicao-paineis\/:id\/paineis\/:id\/imagem/.test(r));
  conferir(inesperadas.length === 0 && amb.pedidos.recusados429 === 0, 'respostas de erro da API durante o roteiro', 'nenhuma fora das esperadas (401 sem sessão, 403 de quem não tem canal, 403 do refresh dobrado do modo dev, a imagem recusada de propósito), nenhum 429', inesperadas.length ? inesperadas.slice(0, 8).join(' | ') : `nenhuma inesperada (${respostasRuins.length} esperadas); 429: ${amb.pedidos.recusados429}`);

  const falhas = passos.filter(x => !x.ok);
  fs.writeFileSync(path.join(saida, 'relatorio.json'), JSON.stringify({
    quando: new Date().toISOString(), pastas: eps.map(e => ({ titulo: e.titulo, envio: e.envio, porIdioma: e.porIdioma })),
    falhas: falhas.length, passos, errosDeTela, respostasRuins, pedidos: amb.pedidos,
  }, null, 1));
  const md = ['| Bloco | Passo | Esperado | Obtido | Resultado | Prints |', '|---|---|---|---|---|---|']
    .concat(passos.map(x => `| ${x.bloco} | ${x.passo} | ${x.esperado} | ${x.obtido.replace(/\|/g, '/').replace(/\n/g, ' ')} | ${x.ok ? 'passou' : 'FALHOU'} | ${x.prints.map(f => `[${f}](${f})`).join(' ')} |`));
  fs.writeFileSync(path.join(saida, 'passos.md'), md.join('\n') + '\n');
  console.log(`\npedidos à API: ${amb.pedidos.total}, recusados (429): ${amb.pedidos.recusados429}`);
  await navegador.close();
  await amb.derrubar();
  console.log(falhas.length ? `\n${falhas.length} falha(s) em ${passos.length} passos.` : `\nTudo conferido: ${passos.length} passos.`);
  process.exit(falhas.length ? 1 : 0);
})().catch(async e => {
  console.error(e);
  if (paginaAtual) await paginaAtual.screenshot({ path: path.join(saida, 'erro.png'), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(saida, 'relatorio-parcial.json'), JSON.stringify({ erro: String(e && e.stack || e), passos }, null, 1));
  process.exit(1);
});
