/**
 * Frente A, item 3: gravação do envio de pasta no servidor
 * (routes/envioEpisodio.js + services/envioEpisodioService.js).
 *
 * Critério de aceite da proposta de 21/11/2026: "No Bunny aparece uma pasta
 * por episódio. Um episódio que passa de 184 painéis depois do corte é
 * recusado com aviso, e mudar o limite na configuração muda a recusa. Um
 * envio interrompido não deixa o episódio pela metade." E, do item: o
 * servidor confere de novo cada arquivo; mandar a pasta de novo substitui o
 * episódio inteiro e apaga do Bunny os arquivos anteriores dele.
 *
 * Bunny: nenhum pedido sai daqui. utils/bunnyStorage.js recebe um envio e um
 * apagar falsos que guardam o que receberam. As imagens são reais (sharp),
 * porque o servidor confere tipo e tamanho pelo conteúdo.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Series, Channel, User, Setting, EnvioEpisodio, bunny, O;

const CDN = 'cdn-envio-teste.b-cdn.net';
let noBunny; // caminho -> buffer
let apagados; // caminhos
let falharUmaVez; // Set de caminhos que falham no próximo envio

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  Setting = require('../../models/Setting');
  EnvioEpisodio = require('../../models/EnvioEpisodio');
  bunny = require('../../utils/bunnyStorage');
  O = await import('../../shared/organizacaoEpisodio.mjs');
  await auth.createUsers(app);
});

const ambiente = {};
beforeAll(() => {
  for (const k of ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_KEY', 'BUNNY_STORAGE_HOSTNAME']) ambiente[k] = process.env[k];
  process.env.BUNNY_STORAGE_ZONE = 'zona-envio-teste';
  process.env.BUNNY_STORAGE_KEY = 'chave-envio-teste';
  process.env.BUNNY_STORAGE_HOSTNAME = CDN;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(ambiente)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  bunny.__setUploaderForTests(null);
  bunny.__setDeleterForTests(null);
  await db.closeDatabase();
});

beforeEach(async () => {
  noBunny = new Map();
  apagados = [];
  falharUmaVez = new Set();
  bunny.__setUploaderForTests(async (buffer, caminho) => {
    if (falharUmaVez.has(caminho)) { falharUmaVez.delete(caminho); throw new Error('Bunny caiu'); }
    noBunny.set(caminho, buffer);
    return `https://${CDN}/${caminho}`;
  });
  bunny.__setDeleterForTests(async (caminho) => { apagados.push(caminho); noBunny.delete(caminho); });
  await Setting.deleteMany({ key: { $in: ['limite_paineis_episodio', 'limite_mb_episodio'] } });
});

// ─── imagens ───────────────────────────────────────────────────────────────
const cache = new Map();
async function jpeg(largura, altura) {
  const k = `j${largura}x${altura}`;
  if (!cache.has(k)) cache.set(k, await sharp({ create: { width: largura, height: altura, channels: 3, background: '#88aacc' } }).jpeg().toBuffer());
  return cache.get(k);
}
async function png(largura, altura) {
  const k = `p${largura}x${altura}`;
  if (!cache.has(k)) cache.set(k, await sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
  return cache.get(k);
}

// ─── pessoas e conteúdo ────────────────────────────────────────────────────
let contador = 0;
async function criarAutor() {
  contador += 1;
  const email = `envio-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash('Senha@123', 4);
  const user = await User.create({ email, passwordHash, nome: `Autor ${contador}`, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Envio ${contador} ${Date.now()}` });
  return { token: login.body.accessToken, canal };
}

async function criarEpisodio({ canalId = null, status = 'draft', submittedAt = null, numero = 4, panels = [], titulo = 'The Near Ones' } = {}) {
  const series = await Series.create({ title: titulo, content_type: 'hiqua', channelId: canalId, isPublished: status === 'published', genre: 'Drama' });
  const episode = await Episode.create({ seriesId: series._id, episode_number: numero, title: `EP${numero}`, status, submittedAt, panels });
  return { series, episode };
}

const tres = (n) => String(n).padStart(3, '0');
const SUFIXO = { pt: 'PORT', en: 'ENG', es: 'ESP', zh: 'ZHO' };

/**
 * Pasta de teste. `paginas`: [{ n, largura, altura, baloes: ['en', ...] }].
 * Devolve a lista para o iniciar e os bytes de cada arquivo, pelo índice.
 */
async function montarPasta(paginas, { capa = false } = {}) {
  const lista = [];
  const bytes = [];
  if (capa) { bytes.push(await jpeg(60, 90)); lista.push({ nome: 'EP/Capa.jpeg', largura: 60, altura: 90, tamanho: bytes.at(-1).length }); }
  for (const p of paginas) {
    bytes.push(await jpeg(p.largura, p.altura));
    lista.push({ nome: `EP/Pagina ${tres(p.n)}.jpeg`, largura: p.largura, altura: p.altura, tamanho: bytes.at(-1).length });
    for (const idioma of p.baloes || []) {
      bytes.push(await png(p.largura, p.altura));
      lista.push({ nome: `EP/Pagina ${tres(p.n)}_${SUFIXO[idioma]}.png`, largura: p.largura, altura: p.altura, tamanho: bytes.at(-1).length });
    }
  }
  return { lista, bytes };
}

/** O que o navegador faz no item 4: corta a fatia e manda pela chave. */
async function recortar(bytes, a) {
  if (a.tipo === 'capa') return bytes;
  const meta = await sharp(bytes).metadata();
  if (a.y === 0 && a.altura === meta.height) return bytes;
  const s = sharp(bytes).extract({ left: 0, top: a.y, width: a.largura, height: a.altura });
  return a.tipo === 'balao' ? s.png().toBuffer() : s.jpeg().toBuffer();
}

function iniciar(token, episodeId, lista) {
  return request(app).post(`/api/envio-episodio/${episodeId}/iniciar`).set('Authorization', `Bearer ${token}`).send({ arquivos: lista });
}

async function enviarParte(token, envioId, itens) {
  let r = request(app).post(`/api/envio-episodio/${envioId}/partes`).set('Authorization', `Bearer ${token}`);
  for (const { chave, buffer, tipo } of itens) {
    r = r.attach(chave, buffer, { filename: `${chave}.${tipo === 'balao' ? 'png' : 'jpg'}`, contentType: tipo === 'balao' ? 'image/png' : 'image/jpeg' });
  }
  return r;
}

async function enviarTudo(token, iniciado, bytes, { porParte = 12 } = {}) {
  const itens = [];
  for (const a of iniciado.arquivos) itens.push({ chave: a.chave, tipo: a.tipo, buffer: await recortar(bytes[a.indice], a) });
  for (let i = 0; i < itens.length; i += porParte) {
    const r = await enviarParte(token, iniciado.envioId, itens.slice(i, i + porParte));
    expect(r.status).toBe(200);
  }
  return itens;
}

function concluir(token, envioId) {
  return request(app).post(`/api/envio-episodio/${envioId}/concluir`).set('Authorization', `Bearer ${token}`);
}

const EP4_COM_BALAO = [4, 5, 7, 8, 9, 11, 13, 16, 17, 19];
function ep4(largura = 80, altura = 128) {
  return Array.from({ length: 24 }, (_, i) => ({
    n: i + 1, largura, altura, baloes: EP4_COM_BALAO.includes(i + 1) ? ['pt', 'en', 'es', 'zh'] : [],
  }));
}

const admin = () => auth.getToken('admin');
const caminho = (url) => url.replace(`https://${CDN}/`, '');

// ═══════════════════════════════════════════════════════════════════════════

describe('envio da pasta inteira', () => {
  it('EP4 pelo admin: cada balão no painel do número dele, tudo numa pasta do episódio no Bunny', async () => {
    const { episode } = await criarEpisodio({ status: 'published', numero: 4 });
    const { lista, bytes } = await montarPasta(ep4());

    const ini = await iniciar(admin(), episode._id, lista);
    expect(ini.status).toBe(201);
    expect(ini.body.totalPaineis).toBe(24);
    expect(ini.body.arquivos).toHaveLength(24 + 40);

    await enviarTudo(admin(), ini.body, bytes);
    const fim = await concluir(admin(), ini.body.envioId);
    expect(fim.status).toBe(200);

    const ep = await Episode.findById(episode._id).lean();
    expect(ep.panels).toHaveLength(24);
    const comBalao = ep.panels.map((p, i) => (p.translationLayers.length ? i + 1 : null)).filter(Boolean);
    expect(comBalao).toEqual(EP4_COM_BALAO);
    expect(ep.panels[7].translationLayers.map(c => c.language).sort()).toEqual(['en', 'es', 'pt', 'zh']);

    // Uma pasta por episódio, nomes legíveis, montados pelo servidor.
    const pastas = new Set([...noBunny.keys()].map(c => c.split('/').slice(0, 5).join('/')));
    expect([...pastas]).toHaveLength(1);
    expect([...pastas][0]).toMatch(/^lorflux\/series\/the-near-ones\/ep-04\/\d{8}-\d{6}-[0-9a-f]{6}$/);
    expect(caminho(ep.panels[7].image_url)).toMatch(/\/ep-04\/[^/]+\/pagina-008\.jpg$/);
    expect(caminho(ep.panels[7].translationLayers.find(c => c.language === 'en').imageUrl)).toMatch(/\/pagina-008-en\.png$/);
    expect(noBunny.size).toBe(64);
  });

  it('página 800 x 3000 com balão vira 3 painéis, com o balão cortado nas mesmas fatias', async () => {
    const { episode } = await criarEpisodio();
    const { lista, bytes } = await montarPasta([
      { n: 1, largura: 800, altura: 1280, baloes: [] },
      { n: 2, largura: 800, altura: 3000, baloes: ['en'] },
    ]);
    const ini = await iniciar(admin(), episode._id, lista);
    expect(ini.status).toBe(201);
    expect(ini.body.totalPaineis).toBe(4);
    await enviarTudo(admin(), ini.body, bytes, { porParte: 3 });
    expect((await concluir(admin(), ini.body.envioId)).status).toBe(200);

    const ep = await Episode.findById(episode._id).lean();
    expect(ep.panels.map(p => p.translationLayers.length)).toEqual([0, 1, 1, 1]);
    const alturas = [];
    for (const p of ep.panels.slice(1)) {
      const b = await sharp(noBunny.get(caminho(p.image_url))).metadata();
      const c = await sharp(noBunny.get(caminho(p.translationLayers[0].imageUrl))).metadata();
      expect([c.width, c.height]).toEqual([b.width, b.height]);
      alturas.push(b.height);
    }
    expect(alturas).toEqual([1280, 1280, 440]);
    expect(caminho(ep.panels[3].translationLayers[0].imageUrl)).toMatch(/pagina-002-3-en\.png$/);
    // O tamanho de cada arquivo que chegou fica no painel e no balão: é com
    // ele que a troca de um arquivo pela grade confere o limite do episódio.
    for (const p of ep.panels) {
      expect(p.bytes).toBe(noBunny.get(caminho(p.image_url)).length);
      for (const c of p.translationLayers) expect(c.bytes).toBe(noBunny.get(caminho(c.imageUrl)).length);
    }
  });

  it('arquivo Capa vira a capa do episódio', async () => {
    const { episode } = await criarEpisodio();
    const { lista, bytes } = await montarPasta([{ n: 1, largura: 80, altura: 128 }], { capa: true });
    const ini = await iniciar(admin(), episode._id, lista);
    await enviarTudo(admin(), ini.body, bytes);
    await concluir(admin(), ini.body.envioId);
    const ep = await Episode.findById(episode._id).lean();
    expect(ep.thumbnail).toMatch(/\/capa\.jpg$/);
    expect(ep.panels).toHaveLength(1);
  });
});

describe('limite de painéis depois do corte, na configuração', () => {
  // 51 páginas de 2560 px = 102 painéis depois do corte (limite do Vin, 25/11: 100).
  const lista = Array.from({ length: 51 }, (_, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 2560, tamanho: 1000 }));

  it('passa de 100 depois do corte: recusado com aviso; Setting 200 passa a aceitar; 90 recusa de novo', async () => {
    const { episode } = await criarEpisodio();
    expect((await request(app).get('/api/envio-episodio/config').set('Authorization', `Bearer ${admin()}`)).body.limitePaineis).toBe(100);
    const r1 = await iniciar(admin(), episode._id, lista);
    expect(r1.status).toBe(400);
    const aviso = r1.body.problemas.find(p => p.codigo === 'limite-paineis');
    expect(aviso.mensagem).toContain('102');
    expect(aviso.mensagem).toContain('100');
    expect((await iniciar(admin(), episode._id, lista.slice(0, 50))).status).toBe(201);

    const put = await request(app).put('/api/settings/limite_paineis_episodio').set('Authorization', `Bearer ${admin()}`).send({ value: '200', label: 'Limite de painéis por episódio' });
    expect(put.status).toBe(200);
    expect((await request(app).get('/api/envio-episodio/config').set('Authorization', `Bearer ${admin()}`)).body.limitePaineis).toBe(200);
    const r2 = await iniciar(admin(), episode._id, lista);
    expect(r2.status).toBe(201);
    expect(r2.body.totalPaineis).toBe(102);

    await Setting.updateOne({ key: 'limite_paineis_episodio' }, { $set: { value: '90' } });
    expect((await iniciar(admin(), episode._id, lista.slice(0, 46))).status).toBe(400);
  });

  it('valor inválido na configuração volta para 100', async () => {
    await Setting.create({ key: 'limite_paineis_episodio', value: 'abc' });
    const { episode } = await criarEpisodio();
    const r = await iniciar(admin(), episode._id, lista);
    expect(r.status).toBe(400);
    expect(r.body.problemas.find(p => p.codigo === 'limite-paineis').mensagem).toContain('100');
  });
});

// Regressão (26/11/2026, pedido do Vin): "mantenha a liberação para não barrar
// o autor pela quantidade de megabytes. Deixe o foco apenas no limite dos 100
// painéis e na compressão automática". Sem Setting (ou vazio, ou 0) não há
// limite de MB nem teto do que chega; um número > 0 liga o limite de novo.
describe('sem limite de MB por episódio no padrão', () => {
  const MB = 1024 * 1024;
  // 4 páginas de 5,25 MB = 21 MB: passava dos 20 do padrão antigo.
  const lista = Array.from({ length: 4 }, (_, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 6400, tamanho: 5.25 * MB }));
  const config = async () => (await request(app).get('/api/envio-episodio/config').set('Authorization', `Bearer ${admin()}`)).body;

  it('pasta de 21 MB (e de 240 MB) é aceita pelo autor e pelo admin; a config diz limiteBytes 0 e o envio fica sem teto', async () => {
    expect((await config()).limiteBytes).toBe(0);
    const { canal, token } = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: canal._id });
    const r = await iniciar(token, episode._id, lista);
    expect(r.status).toBe(201);
    expect(r.body.totalBytes).toBe(21 * MB);
    expect(r.body.limiteBytes).toBe(0);
    expect(r.body.problemas.find(p => p.codigo === 'limite-tamanho')).toBeUndefined();
    expect((await EnvioEpisodio.findById(r.body.envioId).lean()).tetoBytes).toBe(0);

    const pesada = lista.map(a => ({ ...a, tamanho: 60 * MB }));
    expect((await iniciar(admin(), episode._id, pesada)).status).toBe(201);
  });

  it('Setting vazio ou 0 também é sem limite', async () => {
    const { episode } = await criarEpisodio();
    for (const value of ['', '0']) {
      await request(app).put('/api/settings/limite_mb_episodio').set('Authorization', `Bearer ${admin()}`).send({ value, label: 'Limite de MB por episódio' });
      expect((await config()).limiteBytes).toBe(0);
      expect((await iniciar(admin(), episode._id, lista)).status).toBe(201);
    }
  });

  it('o limite de 100 painéis continua valendo sem o limite de MB', async () => {
    const { episode } = await criarEpisodio();
    const r = await iniciar(admin(), episode._id, [
      { nome: 'Pagina 001.jpg', largura: 800, altura: 64000, tamanho: 30 * MB },
      { nome: 'Pagina 002.jpg', largura: 800, altura: 64001, tamanho: 30 * MB },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.problemas.map(p => p.codigo)).toEqual(['limite-paineis']);
  });

  it('com o Setting em 30 o limite volta a valer: 32 MB recusado com aviso, 21 MB aceito, teto de 90 MB no envio', async () => {
    await Setting.create({ key: 'limite_mb_episodio', value: '30' });
    expect((await config()).limiteBytes).toBe(30 * MB);
    const { episode } = await criarEpisodio();
    const r = await iniciar(admin(), episode._id, lista.map(a => ({ ...a, tamanho: 8 * MB })));
    expect(r.status).toBe(400);
    expect(r.body.problemas.find(p => p.codigo === 'limite-tamanho').mensagem).toBe('Os arquivos do episódio somam 32 MB; o limite é 30 MB.');
    const ok = await iniciar(admin(), episode._id, lista);
    expect(ok.status).toBe(201);
    expect((await EnvioEpisodio.findById(ok.body.envioId).lean()).tetoBytes).toBe(90 * MB);
  });

  it('sem limite, as partes não são recusadas pelo peso somado (o mesmo envio que o limite de 1 MB barra com 413)', async () => {
    const { episode } = await criarEpisodio();
    const ruido = async () => sharp(require('crypto').randomBytes(800 * 1280 * 3), { raw: { width: 800, height: 1280, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
    const bufs = [await ruido(), await ruido(), await ruido(), await ruido()];
    const lista4 = bufs.map((b, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 1280, tamanho: b.length }));
    const ini = await iniciar(admin(), episode._id, lista4);
    expect(ini.status).toBe(201);
    const itens = ini.body.arquivos.map(a => ({ chave: a.chave, tipo: a.tipo, buffer: bufs[a.indice] }));
    expect((await enviarParte(admin(), ini.body.envioId, itens.slice(0, 2))).status).toBe(200);
    expect((await enviarParte(admin(), ini.body.envioId, itens.slice(2))).status).toBe(200);
    expect(noBunny.size).toBe(4);
  });
});

describe('limite de MB por episódio LIGADO no admin (aqui 20 MB, sobre os originais)', () => {
  const MB = 1024 * 1024;
  // 4 páginas de 5,25 MB = 21 MB: passa dos 20.
  const lista = Array.from({ length: 4 }, (_, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 6400, tamanho: 5.25 * MB }));

  it('21 MB recusado com aviso; Setting 30 aceita; 20 MB exatos passam', async () => {
    await Setting.create({ key: 'limite_mb_episodio', value: '20' });
    const { episode } = await criarEpisodio();
    expect((await request(app).get('/api/envio-episodio/config').set('Authorization', `Bearer ${admin()}`)).body.limiteBytes).toBe(20 * MB);
    const r1 = await iniciar(admin(), episode._id, lista);
    expect(r1.status).toBe(400);
    const aviso = r1.body.problemas.find(p => p.codigo === 'limite-tamanho');
    expect(aviso.mensagem).toBe('Os arquivos do episódio somam 21 MB; o limite é 20 MB.');

    const exatos = lista.map(a => ({ ...a, tamanho: 5 * MB }));
    expect((await iniciar(admin(), episode._id, exatos)).status).toBe(201);

    await request(app).put('/api/settings/limite_mb_episodio').set('Authorization', `Bearer ${admin()}`).send({ value: '30', label: 'Limite de MB por episódio' });
    expect((await request(app).get('/api/envio-episodio/config').set('Authorization', `Bearer ${admin()}`)).body.limiteBytes).toBe(30 * MB);
    expect((await iniciar(admin(), episode._id, lista)).status).toBe(201);
  });

  it('lista sem o tamanho de algum arquivo é recusada (o limite não teria como ser conferido)', async () => {
    const { episode } = await criarEpisodio();
    const r = await iniciar(admin(), episode._id, [{ nome: 'Pagina 001.jpg', largura: 80, altura: 128 }]);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/tamanho/);
  });

  it('página sem corte maior que a parte do envio (8 MB) impede, com aviso no arquivo', async () => {
    const { episode } = await criarEpisodio();
    const r = await iniciar(admin(), episode._id, [
      { nome: 'Pagina 001.jpg', largura: 800, altura: 1280, tamanho: 9 * MB },
      { nome: 'Pagina 002.jpg', largura: 800, altura: 12800, tamanho: 9 * MB },
    ]);
    expect(r.status).toBe(400);
    const grandes = r.body.problemas.filter(p => p.codigo === 'arquivo-grande').map(p => p.nome);
    expect(grandes).toEqual(['Pagina 001.jpg']); // a de 12800 vai em fatias
  });

  it('teto do que chega de fato: 3x o limite; acima disso a parte é recusada (413) e nada sobe', async () => {
    await Setting.create({ key: 'limite_mb_episodio', value: '1' }); // teto real = 3 MB
    const { episode } = await criarEpisodio();
    // Ruído não comprime: cada JPEG 800x1280 de ruído a 100 tem ~1 MB ou mais.
    const ruido = async () => sharp(require('crypto').randomBytes(800 * 1280 * 3), { raw: { width: 800, height: 1280, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
    const bufs = [await ruido(), await ruido(), await ruido(), await ruido()];
    expect(bufs.reduce((s, b) => s + b.length, 0)).toBeGreaterThan(3 * MB);
    // Declara 200 KB cada (a pasta "passa"), manda os de verdade.
    const lista = bufs.map((_, i) => ({ nome: `Pagina ${tres(i + 1)}.jpg`, largura: 800, altura: 1280, tamanho: 200 * 1024 }));
    const ini = await iniciar(admin(), episode._id, lista);
    expect(ini.status).toBe(201);
    const itens = ini.body.arquivos.map(a => ({ chave: a.chave, tipo: a.tipo, buffer: bufs[a.indice] }));
    const r1 = await enviarParte(admin(), ini.body.envioId, itens.slice(0, 2));
    expect(r1.status).toBe(200);
    const r2 = await enviarParte(admin(), ini.body.envioId, itens.slice(2));
    expect(r2.status).toBe(413);
    expect(noBunny.size).toBe(2);
  });
});

describe('envio interrompido não deixa o episódio pela metade', () => {
  it('parou no meio: o episódio segue com os painéis antigos; concluir sem tudo dá 409 e não troca nada', async () => {
    const antigos = [{ image_url: 'https://outro.site/antigo.jpg', order: 0, translationLayers: [] }];
    const { episode } = await criarEpisodio({ panels: antigos });
    const { lista, bytes } = await montarPasta(ep4());
    const ini = await iniciar(admin(), episode._id, lista);
    const primeira = ini.body.arquivos.slice(0, 10);
    const itens = await Promise.all(primeira.map(async a => ({ chave: a.chave, tipo: a.tipo, buffer: await recortar(bytes[a.indice], a) })));
    expect((await enviarParte(admin(), ini.body.envioId, itens)).status).toBe(200);

    expect((await Episode.findById(episode._id).lean()).panels.map(p => p.image_url)).toEqual(['https://outro.site/antigo.jpg']);
    const fim = await concluir(admin(), ini.body.envioId);
    expect(fim.status).toBe(409);
    expect(fim.body.faltando).toHaveLength(54);
    expect((await Episode.findById(episode._id).lean()).panels).toHaveLength(1);
  });

  it('parte que falhou no Bunny: 502 com o que faltou; mandar a mesma parte de novo completa', async () => {
    const { episode } = await criarEpisodio();
    const { lista, bytes } = await montarPasta([{ n: 1, largura: 80, altura: 128, baloes: ['en'] }, { n: 2, largura: 80, altura: 128 }]);
    const ini = await iniciar(admin(), episode._id, lista);
    const itens = await Promise.all(ini.body.arquivos.map(async a => ({ chave: a.chave, tipo: a.tipo, buffer: await recortar(bytes[a.indice], a) })));
    const pasta = (await EnvioEpisodio.findById(ini.body.envioId).lean()).pasta;
    falharUmaVez.add(`${pasta}/pagina-001-en.png`);

    const r1 = await enviarParte(admin(), ini.body.envioId, itens);
    expect(r1.status).toBe(502);
    expect(r1.body.falhas).toEqual(['0-en']);
    expect((await concluir(admin(), ini.body.envioId)).status).toBe(409);

    const r2 = await enviarParte(admin(), ini.body.envioId, itens.filter(i => i.chave === '0-en'));
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ recebidos: 3, total: 3 });
    expect((await concluir(admin(), ini.body.envioId)).status).toBe(200);
  });

  it('começar outro envio no mesmo episódio cancela o aberto e apaga o que ele já tinha subido', async () => {
    const { episode } = await criarEpisodio();
    const { lista, bytes } = await montarPasta([{ n: 1, largura: 80, altura: 128 }]);
    const a = await iniciar(admin(), episode._id, lista);
    await enviarTudo(admin(), a.body, bytes);
    const subidoPeloPrimeiro = [...noBunny.keys()];

    const b = await iniciar(admin(), episode._id, lista);
    expect(b.status).toBe(201);
    expect(apagados).toEqual(subidoPeloPrimeiro);
    expect((await EnvioEpisodio.findById(a.body.envioId).lean()).status).toBe('cancelado');
    expect((await concluir(admin(), a.body.envioId)).status).toBe(409);
  });

  it('dois "concluir" ao mesmo tempo trocam os painéis uma vez só', async () => {
    const { episode } = await criarEpisodio();
    const { lista, bytes } = await montarPasta([{ n: 1, largura: 80, altura: 128 }]);
    const ini = await iniciar(admin(), episode._id, lista);
    await enviarTudo(admin(), ini.body, bytes);
    const [r1, r2] = await Promise.all([concluir(admin(), ini.body.envioId), concluir(admin(), ini.body.envioId)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await Episode.findById(episode._id).lean()).__v).toBe(1);
  });
});

describe('reenviar a pasta substitui o episódio e apaga os arquivos anteriores', () => {
  it('apaga só o que era deste episódio: link externo e arquivo usado por outro episódio ficam', async () => {
    const { episode } = await criarEpisodio();
    const pasta1 = await montarPasta([{ n: 1, largura: 80, altura: 128, baloes: ['en'] }, { n: 2, largura: 80, altura: 128 }]);
    const ini1 = await iniciar(admin(), episode._id, pasta1.lista);
    await enviarTudo(admin(), ini1.body, pasta1.bytes);
    await concluir(admin(), ini1.body.envioId);
    const primeiraVersao = (await Episode.findById(episode._id).lean()).panels;

    // Um painel colado à mão (link de fora) e um arquivo que outro episódio também usa.
    const compartilhado = `https://${CDN}/lorflux/series/the-near-ones/panels/legado.jpg`;
    await Episode.updateOne({ _id: episode._id }, { $push: { panels: { $each: [
      { image_url: 'https://outro.site/colado.jpg', order: 2, translationLayers: [] },
      { image_url: compartilhado, order: 3, translationLayers: [] },
    ] } } });
    await criarEpisodio({ numero: 9, panels: [{ image_url: compartilhado, order: 0, translationLayers: [] }] });

    const pasta2 = await montarPasta([{ n: 1, largura: 90, altura: 100 }]);
    const ini2 = await iniciar(admin(), episode._id, pasta2.lista);
    await enviarTudo(admin(), ini2.body, pasta2.bytes);
    apagados = [];
    const fim = await concluir(admin(), ini2.body.envioId);
    expect(fim.status).toBe(200);
    expect(fim.body.apagadosDoBunny).toBe(3);

    const ep = await Episode.findById(episode._id).lean();
    expect(ep.panels).toHaveLength(1);
    const esperadoApagar = [primeiraVersao[0].image_url, primeiraVersao[0].translationLayers[0].imageUrl, primeiraVersao[1].image_url].map(caminho);
    expect(apagados.sort()).toEqual(esperadoApagar.sort());
    expect(apagados.some(c => c.includes('legado.jpg'))).toBe(false);
    expect(noBunny.has(caminho(ep.panels[0].image_url))).toBe(true);
  });

  it('episódio publicado: o 1o envio avisa os favoritos uma vez; o reenvio não avisa de novo', async () => {
    const mongoose = require('mongoose');
    const notificacoes = require('../../services/notificationService');
    const Favorite = require('../../models/Favorite');
    const PushSubscription = require('../../models/PushSubscription');
    let avisos = 0;
    notificacoes.__setTransportForTests(async () => { avisos += 1; });
    try {
      // Esqueleto publicado sem painéis: é o envio que traz o conteúdo.
      const { series, episode } = await criarEpisodio({ status: 'published' });
      const leitor = new mongoose.Types.ObjectId();
      await Favorite.create({ userId: leitor, seriesId: series._id });
      await PushSubscription.create({ userId: leitor, endpoint: `https://push.exemplo/${leitor}`, keys: { p256dh: 'p', auth: 'a' } });
      const { lista, bytes } = await montarPasta([{ n: 1, largura: 80, altura: 128 }]);

      for (let vez = 1; vez <= 2; vez++) {
        const ini = await iniciar(admin(), episode._id, lista);
        await enviarTudo(admin(), ini.body, bytes);
        expect((await concluir(admin(), ini.body.envioId)).status).toBe(200);
        await vi.waitFor(async () => {
          expect((await Episode.findById(episode._id).lean()).notificationSentAt).not.toBeNull();
        });
        await new Promise(r => setTimeout(r, 50));
        expect(avisos).toBe(1);
      }
    } finally {
      notificacoes.__setTransportForTests(null);
    }
  });
});

describe('o servidor confere cada arquivo de novo', () => {
  async function iniciado() {
    const { episode } = await criarEpisodio();
    const { lista } = await montarPasta([{ n: 1, largura: 80, altura: 128, baloes: ['en'] }, { n: 2, largura: 80, altura: 3000 }]);
    return (await iniciar(admin(), episode._id, lista)).body;
  }

  it('PNG mandado como página, balão de outro tamanho e página sem cortar (acima de 1280) são recusados', async () => {
    const ini = await iniciado();
    const r = await enviarParte(admin(), ini.envioId, [
      { chave: '0', tipo: 'pagina', buffer: await png(80, 128) },
      { chave: '0-en', tipo: 'balao', buffer: await png(80, 100) },
      { chave: '1', tipo: 'pagina', buffer: await jpeg(80, 3000) },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.recusados.map(x => x.chave)).toEqual(['0', '0-en', '1']);
    expect(r.body.recusados[0].motivo).toMatch(/JPEG/);
    expect(r.body.recusados[1].motivo).toMatch(/80x100.*80x128/);
    expect(r.body.recusados[2].motivo).toMatch(/80x3000.*80x1280/);
    expect(noBunny.size).toBe(0);
  });

  it('arquivo que não é imagem e chave que não existe no envio são recusados', async () => {
    const ini = await iniciado();
    const r = await enviarParte(admin(), ini.envioId, [
      { chave: '0', tipo: 'pagina', buffer: Buffer.from('<?php echo 1; ?>' + ' '.repeat(40)) },
      { chave: '../../outra-obra', tipo: 'pagina', buffer: await jpeg(80, 128) },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.recusados.map(x => x.chave)).toEqual(['0', '../../outra-obra']);
    expect(noBunny.size).toBe(0);
  });

  it('pasta com problema que impede (página repetida) não abre envio', async () => {
    const { episode } = await criarEpisodio();
    const r = await iniciar(admin(), episode._id, [
      { nome: 'Pagina 001.jpg', largura: 8, altura: 8, tamanho: 100 }, { nome: 'Pagina 1.jpeg', largura: 8, altura: 8, tamanho: 100 },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.problemas.map(p => p.codigo)).toEqual(['pagina-repetida', 'pagina-repetida']);
    expect(await EnvioEpisodio.countDocuments({ episodeId: episode._id })).toBe(0);
  });

  it('parte acima do tamanho máximo é recusada antes de ser lida', async () => {
    const ini = await iniciado();
    const r = await request(app).post(`/api/envio-episodio/${ini.envioId}/partes`)
      .set('Authorization', `Bearer ${admin()}`)
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .set('Content-Length', String(30 * 1024 * 1024))
      .send('--x--');
    expect(r.status).toBe(413);
  });
});

describe('quem pode enviar', () => {
  it('dono do canal envia no próprio rascunho', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const { lista, bytes } = await montarPasta([{ n: 3, largura: 80, altura: 128, baloes: ['zh'] }]);
    const ini = await iniciar(autor.token, episode._id, lista);
    expect(ini.status).toBe(201);
    await enviarTudo(autor.token, ini.body, bytes);
    expect((await concluir(autor.token, ini.body.envioId)).status).toBe(200);
    expect((await Episode.findById(episode._id).lean()).panels[0].translationLayers[0].language).toBe('zh');
  });

  it('outro autor: 404 no episódio e 404 no envio alheio', async () => {
    const dono = await criarAutor();
    const outro = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: dono.canal._id });
    const lista = [{ nome: 'Pagina 001.jpg', largura: 80, altura: 128, tamanho: 100 }];
    expect((await iniciar(outro.token, episode._id, lista)).status).toBe(404);
    const ini = await iniciar(dono.token, episode._id, lista);
    expect((await enviarParte(outro.token, ini.body.envioId, [{ chave: '0', tipo: 'pagina', buffer: await jpeg(80, 128) }])).status).toBe(404);
    expect((await concluir(outro.token, ini.body.envioId)).status).toBe(404);
  });

  // Até o item 7 (27/11/2026) o autor recebia 403 em episódio publicado. Com o
  // item 7 o envio é aceito, mas vai para a REVISÃO (paraRevisao) e o episódio
  // no ar não é tocado: o caminho inteiro está em revisaoEpisodio.test.js.
  it('autor: episódio enviado para aprovação 403; em processamento 403; usuário sem canal 404; publicado é aceito como revisão, sem tocar o episódio', async () => {
    const autor = await criarAutor();
    const lista = [{ nome: 'Pagina 001.jpg', largura: 80, altura: 128, tamanho: 100 }];
    const enviado = await criarEpisodio({ canalId: autor.canal._id, submittedAt: new Date() });
    expect((await iniciar(autor.token, enviado.episode._id, lista)).status).toBe(403);
    const processando = await criarEpisodio({ canalId: autor.canal._id, status: 'processing' });
    expect((await iniciar(autor.token, processando.episode._id, lista)).status).toBe(403);
    expect((await iniciar(auth.getToken('user'), enviado.episode._id, lista)).status).toBe(404);

    const publicado = await criarEpisodio({ canalId: autor.canal._id, status: 'published', panels: [{ image_url: 'https://outro.exemplo/no-ar.jpg', order: 0 }] });
    const antes = await Episode.findById(publicado.episode._id).lean();
    const ini = await iniciar(autor.token, publicado.episode._id, lista);
    expect(ini.status).toBe(201);
    expect(ini.body.paraRevisao).toBe(true);
    await enviarParte(autor.token, ini.body.envioId, [{ chave: '0', tipo: 'pagina', buffer: await jpeg(80, 128) }]);
    const fim = await concluir(autor.token, ini.body.envioId);
    expect(fim.status).toBe(200);
    expect(fim.body.paraRevisao).toBe(true);
    const depois = await Episode.findById(publicado.episode._id).lean();
    expect(depois.panels).toEqual(antes.panels);
    expect(depois.status).toBe('published');
  });

  it('autor que manda para aprovação no meio do envio: o concluir não troca nada', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const { lista, bytes } = await montarPasta([{ n: 1, largura: 80, altura: 128 }]);
    const ini = await iniciar(autor.token, episode._id, lista);
    await enviarTudo(autor.token, ini.body, bytes);
    await Episode.updateOne({ _id: episode._id }, { $set: { submittedAt: new Date() } });
    expect((await concluir(autor.token, ini.body.envioId)).status).toBe(403);
    expect((await Episode.findById(episode._id).lean()).panels).toHaveLength(0);
  });

  it('sem login: 401', async () => {
    const { episode } = await criarEpisodio();
    expect((await request(app).post(`/api/envio-episodio/${episode._id}/iniciar`).send({ arquivos: [] })).status).toBe(401);
  });
});

it('a regra de nomes no servidor é a mesma do módulo compartilhado', async () => {
  // Garante que ninguém trocou a importação por uma cópia: o serviço e o
  // teste carregam o MESMO arquivo.
  const servico = require('../../services/envioEpisodioService');
  expect((await servico.configuracao()).alturaMaxima).toBe(O.ALTURA_MAXIMA);
});
