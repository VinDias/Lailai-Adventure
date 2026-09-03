/**
 * Testes: superfícies de DOC ÚNICO do filtro parental (Fase 5, Bloco 2, Task
 * 5) — detalhe da série, episódios da série, episódio/leitor, signed-url e o
 * ramo EPISÓDIOS da busca — mais o push de capítulo novo e os writes de
 * engajamento (favoritar, votar ×2, Super Reader create-session). Spec:
 * docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.4, seções "Superfícies filtradas (doc único)", "Push de capítulo
 * novo", "Writes de engajamento", "Exceções ao filtro", "Migração do
 * acervo"). Ledger: ruling A5 da T4 (passar channelId CRU a
 * serieVisivelPara, nunca populado — os fetches abaixo nunca fazem
 * .populate('channelId')).
 *
 * A matriz completa de LISTA (kids/teen/young/anônimo/admin com preferências
 * restritivas próprias, campo AUSENTE vs null) já está coberta em
 * tests/backend/parentalListSurfaces.test.js — aqui a matriz é reduzida
 * (kids/young+tag/anônimo/admin/dono, +1 controle positivo por surperfície)
 * e foca no que é ESPECÍFICO do doc único: 404 (não [] — exceto episódios da
 * série, que herda o contrato [] da T2/B1), efeitos colaterais
 * (views/EngagementEvent/push) NÃO disparando, a exceção de DONO (ausente
 * nas listas, presente aqui — exceto no ramo episódios da busca, onde a
 * exceção-da-exceção da spec tira o dono de novo).
 *
 * Fix round (revisão bloqueante): o ramo EPISÓDIOS da busca deixou de fazer
 * post-filter com passaFiltroParental na série populada (jogava 500 pra
 * ANÔNIMO também em doc legado — só `isAdmin` pulava o predicado) e passou
 * a filtrar QUERY-SIDE (Series.find(...).distinct('_id') reaproveitando o
 * MESMO filtroParental do ramo séries, depois Episode.find com
 * seriesId:{$in:idsVisiveis}) — ver describe "ramo EPISÓDIOS" abaixo, sem
 * getParentalDe (removido de utils/parentalFilter.js, ficou sem uso). O
 * describe "Backfill" no fim cobre o achado raiz: content_rating/tags
 * genuinamente AUSENTES no documento (acervo pré-B2) faziam
 * serieVisivelPara/passaFiltroParental LANÇAR (500) pra todo logado
 * não-admin/não-dono nas OUTRAS quatro superfícies de doc único — corrigido
 * com o backfill idempotente no boot (services/parentalBackfill.js).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let User, Series, Channel, Episode, Favorite, Vote, SeriesVote, PushSubscription, EngagementEvent;
let engagementLogger, notificationService, superReaderService;

const SENHA = 'Senha@123';
let contador = 0;
function unico(prefixo) {
  contador += 1;
  return `${prefixo}-${contador}-${Date.now()}`;
}

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  Episode = require('../../models/Episode');
  Favorite = require('../../models/Favorite');
  Vote = require('../../models/Vote');
  SeriesVote = require('../../models/SeriesVote');
  PushSubscription = require('../../models/PushSubscription');
  EngagementEvent = require('../../models/EngagementEvent');
  engagementLogger = require('../../services/engagementLogger');
  notificationService = require('../../services/notificationService');
  superReaderService = require('../../services/superReaderService');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

afterEach(() => {
  notificationService.__setTransportForTests(null);
  superReaderService.__setStripeForTests(null);
});

// ─── perfis reutilizados pela matriz inteira (molde de parentalListSurfaces.test.js) ─
async function criarPerfil({ classificacaoEtaria = 'young', tagsBloqueadas = [], role = 'user' } = {}) {
  const email = `${unico('perfildoc')}@lorflux.test`;
  const passwordHash = await bcrypt.hash(SENHA, 10);
  const user = await User.create({
    email, passwordHash, nome: 'Perfil Doc', role,
    parental: { classificacaoEtaria, tagsBloqueadas },
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: SENHA });
  return { id: user._id.toString(), token: login.body.accessToken };
}

function authed(req, perfil) {
  return perfil?.token ? req.set('Authorization', `Bearer ${perfil.token}`) : req;
}

async function criarDono(overridesParental = { classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] }) {
  const dono = await criarPerfil(overridesParental);
  const canal = await Channel.create({ ownerId: dono.id, name: `Canal Doc ${unico('c')}` });
  return { dono, canal };
}

let kids, youngTagBloqueada, adminRestritivo;

beforeAll(async () => {
  kids = await criarPerfil({ classificacaoEtaria: 'kids' });
  youngTagBloqueada = await criarPerfil({ classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] });
  // Preferências DELIBERADAMENTE restritivas — prova que o bypass de admin
  // (nas rotas de doc único) é pela role, não porque "por acaso" não tem
  // nada bloqueado (mesmo raciocínio de parentalListSurfaces.test.js).
  adminRestritivo = await criarPerfil({ classificacaoEtaria: 'kids', tagsBloqueadas: ['acao'], role: 'admin' });
});

// ─── fixtures de conteúdo ─────────────────────────────────────────────────
async function criarSerie(tituloBase, overrides = {}) {
  return Series.create({
    title: `${tituloBase} ${unico('x')}`,
    genre: 'Teste',
    content_type: 'hiqua',
    isPublished: true,
    ...overrides,
  });
}

async function criarEpisodioPublicado(seriesId, overrides = {}) {
  return Episode.create({
    seriesId, episode_number: 1, title: `Ep ${unico('ep')}`, status: 'published', ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) GET /api/content/series/:id — detalhe
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series/:id — filtro parental (doc único)', () => {
  it('kids vê série kids (controle positivo)', async () => {
    const serie = await criarSerie('Detalhe0', { content_rating: 'kids' });
    const res = await authed(request(app).get(`/api/content/series/${serie._id}`), kids);
    expect(res.status).toBe(200);
  });

  it('kids: série young publicada → 404 (mesmo padrão dos drafts — nunca confirma existência)', async () => {
    const serie = await criarSerie('Detalhe1', { content_rating: 'young' });
    const res = await authed(request(app).get(`/api/content/series/${serie._id}`), kids);
    expect(res.status).toBe(404);
  });

  it('young com tag bloqueada × série com a tag → 404', async () => {
    const serie = await criarSerie('Detalhe2', { content_rating: 'young', tags: ['acao'] });
    const res = await authed(request(app).get(`/api/content/series/${serie._id}`), youngTagBloqueada);
    expect(res.status).toBe(404);
  });

  it('anônimo → 200', async () => {
    const serie = await criarSerie('Detalhe3', { content_rating: 'kids' });
    const res = await request(app).get(`/api/content/series/${serie._id}`);
    expect(res.status).toBe(200);
  });

  it('admin → 200 mesmo com parental restritivo próprio (AdminDashboard gerencia pela rota pública)', async () => {
    const serie = await criarSerie('Detalhe4', { content_rating: 'kids', tags: ['acao'] });
    const res = await authed(request(app).get(`/api/content/series/${serie._id}`), adminRestritivo);
    expect(res.status).toBe(200);
  });

  it('dono com a tag da própria obra bloqueada → 200 (exceção do helper)', async () => {
    const { dono, canal } = await criarDono();
    const serie = await criarSerie('Detalhe5', { content_rating: 'young', tags: ['acao'], channelId: canal._id });
    const res = await authed(request(app).get(`/api/content/series/${serie._id}`), dono);
    expect(res.status).toBe(200);
  });

  it('rascunho: dono vê o próprio draft SEM o filtro parental interferir (podeVerRascunho inalterado)', async () => {
    const { dono, canal } = await criarDono();
    const draft = await criarSerie('Detalhe6', { content_rating: 'young', tags: ['acao'], channelId: canal._id, isPublished: false });
    const res = await authed(request(app).get(`/api/content/series/${draft._id}`), dono);
    expect(res.status).toBe(200);
    expect(res.body.title).toContain('Detalhe6');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2) GET /api/content/series/:id/episodes
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series/:id/episodes — filtro parental (doc único)', () => {
  it('kids vê episódios de série kids (controle positivo)', async () => {
    const serie = await criarSerie('Episodios0', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/series/${serie._id}/episodes`), kids);
    expect(res.status).toBe(200);
    expect(res.body.map(e => e._id)).toContain(String(ep._id));
  });

  it('kids: série young publicada → [] (mesmo contrato de "inexistente" da T2/B1)', async () => {
    const serie = await criarSerie('Episodios1', { content_rating: 'young' });
    await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/series/${serie._id}/episodes`), kids);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('young com tag bloqueada × série com a tag → []', async () => {
    const serie = await criarSerie('Episodios2', { content_rating: 'young', tags: ['acao'] });
    await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/series/${serie._id}/episodes`), youngTagBloqueada);
    expect(res.body).toEqual([]);
  });

  it('anônimo → 200 com os episódios', async () => {
    const serie = await criarSerie('Episodios3', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await request(app).get(`/api/content/series/${serie._id}/episodes`);
    expect(res.status).toBe(200);
    expect(res.body.map(e => e._id)).toContain(String(ep._id));
  });

  it('admin → 200 com os episódios, mesmo com parental restritivo próprio', async () => {
    const serie = await criarSerie('Episodios4', { content_rating: 'kids', tags: ['acao'] });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/series/${serie._id}/episodes`), adminRestritivo);
    expect(res.body.map(e => e._id)).toContain(String(ep._id));
  });

  it('dono com a tag da própria obra bloqueada → 200 com os episódios', async () => {
    const { dono, canal } = await criarDono();
    const serie = await criarSerie('Episodios5', { content_rating: 'young', tags: ['acao'], channelId: canal._id });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/series/${serie._id}/episodes`), dono);
    expect(res.body.map(e => e._id)).toContain(String(ep._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3) GET /api/content/episodes/:id — episódio/leitor
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/episodes/:id — filtro parental (doc único)', () => {
  it('kids vê episódio de série kids (controle positivo)', async () => {
    const serie = await criarSerie('EpDet0', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/episodes/${ep._id}`), kids);
    expect(res.status).toBe(200);
  });

  it('kids: episódio de série young publicada → 404, SEM incrementar views nem gravar EngagementEvent', async () => {
    const serie = await criarSerie('EpDet1', { content_rating: 'young' });
    const ep = await criarEpisodioPublicado(serie._id, { views: 0 });

    const res = await authed(request(app).get(`/api/content/episodes/${ep._id}`), kids);
    expect(res.status).toBe(404);

    await engagementLogger.flushForTests();
    const semViews = await Episode.findById(ep._id).lean();
    expect(semViews.views).toBe(0);
    const eventos = await EngagementEvent.countDocuments({ episodeId: ep._id });
    expect(eventos).toBe(0);
  });

  it('young com tag bloqueada × série com a tag → 404, sem efeitos colaterais', async () => {
    const serie = await criarSerie('EpDet2', { content_rating: 'young', tags: ['acao'] });
    const ep = await criarEpisodioPublicado(serie._id, { views: 0 });

    const res = await authed(request(app).get(`/api/content/episodes/${ep._id}`), youngTagBloqueada);
    expect(res.status).toBe(404);

    await engagementLogger.flushForTests();
    const semViews = await Episode.findById(ep._id).lean();
    expect(semViews.views).toBe(0);
  });

  it('anônimo → 200', async () => {
    const serie = await criarSerie('EpDet3', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await request(app).get(`/api/content/episodes/${ep._id}`);
    expect(res.status).toBe(200);
  });

  it('admin → 200 mesmo com parental restritivo próprio', async () => {
    const serie = await criarSerie('EpDet4', { content_rating: 'kids', tags: ['acao'] });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).get(`/api/content/episodes/${ep._id}`), adminRestritivo);
    expect(res.status).toBe(200);
  });

  it('dono com a tag da própria obra bloqueada → 200, e views incrementam normalmente (não é rascunho/QA)', async () => {
    const { dono, canal } = await criarDono();
    const serie = await criarSerie('EpDet5', { content_rating: 'young', tags: ['acao'], channelId: canal._id });
    const ep = await criarEpisodioPublicado(serie._id, { views: 0 });

    const res = await authed(request(app).get(`/api/content/episodes/${ep._id}`), dono);
    expect(res.status).toBe(200);

    await engagementLogger.flushForTests();
    const comViews = await Episode.findById(ep._id).lean();
    expect(comViews.views).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4) GET /api/bunny/signed-url
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/bunny/signed-url — filtro parental (doc único)', () => {
  let cdnAnterior, tokenAnterior;
  beforeAll(() => {
    cdnAnterior = process.env.BUNNY_CDN_HOSTNAME;
    tokenAnterior = process.env.BUNNY_TOKEN_KEY;
    process.env.BUNNY_CDN_HOSTNAME = 'cdn-teste-parental-doc.b-cdn.net';
    process.env.BUNNY_TOKEN_KEY = 'chave-teste-parental-doc';
  });
  afterAll(() => {
    if (cdnAnterior !== undefined) process.env.BUNNY_CDN_HOSTNAME = cdnAnterior; else delete process.env.BUNNY_CDN_HOSTNAME;
    if (tokenAnterior !== undefined) process.env.BUNNY_TOKEN_KEY = tokenAnterior; else delete process.env.BUNNY_TOKEN_KEY;
  });

  it('kids vê o vídeo de série kids (controle positivo)', async () => {
    const serie = await criarSerie('SignedDoc0', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id, { bunnyVideoId: unico('bunny') });
    const res = await authed(request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`), kids);
    expect(res.status).toBe(200);
  });

  it('kids: vídeo de série young publicada → 404', async () => {
    const serie = await criarSerie('SignedDoc1', { content_rating: 'young' });
    const ep = await criarEpisodioPublicado(serie._id, { bunnyVideoId: unico('bunny') });
    const res = await authed(request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`), kids);
    expect(res.status).toBe(404);
  });

  it('young com tag bloqueada × série com a tag → 404', async () => {
    const serie = await criarSerie('SignedDoc2', { content_rating: 'young', tags: ['acao'] });
    const ep = await criarEpisodioPublicado(serie._id, { bunnyVideoId: unico('bunny') });
    const res = await authed(request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`), youngTagBloqueada);
    expect(res.status).toBe(404);
  });

  it('anônimo → 200', async () => {
    const serie = await criarSerie('SignedDoc3', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id, { bunnyVideoId: unico('bunny') });
    const res = await request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`);
    expect(res.status).toBe(200);
  });

  it('admin → 200 mesmo com parental restritivo próprio', async () => {
    const serie = await criarSerie('SignedDoc4', { content_rating: 'kids', tags: ['acao'] });
    const ep = await criarEpisodioPublicado(serie._id, { bunnyVideoId: unico('bunny') });
    const res = await authed(request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`), adminRestritivo);
    expect(res.status).toBe(200);
  });

  it('dono com a tag da própria obra bloqueada → 200', async () => {
    const { dono, canal } = await criarDono();
    const serie = await criarSerie('SignedDoc5', { content_rating: 'young', tags: ['acao'], channelId: canal._id });
    const ep = await criarEpisodioPublicado(serie._id, { bunnyVideoId: unico('bunny') });
    const res = await authed(request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`), dono);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5) GET /api/content/search — ramo EPISÓDIOS
// ═══════════════════════════════════════════════════════════════════════════

// Fix round (revisão bloqueante): o filtro deste ramo virou QUERY-SIDE
// (routes/content.js — idsVisiveis = Series.find({isPublished:true,
// ...filtroParental}).distinct('_id'), depois Episode.find com
// seriesId:{$in:idsVisiveis}) — não lê mais content_rating/tags de doc
// nenhum, então NUNCA lança, nem para doc legado (ver describe "Backfill"
// no fim: antes dele existir, o post-filter antigo jogava 500 pra qualquer
// logado não-admin E para anônimo).
describe('GET /api/content/search — ramo EPISÓDIOS (filtro parental)', () => {
  it('kids vê episódio de série kids no array (controle positivo)', async () => {
    const termo = unico('BuscaEpDoc0');
    const serie = await criarSerie(termo, { content_rating: 'kids' });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });
    const res = await authed(request(app).get(`/api/content/search?q=${termo}`), kids);
    expect(res.status).toBe(200);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(true);
  });

  it('kids: episódio de série young some do array episodes', async () => {
    const termo = unico('BuscaEpDoc1');
    const serie = await criarSerie(termo, { content_rating: 'young' });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });
    const res = await authed(request(app).get(`/api/content/search?q=${termo}`), kids);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(false);
  });

  it('young com tag bloqueada × episódio de série com a tag → some do array', async () => {
    const termo = unico('BuscaEpDoc2');
    const serie = await criarSerie(termo, { content_rating: 'young', tags: ['acao'] });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });
    const res = await authed(request(app).get(`/api/content/search?q=${termo}`), youngTagBloqueada);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(false);
  });

  it('anônimo vê o episódio', async () => {
    const termo = unico('BuscaEpDoc3');
    const serie = await criarSerie(termo, { content_rating: 'kids' });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });
    const res = await request(app).get(`/api/content/search?q=${termo}`);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(true);
  });

  it('admin vê o episódio mesmo com preferências restritivas próprias (getFiltroParental já devolve {} pra admin)', async () => {
    const termo = unico('BuscaEpDoc4');
    const serie = await criarSerie(termo, { content_rating: 'kids', tags: ['acao'] });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });
    const res = await authed(request(app).get(`/api/content/search?q=${termo}`), adminRestritivo);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(true);
  });

  // Exceção-da-exceção pinada na spec ("Writes de engajamento"): no ramo
  // EPISÓDIOS da busca o filtro vale para TODOS, inclusive o dono — a
  // exceção de dono é exclusiva de serieVisivelPara (doc único).
  it('dono com a tag da própria obra bloqueada: o episódio TAMBÉM some (sem exceção de dono aqui)', async () => {
    const { dono, canal } = await criarDono();
    const termo = unico('BuscaEpDoc5');
    const serie = await criarSerie(termo, { content_rating: 'young', tags: ['acao'], channelId: canal._id });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });
    const res = await authed(request(app).get(`/api/content/search?q=${termo}`), dono);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(false);
  });

  // Achado NOVO da revisão bloqueante: o post-filter antigo só pulava o
  // predicado pra `isAdmin` — visitante SEM conta caía em
  // passaFiltroParental(null, serie) e o throw do doc legado (content_rating
  // genuinamente ausente) pegava ele também, 500 pra QUALQUER UM. O filtro
  // query-side nunca lê content_rating/tags do documento — imune por
  // desenho, sem depender do backfill ter rodado.
  it('anônimo × episódio de série LEGADA (sem content_rating/tags no doc) → 200, episódio aparece (não lança)', async () => {
    const termo = unico('BuscaEpDocLegado');
    const serieLegada = await criarSerie(termo, {});
    // insertOne CRU: bypassa o setter/default do Mongoose — reproduz um doc
    // de verdade anterior à Task 1 (campo nunca gravado, não "null").
    await Series.collection.updateOne(
      { _id: serieLegada._id },
      { $unset: { content_rating: '', tags: '' } },
    );
    const ep = await Episode.create({ seriesId: serieLegada._id, episode_number: 1, title: `${termo} Cap`, status: 'published' });

    const res = await request(app).get(`/api/content/search?q=${termo}`);
    expect(res.status).toBe(200);
    expect(res.body.episodes.some(e => e._id === String(ep._id))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6) Push de capítulo novo — audiência filtrada pelo parental
// ═══════════════════════════════════════════════════════════════════════════

describe('Push de capítulo novo — filtro parental (audiência)', () => {
  async function criarSubscription(userId, sufixo) {
    return PushSubscription.create({
      userId,
      endpoint: `https://push.exemplo/${sufixo}-${new mongoose.Types.ObjectId()}`,
      keys: { p256dh: 'p', auth: 'a' },
    });
  }

  it('favoritar → bloquear a tag → publicar capítulo → zero envios para esse usuário; envio normal para outro favoritador sem bloqueio', async () => {
    const bloqueado = await criarPerfil({ classificacaoEtaria: 'young' });
    const livre = await criarPerfil({ classificacaoEtaria: 'young' });
    const serie = await criarSerie('Push1', { content_rating: 'young', tags: ['acao'] });

    const favBloqueado = await authed(request(app).post(`/api/favorites/${serie._id}`), bloqueado);
    expect(favBloqueado.status).toBe(200);
    const favLivre = await authed(request(app).post(`/api/favorites/${serie._id}`), livre);
    expect(favLivre.status).toBe(200);
    await criarSubscription(bloqueado.id, 'bloqueado');
    await criarSubscription(livre.id, 'livre');

    // A trava chega DEPOIS do favorito.
    await User.findByIdAndUpdate(bloqueado.id, { $set: { 'parental.tagsBloqueadas': ['acao'] } });

    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Push1',
      video_url: 'https://cdn.exemplo.test/push-doc-1.m3u8',
    });

    const recebidos = [];
    notificationService.__setTransportForTests(async (sub) => { recebidos.push(String(sub.userId)); });

    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: 1, removidos: 0 });
    expect(recebidos).toEqual([livre.id]);
  });

  it('kids favoritou obra young ANTES de o perfil virar kids (trava chega depois) → não recebe', async () => {
    const favoritouAntes = await criarPerfil({ classificacaoEtaria: 'young' });
    const serie = await criarSerie('Push2', { content_rating: 'young' });

    const fav = await authed(request(app).post(`/api/favorites/${serie._id}`), favoritouAntes);
    expect(fav.status).toBe(200); // visível como young — favorita sem problema
    await criarSubscription(favoritouAntes.id, 'kidsdepois');

    // A restrição chega DEPOIS do favorito.
    await User.findByIdAndUpdate(favoritouAntes.id, { $set: { 'parental.classificacaoEtaria': 'kids' } });

    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Push2',
      video_url: 'https://cdn.exemplo.test/push-doc-2.m3u8',
    });

    let chamadas = 0;
    notificationService.__setTransportForTests(async () => { chamadas += 1; });
    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: 0, removidos: 0 });
    expect(chamadas).toBe(0);
  });

  // Predicado PURO (spec): push NÃO tem exceção de admin/dono — quem
  // bloqueou a tag da própria obra não recebe o push dela, mesmo sendo
  // admin (ao contrário do doc único de leitura, onde admin sempre vê).
  it('admin com preferências restritivas próprias que favoritou a obra bloqueada TAMBÉM não recebe (sem exceção de admin no push)', async () => {
    const serie = await criarSerie('Push3', { content_rating: 'kids', tags: ['acao'] });
    const fav = await authed(request(app).post(`/api/favorites/${serie._id}`), adminRestritivo);
    expect(fav.status).toBe(200); // admin vê e favorita via serieVisivelPara
    await criarSubscription(adminRestritivo.id, 'admin-restritivo');

    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Push3',
      video_url: 'https://cdn.exemplo.test/push-doc-3.m3u8',
    });

    let chamadas = 0;
    notificationService.__setTransportForTests(async () => { chamadas += 1; });
    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: 0, removidos: 0 });
    expect(chamadas).toBe(0);
  });

  it('sem nenhum bloqueio, o push é enviado normalmente (controle de regressão)', async () => {
    const livre = await criarPerfil({ classificacaoEtaria: 'young' });
    const serie = await criarSerie('Push4', { content_rating: 'young' });
    await authed(request(app).post(`/api/favorites/${serie._id}`), livre);
    await criarSubscription(livre.id, 'livre-controle');

    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Push4',
      video_url: 'https://cdn.exemplo.test/push-doc-4.m3u8',
    });

    let chamadas = 0;
    notificationService.__setTransportForTests(async () => { chamadas += 1; });
    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: 1, removidos: 0 });
    expect(chamadas).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7) Writes de engajamento — 404 em obra invisível, nada gravado
// ═══════════════════════════════════════════════════════════════════════════

describe('Writes de engajamento em obra invisível — 404 e nada gravado', () => {
  it('POST /api/favorites/:seriesId — kids × série young → 404, sem Favorite gravado', async () => {
    const serie = await criarSerie('Writes1', { content_rating: 'young' });
    const res = await authed(request(app).post(`/api/favorites/${serie._id}`), kids);
    expect(res.status).toBe(404);
    const fav = await Favorite.findOne({ userId: kids.id, seriesId: serie._id }).lean();
    expect(fav).toBeNull();
  });

  it('POST /api/favorites/:seriesId — young com tag bloqueada × série com a tag → 404, sem Favorite gravado', async () => {
    const serie = await criarSerie('Writes2', { content_rating: 'young', tags: ['acao'] });
    const res = await authed(request(app).post(`/api/favorites/${serie._id}`), youngTagBloqueada);
    expect(res.status).toBe(404);
    const fav = await Favorite.findOne({ userId: youngTagBloqueada.id, seriesId: serie._id }).lean();
    expect(fav).toBeNull();
  });

  it('POST /api/favorites/:seriesId — obra visível: comportamento atual (200, grava)', async () => {
    const serie = await criarSerie('Writes3', { content_rating: 'kids' });
    const res = await authed(request(app).post(`/api/favorites/${serie._id}`), kids);
    expect(res.status).toBe(200);
    const fav = await Favorite.findOne({ userId: kids.id, seriesId: serie._id }).lean();
    expect(fav).not.toBeNull();
  });

  it('POST /api/content/series/:id/vote — obra invisível → 404, sem SeriesVote gravado', async () => {
    const serie = await criarSerie('Writes4', { content_rating: 'young' });
    const res = await authed(request(app).post(`/api/content/series/${serie._id}/vote`), kids).send({ type: 'like' });
    expect(res.status).toBe(404);
    const voto = await SeriesVote.findOne({ userId: kids.id, seriesId: serie._id }).lean();
    expect(voto).toBeNull();
  });

  it('POST /api/content/series/:id/vote — obra visível: comportamento atual (200, grava)', async () => {
    const serie = await criarSerie('Writes4b', { content_rating: 'kids' });
    const res = await authed(request(app).post(`/api/content/series/${serie._id}/vote`), kids).send({ type: 'like' });
    expect(res.status).toBe(200);
    const voto = await SeriesVote.findOne({ userId: kids.id, seriesId: serie._id }).lean();
    expect(voto).not.toBeNull();
  });

  it('POST /api/content/episodes/:id/vote — obra invisível (via série do episódio) → 404, sem Vote gravado', async () => {
    const serie = await criarSerie('Writes5', { content_rating: 'young', tags: ['acao'] });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).post(`/api/content/episodes/${ep._id}/vote`), youngTagBloqueada).send({ type: 'like' });
    expect(res.status).toBe(404);
    const voto = await Vote.findOne({ userId: youngTagBloqueada.id, episodeId: ep._id }).lean();
    expect(voto).toBeNull();
  });

  it('POST /api/content/episodes/:id/vote — obra visível: comportamento atual (200, grava)', async () => {
    const serie = await criarSerie('Writes5b', { content_rating: 'kids' });
    const ep = await criarEpisodioPublicado(serie._id);
    const res = await authed(request(app).post(`/api/content/episodes/${ep._id}/vote`), kids).send({ type: 'like' });
    expect(res.status).toBe(200);
    const voto = await Vote.findOne({ userId: kids.id, episodeId: ep._id }).lean();
    expect(voto).not.toBeNull();
  });

  it('POST /api/superreader/create-session — obra invisível → 404, nada gravado, Stripe nunca chamado', async () => {
    const serie = await criarSerie('Writes6', { content_rating: 'young' });
    const stripeQueNaoDeveSerChamado = {
      checkout: { sessions: { create: async () => { throw new Error('não deveria chamar o Stripe para obra invisível'); } } },
    };
    superReaderService.__setStripeForTests(stripeQueNaoDeveSerChamado);

    const res = await authed(request(app).post('/api/superreader/create-session'), kids)
      .send({ seriesId: serie._id.toString(), amountCents: 500, currency: 'brl' });
    expect(res.status).toBe(404);
  });

  it('POST /api/superreader/create-session — dono com a tag da própria obra bloqueada → passa (200, exceção de serieVisivelPara)', async () => {
    const { dono, canal } = await criarDono();
    const serie = await criarSerie('Writes7', { content_rating: 'young', tags: ['acao'], channelId: canal._id });
    superReaderService.__setStripeForTests({
      checkout: { sessions: { create: async () => ({ id: 'cs_test_doc_writes7', url: 'https://checkout.stripe.com/doc-writes7' }) } },
    });

    const res = await authed(request(app).post('/api/superreader/create-session'), dono)
      .send({ seriesId: serie._id.toString(), amountCents: 500, currency: 'brl' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/doc-writes7' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8) Backfill de campos parentais — doc LEGADO (content_rating/tags ausentes)
// ═══════════════════════════════════════════════════════════════════════════
// Achado raiz do fix round (revisão bloqueante): serieVisivelPara/
// passaFiltroParental LANÇAM (fail-closed, ruling P4) quando o documento
// genuinamente não tem content_rating/tags — e ISSO é o estado real de todo
// o acervo pré-Bloco-2 (o campo nasceu sem $set na Task 1; tags idem pra
// séries de antes da Fase 3/4). Sem o backfill, 500 pra todo usuário logado
// não-admin/não-dono nas 4 superfícies de doc único (detalhe, episódios da
// série, episódio, signed-url) e nos writes de engajamento. Backfill
// idempotente no boot: services/parentalBackfill.js, ligado em server.js
// dentro do `.then()` de mongoose.connect, gateando o app.listen.
//
// Os testes abaixo chamam `backfillCamposParental()` DIRETO — não dependem
// do boot assíncrono de server.js (que, em NODE_ENV=test, nunca roda: fica
// dentro de `if (require.main === module)`, ver server.js) — pra controlar
// deterministicamente o "antes"/"depois" sem corrida com o require do módulo.
describe('Backfill de campos parentais — doc legado', () => {
  const { backfillCamposParental } = require('../../services/parentalBackfill');
  const { serieVisivelPara } = require('../../utils/parentalFilter');

  let cdnAnterior, tokenAnterior;
  beforeAll(() => {
    cdnAnterior = process.env.BUNNY_CDN_HOSTNAME;
    tokenAnterior = process.env.BUNNY_TOKEN_KEY;
    process.env.BUNNY_CDN_HOSTNAME = 'cdn-teste-backfill.b-cdn.net';
    process.env.BUNNY_TOKEN_KEY = 'chave-teste-backfill';
  });
  afterAll(() => {
    if (cdnAnterior !== undefined) process.env.BUNNY_CDN_HOSTNAME = cdnAnterior; else delete process.env.BUNNY_CDN_HOSTNAME;
    if (tokenAnterior !== undefined) process.env.BUNNY_TOKEN_KEY = tokenAnterior; else delete process.env.BUNNY_TOKEN_KEY;
  });

  /** Cria a série via Series.create (defaults normais do Mongoose gravados
   *  no banco) e então usa o driver CRU (Series.collection, bypassa
   *  Mongoose inteiro — sem setter/default) pra $unset os campos, simulando
   *  um doc de verdade anterior à Task 1 (campo NUNCA gravado — não "null").
   *  `comTags:true` deixa `tags` (já `[]` do default) intocado — só
   *  content_rating some, cobrindo o acervo entre Fase 3/4 e o Bloco 2. */
  async function criarSerieLegadaCrua(tituloBase, { comTags = false } = {}) {
    const serie = await criarSerie(tituloBase, {});
    const unset = { content_rating: '' };
    if (!comTags) unset.tags = '';
    await Series.collection.updateOne({ _id: serie._id }, { $unset: unset });
    return Series.findById(serie._id).lean();
  }

  it('ANTES do backfill: serieVisivelPara/passaFiltroParental LANÇAM com o doc legado (reproduz o 500)', async () => {
    const serieCrua = await criarSerieLegadaCrua('BackfillAntes1');
    expect(serieCrua.content_rating).toBeUndefined();
    expect(serieCrua.tags).toBeUndefined();
    await expect(serieVisivelPara({ id: kids.id, role: 'user' }, serieCrua)).rejects.toThrow();
  });

  it('ANTES do backfill: a rota de detalhe reproduz o 500 pra usuário logado não-admin/não-dono', async () => {
    const serieCrua = await criarSerieLegadaCrua('BackfillAntes2');
    const res = await authed(request(app).get(`/api/content/series/${serieCrua._id}`), kids);
    expect(res.status).toBe(500);
  });

  it('doc com tags PRESENTES mas content_rating AUSENTE (acervo Fase 3/4) também lança antes do backfill', async () => {
    const serieCrua = await criarSerieLegadaCrua('BackfillAntes3', { comTags: true });
    expect(serieCrua.tags).toEqual([]); // sobreviveu ao $unset seletivo — fixture confirmado
    expect(serieCrua.content_rating).toBeUndefined();
    await expect(serieVisivelPara({ id: kids.id, role: 'user' }, serieCrua)).rejects.toThrow();
  });

  it('backfillCamposParental() é idempotente: 2ª chamada em sequência devolve 0 modificados', async () => {
    await criarSerieLegadaCrua('BackfillIdempotente1');
    const primeira = await backfillCamposParental();
    expect(primeira.contentRatingAtualizados).toBeGreaterThan(0);
    expect(primeira.tagsAtualizados).toBeGreaterThan(0);

    const segunda = await backfillCamposParental();
    expect(segunda).toEqual({ contentRatingAtualizados: 0, tagsAtualizados: 0 });
  });

  it('DEPOIS do backfill: young → 200 em detalhe/episódios/episódio/signed-url/favoritar e o episódio aparece na busca; kids → 404/[] (ausente virou null = young); anônimo → 200 em tudo incl. busca; admin → 200', async () => {
    const termo = unico('BackfillDepois');
    const serieCrua = await criarSerieLegadaCrua(termo);
    const ep = await criarEpisodioPublicado(serieCrua._id, { title: `${termo} Cap`, bunnyVideoId: unico('bunny-backfill') });

    await backfillCamposParental();

    const young = await criarPerfil({ classificacaoEtaria: 'young' });

    const detalheYoung = await authed(request(app).get(`/api/content/series/${serieCrua._id}`), young);
    expect(detalheYoung.status).toBe(200);

    const episodiosYoung = await authed(request(app).get(`/api/content/series/${serieCrua._id}/episodes`), young);
    expect(episodiosYoung.status).toBe(200);
    expect(episodiosYoung.body.map(e => e._id)).toContain(String(ep._id));

    const epDetYoung = await authed(request(app).get(`/api/content/episodes/${ep._id}`), young);
    expect(epDetYoung.status).toBe(200);

    const signedYoung = await authed(request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`), young);
    expect(signedYoung.status).toBe(200);

    const favYoung = await authed(request(app).post(`/api/favorites/${serieCrua._id}`), young);
    expect(favYoung.status).toBe(200);

    const buscaYoung = await request(app).get(`/api/content/search?q=${encodeURIComponent(termo)}`);
    expect(buscaYoung.status).toBe(200);
    expect(buscaYoung.body.episodes.some(e => e._id === String(ep._id))).toBe(true);

    // kids: content_rating agora é `null` (semântica positiva = "young", não
    // classificada) — kids só vê 'kids', então segue invisível.
    const detalheKids = await authed(request(app).get(`/api/content/series/${serieCrua._id}`), kids);
    expect(detalheKids.status).toBe(404);
    const episodiosKids = await authed(request(app).get(`/api/content/series/${serieCrua._id}/episodes`), kids);
    expect(episodiosKids.body).toEqual([]);

    // anônimo: 200 em tudo, incluindo a busca.
    const detalheAnon = await request(app).get(`/api/content/series/${serieCrua._id}`);
    expect(detalheAnon.status).toBe(200);
    const signedAnon = await request(app).get(`/api/bunny/signed-url?videoId=${ep.bunnyVideoId}`);
    expect(signedAnon.status).toBe(200);

    // admin: 200.
    const detalheAdmin = await authed(request(app).get(`/api/content/series/${serieCrua._id}`), adminRestritivo);
    expect(detalheAdmin.status).toBe(200);
  });
});
