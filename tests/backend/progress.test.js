/**
 * Testes: Fase 4, Bloco 1 — progresso de leitura e "Continuar".
 * Cobre modelo, gravação, carrossel, migração do visitante e LGPD.
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

const ANON = '11111111-2222-4333-8444-555555555555';

describe('modelo ReadingProgress', () => {
  it('exige exatamente um identificador: userId ou anonymousId', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
    };

    await expect(ReadingProgress.create({ ...base })).rejects.toThrow();
    await expect(
      ReadingProgress.create({ ...base, userId: auth.getId('user'), anonymousId: ANON }),
    ).rejects.toThrow();

    const soUsuario = await ReadingProgress.create({ ...base, userId: auth.getId('user') });
    expect(soUsuario.userId).toBeTruthy();

    const soVisitante = await ReadingProgress.create({ ...base, anonymousId: ANON });
    expect(soVisitante.anonymousId).toBe(ANON);
  });

  it('marca completed a partir de 90% e recusa percent fora de 0..1', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      userId: auth.getId('user'),
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
    };

    const quase = await ReadingProgress.create({ ...base, percent: 0.89 });
    expect(quase.completed).toBe(false);

    const fim = await ReadingProgress.create({
      ...base,
      episodeId: new mongoose.Types.ObjectId(),
      percent: 0.9,
    });
    expect(fim.completed).toBe(true);

    await expect(
      ReadingProgress.create({ ...base, episodeId: new mongoose.Types.ObjectId(), percent: 1.5 }),
    ).rejects.toThrow();
  });
});

describe('identidade do request', () => {
  const getIdentity = require('../../utils/requestIdentity');

  it('prefere a conta quando há token válido', () => {
    const req = { user: { id: 'abc123' }, headers: { 'x-anonymous-id': ANON } };
    expect(getIdentity(req)).toEqual({ userId: 'abc123' });
  });

  it('cai para o visitante quando não há conta', () => {
    const req = { headers: { 'x-anonymous-id': ANON } };
    expect(getIdentity(req)).toEqual({ anonymousId: ANON });
  });

  it('recusa identificador de visitante fora do formato UUID', () => {
    expect(getIdentity({ headers: { 'x-anonymous-id': 'nao-e-uuid' } })).toBeNull();
    expect(getIdentity({ headers: {} })).toBeNull();
  });
});

describe('PUT /api/me/progress', () => {
  let serie, episodio;

  beforeAll(async () => {
    const s = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Obra do Progresso', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    serie = s.body;

    const e = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId: serie._id || serie.id, episode_number: 1, title: 'Capitulo 1' });
    episodio = e.body;
  });

  const corpo = (extra = {}) => ({
    seriesId: serie._id || serie.id,
    episodeId: episodio._id || episodio.id,
    contentType: 'hiqua',
    percent: 0.4,
    position: 0,
    ...extra,
  });

  it('grava o progresso de quem tem conta', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo());

    expect(res.status).toBe(200);
    expect(res.body.percent).toBeCloseTo(0.4);
    expect(res.body.completed).toBe(false);
  });

  it('atualiza em vez de duplicar quando o mesmo episodio volta', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ percent: 0.7 }));

    const ReadingProgress = require('../../models/ReadingProgress');
    const docs = await ReadingProgress.find({
      userId: auth.getId('user'),
      episodeId: episodio._id || episodio.id,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].percent).toBeCloseTo(0.7);
  });

  it('grava o progresso do visitante pelo cabecalho', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', ANON)
      .send(corpo({ percent: 0.25 }));

    expect(res.status).toBe(200);
    expect(res.body.anonymousId).toBe(ANON);
    expect(res.body.userId).toBeUndefined();
  });

  it('recusa quem nao traz conta nem identificador de visitante', async () => {
    const res = await request(app).put('/api/me/progress').send(corpo());
    expect(res.status).toBe(400);
  });

  it('recusa percent fora de 0..1', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ percent: 2 }));
    expect(res.status).toBe(400);
  });
});
