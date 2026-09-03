/**
 * Testes: fundações de modelo do Portal do Ilustrador (Fase 5 Bloco 1, Task 1)
 * Series: genre required condicional a isPublished, content_rating_sugerida,
 * submittedAt. Episode: submittedAt.
 */
const db = require('../helpers/db');

let Series;
let Episode;

beforeAll(async () => {
  await db.connect();
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
});

afterAll(() => db.closeDatabase());

describe('Series — genre required condicional a isPublished', () => {
  it('série draft (isPublished false) sem genre salva normalmente', async () => {
    const serie = await Series.create({
      title: 'Rascunho Sem Genero',
      content_type: 'hiqua',
      isPublished: false,
    });
    expect(serie.genre).toBeUndefined();
  });

  it('série com isPublished true sem genre falha na validação', async () => {
    await expect(
      Series.create({
        title: 'Publicada Sem Genero',
        content_type: 'hiqua',
        isPublished: true,
      })
    ).rejects.toThrow();
  });

  it('série com isPublished true e genre preenchido salva normalmente', async () => {
    const serie = await Series.create({
      title: 'Publicada Com Genero',
      genre: 'Aventura',
      content_type: 'hiqua',
      isPublished: true,
    });
    expect(serie.genre).toBe('Aventura');
  });
});

describe('Series — content_rating_sugerida', () => {
  it('default null', async () => {
    const serie = await Series.create({ title: 'Sem Classificacao Sugerida', content_type: 'hiqua' });
    expect(serie.content_rating_sugerida).toBeNull();
  });

  it('aceita só os valores do enum (kids/teen/young)', async () => {
    const ok = await Series.create({
      title: 'Com Classificacao Kids',
      content_type: 'hiqua',
      content_rating_sugerida: 'kids',
    });
    expect(ok.content_rating_sugerida).toBe('kids');

    await expect(
      Series.create({
        title: 'Classificacao Invalida',
        content_type: 'hiqua',
        content_rating_sugerida: 'adulto',
      })
    ).rejects.toThrow();
  });
});

describe('Series — submittedAt', () => {
  it('default null', async () => {
    const serie = await Series.create({ title: 'Sem Submissao', content_type: 'hiqua' });
    expect(serie.submittedAt).toBeNull();
  });

  it('aceita data explícita', async () => {
    const data = new Date('2026-08-31T14:22:00.000Z'); // valor não-redondo
    const serie = await Series.create({ title: 'Com Submissao', content_type: 'hiqua', submittedAt: data });
    expect(serie.submittedAt.toISOString()).toBe(data.toISOString());
  });
});

describe('Episode — submittedAt', () => {
  it('default null', async () => {
    const serie = await Series.create({ title: 'Serie Para Episodio', content_type: 'hiqua' });
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1' });
    expect(ep.submittedAt).toBeNull();
  });

  it('aceita data explícita', async () => {
    const serie = await Series.create({ title: 'Serie Para Episodio 2', content_type: 'hiqua' });
    const data = new Date('2026-08-31T09:05:00.000Z'); // valor não-redondo
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', submittedAt: data });
    expect(ep.submittedAt.toISOString()).toBe(data.toISOString());
  });
});
