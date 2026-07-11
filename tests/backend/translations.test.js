/**
 * Testes: Tradução automática de conteúdo (services/translationService)
 * Contrato: create/update de série/episódio preenche `translations` (en/es/zh)
 * via tradutor injetável; sem GEMINI_API_KEY e sem seam → no-op silencioso.
 * Título NUNCA é traduzido.
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let translationService;

// Tradutor fake: prefixa o idioma para asserção determinística
const fakeTranslator = async (text, targetLang) => `${targetLang.toUpperCase()}:${text}`;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  translationService = require('../../services/translationService');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

afterEach(() => {
  translationService.__setTranslatorForTests(null);
  delete process.env.GEMINI_API_KEY;
});

const validSeries = {
  title: 'Obra Teste',
  genre: 'Aventura',
  description: 'Uma história de teste.',
  content_type: 'hiqua',
};

describe('Tradução de séries', () => {
  it('POST /series preenche translations en/es/zh quando o tradutor está disponível', async () => {
    translationService.__setTranslatorForTests(fakeTranslator);

    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send(validSeries);

    expect(res.status).toBe(201);
    const Series = require('../../models/Series');
    const doc = await Series.findById(res.body._id).lean();

    expect(doc.translations.en.genre).toBe('EN:Aventura');
    expect(doc.translations.en.description).toBe('EN:Uma história de teste.');
    expect(doc.translations.es.genre).toBe('ES:Aventura');
    expect(doc.translations.zh.description).toBe('ZH:Uma história de teste.');
    // Título permanece intacto e sem tradução
    expect(doc.title).toBe('Obra Teste');
    expect(doc.translations.en.title).toBeUndefined();
  });

  it('POST /series sem tradutor e sem GEMINI_API_KEY salva normalmente (no-op)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send(validSeries);

    expect(res.status).toBe(201);
    const Series = require('../../models/Series');
    const doc = await Series.findById(res.body._id).lean();
    expect(doc.translations?.en?.description).toBeFalsy();
  });

  it('tradutor que falha não impede o save', async () => {
    translationService.__setTranslatorForTests(async () => { throw new Error('quota'); });

    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send(validSeries);

    expect(res.status).toBe(201);
  });

  it('PUT /series/:id com nova descrição atualiza as traduções', async () => {
    translationService.__setTranslatorForTests(fakeTranslator);

    const created = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send(validSeries);

    const res = await request(app)
      .put(`/api/content/series/${created.body._id}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ description: 'Descrição nova.' });

    expect(res.status).toBe(200);
    const Series = require('../../models/Series');
    const doc = await Series.findById(created.body._id).lean();
    expect(doc.translations.en.description).toBe('EN:Descrição nova.');
  });

  it('GET /series devolve o campo translations para o frontend', async () => {
    translationService.__setTranslatorForTests(fakeTranslator);

    await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ ...validSeries, isPublished: true });

    const res = await request(app).get('/api/content/series?type=hiqua');
    expect(res.status).toBe(200);
    const serie = res.body.find(s => s.title === 'Obra Teste');
    expect(serie.translations.en.genre).toBe('EN:Aventura');
  });
});

describe('Tradução de episódios', () => {
  let seriesId;

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ ...validSeries, title: 'Serie dos Episodios' });
    seriesId = created.body._id;
  });

  it('POST /episodes traduz a descrição (título do episódio intacto)', async () => {
    translationService.__setTranslatorForTests(fakeTranslator);

    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId, episode_number: 1, title: 'Cap 1', description: 'Primeiro capítulo.' });

    expect(res.status).toBe(201);
    const Episode = require('../../models/Episode');
    const doc = await Episode.findById(res.body._id).lean();
    expect(doc.translations.en.description).toBe('EN:Primeiro capítulo.');
    expect(doc.translations.es.description).toBe('ES:Primeiro capítulo.');
    expect(doc.title).toBe('Cap 1');
  });

  it('episódio sem descrição não chama o tradutor', async () => {
    let called = 0;
    translationService.__setTranslatorForTests(async (t, l) => { called++; return t; });

    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId, episode_number: 2, title: 'Cap 2' });

    expect(res.status).toBe(201);
    expect(called).toBe(0);
  });
});
