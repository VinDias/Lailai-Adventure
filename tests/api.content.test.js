/**
 * Testes de integração — rotas de conteúdo
 * Requer: MongoDB local ou MONGO_URI de teste no .env
 */
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.lorflux.com';
const ADMIN_PASS  = process.env.TEST_ADMIN_PASS  || 'AdminTest@123';

let adminToken;
let createdSeriesId;
let createdEpisodeId;

beforeAll(async () => {
  // Login como admin para obter token
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });

  if (res.status === 200) {
    adminToken = res.body.accessToken;
  }
});

afterAll(async () => {
  // Limpar dados de teste
  if (createdEpisodeId) {
    await request(app)
      .delete(`/api/content/episodes/${createdEpisodeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
  if (createdSeriesId) {
    await request(app)
      .delete(`/api/content/series/${createdSeriesId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
  await mongoose.connection.close();
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('retorna 400 sem credenciais', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('retorna 401 com senha errada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('retorna accessToken e refreshToken com credenciais corretas', async () => {
    if (!adminToken) return; // pula se admin não existe no banco de teste
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });
});

describe('POST /api/auth/refresh-token', () => {
  it('retorna 401 sem refreshToken', async () => {
    const res = await request(app).post('/api/auth/refresh-token').send({});
    expect(res.status).toBe(401);
  });
});

// ─── SERIES ───────────────────────────────────────────────────────────────────

describe('GET /api/content/series', () => {
  it('retorna array de séries publicadas sem autenticação', async () => {
    const res = await request(app).get('/api/content/series');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filtra por tipo de conteúdo', async () => {
    const res = await request(app).get('/api/content/series?type=hiqua');
    expect(res.status).toBe(200);
    res.body.forEach(s => expect(s.content_type).toBe('hiqua'));
  });
});

describe('POST /api/content/series (admin)', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .send({ title: 'Teste', genre: 'Ação', content_type: 'hqcine' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    if (!adminToken) return;
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Sem genre' });
    expect(res.status).toBe(400);
  });

  it('cria série com dados válidos', async () => {
    if (!adminToken) return;
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Série Teste CI', genre: 'Ação', content_type: 'hqcine', isPublished: true });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body.title).toBe('Série Teste CI');
    createdSeriesId = res.body._id;
  });
});

// ─── EPISODES ─────────────────────────────────────────────────────────────────

describe('GET /api/content/series/:id/episodes', () => {
  it('retorna array vazio para série inexistente', async () => {
    const fakeId = '000000000000000000000000';
    const res = await request(app).get(`/api/content/series/${fakeId}/episodes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna episódios da série criada', async () => {
    if (!createdSeriesId) return;
    const res = await request(app).get(`/api/content/series/${createdSeriesId}/episodes`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/content/episodes (admin)', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .send({ seriesId: '123', episode_number: 1, title: 'EP1' });
    expect(res.status).toBe(401);
  });

  it('cria episódio e ele aparece na listagem', async () => {
    if (!adminToken || !createdSeriesId) return;

    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seriesId: createdSeriesId, episode_number: 1, title: 'Ep 1 Teste CI' });
    expect(create.status).toBe(201);
    createdEpisodeId = create.body._id;

    // Verifica que aparece na listagem pública
    const list = await request(app).get(`/api/content/series/${createdSeriesId}/episodes`);
    expect(list.status).toBe(200);
    const found = list.body.find(e => e._id === createdEpisodeId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Ep 1 Teste CI');
  });
});

// ─── BUNNY UPLOAD ─────────────────────────────────────────────────────────────

describe('POST /api/bunny/upload-image', () => {
  it('retorna 401 sem autenticação', async () => {
    const res = await request(app).post('/api/bunny/upload-image');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/bunny/upload-image-batch', () => {
  it('retorna 401 sem autenticação', async () => {
    const res = await request(app).post('/api/bunny/upload-image-batch');
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem arquivos', async () => {
    if (!adminToken) return;
    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

// ─── ADS ──────────────────────────────────────────────────────────────────────

describe('GET /api/content/ads', () => {
  it('retorna array de anúncios', async () => {
    const res = await request(app).get('/api/content/ads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
