/**
 * Testes: Fase 4, Bloco 4 — algoritmo de recomendação e tags.
 * Task 1: tags internas de série no modelo (validação e normalização) e nas
 * rotas de escrita (POST/PUT admin). Tags alimentam a Afinidade (Etapa 4) e
 * NUNCA aparecem na UI do leitor — `genre` continua sendo o rótulo visível
 * (conferido por grep em components/, sem ocorrência de "tags" fora deste
 * bloco no momento da escrita destes testes).
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

describe('tags', () => {
  describe('modelo Series — validador de tags', () => {
    let Series;
    beforeAll(() => {
      Series = require('../../models/Series');
    });

    it('0 tags é válido (obra ainda sem curadoria)', async () => {
      const serie = await Series.create({ title: 'Serie Tags Zero', genre: 'Teste', content_type: 'hiqua' });
      expect(serie.tags).toEqual([]);
    });

    it('1 a 4 tags é recusado (abaixo do mínimo de curadoria)', async () => {
      await expect(
        Series.create({
          title: 'Serie Tags Poucas', genre: 'Teste', content_type: 'hiqua',
          tags: ['aventura', 'drama', 'comedia'],
        }),
      ).rejects.toThrow();
    });

    it('5 tags é válido (mínimo)', async () => {
      const serie = await Series.create({
        title: 'Serie Tags Cinco', genre: 'Teste', content_type: 'hiqua',
        tags: ['aventura', 'drama', 'comedia', 'romance', 'acao'],
      });
      expect(serie.tags).toHaveLength(5);
    });

    it('15 tags é válido (máximo)', async () => {
      const quinze = Array.from({ length: 15 }, (_, i) => `tag${i}`);
      const serie = await Series.create({
        title: 'Serie Tags Quinze', genre: 'Teste', content_type: 'hiqua', tags: quinze,
      });
      expect(serie.tags).toHaveLength(15);
    });

    it('16 tags é recusado (acima do máximo)', async () => {
      const dezesseis = Array.from({ length: 16 }, (_, i) => `tag${i}`);
      await expect(
        Series.create({
          title: 'Serie Tags Dezesseis', genre: 'Teste', content_type: 'hiqua', tags: dezesseis,
        }),
      ).rejects.toThrow();
    });

    it('deduplica tags repetidas após a normalização, mantendo a contagem final dentro do intervalo válido', async () => {
      const serie = await Series.create({
        title: 'Serie Tags Dedupe', genre: 'Teste', content_type: 'hiqua',
        tags: ['Aventura', 'aventura', 'Drama', 'Comedia', 'Romance', 'Acao'],
      });
      // 6 enviadas, 1 duplicata (Aventura/aventura) → 5 únicas, dentro de 5–15.
      expect(serie.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });

    it('dedupe que cruza o limiar mínimo rejeita: 5 cruas viram 4 únicas', async () => {
      // A contagem do validator é APÓS a normalização do setter — 'A' e 'a'
      // são a mesma tag, então este envio tem só 4 tags de verdade.
      await expect(Series.create({
        title: 'Serie Tags Limiar', genre: 'Teste', content_type: 'hiqua',
        tags: ['A', 'a', 'b', 'c', 'd'],
      })).rejects.toThrow(/tags/i);
    });

    it('normaliza tags para minúsculas', async () => {
      const serie = await Series.create({
        title: 'Serie Tags Maiusculas', genre: 'Teste', content_type: 'hiqua',
        tags: ['AVENTURA', 'DRAMA', 'COMEDIA', 'ROMANCE', 'ACAO'],
      });
      expect(serie.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });

    it('remove espaços das bordas de cada tag (trim)', async () => {
      const serie = await Series.create({
        title: 'Serie Tags Trim', genre: 'Teste', content_type: 'hiqua',
        tags: ['  aventura  ', 'drama ', ' comedia', 'romance', 'acao'],
      });
      expect(serie.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });

    it('recusa string vazia (ou só espaço) entre as tags', async () => {
      await expect(
        Series.create({
          title: 'Serie Tags Vazia', genre: 'Teste', content_type: 'hiqua',
          tags: ['aventura', 'drama', '   ', 'romance', 'acao'],
        }),
      ).rejects.toThrow();
    });
  });

  describe('POST /api/content/series — tags', () => {
    it('cria série com tags válidas e persiste normalizadas (minúsculas, sem duplicatas)', async () => {
      const res = await request(app)
        .post('/api/content/series')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({
          title: 'Serie Rota Tags', genre: 'Teste', content_type: 'hiqua',
          tags: ['Aventura', 'DRAMA', 'comedia', 'Romance', 'acao'],
        });
      expect(res.status).toBe(201);
      expect(res.body.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });

    it('sem tags no body, a série é criada com tags: [] (acervo antigo sem curadoria)', async () => {
      const res = await request(app)
        .post('/api/content/series')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ title: 'Serie Rota Sem Tags', genre: 'Teste', content_type: 'hiqua' });
      expect(res.status).toBe(201);
      expect(res.body.tags).toEqual([]);
    });

    it('tags inválidas (1–4 itens) retornam 400 — não 500 — com a mensagem do validator', async () => {
      const res = await request(app)
        .post('/api/content/series')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({
          title: 'Serie Rota Tags Invalida', genre: 'Teste', content_type: 'hiqua',
          tags: ['aventura', 'drama'],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/tags/i);
    });

    it('tags acima de 15 itens retornam 400 — não 500', async () => {
      const dezesseis = Array.from({ length: 16 }, (_, i) => `tag${i}`);
      const res = await request(app)
        .post('/api/content/series')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ title: 'Serie Rota Tags Excesso', genre: 'Teste', content_type: 'hiqua', tags: dezesseis });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/tags/i);
    });
  });

  describe('PUT /api/content/series/:id — tags', () => {
    let seriesId;

    beforeAll(async () => {
      const criada = await request(app)
        .post('/api/content/series')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ title: 'Serie Rota Tags PUT', genre: 'Teste', content_type: 'hiqua' });
      seriesId = criada.body._id;
    });

    it('admin atualiza tags e a série persiste normalizada', async () => {
      const res = await request(app)
        .put(`/api/content/series/${seriesId}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ tags: ['Aventura', 'DRAMA', 'comedia', 'Romance', 'acao'] });
      expect(res.status).toBe(200);
      expect(res.body.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });

    it('atualizar com tags inválidas (1–4) retorna 400 — não 500 (hoje o catch é genérico e viraria 500)', async () => {
      const res = await request(app)
        .put(`/api/content/series/${seriesId}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ tags: ['aventura', 'drama'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/tags/i);
    });

    it('limpar as tags para [] é aceito (obra volta a "sem curadoria")', async () => {
      const res = await request(app)
        .put(`/api/content/series/${seriesId}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ tags: [] });
      expect(res.status).toBe(200);
      expect(res.body.tags).toEqual([]);
    });

    it('usuário comum não pode atualizar tags (403, sem tocar o validator)', async () => {
      const res = await request(app)
        .put(`/api/content/series/${seriesId}`)
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ tags: ['aventura', 'drama', 'comedia', 'romance', 'acao'] });
      expect(res.status).toBe(403);
    });
  });

  describe('rotas de leitura — tags viajam no JSON (inofensivo; a UI não as renderiza)', () => {
    let seriesId;

    beforeAll(async () => {
      const criada = await request(app)
        .post('/api/content/series')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({
          title: 'Serie Leitura Tags', genre: 'Teste', content_type: 'hiqua', isPublished: true,
          tags: ['aventura', 'drama', 'comedia', 'romance', 'acao'],
        });
      seriesId = criada.body._id;
    });

    it('GET /api/content/series devolve o campo tags', async () => {
      const res = await request(app).get('/api/content/series?type=hiqua');
      const item = res.body.find(s => s._id === seriesId);
      expect(item).toBeDefined();
      expect(item.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });

    it('GET /api/content/series/:id devolve o campo tags', async () => {
      const res = await request(app).get(`/api/content/series/${seriesId}`);
      expect(res.status).toBe(200);
      expect(res.body.tags).toEqual(['aventura', 'drama', 'comedia', 'romance', 'acao']);
    });
  });
});
