/**
 * Testes: Fase 4, Bloco 2 — notificações push e agenda de lançamentos.
 * Task 1: schemas (PushSubscription, guarda de envio do Episode) e o campo
 * releaseDay da Series, nas rotas de série.
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

describe('modelo PushSubscription', () => {
  const mongoose = require('mongoose');

  it('exige userId, endpoint e keys.p256dh/keys.auth', async () => {
    const PushSubscription = require('../../models/PushSubscription');

    await expect(PushSubscription.create({})).rejects.toThrow();
    await expect(
      PushSubscription.create({ userId: new mongoose.Types.ObjectId() }),
    ).rejects.toThrow();
    await expect(
      PushSubscription.create({
        userId: new mongoose.Types.ObjectId(),
        endpoint: 'https://push.exemplo/abc',
      }),
    ).rejects.toThrow();
    await expect(
      PushSubscription.create({
        userId: new mongoose.Types.ObjectId(),
        endpoint: 'https://push.exemplo/def',
        keys: { p256dh: 'chave-p256dh' },
      }),
    ).rejects.toThrow();

    const valida = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(),
      endpoint: 'https://push.exemplo/ghi',
      keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
    });
    expect(valida.endpoint).toBe('https://push.exemplo/ghi');
  });

  it('recusa dois documentos com o mesmo endpoint (E11000)', async () => {
    const PushSubscription = require('../../models/PushSubscription');
    const endpoint = 'https://push.exemplo/duplicado';

    await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(),
      endpoint,
      keys: { p256dh: 'p1', auth: 'a1' },
    });

    await expect(
      PushSubscription.create({
        userId: new mongoose.Types.ObjectId(),
        endpoint,
        keys: { p256dh: 'p2', auth: 'a2' },
      }),
    ).rejects.toThrow();
  });
});

describe('modelo Episode — guarda de envio único', () => {
  it('notificationSentAt começa null', async () => {
    const Episode = require('../../models/Episode');
    const mongoose = require('mongoose');

    const episodio = await Episode.create({
      seriesId: new mongoose.Types.ObjectId(),
      episode_number: 1,
      title: 'Capitulo Guarda',
    });
    expect(episodio.notificationSentAt).toBeNull();
  });
});

describe('modelo Series — releaseDay', () => {
  it('persiste releaseDay dentro de 0..6', async () => {
    const Series = require('../../models/Series');
    const serie = await Series.create({
      title: 'Serie ReleaseDay',
      genre: 'Teste',
      content_type: 'hiqua',
      releaseDay: 4,
    });
    expect(serie.releaseDay).toBe(4);
  });

  it('recusa releaseDay fora de 0..6', async () => {
    const Series = require('../../models/Series');
    await expect(
      Series.create({
        title: 'Serie ReleaseDay Invalido',
        genre: 'Teste',
        content_type: 'hiqua',
        releaseDay: 9,
      }),
    ).rejects.toThrow();
  });

  it('sem releaseDay, o valor fica null', async () => {
    const Series = require('../../models/Series');
    const serie = await Series.create({
      title: 'Serie Sem ReleaseDay',
      genre: 'Teste',
      content_type: 'hiqua',
    });
    expect(serie.releaseDay).toBeNull();
  });
});

describe('rotas de série — releaseDay', () => {
  it('POST /api/content/series (admin) com releaseDay devolve a série com o campo', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({
        title: 'Serie Rota ReleaseDay',
        genre: 'Teste',
        content_type: 'hiqua',
        releaseDay: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.releaseDay).toBe(2);
  });

  it('PUT /api/content/series/:id com releaseDay: null limpa o campo', async () => {
    const criada = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({
        title: 'Serie Rota ReleaseDay Limpa',
        genre: 'Teste',
        content_type: 'hiqua',
        releaseDay: 5,
      });
    const id = criada.body._id || criada.body.id;
    expect(criada.body.releaseDay).toBe(5);

    const atualizada = await request(app)
      .put(`/api/content/series/${id}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ releaseDay: null });

    expect(atualizada.status).toBe(200);
    expect(atualizada.body.releaseDay).toBeNull();
  });

  it('PUT /api/content/series/:id com releaseDay: 0 (domingo) grava — não é descartado por truthiness', async () => {
    const criada = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({
        title: 'Serie Rota ReleaseDay Domingo',
        genre: 'Teste',
        content_type: 'hiqua',
        releaseDay: 3,
      });
    const id = criada.body._id || criada.body.id;

    const atualizada = await request(app)
      .put(`/api/content/series/${id}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ releaseDay: 0 });

    expect(atualizada.status).toBe(200);
    expect(atualizada.body.releaseDay).toBe(0);
  });
});

/**
 * Task 2: services/notificationService.js — envio com claim atômico e poda
 * de inscrições mortas. Test seam __setTransportForTests no padrão de
 * utils/bunnyStorage.js (__setUploaderForTests): com transporte injetado o
 * web-push real nunca é tocado, inclusive ensureVapid não é exigido.
 */
describe('notificationService', () => {
  const mongoose = require('mongoose');
  let notificationService, Series, Episode, Favorite, PushSubscription;

  beforeAll(() => {
    notificationService = require('../../services/notificationService');
    Series = require('../../models/Series');
    Episode = require('../../models/Episode');
    Favorite = require('../../models/Favorite');
    PushSubscription = require('../../models/PushSubscription');
  });

  afterEach(() => {
    notificationService.__setTransportForTests(null);
  });

  async function criarSubscription(userId, sufixo) {
    return PushSubscription.create({
      userId,
      endpoint: `https://push.exemplo/${sufixo}-${new mongoose.Types.ObjectId()}`,
      keys: { p256dh: 'p', auth: 'a' },
    });
  }

  /** Série publicada + episódio + 2 favoritos (com subscription) + 1 subscription alheia. */
  async function montarCena({ contentType = 'hiqua', isPublished = true, episodeNumber = 2, title = 'Obra Push' } = {}) {
    const serie = await Series.create({ title, genre: 'Teste', content_type: contentType, isPublished });
    const episodio = await Episode.create({ seriesId: serie._id, episode_number: episodeNumber, title: 'Capitulo de teste' });

    const userFavorito1 = new mongoose.Types.ObjectId();
    const userFavorito2 = new mongoose.Types.ObjectId();
    const userNaoFavorito = new mongoose.Types.ObjectId();
    await Favorite.create({ userId: userFavorito1, seriesId: serie._id });
    await Favorite.create({ userId: userFavorito2, seriesId: serie._id });

    const sub1 = await criarSubscription(userFavorito1, 's1');
    const sub2 = await criarSubscription(userFavorito2, 's2');
    const subAlheia = await criarSubscription(userNaoFavorito, 's-alheia'); // não favoritou: não deve receber

    return { serie, episodio, sub1, sub2, subAlheia };
  }

  it('envia uma vez por subscription dos usuários que favoritaram — e só deles — com o payload correto', async () => {
    const recebidos = [];
    notificationService.__setTransportForTests(async (sub, payload) => {
      recebidos.push({ subId: String(sub._id), payload });
    });

    const { serie, sub1, sub2, subAlheia, episodio } = await montarCena();

    const resultado = await notificationService.notifyEpisodePublished(episodio._id);

    expect(resultado).toEqual({ enviados: 2, removidos: 0 });
    expect(recebidos.map(r => r.subId).sort()).toEqual([String(sub1._id), String(sub2._id)].sort());
    expect(recebidos.some(r => r.subId === String(subAlheia._id))).toBe(false);

    const payload = JSON.parse(recebidos[0].payload);
    expect(payload).toEqual({
      title: serie.title,
      body: 'Capítulo 2 disponível',
      url: `/?abrir=${serie._id}&tipo=hiqua`,
      tag: String(serie._id),
    });
  });

  it('payload usa "Episódio N" (não "Capítulo") para vcine/hqcine', async () => {
    const recebidos = [];
    notificationService.__setTransportForTests(async (_sub, payload) => { recebidos.push(payload); });

    const { episodio } = await montarCena({ contentType: 'vcine', episodeNumber: 5 });
    await notificationService.notifyEpisodePublished(episodio._id);

    const payload = JSON.parse(recebidos[0]);
    expect(payload.body).toBe('Episódio 5 disponível');
    expect(payload.url).toMatch(/tipo=vcine$/);
  });

  it('segunda chamada para o mesmo episódio não chama o transporte de novo (claim de notificationSentAt)', async () => {
    let chamadas = 0;
    notificationService.__setTransportForTests(async () => { chamadas += 1; });

    const { episodio } = await montarCena();

    const primeira = await notificationService.notifyEpisodePublished(episodio._id);
    expect(primeira).toEqual({ enviados: 2, removidos: 0 });
    expect(chamadas).toBe(2);

    const segunda = await notificationService.notifyEpisodePublished(episodio._id);
    expect(segunda).toBeNull();
    expect(chamadas).toBe(2); // não incrementou: transporte não foi chamado de novo
  });

  it('duas chamadas simultâneas (Promise.all) para o mesmo episódio → o transporte recebe o conjunto uma única vez (claim atômico)', async () => {
    let chamadas = 0;
    notificationService.__setTransportForTests(async () => { chamadas += 1; });

    const { episodio } = await montarCena();

    const [r1, r2] = await Promise.all([
      notificationService.notifyEpisodePublished(episodio._id),
      notificationService.notifyEpisodePublished(episodio._id),
    ]);

    const naoNulos = [r1, r2].filter(r => r !== null);
    expect(naoNulos).toHaveLength(1);
    expect(naoNulos[0]).toEqual({ enviados: 2, removidos: 0 });
    expect(chamadas).toBe(2); // não 4: só um dos dois caminhos enviou
  });

  it('série com isPublished:false não envia e desfaz o claim (não consome o envio único)', async () => {
    let chamadas = 0;
    notificationService.__setTransportForTests(async () => { chamadas += 1; });

    const { episodio, serie } = await montarCena({ isPublished: false });

    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toBeNull();
    expect(chamadas).toBe(0);

    const episodioAposFalha = await Episode.findById(episodio._id);
    expect(episodioAposFalha.notificationSentAt).toBeNull(); // claim desfeito

    // Publica a série depois: o claim não foi consumido, então agora consegue enviar.
    await Series.updateOne({ _id: serie._id }, { $set: { isPublished: true } });
    const resultado2 = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado2).toEqual({ enviados: 2, removidos: 0 });
    expect(chamadas).toBe(2);
  });

  it('transporte lançando {statusCode:410} para uma subscription → ela é removida do banco e as demais recebem', async () => {
    const { episodio, sub1, sub2 } = await montarCena();
    notificationService.__setTransportForTests(async (sub) => {
      if (String(sub._id) === String(sub1._id)) {
        const err = new Error('gone');
        err.statusCode = 410;
        throw err;
      }
    });

    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: 1, removidos: 1 });

    expect(await PushSubscription.findById(sub1._id)).toBeNull();
    expect(await PushSubscription.findById(sub2._id)).not.toBeNull();
  });

  it('transporte lançando {statusCode:404} para uma subscription → também é removida', async () => {
    const { episodio, sub1 } = await montarCena();
    notificationService.__setTransportForTests(async (sub) => {
      if (String(sub._id) === String(sub1._id)) {
        const err = new Error('not found');
        err.statusCode = 404;
        throw err;
      }
    });

    await notificationService.notifyEpisodePublished(episodio._id);
    expect(await PushSubscription.findById(sub1._id)).toBeNull();
  });

  it('PushSubscription.deleteOne lançando (falha transitória de banco na poda) não aborta o lote — as demais subscriptions recebem e a função resolve', async () => {
    const serie = await Series.create({ title: 'Obra Poda Falha', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    const episodio = await Episode.create({ seriesId: serie._id, episode_number: 3, title: 'Cap 3' });

    const userAntes = new mongoose.Types.ObjectId();
    const userMorta = new mongoose.Types.ObjectId();
    const userDepois = new mongoose.Types.ObjectId();
    await Favorite.create({ userId: userAntes, seriesId: serie._id });
    await Favorite.create({ userId: userMorta, seriesId: serie._id });
    await Favorite.create({ userId: userDepois, seriesId: serie._id });

    const subAntes = await criarSubscription(userAntes, 'antes');
    const subMorta = await criarSubscription(userMorta, 'morta'); // vai receber 410 no meio do lote
    const subDepois = await criarSubscription(userDepois, 'depois');

    notificationService.__setTransportForTests(async (sub) => {
      if (String(sub._id) === String(subMorta._id)) {
        const err = new Error('gone');
        err.statusCode = 410;
        throw err;
      }
    });

    // Simula falha transitória de banco especificamente na exclusão da subscription morta.
    const deleteOneSpy = vi.spyOn(PushSubscription, 'deleteOne').mockImplementationOnce(async () => {
      throw new Error('falha transitória de banco');
    });

    let resultado;
    try {
      resultado = await notificationService.notifyEpisodePublished(episodio._id);
    } finally {
      deleteOneSpy.mockRestore();
    }

    // A função resolve normalmente (não propaga o erro da poda) e as demais
    // subscriptions do lote recebem — a falha ao podar não trava o restante.
    expect(resultado).toEqual({ enviados: 2, removidos: 0 });
    expect(await PushSubscription.findById(subAntes._id)).not.toBeNull();
    expect(await PushSubscription.findById(subDepois._id)).not.toBeNull();
    // A subscription morta continua no banco: a exclusão falhou (erro transitório),
    // não foi de fato removida — não conta em "removidos".
    expect(await PushSubscription.findById(subMorta._id)).not.toBeNull();
  });

  it('transporte lançando erro comum (sem statusCode 404/410) → loga, mantém a subscription e as demais recebem (a função resolve)', async () => {
    const { episodio, sub1, sub2 } = await montarCena();
    notificationService.__setTransportForTests(async (sub) => {
      if (String(sub._id) === String(sub1._id)) {
        throw new Error('falha de rede transitória');
      }
    });

    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: 1, removidos: 0 });
    expect(await PushSubscription.findById(sub1._id)).not.toBeNull(); // não removida
    expect(await PushSubscription.findById(sub2._id)).not.toBeNull();
  });

  it('lote com mais de 10 subscriptions envia a todas (lotes de 10, uma falha isolada não trava o restante)', async () => {
    let chamadas = 0;
    const falharam = [];
    const TOTAL = 23;

    const serie = await Series.create({ title: 'Obra Lote Grande', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1' });

    const subsCriadas = [];
    for (let i = 0; i < TOTAL; i++) {
      const userId = new mongoose.Types.ObjectId();
      await Favorite.create({ userId, seriesId: serie._id });
      subsCriadas.push(await criarSubscription(userId, `lote-${i}`));
    }
    // A 3ª subscription do lote falha com erro comum — não deve travar as outras 22.
    const idQueFalha = String(subsCriadas[2]._id);

    notificationService.__setTransportForTests(async (sub) => {
      chamadas += 1;
      if (String(sub._id) === idQueFalha) {
        falharam.push(sub._id);
        throw new Error('falha isolada');
      }
    });

    const resultado = await notificationService.notifyEpisodePublished(episodio._id);
    expect(resultado).toEqual({ enviados: TOTAL - 1, removidos: 0 });
    expect(chamadas).toBe(TOTAL);
    expect(falharam).toHaveLength(1);
  });

  it('dev sem chaves VAPID: getVapidPublicKey gera um par efêmero e retorna a chave pública', () => {
    // Ambiente de teste (NODE_ENV=test, sem VAPID_*) é o estado natural do
    // singleton nesta suíte — nenhum outro teste chama ensureVapid() antes
    // deste porque todos os demais injetam transporte (curto-circuita antes).
    const chave = notificationService.getVapidPublicKey();
    expect(typeof chave).toBe('string');
    expect(chave.length).toBeGreaterThan(20);
  });

  it('produção sem chaves VAPID: getVapidPublicKey retorna null e notifyEpisodePublished retorna null cedo sem consumir o claim', async () => {
    const { episodio } = await montarCena();

    const originalNodeEnv = process.env.NODE_ENV;
    const originalPub = process.env.VAPID_PUBLIC_KEY;
    const originalPriv = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    process.env.NODE_ENV = 'production';

    // Módulo isolado: precisa reavaliar ensureVapid() do zero (o singleton
    // compartilhado já cacheou o par efêmero no teste anterior). vi.resetModules()
    // não alcança módulos carregados via require() nativo do Node (este projeto
    // é CJS) — por isso a limpeza é feita direto no require.cache, só para este
    // módulo. As dependências dele (Episode, Series, mongoose) continuam vindo
    // do cache normal (já conectadas) — nada fica desconectado do banco.
    const caminhoModulo = require.resolve('../../services/notificationService');
    delete require.cache[caminhoModulo];
    const svcIsolado = require('../../services/notificationService');

    let chavePublica, resultado;
    try {
      chavePublica = svcIsolado.getVapidPublicKey();
      resultado = await svcIsolado.notifyEpisodePublished(episodio._id);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalPub !== undefined) process.env.VAPID_PUBLIC_KEY = originalPub;
      if (originalPriv !== undefined) process.env.VAPID_PRIVATE_KEY = originalPriv;
      delete require.cache[caminhoModulo]; // não deixa o estado "produção sem chaves" vazar
    }

    expect(chavePublica).toBeNull();
    expect(resultado).toBeNull();

    // Verificação via o modelo já conectado desta suíte (não o "fresco").
    const episodioIntacto = await Episode.findById(episodio._id);
    expect(episodioIntacto.notificationSentAt).toBeNull();
  });

  it('__setTransportForTests lança fora de NODE_ENV=test', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => notificationService.__setTransportForTests(() => {})).toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

/**
 * Task 3: routes/push.js — rotas HTTP de inscrição push (public-key,
 * subscribe/unsubscribe, status). Upsert por endpoint com E11000 tratado
 * como sucesso, no padrão de services/progressService.js.
 */
describe('rotas de push', () => {
  const mongoose = require('mongoose');
  let PushSubscription;

  beforeAll(() => {
    PushSubscription = require('../../models/PushSubscription');
  });

  function endpointUnico(sufixo) {
    return `https://push.exemplo/${sufixo}-${new mongoose.Types.ObjectId()}`;
  }

  describe('GET /api/push/public-key', () => {
    it('responde 200 com publicKey (sem auth)', async () => {
      const res = await request(app).get('/api/push/public-key');
      expect(res.status).toBe(200);
      expect(typeof res.body.publicKey).toBe('string');
      expect(res.body.publicKey.length).toBeGreaterThan(20);
    });
  });

  describe('POST /api/me/push/subscribe', () => {
    it('sem token → 401', async () => {
      const res = await request(app)
        .post('/api/me/push/subscribe')
        .send({ endpoint: endpointUnico('sem-token'), keys: { p256dh: 'p', auth: 'a' } });
      expect(res.status).toBe(401);
    });

    it('com token e body válido → 2xx e cria documento no banco', async () => {
      const endpoint = endpointUnico('valido');
      const res = await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint, keys: { p256dh: 'p256dh-1', auth: 'auth-1' } });

      expect([200, 201]).toContain(res.status);

      const doc = await PushSubscription.findOne({ endpoint });
      expect(doc).not.toBeNull();
      expect(String(doc.userId)).toBe(auth.getId('user'));
      expect(doc.keys.p256dh).toBe('p256dh-1');
      expect(doc.keys.auth).toBe('auth-1');
    });

    it('repetir o mesmo endpoint (mesmo usuário) → 2xx sem duplicar no banco', async () => {
      const endpoint = endpointUnico('repete');
      const primeira = await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint, keys: { p256dh: 'p1', auth: 'a1' } });
      expect([200, 201]).toContain(primeira.status);

      const segunda = await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint, keys: { p256dh: 'p2', auth: 'a2' } });
      expect([200, 201]).toContain(segunda.status);

      const docs = await PushSubscription.find({ endpoint });
      expect(docs).toHaveLength(1);
      expect(docs[0].keys.p256dh).toBe('p2'); // atualizou, não duplicou
    });

    it('mesmo endpoint por outro usuário → o documento troca de dono (takeover)', async () => {
      const endpoint = endpointUnico('takeover');
      await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint, keys: { p256dh: 'p-user', auth: 'a-user' } });

      const res = await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('premium')}`)
        .send({ endpoint, keys: { p256dh: 'p-premium', auth: 'a-premium' } });
      expect([200, 201]).toContain(res.status);

      const docs = await PushSubscription.find({ endpoint });
      expect(docs).toHaveLength(1);
      expect(String(docs[0].userId)).toBe(auth.getId('premium'));
    });

    it('body sem keys.auth → 400', async () => {
      const res = await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint: endpointUnico('sem-auth'), keys: { p256dh: 'p' } });
      expect(res.status).toBe(400);
    });

    it('endpoint que não é URL http(s) → 400', async () => {
      const res = await request(app)
        .post('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint: 'ftp://push.exemplo/invalido', keys: { p256dh: 'p', auth: 'a' } });
      expect(res.status).toBe(400);
    });

    it('duas inscrições quase simultâneas do mesmo endpoint (corrida de upsert) → não duplica e ambas resolvem com sucesso', async () => {
      const endpoint = endpointUnico('corrida');
      const [r1, r2] = await Promise.all([
        request(app)
          .post('/api/me/push/subscribe')
          .set('Authorization', `Bearer ${auth.getToken('user')}`)
          .send({ endpoint, keys: { p256dh: 'p1', auth: 'a1' } }),
        request(app)
          .post('/api/me/push/subscribe')
          .set('Authorization', `Bearer ${auth.getToken('user')}`)
          .send({ endpoint, keys: { p256dh: 'p2', auth: 'a2' } }),
      ]);
      expect([200, 201]).toContain(r1.status);
      expect([200, 201]).toContain(r2.status);

      const docs = await PushSubscription.find({ endpoint });
      expect(docs).toHaveLength(1);
    });
  });

  describe('DELETE /api/me/push/subscribe', () => {
    it('remove só o endpoint do próprio usuário', async () => {
      const endpointDoUsuario = endpointUnico('delete-proprio');
      const endpointDeOutro = endpointUnico('delete-alheio');

      await PushSubscription.create({
        userId: auth.getId('user'),
        endpoint: endpointDoUsuario,
        keys: { p256dh: 'p', auth: 'a' },
      });
      await PushSubscription.create({
        userId: auth.getId('premium'),
        endpoint: endpointDeOutro,
        keys: { p256dh: 'p', auth: 'a' },
      });

      // Tenta remover o endpoint de outro usuário: não remove nada.
      const resAlheio = await request(app)
        .delete('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint: endpointDeOutro });
      expect(resAlheio.status).toBe(200);
      expect(resAlheio.body.removed).toBe(0);
      expect(await PushSubscription.findOne({ endpoint: endpointDeOutro })).not.toBeNull();

      // Remove o próprio.
      const resProprio = await request(app)
        .delete('/api/me/push/subscribe')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ endpoint: endpointDoUsuario });
      expect(resProprio.status).toBe(200);
      expect(resProprio.body.removed).toBe(1);
      expect(await PushSubscription.findOne({ endpoint: endpointDoUsuario })).toBeNull();
    });

    it('sem token → 401', async () => {
      const res = await request(app)
        .delete('/api/me/push/subscribe')
        .send({ endpoint: endpointUnico('sem-token-delete') });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/me/push/status', () => {
    it('reflete thisDevice e anyDevice', async () => {
      const endpoint = endpointUnico('status');
      await PushSubscription.create({
        userId: auth.getId('user'),
        endpoint,
        keys: { p256dh: 'p', auth: 'a' },
      });

      const comEndpoint = await request(app)
        .get(`/api/me/push/status?endpoint=${encodeURIComponent(endpoint)}`)
        .set('Authorization', `Bearer ${auth.getToken('user')}`);
      expect(comEndpoint.status).toBe(200);
      expect(comEndpoint.body).toEqual({ thisDevice: true, anyDevice: true });

      // Outro endpoint que este usuário não tem, mas o usuário tem alguma inscrição.
      const outroEndpoint = await request(app)
        .get(`/api/me/push/status?endpoint=${encodeURIComponent(endpointUnico('outro'))}`)
        .set('Authorization', `Bearer ${auth.getToken('user')}`);
      expect(outroEndpoint.body).toEqual({ thisDevice: false, anyDevice: true });

      // Sem query endpoint → thisDevice false.
      const semEndpoint = await request(app)
        .get('/api/me/push/status')
        .set('Authorization', `Bearer ${auth.getToken('user')}`);
      expect(semEndpoint.body.thisDevice).toBe(false);

      // Usuário sem nenhuma inscrição → anyDevice false.
      const semInscricao = await request(app)
        .get('/api/me/push/status')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`);
      expect(semInscricao.body).toEqual({ thisDevice: false, anyDevice: false });
    });

    it('sem token → 401', async () => {
      const res = await request(app).get('/api/me/push/status');
      expect(res.status).toBe(401);
    });
  });
});

/**
 * Task 4: disparo (fire-and-forget) de notifyEpisodePublished nos QUATRO
 * caminhos que resultam em episódio publicado: POST /episodes, PUT
 * /episodes/:id, o webhook do Bunny (Status 4) e — ampliação de escopo — o
 * PUT /series/:id quando isPublished transiciona de falso para verdadeiro
 * (série volta a publicar e "destrava" capítulos que ficaram sem notificar).
 * Cada teste injeta o transporte e aguarda o efeito com poll curto, já que a
 * rota nunca espera o envio (sem await no disparo).
 */
describe('disparo do push nos quatro caminhos de publicação', () => {
  const mongoose = require('mongoose');
  let notificationService, Series, Episode, Favorite, PushSubscription;

  beforeAll(() => {
    notificationService = require('../../services/notificationService');
    Series = require('../../models/Series');
    Episode = require('../../models/Episode');
    Favorite = require('../../models/Favorite');
    PushSubscription = require('../../models/PushSubscription');
  });

  afterEach(() => {
    notificationService.__setTransportForTests(null);
  });

  /** Série publicada + 1 favorito com subscription — garante destinatário
   *  real, senão o transporte nunca é chamado (lista de subscriptions vazia). */
  async function criarSerieComFavoritoESubscription(overrides = {}) {
    const serie = await Series.create({
      title: 'Serie Disparo', genre: 'Teste', content_type: 'hiqua', isPublished: true, ...overrides,
    });
    const userId = new mongoose.Types.ObjectId();
    await Favorite.create({ userId, seriesId: serie._id });
    await PushSubscription.create({
      userId,
      endpoint: `https://push.exemplo/disparo-${new mongoose.Types.ObjectId()}`,
      keys: { p256dh: 'p', auth: 'a' },
    });
    return serie;
  }

  describe('caminho 1 — POST /api/content/episodes com status: "published"', () => {
    it('dispara o push após criar o episódio já publicado', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await criarSerieComFavoritoESubscription();

      const res = await request(app)
        .post('/api/content/episodes')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ seriesId: serie._id, episode_number: 1, title: 'Capitulo Disparo POST', status: 'published' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('published');

      await vi.waitFor(() => expect(chamadas).toBe(1), { timeout: 2000, interval: 20 });

      const episodio = await Episode.findById(res.body._id);
      expect(episodio.notificationSentAt).not.toBeNull();
    });

    it('episódio criado como draft (padrão, sem status no body) não dispara o push', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await criarSerieComFavoritoESubscription();

      const res = await request(app)
        .post('/api/content/episodes')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ seriesId: serie._id, episode_number: 2, title: 'Capitulo Draft POST' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');

      await new Promise(r => setTimeout(r, 100));
      expect(chamadas).toBe(0);
    });
  });

  describe('caminho 2 — PUT /api/content/episodes/:id para status: "published"', () => {
    it('dispara o push quando a edição muda o status para published', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await criarSerieComFavoritoESubscription();
      const episodio = await Episode.create({ seriesId: serie._id, episode_number: 3, title: 'Cap PUT', status: 'draft' });

      const res = await request(app)
        .put(`/api/content/episodes/${episodio._id}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ status: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('published');

      await vi.waitFor(() => expect(chamadas).toBe(1), { timeout: 2000, interval: 20 });
    });

    it('editar um episódio já publicado (sem mudar o status) não redispara — claim já consumido', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await criarSerieComFavoritoESubscription();
      const episodio = await Episode.create({
        seriesId: serie._id, episode_number: 4, title: 'Cap Ja Publicado', status: 'published', notificationSentAt: new Date(),
      });

      const res = await request(app)
        .put(`/api/content/episodes/${episodio._id}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ title: 'Cap Ja Publicado Editado' });

      expect(res.status).toBe(200);

      await new Promise(r => setTimeout(r, 100));
      expect(chamadas).toBe(0);
    });
  });

  describe('caminho 3 — webhook do Bunny com Status 4', () => {
    it('dispara o push quando o Bunny reporta Status 4 (Finished)', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await criarSerieComFavoritoESubscription();
      const episodio = await Episode.create({
        seriesId: serie._id, episode_number: 5, title: 'Cap Bunny', status: 'processing', bunnyVideoId: `bunny-${new mongoose.Types.ObjectId()}`,
      });

      const segredoAnterior = process.env.BUNNY_WEBHOOK_SECRET;
      process.env.BUNNY_WEBHOOK_SECRET = 'segredo-teste-notificacoes';
      try {
        const res = await request(app)
          .post('/api/bunny/webhook')
          .set('x-webhook-token', 'segredo-teste-notificacoes')
          .send({ VideoGuid: episodio.bunnyVideoId, Status: 4 });

        expect(res.status).toBe(200);
      } finally {
        process.env.BUNNY_WEBHOOK_SECRET = segredoAnterior;
      }

      await vi.waitFor(() => expect(chamadas).toBe(1), { timeout: 2000, interval: 20 });

      const episodioAtualizado = await Episode.findById(episodio._id);
      expect(episodioAtualizado.status).toBe('published');
      expect(episodioAtualizado.notificationSentAt).not.toBeNull();
    });
  });

  describe('caminho 4 — PUT /api/content/series/:id transiciona isPublished false→true', () => {
    it('redispara o push para episódios publicados sem notificationSentAt quando a série volta a publicar', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await Series.create({ title: 'Serie Reabertura', genre: 'Teste', content_type: 'hiqua', isPublished: false });
      const userId = new mongoose.Types.ObjectId();
      await Favorite.create({ userId, seriesId: serie._id });
      await PushSubscription.create({
        userId,
        endpoint: `https://push.exemplo/reabertura-${new mongoose.Types.ObjectId()}`,
        keys: { p256dh: 'p', auth: 'a' },
      });

      const pendente1 = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Pendente 1', status: 'published' });
      const pendente2 = await Episode.create({ seriesId: serie._id, episode_number: 2, title: 'Pendente 2', status: 'published' });
      const jaNotificado = await Episode.create({ seriesId: serie._id, episode_number: 3, title: 'Ja Notificado', status: 'published', notificationSentAt: new Date() });
      const rascunho = await Episode.create({ seriesId: serie._id, episode_number: 4, title: 'Rascunho', status: 'draft' });

      const res = await request(app)
        .put(`/api/content/series/${serie._id}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ isPublished: true });

      expect(res.status).toBe(200);
      expect(res.body.isPublished).toBe(true);

      await vi.waitFor(() => expect(chamadas).toBe(2), { timeout: 2000, interval: 20 });

      const [ep1, ep2, ep3, ep4] = await Promise.all([
        Episode.findById(pendente1._id),
        Episode.findById(pendente2._id),
        Episode.findById(jaNotificado._id),
        Episode.findById(rascunho._id),
      ]);
      expect(ep1.notificationSentAt).not.toBeNull();
      expect(ep2.notificationSentAt).not.toBeNull();
      expect(ep3.notificationSentAt.getTime()).toBe(jaNotificado.notificationSentAt.getTime()); // não mexeu
      expect(ep4.notificationSentAt).toBeNull(); // draft não notifica
      expect(chamadas).toBe(2); // exatamente os 2 pendentes — nem o já notificado, nem o draft
    });

    it('editar uma série já publicada NÃO redispara (não é a transição falso→verdadeiro)', async () => {
      let chamadas = 0;
      notificationService.__setTransportForTests(async () => { chamadas += 1; });

      const serie = await Series.create({ title: 'Serie Ja Publicada', genre: 'Teste', content_type: 'hiqua', isPublished: true });
      const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Pendente', status: 'published' });

      const res = await request(app)
        .put(`/api/content/series/${serie._id}`)
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ isPublished: true, title: 'Serie Ja Publicada Editada' });

      expect(res.status).toBe(200);

      await new Promise(r => setTimeout(r, 100));
      expect(chamadas).toBe(0);

      const episodioIntacto = await Episode.findById(episodio._id);
      expect(episodioIntacto.notificationSentAt).toBeNull();
    });
  });
});
