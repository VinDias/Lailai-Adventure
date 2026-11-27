/**
 * Frente A, item 9: V-Show (`vcine`) e Anicom (`hqcine`) no portal do autor
 * (services/videoAutorService.js, utils/bunnyStream.js, routes/portal.js e o
 * desvio em routes/bunnyWebhook.js).
 *
 * Critério da proposta de 21/11/2026 e do plano: "rota que gera a autorização
 * só para o dono; webhook de vídeo pronto em episódio de autor não publica
 * nem dispara aviso; o do admin continua publicando como hoje".
 *
 * O QUE ESTE ARQUIVO GARANTE:
 * - o autor cria obra de V-Show e de Anicom no portal (antes o tipo era fixo
 *   em Hi-Qua); sem dizer o tipo continua nascendo Hi-Qua; tipo inválido 400;
 *   o tipo não muda depois; obra nova não aparece no catálogo;
 * - a autorização de envio (TUS) só sai para o DONO do episódio: sem login
 *   401, conta sem canal 403 (admin inclusive), outro autor 404, e em nenhum
 *   desses casos o Bunny é chamado; a assinatura é a que o Bunny confere e a
 *   chave da biblioteca não aparece na resposta;
 * - só em rascunho não enviado, só em obra de vídeo, dentro do tamanho e dos
 *   formatos; sem Bunny configurado, 503;
 * - vídeo novo apaga do Bunny o vídeo anterior do autor (nunca o do admin);
 *   renovar devolve outra autorização para o mesmo vídeo;
 * - R9: o webhook de vídeo PRONTO em episódio de autor só marca o vídeo como
 *   pronto: o episódio segue rascunho, fora do catálogo, e nem o aviso de
 *   capítulo novo nem o recálculo são chamados. Vale também para a consulta
 *   manual do admin (o outro caminho que publicava por estado do Bunny);
 * - o vídeo do admin continua publicando e avisando pelo webhook, como antes;
 * - o portal vê o estado do vídeo (aviso de vídeo pronto), mesmo sem webhook.
 *
 * Bunny FALSO: utils/bunnyStream recebe um cliente de mentira e o `fetch`
 * global é trocado por um que falha o teste se for chamado. Nenhuma chamada
 * ao Bunny real. O QUE NÃO GARANTE: o envio TUS em si (é do navegador para o
 * Bunny; tests/frontend/envioVideoTus.test.ts cobre o cliente com servidor
 * falso) nem a tela (tests/frontend/envioVideoEpisodio.test.tsx).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Series, Channel, User, Setting, bunnyStream, notificationService, recommendationService;

const BIBLIOTECA = '424242';
const CHAVE = 'chave-de-teste-nao-e-segredo';
const CDN = 'vz-teste-video.b-cdn.net';
const SEGREDO_WEBHOOK = 'segredo-webhook-de-teste';

let criados; // títulos pedidos ao Bunny falso
let apagadosDoBunny; // ids
let estadoNoBunny; // id -> status (0 a 6)
let consultas;
let fetchReal;
let chamadasDeRede;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  Setting = require('../../models/Setting');
  bunnyStream = require('../../utils/bunnyStream');
  notificationService = require('../../services/notificationService');
  recommendationService = require('../../services/recommendationService');
  await auth.createUsers(app);
});

const ambiente = {};
const VARIAVEIS = ['BUNNY_API_KEY', 'BUNNY_LIBRARY_ID', 'BUNNY_CDN_HOSTNAME', 'BUNNY_WEBHOOK_SECRET', 'BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_KEY'];
beforeAll(() => {
  for (const k of VARIAVEIS) ambiente[k] = process.env[k];
  fetchReal = global.fetch;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(ambiente)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  bunnyStream.__setClientForTests(null);
  global.fetch = fetchReal;
  await db.closeDatabase();
});

let contadorDeVideo = 0;
beforeEach(async () => {
  process.env.BUNNY_API_KEY = CHAVE;
  process.env.BUNNY_LIBRARY_ID = BIBLIOTECA;
  process.env.BUNNY_CDN_HOSTNAME = CDN;
  process.env.BUNNY_WEBHOOK_SECRET = SEGREDO_WEBHOOK;
  // Só para o envio da pasta chegar até a recusa por tipo de obra (nada sobe).
  process.env.BUNNY_STORAGE_ZONE = 'zona-video-teste';
  process.env.BUNNY_STORAGE_KEY = 'chave-storage-de-teste';
  criados = [];
  apagadosDoBunny = [];
  estadoNoBunny = new Map();
  consultas = [];
  chamadasDeRede = [];
  bunnyStream.__setClientForTests({
    createVideo: async (title) => {
      contadorDeVideo += 1;
      const id = `video-falso-${contadorDeVideo}`;
      criados.push(title);
      estadoNoBunny.set(id, 0);
      return id;
    },
    getVideo: async (id) => { consultas.push(id); return estadoNoBunny.has(id) ? { status: estadoNoBunny.get(id) } : null; },
    deleteVideo: async (id) => { apagadosDoBunny.push(id); estadoNoBunny.delete(id); },
  });
  // Qualquer `fetch` é uma chamada para fora: nenhum teste daqui pode fazer.
  global.fetch = async (url) => { chamadasDeRede.push(String(url)); throw new Error(`chamada de rede em teste: ${url}`); };
  await Setting.deleteMany({ key: 'limite_mb_video' });
  vi.restoreAllMocks();
});
afterEach(() => {
  expect(chamadasDeRede).toEqual([]);
});

let contador = 0;
async function criarAutor() {
  contador += 1;
  const email = `video-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash('Senha@123', 4);
  const user = await User.create({ email, passwordHash, nome: `Autor ${contador}`, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Video ${contador} ${Date.now()}` });
  return { token: login.body.accessToken, canal, id: String(user._id) };
}

const com = (req, token) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
const admin = () => auth.getToken('admin');

/** Obra e episódio criados PELO PORTAL, como o autor faz. */
async function obraDoAutor(autor, tipo = 'vcine', titulo = 'Novela Do Autor') {
  contador += 1;
  const obra = await com(request(app).post('/api/portal/series'), autor.token).send({ title: `${titulo} ${contador}`, content_type: tipo });
  expect(obra.status).toBe(201);
  const ep = await com(request(app).post(`/api/portal/series/${obra.body._id}/episodios`), autor.token).send({ title: 'Episódio 1', episode_number: 1 });
  expect(ep.status).toBe(201);
  return { series: obra.body, episode: ep.body };
}

const pedirAutorizacao = (ep, token, body = {}) => com(request(app).post(`/api/portal/episodios/${ep._id}/video/autorizacao`), token).send(body);
const estadoDoVideo = (ep, token) => com(request(app).get(`/api/portal/episodios/${ep._id}/video`), token);
const webhook = (videoId, status) => request(app).post('/api/bunny/webhook').set('x-webhook-token', SEGREDO_WEBHOOK).send({ VideoGuid: videoId, Status: status });
const ler = (ep) => Episode.findById(ep._id).lean();
const espera = (ms) => new Promise(r => setTimeout(r, ms));

function espiarAvisos() {
  return {
    push: vi.spyOn(notificationService, 'notifyEpisodePublished').mockResolvedValue(undefined),
    recalculo: vi.spyOn(recommendationService, 'dispararRecalculo').mockImplementation(() => {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('criar obra de V-Show e de Anicom no portal', () => {
  it('o autor escolhe o tipo: vcine e hqcine nascem rascunho, fora do catálogo; sem tipo continua Hi-Qua', async () => {
    const autor = await criarAutor();
    for (const tipo of ['vcine', 'hqcine']) {
      const res = await com(request(app).post('/api/portal/series'), autor.token).send({ title: `Obra ${tipo} ${Date.now()}`, content_type: tipo, isPublished: true });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ content_type: tipo, isPublished: false, submittedAt: null });
      const catalogo = await request(app).get(`/api/content/series?type=${tipo}`);
      expect(catalogo.body.some(s => String(s._id) === String(res.body._id))).toBe(false);
      expect((await request(app).get(`/api/content/series/${res.body._id}`)).status).toBe(404);
    }
    const semTipo = await com(request(app).post('/api/portal/series'), autor.token).send({ title: 'Obra Sem Tipo' });
    expect(semTipo.status).toBe(201);
    expect(semTipo.body.content_type).toBe('hiqua');

    const lista = await com(request(app).get('/api/portal/series'), autor.token);
    expect(lista.body.series.map(s => s.content_type).sort()).toEqual(['hiqua', 'hqcine', 'vcine']);
  });

  it('tipo fora dos três é 400 e nada é criado; depois de criada a obra o tipo não muda', async () => {
    const autor = await criarAutor();
    for (const tipo of ['filme', 'HIQUA', { $ne: 'hiqua' }]) {
      const res = await com(request(app).post('/api/portal/series'), autor.token).send({ title: 'Tipo Errado', content_type: tipo });
      expect(res.status).toBe(400);
    }
    expect(await Series.countDocuments({ channelId: autor.canal._id })).toBe(0);

    const { series } = await obraDoAutor(autor, 'vcine');
    const put = await com(request(app).put(`/api/portal/series/${series._id}`), autor.token).send({ content_type: 'hiqua', title: 'Outro Nome' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ content_type: 'vcine', title: 'Outro Nome' });
  });

  it('episódio de obra de vídeo nasce rascunho e não aceita painéis nem pasta de painéis', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'hqcine');
    expect(episode).toMatchObject({ status: 'draft', submittedAt: null });
    const paineis = await com(request(app).post(`/api/portal/episodios/${episode._id}/paineis`), autor.token).send({ panels: [{ image_url: 'https://exemplo.test/a.jpg', order: 1 }] });
    expect(paineis.status).toBe(400);
    const pasta = await com(request(app).post(`/api/envio-episodio/${episode._id}/iniciar`), autor.token)
      .send({ arquivos: [{ nome: 'Pagina 001.jpg', largura: 800, altura: 1280, tamanho: 1000 }] });
    expect(pasta.status).toBe(400);
    expect(pasta.body.error).toMatch(/obra é de vídeo/);
    expect((await ler(episode)).panels).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('autorização de envio do vídeo (TUS assinado): só o dono', () => {
  it('o dono recebe o que o navegador precisa, com a assinatura que o Bunny confere, e a chave não sai do servidor', async () => {
    const autor = await criarAutor();
    const { episode, series } = await obraDoAutor(autor, 'vcine');
    const antes = Math.floor(Date.now() / 1000);
    const res = await pedirAutorizacao(episode, autor.token, { tamanho: 50 * 1024 * 1024, tipo: 'video/mp4' });
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a).toMatchObject({ libraryId: BIBLIOTECA, endpoint: 'https://video.bunnycdn.com/tusupload', validadeSegundos: 300, tamanhoMaximo: 800 * 1024 * 1024 });
    expect(a.videoId).toMatch(/^video-falso-\d+$/);
    // Curta duração: para 50 MB (200 s a 250 KB/s), o mínimo de 5 minutos a partir de agora.
    expect(a.expira).toBeGreaterThanOrEqual(antes + 300);
    expect(a.expira).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 300);
    // SHA256(biblioteca + chave + validade + vídeo), em hexa: a conta do Bunny.
    expect(a.assinatura).toBe(crypto.createHash('sha256').update(`${BIBLIOTECA}${CHAVE}${a.expira}${a.videoId}`).digest('hex'));
    expect(JSON.stringify(res.body)).not.toContain(CHAVE);

    expect(criados).toHaveLength(1);
    expect(criados[0]).toContain(series.title);
    const ep = await ler(episode);
    expect(ep).toMatchObject({ status: 'draft', submittedAt: null, bunnyVideoId: a.videoId });
    expect(ep.videoEnvio).toMatchObject({ videoId: a.videoId, estado: 'enviando' });
    expect(ep.video_url).toBeUndefined();
    // O servidor guarda até quando a autorização vale (só registro).
    expect(new Date(ep.videoEnvio.autorizadoAte).getTime()).toBe(a.expira * 1000);
  });

  it('a validade é a menor que serve: 5 minutos no mínimo e sem tamanho, o tempo do envio para arquivo grande, 2 horas no máximo; renovar dá 5 minutos', async () => {
    const autor = await criarAutor();
    const MB = 1024 * 1024;
    const validade = async (body) => {
      const { episode } = await obraDoAutor(autor, 'vcine');
      const r = await pedirAutorizacao(episode, autor.token, body);
      expect(r.status).toBe(200);
      return { episode, ...r.body };
    };
    expect((await validade({ tamanho: 1 * MB, tipo: 'video/mp4' })).validadeSegundos).toBe(300);
    expect((await validade({ tamanho: 70 * MB, tipo: 'video/mp4' })).validadeSegundos).toBe(300);
    // 200 MB a 250 KB/s: 839 segundos (14 minutos).
    expect((await validade({ tamanho: 200 * MB, tipo: 'video/mp4' })).validadeSegundos).toBe(Math.ceil((200 * MB) / 250000));
    // 800 MB a 250 KB/s: 3356 segundos (56 minutos).
    expect((await validade({ tamanho: 800 * MB, tipo: 'video/mp4' })).validadeSegundos).toBe(Math.ceil((800 * MB) / 250000));
    await Setting.create({ key: 'limite_mb_video', value: '5000' });
    expect((await validade({ tamanho: 4000 * MB, tipo: 'video/mp4' })).validadeSegundos).toBe(7200);
    // Sem tamanho não há por que dar mais que o mínimo (antes: 2 horas).
    const semTamanho = await validade({});
    expect(semTamanho.validadeSegundos).toBe(300);

    // Renovar: 5 minutos, e a validade guardada nunca anda para trás.
    const grande = await validade({ tamanho: 800 * MB, tipo: 'video/mp4' });
    const renovada = await pedirAutorizacao(grande.episode, autor.token, { renovar: true });
    expect(renovada.body.validadeSegundos).toBe(300);
    expect(new Date((await ler(grande.episode)).videoEnvio.autorizadoAte).getTime()).toBe(grande.expira * 1000);
  });

  it('sem login 401; conta sem canal 403 (leitor, assinante e admin); outro autor 404. Em nenhum caso o Bunny é chamado nem o episódio muda', async () => {
    const autor = await criarAutor();
    const outro = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');

    expect((await pedirAutorizacao(episode, null)).status).toBe(401);
    for (const papel of ['user', 'premium', 'admin', 'superadmin']) {
      expect((await pedirAutorizacao(episode, auth.getToken(papel))).status).toBe(403);
      expect((await estadoDoVideo(episode, auth.getToken(papel))).status).toBe(403);
    }
    const alheio = await pedirAutorizacao(episode, outro.token, { tamanho: 1000, tipo: 'video/mp4' });
    expect(alheio.status).toBe(404);
    expect(alheio.body).toEqual({ error: 'Episódio não encontrado.' });
    expect((await pedirAutorizacao(episode, outro.token, { renovar: true })).status).toBe(404);
    expect((await estadoDoVideo(episode, outro.token)).status).toBe(404);
    expect((await estadoDoVideo(episode, null)).status).toBe(401);
    expect((await pedirAutorizacao({ _id: 'nao-e-id' }, autor.token)).status).toBe(404);

    expect(criados).toEqual([]);
    const ep = await ler(episode);
    expect(ep.bunnyVideoId).toBeUndefined();
    expect(ep.videoEnvio).toBeUndefined();
  });

  it('só obra de vídeo, só rascunho não enviado, dentro do tamanho e dos formatos', async () => {
    const autor = await criarAutor();
    const quadrinhos = await obraDoAutor(autor, 'hiqua');
    expect((await pedirAutorizacao(quadrinhos.episode, autor.token)).status).toBe(400);

    const { episode } = await obraDoAutor(autor, 'vcine');
    const grande = await pedirAutorizacao(episode, autor.token, { tamanho: 801 * 1024 * 1024, tipo: 'video/mp4' });
    expect(grande.status).toBe(413);
    expect(grande.body.error).toMatch(/800 MB/);
    expect((await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'image/png' })).status).toBe(400);
    expect((await pedirAutorizacao(episode, autor.token, { tamanho: -5 })).status).toBe(400);
    // O limite é do admin (Setting limite_mb_video): 1000 passa a aceitar 801.
    await Setting.create({ key: 'limite_mb_video', value: '1000' });
    expect((await pedirAutorizacao(episode, autor.token, { tamanho: 801 * 1024 * 1024, tipo: 'video/quicktime' })).status).toBe(200);
    expect(criados).toHaveLength(1);

    await Episode.updateOne({ _id: episode._id }, { $set: { submittedAt: new Date() } });
    const emAnalise = await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' });
    expect(emAnalise.status).toBe(403);
    expect((await pedirAutorizacao(episode, autor.token, { renovar: true })).status).toBe(403);
    await Episode.updateOne({ _id: episode._id }, { $set: { submittedAt: null, status: 'published' } });
    expect((await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).status).toBe(403);
    expect(criados).toHaveLength(1);
  });

  it('sem Bunny Stream configurado no servidor: 503, sem chamar o Bunny', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    delete process.env.BUNNY_API_KEY;
    const res = await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' });
    expect(res.status).toBe(503);
    expect(criados).toEqual([]);
  });

  it('Bunny fora do ar ao criar o vídeo: 502 e o episódio fica como estava', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    bunnyStream.__setClientForTests({ createVideo: async () => { throw new Error('Bunny caiu'); }, getVideo: async () => null, deleteVideo: async () => {} });
    const res = await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' });
    expect(res.status).toBe(502);
    expect((await ler(episode)).bunnyVideoId).toBeUndefined();
  });

  it('vídeo novo no mesmo episódio: o anterior do autor sai do Bunny; renovar devolve outra validade para o MESMO vídeo', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    const primeira = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;

    const renovada = await pedirAutorizacao(episode, autor.token, { renovar: true });
    expect(renovada.status).toBe(200);
    expect(renovada.body.videoId).toBe(primeira.videoId);
    expect(renovada.body.assinatura).toBe(crypto.createHash('sha256').update(`${BIBLIOTECA}${CHAVE}${renovada.body.expira}${primeira.videoId}`).digest('hex'));
    expect(criados).toHaveLength(1);
    expect(apagadosDoBunny).toEqual([]);

    const segunda = (await pedirAutorizacao(episode, autor.token, { tamanho: 2000, tipo: 'video/mp4' })).body;
    expect(segunda.videoId).not.toBe(primeira.videoId);
    expect(apagadosDoBunny).toEqual([primeira.videoId]);
    expect((await ler(episode)).videoEnvio).toMatchObject({ videoId: segunda.videoId, estado: 'enviando' });

    // Com o vídeo pronto não há envio em andamento para renovar.
    expect((await webhook(segunda.videoId, 4)).status).toBe(200);
    expect((await pedirAutorizacao(episode, autor.token, { renovar: true })).status).toBe(409);
  });

  it('vídeo que o ADMIN pôs no episódio nunca é apagado pelo envio do autor', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    await Episode.updateOne({ _id: episode._id }, { $set: { bunnyVideoId: 'video-do-admin' } });
    const res = await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' });
    expect(res.status).toBe(200);
    expect(apagadosDoBunny).toEqual([]);
    expect((await ler(episode)).bunnyVideoId).toBe(res.body.videoId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R9: vídeo de autor pronto NÃO publica o episódio', () => {
  it('webhook de vídeo pronto: o vídeo fica "pronto", o episódio segue rascunho e fora do catálogo, e nenhum aviso sai', async () => {
    const { push, recalculo } = espiarAvisos();
    const autor = await criarAutor();
    const { episode, series } = await obraDoAutor(autor, 'vcine');
    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;

    for (const [status, estado] of [[1, 'processando'], [2, 'processando'], [3, 'processando']]) {
      expect((await webhook(videoId, status)).status).toBe(200);
      const ep = await ler(episode);
      expect(ep.status).toBe('draft'); // nunca 'processing', que é do caminho do admin
      expect(ep.videoEnvio.estado).toBe(estado);
    }

    const res = await webhook(videoId, 4);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    await espera(120); // os avisos do caminho do admin são disparados sem esperar

    const ep = await ler(episode);
    expect(ep.status).toBe('draft');
    expect(ep.submittedAt).toBeNull();
    expect(ep.notificationSentAt).toBeNull();
    expect(ep.videoEnvio.estado).toBe('pronto');
    expect(ep.video_url).toBe(`https://${CDN}/${videoId}/playlist.m3u8`);
    expect(push).not.toHaveBeenCalled();
    expect(recalculo).not.toHaveBeenCalled();

    // O público não vê nada: nem a obra, nem o episódio, nem o vídeo.
    expect((await request(app).get('/api/content/series?type=vcine')).body.some(s => String(s._id) === String(series._id))).toBe(false);
    expect((await request(app).get(`/api/content/episodes/${episode._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/content/series/${series._id}/episodes`)).body).toEqual([]);
  });

  it('mesmo com a OBRA já publicada, o capítulo novo do autor não vai ao ar pelo webhook', async () => {
    const { push, recalculo } = espiarAvisos();
    const autor = await criarAutor();
    const { episode, series } = await obraDoAutor(autor, 'hqcine');
    await Series.updateOne({ _id: series._id }, { $set: { isPublished: true, genre: 'Drama', content_rating: 'teen' } });
    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;

    expect((await webhook(videoId, 4)).status).toBe(200);
    await espera(120);
    expect((await ler(episode)).status).toBe('draft');
    expect(push).not.toHaveBeenCalled();
    expect(recalculo).not.toHaveBeenCalled();
    expect((await request(app).get(`/api/content/series/${series._id}/episodes`)).body).toEqual([]);
    expect((await request(app).get(`/api/content/episodes/${episode._id}`)).status).toBe(404);
  });

  it('erro no processamento marca o vídeo com erro e o episódio continua rascunho', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;
    expect((await webhook(videoId, 5)).status).toBe(200);
    expect(await ler(episode)).toMatchObject({ status: 'draft', videoEnvio: { estado: 'erro' } });
  });

  it('a consulta manual do admin (o outro caminho que publicava pelo estado do Bunny) também não publica o vídeo de autor', async () => {
    const { push, recalculo } = espiarAvisos();
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;
    // Só esta rota fala com o Bunny por `fetch`: responde um Bunny falso.
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 4 }) });

    const res = await com(request(app).get(`/api/bunny/video-status/${videoId}`), admin());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bunnyStatus: 4, mongoStatus: 'draft', videoDoAutor: true });
    await espera(120);
    expect(await ler(episode)).toMatchObject({ status: 'draft', videoEnvio: { estado: 'pronto' } });
    expect(push).not.toHaveBeenCalled();
    expect(recalculo).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o vídeo do admin continua como era', () => {
  async function episodioDoAdmin(extra = {}) {
    contador += 1;
    const series = await Series.create({ title: `Novela Do Admin ${contador}`, content_type: 'vcine', isPublished: true, genre: 'Drama', content_rating: 'teen' });
    const episode = await Episode.create({ seriesId: series._id, episode_number: 1, title: 'EP do admin', status: 'processing', bunnyVideoId: `video-admin-${contador}`, ...extra });
    return { series, episode };
  }

  it('webhook de vídeo pronto: publica o episódio, grava o endereço e dispara o aviso e o recálculo', async () => {
    const { push, recalculo } = espiarAvisos();
    const { episode, series } = await episodioDoAdmin();
    const res = await webhook(episode.bunnyVideoId, 4);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const ep = await ler(episode);
    expect(ep.status).toBe('published');
    expect(ep.video_url).toBe(`https://${CDN}/${episode.bunnyVideoId}/playlist.m3u8`);
    expect(ep.videoEnvio).toBeUndefined();
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1), { timeout: 2000, interval: 20 });
    expect(String(push.mock.calls[0][0])).toBe(String(episode._id));
    expect(recalculo).toHaveBeenCalledWith(expect.anything(), 'capitulo_publicado');
    expect(String(recalculo.mock.calls[0][0])).toBe(String(series._id));
  });

  it('webhook de processando põe o episódio do admin em "processing", como antes', async () => {
    const { episode } = await episodioDoAdmin({ status: 'draft' });
    expect((await webhook(episode.bunnyVideoId, 2)).status).toBe(200);
    expect((await ler(episode)).status).toBe('processing');
  });

  it('o admin troca o vídeo de um episódio que o autor tinha enviado: vale o caminho do admin (publica)', async () => {
    const { push } = espiarAvisos();
    const autor = await criarAutor();
    const { episode, series } = await obraDoAutor(autor, 'vcine');
    await Series.updateOne({ _id: series._id }, { $set: { isPublished: true, genre: 'Drama', content_rating: 'teen' } });
    await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' });
    // O que as rotas de envio do admin gravam: outro vídeo, em processamento.
    await Episode.updateOne({ _id: episode._id }, { $set: { bunnyVideoId: 'video-novo-do-admin', status: 'processing' } });

    expect((await webhook('video-novo-do-admin', 4)).status).toBe(200);
    expect((await ler(episode)).status).toBe('published');
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1), { timeout: 2000, interval: 20 });
    // E o portal deixa de mostrar o envio antigo do autor.
    expect((await estadoDoVideo(episode, autor.token)).body.estado).toBe('sem-video');
  });

  it('webhook sem o segredo continua recusado (403) e não toca em nada', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;
    const res = await request(app).post('/api/bunny/webhook').set('x-webhook-token', 'errado').send({ VideoGuid: videoId, Status: 4 });
    expect(res.status).toBe(403);
    expect((await ler(episode)).videoEnvio.estado).toBe('enviando');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('aviso de vídeo pronto no portal', () => {
  it('o dono acompanha: sem vídeo, enviando, processando, pronto', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    expect((await estadoDoVideo(episode, autor.token)).body).toMatchObject({ estado: 'sem-video', pronto: false });

    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;
    expect((await estadoDoVideo(episode, autor.token)).body).toMatchObject({ estado: 'enviando', videoId, pronto: false });

    await webhook(videoId, 3);
    expect((await estadoDoVideo(episode, autor.token)).body).toMatchObject({ estado: 'processando', pronto: false });
    await webhook(videoId, 4);
    expect((await estadoDoVideo(episode, autor.token)).body).toMatchObject({ estado: 'pronto', pronto: true });

    // O estado também vem na lista de capítulos que o Meu Estúdio já lê.
    const lista = await com(request(app).get(`/api/content/series/${episode.seriesId}/episodes`), autor.token);
    expect(lista.body[0].videoEnvio).toMatchObject({ estado: 'pronto' });
  });

  it('webhook perdido: a consulta confere com o Bunny e marca pronto, sem publicar', async () => {
    const { push } = espiarAvisos();
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    const { videoId } = (await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' })).body;
    // Passou do intervalo entre consultas e o Bunny (falso) já terminou.
    await Episode.updateOne({ _id: episode._id }, { $set: { 'videoEnvio.atualizadoEm': new Date(Date.now() - 60000) } });
    estadoNoBunny.set(videoId, 4);

    const res = await estadoDoVideo(episode, autor.token);
    expect(res.body).toMatchObject({ estado: 'pronto', pronto: true });
    expect(consultas).toEqual([videoId]);
    expect(await ler(episode)).toMatchObject({ status: 'draft', video_url: `https://${CDN}/${videoId}/playlist.m3u8` });
    expect(push).not.toHaveBeenCalled();

    // Estado final: não pergunta mais ao Bunny.
    await estadoDoVideo(episode, autor.token);
    expect(consultas).toHaveLength(1);
  });

  it('consulta logo depois da última atualização não vai ao Bunny (o portal pergunta de tempos em tempos)', async () => {
    const autor = await criarAutor();
    const { episode } = await obraDoAutor(autor, 'vcine');
    await pedirAutorizacao(episode, autor.token, { tamanho: 1000, tipo: 'video/mp4' });
    await estadoDoVideo(episode, autor.token);
    expect(consultas).toEqual([]);
  });
});
