/**
 * Testes: Engajamento — Favoritos (lista por conta) e Curtida por obra (série)
 * Tipos de usuário: unauthenticated, user, premium
 */
const request = require('supertest');
const db = require('../helpers/db');
const { createUsers, getToken } = require('../helpers/auth');

let app;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  await createUsers(app);
});

afterAll(() => db.closeDatabase());

// ─── Dados de teste compartilhados ────────────────────────────────────────────
let seriesId, otherSeriesId;
const NONEXISTENT_ID = '000000000000000000000000';

beforeAll(async () => {
  const admin = getToken('admin');

  const s1 = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${admin}`)
    .send({ title: 'Série Favorita', genre: 'Ação', content_type: 'hqcine', isPublished: true });
  seriesId = s1.body._id;

  const s2 = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${admin}`)
    .send({ title: 'Outra Série', genre: 'Drama', content_type: 'hiqua', isPublished: true });
  otherSeriesId = s2.body._id;
});

// ═══════════════════════════════════════════════════════════════════════════════
// FAVORITOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Favoritos — /api/favorites', () => {
  it('unauthenticated não pode listar favoritos (401)', async () => {
    const res = await request(app).get('/api/favorites');
    expect(res.status).toBe(401);
  });

  it('unauthenticated não pode favoritar (401)', async () => {
    const res = await request(app).post(`/api/favorites/${seriesId}`);
    expect(res.status).toBe(401);
  });

  it('usuário autenticado favorita uma série', async () => {
    const res = await request(app)
      .post(`/api/favorites/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ favorited: true });
  });

  it('favoritar de novo é idempotente (não duplica)', async () => {
    const res = await request(app)
      .post(`/api/favorites/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ favorited: true });

    const list = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${getToken('user')}`);
    const matches = list.body.filter(f => f.seriesId === seriesId);
    expect(matches.length).toBe(1);
  });

  it('GET lista favoritos com os dados da série (populate)', async () => {
    await request(app)
      .post(`/api/favorites/${otherSeriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);

    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const fav = res.body.find(f => f.seriesId === seriesId);
    expect(fav).toBeDefined();
    expect(fav.series.title).toBe('Série Favorita');
  });

  it('favoritos são por conta (outro usuário não vê os do primeiro)', async () => {
    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('DELETE remove o favorito', async () => {
    const del = await request(app)
      .delete(`/api/favorites/${otherSeriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ favorited: false });

    const list = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(list.body.some(f => f.seriesId === otherSeriesId)).toBe(false);
  });

  it('POST com série inexistente retorna 404', async () => {
    const res = await request(app)
      .post(`/api/favorites/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(404);
  });

  it('POST com ObjectId inválido retorna 400', async () => {
    const res = await request(app)
      .post('/api/favorites/nao-e-um-id')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(400);
  });

  it('DELETE com ObjectId inválido retorna 400', async () => {
    const res = await request(app)
      .delete('/api/favorites/nao-e-um-id')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CURTIDA POR OBRA (SÉRIE)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Voto de série — /api/content/series/:id/vote', () => {
  it('unauthenticated não pode votar (401)', async () => {
    const res = await request(app)
      .post(`/api/content/series/${seriesId}/vote`)
      .send({ type: 'like' });
    expect(res.status).toBe(401);
  });

  it('type inválido retorna 400', async () => {
    const res = await request(app)
      .post(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'neutro' });
    expect(res.status).toBe(400);
  });

  it('usuário dá like e repetir o POST não duplica (like único por usuário)', async () => {
    const first = await request(app)
      .post(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    expect(first.status).toBe(200);
    expect(first.body.type).toBe('like');

    const second = await request(app)
      .post(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    expect(second.status).toBe(200);

    const res = await request(app)
      .get(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body.myVote).toBe('like');
    expect(res.body.likes).toBe(1);
  });

  it('GET sem autenticação devolve myVote null e likes corretos', async () => {
    const res = await request(app).get(`/api/content/series/${seriesId}/vote`);
    expect(res.status).toBe(200);
    expect(res.body.myVote).toBeNull();
    expect(res.body.likes).toBe(1);
  });

  it('segundo usuário curte e o total de likes soma', async () => {
    await request(app)
      .post(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ type: 'like' });

    const res = await request(app)
      .get(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(res.body.myVote).toBe('like');
    expect(res.body.likes).toBe(2);
  });

  it('dislike não conta como like e atualiza o voto existente', async () => {
    await request(app)
      .post(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ type: 'dislike' });

    const res = await request(app)
      .get(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(res.body.myVote).toBe('dislike');
    expect(res.body.likes).toBe(1);
  });

  it('DELETE remove o voto do usuário', async () => {
    const del = await request(app)
      .delete(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(del.status).toBe(200);

    const res = await request(app)
      .get(`/api/content/series/${seriesId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.body.myVote).toBeNull();
    expect(res.body.likes).toBe(0);
  });
});
