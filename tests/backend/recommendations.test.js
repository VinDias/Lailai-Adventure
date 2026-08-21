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

/**
 * Task 2: models/SeriesScore.js + services/recommendationService.js —
 * leitoresUnicos, Qualidade (0–30, proporcional por leitor único e
 * normalizada por content_type) e o esqueleto de computeSeriesScore/
 * computeAllScores (só gravam qualidade/leitoresUnicos/contentType/
 * computedAt nesta task; Retenção/Descoberta/Potential/Confidence chegam nas
 * Tasks 3 e 4 — por isso ficam asserted como 0/[]/default aqui).
 *
 * Seeding via insertMany DIRETO na collection (Model.collection.insertMany),
 * não Model.create(): bypassa Mongoose (validação/hooks) de propósito para
 * criar centenas de documentos de ReadingProgress sem o custo de construir
 * documentos Mongoose um a um — só precisamos das identidades existirem para
 * contarLeitoresUnicos/distinct() contá-las.
 */
describe('qualidade proporcional', () => {
  let mongoose;
  let Series;
  let SeriesScore;
  let ReadingProgress;
  let Favorite;
  let SeriesVote;
  let SuperReaderContribution;
  let EngagementEvent;
  let recommendationService;
  let seqEngagement;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    SeriesScore = require('../../models/SeriesScore');
    ReadingProgress = require('../../models/ReadingProgress');
    Favorite = require('../../models/Favorite');
    SeriesVote = require('../../models/SeriesVote');
    SuperReaderContribution = require('../../models/SuperReaderContribution');
    EngagementEvent = require('../../models/EngagementEvent');
    recommendationService = require('../../services/recommendationService');
    seqEngagement = 1;
  });

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Qualidade', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  /** N identidades distintas (anonymousId) lendo a série — leitores únicos "baratos". */
  async function seedLeitoresUnicos(seriesId, quantidade, contentType = 'hiqua') {
    const docs = Array.from({ length: quantidade }, (_, i) => ({
      anonymousId: `leitor-${seriesId}-${i}`,
      seriesId,
      episodeId: new mongoose.Types.ObjectId(),
      contentType,
      position: 0,
      percent: 0.95,
      completed: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await ReadingProgress.collection.insertMany(docs);
  }

  async function seedFavoritos(seriesId, quantidade) {
    const docs = Array.from({ length: quantidade }, () => ({
      userId: new mongoose.Types.ObjectId(),
      seriesId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    if (docs.length) await Favorite.collection.insertMany(docs);
  }

  async function seedVotos(seriesId, { likes = 0, dislikes = 0 } = {}) {
    const docs = [];
    for (let i = 0; i < likes; i++) docs.push({ userId: new mongoose.Types.ObjectId(), seriesId, type: 'like', createdAt: new Date() });
    for (let i = 0; i < dislikes; i++) docs.push({ userId: new mongoose.Types.ObjectId(), seriesId, type: 'dislike', createdAt: new Date() });
    if (docs.length) await SeriesVote.collection.insertMany(docs);
  }

  async function seedSuperReader(seriesId, quantidade) {
    const docs = Array.from({ length: quantidade }, (_, i) => ({
      seriesId,
      channelId: new mongoose.Types.ObjectId(),
      amountCents: 500,
      currency: 'brl',
      authorShareCents: 400,
      platformShareCents: 100,
      stripeSessionId: `cs_test_qualidade_${seriesId}_${i}_${new mongoose.Types.ObjectId()}`,
      period: '2026-08',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    if (docs.length) await SuperReaderContribution.collection.insertMany(docs);
  }

  async function seedEngagementEvents(seriesId, eventos) {
    const docs = eventos.map((e) => ({
      seq: seqEngagement++,
      type: e.type,
      seriesId,
      userId: e.userId,
      flagged: e.flagged || false,
      prevHash: 'GENESIS',
      hash: `hash-teste-${seqEngagement}`,
      createdAt: new Date(),
    }));
    await EngagementEvent.collection.insertMany(docs);
  }

  describe('contarLeitoresUnicos', () => {
    it('soma identidades distintas de userId e anonymousId da série', async () => {
      const serie = await criarSerie({ title: 'Leitores Unicos Soma' });
      await seedLeitoresUnicos(serie._id, 3, 'hiqua');
      // 2 leitores logados (userId), via insertMany cru também.
      await ReadingProgress.collection.insertMany([
        { userId: new mongoose.Types.ObjectId(), seriesId: serie._id, episodeId: new mongoose.Types.ObjectId(), contentType: 'hiqua', percent: 0.5, completed: false, createdAt: new Date(), updatedAt: new Date() },
        { userId: new mongoose.Types.ObjectId(), seriesId: serie._id, episodeId: new mongoose.Types.ObjectId(), contentType: 'hiqua', percent: 0.5, completed: false, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const total = await recommendationService.contarLeitoresUnicos(serie._id);
      expect(total).toBe(5);
    });

    it('sem nenhum ReadingProgress, devolve 0', async () => {
      const serie = await criarSerie({ title: 'Leitores Unicos Zero' });
      const total = await recommendationService.contarLeitoresUnicos(serie._id);
      expect(total).toBe(0);
    });
  });

  it('1) exemplo literal do PDF: obra A (100 leitores, 20 favoritos → 0,2/leitor) pontua MAIS que obra B (10.000 leitores, 200 favoritos → 0,02/leitor)', async () => {
    // Escala reduzida para o memory-server: leitores de B escalados de 10.000
    // para 1.000 (10x menor) e favoritos de B de 200 para 20 — preservando a
    // taxa EXATA do exemplo do PDF (0,2 e 0,02 por leitor), só reduzindo o
    // volume absoluto de documentos de ReadingProgress a inserir.
    const tipo = 'hqcine';
    const serieA = await criarSerie({ title: 'PDF Obra A', content_type: tipo });
    const serieB = await criarSerie({ title: 'PDF Obra B', content_type: tipo });

    await seedLeitoresUnicos(serieA._id, 100, tipo);
    await seedLeitoresUnicos(serieB._id, 1000, tipo);
    await seedFavoritos(serieA._id, 20);
    await seedFavoritos(serieB._id, 20);

    const contexto = await recommendationService.buildQualidadeContexto();
    const resultadoA = await recommendationService.computeQualidade(serieA, contexto);
    const resultadoB = await recommendationService.computeQualidade(serieB, contexto);

    expect(resultadoA.leitoresUnicos).toBe(100);
    expect(resultadoB.leitoresUnicos).toBe(1000);
    expect(resultadoA.metricas.favoritosPorLeitor).toBeCloseTo(0.2, 10);
    expect(resultadoB.metricas.favoritosPorLeitor).toBeCloseTo(0.02, 10);
    expect(resultadoA.qualidade).toBeGreaterThan(resultadoB.qualidade);
  });

  it('2) pesos internos: obra só-com-SR pontua mais que obra só-com-likes de MESMA taxa por leitor (45 vs 20)', async () => {
    const tipo = 'vcine';
    const serieSR = await criarSerie({ title: 'Peso SR', content_type: tipo });
    const serieLikes = await criarSerie({ title: 'Peso Likes', content_type: tipo });

    await seedLeitoresUnicos(serieSR._id, 10, tipo);
    await seedLeitoresUnicos(serieLikes._id, 10, tipo);
    await seedSuperReader(serieSR._id, 5);       // 5/10 = 0,5 por leitor
    await seedVotos(serieLikes._id, { likes: 5 }); // 5/10 = 0,5 por leitor

    const contexto = await recommendationService.buildQualidadeContexto();
    const resultadoSR = await recommendationService.computeQualidade(serieSR, contexto);
    const resultadoLikes = await recommendationService.computeQualidade(serieLikes, contexto);

    expect(resultadoSR.metricas.superReaderPorLeitor).toBeCloseTo(0.5, 10);
    expect(resultadoLikes.metricas.likesPorLeitor).toBeCloseTo(0.5, 10);
    // Cada uma é a única do seu tipo naquela métrica → normalização = 1.0,
    // então a diferença final é EXATAMENTE o peso interno (45% vs 20% de 30).
    expect(resultadoSR.qualidade).toBeCloseTo(0.45 * 30, 8);
    expect(resultadoLikes.qualidade).toBeCloseTo(0.20 * 30, 8);
    expect(resultadoSR.qualidade).toBeGreaterThan(resultadoLikes.qualidade);
  });

  it('3) flagged fora: eventos flagged NÃO contam como releitura', async () => {
    const serie = await criarSerie({ title: 'Releituras Flagged' });
    await seedLeitoresUnicos(serie._id, 1, 'hiqua');

    const userId = new mongoose.Types.ObjectId();
    await seedEngagementEvents(serie._id, [
      { userId, type: 'view', flagged: false },
      { userId, type: 'view', flagged: false },
      { userId, type: 'read', flagged: false },
      // Se contassem, dariam mais 2 releituras (total viraria 4) — não podem.
      { userId, type: 'view', flagged: true },
      { userId, type: 'view', flagged: true },
    ]);

    const resultado = await recommendationService.computeQualidade(serie, {});
    // 3 eventos não-flagged do mesmo usuário, 1 leitor único → (3-1)/1 = 2.
    expect(resultado.metricas.releiturasPorLeitor).toBe(2);
  });

  it('4) dislikes subtraem dos likes; líquido negativo vira 0 (nunca fica negativo)', async () => {
    const serie = await criarSerie({ title: 'Likes Negativos' });
    await seedLeitoresUnicos(serie._id, 10, 'hiqua');
    await seedVotos(serie._id, { likes: 2, dislikes: 5 }); // líquido -3 → 0

    const resultado = await recommendationService.computeQualidade(serie, {});
    expect(resultado.metricas.likesPorLeitor).toBe(0);
    expect(Number.isFinite(resultado.qualidade)).toBe(true);
  });

  it('5) zero leitores únicos: qualidade 0 e finita (sem NaN/Infinity), sem dividir por zero', async () => {
    const serie = await criarSerie({ title: 'Zero Leitores' });
    // Nenhum ReadingProgress criado para esta série de propósito.

    const resultado = await recommendationService.computeQualidade(serie, {});
    expect(resultado.leitoresUnicos).toBe(0);
    expect(resultado.qualidade).toBe(0);
    expect(Number.isFinite(resultado.qualidade)).toBe(true);
    Object.values(resultado.metricas).forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  it('6) normalização por content_type: a MESMA taxa em tipos diferentes não compete — o máximo é por tipo', async () => {
    // Auto-contida: cria a própria "obra grande" dominante em hqcine (taxa
    // 1.0, bem acima de qualquer coisa usada nos testes anteriores deste
    // describe), então compara duas obras de taxa IDÊNTICA (0,1) em tipos
    // diferentes — uma competindo com a obra grande (hqcine), outra sozinha
    // no seu tipo (vcine, sem nenhum favorito semeado até aqui).
    const serieGrande = await criarSerie({ title: 'Norm Tipo Grande', content_type: 'hqcine' });
    const serieQ = await criarSerie({ title: 'Norm Tipo Q', content_type: 'hqcine' });
    const serieP = await criarSerie({ title: 'Norm Tipo P', content_type: 'vcine' });

    await seedLeitoresUnicos(serieGrande._id, 10, 'hqcine');
    await seedFavoritos(serieGrande._id, 10); // 1,0 por leitor — dominante em hqcine

    await seedLeitoresUnicos(serieQ._id, 10, 'hqcine');
    await seedFavoritos(serieQ._id, 1); // 0,1 por leitor

    await seedLeitoresUnicos(serieP._id, 10, 'vcine');
    await seedFavoritos(serieP._id, 1); // 0,1 por leitor — mesma taxa de Q, tipo diferente

    const contexto = await recommendationService.buildQualidadeContexto();
    const resultadoQ = await recommendationService.computeQualidade(serieQ, contexto);
    const resultadoP = await recommendationService.computeQualidade(serieP, contexto);

    expect(resultadoQ.metricas.favoritosPorLeitor).toBeCloseTo(0.1, 10);
    expect(resultadoP.metricas.favoritosPorLeitor).toBeCloseTo(0.1, 10);
    // Mesma taxa bruta — mas Q compete com a obra grande no PRÓPRIO tipo
    // (hqcine) e P está sozinha em vcine: P normaliza para o máximo (1.0),
    // Q não. A taxa de P não "compete" com a de Q por serem tipos diferentes.
    expect(resultadoP.qualidade).toBeGreaterThan(resultadoQ.qualidade);
    expect(resultadoP.qualidade).toBeCloseTo(1.0 * 0.25 * 30, 8);
    expect(resultadoQ.qualidade).toBeCloseTo(0.1 * 0.25 * 30, 8);
  });

  it('7) computeSeriesScore grava com upsert: duas chamadas mantêm 1 único doc, atualizado', async () => {
    const tipo = 'hiqua';
    const serie = await criarSerie({ title: 'Upsert SeriesScore', content_type: tipo });
    await seedLeitoresUnicos(serie._id, 5, tipo);
    await seedFavoritos(serie._id, 1);

    const agora1 = new Date('2026-08-20T10:00:00.000Z');
    const doc1 = await recommendationService.computeSeriesScore(serie._id, { agora: agora1 });

    expect(String(doc1.seriesId)).toBe(String(serie._id));
    expect(doc1.contentType).toBe(tipo);
    expect(doc1.leitoresUnicos).toBe(5);
    expect(doc1.computedAt.toISOString()).toBe(agora1.toISOString());
    expect(Number.isFinite(doc1.qualidade)).toBe(true);
    expect(doc1.retencao).toBe(0);
    expect(doc1.descoberta).toBe(0);
    expect(doc1.scoreFinal).toBe(0);
    expect(doc1.potentialScore).toBe(0);
    expect(doc1.confidence).toBe(0);
    expect(doc1.penalizacoes).toEqual([]);

    const agora2 = new Date('2026-08-21T10:00:00.000Z');
    const doc2 = await recommendationService.computeSeriesScore(serie._id, { agora: agora2 });

    expect(String(doc2._id)).toBe(String(doc1._id));
    expect(doc2.computedAt.toISOString()).toBe(agora2.toISOString());

    const todos = await SeriesScore.find({ seriesId: serie._id });
    expect(todos).toHaveLength(1);
  });

  it('computeSeriesScore lança 404 para série inexistente', async () => {
    await expect(
      recommendationService.computeSeriesScore(new mongoose.Types.ObjectId()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('computeAllScores varre as séries publicadas e grava um SeriesScore para cada uma, sem lançar', async () => {
    const tipo = 'hiqua';
    const serie1 = await criarSerie({ title: 'ComputeAll 1', content_type: tipo });
    const serie2 = await criarSerie({ title: 'ComputeAll 2', content_type: tipo });
    await seedLeitoresUnicos(serie1._id, 3, tipo);
    await seedLeitoresUnicos(serie2._id, 7, tipo);

    const agora = new Date('2026-08-22T00:00:00.000Z');
    await recommendationService.computeAllScores({ agora });

    const doc1 = await SeriesScore.findOne({ seriesId: serie1._id });
    const doc2 = await SeriesScore.findOne({ seriesId: serie2._id });
    expect(doc1.leitoresUnicos).toBe(3);
    expect(doc2.leitoresUnicos).toBe(7);
    expect(doc1.computedAt.toISOString()).toBe(agora.toISOString());
  });
});
