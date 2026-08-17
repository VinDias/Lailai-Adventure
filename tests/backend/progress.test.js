/**
 * Testes: Fase 4, Bloco 1 — progresso de leitura e "Continuar".
 * Cobre modelo, gravação, carrossel, migração do visitante e LGPD.
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

const ANON = '11111111-2222-4333-8444-555555555555';

describe('modelo ReadingProgress', () => {
  it('exige exatamente um identificador: userId ou anonymousId', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
    };

    await expect(ReadingProgress.create({ ...base })).rejects.toThrow();
    await expect(
      ReadingProgress.create({ ...base, userId: auth.getId('user'), anonymousId: ANON }),
    ).rejects.toThrow();

    const soUsuario = await ReadingProgress.create({ ...base, userId: auth.getId('user') });
    expect(soUsuario.userId).toBeTruthy();

    const soVisitante = await ReadingProgress.create({ ...base, anonymousId: ANON });
    expect(soVisitante.anonymousId).toBe(ANON);
  });

  it('marca completed a partir de 90% e recusa percent fora de 0..1', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      userId: auth.getId('user'),
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
    };

    const quase = await ReadingProgress.create({ ...base, percent: 0.89 });
    expect(quase.completed).toBe(false);

    const fim = await ReadingProgress.create({
      ...base,
      episodeId: new mongoose.Types.ObjectId(),
      percent: 0.9,
    });
    expect(fim.completed).toBe(true);

    await expect(
      ReadingProgress.create({ ...base, episodeId: new mongoose.Types.ObjectId(), percent: 1.5 }),
    ).rejects.toThrow();
  });
});
