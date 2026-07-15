/**
 * Testes: Fase 3 — Motor de Royalties e Anti-fraude
 * Cobre: cadeia de hash do EngagementEvent, anti-fraude (dedupe/burst),
 * instrumentação (view/read/ad_impression), relatório por canal,
 * fechamento de período (pool híbrido) e verificação de integridade.
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let engagementLogger;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  engagementLogger = require('../../services/engagementLogger');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

const currentPeriod = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Helpers de cenário
async function createChannel(name) {
  const Channel = require('../../models/Channel');
  return Channel.create({ ownerId: auth.getId('admin'), name });
}

async function createSeriesWithChannel(title, contentType, channelId) {
  const res = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${auth.getToken('admin')}`)
    .send({ title, genre: 'Teste', content_type: contentType, isPublished: true, channelId });
  return res.body;
}

async function createEpisode(seriesId, n) {
  const res = await request(app)
    .post('/api/content/episodes')
    .set('Authorization', `Bearer ${auth.getToken('admin')}`)
    .send({ seriesId, episode_number: n, title: `Ep ${n}` });
  return res.body;
}

describe('engagementLogger — cadeia de hash', () => {
  it('eventos formam cadeia: prevHash do N+1 = hash do N, seq crescente', async () => {
    const e1 = await engagementLogger.logEvent({ type: 'view', ip: '10.0.0.1', ua: 'test' });
    const e2 = await engagementLogger.logEvent({ type: 'view', ip: '10.0.0.2', ua: 'test' });

    expect(e2.seq).toBe(e1.seq + 1);
    expect(e2.prevHash).toBe(e1.hash);
    expect(e1.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('logEvent nunca lança para o chamador em dados estranhos', async () => {
    await expect(engagementLogger.logEvent({ type: 'view' })).resolves.toBeTruthy();
  });
});

describe('anti-fraude', () => {
  it('dedupe: 2ª view do mesmo usuário no mesmo episódio em 6h é flagged', async () => {
    const ch = await createChannel('Canal Dedupe');
    const serie = await createSeriesWithChannel('Serie Dedupe', 'vcine', ch._id);
    const ep = await createEpisode(serie._id, 1);

    const first = await engagementLogger.logEvent({
      type: 'view', seriesId: serie._id, episodeId: ep._id, userId: auth.getId('user'), ip: '10.1.0.1', ua: 'x',
    });
    const second = await engagementLogger.logEvent({
      type: 'view', seriesId: serie._id, episodeId: ep._id, userId: auth.getId('user'), ip: '10.1.0.2', ua: 'x',
    });

    expect(first.flagged).toBe(false);
    expect(second.flagged).toBe(true);
    expect(second.flagReason).toBe('dedupe');
  });

  it('dedupe por IP cobre usuários anônimos', async () => {
    const ch = await createChannel('Canal Anon');
    const serie = await createSeriesWithChannel('Serie Anon', 'hiqua', ch._id);
    const ep = await createEpisode(serie._id, 1);

    const first = await engagementLogger.logEvent({ type: 'read', seriesId: serie._id, episodeId: ep._id, ip: '10.2.0.9', ua: 'x' });
    const second = await engagementLogger.logEvent({ type: 'read', seriesId: serie._id, episodeId: ep._id, ip: '10.2.0.9', ua: 'x' });

    expect(first.flagged).toBe(false);
    expect(second.flagged).toBe(true);
  });

  it('burst: mais de 30 eventos do mesmo IP em 60s são flagged', async () => {
    let flaggedCount = 0;
    for (let i = 0; i < 35; i++) {
      const e = await engagementLogger.logEvent({ type: 'ad_impression', ip: '10.3.0.1', ua: 'x' });
      if (e.flagged) flaggedCount++;
    }
    expect(flaggedCount).toBeGreaterThanOrEqual(4); // eventos 31..35
  });
});

describe('instrumentação das rotas', () => {
  it('GET /episodes/:id de série vcine loga "view"; hiqua loga "read"', async () => {
    const ch = await createChannel('Canal Instr');
    const sVideo = await createSeriesWithChannel('Serie Video', 'vcine', ch._id);
    const sToon = await createSeriesWithChannel('Serie Toon', 'hiqua', ch._id);
    const epV = await createEpisode(sVideo._id, 1);
    const epT = await createEpisode(sToon._id, 1);

    await request(app).get(`/api/content/episodes/${epV._id}`).set('X-Forwarded-For', '10.4.0.1');
    await request(app).get(`/api/content/episodes/${epT._id}`).set('X-Forwarded-For', '10.4.0.2');
    await engagementLogger.flushForTests();

    const EngagementEvent = require('../../models/EngagementEvent');
    const view = await EngagementEvent.findOne({ episodeId: epV._id }).lean();
    const read = await EngagementEvent.findOne({ episodeId: epT._id }).lean();

    expect(view.type).toBe('view');
    expect(String(view.seriesId)).toBe(String(sVideo._id));
    expect(read.type).toBe('read');
    // IP nunca é gravado puro (LGPD)
    expect(JSON.stringify(view)).not.toContain('10.4.0.1');
  });

  it('POST /api/admin/ads/:id/impression loga ad_impression', async () => {
    const Ad = require('../../models/Ad');
    const ad = await Ad.create({ title: 'Ad Log', image_url: 'https://x.com/a.png' });

    await request(app).post(`/api/admin/ads/${ad._id}/impression`).set('X-Forwarded-For', '10.5.0.1');
    await engagementLogger.flushForTests();

    const EngagementEvent = require('../../models/EngagementEvent');
    const ev = await EngagementEvent.findOne({ type: 'ad_impression', adId: ad._id }).lean();
    expect(ev).toBeTruthy();
  });
});

describe('relatório e fechamento', () => {
  let chA, chB;

  beforeAll(async () => {
    // Cenário limpo: zera eventos anteriores destes testes
    const EngagementEvent = require('../../models/EngagementEvent');
    await EngagementEvent.deleteMany({});

    const Setting = require('../../models/Setting');
    await Setting.findOneAndUpdate({ key: 'premium_cpm_rate' }, { value: '10' }, { upsert: true });
    await Setting.findOneAndUpdate({ key: 'royalty_premium_per_sub' }, { value: '2' }, { upsert: true });

    chA = await createChannel('Canal A');
    chB = await createChannel('Canal B');
    const sA = await createSeriesWithChannel('Obra A', 'vcine', chA._id);
    const sB = await createSeriesWithChannel('Obra B', 'hiqua', chB._id);
    const epA = await createEpisode(sA._id, 1);
    const epB = await createEpisode(sB._id, 1);

    // 3 views válidas para A (usuários/IPs distintos), 1 válida para B
    for (let i = 0; i < 3; i++) {
      await engagementLogger.logEvent({ type: 'view', seriesId: sA._id, episodeId: epA._id, ip: `20.0.0.${i}`, ua: 'x' });
    }
    await engagementLogger.logEvent({ type: 'read', seriesId: sB._id, episodeId: epB._id, ip: '20.0.1.1', ua: 'x' });
    // 1 duplicada (flagged) para B — não deve contar
    await engagementLogger.logEvent({ type: 'read', seriesId: sB._id, episodeId: epB._id, ip: '20.0.1.1', ua: 'x' });
    // 100 impressões válidas de anúncio (IPs distintos) → pool ads = 100/1000×10 = 1.0
    for (let i = 0; i < 100; i++) {
      await engagementLogger.logEvent({ type: 'ad_impression', ip: `21.0.${Math.floor(i / 250)}.${i % 250}`, ua: 'x' });
    }
  });

  it('GET /report agrupa pontos válidos por canal e calcula share', async () => {
    const res = await request(app)
      .get(`/api/admin/royalties/report?period=${currentPeriod()}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);

    expect(res.status).toBe(200);
    const a = res.body.channels.find(c => c.channelName === 'Canal A');
    const b = res.body.channels.find(c => c.channelName === 'Canal B');

    expect(a.points).toBe(3);
    expect(b.points).toBe(1); // a duplicada flagged ficou fora
    expect(a.share).toBeCloseTo(0.75);
    expect(b.share).toBeCloseTo(0.25);
  });

  it('pool sugerido = impressões/1000 × CPM + premium ativos × valor por assinante', async () => {
    const res = await request(app)
      .get(`/api/admin/royalties/report?period=${currentPeriod()}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);

    // 100 impressões ÷ 1000 × 10 = 1.0 | 1 premium ativo × 2 = 2.0
    expect(res.body.poolSuggested).toBeCloseTo(3.0);
    expect(res.body.adImpressions).toBe(100);
    expect(res.body.premiumUsers).toBe(1);
  });

  it('POST /close fecha o período com poolFinal e amounts por share', async () => {
    const res = await request(app)
      .post('/api/admin/royalties/close')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ period: currentPeriod(), poolFinal: 100 });

    expect(res.status).toBe(201);
    const RoyaltyPeriod = require('../../models/RoyaltyPeriod');
    const doc = await RoyaltyPeriod.findOne({ period: currentPeriod() }).lean();
    expect(doc.status).toBe('closed');
    expect(doc.poolFinal).toBe(100);
    const a = doc.breakdown.find(x => x.channelName === 'Canal A');
    expect(a.amount).toBeCloseTo(75);
  });

  it('fechar o mesmo período duas vezes retorna 409', async () => {
    const res = await request(app)
      .post('/api/admin/royalties/close')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ period: currentPeriod(), poolFinal: 50 });
    expect(res.status).toBe(409);
  });

  it('export.csv retorna CSV com os canais', async () => {
    const res = await request(app)
      .get(`/api/admin/royalties/export.csv?period=${currentPeriod()}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Canal A');
  });

  it('usuário comum não acessa o relatório', async () => {
    const res = await request(app)
      .get(`/api/admin/royalties/report?period=${currentPeriod()}`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

describe('integridade da cadeia', () => {
  it('verify-integrity aprova a cadeia intacta e detecta adulteração', async () => {
    const ok = await request(app)
      .get('/api/admin/royalties/verify-integrity')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.checked).toBeGreaterThan(0);

    // Adultera um evento no meio da cadeia direto no banco
    const EngagementEvent = require('../../models/EngagementEvent');
    const victim = await EngagementEvent.findOne({ type: 'ad_impression' }).sort({ seq: 1 }).lean();
    await EngagementEvent.updateOne({ _id: victim._id }, { $set: { type: 'view' } });

    const tampered = await request(app)
      .get('/api/admin/royalties/verify-integrity')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
    expect(tampered.body.ok).toBe(false);
    expect(tampered.body.brokenAt).toBe(victim.seq);
  });
});
