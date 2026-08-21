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
 * Fix pós-aprovação (achado ALTO da revisão da T2): Favorito e Like só
 * contam de userIds que TAMBÉM têm ReadingProgress na mesma série — sem
 * esse gate, contas falsas favoritando/votando sem ler inflam o máximo do
 * content_type e suprimem a qualidade das obras honestas (ver describe
 * "gate de leitura real" abaixo). Super Reader continua contando sempre
 * (gate econômico, não comportamental).
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

  /** N identidades distintas via anonymousId — "leitor" sem conta, barato pra
   *  semear volume. Não pode favoritar/votar (Favorite/SeriesVote exigem
   *  userId) — usar para testes que não dependem do gate de leitura real. */
  async function seedLeitoresAnonimos(seriesId, quantidade, contentType = 'hiqua') {
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

  /** N identidades distintas via userId (leitores LOGADOS) — devolve os
   *  userIds criados, porque Favorito/Like só contam se o MESMO userId
   *  aparecer aqui (gate de "ação real de leitor" — ver
   *  services/recommendationService.js, computeMetricasBrutas). */
  async function seedLeitoresLogados(seriesId, quantidade, contentType = 'hiqua') {
    const userIds = Array.from({ length: quantidade }, () => new mongoose.Types.ObjectId());
    const docs = userIds.map((userId) => ({
      userId,
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
    return userIds;
  }

  /** Favorito por userId EXPLÍCITO (não gera identidade nova) — deixa o
   *  teste escolher se quem favoritou É ou NÃO é leitor da própria série. */
  async function seedFavoritos(seriesId, userIds) {
    const docs = userIds.map((userId) => ({ userId, seriesId, createdAt: new Date(), updatedAt: new Date() }));
    if (docs.length) await Favorite.collection.insertMany(docs);
  }

  /** Likes/dislikes por userId EXPLÍCITO, mesmo motivo do seedFavoritos acima. */
  async function seedVotos(seriesId, { likesUserIds = [], dislikesUserIds = [] } = {}) {
    const docs = [
      ...likesUserIds.map((userId) => ({ userId, seriesId, type: 'like', createdAt: new Date() })),
      ...dislikesUserIds.map((userId) => ({ userId, seriesId, type: 'dislike', createdAt: new Date() })),
    ];
    if (docs.length) await SeriesVote.collection.insertMany(docs);
  }

  /** Contribuições Super Reader — SEMPRE contam (gate econômico, não de
   *  leitura; ver comentário em computeMetricasBrutas). `userId` opcional
   *  simula tanto apoio de quem leu quanto de quem nunca leu — não muda a
   *  contagem em nenhum dos dois casos. */
  async function seedSuperReader(seriesId, quantidade, { userId = null } = {}) {
    const docs = Array.from({ length: quantidade }, (_, i) => ({
      seriesId,
      userId,
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
      await seedLeitoresAnonimos(serie._id, 3, 'hiqua');
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
    // Leitores LOGADOS (não anônimos): favorito só conta de quem leu (gate
    // de leitura real) — os 20 favoritos usam um SUBCONJUNTO dos userIds
    // que de fato leram a obra.
    const tipo = 'hqcine';
    const serieA = await criarSerie({ title: 'PDF Obra A', content_type: tipo });
    const serieB = await criarSerie({ title: 'PDF Obra B', content_type: tipo });

    const leitoresA = await seedLeitoresLogados(serieA._id, 100, tipo);
    const leitoresB = await seedLeitoresLogados(serieB._id, 1000, tipo);
    await seedFavoritos(serieA._id, leitoresA.slice(0, 20));
    await seedFavoritos(serieB._id, leitoresB.slice(0, 20));

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

    await seedLeitoresLogados(serieSR._id, 10, tipo);
    const leitoresLikes = await seedLeitoresLogados(serieLikes._id, 10, tipo);
    await seedSuperReader(serieSR._id, 5); // 5/10 = 0,5 por leitor — SR não depende do gate de leitura
    await seedVotos(serieLikes._id, { likesUserIds: leitoresLikes.slice(0, 5) }); // 5/10 = 0,5 por leitor, de LEITORES reais

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
    await seedLeitoresAnonimos(serie._id, 1, 'hiqua');

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
    const leitores = await seedLeitoresLogados(serie._id, 10, 'hiqua');
    await seedVotos(serie._id, { likesUserIds: leitores.slice(0, 2), dislikesUserIds: leitores.slice(2, 7) }); // líquido 2-5 = -3 → 0

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
    // no seu tipo (vcine, sem nenhum favorito semeado até aqui). Favoritos
    // sempre de leitores LOGADOS reais (gate de leitura real).
    const serieGrande = await criarSerie({ title: 'Norm Tipo Grande', content_type: 'hqcine' });
    const serieQ = await criarSerie({ title: 'Norm Tipo Q', content_type: 'hqcine' });
    const serieP = await criarSerie({ title: 'Norm Tipo P', content_type: 'vcine' });

    const leitoresGrande = await seedLeitoresLogados(serieGrande._id, 10, 'hqcine');
    await seedFavoritos(serieGrande._id, leitoresGrande); // 10/10 = 1,0 por leitor — dominante em hqcine

    const leitoresQ = await seedLeitoresLogados(serieQ._id, 10, 'hqcine');
    await seedFavoritos(serieQ._id, leitoresQ.slice(0, 1)); // 0,1 por leitor

    const leitoresP = await seedLeitoresLogados(serieP._id, 10, 'vcine');
    await seedFavoritos(serieP._id, leitoresP.slice(0, 1)); // 0,1 por leitor — mesma taxa de Q, tipo diferente

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
    const leitores = await seedLeitoresLogados(serie._id, 5, tipo);
    await seedFavoritos(serie._id, leitores.slice(0, 1));

    const agora1 = new Date('2026-08-20T10:00:00.000Z');
    const doc1 = await recommendationService.computeSeriesScore(serie._id, { agora: agora1 });

    expect(String(doc1.seriesId)).toBe(String(serie._id));
    expect(doc1.contentType).toBe(tipo);
    expect(doc1.leitoresUnicos).toBe(5);
    expect(doc1.computedAt.toISOString()).toBe(agora1.toISOString());
    expect(Number.isFinite(doc1.qualidade)).toBe(true);
    // Retenção (Task 3): seedLeitoresLogados grava percent 0,95 em episódios
    // sem nenhum Episode real por trás (episodeId aleatório) — concluídos
    // fica 0 (sem episódio publicado para dividir) e outro-dia fica 0 (1 doc
    // por leitor, mesmo dia). Só o percentual médio conta: 0,95×0,33×25.
    expect(doc1.retencao).toBeCloseTo(0.95 * 0.33 * 25, 8);
    expect(doc1.descoberta).toBe(0);
    expect(doc1.scoreFinal).toBe(0);
    expect(doc1.potentialScore).toBe(0);
    expect(doc1.confidence).toBe(0);
    // A série nunca teve um Episode publicado nem um EngagementEvent — as
    // duas condições da inatividade (Task 3) se cumprem trivialmente. Não é
    // retencao_baixa (7,84 > 7,5 = 30% de 25) nem abandono_rapido (episodeId
    // não resolve para nenhum Episode real, então não há leitor "preso" no
    // capítulo 1 comprovado).
    expect(doc1.penalizacoes).toEqual(['inatividade']);

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
    await seedLeitoresAnonimos(serie1._id, 3, tipo);
    await seedLeitoresAnonimos(serie2._id, 7, tipo);

    const agora = new Date('2026-08-22T00:00:00.000Z');
    await recommendationService.computeAllScores({ agora });

    const doc1 = await SeriesScore.findOne({ seriesId: serie1._id });
    const doc2 = await SeriesScore.findOne({ seriesId: serie2._id });
    expect(doc1.leitoresUnicos).toBe(3);
    expect(doc2.leitoresUnicos).toBe(7);
    expect(doc1.computedAt.toISOString()).toBe(agora.toISOString());
  });

  /**
   * Achado ALTO da revisão da T2: leitoresUnicos (denominador) vem de
   * ReadingProgress, mas favoritos/likes (numeradores) vinham de coleções
   * que não exigiam leitura — N contas falsas favoritando/votando SEM ler
   * faziam a taxa por leitor crescer sem teto e, via o máximo do
   * content_type, SUPRIMIAM a qualidade de todas as obras honestas do tipo.
   * Fix: Favorito e Like só contam de userIds que TAMBÉM têm ReadingProgress
   * na mesma série ("ações reais dos leitores", letra do PDF). Super Reader
   * é a exceção deliberada — gate econômico (pagou via Stripe), não
   * comportamental.
   */
  describe('gate de leitura real (favoritos/likes só de quem leu; SR sempre conta)', () => {
    it('favorito de conta SEM leitura na obra NÃO conta — só favoritos de leitores entram na taxa', async () => {
      const serie = await criarSerie({ title: 'Favoritos Nao Leitor' });
      const leitores = await seedLeitoresLogados(serie._id, 1, 'hiqua'); // 1 leitor real
      const naoLeitores = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

      // 1 favorito de quem leu + 3 favoritos de contas que NUNCA leram a obra.
      await seedFavoritos(serie._id, [...leitores, ...naoLeitores]);

      const resultado = await recommendationService.computeQualidade(serie, {});
      // Se os 3 de não-leitor contassem, daria 4/1 = 4. Só o de leitor conta: 1/1 = 1.
      expect(resultado.metricas.favoritosPorLeitor).toBe(1);
    });

    it('like de não-leitor não conta; like de leitor conta', async () => {
      const serie = await criarSerie({ title: 'Likes Leitor Vs Nao Leitor' });
      const leitores = await seedLeitoresLogados(serie._id, 2, 'hiqua');
      const naoLeitor = new mongoose.Types.ObjectId();

      await seedVotos(serie._id, { likesUserIds: [leitores[0], naoLeitor] }); // 1 like de leitor + 1 de não-leitor

      const resultado = await recommendationService.computeQualidade(serie, {});
      // Se o like do não-leitor contasse, daria 2/2 = 1. Só o de leitor conta: 1/2 = 0,5.
      expect(resultado.metricas.likesPorLeitor).toBe(0.5);
    });

    it('super reader de não-leitor CONTA — gate econômico (Stripe), não comportamental', async () => {
      const serie = await criarSerie({ title: 'SR Nao Leitor Conta' });
      await seedLeitoresLogados(serie._id, 5, 'hiqua'); // 5 leitores reais, nenhum é o autor da contribuição
      const naoLeitor = new mongoose.Types.ObjectId(); // nunca aparece em ReadingProgress desta série
      await seedSuperReader(serie._id, 1, { userId: naoLeitor });

      const resultado = await recommendationService.computeQualidade(serie, {});
      expect(resultado.metricas.superReaderPorLeitor).toBeCloseTo(1 / 5, 10);
    });

    it('regressão do ataque: obra honesta vence obra com favoritos fabricados de não-leitores', async () => {
      const tipo = 'hiqua';
      const serieHonesta = await criarSerie({ title: 'Obra Honesta', content_type: tipo });
      const serieAtacada = await criarSerie({ title: 'Obra Fabricada', content_type: tipo });

      // Obra honesta: 10 leitores reais, 3 favoritam de verdade → 0,3/leitor.
      const leitoresHonesta = await seedLeitoresLogados(serieHonesta._id, 10, tipo);
      await seedFavoritos(serieHonesta._id, leitoresHonesta.slice(0, 3));

      // Obra atacada: 1 leitor real, mas 500 contas FALSAS favoritando sem
      // nunca ter lido — antes do fix isso inflava favoritosPorLeitor para
      // 500/1 = 500 e, via o máximo do content_type, suprimia a qualidade de
      // TODAS as obras honestas do tipo (o achado ALTO da revisão).
      await seedLeitoresLogados(serieAtacada._id, 1, tipo);
      const contasFalsas = Array.from({ length: 500 }, () => new mongoose.Types.ObjectId());
      await seedFavoritos(serieAtacada._id, contasFalsas); // nenhuma delas tem ReadingProgress na série

      const contexto = await recommendationService.buildQualidadeContexto();
      const resultadoHonesta = await recommendationService.computeQualidade(serieHonesta, contexto);
      const resultadoAtacada = await recommendationService.computeQualidade(serieAtacada, contexto);

      // Os 500 favoritos fabricados NÃO contam — a taxa da obra atacada fica 0.
      expect(resultadoAtacada.metricas.favoritosPorLeitor).toBe(0);
      expect(resultadoHonesta.metricas.favoritosPorLeitor).toBeCloseTo(0.3, 10);
      expect(resultadoHonesta.qualidade).toBeGreaterThan(resultadoAtacada.qualidade);
    });
  });
});

/**
 * Task 3: Retenção (0–25, Etapa 3 do PDF — redistribuição 45/33/22, ledger
 * P2: tempo médio de leitura não é coletado) + Penalizações (Etapa 9 —
 * retencao_baixa ×0,80 / abandono_rapido ×0,85 / inatividade ×0,90, piso de
 * 20%). Ver services/recommendationService.js — computeRetencao,
 * computePenalizacoes, aplicarPenalizacoesNaSoma e os limiares puros
 * (retencaoEhBaixa/abandonoEhRapido/estaInativa).
 *
 * Diferente da Qualidade: retenção NÃO normaliza por content_type — cada
 * sub-métrica já é uma fração/média 0–1 natural (spec: "retenção é absoluta
 * por natureza").
 */
// Pesos usados nas assertions abaixo — mesmos valores das constantes internas
// do serviço (não exportadas: a Retenção não precisa de contexto externo
// como a Qualidade, então não há necessidade de expor os pesos brutos).
const PESO_CONCLUIDOS_TESTE = 0.45;
const PESO_PERCENTUAL_TESTE = 0.33;

describe('retencao', () => {
  let mongoose;
  let Series;
  let ReadingProgress;
  let Episode;
  let recommendationService;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    ReadingProgress = require('../../models/ReadingProgress');
    Episode = require('../../models/Episode');
    recommendationService = require('../../services/recommendationService');
  });

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Retencao', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  function criarEpisodio(seriesId, episodeNumber, overrides = {}) {
    return Episode.create({
      seriesId, episode_number: episodeNumber, title: `Cap ${episodeNumber}`, status: 'published', ...overrides,
    });
  }

  /** Insere ReadingProgress cru (bypass Mongoose — mesmo padrão do describe
   *  "qualidade proporcional"). Cada item define identidade (userId OU
   *  anonymousId), episodeId (opcional — aleatório se ausente, o que
   *  NUNCA resolve para um Episode real), percent, completed e,
   *  opcionalmente, createdAt/updatedAt (para o proxy de "outro dia"). */
  async function seedProgress(seriesId, docs) {
    const prontos = docs.map((d) => ({
      seriesId,
      contentType: 'hiqua',
      position: 0,
      percent: d.percent,
      completed: Boolean(d.completed),
      episodeId: d.episodeId || new mongoose.Types.ObjectId(),
      ...(d.userId ? { userId: d.userId } : { anonymousId: d.anonymousId || `anon-${new mongoose.Types.ObjectId()}` }),
      createdAt: d.createdAt || new Date(),
      updatedAt: d.updatedAt || d.createdAt || new Date(),
    }));
    await ReadingProgress.collection.insertMany(prontos);
  }

  it('1) capítulos concluídos: leitores que completam TODOS os episódios publicados → componente ≈ 1 (peso 45%)', async () => {
    const serie = await criarSerie({ title: 'Retencao Concluidos Cheio' });
    const ep1 = await criarEpisodio(serie._id, 1);
    const ep2 = await criarEpisodio(serie._id, 2);

    for (let i = 0; i < 3; i++) {
      const userId = new mongoose.Types.ObjectId();
      await seedProgress(serie._id, [
        { userId, episodeId: ep1._id, percent: 1, completed: true },
        { userId, episodeId: ep2._id, percent: 1, completed: true },
      ]);
    }

    const resultado = await recommendationService.computeRetencao(serie);
    expect(resultado.leitoresUnicos).toBe(3);
    expect(resultado.metricas.totalEpisodios).toBe(2);
    expect(resultado.metricas.concluidosComponente).toBeCloseTo(1, 10);
    // Outro-dia fica 0 (docs do mesmo leitor no mesmo instante de teste,
    // mesmo dia civil) — retencao aqui é só concluídos (45%) + percentual
    // médio (33%, também 1 porque percent=1): (0,45+0,33)×25.
    expect(resultado.retencao).toBeCloseTo((PESO_CONCLUIDOS_TESTE + PESO_PERCENTUAL_TESTE) * 25, 8);
  });

  it('2) percentual médio: valores não-redondos (0,62 e 0,18) refletem exatamente na média simples de TODOS os docs', async () => {
    const serie = await criarSerie({ title: 'Retencao Percentual Medio' });
    // Sem nenhum Episode publicado → concluídos fica 0 (sem denominador).
    await seedProgress(serie._id, [
      { anonymousId: 'leitor-percent-a', percent: 0.62 },
      { anonymousId: 'leitor-percent-b', percent: 0.18 },
    ]);

    const resultado = await recommendationService.computeRetencao(serie);
    expect(resultado.metricas.concluidosComponente).toBe(0);
    expect(resultado.metricas.percentualMedioComponente).toBeCloseTo((0.62 + 0.18) / 2, 10);
    expect(resultado.metricas.outroDiaComponente).toBe(0);
    expect(resultado.retencao).toBeCloseTo(((0.62 + 0.18) / 2) * PESO_PERCENTUAL_TESTE * 25, 10);
  });

  it('3) outro dia (proxy): leitor com atividade em 2 dias distintos conta; leitor de 1 dia só não conta', async () => {
    const serie = await criarSerie({ title: 'Retencao Outro Dia' });
    const dia1 = new Date('2026-07-01T12:00:00.000Z');
    const dia2 = new Date('2026-07-05T12:00:00.000Z');

    // Leitor A: 2 docs (episódios diferentes) com createdAt em dias distintos.
    await seedProgress(serie._id, [
      { anonymousId: 'leitor-dia-a', percent: 0.5, createdAt: dia1, updatedAt: dia1 },
      { anonymousId: 'leitor-dia-a', percent: 0.5, createdAt: dia2, updatedAt: dia2 },
    ]);
    // Leitor B: 1 doc só, createdAt e updatedAt no mesmo dia.
    await seedProgress(serie._id, [
      { anonymousId: 'leitor-dia-b', percent: 0.5, createdAt: dia1, updatedAt: dia1 },
    ]);
    // Leitor C: 1 doc, mas updatedAt em dia diferente de createdAt — a outra
    // aproximação do proxy (retomou a leitura do MESMO episódio noutro dia).
    await seedProgress(serie._id, [
      { anonymousId: 'leitor-dia-c', percent: 0.5, createdAt: dia1, updatedAt: dia2 },
    ]);

    const resultado = await recommendationService.computeRetencao(serie);
    expect(resultado.leitoresUnicos).toBe(3);
    // A e C contam como "outro dia"; B não → 2/3.
    expect(resultado.metricas.outroDiaComponente).toBeCloseTo(2 / 3, 10);
  });

  it('4) pesos 45/33/22: cada sub-métrica isolada em 1,0 produz exatamente peso×25 na retenção final', async () => {
    // Concluídos isolado — percent forçado a 0 via insert cru (decisão
    // sintética só para isolar a aritmética do peso; o validator do
    // Mongoose, que amarraria completed a percent>=0,9, não roda no insert
    // cru direto na collection).
    const serieConcluidos = await criarSerie({ title: 'Peso Concluidos' });
    const epConcluidos = await criarEpisodio(serieConcluidos._id, 1);
    await seedProgress(serieConcluidos._id, [
      { anonymousId: 'leitor-peso-concluidos', episodeId: epConcluidos._id, percent: 0, completed: true },
    ]);
    const resultadoConcluidos = await recommendationService.computeRetencao(serieConcluidos);
    expect(resultadoConcluidos.metricas.concluidosComponente).toBeCloseTo(1, 10);
    expect(resultadoConcluidos.metricas.percentualMedioComponente).toBe(0);
    expect(resultadoConcluidos.metricas.outroDiaComponente).toBe(0);
    expect(resultadoConcluidos.retencao).toBeCloseTo(0.45 * 25, 10);

    // Percentual médio isolado — sem Episode publicado (concluídos fica 0
    // por falta de denominador), percent 1 puro.
    const seriePercentual = await criarSerie({ title: 'Peso Percentual' });
    await seedProgress(seriePercentual._id, [
      { anonymousId: 'leitor-peso-percentual', percent: 1 },
    ]);
    const resultadoPercentual = await recommendationService.computeRetencao(seriePercentual);
    expect(resultadoPercentual.metricas.concluidosComponente).toBe(0);
    expect(resultadoPercentual.metricas.percentualMedioComponente).toBeCloseTo(1, 10);
    expect(resultadoPercentual.metricas.outroDiaComponente).toBe(0);
    expect(resultadoPercentual.retencao).toBeCloseTo(0.33 * 25, 10);

    // Outro dia isolado — sem Episode publicado, percent 0, 2 dias distintos.
    const serieOutroDia = await criarSerie({ title: 'Peso Outro Dia' });
    await seedProgress(serieOutroDia._id, [
      { anonymousId: 'leitor-peso-dia', percent: 0, createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-01') },
      { anonymousId: 'leitor-peso-dia', percent: 0, createdAt: new Date('2026-06-10'), updatedAt: new Date('2026-06-10') },
    ]);
    const resultadoOutroDia = await recommendationService.computeRetencao(serieOutroDia);
    expect(resultadoOutroDia.metricas.concluidosComponente).toBe(0);
    expect(resultadoOutroDia.metricas.percentualMedioComponente).toBe(0);
    expect(resultadoOutroDia.metricas.outroDiaComponente).toBeCloseTo(1, 10);
    expect(resultadoOutroDia.retencao).toBeCloseTo(0.22 * 25, 10);

    // Os 3 pesos somam a escala inteira: 45+33+22 = 100% de 25.
    expect(0.45 + 0.33 + 0.22).toBeCloseTo(1, 10);
  });

  it('5) sem nenhum leitor: retencao 0 e todas as sub-métricas finitas (sem dividir por zero)', async () => {
    const serie = await criarSerie({ title: 'Retencao Zero Leitores' });
    const resultado = await recommendationService.computeRetencao(serie);
    expect(resultado.leitoresUnicos).toBe(0);
    expect(resultado.retencao).toBe(0);
    Object.values(resultado.metricas).forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});

/**
 * Task 3: Penalizações (Etapa 9). Cada penalização isolada, threshold
 * inclusive/exclusive documentado, combinação multiplicativa, piso de 20% e
 * os dois casos-guia da spec ("obra sem leitor" e "flagged não conta como
 * atividade").
 */
describe('penalizacoes', () => {
  let mongoose;
  let Series;
  let ReadingProgress;
  let Episode;
  let EngagementEvent;
  let recommendationService;
  let seqEngagement;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    ReadingProgress = require('../../models/ReadingProgress');
    Episode = require('../../models/Episode');
    EngagementEvent = require('../../models/EngagementEvent');
    recommendationService = require('../../services/recommendationService');
    seqEngagement = 500000; // faixa dedicada — não colide com o seq de outros describes
  });

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Penalizacoes', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  function criarEpisodio(seriesId, episodeNumber, overrides = {}) {
    return Episode.create({
      seriesId, episode_number: episodeNumber, title: `Cap ${episodeNumber}`, status: 'published', ...overrides,
    });
  }

  async function seedProgress(seriesId, docs) {
    const prontos = docs.map((d) => ({
      seriesId,
      contentType: 'hiqua',
      position: 0,
      percent: d.percent,
      completed: Boolean(d.completed),
      episodeId: d.episodeId || new mongoose.Types.ObjectId(),
      ...(d.userId ? { userId: d.userId } : { anonymousId: d.anonymousId || `anon-${new mongoose.Types.ObjectId()}` }),
      createdAt: d.createdAt || new Date(),
      updatedAt: d.updatedAt || d.createdAt || new Date(),
    }));
    await ReadingProgress.collection.insertMany(prontos);
  }

  async function seedEngagement(seriesId, eventos) {
    const docs = eventos.map((e) => ({
      seq: seqEngagement++,
      type: e.type || 'view',
      seriesId,
      userId: e.userId,
      flagged: e.flagged || false,
      createdAt: e.createdAt || new Date(),
      prevHash: 'GENESIS',
      hash: `hash-penalizacoes-${seqEngagement}`,
    }));
    await EngagementEvent.collection.insertMany(docs);
  }

  describe('limiares isolados (funções puras — inclusive/exclusive documentado)', () => {
    it('retencao_baixa: 29,9% dispara, 30% exato NÃO dispara (exclusive)', () => {
      expect(recommendationService.retencaoEhBaixa(25 * 0.299)).toBe(true);
      expect(recommendationService.retencaoEhBaixa(25 * 0.30)).toBe(false);
    });

    it('abandono_rapido: 59,9% não dispara, 60% exato dispara (inclusive)', () => {
      expect(recommendationService.abandonoEhRapido(0.599)).toBe(false);
      expect(recommendationService.abandonoEhRapido(0.60)).toBe(true);
    });

    it('inatividade: 60 dias exatos NÃO dispara, 60,0001 dias dispara (exclusive); engajamento recente sempre blinda', () => {
      expect(recommendationService.estaInativa(60, false)).toBe(false);
      expect(recommendationService.estaInativa(60.0001, false)).toBe(true);
      expect(recommendationService.estaInativa(90, true)).toBe(false);
    });
  });

  it('retencao_baixa isolada (integração): retenção real abaixo de 30% dispara sozinha', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await criarSerie({ title: 'Penalizacao Retencao Baixa' });
    // Sem Episode publicado (concluídos=0 por falta de denominador — também
    // não aciona abandono_rapido, que exige episode_number=1 RESOLVIDO de um
    // Episode real). 1 leitor com percentual bem baixo → retencao ≈ 0,825 < 7,5.
    await seedProgress(serie._id, [{ anonymousId: 'leitor-retencao-baixa', percent: 0.10 }]);
    // Engajamento não-flagged só para NÃO acionar inatividade (sem Episode,
    // diasSemCapitulo=Infinity — precisa de atividade real para blindar
    // este teste da penalização de inatividade, que não é o alvo aqui).
    await seedEngagement(serie._id, [{ type: 'view' }]);

    const retencao = await recommendationService.computeRetencao(serie);
    expect(retencao.retencao).toBeLessThan(7.5);
    const penalizacoes = await recommendationService.computePenalizacoes(serie, {
      agora, retencao: retencao.retencao, leitoresUnicos: retencao.leitoresUnicos,
    });
    expect(penalizacoes).toEqual(['retencao_baixa']);
  });

  it('abandono_rapido isolado (integração): >=60% dos leitores presos no capítulo 1 com percent<0,25 dispara sozinho', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await criarSerie({ title: 'Penalizacao Abandono Rapido' });
    // createdAt injetado NA CRIAÇÃO (não via update depois — o plugin de
    // timestamps do Mongoose ignora `createdAt` em $set de updateMany/
    // updateOne/findOneAndUpdate, só respeita o valor passado no create()).
    const publicadoHa10Dias = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000);
    const ep1 = await criarEpisodio(serie._id, 1, { createdAt: publicadoHa10Dias });
    const ep2 = await criarEpisodio(serie._id, 2, { createdAt: publicadoHa10Dias });
    // Episódios publicados há 10 dias — blinda de inatividade.

    // 3 leitores (60%) presos no capítulo 1, percent baixo.
    for (let i = 0; i < 3; i++) {
      await seedProgress(serie._id, [{ anonymousId: `preso-${i}`, episodeId: ep1._id, percent: 0.10 }]);
    }
    // 2 leitores (40%) avançaram e completaram os 2 capítulos — mantém a
    // retenção geral acima do limiar de retencao_baixa (isolamento do teste).
    for (let i = 0; i < 2; i++) {
      const anonymousId = `avancado-${i}`;
      await seedProgress(serie._id, [
        { anonymousId, episodeId: ep1._id, percent: 0.95, completed: true },
        { anonymousId, episodeId: ep2._id, percent: 0.95, completed: true },
      ]);
    }

    const retencao = await recommendationService.computeRetencao(serie);
    const concluidosEsperado = 2 / 5;
    const percentualEsperado = (3 * 0.10 + 4 * 0.95) / 7;
    expect(retencao.retencao).toBeCloseTo((concluidosEsperado * 0.45 + percentualEsperado * 0.33) * 25, 8);
    expect(retencao.retencao).toBeGreaterThanOrEqual(7.5); // não é retencao_baixa — isolamento confirmado

    const penalizacoes = await recommendationService.computePenalizacoes(serie, {
      agora, retencao: retencao.retencao, leitoresUnicos: retencao.leitoresUnicos,
    });
    expect(penalizacoes).toEqual(['abandono_rapido']);
  });

  it('inatividade isolada (integração): >60 dias sem capítulo novo E sem engajamento dispara sozinha', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await criarSerie({ title: 'Penalizacao Inatividade' });
    // createdAt injetado NA CRIAÇÃO — mesmo motivo do teste de abandono acima.
    const publicadoHa90Dias = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
    const ep1 = await criarEpisodio(serie._id, 1, { createdAt: publicadoHa90Dias });
    const ep2 = await criarEpisodio(serie._id, 2, { createdAt: publicadoHa90Dias });

    // Leitores avançam pelos 2 capítulos (não presos no 1) com boa retenção.
    for (let i = 0; i < 3; i++) {
      const anonymousId = `leitor-inativa-${i}`;
      await seedProgress(serie._id, [
        { anonymousId, episodeId: ep1._id, percent: 0.95, completed: true },
        { anonymousId, episodeId: ep2._id, percent: 0.95, completed: true },
      ]);
    }
    // Nenhum EngagementEvent criado — sem atividade recente.

    const retencao = await recommendationService.computeRetencao(serie);
    expect(retencao.retencao).toBeCloseTo((1 * 0.45 + 0.95 * 0.33) * 25, 8);
    expect(retencao.retencao).toBeGreaterThanOrEqual(7.5);

    const penalizacoes = await recommendationService.computePenalizacoes(serie, {
      agora, retencao: retencao.retencao, leitoresUnicos: retencao.leitoresUnicos,
    });
    expect(penalizacoes).toEqual(['inatividade']);
  });

  it('flagged não conta como atividade para a inatividade: só evento flagged não blinda a penalização', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await criarSerie({ title: 'Penalizacao Inatividade Flagged' });
    await criarEpisodio(serie._id, 1, {
      createdAt: new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000),
    });
    // Único evento de engajamento é FLAGGED — P4 do ledger, não deve contar
    // como atividade real.
    await seedEngagement(serie._id, [{ type: 'view', flagged: true }]);

    const penalizacoes = await recommendationService.computePenalizacoes(serie, {
      agora, retencao: 25, leitoresUnicos: 0,
    });
    expect(penalizacoes).toEqual(['inatividade']);
  });

  it('obra sem nenhum leitor: sem penalização de retenção/abandono; inatividade ainda se aplica', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await criarSerie({ title: 'Penalizacao Sem Leitores' });
    await criarEpisodio(serie._id, 1, { createdAt: new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000) });
    // Nenhum ReadingProgress criado — leitoresUnicos = 0.

    const retencao = await recommendationService.computeRetencao(serie);
    expect(retencao.leitoresUnicos).toBe(0);
    expect(retencao.retencao).toBe(0); // sem dado — mas NÃO deve virar retencao_baixa (ver guarda abaixo)

    const penalizacoes = await recommendationService.computePenalizacoes(serie, {
      agora, retencao: retencao.retencao, leitoresUnicos: retencao.leitoresUnicos,
    });
    // Sem leitor algum: nem retencao_baixa nem abandono_rapido (não há dado
    // de comportamento real para julgar) — só inatividade, que independe de
    // leitores (é sobre publicação/engajamento).
    expect(penalizacoes).toEqual(['inatividade']);
  });

  describe('aplicarPenalizacoesNaSoma — composição multiplicativa e piso de 20%', () => {
    const soma = 53.7; // valor não-redondo, arbitrário dentro da escala 0–65 (Q+R+D)

    it('sem penalização: soma intacta', () => {
      expect(recommendationService.aplicarPenalizacoesNaSoma(soma, [])).toBe(soma);
    });

    it('uma penalização: multiplicador único', () => {
      expect(recommendationService.aplicarPenalizacoesNaSoma(soma, ['retencao_baixa'])).toBeCloseTo(soma * 0.80, 10);
    });

    it('duas penalizações compõem multiplicativamente (dois ×)', () => {
      expect(recommendationService.aplicarPenalizacoesNaSoma(soma, ['retencao_baixa', 'abandono_rapido']))
        .toBeCloseTo(soma * 0.80 * 0.85, 10);
    });

    it('as 3 penalizações reais compõem para 61,2% — ainda acima do piso de 20%, não clampa', () => {
      const resultado = recommendationService.aplicarPenalizacoesNaSoma(
        soma, ['retencao_baixa', 'abandono_rapido', 'inatividade'],
      );
      expect(resultado).toBeCloseTo(soma * 0.80 * 0.85 * 0.90, 10);
      expect(resultado).toBeGreaterThan(soma * 0.20); // o piso não é necessário aqui — ver comentário no serviço
    });

    it('piso de 20%: cenário sintético prova que o piso segura quando o produto cairia abaixo dele (hoje só existem 3 códigos reais, cujo produto — 61,2% — nunca precisa do piso)', () => {
      const codigosSinteticos = Array(8).fill('retencao_baixa'); // 0,8^8 ≈ 16,78% < 20%
      expect(recommendationService.aplicarPenalizacoesNaSoma(soma, codigosSinteticos)).toBeCloseTo(soma * 0.20, 10);
    });
  });

  it('computeSeriesScore grava retencao e penalizacoes no doc (integração completa)', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await criarSerie({ title: 'SeriesScore Retencao Penalizacoes' });
    const ep1 = await criarEpisodio(serie._id, 1, {
      createdAt: new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000),
    });
    // percent 0,95 (não 0,62: sozinho como único sub-componente >0,
    // 0,62×0,33×25=5,115 cairia abaixo do limiar de retencao_baixa de 7,5 e
    // contaminaria o isolamento deste teste — o alvo aqui é só inatividade).
    await seedProgress(serie._id, [{ anonymousId: 'leitor-doc-final', episodeId: ep1._id, percent: 0.95 }]);
    // Sem engajamento → inatividade dispara (episódio de 90 dias).

    const doc = await recommendationService.computeSeriesScore(serie._id, { agora });
    expect(doc.retencao).toBeCloseTo(0.95 * 0.33 * 25, 8);
    expect(doc.penalizacoes).toEqual(['inatividade']);
  });
});
