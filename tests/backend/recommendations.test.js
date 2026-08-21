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
    // Item 1 do fix round: o denominador agora é leitoresLogados — 1 leitor
    // ANÔNIMO não bastaria mais (daria 0/0 blindado, não 3/1). Semeia 1
    // leitor LOGADO pra manter o denominador 1, provando só a lógica de
    // releitura/flagged (o que este teste sempre existiu pra provar).
    await seedLeitoresLogados(serie._id, 1, 'hiqua');

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
    // 3 eventos não-flagged do mesmo usuário, 1 leitor logado → (3-1)/1 = 2.
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
    const agora1 = new Date('2026-08-20T10:00:00.000Z');
    // createdAt injetado 6 dias antes de agora1 (Task 4: Descoberta) — a
    // série é "recém-criada" DE PROPÓSITO, para exercitar o RULING da
    // inatividade (ledger, fim da T3) abaixo: obra sem episódio mas NOVA não
    // é abandono.
    const criadaEm = new Date(agora1.getTime() - 6 * 24 * 60 * 60 * 1000);
    const serie = await criarSerie({ title: 'Upsert SeriesScore', content_type: tipo, createdAt: criadaEm });
    const leitores = await seedLeitoresLogados(serie._id, 5, tipo);
    await seedFavoritos(serie._id, leitores.slice(0, 1));

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
    // Descoberta (Task 4): 6 dias de idade <= 30 -> faixa mais nova, 10 pts.
    expect(doc1.descoberta).toBe(10);
    // Confidence (Task 4): n/(n+20) com n=5 leitores únicos — exato, não
    // depende do contexto de normalização compartilhado por este describe.
    expect(doc1.confidence).toBeCloseTo(5 / 25, 10);
    // Potential (Task 4): depende do máximo do content_type, que este
    // describe polui com outros testes rodados antes deste (mesmo motivo de
    // "qualidade" acima não ter valor exato) — só a faixa e a finitude são
    // verificáveis aqui; o valor exato é coberto pelo describe "potential".
    expect(Number.isFinite(doc1.potentialScore)).toBe(true);
    expect(doc1.potentialScore).toBeGreaterThanOrEqual(0);
    expect(doc1.potentialScore).toBeLessThanOrEqual(100);
    // RULING da inatividade (ledger, fim da T3): série SEM episódio mas
    // RECÉM-CRIADA (6 dias, não >60) não é abandono — é obra nova vazia.
    // Também não é retencao_baixa (7,84 > 7,5 = 30% de 25) nem
    // abandono_rapido (episodeId não resolve para nenhum Episode real,
    // então não há leitor "preso" no capítulo 1 comprovado). Antes desta
    // task, série sem episódio penalizava trivialmente por dias=Infinity —
    // o ruling da T4 corrigiu isso (ver coletarSinaisInatividade no serviço).
    expect(doc1.penalizacoes).toEqual([]);
    // Sem penalização: scoreFinal é só a reescala de Q+R+D — confere com a
    // função pura de composição usando os próprios componentes do doc.
    expect(doc1.scoreFinal).toBeCloseTo(
      recommendationService.computeScoreFinal(doc1.qualidade, doc1.retencao, doc1.descoberta, doc1.penalizacoes),
      8,
    );
    expect(doc1.scoreFinal).toBeGreaterThanOrEqual(0);
    expect(doc1.scoreFinal).toBeLessThanOrEqual(100);

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

  /**
   * Achado ALTO A1 da revisão FINAL do Bloco 4 (fix round): o denominador
   * das 4 métricas era `leitoresUnicos` (logados+anônimos), mas os
   * numeradores são estruturalmente só-logados (Favorite/SeriesVote exigem
   * token; SR exige userId real no checkout; releituras já são por userId).
   * Progresso ANÔNIMO é grátis (sem `accountLimiter`, sem token) — inflar o
   * denominador com ele só diluía a taxa, sem nenhuma ação real por trás:
   * uma obra com MAIS visitantes anônimos que uma obra idêntica em
   * comportamento logado acabava PIOR na Qualidade, uma realimentação
   * negativa orgânica. RULING: denominador vira `leitoresUserIds.length`
   * (logados) para as 4 métricas da Qualidade — MESMA população dos
   * numeradores. `leitoresUnicos` (logados+anônimos) CONTINUA persistido e
   * usado no Confidence Score — só o denominador INTERNO da Qualidade
   * mudou. Ver `computeMetricasBrutas` em services/recommendationService.js.
   */
  describe('denominador logado (Item 1, fix round da revisão final)', () => {
    it('cenário MEDIDO da revisão: obra com 27 anônimos A MAIS que uma obra idêntica em comportamento logado tem a MESMA qualidade (anônimos não diluem mais o denominador)', async () => {
      const tipo = 'hqcine';
      const serieA = await criarSerie({ title: 'Denominador Logado A (27 anonimos extra)', content_type: tipo });
      const serieB = await criarSerie({ title: 'Denominador Logado B (sem anonimos)', content_type: tipo });

      // Obra A: 3 leitores logados, TODOS favoritam e curtem, MAIS 27
      // leitores anônimos que só leram (nenhuma ação, progresso grátis).
      const leitoresA = await seedLeitoresLogados(serieA._id, 3, tipo);
      await seedFavoritos(serieA._id, leitoresA);
      await seedVotos(serieA._id, { likesUserIds: leitoresA });
      await seedLeitoresAnonimos(serieA._id, 27, tipo);

      // Obra B: EXATAMENTE o mesmo comportamento logado (3 leitores, todos
      // favoritam e curtem), SEM nenhum leitor anônimo.
      const leitoresB = await seedLeitoresLogados(serieB._id, 3, tipo);
      await seedFavoritos(serieB._id, leitoresB);
      await seedVotos(serieB._id, { likesUserIds: leitoresB });

      const contexto = await recommendationService.buildQualidadeContexto();
      const resultadoA = await recommendationService.computeQualidade(serieA, contexto);
      const resultadoB = await recommendationService.computeQualidade(serieB, contexto);

      // Denominador agora é leitoresLogados (3 nas duas) — taxas idênticas,
      // apesar dos 27 anônimos extras de A.
      expect(resultadoA.metricas.favoritosPorLeitor).toBeCloseTo(1, 10);
      expect(resultadoB.metricas.favoritosPorLeitor).toBeCloseTo(1, 10);
      expect(resultadoA.metricas.likesPorLeitor).toBeCloseTo(1, 10);
      expect(resultadoB.metricas.likesPorLeitor).toBeCloseTo(1, 10);
      expect(resultadoA.qualidade).toBeCloseTo(resultadoB.qualidade, 10);

      // Anônimos SEGUEM contando em leitoresUnicos — só o denominador
      // INTERNO da Qualidade parou de contá-los.
      expect(resultadoA.leitoresUnicos).toBe(30); // 3 logados + 27 anônimos
      expect(resultadoB.leitoresUnicos).toBe(3);

      // leitoresUnicos (com anônimos) segue persistido e alimentando o
      // Confidence Score normalmente — A tem mais confiança que B por ter
      // mais identidades de leitura, mesmo com Qualidade igual.
      const scoreA = await recommendationService.computeSeriesScore(serieA._id);
      const scoreB = await recommendationService.computeSeriesScore(serieB._id);
      expect(scoreA.leitoresUnicos).toBe(30);
      expect(scoreB.leitoresUnicos).toBe(3);
      expect(scoreA.confidence).toBeCloseTo(30 / (30 + 20), 10);
      expect(scoreB.confidence).toBeCloseTo(3 / (3 + 20), 10);
      expect(scoreA.confidence).toBeGreaterThan(scoreB.confidence);
    });

    it('zero leitores LOGADOS mas com leitores anônimos: as 4 métricas ficam 0 (sem dividir por zero), leitoresUnicos reflete os anônimos', async () => {
      const serie = await criarSerie({ title: 'Zero Logados Com Anonimos' });
      await seedLeitoresAnonimos(serie._id, 10, 'hiqua');

      const resultado = await recommendationService.computeQualidade(serie, {});
      expect(resultado.leitoresUnicos).toBe(10);
      expect(resultado.qualidade).toBe(0);
      expect(resultado.metricas.superReaderPorLeitor).toBe(0);
      expect(resultado.metricas.favoritosPorLeitor).toBe(0);
      expect(resultado.metricas.likesPorLeitor).toBe(0);
      expect(resultado.metricas.releiturasPorLeitor).toBe(0);
      Object.values(resultado.metricas).forEach((v) => expect(Number.isFinite(v)).toBe(true));
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

/**
 * Task 4: Descoberta (0–10, Etapa 6 do PDF — bônus de novidade por idade da
 * obra) + o RULING da inatividade decidido no fim da T3 (ledger): série SEM
 * episódio usa a idade da PRÓPRIA série como "dias sem capítulo" (não mais
 * `Infinity` trivial) — obra nova vazia não é penalizada; obra antiga vazia
 * (>60 dias, nunca publicou nada) é abandono real.
 *
 * `computeDescoberta` é síncrona/pura (só faz aritmética de datas sobre um
 * `serie` já carregado) — os testes de fronteira não tocam o banco.
 */
describe('descoberta', () => {
  let recommendationService;
  let Series;
  const DIA_MS = 24 * 60 * 60 * 1000;
  const criadoEm = new Date('2026-01-01T00:00:00.000Z');

  beforeAll(() => {
    recommendationService = require('../../services/recommendationService');
    Series = require('../../models/Series');
  });

  function descobertaApos(dias) {
    const agora = new Date(criadoEm.getTime() + dias * DIA_MS);
    return recommendationService.computeDescoberta({ createdAt: criadoEm }, agora);
  }

  it('idade dentro de cada uma das 4 faixas: 10 / 7 / 4 / 0 pts', () => {
    expect(descobertaApos(0)).toBe(10);      // obra recém-criada
    expect(descobertaApos(45)).toBe(7);      // 31-60 dias
    expect(descobertaApos(75)).toBe(4);      // 61-90 dias
    expect(descobertaApos(365.5)).toBe(0);   // bem depois da última faixa, valor não-redondo
  });

  it('fronteira 30/31 dias: dia 30 exato ainda vale 10, dia 31 já cai para 7', () => {
    expect(descobertaApos(30)).toBe(10);
    expect(descobertaApos(31)).toBe(7);
  });

  it('fronteira 60/61 dias: dia 60 exato ainda vale 7, dia 61 já cai para 4', () => {
    expect(descobertaApos(60)).toBe(7);
    expect(descobertaApos(61)).toBe(4);
  });

  it('fronteira 90/91 dias: dia 90 exato ainda vale 4, dia 91 já cai para 0', () => {
    expect(descobertaApos(90)).toBe(4);
    expect(descobertaApos(91)).toBe(0);
  });

  describe('ruling da inatividade pós-T3: série SEM episódio publicado', () => {
    it('criada há 61 dias sem nenhum episódio: inatividade DISPARA (obra antiga vazia = abandono real)', async () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const serie = await Series.create({
        title: 'Ruling Inatividade 61 Dias', genre: 'Teste', content_type: 'hiqua',
        isPublished: true, createdAt: new Date(agora.getTime() - 61 * DIA_MS),
      });

      const penalizacoes = await recommendationService.computePenalizacoes(serie, {
        agora, retencao: 0, leitoresUnicos: 0,
      });
      expect(penalizacoes).toEqual(['inatividade']);
    });

    it('criada há 5 dias sem nenhum episódio: inatividade NÃO dispara (obra nova vazia)', async () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const serie = await Series.create({
        title: 'Ruling Inatividade 5 Dias', genre: 'Teste', content_type: 'hiqua',
        isPublished: true, createdAt: new Date(agora.getTime() - 5 * DIA_MS),
      });

      const penalizacoes = await recommendationService.computePenalizacoes(serie, {
        agora, retencao: 0, leitoresUnicos: 0,
      });
      expect(penalizacoes).toEqual([]);
    });

    it('interação descoberta×inatividade: obra de 20 dias sem episódio tem descoberta 10 E inatividade NÃO dispara', async () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const serie = await Series.create({
        title: 'Descoberta Interacao Inatividade', genre: 'Teste', content_type: 'hiqua',
        isPublished: true, createdAt: new Date(agora.getTime() - 20 * DIA_MS),
      });

      expect(recommendationService.computeDescoberta(serie, agora)).toBe(10);

      const penalizacoes = await recommendationService.computePenalizacoes(serie, {
        agora, retencao: 0, leitoresUnicos: 0,
      });
      expect(penalizacoes).not.toContain('inatividade');
    });
  });
});

/**
 * Task 4: Potential Score (0–100, Etapa 7 do PDF) — Likes/leitor 25% ·
 * Favoritos/leitor 25% · Super Reader/leitor 30% · Retenção 20%. Reaproveita
 * as MESMAS métricas por-leitor-único da Qualidade (com o gate de leitura
 * real da T2 embutido em computeMetricasBrutas), normalizadas pelo mesmo
 * `contexto` da Qualidade.
 *
 * Único describe do arquivo que limpa o banco entre os testes: a
 * normalização por máximo do content_type precisa de um catálogo
 * controlado para os valores exatos (30 pts / 60 pts) serem verificáveis —
 * sem isso, série de describes anteriores (qualidade/retencao/penalizacoes)
 * poluiriam o máximo, como já documentado no teste 7 do describe
 * "qualidade proporcional" (que por isso só verifica finitude/faixa, não
 * valor exato).
 */
describe('potential', () => {
  let mongoose;
  let Series;
  let ReadingProgress;
  let Favorite;
  let SeriesVote;
  let SuperReaderContribution;
  let recommendationService;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    ReadingProgress = require('../../models/ReadingProgress');
    Favorite = require('../../models/Favorite');
    SeriesVote = require('../../models/SeriesVote');
    SuperReaderContribution = require('../../models/SuperReaderContribution');
    recommendationService = require('../../services/recommendationService');
  });

  beforeEach(() => db.clearDatabase());

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Potential', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  async function seedLeitoresLogados(seriesId, quantidade, contentType = 'hiqua') {
    const userIds = Array.from({ length: quantidade }, () => new mongoose.Types.ObjectId());
    const docs = userIds.map((userId) => ({
      userId, seriesId, episodeId: new mongoose.Types.ObjectId(), contentType,
      position: 0, percent: 0.9, completed: false, createdAt: new Date(), updatedAt: new Date(),
    }));
    await ReadingProgress.collection.insertMany(docs);
    return userIds;
  }

  async function seedFavoritos(seriesId, userIds) {
    const docs = userIds.map((userId) => ({ userId, seriesId, createdAt: new Date(), updatedAt: new Date() }));
    if (docs.length) await Favorite.collection.insertMany(docs);
  }

  async function seedVotos(seriesId, likesUserIds) {
    const docs = likesUserIds.map((userId) => ({ userId, seriesId, type: 'like', createdAt: new Date() }));
    if (docs.length) await SeriesVote.collection.insertMany(docs);
  }

  async function seedSuperReader(seriesId, quantidade) {
    const docs = Array.from({ length: quantidade }, (_, i) => ({
      seriesId, userId: null, channelId: new mongoose.Types.ObjectId(), amountCents: 500, currency: 'brl',
      authorShareCents: 400, platformShareCents: 100,
      stripeSessionId: `cs_test_potential_${seriesId}_${i}_${new mongoose.Types.ObjectId()}`,
      period: '2026-08', createdAt: new Date(), updatedAt: new Date(),
    }));
    if (docs.length) await SuperReaderContribution.collection.insertMany(docs);
  }

  it('obra só-com-SR de taxa máxima do tipo: componente SR sozinho vale exatamente 30 pts (peso 30%)', async () => {
    const serie = await criarSerie({ title: 'Potential SR Maximo', content_type: 'vcine' });
    await seedLeitoresLogados(serie._id, 4, 'vcine');
    await seedSuperReader(serie._id, 20); // 20/4 = 5,0 por leitor — única série do tipo (banco limpo), é o próprio máximo

    const contexto = await recommendationService.buildQualidadeContexto();
    // retencaoPontos 0 isola o componente SR (sem contribuição da Retenção).
    const potential = await recommendationService.computePotential(serie, contexto, 0);

    expect(potential).toBeCloseTo(0.30 * 100, 8);
  });

  it('pesos 25/25/30/20 somam corretamente numa obra com componentes mistos (SR ausente, retenção parcial)', async () => {
    const serie = await criarSerie({ title: 'Potential Pesos Mistos', content_type: 'vcine' });
    const leitores = await seedLeitoresLogados(serie._id, 4, 'vcine');
    await seedFavoritos(serie._id, leitores.slice(0, 2)); // 2/4 = 0,5/leitor — única série do tipo, próprio máximo
    await seedVotos(serie._id, leitores.slice(0, 1)); // 1/4 = 0,25/leitor — idem
    // SR ausente de propósito (componente 0).

    const contexto = await recommendationService.buildQualidadeContexto();
    const retencaoPontos = 12.5; // metade da escala (25) → fração 0,5
    const potential = await recommendationService.computePotential(serie, contexto, retencaoPontos);

    // likesNorm=1.0 (único do tipo) × 25% + favoritosNorm=1.0 × 25% + SR 0 × 30% + retenção 0,5 × 20% = 60.
    expect(potential).toBeCloseTo((1.0 * 0.25 + 1.0 * 0.25 + 0 * 0.30 + 0.5 * 0.20) * 100, 8);
  });

  it('gate de leitura vale no potential: favoritos de contas que nunca leram não inflam o máximo nem entram na própria taxa', async () => {
    const tipo = 'hiqua';
    const serieHonesta = await criarSerie({ title: 'Potential Honesta', content_type: tipo });
    const serieAtacada = await criarSerie({ title: 'Potential Atacada', content_type: tipo });

    const leitoresHonesta = await seedLeitoresLogados(serieHonesta._id, 10, tipo);
    await seedFavoritos(serieHonesta._id, leitoresHonesta.slice(0, 3)); // 0,3/leitor real

    await seedLeitoresLogados(serieAtacada._id, 1, tipo); // 1 leitor real, nenhum favorita
    const contasFalsas = Array.from({ length: 50 }, () => new mongoose.Types.ObjectId());
    await seedFavoritos(serieAtacada._id, contasFalsas); // 50 favoritos de quem NUNCA leu a obra

    const contexto = await recommendationService.buildQualidadeContexto();
    const potentialHonesta = await recommendationService.computePotential(serieHonesta, contexto, 0);
    const potentialAtacada = await recommendationService.computePotential(serieAtacada, contexto, 0);

    // Sem o gate, os 50 favoritos fabricados dominariam o máximo do tipo
    // (50/1=50) e suprimiriam quase a zero o componente favoritos da obra
    // honesta. Com o gate, os 50 não contam: a atacada fica em 0 (nenhum
    // outro componente foi semeado) e a honesta normaliza para 1.0 (é o
    // próprio máximo real do tipo).
    expect(potentialAtacada).toBe(0);
    expect(potentialHonesta).toBeCloseTo(0.25 * 100, 8);
  });
});

/**
 * Task 4: Confidence Score (0–1, Etapa 12 do PDF) — `n/(n+20)`. Função pura,
 * sem I/O — nenhum teste deste describe toca o banco.
 */
describe('confidence', () => {
  let recommendationService;

  beforeAll(() => {
    recommendationService = require('../../services/recommendationService');
  });

  it('n=0 leitores: confidence 0 (sem leitor, sem confiança nenhuma)', () => {
    expect(recommendationService.computeConfidence(0)).toBe(0);
  });

  it('n=20 leitores (=K): confidence exatamente 0,5 (meia-confiança, por definição de K)', () => {
    expect(recommendationService.computeConfidence(20)).toBe(0.5);
  });

  it('n=180 leitores: confidence 0,9', () => {
    expect(recommendationService.computeConfidence(180)).toBeCloseTo(0.9, 10);
  });

  it('monotônica: mais leitores nunca reduz a confiança', () => {
    const amostras = [0, 1, 5, 19, 20, 21, 37, 100, 180, 1000];
    for (let i = 1; i < amostras.length; i++) {
      expect(recommendationService.computeConfidence(amostras[i]))
        .toBeGreaterThan(recommendationService.computeConfidence(amostras[i - 1]));
    }
  });

  it('nunca atinge 1 (assíntota), mesmo com leitores muito acima de K', () => {
    expect(recommendationService.computeConfidence(1000000)).toBeLessThan(1);
  });
});

/**
 * Task 4: composição final — `scoreFinal = (qualidade+retencao+descoberta)/
 * 65×100`, penalizações aplicadas SOBRE a soma crua ANTES de reescalar
 * (`computeScoreFinal`, função pura) — e `computeAllScores` com o resumo
 * `{ total, erros }` (erro de uma série não impede as outras).
 */
describe('composicao', () => {
  let Series;
  let SeriesScore;
  let recommendationService;

  beforeAll(() => {
    Series = require('../../models/Series');
    SeriesScore = require('../../models/SeriesScore');
    recommendationService = require('../../services/recommendationService');
  });

  // Mesmo motivo do describe "potential" acima: computeAllScores varre TODAS
  // as séries publicadas do banco — sem limpar, sobras de describes
  // anteriores inflariam o `total` do resumo testado abaixo. Inofensivo para
  // os testes puros de computeScoreFinal (não tocam o banco).
  beforeEach(() => db.clearDatabase());

  describe('computeScoreFinal — componentes conhecidos (função pura, sem banco)', () => {
    it('sem penalização: scoreFinal = (Q+R+D)/65×100 exato', () => {
      const qualidade = 18.7;
      const retencao = 14.3;
      const descoberta = 7;
      const esperado = ((qualidade + retencao + descoberta) / 65) * 100;
      expect(recommendationService.computeScoreFinal(qualidade, retencao, descoberta, [])).toBeCloseTo(esperado, 10);
    });

    it('com penalização: o multiplicador é aplicado SOBRE a soma crua, ANTES de reescalar', () => {
      const qualidade = 20.4;
      const retencao = 10.1;
      const descoberta = 4;
      const somaCrua = qualidade + retencao + descoberta;

      const semPenalizacao = recommendationService.computeScoreFinal(qualidade, retencao, descoberta, []);
      const comPenalizacao = recommendationService.computeScoreFinal(qualidade, retencao, descoberta, ['retencao_baixa']);

      expect(comPenalizacao).toBeLessThan(semPenalizacao);
      expect(comPenalizacao).toBeCloseTo(semPenalizacao * 0.80, 10);
      // Confirma a ORDEM: multiplicador sobre a soma crua, só depois reescala.
      expect(comPenalizacao).toBeCloseTo(((somaCrua * 0.80) / 65) * 100, 10);
    });

    it('piso de 20% também vale reescalado (cenário sintético com muitas penalizações)', () => {
      const codigosSinteticos = Array(8).fill('retencao_baixa'); // 0,8^8 ≈ 16,78% < 20%
      const resultado = recommendationService.computeScoreFinal(30, 25, 10, codigosSinteticos);
      expect(resultado).toBeCloseTo(20, 8); // piso de 20% da soma máxima (65) reescalado = 20% de 100
    });

    it('0 ≤ scoreFinal ≤ 100 sempre, mesmo nos extremos (Number.isFinite)', () => {
      expect(recommendationService.computeScoreFinal(0, 0, 0, [])).toBe(0);
      expect(recommendationService.computeScoreFinal(30, 25, 10, [])).toBeCloseTo(100, 8);
      [0, 18.3, 42.9, 65].forEach((somaCrua) => {
        const resultado = recommendationService.computeScoreFinal(somaCrua, 0, 0, []);
        expect(Number.isFinite(resultado)).toBe(true);
        expect(resultado).toBeGreaterThanOrEqual(0);
        expect(resultado).toBeLessThanOrEqual(100);
      });
    });
  });

  it('computeSeriesScore: scoreFinal do doc bate com a fórmula aplicada aos próprios componentes gravados (integração)', async () => {
    const agora = new Date('2026-08-20T00:00:00.000Z');
    const serie = await Series.create({
      title: 'Composicao Integracao', genre: 'Teste', content_type: 'hiqua', isPublished: true,
      createdAt: new Date(agora.getTime() - 45 * 24 * 60 * 60 * 1000), // 45 dias — descoberta = 7 (faixa 31-60)
    });

    const doc = await recommendationService.computeSeriesScore(serie._id, { agora });

    expect(doc.descoberta).toBe(7);
    const esperado = recommendationService.computeScoreFinal(doc.qualidade, doc.retencao, doc.descoberta, doc.penalizacoes);
    expect(doc.scoreFinal).toBeCloseTo(esperado, 8);
    expect(Number.isFinite(doc.scoreFinal)).toBe(true);
    expect(doc.scoreFinal).toBeGreaterThanOrEqual(0);
    expect(doc.scoreFinal).toBeLessThanOrEqual(100);
    expect(doc.confidence).toBe(0); // leitoresUnicos 0 → n/(n+20) = 0
    expect(doc.potentialScore).toBeGreaterThanOrEqual(0);
    expect(doc.potentialScore).toBeLessThanOrEqual(100);
  });

  describe('computeAllScores', () => {
    it('resumo { total, erros }: 3 publicadas + 1 despublicada → total 3, gera 3 docs; erro numa não impede as outras', async () => {
      const tipo = 'hiqua';
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const serie1 = await Series.create({ title: 'AllScores 1', genre: 'Teste', content_type: tipo, isPublished: true });
      const serieComErro = await Series.create({ title: 'AllScores ComErro', genre: 'Teste', content_type: tipo, isPublished: true });
      const serie3 = await Series.create({ title: 'AllScores 3', genre: 'Teste', content_type: tipo, isPublished: true });
      await Series.create({ title: 'AllScores Despublicada', genre: 'Teste', content_type: tipo, isPublished: false });

      const original = SeriesScore.findOneAndUpdate.bind(SeriesScore);
      const spy = vi.spyOn(SeriesScore, 'findOneAndUpdate').mockImplementation((filtro, ...resto) => {
        if (filtro && String(filtro.seriesId) === String(serieComErro._id)) {
          return Promise.reject(new Error('Falha simulada de escrita'));
        }
        return original(filtro, ...resto);
      });

      let resumo;
      try {
        resumo = await recommendationService.computeAllScores({ agora });
      } finally {
        spy.mockRestore();
      }

      expect(resumo).toEqual({ total: 3, erros: 1 });

      const docs = await SeriesScore.find({ seriesId: { $in: [serie1._id, serieComErro._id, serie3._id] } });
      expect(docs).toHaveLength(2); // serieComErro não gerou doc; as outras duas sim
    });
  });
});

/**
 * Task 5: gatilhos fire-and-forget de recálculo (Etapa 11 do PDF) + varredura
 * periódica de 24h. Mesmo molde do disparo de push do Bloco 2
 * (routes/content.js, `notifyEpisodePublished(...).catch(err => logger.error(...))`):
 * fire-and-forget DEPOIS do efeito principal, nunca lança, nunca muda
 * status/shape da resposta da rota. Ver services/recommendationService.js —
 * `dispararRecalculo`, `iniciarVarreduraPeriodica`, `pararVarreduraPeriodica`.
 *
 * DECISÃO DO GATILHO "view/read" (Etapa 11 do PDF menciona releitura/view
 * entre os gatilhos): propositalmente SEM teste/implementação de disparo
 * síncrono aqui — routes/content.js (GET /episodes/:id) documenta a decisão
 * no próprio ponto onde o engagementLogger é chamado: é a rota de maior
 * volume do backend (toda abertura de episódio) e mesmo um cheque barato de
 * "computedAt > 1h" seria uma query a mais na rota mais quente do app, por
 * um ganho marginal. Os outros 5 gatilhos cobrem os sinais fortes; a
 * varredura de 24h absorve a deriva orgânica de views/releituras.
 */
describe('neutro derivado exclui obras ja consumidas', () => {
  beforeEach(() => db.clearDatabase());

  it('leitor que leu quase todo o acervo tagueado: obra sem tags NAO fica acima da melhor tagueada ainda nao lida', async () => {
    const recommendationService = require('../../services/recommendationService');
    const Series = require('../../models/Series');
    const ReadingProgress = require('../../models/ReadingProgress');
    const Episode = require('../../models/Episode');
    const mongoose = require('mongoose');

    // 4 obras de terror tagueadas + 1 sem tags, mesmo tipo.
    const tagueadas = [];
    for (let i = 0; i < 4; i++) {
      tagueadas.push(await Series.create({
        title: `Terror Patologico ${i}`, genre: 'Terror', content_type: 'hiqua',
        isPublished: true, tags: ['terror', 'sobrenatural', 'suspense', 'noir', `unica${i}`],
      }));
    }
    const semTags = await Series.create({
      title: 'Legado Patologico', genre: 'Legado', content_type: 'hiqua', isPublished: true,
    });

    // O leitor anonimo leu 3 das 4 tagueadas (a 4a e a "melhor nao lida").
    const anonymousId = '99999999-8888-4777-a666-555555555555';
    for (const serie of tagueadas.slice(0, 3)) {
      const ep = await Episode.create({
        seriesId: serie._id, episode_number: 1, title: 'Cap 1', duration: 300,
        panels: [{ image_url: 'https://exemplo.local/p.png', order: 0 }],
      });
      await ReadingProgress.create({
        anonymousId, seriesId: serie._id, episodeId: ep._id,
        contentType: 'hiqua', percent: 0.95, position: 285,
      });
    }

    const { perfil, seriesConsumidas } = await recommendationService.computeAffinityProfileCompleto({ anonymousId });
    expect(seriesConsumidas.size).toBe(3);

    const todas = await Series.find({ content_type: 'hiqua', isPublished: true }).lean();
    const neutro = recommendationService.computeNeutroDerivado(todas, perfil, seriesConsumidas);
    const naoLida = todas.find((s) => String(s._id) === String(tagueadas[3]._id));
    const afinidadeNaoLida = recommendationService.computeAfinidade(naoLida, perfil);

    // O neutro vem SO da nao lida (as 3 consumidas ficam fora da media) —
    // igual, nunca acima, da melhor obra tagueada que o leitor ainda nao leu.
    expect(neutro).toBeCloseTo(afinidadeNaoLida, 10);
    expect(neutro).toBeLessThanOrEqual(afinidadeNaoLida + 1e-9);

    // Sem a exclusao (media completa, comportamento antigo), o neutro ficaria
    // ACIMA da nao lida — e o que este teste impede de regredir.
    const neutroAntigo = recommendationService.computeNeutroDerivado(todas, perfil, null);
    expect(neutroAntigo).toBeGreaterThan(afinidadeNaoLida);
  });

  it('leitor que leu TODAS as tagueadas: cai na media completa (unico sinal disponivel)', async () => {
    const recommendationService = require('../../services/recommendationService');
    const Series = require('../../models/Series');
    const ReadingProgress = require('../../models/ReadingProgress');
    const Episode = require('../../models/Episode');

    const serie = await Series.create({
      title: 'Unica Tagueada', genre: 'Terror', content_type: 'hiqua',
      isPublished: true, tags: ['terror', 'sobrenatural', 'suspense', 'noir', 'gotico'],
    });
    const ep = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap 1', duration: 300,
      panels: [{ image_url: 'https://exemplo.local/p.png', order: 0 }],
    });
    const anonymousId = '99999999-8888-4777-a666-444444444444';
    await ReadingProgress.create({
      anonymousId, seriesId: serie._id, episodeId: ep._id,
      contentType: 'hiqua', percent: 0.95, position: 285,
    });

    const { perfil, seriesConsumidas } = await recommendationService.computeAffinityProfileCompleto({ anonymousId });
    const todas = await Series.find({ content_type: 'hiqua', isPublished: true }).lean();
    const neutro = recommendationService.computeNeutroDerivado(todas, perfil, seriesConsumidas);
    // Todas as tagueadas consumidas -> fallback para a media completa (a propria serie lida).
    expect(neutro).toBeCloseTo(recommendationService.computeAfinidade(todas.find((s) => (s.tags || []).length > 0), perfil), 10);
  });
});

describe('buildQualidadeContexto com filtro de tipo', () => {
  it('filtrado por content_type devolve os MESMOS maximos do tipo que a varredura completa (achado da revisao da T8)', async () => {
    const recommendationService = require('../../services/recommendationService');
    const completo = await recommendationService.buildQualidadeContexto();
    const soHiqua = await recommendationService.buildQualidadeContexto('hiqua');
    // O filtro corta a varredura, nunca o resultado: para o tipo pedido, os
    // maximos sao identicos aos da varredura completa; outros tipos nao vem.
    if (completo.hiqua) {
      expect(soHiqua.hiqua).toEqual(completo.hiqua);
    }
    // 'porSerie' (Item 4 do fix round) e a unica chave extra ao lado dos
    // content_types de verdade — nao deve ser confundida com um deles.
    for (const tipo of Object.keys(soHiqua)) {
      if (tipo === 'porSerie') continue;
      expect(tipo).toBe('hiqua');
    }
  });

  it('porSerie (Item 4 do fix round): so inclui series do tipo filtrado, com as metricas ja calculadas dessa serie', async () => {
    const Series = require('../../models/Series');
    const recommendationService = require('../../services/recommendationService');
    const serieHiqua = await Series.create({ title: 'PorSerie Hiqua', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    const serieVcine = await Series.create({ title: 'PorSerie Vcine', genre: 'Teste', content_type: 'vcine', isPublished: true });

    const soHiqua = await recommendationService.buildQualidadeContexto('hiqua');
    expect(soHiqua.porSerie[String(serieHiqua._id)]).toBeDefined();
    expect(soHiqua.porSerie[String(serieHiqua._id)].leitoresUnicos).toBe(0);
    expect(soHiqua.porSerie[String(serieVcine._id)]).toBeUndefined();
  });
});

/**
 * Item 4 (M2) do fix round da revisão final: `computeQualidade` e
 * `computePotential` reusam `contexto.porSerie` (populado por
 * `buildQualidadeContexto`) em vez de recomputar `computeMetricasBrutas` da
 * PRÓPRIA série de novo — elimina 2 recomputações redundantes por gatilho.
 * `computeMetricasBrutas` não é exportado, então a prova é INJETAR um
 * `porSerie` com valores DIFERENTES dos reais no banco: se a função usasse o
 * banco (recomputando), veria os valores REAIS; se reusa o contexto, vê os
 * valores INJETADOS — o teste distingue os dois casos por esse contraste.
 */
describe('reuso de metricas via contexto.porSerie (Item 4, fix round da revisao final)', () => {
  let mongoose;
  let Series;
  let ReadingProgress;
  let Favorite;
  let recommendationService;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    ReadingProgress = require('../../models/ReadingProgress');
    Favorite = require('../../models/Favorite');
    recommendationService = require('../../services/recommendationService');
  });

  async function seedLeitoresLogados(seriesId, quantidade, contentType) {
    const userIds = Array.from({ length: quantidade }, () => new mongoose.Types.ObjectId());
    const docs = userIds.map((userId) => ({
      userId, seriesId, episodeId: new mongoose.Types.ObjectId(), contentType,
      position: 0, percent: 0.9, completed: false, createdAt: new Date(), updatedAt: new Date(),
    }));
    await ReadingProgress.collection.insertMany(docs);
    return userIds;
  }

  it('computeQualidade usa contexto.porSerie quando presente, em vez de recomputar do banco', async () => {
    const serie = await Series.create({ title: 'Reuso Qualidade', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    const leitores = await seedLeitoresLogados(serie._id, 4, 'hiqua');
    await Favorite.collection.insertMany(leitores.map((userId) => ({ userId, seriesId: serie._id, createdAt: new Date(), updatedAt: new Date() })));
    // Dados reais no banco dariam favoritosPorLeitor = 4/4 = 1.

    const contextoComInjecao = {
      hiqua: { superReaderPorLeitor: 1, favoritosPorLeitor: 1, likesPorLeitor: 1, releiturasPorLeitor: 1 },
      porSerie: {
        [String(serie._id)]: {
          leitoresUnicos: 999, superReaderPorLeitor: 0, favoritosPorLeitor: 0, likesPorLeitor: 0, releiturasPorLeitor: 0,
        },
      },
    };

    const resultado = await recommendationService.computeQualidade(serie, contextoComInjecao);
    // Se tivesse recomputado, favoritosPorLeitor seria 1 (real) — como usou
    // o valor INJETADO no contexto, reflete 0 e leitoresUnicos 999.
    expect(resultado.metricas.favoritosPorLeitor).toBe(0);
    expect(resultado.leitoresUnicos).toBe(999);
    expect(resultado.qualidade).toBe(0);
  });

  it('computePotential usa contexto.porSerie quando presente, em vez de recomputar do banco', async () => {
    const serie = await Series.create({ title: 'Reuso Potential', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    const leitores = await seedLeitoresLogados(serie._id, 4, 'hiqua');
    await Favorite.collection.insertMany(leitores.map((userId) => ({ userId, seriesId: serie._id, createdAt: new Date(), updatedAt: new Date() })));

    const contextoComInjecao = {
      hiqua: { superReaderPorLeitor: 1, favoritosPorLeitor: 1, likesPorLeitor: 1, releiturasPorLeitor: 1 },
      porSerie: {
        [String(serie._id)]: {
          leitoresUnicos: 999, superReaderPorLeitor: 0, favoritosPorLeitor: 0, likesPorLeitor: 0, releiturasPorLeitor: 0,
        },
      },
    };

    const potential = await recommendationService.computePotential(serie, contextoComInjecao, 0);
    // favoritosNorm/likesNorm/superReaderNorm todos 0 (valor injetado) — se
    // recomputasse do banco, favoritosNorm seria 1 (dado real) e o
    // potential daria 25 (peso de favoritos), não 0.
    expect(potential).toBe(0);
  });

  it('sem contexto.porSerie (compatibilidade — chamada avulsa de teste): computeQualidade cai no cálculo direto do banco, como antes', async () => {
    const serie = await Series.create({ title: 'Sem Porserie Fallback', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    const leitores = await seedLeitoresLogados(serie._id, 4, 'hiqua');
    await Favorite.collection.insertMany(leitores.map((userId) => ({ userId, seriesId: serie._id, createdAt: new Date(), updatedAt: new Date() })));

    // Contexto SEM 'porSerie' — mesmo formato usado por dezenas de outros
    // testes deste arquivo (ex.: describe "qualidade proporcional").
    const resultado = await recommendationService.computeQualidade(serie, {});
    expect(resultado.metricas.favoritosPorLeitor).toBeCloseTo(1, 10);
    expect(resultado.leitoresUnicos).toBe(4);
  });
});

describe('gatilhos', () => {
  let mongoose;
  let Series;
  let SeriesScore;
  let recommendationService;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    SeriesScore = require('../../models/SeriesScore');
    recommendationService = require('../../services/recommendationService');
  });

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Gatilho', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  /** Aguarda o fire-and-forget: poll curto até o SeriesScore da série existir
   *  com `computedAt >= desde` (mesmo idioma de tests/backend/notifications.test.js —
   *  `vi.waitFor` com intervalo curto, sem espera fixa longa). */
  async function esperarRecalculo(seriesId, desde) {
    await vi.waitFor(async () => {
      const doc = await SeriesScore.findOne({ seriesId }).lean();
      expect(doc).not.toBeNull();
      expect(doc.computedAt.getTime()).toBeGreaterThanOrEqual(desde.getTime());
    }, { timeout: 2000, interval: 20 });
  }

  it('1) favoritar via rota dispara o recálculo do SeriesScore da série', async () => {
    const serie = await criarSerie({ title: 'Gatilho Favorito' });
    const antes = new Date();

    const res = await request(app)
      .post(`/api/favorites/${serie._id}`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ favorited: true });

    await esperarRecalculo(serie._id, antes);
  });

  it('2) votar (like) em série via rota dispara o recálculo do SeriesScore da série', async () => {
    const serie = await criarSerie({ title: 'Gatilho Voto' });
    const antes = new Date();

    const res = await request(app)
      .post(`/api/content/series/${serie._id}/vote`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ type: 'like' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'like' });

    await esperarRecalculo(serie._id, antes);
  });

  it('3a) saveProgress com completed:true (percent >= 0,9) dispara o recálculo', async () => {
    const serie = await criarSerie({ title: 'Gatilho Progresso Concluido' });
    const episodeId = new mongoose.Types.ObjectId();
    const antes = new Date();

    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: String(serie._id), episodeId: String(episodeId), contentType: 'hiqua', percent: 0.95 });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);

    await esperarRecalculo(serie._id, antes);
  });

  it('3b) saveProgress comum (percent 0,3, completed:false) NÃO dispara o recálculo', async () => {
    const serie = await criarSerie({ title: 'Gatilho Progresso Incompleto' });
    const episodeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: String(serie._id), episodeId: String(episodeId), contentType: 'hiqua', percent: 0.3 });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);

    // Sem `vi.waitFor` aqui de propósito: o teste afirma uma AUSÊNCIA — dá
    // um respiro curto para um disparo indevido (se existisse) terminar, e
    // confirma que nada foi gravado.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const doc = await SeriesScore.findOne({ seriesId: serie._id });
    expect(doc).toBeNull();
  });

  describe('4) webhook Super Reader dispara o recálculo', () => {
    // Mesmo padrão de tests/backend/superReader.test.js (describe "webhook"):
    // o handler valida a ASSINATURA de verdade (stripe.webhooks.constructEvent
    // com STRIPE_WEBHOOK_SECRET) — geramos uma assinatura REAL com
    // generateTestHeaderString para um segredo de teste, nada é mockado.
    const stripeTestUtil = require('stripe')('sk_test_dummy_key_apenas_para_assinar_webhooks_em_teste');
    const TEST_WEBHOOK_SECRET = 'whsec_test_recomendacao_gatilho';
    let segredoOriginal;

    beforeAll(() => {
      segredoOriginal = process.env.STRIPE_WEBHOOK_SECRET;
      process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    });

    afterAll(() => {
      process.env.STRIPE_WEBHOOK_SECRET = segredoOriginal;
    });

    function assinar(payload) {
      return stripeTestUtil.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
    }

    function postWebhookEvent(evento) {
      const payload = JSON.stringify(evento);
      return request(app)
        .post('/api/payment/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', assinar(payload))
        .send(payload);
    }

    it('checkout.session.completed de Super Reader dispara o recálculo da série apoiada', async () => {
      const serie = await criarSerie({ title: 'Gatilho Super Reader' });
      const sessionId = `cs_test_gatilho_sr_${new mongoose.Types.ObjectId()}`;
      const antes = new Date();

      const evento = {
        id: `evt_gatilho_sr_${sessionId}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            customer: null,
            subscription: null,
            amount_total: 500,
            currency: 'brl',
            metadata: {
              tipo: 'super_reader',
              userId: String(new mongoose.Types.ObjectId()),
              seriesId: String(serie._id),
              channelId: String(new mongoose.Types.ObjectId()),
            },
          },
        },
      };

      const res = await postWebhookEvent(evento);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      await esperarRecalculo(serie._id, antes);
    });
  });

  it('5) falha do recálculo NÃO afeta a resposta da rota (fire-and-forget real, catch interno absorve o erro)', async () => {
    const serie = await criarSerie({ title: 'Gatilho Falha Recalculo' });

    // Mesmo alvo de spy já usado no describe "composicao" (computeAllScores,
    // resumo erros:1) — SeriesScore.findOneAndUpdate é o passo final de
    // computeSeriesScore, rejeitá-lo simula uma falha real do recálculo sem
    // precisar reescrever dispararRecalculo para ser espionável por fora.
    const spy = vi.spyOn(SeriesScore, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Falha simulada de recalculo'));

    try {
      const res = await request(app)
        .post(`/api/favorites/${serie._id}`)
        .set('Authorization', `Bearer ${auth.getToken('user')}`);

      // A rota responde normalmente — o favorito foi gravado e a resposta
      // não sabe (nem precisa saber) que o recálculo, em paralelo, falhou.
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ favorited: true });

      await vi.waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 2000, interval: 20 });
    } finally {
      spy.mockRestore();
    }
  });

  it('6) publicar um episódio (POST /api/content/episodes) dispara o recálculo da série — um dos 6 pontos do push; os outros 5 pelo mesmo padrão (leitura de código)', async () => {
    const serie = await criarSerie({ title: 'Gatilho Capitulo Publicado' });
    const antes = new Date();

    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId: String(serie._id), episode_number: 1, title: 'Cap 1', status: 'published' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('published');

    await esperarRecalculo(serie._id, antes);
  });

  describe('7) iniciarVarreduraPeriodica / pararVarreduraPeriodica', () => {
    afterEach(() => {
      // Higiene: nenhum teste deste describe pode deixar timer vazando,
      // real ou falso, para os arquivos de teste seguintes.
      recommendationService.pararVarreduraPeriodica();
    });

    it('NODE_ENV=test: no-op — nunca cria o timer de 24h', async () => {
      expect(process.env.NODE_ENV).toBe('test'); // guarda-viva: garante que este teste testa o cenário certo
      const spy = vi.spyOn(global, 'setInterval');
      try {
        await expect(recommendationService.iniciarVarreduraPeriodica()).resolves.toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('idempotente fora de NODE_ENV=test: duas chamadas seguidas criam UM único timer', async () => {
      const nodeEnvOriginal = process.env.NODE_ENV;
      // Fake timers restritos a setInterval/clearInterval: o resto do teste
      // (query real ao mongodb-memory-server) continua com timers/I-O REAIS
      // — travar o relógio inteiro (Date/setTimeout) prenderia o driver do
      // Mongo, que depende de timers próprios internamente.
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      // Sem isto, a checagem real de "precisa varredura inicial" acharia
      // (quase certamente) alguma série publicada sem score entre as
      // dezenas criadas pelos describes deste arquivo, e disparia um
      // computeAllScores() de verdade em segundo plano — sem valor para
      // este teste (que só verifica a criação do timer) e arriscando uma
      // query contra o Mongo já fechado quando `afterAll` deste arquivo
      // rodar. Resolve como "nenhuma série precisa" independente do que
      // exista no banco.
      const spyExists = vi.spyOn(Series, 'exists').mockResolvedValueOnce(null);

      try {
        process.env.NODE_ENV = 'production';
        await recommendationService.iniciarVarreduraPeriodica();
        await recommendationService.iniciarVarreduraPeriodica();
        expect(vi.getTimerCount()).toBe(1);
      } finally {
        recommendationService.pararVarreduraPeriodica();
        vi.useRealTimers();
        process.env.NODE_ENV = nodeEnvOriginal;
        spyExists.mockRestore();
      }
    });

    it('precisaVarreduraInicial: true quando existe série publicada sem SeriesScore', async () => {
      const serie = await criarSerie({ title: 'Precisa Varredura Sem Score' });
      // Nenhum SeriesScore para esta série — precisa varrer.
      const precisa = await recommendationService.precisaVarreduraInicial();
      const doc = await SeriesScore.findOne({ seriesId: serie._id });
      expect(doc).toBeNull();
      expect(precisa).toBe(true);
    });

    it('precisaVarreduraInicial: false quando TODAS as séries publicadas têm score recente', async () => {
      await db.clearDatabase();
      const agora = new Date('2026-08-20T12:00:00.000Z');
      const serie = await criarSerie({ title: 'Precisa Varredura Score Recente' });
      await recommendationService.computeSeriesScore(serie._id, { agora });

      const precisa = await recommendationService.precisaVarreduraInicial(agora);
      expect(precisa).toBe(false);
    });

    it('precisaVarreduraInicial: true quando o único score existente está velho (>24h)', async () => {
      await db.clearDatabase();
      const calculadoEm = new Date('2026-08-19T00:00:00.000Z');
      const agora = new Date('2026-08-20T12:00:00.000Z'); // 36h depois — passou das 24h
      const serie = await criarSerie({ title: 'Precisa Varredura Score Velho' });
      await recommendationService.computeSeriesScore(serie._id, { agora: calculadoEm });

      const precisa = await recommendationService.precisaVarreduraInicial(agora);
      expect(precisa).toBe(true);
    });
  });
});

/**
 * Task 6: Afinidade por leitor (Etapa 4 do PDF, spec "Afinidade (Etapa 4)").
 * `computeAffinityProfile` é NÃO PERSISTIDO (LGPD by design — nada novo no
 * export/exclusão de dados, ver docstring no serviço) e `computeAfinidade`
 * (0–25 pts) é a sobreposição normalizada entre as tags do perfil e as tags
 * da série.
 */
describe('afinidade', () => {
  let mongoose;
  let Series;
  let Favorite;
  let SeriesVote;
  let SuperReaderContribution;
  let ReadingProgress;
  let recommendationService;

  beforeAll(() => {
    mongoose = require('mongoose');
    Series = require('../../models/Series');
    Favorite = require('../../models/Favorite');
    SeriesVote = require('../../models/SeriesVote');
    SuperReaderContribution = require('../../models/SuperReaderContribution');
    ReadingProgress = require('../../models/ReadingProgress');
    recommendationService = require('../../services/recommendationService');
  });

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Afinidade', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  function seedFavorito(userId, seriesId) {
    return Favorite.create({ userId, seriesId });
  }

  function seedSuperReader(seriesId, userId, sufixoSessao) {
    return SuperReaderContribution.create({
      seriesId,
      userId,
      channelId: new mongoose.Types.ObjectId(),
      amountCents: 500,
      currency: 'brl',
      authorShareCents: 400,
      platformShareCents: 100,
      stripeSessionId: `cs_test_afinidade_${sufixoSessao}`,
      period: '2026-08',
    });
  }

  function seedVoto(userId, seriesId, type = 'like') {
    return SeriesVote.create({ userId, seriesId, type });
  }

  function seedProgresso(identidade, seriesId, overrides = {}) {
    return ReadingProgress.create({
      seriesId,
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
      ...identidade,
      ...overrides,
    });
  }

  describe('computeAffinityProfile', () => {
    it('sem userId nem anonymousId: perfil vazio', async () => {
      const perfil = await recommendationService.computeAffinityProfile({});
      expect(perfil).toEqual({});
    });

    it('identidade logada sem NENHUM histórico nas 4 fontes: perfil vazio', async () => {
      const userId = new mongoose.Types.ObjectId();
      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil).toEqual({});
    });

    it('favoritos somam ×3 pra cada tag da série favoritada', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'Fav Tag', tags: ['acao1', 'aventura1', 'suspense1', 'drama1', 'fantasia1'] });
      await seedFavorito(userId, serie._id);

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil.acao1).toBe(3);
      expect(perfil.aventura1).toBe(3);
      expect(perfil.suspense1).toBe(3);
      expect(perfil.drama1).toBe(3);
      expect(perfil.fantasia1).toBe(3);
    });

    it('Super Reader soma ×4 (leitor logado, apoio da própria conta)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'SR Tag', tags: ['acao2', 'aventura2', 'suspense2', 'drama2', 'fantasia2'] });
      await seedSuperReader(serie._id, userId, 'sr1');

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil.acao2).toBe(4);
    });

    it('contribuição Super Reader ANONIMIZADA (userId: null, LGPD do Bloco 3) não é rastreável — não entra no perfil de ninguém', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'SR Anonimizado', tags: ['acao3', 'aventura3', 'suspense3', 'drama3', 'fantasia3'] });
      // Contribuição SEM vínculo (anonimizada) — mesmo que o MESMO userId
      // apareça consultando depois, não há como atribuir de volta a ele.
      await seedSuperReader(serie._id, null, 'sr-anon');

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil).toEqual({});
    });

    it('likes de série somam ×2; DISLIKE não soma nada', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serieLike = await criarSerie({ title: 'Like Tag', tags: ['romance1', 'drama4', 'comedia1', 'familia1', 'amizade1'] });
      const serieDislike = await criarSerie({ title: 'Dislike Tag', tags: ['terror1', 'suspense4', 'misterio1', 'crime1', 'policial1'] });
      await seedVoto(userId, serieLike._id, 'like');
      await seedVoto(userId, serieDislike._id, 'dislike');

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil.romance1).toBe(2);
      expect(perfil.terror1).toBeUndefined();
    });

    it('progresso de leitura soma ×1 — identidade LOGADA', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'Progresso Logado', tags: ['acao4', 'aventura4', 'suspense5', 'drama5', 'fantasia4'] });
      await seedProgresso({ userId }, serie._id);

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil.acao4).toBe(1);
    });

    it('progresso de leitura soma ×1 — identidade ANÔNIMA via anonymousId (mesmo mecanismo do Bloco 1)', async () => {
      const anonymousId = `anon-afinidade-${new mongoose.Types.ObjectId()}`;
      const serie = await criarSerie({ title: 'Progresso Anonimo', tags: ['acao5', 'aventura5', 'suspense6', 'drama6', 'fantasia5'] });
      await seedProgresso({ anonymousId }, serie._id);

      const perfil = await recommendationService.computeAffinityProfile({ anonymousId });
      expect(perfil.acao5).toBe(1);
    });

    it('múltiplos documentos de progresso na MESMA série contam a série UMA vez (não multiplica por documento)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'Progresso Multiplos Docs', tags: ['acao6', 'aventura6', 'suspense7', 'drama7', 'fantasia6'] });
      await seedProgresso({ userId }, serie._id, { episodeId: new mongoose.Types.ObjectId(), percent: 0.2 });
      await seedProgresso({ userId }, serie._id, { episodeId: new mongoose.Types.ObjectId(), percent: 0.4 });
      await seedProgresso({ userId }, serie._id, { episodeId: new mongoose.Types.ObjectId(), percent: 0.6 });

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      // 3 documentos, mesma série — soma ×1 UMA vez, nunca ×3.
      expect(perfil.acao6).toBe(1);
    });

    it('soma corretamente as 4 fontes na mesma tag (favorito + SR + like + progresso)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'Todas Fontes', tags: ['epico1', 'aventura7', 'suspense8', 'drama8', 'fantasia7'] });
      await seedFavorito(userId, serie._id);
      await seedSuperReader(serie._id, userId, 'todasfontes');
      await seedVoto(userId, serie._id, 'like');
      await seedProgresso({ userId }, serie._id);

      const perfil = await recommendationService.computeAffinityProfile({ userId });
      expect(perfil.epico1).toBe(3 + 4 + 2 + 1);
    });
  });

  describe('computeAfinidade', () => {
    it('sem perfil (objeto vazio): 12,5 pts neutros pra qualquer série, com ou sem tags', () => {
      const serieComTags = { tags: ['acao7', 'aventura8', 'suspense9', 'drama9', 'fantasia8'] };
      const serieSemTags = { tags: [] };
      expect(recommendationService.computeAfinidade(serieComTags, {})).toBe(12.5);
      expect(recommendationService.computeAfinidade(serieSemTags, {})).toBe(12.5);
    });

    it('RULING (Task 6): série SEM tags recebe neutro (12,5) MESMO com perfil existente (acervo antigo sem curadoria)', () => {
      const perfil = { acao8: 10, aventura9: 5 };
      const serieSemTags = { tags: [] };
      expect(recommendationService.computeAfinidade(serieSemTags, perfil)).toBe(12.5);
    });

    it('sobreposição normalizada ×25 com valores não-redondos (asserta o valor exato)', () => {
      // Perfil: acao=7, aventura=3, drama=2 (soma total = 12).
      const perfil = { acao9: 7, aventura10: 3, drama10: 2 };
      // A série tem 'acao9' e 'drama10' do perfil, mais uma tag FORA do
      // perfil (que não soma nada) → sobreposição = 7+2 = 9.
      const serie = { tags: ['acao9', 'drama10', 'tag-fora-do-perfil'] };
      const esperado = (9 / 12) * 25;
      expect(recommendationService.computeAfinidade(serie, perfil)).toBeCloseTo(esperado, 10);
      expect(esperado).toBeCloseTo(18.75, 10); // 9/12 = 0,75 × 25 — não é redondo por acidente
    });

    it('afinidade TOTAL: todas as tags do perfil aparecem na série → fração 1,0 → 25 pts exatos', () => {
      const perfil = { acao10: 7, aventura11: 3, drama11: 2 };
      const serie = { tags: ['acao10', 'aventura11', 'drama11', 'extra1', 'extra2'] };
      expect(recommendationService.computeAfinidade(serie, perfil)).toBeCloseTo(25, 10);
    });

    it('série com tags mas NENHUMA delas no perfil: sobreposição 0 → afinidade 0 (diferente do caso "sem tags")', () => {
      const perfil = { acao11: 7, aventura12: 3 };
      const serie = { tags: ['romance2', 'drama12', 'comedia2', 'familia2', 'amizade2'] };
      expect(recommendationService.computeAfinidade(serie, perfil)).toBe(0);
    });
  });

  /**
   * Achado ALTO A2 da revisão FINAL do Bloco 4 (fix round): o neutro fixo de
   * 12,5 pts pra série sem tags era o TETO teórico (perfil concentrado numa
   * única tag), mas o teto REAL de um leitor com histórico DIVERSO é bem
   * menor — a sobreposição máxima possível é a soma dos pesos das tags de
   * UMA obra dividida pela soma TOTAL do perfil (várias obras/temas), quase
   * sempre <1. Com 12,5 fixo, acervo com curadoria incompleta "abria o
   * feed" pra obras sem tags, à frente de obras que o leitor DEMONSTRAVELMENTE
   * gosta. RULING: neutro = MÉDIA das afinidades já calculadas das obras COM
   * tags do MESMO request — série sem tags intercala no nível TÍPICO daquele
   * leitor, nunca acima nem abaixo do que ele já demonstrou. `computeAfinidade`
   * (função pura) não muda — o neutro derivado vive só na montagem da lista
   * (`computeNeutroDerivado`, chamada por `buildRecommendations`).
   */
  describe('computeNeutroDerivado (Item 2, fix round da revisão final — achado A2)', () => {
    function serieFake(tags) {
      return { tags };
    }

    it('leitor com perfil DIVERSO (espalhado por vários temas, nenhum dominante): obra sem tags recebe a MÉDIA das afinidades das obras COM tags do catálogo — NÃO o 12,5 fixo antigo — e fica DENTRO do intervalo (nem acima do maior, nem abaixo do menor)', () => {
      // Perfil espalhado por 4 temas de pesos desiguais (soma = 18) — nenhuma
      // tag isolada domina o perfil, cenário onde o 12,5 fixo mais destoava
      // do real (a revisão mediu ≈10,6 num perfil parecido de 8 obras/2 temas).
      const perfil = { acao: 8, aventura: 5, drama: 3, comedia: 2 };

      const catalogo = [
        serieFake(['acao', 'x1', 'x2', 'x3', 'x4']), // sobreposição 8 → 8/18×25
        serieFake(['aventura', 'x5', 'x6', 'x7', 'x8']), // sobreposição 5 → 5/18×25
        serieFake(['drama', 'comedia', 'x9', 'x10', 'x11']), // sobreposição 3+2=5 → 5/18×25
        serieFake(['terror', 'x12', 'x13', 'x14', 'x15']), // fora do perfil → 0
        serieFake([]), // obra sem tags do PRÓPRIO catálogo — não entra na média
      ];

      const individuais = [(8 / 18) * 25, (5 / 18) * 25, (5 / 18) * 25, 0];
      const esperadoMedia = individuais.reduce((a, b) => a + b, 0) / individuais.length;

      const neutro = recommendationService.computeNeutroDerivado(catalogo, perfil);
      expect(neutro).toBeCloseTo(esperadoMedia, 10);
      expect(neutro).toBeCloseTo(6.25, 10); // valor exato deste cenário — bem longe do 12,5 fixo antigo
      expect(neutro).not.toBeCloseTo(12.5, 0);
      // Nunca acima do maior nem abaixo do menor das afinidades reais — não
      // "abre" nem "fecha" o feed além do que o leitor já demonstrou.
      expect(neutro).toBeGreaterThanOrEqual(Math.min(...individuais));
      expect(neutro).toBeLessThanOrEqual(Math.max(...individuais));
    });

    it('leitor SEM perfil: neutro derivado cai pro 12,5 fixo (mesmo comportamento de hoje — computeAfinidade já devolve 12,5 pra toda obra com tags sem histórico, a média delas também é 12,5)', () => {
      const catalogo = [
        serieFake(['acao', 'b', 'c', 'd', 'e']),
        serieFake(['romance', 'f', 'g', 'h', 'i']),
      ];
      expect(recommendationService.computeNeutroDerivado(catalogo, {})).toBe(12.5);
    });

    it('catálogo do request SEM NENHUMA obra tagueada: neutro derivado cai pro 12,5 fixo (não há afinidade nenhuma pra tirar média)', () => {
      const perfil = { acao: 10 };
      const catalogo = [serieFake([]), serieFake([]), serieFake(undefined)];
      expect(recommendationService.computeNeutroDerivado(catalogo, perfil)).toBe(12.5);
    });
  });
});

/**
 * Task 6: `buildRecommendations` — a função que JUNTA tudo (spec, seção
 * "Rotas" + "Distribuição 50/30/20 (Etapa 10)" + "Diversidade (Etapa 8)"):
 * valorOrdenacao = parteDaObra×confidence + afinidade, cotas 50/30/20,
 * diversidade por canal, e a rota GET /api/content/recommendations com
 * fallback pra ordem manual (ledger P3 — recomendação nunca derruba o feed).
 */
describe('recomendacoes', () => {
  let request;
  let mongoose;
  let app;
  let auth;
  let Series;
  let SeriesScore;
  let ReadingProgress;
  let Favorite;
  let recommendationService;

  beforeAll(() => {
    request = require('supertest');
    mongoose = require('mongoose');
    app = require('../../server');
    auth = require('../helpers/auth');
    Series = require('../../models/Series');
    SeriesScore = require('../../models/SeriesScore');
    ReadingProgress = require('../../models/ReadingProgress');
    Favorite = require('../../models/Favorite');
    recommendationService = require('../../services/recommendationService');
  });

  // Isolamento: buildRecommendations depende do TAMANHO exato do catálogo
  // (N) pra calcular as cotas — sobras de describes anteriores (ou de outros
  // testes deste mesmo describe) inflariam N e quebrariam as contagens
  // exatas testadas abaixo. Mesmo padrão do describe "composicao" (T4).
  beforeEach(() => db.clearDatabase());

  // A limpeza acima apaga TODOS os usuários de teste (helpers/auth.createUsers
  // rodou só uma vez, no beforeAll do topo do arquivo) — os testes de rota
  // deste describe usam auth.getToken(), que só lê os tokens já emitidos em
  // memória (JWT autocontido, verifyToken não relê o Mongo — mesmo padrão já
  // validado pelo describe "gatilhos" logo acima, que roda depois de
  // "composicao" limpar o banco do mesmo jeito).

  function criarSerie(overrides = {}) {
    return Series.create({
      title: 'Serie Recomendacao', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
  }

  function criarScore(seriesId, overrides = {}) {
    return SeriesScore.create({
      seriesId,
      contentType: 'hiqua',
      scoreFinal: 0,
      qualidade: 0,
      retencao: 0,
      descoberta: 0,
      potentialScore: 0,
      confidence: 0,
      leitoresUnicos: 0,
      penalizacoes: [],
      computedAt: new Date(),
      ...overrides,
    });
  }

  describe('buildRecommendations — ordenação (valorOrdenacao = parteDaObra×confidence + afinidade)', () => {
    it('obra com scoreFinal ALTO mas confidence BAIXA não desbanca "consolidada equivalente" (score menor, confidence alta)', async () => {
      const flashy = await criarSerie({ title: 'Flashy Baixa Confianca' });
      const consolidada = await criarSerie({ title: 'Consolidada Confianca Alta' });
      // parteDaObra = scoreFinal×0,65: flashy = 100×0,65=65, valorOrdenacao = 65×0,05 = 3,25.
      await criarScore(flashy._id, { scoreFinal: 100, confidence: 0.05 });
      // consolidada = 65×0,65=42,25, valorOrdenacao = 42,25×0,9 = 38,025 — MAIOR mesmo com scoreFinal menor.
      await criarScore(consolidada._id, { scoreFinal: 65, confidence: 0.9 });

      const resultado = await recommendationService.buildRecommendations({ contentType: 'hiqua' });
      const ids = resultado.map((s) => String(s._id));
      expect(ids.indexOf(String(consolidada._id))).toBeLessThan(ids.indexOf(String(flashy._id)));
    });

    it('afinidade muda a ordem entre leitores diferentes (mesmas duas séries, sem SeriesScore — só a Afinidade decide)', async () => {
      const serieAcao = await criarSerie({ title: 'Serie Acao', tags: ['acao12', 'luta1', 'forca1', 'poder1', 'heroi1'] });
      const serieRomance = await criarSerie({ title: 'Serie Romance', tags: ['romance3', 'drama13', 'emocao1', 'amor1', 'familia3'] });

      const leitorAcao = new mongoose.Types.ObjectId();
      await Favorite.create({ userId: leitorAcao, seriesId: serieAcao._id });

      const leitorRomance = new mongoose.Types.ObjectId();
      await Favorite.create({ userId: leitorRomance, seriesId: serieRomance._id });

      const paraLeitorAcao = await recommendationService.buildRecommendations({ contentType: 'hiqua', userId: leitorAcao });
      const paraLeitorRomance = await recommendationService.buildRecommendations({ contentType: 'hiqua', userId: leitorRomance });

      const idsAcao = paraLeitorAcao.map((s) => String(s._id));
      const idsRomance = paraLeitorRomance.map((s) => String(s._id));

      expect(idsAcao.indexOf(String(serieAcao._id))).toBeLessThan(idsAcao.indexOf(String(serieRomance._id)));
      expect(idsRomance.indexOf(String(serieRomance._id))).toBeLessThan(idsRomance.indexOf(String(serieAcao._id)));
    });

    /**
     * Item 2 (achado A2, fix round): antes deste fix, obra SEM tags recebia
     * 12,5 pts FIXOS de afinidade — se TODA afinidade real do catálogo fosse
     * baixa (leitor sem match forte com nada), o 12,5 fixo podia superar a
     * MELHOR afinidade real e a obra sem tags "abria o feed" (ficava em
     * PRIMEIRO), à frente de obras que o leitor de fato demonstrou gostar.
     * Com o neutro DERIVADO (média das afinidades reais do catálogo), isso é
     * matematicamente impossível: a média nunca supera o máximo dos valores
     * que a compõem — a obra sem tags nunca pode desbancar a obra de maior
     * afinidade real por causa do placeholder.
     */
    it('Item 2 (fix round, achado A2): obra SEM tags nunca "abre o feed" — não desbanca a obra de maior afinidade REAL do catálogo por causa do neutro', async () => {
      // Perfil via progresso de leitura (peso 1) em 3 obras de OUTRO
      // content_type (vcine) — fora do catálogo desta recomendação (hiqua),
      // então elas não competem na lista, só alimentam o perfil.
      const tema1 = ['tema1fx', 'p1a', 'p1b', 'p1c', 'p1d'];
      const tema2 = ['tema2fx', 'p2a', 'p2b', 'p2c', 'p2d'];
      const tema3 = ['tema3fx', 'p3a', 'p3b', 'p3c', 'p3d'];
      const perfilSerie1 = await Series.create({ title: 'Perfil Tema1', genre: 'Teste', content_type: 'vcine', isPublished: true, tags: tema1 });
      const perfilSerie2 = await Series.create({ title: 'Perfil Tema2', genre: 'Teste', content_type: 'vcine', isPublished: true, tags: tema2 });
      const perfilSerie3 = await Series.create({ title: 'Perfil Tema3', genre: 'Teste', content_type: 'vcine', isPublished: true, tags: tema3 });

      const leitor = new mongoose.Types.ObjectId();
      await ReadingProgress.create({ userId: leitor, seriesId: perfilSerie1._id, episodeId: new mongoose.Types.ObjectId(), contentType: 'vcine', percent: 0.5 });
      await ReadingProgress.create({ userId: leitor, seriesId: perfilSerie2._id, episodeId: new mongoose.Types.ObjectId(), contentType: 'vcine', percent: 0.5 });
      await ReadingProgress.create({ userId: leitor, seriesId: perfilSerie3._id, episodeId: new mongoose.Types.ObjectId(), contentType: 'vcine', percent: 0.5 });

      // Catálogo da recomendação (hiqua): obra que bate um POUCO dos 3 temas
      // (maior afinidade real do catálogo, mas ainda MODESTA), obra que não
      // bate nada (afinidade 0), e uma obra SEM tags nenhuma.
      const serieAlta = await criarSerie({ title: 'Catalogo Alta', tags: ['tema1fx', 'tema2fx', 'tema3fx', 'extra1', 'extra2'] });
      const serieBaixa = await criarSerie({ title: 'Catalogo Baixa', tags: ['temaforadoperfil', 'q1', 'q2', 'q3', 'q4'] });
      const serieSemTags = await criarSerie({ title: 'Catalogo Sem Tags' });
      // Nenhum SeriesScore criado — valorOrdenacao = afinidade pura (parteDaObra×confidence = 0 para todas).

      const resultado = await recommendationService.buildRecommendations({ contentType: 'hiqua', userId: leitor });
      const ids = resultado.map((s) => String(s._id));

      // serieAlta tem a MAIOR afinidade real do catálogo hiqua (bate 3 das
      // 15 tags do perfil) — é, por construção, a primeira da cota
      // "consolidadas" e por isso SEMPRE o primeiro item da lista final.
      expect(ids[0]).toBe(String(serieAlta._id));
      // serieSemTags (neutro = média de serieAlta e serieBaixa, estritamente
      // MENOR que a afinidade de serieAlta sozinha) nunca pode ocupar essa
      // primeira posição.
      expect(ids.indexOf(String(serieSemTags._id))).toBeGreaterThan(0);
    });

    it('série publicada SEM SeriesScore ainda aparece na lista (não some do feed)', async () => {
      const comScore = await criarSerie({ title: 'Com Score' });
      const semScore = await criarSerie({ title: 'Sem Score' });
      await criarScore(comScore._id, { scoreFinal: 80, confidence: 0.8 });
      // Nenhum SeriesScore criado pra semScore de propósito.

      const resultado = await recommendationService.buildRecommendations({ contentType: 'hiqua' });
      const ids = resultado.map((s) => String(s._id));
      expect(ids).toContain(String(semScore._id));
      expect(ids).toContain(String(comScore._id));
    });

    it('catálogo vazio do tipo: devolve array vazio, sem lançar', async () => {
      const resultado = await recommendationService.buildRecommendations({ contentType: 'vcine' });
      expect(resultado).toEqual([]);
    });

    it('shape das séries devolvidas NÃO inclui campos internos de ordenação (potentialScore/valorOrdenacao)', async () => {
      const serie = await criarSerie({ title: 'Shape Interno' });
      await criarScore(serie._id, { scoreFinal: 50, confidence: 0.5, potentialScore: 77 });

      const resultado = await recommendationService.buildRecommendations({ contentType: 'hiqua' });
      const item = resultado.find((s) => String(s._id) === String(serie._id));
      expect(item).toBeDefined();
      expect(item.potentialScore).toBeUndefined();
      expect(item.valorOrdenacao).toBeUndefined();
      expect(item.confidence).toBeUndefined();
      expect(item.title).toBe('Shape Interno');
    });
  });

  describe('cotas 50/30/20 (montarCotas — função pura, sem banco)', () => {
    function serieFake(id, { valorOrdenacao = 0, potentialScore = 0, createdAt = new Date('2020-01-01') } = {}) {
      return { _id: id, valorOrdenacao, potentialScore, createdAt };
    }

    it('catálogo de 10: 5 consolidadas / 3 potencial / 2 novas, sem duplicata', () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const antigo = new Date('2020-01-01T00:00:00.000Z'); // fora da janela de 90 dias
      const recente = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000); // dentro da janela

      const series = Array.from({ length: 10 }, (_, i) => serieFake(`s${i}`, {
        valorOrdenacao: 100 - i, // s0 melhor, s9 pior
        potentialScore: 50 - i,
        createdAt: i < 8 ? antigo : recente, // só s8/s9 são candidatas a "novas"
      }));

      const { consolidadas, potencial, novas } = recommendationService.montarCotas(series, agora);
      expect(consolidadas).toHaveLength(5);
      expect(potencial).toHaveLength(3);
      expect(novas).toHaveLength(2);

      const todosIds = [...consolidadas, ...potencial, ...novas].map((s) => s._id);
      expect(new Set(todosIds).size).toBe(10); // sem duplicata
      expect(todosIds).toHaveLength(10);
    });

    it('catálogo de 3: degrada sem quebrar (2 consolidadas / 1 potencial / 0 novas), sem duplicata', () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const series = Array.from({ length: 3 }, (_, i) => serieFake(`s${i}`, { valorOrdenacao: 30 - i, potentialScore: 10 - i }));

      const { consolidadas, potencial, novas } = recommendationService.montarCotas(series, agora);
      expect(consolidadas).toHaveLength(2);
      expect(potencial).toHaveLength(1);
      expect(novas).toHaveLength(0);

      const todosIds = [...consolidadas, ...potencial, ...novas].map((s) => s._id);
      expect(new Set(todosIds).size).toBe(3);
    });

    it('cota de novas SEM nenhuma obra dentro da janela de 90 dias: completa com as melhores restantes por valorOrdenacao (degradação)', () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const antigo = new Date('2020-01-01T00:00:00.000Z'); // todas fora da janela
      const series = Array.from({ length: 10 }, (_, i) => serieFake(`s${i}`, {
        valorOrdenacao: 100 - i, potentialScore: 50 - i, createdAt: antigo,
      }));

      const { consolidadas, potencial, novas } = recommendationService.montarCotas(series, agora);
      expect(consolidadas).toHaveLength(5);
      expect(potencial).toHaveLength(3);
      expect(novas).toHaveLength(2); // completou com as 2 melhores restantes por valorOrdenacao, mesmo fora da janela

      const todosIds = [...consolidadas, ...potencial, ...novas].map((s) => s._id);
      expect(new Set(todosIds).size).toBe(10);
    });

    it('catálogo de 1: uma única série vira "consolidada", nada mais é pedido além do que existe', () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const { consolidadas, potencial, novas } = recommendationService.montarCotas([serieFake('unica')], agora);
      expect(consolidadas).toHaveLength(1);
      expect(potencial).toHaveLength(0);
      expect(novas).toHaveLength(0);
    });

    it('série com score ausente (valorOrdenacao 0 / potentialScore 0) ainda aparece em alguma cota', () => {
      const agora = new Date('2026-08-20T00:00:00.000Z');
      const comScore = serieFake('com-score', { valorOrdenacao: 50, potentialScore: 50 });
      const semScore = serieFake('sem-score', { valorOrdenacao: 0, potentialScore: 0 });
      const { consolidadas, potencial, novas } = recommendationService.montarCotas([comScore, semScore], agora);
      const todosIds = [...consolidadas, ...potencial, ...novas].map((s) => s._id);
      expect(todosIds).toContain('sem-score');
      expect(todosIds).toContain('com-score');
    });
  });

  describe('diversidade (aplicarDiversidade / intercalarCotas — funções puras, sem banco)', () => {
    function serieFake(id, channelId) {
      return { _id: id, channelId };
    }

    it('sem 2 adjacentes do MESMO channelId quando existe alternativa — troca com o próximo elegível', () => {
      const canalA = new mongoose.Types.ObjectId();
      const canalB = new mongoose.Types.ObjectId();
      // s0(A), s1(A) adjacentes — colisão; s2(B) é o próximo elegível pra trocar.
      const lista = [serieFake('s0', canalA), serieFake('s1', canalA), serieFake('s2', canalB)];

      const resultado = recommendationService.aplicarDiversidade(lista);
      for (let i = 1; i < resultado.length; i++) {
        const mesmoCanal = resultado[i - 1].channelId && resultado[i].channelId
          && String(resultado[i - 1].channelId) === String(resultado[i].channelId);
        expect(mesmoCanal).toBe(false);
      }
      expect(resultado.map((s) => s._id).sort()).toEqual(['s0', 's1', 's2']);
    });

    it('catálogo de 1 único canal: não trava (deixa a colisão e segue), mesmo conjunto de séries', () => {
      const canalUnico = new mongoose.Types.ObjectId();
      const lista = [serieFake('s0', canalUnico), serieFake('s1', canalUnico), serieFake('s2', canalUnico)];
      const resultado = recommendationService.aplicarDiversidade(lista);
      expect(resultado).toHaveLength(3);
      expect(resultado.map((s) => s._id).sort()).toEqual(['s0', 's1', 's2']);
    });

    it('séries sem channelId (undefined) nunca contam como "mesmo canal" entre si — ordem original preservada', () => {
      const lista = [serieFake('s0', undefined), serieFake('s1', undefined), serieFake('s2', undefined)];
      const resultado = recommendationService.aplicarDiversidade(lista);
      expect(resultado.map((s) => s._id)).toEqual(['s0', 's1', 's2']);
    });

    it('intercalarCotas preserva a ordem INTERNA de cada cota, só intercala a POSIÇÃO entre elas', () => {
      const consolidadas = [serieFake('c0'), serieFake('c1')];
      const potencial = [serieFake('p0')];
      const novas = [serieFake('n0'), serieFake('n1')];
      const resultado = recommendationService.intercalarCotas(consolidadas, potencial, novas);
      expect(resultado.map((s) => s._id)).toEqual(['c0', 'p0', 'n0', 'c1', 'n1']);
    });
  });

  /**
   * Achado MÉDIO M1 da revisão FINAL do Bloco 4 (fix round): a regra
   * "alternar temas e estilos" (4ª regra de diversidade do PDF, Etapa 8) não
   * existia no passe — só canal adjacente. RULING: predicado de conflito
   * combinado `mesmoCanal(a,b) OU temaForte(a,b)`, onde `temaForte` = as
   * duas têm tags E a interseção > 50% do MENOR conjunto de tags. Mesma
   * mecânica de swap-forward de `aplicarDiversidade`; canal continua com
   * precedência de fato porque a busca do candidato usa o MESMO predicado
   * combinado (um candidato só é aceito se não bater nem por canal nem por
   * tema — nunca cria colisão de canal nova).
   */
  describe('temaForte / conflitoAdjacente (Item 3, fix round da revisão final — achado M1)', () => {
    it('exatamente 50% de interseção do MENOR conjunto NÃO dispara (exclusive)', () => {
      const a = { tags: ['t1', 't2', 't3', 't4'] }; // 4 tags — o menor conjunto
      const b = { tags: ['t1', 't2', 'x1', 'x2', 'x3', 'x4'] }; // 2 em comum com a
      // interseção=2, menor=4 → 2 > 4×0,5=2 é FALSO (exatos 50%, não dispara).
      expect(recommendationService.temaForte(a, b)).toBe(false);
    });

    it('mais de 50% de interseção do MENOR conjunto dispara (inclusive acima)', () => {
      const a = { tags: ['t1', 't2', 't3', 't4'] };
      const b = { tags: ['t1', 't2', 't3', 'x1', 'x2', 'x3'] }; // 3 em comum (75% de a)
      expect(recommendationService.temaForte(a, b)).toBe(true);
    });

    it('obra SEM tags nunca conflita por tema, mesmo com a outra tendo tags idênticas ou também vazias', () => {
      const semTags = { tags: [] };
      const comTags = { tags: ['t1', 't2', 't3', 't4', 't5'] };
      expect(recommendationService.temaForte(semTags, comTags)).toBe(false);
      expect(recommendationService.temaForte(comTags, semTags)).toBe(false);
      expect(recommendationService.temaForte(semTags, { tags: [] })).toBe(false);
    });

    it('mede pela obra MENOR: pouca sobreposição relativa a uma obra com MUITAS tags ainda dispara se dominar a obra pequena', () => {
      const pequena = { tags: ['t1', 't2', 't3'] }; // 3 tags
      const grande = { tags: ['t1', 't2', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10'] }; // 12 tags, 2 em comum
      // interseção=2, menor=3 → 2 > 1,5 → true (66% da pequena, só 16% da grande).
      expect(recommendationService.temaForte(pequena, grande)).toBe(true);
    });

    it('cenário MEDIDO da revisão: 3 obras de terror + 3 de romance, canais TODOS diferentes — sem 2 terror (nem 2 romance) adjacentes quando existe alternativa', () => {
      const canais = Array.from({ length: 6 }, () => new mongoose.Types.ObjectId());
      const tagsTerror = ['terror', 'tt1', 'tt2', 'tt3', 'tt4']; // idênticas entre as 3 — 100% de overlap
      const tagsRomance = ['romance', 'rr1', 'rr2', 'rr3', 'rr4'];

      // Pior caso de entrada: os 3 terror juntos, depois os 3 romance juntos.
      const lista = [
        { _id: 't0', channelId: canais[0], tags: tagsTerror },
        { _id: 't1', channelId: canais[1], tags: tagsTerror },
        { _id: 't2', channelId: canais[2], tags: tagsTerror },
        { _id: 'r0', channelId: canais[3], tags: tagsRomance },
        { _id: 'r1', channelId: canais[4], tags: tagsRomance },
        { _id: 'r2', channelId: canais[5], tags: tagsRomance },
      ];

      const resultado = recommendationService.aplicarDiversidade(lista);
      for (let i = 1; i < resultado.length; i++) {
        expect(recommendationService.conflitoAdjacente(resultado[i - 1], resultado[i])).toBe(false);
      }
      expect(resultado.map((s) => s._id).sort()).toEqual(['r0', 'r1', 'r2', 't0', 't1', 't2']);
    });

    it('canal continua tendo precedência de fato: um candidato que só bate por CANAL (sem tema) continua sendo rejeitado na busca, mesmo tendo tema diferente e estar mais perto', () => {
      const canalX = new mongoose.Types.ObjectId();
      const canalY = new mongoose.Types.ObjectId();
      const tagsTerror = ['terror', 'tt1', 'tt2', 'tt3', 'tt4'];
      const tagsOutroTema = ['comedia', 'cc1', 'cc2', 'cc3', 'cc4'];

      // s0(X,terror) colide com s1(X,sem tags) por CANAL. s2 também é canal
      // X — colide por canal MESMO tendo um tema diferente de s0 (sem
      // conflito de tema nenhum) — tem que ser pulado. Só s3 (canal Y, sem
      // tags) é seguro nos dois eixos.
      const lista = [
        { _id: 's0', channelId: canalX, tags: tagsTerror },
        { _id: 's1', channelId: canalX, tags: [] },
        { _id: 's2', channelId: canalX, tags: tagsOutroTema },
        { _id: 's3', channelId: canalY, tags: [] },
      ];

      const resultado = recommendationService.aplicarDiversidade(lista);
      // A busca pulou s2 (colide por canal, mesmo SEM colidir por tema) e
      // foi direto pra s3 — prova que o predicado combinado nunca deixa um
      // swap CRIAR uma colisão de canal nova.
      expect(resultado[1]._id).toBe('s3');
    });

    it('catálogo de tema único (todas as obras do MESMO tema forte, canais todos diferentes): não trava — deixa a colisão e segue, mesmo conjunto de séries', () => {
      const tagsUnico = ['acao', 'aa1', 'aa2', 'aa3', 'aa4'];
      const lista = [
        { _id: 's0', channelId: new mongoose.Types.ObjectId(), tags: tagsUnico },
        { _id: 's1', channelId: new mongoose.Types.ObjectId(), tags: tagsUnico },
        { _id: 's2', channelId: new mongoose.Types.ObjectId(), tags: tagsUnico },
      ];
      const resultado = recommendationService.aplicarDiversidade(lista);
      expect(resultado).toHaveLength(3);
      expect(resultado.map((s) => s._id).sort()).toEqual(['s0', 's1', 's2']);
    });
  });

  describe('GET /api/content/recommendations', () => {
    it('400 sem type', async () => {
      const res = await request(app).get('/api/content/recommendations');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('400 com type inválido', async () => {
      const res = await request(app).get('/api/content/recommendations?type=invalido');
      expect(res.status).toBe(400);
    });

    it('200 com o MESMO shape do GET /series (mesmos campos; potentialScore/valorOrdenacao/confidence não vazam)', async () => {
      const serie = await criarSerie({ title: 'Rota Shape', tags: ['acao13', 'aventura13', 'suspense10', 'drama14', 'fantasia9'] });
      await criarScore(serie._id, { scoreFinal: 50, confidence: 0.5 });

      const [resRecomendacao, resSeries] = await Promise.all([
        request(app).get('/api/content/recommendations?type=hiqua'),
        request(app).get('/api/content/series?type=hiqua'),
      ]);
      expect(resRecomendacao.status).toBe(200);
      const item = resRecomendacao.body.find((s) => s._id === String(serie._id));
      const itemOriginal = resSeries.body.find((s) => s._id === String(serie._id));
      expect(item).toBeDefined();
      expect(itemOriginal).toBeDefined();
      expect(Object.keys(item).sort()).toEqual(Object.keys(itemOriginal).sort());
      expect(item.potentialScore).toBeUndefined();
      expect(item.valorOrdenacao).toBeUndefined();
      expect(item.confidence).toBeUndefined();
    });

    it('anônimo com header X-Anonymous-Id: a ordem reflete o PRÓPRIO progresso (afinidade), mesmo mecanismo do Bloco 1', async () => {
      const anonymousId = 'ffb0d1a0-2222-4aaa-8bbb-0123456789ab'; // UUID v4 — mesmo formato validado por utils/requestIdentity
      const serieAlvo = await criarSerie({ title: 'Anonimo Alvo', tags: ['epico2', 'aventura14', 'suspense11', 'drama15', 'fantasia10'] });
      const serieOutra = await criarSerie({ title: 'Anonimo Outra', tags: ['romance4', 'comedia3', 'familia4', 'amizade3', 'doce1'] });
      // Ambas SEM SeriesScore — só a Afinidade decide a ordem entre elas.
      await ReadingProgress.create({
        anonymousId, seriesId: serieAlvo._id, episodeId: new mongoose.Types.ObjectId(), contentType: 'hiqua', percent: 0.5,
      });

      const res = await request(app)
        .get('/api/content/recommendations?type=hiqua')
        .set('X-Anonymous-Id', anonymousId);
      expect(res.status).toBe(200);
      const ids = res.body.map((s) => s._id);
      expect(ids.indexOf(String(serieAlvo._id))).toBeLessThan(ids.indexOf(String(serieOutra._id)));
    });

    it('erro do serviço (spy rejeitando buildRecommendations) → fallback com a ordem manual do GET /series e 200', async () => {
      const serieZ = await criarSerie({ title: 'Fallback Z', order_index: 2 });
      const serieA = await criarSerie({ title: 'Fallback A', order_index: 1 });

      const spy = vi.spyOn(recommendationService, 'buildRecommendations')
        .mockRejectedValueOnce(new Error('Falha simulada de recomendacao'));
      try {
        const res = await request(app).get('/api/content/recommendations?type=hiqua');
        expect(res.status).toBe(200);
        const ids = res.body.map((s) => s._id);
        expect(ids).toContain(String(serieA._id));
        expect(ids).toContain(String(serieZ._id));
        // Ordem manual do GET /series (order_index asc): A (1) antes de Z (2).
        expect(ids.indexOf(String(serieA._id))).toBeLessThan(ids.indexOf(String(serieZ._id)));
      } finally {
        spy.mockRestore();
      }
    });
  });
});
