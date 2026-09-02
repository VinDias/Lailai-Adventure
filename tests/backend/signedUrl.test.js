/**
 * Testes: GET /api/bunny/signed-url — drafts invisíveis (Fase 5 Bloco 1,
 * Task 2 da spec "Drafts invisíveis ao público"): a rota recusa vídeo de
 * episódio não publicado (ou de série não publicada) pra quem não é
 * admin/dono do canal — mesmo critério das rotas de routes/content.js
 * (utils/ownership.js).
 */
const request = require('supertest');
const db = require('../helpers/db');
const { createUsers, getToken, getId } = require('../helpers/auth');

let app;
let Series, Episode, Channel;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  Channel = require('../../models/Channel');
  await createUsers(app);
});

afterAll(() => db.closeDatabase());

// A rota é fail-closed sem BUNNY_TOKEN_KEY/BUNNY_CDN_HOSTNAME (503) — o
// ambiente de teste não tem essas variáveis por padrão (mesmo padrão de
// salvar/restaurar de tests/backend/notifications.test.js).
let cdnAnterior, tokenAnterior;
beforeAll(() => {
  cdnAnterior = process.env.BUNNY_CDN_HOSTNAME;
  tokenAnterior = process.env.BUNNY_TOKEN_KEY;
  process.env.BUNNY_CDN_HOSTNAME = 'cdn-teste-signed.b-cdn.net';
  process.env.BUNNY_TOKEN_KEY = 'chave-teste-signed-url';
});
afterAll(() => {
  if (cdnAnterior !== undefined) process.env.BUNNY_CDN_HOSTNAME = cdnAnterior; else delete process.env.BUNNY_CDN_HOSTNAME;
  if (tokenAnterior !== undefined) process.env.BUNNY_TOKEN_KEY = tokenAnterior; else delete process.env.BUNNY_TOKEN_KEY;
});

function criarCanalDoDono() {
  return Channel.create({ ownerId: getId('user'), name: `Canal SignedUrl ${Date.now()}-${Math.random()}` });
}

describe('GET /api/bunny/signed-url', () => {
  it('vídeo desconhecido (bunnyVideoId sem episódio) → 404', async () => {
    const res = await request(app).get('/api/bunny/signed-url?videoId=nao-existe-signed-url');
    expect(res.status).toBe(404);
  });

  it('episódio publicado em série publicada: assina para anônimo', async () => {
    const serie = await Series.create({ title: 'Serie SignedUrl Publicada', genre: 'Teste', content_type: 'vcine', isPublished: true });
    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Ep Publicado SignedUrl', status: 'published', bunnyVideoId: 'bunny-signed-pub-1',
    });

    const res = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    expect(res.status).toBe(200);
    expect(res.body.signedUrl).toContain('cdn-teste-signed.b-cdn.net');
  });

  it('episódio draft → 404 para anônimo e para logado não-dono', async () => {
    const canal = await criarCanalDoDono();
    const serie = await Series.create({ title: 'Serie SignedUrl Draft', genre: 'Teste', content_type: 'vcine', isPublished: true, channelId: canal._id });
    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Ep Draft SignedUrl', status: 'draft', bunnyVideoId: 'bunny-signed-draft-1',
    });

    const anon = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    expect(anon.status).toBe(404);

    const naoDono = await request(app)
      .get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(naoDono.status).toBe(404);
  });

  it('episódio draft → 200 para admin', async () => {
    const serie = await Series.create({ title: 'Serie SignedUrl Draft Admin', genre: 'Teste', content_type: 'vcine', isPublished: true });
    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Ep Draft Admin SignedUrl', status: 'draft', bunnyVideoId: 'bunny-signed-draft-admin',
    });

    const res = await request(app)
      .get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
  });

  it('episódio draft → 200 para o dono do canal da série', async () => {
    const canal = await criarCanalDoDono();
    const serie = await Series.create({ title: 'Serie SignedUrl Draft Dono', genre: 'Teste', content_type: 'vcine', isPublished: true, channelId: canal._id });
    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Ep Draft Dono SignedUrl', status: 'draft', bunnyVideoId: 'bunny-signed-draft-dono',
    });

    const res = await request(app)
      .get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
  });

  it('episódio publicado mas série despublicada → 404 pro público', async () => {
    const serie = await Series.create({ title: 'Serie SignedUrl Despublicada', content_type: 'vcine', isPublished: false });
    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Ep Publicado Serie Despublicada', status: 'published', bunnyVideoId: 'bunny-signed-serie-draft',
    });

    const res = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    expect(res.status).toBe(404);
  });
});
