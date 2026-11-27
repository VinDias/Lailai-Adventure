/**
 * Frente A, item 10: obras novas de V-Show (`vcine`) e Anicom (`hqcine`)
 * passam pela Fila de Aprovação que já existe (routes/portal.js enviar,
 * routes/adminPortal.js fila e aprovar, services/videoAutorService.js).
 *
 * Critério da proposta de 21/11/2026: "obra nova de V-Show ou Anicom só
 * aparece no catálogo depois de aprovada".
 *
 * O QUE ESTE ARQUIVO GARANTE:
 * - o caminho inteiro, pelas rotas: o autor cria a obra e o episódio, envia o
 *   vídeo (Bunny falso), envia os dois para aprovação; ANTES de aprovada a
 *   obra não está no catálogo, nem com o vídeo pronto, nem na fila; APROVADA
 *   a obra, ela aparece no catálogo do tipo dela; o episódio só aparece e só
 *   avisa quando ELE é aprovado; o aviso sai uma vez, e um webhook repetido
 *   do Bunny não avisa de novo nem tira do ar. Para V-Show e para Anicom;
 * - a fila mostra o tipo da obra e o vídeo do episódio; o moderador (admin)
 *   recebe a URL assinada do vídeo do rascunho enviado, que é o que o player
 *   do site usa; visitante e outro autor recebem 404;
 * - a fila não aceita obra de vídeo sem episódio com vídeo pronto, nem
 *   episódio sem vídeo, com vídeo processando ou com erro;
 * - o episódio só vai para a fila (e só é aprovado) depois que a autorização
 *   de envio do autor venceu: o moderador vê o vídeo quando ele já não pode
 *   ser trocado por fora do servidor;
 * - vídeo que muda no Bunny depois de pronto tira o episódio da fila;
 * - devolver funciona como nos quadrinhos; Hi-Qua continua exigindo painéis.
 *
 * Bunny FALSO, como em videoAutor.test.js: nenhuma chamada de rede.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Series, Channel, User, MensagemPortal, bunnyStream, notificationService, recommendationService;

const CDN = 'vz-teste-fila.b-cdn.net';
const SEGREDO_WEBHOOK = 'segredo-webhook-fila';
const VARIAVEIS = ['BUNNY_API_KEY', 'BUNNY_LIBRARY_ID', 'BUNNY_CDN_HOSTNAME', 'BUNNY_WEBHOOK_SECRET', 'BUNNY_TOKEN_KEY'];
const ambiente = {};
let fetchReal;
let chamadasDeRede;
let contadorDeVideo = 0;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  MensagemPortal = require('../../models/MensagemPortal');
  bunnyStream = require('../../utils/bunnyStream');
  notificationService = require('../../services/notificationService');
  recommendationService = require('../../services/recommendationService');
  await auth.createUsers(app);
  for (const k of VARIAVEIS) ambiente[k] = process.env[k];
  fetchReal = global.fetch;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(ambiente)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  bunnyStream.__setClientForTests(null);
  global.fetch = fetchReal;
  await db.closeDatabase();
});

beforeEach(() => {
  process.env.BUNNY_API_KEY = 'chave-de-teste-fila';
  process.env.BUNNY_LIBRARY_ID = '515151';
  process.env.BUNNY_CDN_HOSTNAME = CDN;
  process.env.BUNNY_WEBHOOK_SECRET = SEGREDO_WEBHOOK;
  process.env.BUNNY_TOKEN_KEY = 'chave-de-token-de-teste';
  chamadasDeRede = [];
  bunnyStream.__setClientForTests({
    createVideo: async () => { contadorDeVideo += 1; return `video-fila-${contadorDeVideo}`; },
    getVideo: async () => null,
    deleteVideo: async () => {},
  });
  global.fetch = async (url) => { chamadasDeRede.push(String(url)); throw new Error(`chamada de rede em teste: ${url}`); };
  vi.restoreAllMocks();
});
afterEach(() => {
  expect(chamadasDeRede).toEqual([]);
});

let contador = 0;
async function criarAutor() {
  contador += 1;
  const email = `fila-video-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash('Senha@123', 4);
  const user = await User.create({ email, passwordHash, nome: `Autor ${contador}`, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Fila Video ${contador} ${Date.now()}` });
  return { token: login.body.accessToken, canal, id: String(user._id) };
}

const com = (req, token) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
const admin = () => auth.getToken('admin');
const webhook = (videoId, status) => request(app).post('/api/bunny/webhook').set('x-webhook-token', SEGREDO_WEBHOOK).send({ VideoGuid: videoId, Status: status });
const ler = (ep) => Episode.findById(ep._id).lean();
const espera = (ms) => new Promise(r => setTimeout(r, ms));

const fila = async () => (await com(request(app).get('/api/admin/aprovacoes'), admin())).body.itens;
const naFila = async (id) => (await fila()).find(i => String(i.id) === String(id));
const catalogo = async (tipo) => (await request(app).get(`/api/content/series?type=${tipo}`)).body;
const noCatalogo = async (tipo, id) => (await catalogo(tipo)).some(s => String(s._id) === String(id));
const episodiosPublicos = async (serieId) => (await request(app).get(`/api/content/series/${serieId}/episodes`)).body;

const enviarObra = (s, token) => com(request(app).post(`/api/portal/series/${s._id}/enviar`), token);
const enviarEpisodio = (e, token) => com(request(app).post(`/api/portal/episodios/${e._id}/enviar`), token);
const aprovarObra = (s, body = { genre: 'Drama', content_rating: 'teen' }) => com(request(app).post(`/api/admin/aprovacoes/series/${s._id}/aprovar`), admin()).send(body);
const aprovarEpisodio = (e) => com(request(app).post(`/api/admin/aprovacoes/episodes/${e._id}/aprovar`), admin());
const assinada = (videoId, token) => com(request(app).get(`/api/bunny/signed-url?videoId=${videoId}`), token);

/** A autorização de envio do autor já venceu (na vida real: alguns minutos depois do envio). */
const vencerAutorizacao = (e) => Episode.updateOne({ _id: e._id }, { $set: { 'videoEnvio.autorizadoAte': new Date(Date.now() - 1000) } });

/** Obra (com capa) e episódio criados pelo portal; `video`: até onde o vídeo chega. */
async function obraComEpisodio(autor, tipo, { video = 'pronto', vencida = true } = {}) {
  contador += 1;
  const obra = await com(request(app).post('/api/portal/series'), autor.token)
    .send({ title: `Obra ${tipo} ${contador}`, content_type: tipo, cover_image: 'https://exemplo.test/capa.jpg' });
  expect(obra.status).toBe(201);
  const ep = await com(request(app).post(`/api/portal/series/${obra.body._id}/episodios`), autor.token).send({ title: 'Episódio 1', episode_number: 1 });
  expect(ep.status).toBe(201);
  let videoId = null;
  if (video !== 'sem') {
    const a = await com(request(app).post(`/api/portal/episodios/${ep.body._id}/video/autorizacao`), autor.token).send({ tamanho: 10 * 1024 * 1024, tipo: 'video/mp4' });
    expect(a.status).toBe(200);
    videoId = a.body.videoId;
    const status = { enviando: null, processando: 3, pronto: 4, erro: 5 }[video];
    if (status !== null) expect((await webhook(videoId, status)).status).toBe(200);
    if (vencida) await vencerAutorizacao(ep.body);
  }
  return { series: obra.body, episode: ep.body, videoId };
}

function espiarAvisos() {
  return {
    push: vi.spyOn(notificationService, 'notifyEpisodePublished').mockResolvedValue(undefined),
    recalculo: vi.spyOn(recommendationService, 'dispararRecalculo').mockImplementation(() => {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe.each([['vcine', 'V-Show'], ['hqcine', 'Anicom']])('obra nova de %s (%s) passa pela fila', (tipo) => {
  it('não aparece no catálogo antes de aprovada; aprovada, aparece; o episódio só vai ao ar e só avisa quando ELE é aprovado', async () => {
    const { push, recalculo } = espiarAvisos();
    const autor = await criarAutor();
    const { series, episode, videoId } = await obraComEpisodio(autor, tipo);

    // Vídeo pronto, nada enviado para aprovação: fora do catálogo e fora da fila.
    expect(await noCatalogo(tipo, series._id)).toBe(false);
    expect(await naFila(series._id)).toBeUndefined();
    expect(await naFila(episode._id)).toBeUndefined();

    expect((await enviarObra(series, autor.token)).status).toBe(200);
    expect((await enviarEpisodio(episode, autor.token)).status).toBe(200);

    // Na fila, com o tipo e o vídeo; ainda fora do catálogo.
    const itemObra = await naFila(series._id);
    expect(itemObra).toMatchObject({ tipo: 'series', content_type: tipo });
    const itemEp = await naFila(episode._id);
    expect(itemEp).toMatchObject({ tipo: 'episode', content_type: tipo, video: { videoId, pronto: true, estado: 'pronto' } });
    expect(itemEp.serie).toMatchObject({ isPublished: false });
    expect(await noCatalogo(tipo, series._id)).toBe(false);
    expect((await request(app).get(`/api/content/series/${series._id}`)).status).toBe(404);
    expect(await episodiosPublicos(series._id)).toEqual([]);

    // O episódio não é aprovado antes da obra.
    expect((await aprovarEpisodio(episode)).status).toBe(400);

    // Aprovada a OBRA: aparece no catálogo do tipo dela. O episódio ainda não.
    const aprovada = await aprovarObra(series);
    expect(aprovada.status).toBe(200);
    expect(aprovada.body).toMatchObject({ isPublished: true, content_type: tipo, genre: 'Drama', content_rating: 'teen' });
    expect(await noCatalogo(tipo, series._id)).toBe(true);
    expect((await request(app).get(`/api/content/series/${series._id}`)).status).toBe(200);
    // Só no catálogo do tipo dela.
    for (const outro of ['hiqua', 'vcine', 'hqcine'].filter(t => t !== tipo)) expect(await noCatalogo(outro, series._id)).toBe(false);
    expect(await episodiosPublicos(series._id)).toEqual([]);
    expect((await request(app).get(`/api/content/episodes/${episode._id}`)).status).toBe(404);
    expect(push).not.toHaveBeenCalled();

    // Aprovado o EPISÓDIO: vai ao ar com o vídeo, e o aviso sai uma vez.
    const epAprovado = await aprovarEpisodio(episode);
    expect(epAprovado.status).toBe(200);
    const publicos = await episodiosPublicos(series._id);
    expect(publicos).toHaveLength(1);
    expect(publicos[0]).toMatchObject({ status: 'published', bunnyVideoId: videoId, video_url: `https://${CDN}/${videoId}/playlist.m3u8` });
    expect(push).toHaveBeenCalledTimes(1);
    expect(String(push.mock.calls[0][0])).toBe(String(episode._id));
    expect(recalculo).toHaveBeenCalledWith(expect.anything(), 'capitulo_publicado');
    expect(await naFila(episode._id)).toBeUndefined();

    // O Bunny repete "pronto" depois: nada muda no ar e nenhum aviso novo.
    push.mockClear();
    recalculo.mockClear();
    expect((await webhook(videoId, 4)).status).toBe(200);
    await espera(120);
    expect((await ler(episode)).status).toBe('published');
    expect(push).not.toHaveBeenCalled();
    expect(recalculo).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o moderador vê o vídeo do episódio enviado', () => {
  it('admin recebe a URL assinada do vídeo do rascunho na fila (a que o player do site usa); visitante, leitor e outro autor recebem 404', async () => {
    const autor = await criarAutor();
    const outro = await criarAutor();
    const { series, episode, videoId } = await obraComEpisodio(autor, 'vcine');
    await enviarObra(series, autor.token);
    await enviarEpisodio(episode, autor.token);
    expect((await naFila(episode._id)).video.videoId).toBe(videoId);

    const doModerador = await assinada(videoId, admin());
    expect(doModerador.status).toBe(200);
    expect(doModerador.body.signedUrl).toMatch(new RegExp(`^https://${CDN.replace(/\./g, '\\.')}/${videoId}/playlist\\.m3u8\\?token=[A-Za-z0-9_-]+&expires=\\d+&token_path=`));
    expect(doModerador.body.signedUrl).not.toContain('chave-de-token-de-teste');

    expect((await assinada(videoId, null)).status).toBe(404);
    expect((await assinada(videoId, auth.getToken('user'))).status).toBe(404);
    expect((await assinada(videoId, auth.getToken('premium'))).status).toBe(404);
    expect((await assinada(videoId, outro.token)).status).toBe(404);
    // O próprio autor continua vendo o rascunho dele, como já era.
    expect((await assinada(videoId, autor.token)).status).toBe(200);
    // Assistir pela fila não conta visualização.
    expect((await ler(episode)).views).toBe(0);
  });

  it('a fila só aceita ler painéis de episódio de quadrinhos: o item de vídeo traz o vídeo, não painéis', async () => {
    const autor = await criarAutor();
    const { series, episode } = await obraComEpisodio(autor, 'hqcine');
    await enviarObra(series, autor.token);
    await enviarEpisodio(episode, autor.token);
    const item = await naFila(episode._id);
    expect(item.panelCount).toBe(0);
    expect(item.video).toMatchObject({ pronto: true });
    // Item de quadrinhos não ganha o campo `video`.
    const hq = await com(request(app).post('/api/portal/series'), autor.token).send({ title: 'HQ Na Fila', cover_image: 'https://exemplo.test/c.jpg' });
    const epHq = await Episode.create({ seriesId: hq.body._id, episode_number: 1, title: 'Cap HQ', status: 'draft', submittedAt: new Date(), panels: [{ image_url: 'https://exemplo.test/p.jpg', order: 1 }] });
    const itemHq = await naFila(epHq._id);
    expect(itemHq).toMatchObject({ content_type: 'hiqua', panelCount: 1 });
    expect(itemHq.video).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o que a fila exige de uma obra de vídeo', () => {
  it('obra sem nenhum episódio com vídeo pronto não vai para a fila; com vídeo pronto, vai', async () => {
    const autor = await criarAutor();
    for (const video of ['sem', 'enviando', 'processando', 'erro']) {
      const { series } = await obraComEpisodio(autor, 'vcine', { video });
      const res = await enviarObra(series, autor.token);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ao menos um episódio com o vídeo pronto/);
      expect(await naFila(series._id)).toBeUndefined();
    }
    // Sem capa também não vai (regra que já existia).
    const { series } = await obraComEpisodio(autor, 'vcine');
    await Series.updateOne({ _id: series._id }, { $unset: { cover_image: 1 } });
    expect((await enviarObra(series, autor.token)).body.error).toMatch(/falta capa/);
    await Series.updateOne({ _id: series._id }, { $set: { cover_image: 'https://exemplo.test/capa.jpg' } });
    expect((await enviarObra(series, autor.token)).status).toBe(200);
  });

  it('episódio sem vídeo, enviando, processando ou com erro não vai para a fila', async () => {
    const autor = await criarAutor();
    for (const video of ['sem', 'enviando', 'processando', 'erro']) {
      const { series, episode } = await obraComEpisodio(autor, 'hqcine', { video });
      await Series.updateOne({ _id: series._id }, { $set: { submittedAt: new Date() } });
      const res = await enviarEpisodio(episode, autor.token);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/espere ele ficar pronto/);
      expect((await ler(episode)).submittedAt).toBeNull();
    }
  });

  it('episódio de vídeo só vai para a fila depois que a obra foi enviada (regra que já existia)', async () => {
    const autor = await criarAutor();
    const { episode } = await obraComEpisodio(autor, 'vcine');
    const res = await enviarEpisodio(episode, autor.token);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/envie a série primeiro/);
  });

  it('enquanto a autorização de envio do autor vale, o episódio não vai para a fila; vencida, vai', async () => {
    const autor = await criarAutor();
    const { series, episode } = await obraComEpisodio(autor, 'vcine', { vencida: false });
    expect((await enviarObra(series, autor.token)).status).toBe(200);

    const cedo = await enviarEpisodio(episode, autor.token);
    expect(cedo.status).toBe(400);
    expect(cedo.body.error).toMatch(/poderá ir para aprovação em 15 minuto\(s\)/);
    expect(new Date(cedo.body.liberaEm).getTime()).toBeGreaterThan(Date.now());
    expect((await ler(episode)).submittedAt).toBeNull();
    expect(await naFila(episode._id)).toBeUndefined();

    await vencerAutorizacao(episode);
    expect((await enviarEpisodio(episode, autor.token)).status).toBe(200);
    expect(await naFila(episode._id)).toBeTruthy();
  });

  it('aprovar recusa episódio de vídeo sem vídeo pronto ou com a autorização ainda valendo (mesmo que tenha entrado na fila por fora)', async () => {
    const { push } = espiarAvisos();
    const autor = await criarAutor();
    const semVideo = await obraComEpisodio(autor, 'vcine', { video: 'processando' });
    await Series.updateOne({ _id: semVideo.series._id }, { $set: { isPublished: true, genre: 'Drama', content_rating: 'teen' } });
    await Episode.updateOne({ _id: semVideo.episode._id }, { $set: { submittedAt: new Date() } });
    const r1 = await aprovarEpisodio(semVideo.episode);
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/não está pronto/);
    expect((await naFila(semVideo.episode._id)).video).toMatchObject({ pronto: false, estado: 'processando' });

    const comTrava = await obraComEpisodio(autor, 'vcine', { vencida: false });
    await Series.updateOne({ _id: comTrava.series._id }, { $set: { isPublished: true, genre: 'Drama', content_rating: 'teen' } });
    await Episode.updateOne({ _id: comTrava.episode._id }, { $set: { submittedAt: new Date() } });
    const r2 = await aprovarEpisodio(comTrava.episode);
    expect(r2.status).toBe(400);
    expect(r2.body.error).toMatch(/ainda pode trocar o vídeo/);

    for (const e of [semVideo.episode, comTrava.episode]) expect((await ler(e)).status).toBe('draft');
    expect(push).not.toHaveBeenCalled();
  });

  it('vídeo que muda no Bunny depois de pronto, com o episódio na fila: o episódio sai da fila e volta para o autor', async () => {
    const autor = await criarAutor();
    const { series, episode, videoId } = await obraComEpisodio(autor, 'vcine');
    await enviarObra(series, autor.token);
    expect((await enviarEpisodio(episode, autor.token)).status).toBe(200);
    expect(await naFila(episode._id)).toBeTruthy();

    // O Bunny avisa que o vídeo voltou a processar: o arquivo foi trocado.
    expect((await webhook(videoId, 3)).status).toBe(200);
    expect(await naFila(episode._id)).toBeUndefined();
    expect(await ler(episode)).toMatchObject({ status: 'draft', submittedAt: null, videoEnvio: { estado: 'processando' } });
    // A obra continua na fila; pronto de novo, o autor reenvia o episódio.
    expect(await naFila(series._id)).toBeTruthy();
    expect((await webhook(videoId, 4)).status).toBe(200);
    expect((await enviarEpisodio(episode, autor.token)).status).toBe(200);
  });

  it('devolver obra e episódio de vídeo: voltam a rascunho, com o motivo na conversa, e nada vai ao ar', async () => {
    const autor = await criarAutor();
    const { series, episode } = await obraComEpisodio(autor, 'hqcine');
    await enviarObra(series, autor.token);
    await enviarEpisodio(episode, autor.token);

    const dev = await com(request(app).post(`/api/admin/aprovacoes/episode/${episode._id}/devolver`), admin()).send({ texto: 'O áudio está baixo.' });
    expect(dev.status).toBe(200);
    expect(await ler(episode)).toMatchObject({ status: 'draft', submittedAt: null });
    expect(await MensagemPortal.countDocuments({ refId: episode._id, texto: 'O áudio está baixo.' })).toBe(1);
    // Devolvido, o autor pode trocar o vídeo de novo.
    const nova = await com(request(app).post(`/api/portal/episodios/${episode._id}/video/autorizacao`), autor.token).send({ tamanho: 1000, tipo: 'video/mp4' });
    expect(nova.status).toBe(200);

    const devObra = await com(request(app).post(`/api/admin/aprovacoes/series/${series._id}/devolver`), admin()).send({ texto: 'Falta a sinopse.' });
    expect(devObra.status).toBe(200);
    expect(await noCatalogo('hqcine', series._id)).toBe(false);
    expect((await Series.findById(series._id).lean()).submittedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('quadrinhos continuam como eram', () => {
  it('obra de Hi-Qua continua exigindo episódio com painéis, e o episódio, ao menos um painel', async () => {
    const autor = await criarAutor();
    const obra = await com(request(app).post('/api/portal/series'), autor.token).send({ title: 'HQ Sem Painel', cover_image: 'https://exemplo.test/c.jpg' });
    const ep = await com(request(app).post(`/api/portal/series/${obra.body._id}/episodios`), autor.token).send({ title: 'Cap 1', episode_number: 1 });
    // Um vídeo "pronto" num capítulo de quadrinhos não conta como conteúdo.
    await Episode.updateOne({ _id: ep.body._id }, { $set: { video_url: 'https://exemplo.test/v.m3u8' } });

    const semPainel = await enviarObra(obra.body, autor.token);
    expect(semPainel.status).toBe(400);
    expect(semPainel.body.error).toMatch(/ao menos um episódio com painéis/);
    await Series.updateOne({ _id: obra.body._id }, { $set: { submittedAt: new Date() } });
    const epSemPainel = await enviarEpisodio(ep.body, autor.token);
    expect(epSemPainel.status).toBe(400);
    expect(epSemPainel.body.error).toMatch(/ao menos um painel/);
  });
});
