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
