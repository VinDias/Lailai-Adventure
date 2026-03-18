/**
 * Testes: Conteúdo — Séries, Episódios, Painéis, Votos
 * Tipos de usuário: unauthenticated, user, premium, admin, superadmin
 */
const request = require('supertest');
const db = require('../helpers/db');
const { createUsers, getToken, getId } = require('../helpers/auth');

let app;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  await createUsers(app);
});

afterAll(() => db.closeDatabase());

// ─── Dados de teste compartilhados ────────────────────────────────────────────
let seriesId, premiumSeriesId, episodeId, premiumEpisodeId, freeEpisodeId;

beforeAll(async () => {
  const admin = getToken('admin');

  // Série gratuita
  const s1 = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${admin}`)
    .send({ title: 'Série Gratuita', genre: 'Ação', content_type: 'hqcine', isPublished: true });
  seriesId = s1.body._id;

  // Série premium
  const s2 = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${admin}`)
    .send({ title: 'Série Premium', genre: 'Drama', content_type: 'hiqua', isPremium: true, isPublished: true });
  premiumSeriesId = s2.body._id;

  // Episódio gratuito
  const e1 = await request(app)
    .post('/api/content/episodes')
    .set('Authorization', `Bearer ${admin}`)
    .send({ seriesId, episode_number: 1, title: 'Ep 1 Grátis', isPremium: false });
  episodeId = e1.body._id;
  freeEpisodeId = episodeId;

  // Episódio premium
  const e2 = await request(app)
    .post('/api/content/episodes')
    .set('Authorization', `Bearer ${admin}`)
    .send({ seriesId, episode_number: 2, title: 'Ep 2 Premium', isPremium: true });
  premiumEpisodeId = e2.body._id;
});

// ═══════════════════════════════════════════════════════════════════════════════
// SÉRIES
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series — listagem pública', () => {
  it('retorna séries publicadas sem autenticação', async () => {
    const res = await request(app).get('/api/content/series');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filtra por content_type=hqcine', async () => {
    const res = await request(app).get('/api/content/series?type=hqcine');
    expect(res.status).toBe(200);
    res.body.forEach(s => expect(s.content_type).toBe('hqcine'));
  });

  it('filtra por content_type=hiqua', async () => {
    const res = await request(app).get('/api/content/series?type=hiqua');
    expect(res.status).toBe(200);
    res.body.forEach(s => expect(s.content_type).toBe('hiqua'));
  });

  it('não retorna séries não publicadas', async () => {
    const admin = getToken('admin');
    await request(app).post('/api/content/series')
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: 'Não Publicada', genre: 'X', content_type: 'vcine', isPublished: false });
    const res = await request(app).get('/api/content/series');
    const nomes = res.body.map(s => s.title);
    expect(nomes).not.toContain('Não Publicada');
  });
});

describe('POST /api/content/series — criação (admin)', () => {
  it('admin cria série com sucesso', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Nova Série', genre: 'Ficção', content_type: 'vcine', isPublished: true });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
  });

  it('superadmin também pode criar série', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('superadmin')}`)
      .send({ title: 'Série Superadmin', genre: 'X', content_type: 'hqcine', isPublished: true });
    expect(res.status).toBe(201);
  });

  it('usuário comum não pode criar série (403)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ title: 'Bloqueada', genre: 'X', content_type: 'hqcine' });
    expect(res.status).toBe(403);
  });

  it('usuário premium não pode criar série (403)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ title: 'Bloqueada', genre: 'X', content_type: 'hqcine' });
    expect(res.status).toBe(403);
  });

  it('unauthenticated não pode criar série (401)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .send({ title: 'Bloqueada', genre: 'X', content_type: 'hqcine' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Sem genre' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('obrigatório');
  });

  it('retorna 400 com content_type inválido', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'X', genre: 'X', content_type: 'invalido' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PUT /api/content/series/:id — edição (admin)', () => {
  it('admin edita série existente', async () => {
    const res = await request(app)
      .put(`/api/content/series/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Título Atualizado' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Título Atualizado');
  });

  it('usuário comum não pode editar (403)', async () => {
    const res = await request(app)
      .put(`/api/content/series/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ title: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/content/series/:id — remoção (admin)', () => {
  it('admin remove série', async () => {
    const create = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Para Deletar', genre: 'X', content_type: 'vcine' });
    const res = await request(app)
      .delete(`/api/content/series/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
  });

  it('usuário comum não pode deletar (403)', async () => {
    const res = await request(app)
      .delete(`/api/content/series/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EPISÓDIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series/:id/episodes — listagem por tipo de usuário', () => {
  it('usuário não autenticado vê apenas episódios gratuitos', async () => {
    const res = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 1 Grátis');
    expect(titles).not.toContain('Ep 2 Premium');
  });

  it('usuário comum (não premium) vê apenas episódios gratuitos', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 1 Grátis');
    expect(titles).not.toContain('Ep 2 Premium');
  });

  it('usuário premium vê todos os episódios', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 1 Grátis');
    expect(titles).toContain('Ep 2 Premium');
  });

  it('admin vê todos os episódios', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 2 Premium');
  });

  it('retorna [] para série inexistente', async () => {
    const fakeId = '000000000000000000000000';
    const res = await request(app).get(`/api/content/series/${fakeId}/episodes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('episódios retornados em ordem (episode_number asc)', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    const nums = res.body.map(e => e.episode_number);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });
});

describe('GET /api/content/episodes/:id — detalhes de episódio', () => {
  it('retorna detalhes de episódio sem autenticação', async () => {
    const res = await request(app).get(`/api/content/episodes/${episodeId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(episodeId);
    expect(res.body.title).toBe('Ep 1 Grátis');
  });

  it('retorna 404 para episódio inexistente', async () => {
    const res = await request(app).get('/api/content/episodes/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('incrementa views a cada acesso', async () => {
    const before = (await request(app).get(`/api/content/episodes/${episodeId}`)).body.views;
    await request(app).get(`/api/content/episodes/${episodeId}`);
    const after = (await request(app).get(`/api/content/episodes/${episodeId}`)).body.views;
    expect(after).toBeGreaterThan(before);
  });
});

describe('POST /api/content/episodes — criação (admin)', () => {
  it('admin cria episódio com dados válidos', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 10, title: 'Ep 10', description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.title).toBe('Ep 10');
  });

  it('episódio criado aparece na listagem pública se gratuito', async () => {
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 11, title: 'Ep Visível', isPremium: false });
    const list = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(list.body.some(e => e._id === create.body._id)).toBe(true);
  });

  it('episódio premium NÃO aparece para usuários não-premium', async () => {
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 12, title: 'Ep Pago', isPremium: true });
    const list = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(list.body.some(e => e._id === create.body._id)).toBe(false);
  });

  it('usuário comum não pode criar episódio (403)', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ seriesId, episode_number: 99, title: 'Bloqueado' });
    expect(res.status).toBe(403);
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/content/episodes/:id', () => {
  it('admin remove episódio e ele some da listagem', async () => {
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 50, title: 'Ep Para Deletar' });
    const id = create.body._id;

    await request(app).delete(`/api/content/episodes/${id}`).set('Authorization', `Bearer ${getToken('admin')}`);

    const list = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(list.body.some(e => e._id === id)).toBe(false);
  });

  it('usuário comum não pode deletar (403)', async () => {
    const res = await request(app)
      .delete(`/api/content/episodes/${episodeId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAINÉIS
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/content/episodes/:id/panels — painéis (admin)', () => {
  let hiQuaSeriesId, hiQuaEpId;

  beforeAll(async () => {
    const s = await request(app).post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'HiQua Painéis', genre: 'Ação', content_type: 'hiqua', isPublished: true });
    hiQuaSeriesId = s.body._id;

    const e = await request(app).post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId: hiQuaSeriesId, episode_number: 1, title: 'Cap Painéis' });
    hiQuaEpId = e.body._id;
  });

  it('admin adiciona painéis a um episódio', async () => {
    const panels = [
      { image_url: 'https://cdn.example.com/p1.jpg', order: 0 },
      { image_url: 'https://cdn.example.com/p2.jpg', order: 1 },
      { image_url: 'https://cdn.example.com/p3.jpg', order: 2 },
    ];
    const res = await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ panels });
    expect(res.status).toBe(200);
    expect(res.body.panelCount).toBe(3);
  });

  it('retorna 400 com array de painéis vazio', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ panels: [] });
    expect(res.status).toBe(400);
  });

  it('usuário comum não pode adicionar painéis (403)', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ panels: [{ image_url: 'x', order: 0 }] });
    expect(res.status).toBe(403);
  });

  it('admin remove painel por índice', async () => {
    // Adiciona painel
    await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ panels: [{ image_url: 'https://x.com/a.jpg', order: 0 }] });

    const ep = await request(app).get(`/api/content/episodes/${hiQuaEpId}`);
    const countBefore = ep.body.panels.length;

    await request(app)
      .delete(`/api/content/episodes/${hiQuaEpId}/panels/0`)
      .set('Authorization', `Bearer ${getToken('admin')}`);

    const epAfter = await request(app).get(`/api/content/episodes/${hiQuaEpId}`);
    expect(epAfter.body.panels.length).toBe(countBefore - 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VOTOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Votos em episódios', () => {
  it('usuário autenticado pode dar like', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('like');
  });

  it('usuário autenticado pode dar dislike', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ type: 'dislike' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('dislike');
  });

  it('unauthenticated não pode votar (401)', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .send({ type: 'like' });
    expect(res.status).toBe(401);
  });

  it('tipo de voto inválido retorna 400', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'neutro' });
    expect(res.status).toBe(400);
  });

  it('GET retorna voto atual do usuário', async () => {
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    const res = await request(app)
      .get(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('like');
  });

  it('DELETE remove voto do usuário', async () => {
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    const del = await request(app)
      .delete(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(del.status).toBe(200);
    const get = await request(app)
      .get(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(get.body).toBeNull();
  });

  it('atualizar voto (like → dislike) funciona', async () => {
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'dislike' });
    const res = await request(app)
      .get(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.body.type).toBe('dislike');
  });

  it('admin consulta métricas de um episódio', async () => {
    const res = await request(app)
      .get(`/api/admin/episodes/${freeEpisodeId}/metrics`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('likes');
    expect(res.body).toHaveProperty('dislikes');
  });
});
