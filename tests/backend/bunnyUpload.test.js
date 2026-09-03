/**
 * Testes: Fase 5 Bloco 1, Task 5 — Uploads com guarda de dono.
 * Cobre:
 *  - upload-image / upload-image-batch: admin mantém o contrato ANTIGO
 *    (seriesSlug texto-livre) byte a byte (regressão); dono de canal ganha
 *    acesso via seriesId REAL — o servidor resolve série→canal→ownerId e
 *    deriva o slug do storage do TÍTULO da série resolvida (nunca do body,
 *    mesmo se o body mandar um seriesSlug malicioso); ownership cruzado
 *    (A→série de B) e usuário sem canal nenhum → dois 4xx diferentes (404 x
 *    403); sem seriesId → 400; sem token → 401 (já coberto em
 *    admin.test.js, não duplicado aqui).
 *  - upload / upload-video / upload-audio: seguem admin-only EXPLÍCITO —
 *    dono de canal → 403; admin continua funcionando (mock de rede).
 *  - Webhook do Bunny (routes/bunnyWebhook.js "/webhook") já tem cobertura
 *    própria em notifications.test.js/security.test.js — INTOCADO aqui.
 *
 * Mock de rede: NENHUM teste bate no Bunny real. As rotas usam fetch cru
 * (global) e, em upload-video, também axios.put — substituídos via
 * vi.stubGlobal/vi.spyOn e restaurados a cada teste.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let Channel, Series, Episode, User;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  User = require('../../models/User');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

// ─── Storage configurado (mesmo padrão de tests/backend/signedUrl.test.js:
// o ambiente de teste não tem essas variáveis por padrão — salva/restaura) ──
let zonaAnterior, chaveAnterior, hostAnterior;
beforeAll(() => {
  zonaAnterior = process.env.BUNNY_STORAGE_ZONE;
  chaveAnterior = process.env.BUNNY_STORAGE_KEY;
  hostAnterior = process.env.BUNNY_STORAGE_HOSTNAME;
  process.env.BUNNY_STORAGE_ZONE = 'zona-teste-upload';
  process.env.BUNNY_STORAGE_KEY = 'chave-teste-upload';
  process.env.BUNNY_STORAGE_HOSTNAME = 'cdn-teste-upload.b-cdn.net';
});
afterAll(() => {
  if (zonaAnterior !== undefined) process.env.BUNNY_STORAGE_ZONE = zonaAnterior; else delete process.env.BUNNY_STORAGE_ZONE;
  if (chaveAnterior !== undefined) process.env.BUNNY_STORAGE_KEY = chaveAnterior; else delete process.env.BUNNY_STORAGE_KEY;
  if (hostAnterior !== undefined) process.env.BUNNY_STORAGE_HOSTNAME = hostAnterior; else delete process.env.BUNNY_STORAGE_HOSTNAME;
});

// ─── Mock de rede: substitui fetch/axios.put globalmente, restaura sempre ──
let originalFetch;
beforeAll(() => { originalFetch = global.fetch; });
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchStorageOk() {
  const fn = vi.fn(async () => ({ ok: true, text: async () => '', json: async () => ({}) }));
  global.fetch = fn;
  return fn;
}

function mockFetchBunnyApiOk(guid) {
  const fn = vi.fn(async () => ({ ok: true, text: async () => '', json: async () => ({ guid }) }));
  global.fetch = fn;
  return fn;
}

// ─── Helpers de usuário/canal/série ─────────────────────────────────────────
let contador = 0;
async function criarDono(nome) {
  contador += 1;
  const email = `bunny-upload-${contador}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  const user = await User.create({ email, passwordHash, nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  const token = login.body.accessToken;
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Upload ${nome} ${Date.now()}` });
  return { id: user._id.toString(), token, canal };
}

async function criarUsuarioSemCanal() {
  contador += 1;
  const email = `bunny-upload-semcanal-${contador}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  await User.create({ email, passwordHash, nome: 'Sem Canal Upload', role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return login.body.accessToken;
}

function criarSerie(canalId, title) {
  return Series.create({ title, content_type: 'hiqua', channelId: canalId, isPublished: false });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/bunny/upload-image
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/bunny/upload-image', () => {
  it('admin: contrato antigo (seriesSlug texto livre) continua igual — 200, path usa o slug do body', async () => {
    const fetchMock = mockFetchStorageOk();

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .field('seriesSlug', 'Serie Legada Admin')
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('/lorflux/series/serie-legada-admin/covers/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/lorflux/series/serie-legada-admin/covers/');
  });

  it('admin: sem seriesSlug no body → path sem pasta de série (regressão do contrato antigo)', async () => {
    mockFetchStorageOk();
    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\/lorflux\/\d+-[a-z0-9]+\.jpg$/);
  });

  it('dono do canal com seriesId próprio → 200, slug derivado do TÍTULO da série (ignora seriesSlug malicioso do body)', async () => {
    const dono = await criarDono('Cover1');
    const serie = await criarSerie(dono.canal._id, 'Aventuras Incríveis do Sol');
    mockFetchStorageOk();

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${dono.token}`)
      .field('seriesId', String(serie._id))
      .field('seriesSlug', 'slug-malicioso-do-body')
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('/lorflux/series/aventuras-incriveis-do-sol/covers/');
    expect(res.body.url).not.toContain('slug-malicioso-do-body');
  });

  it('dono com seriesId de série de OUTRO canal → 404 (não confirma existência)', async () => {
    const donoA = await criarDono('CoverA');
    const donoB = await criarDono('CoverB');
    const serieDeB = await criarSerie(donoB.canal._id, 'Serie Do Dono B Cover');

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${donoA.token}`)
      .field('seriesId', String(serieDeB._id))
      .attach('image', Buffer.from('x'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it('dono com seriesId inexistente → 404', async () => {
    const dono = await criarDono('CoverInexistente');
    const idFalso = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${dono.token}`)
      .field('seriesId', String(idFalso))
      .attach('image', Buffer.from('x'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it('dono com seriesId malformado (não é ObjectId) → 404', async () => {
    const dono = await criarDono('CoverMalformado');

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${dono.token}`)
      .field('seriesId', 'nao-e-um-objectid')
      .attach('image', Buffer.from('x'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it('dono sem seriesId no body → 400', async () => {
    const dono = await criarDono('CoverSemSeriesId');

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${dono.token}`)
      .attach('image', Buffer.from('x'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('usuário comum sem canal nenhum → 403', async () => {
    const token = await criarUsuarioSemCanal();

    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('x'), { filename: 'capa.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/bunny/upload-image-batch
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/bunny/upload-image-batch', () => {
  it('admin: contrato antigo (seriesSlug texto livre) continua igual — 200, paths usam o slug do body', async () => {
    mockFetchStorageOk();

    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .field('seriesSlug', 'Serie Batch Admin')
      .attach('images', Buffer.from('img1'), { filename: 'p1.jpg', contentType: 'image/jpeg' })
      .attach('images', Buffer.from('img2'), { filename: 'p2.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.successCount).toBe(2);
    for (const r of res.body.results) {
      expect(r.url).toContain('/lorflux/series/serie-batch-admin/panels/');
    }
  });

  it('dono do canal com seriesId próprio → 200, slug derivado do TÍTULO da série (ignora seriesSlug do body)', async () => {
    const dono = await criarDono('Batch1');
    const serie = await criarSerie(dono.canal._id, 'Painéis Do Herói Mágico');
    mockFetchStorageOk();

    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${dono.token}`)
      .field('seriesId', String(serie._id))
      .field('seriesSlug', 'slug-malicioso-batch')
      .attach('images', Buffer.from('img1'), { filename: 'p1.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.successCount).toBe(1);
    expect(res.body.results[0].url).toContain('/lorflux/series/paineis-do-heroi-magico/panels/');
    expect(res.body.results[0].url).not.toContain('slug-malicioso-batch');
  });

  it('dono com seriesId de série de OUTRO canal → 404', async () => {
    const donoA = await criarDono('BatchA');
    const donoB = await criarDono('BatchB');
    const serieDeB = await criarSerie(donoB.canal._id, 'Serie Do Dono B Batch');

    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${donoA.token}`)
      .field('seriesId', String(serieDeB._id))
      .attach('images', Buffer.from('img1'), { filename: 'p1.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it('dono sem seriesId no body → 400', async () => {
    const dono = await criarDono('BatchSemSeriesId');

    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${dono.token}`)
      .attach('images', Buffer.from('img1'), { filename: 'p1.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('usuário comum sem canal nenhum → 403', async () => {
    const token = await criarUsuarioSemCanal();

    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${token}`)
      .attach('images', Buffer.from('img1'), { filename: 'p1.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// upload / upload-video / upload-audio — seguem admin-only EXPLÍCITO
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/bunny/upload (init de vídeo) — admin-only', () => {
  it('dono de canal (não-admin) → 403', async () => {
    const dono = await criarDono('InitVideo');
    const res = await request(app)
      .post('/api/bunny/upload')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'x', episodeId: String(new mongoose.Types.ObjectId()) });
    expect(res.status).toBe(403);
  });

  it('admin: cria vídeo no Bunny e retorna os dados de upload TUS (mock)', async () => {
    const serie = await Series.create({ title: 'Serie Upload Init', content_type: 'hiqua', isPublished: false });
    const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Ep Upload Init' });
    mockFetchBunnyApiOk('guid-teste-init');

    const apiKeyAnterior = process.env.BUNNY_API_KEY;
    const libAnterior = process.env.BUNNY_LIBRARY_ID;
    process.env.BUNNY_API_KEY = 'chave-teste-init';
    process.env.BUNNY_LIBRARY_ID = 'lib-teste-init';

    const res = await request(app)
      .post('/api/bunny/upload')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Ep Upload Init', episodeId: String(episodio._id) });

    if (apiKeyAnterior !== undefined) process.env.BUNNY_API_KEY = apiKeyAnterior; else delete process.env.BUNNY_API_KEY;
    if (libAnterior !== undefined) process.env.BUNNY_LIBRARY_ID = libAnterior; else delete process.env.BUNNY_LIBRARY_ID;

    expect(res.status).toBe(200);
    expect(res.body.bunnyVideoId).toBe('guid-teste-init');
    const atualizado = await Episode.findById(episodio._id).lean();
    expect(atualizado.bunnyVideoId).toBe('guid-teste-init');
  });
});

describe('POST /api/bunny/upload-audio — admin-only', () => {
  it('dono de canal (não-admin) → 403', async () => {
    const dono = await criarDono('UploadAudio');
    const res = await request(app)
      .post('/api/bunny/upload-audio')
      .set('Authorization', `Bearer ${dono.token}`)
      .attach('audio', Buffer.from('fake-audio-bytes'), { filename: 'trilha.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(403);
  });

  it('admin: envia áudio e retorna a URL (mock do storage)', async () => {
    mockFetchStorageOk();
    const res = await request(app)
      .post('/api/bunny/upload-audio')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .attach('audio', Buffer.from('fake-audio-bytes'), { filename: 'trilha.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('/lorflux/audio/');
  });
});

describe('POST /api/bunny/upload-video — admin-only', () => {
  it('dono de canal (não-admin) → 403', async () => {
    const dono = await criarDono('UploadVideo');
    const res = await request(app)
      .post('/api/bunny/upload-video')
      .set('Authorization', `Bearer ${dono.token}`)
      .field('episodeId', String(new mongoose.Types.ObjectId()))
      .field('title', 'x')
      .attach('video', Buffer.from('fake-video-bytes'), { filename: 'ep.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(403);
  });

  it('admin: envia vídeo (mock fetch + axios.put) e atualiza o episódio', async () => {
    const serie = await Series.create({ title: 'Serie Upload Video', content_type: 'hiqua', isPublished: false });
    const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Ep Upload Video' });

    const apiKeyAnterior = process.env.BUNNY_API_KEY;
    const libAnterior = process.env.BUNNY_LIBRARY_ID;
    process.env.BUNNY_API_KEY = 'chave-teste-video';
    process.env.BUNNY_LIBRARY_ID = 'lib-teste-video';

    mockFetchBunnyApiOk('guid-teste-video');
    const axios = require('axios');
    vi.spyOn(axios, 'put').mockResolvedValue({ status: 200 });

    const res = await request(app)
      .post('/api/bunny/upload-video')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .field('episodeId', String(episodio._id))
      .field('title', 'Ep Upload Video')
      .attach('video', Buffer.from('fake-video-bytes'), { filename: 'ep.mp4', contentType: 'video/mp4' });

    if (apiKeyAnterior !== undefined) process.env.BUNNY_API_KEY = apiKeyAnterior; else delete process.env.BUNNY_API_KEY;
    if (libAnterior !== undefined) process.env.BUNNY_LIBRARY_ID = libAnterior; else delete process.env.BUNNY_LIBRARY_ID;

    expect(res.status).toBe(200);
    expect(res.body.bunnyVideoId).toBe('guid-teste-video');
    const atualizado = await Episode.findById(episodio._id).lean();
    expect(atualizado.bunnyVideoId).toBe('guid-teste-video');
  });
});
