/**
 * Fase 5 Bloco 3, Task 3 — rotas do leitor. Composição de visibilidade igual
 * à de GET /content/series/:id (content.js:173-186) + isPublished obrigatório
 * para TODOS; dono -> 400 propria_obra; validade decidida na escrita.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Sinalizacao, CasoCuradoria, engagementLogger, svc;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode');
  Channel = require('../../models/Channel'); User = require('../../models/User');
  Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  engagementLogger = require('../../services/engagementLogger');
  svc = require('../../services/curadoriaService');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

const USER = () => `Bearer ${auth.getToken('user')}`;
const PREMIUM = () => `Bearer ${auth.getToken('premium')}`;

let n = 0;
async function criarLeitor({ createdAt } = {}) {
  n += 1;
  const email = `leitor-${n}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome: `Leitor ${n}`, role: 'user' });
  if (createdAt) await User.collection.updateOne({ _id: user._id }, { $set: { createdAt } });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { id: String(user._id), token: `Bearer ${login.body.accessToken}` };
}

async function criarObra(overrides = {}) {
  n += 1;
  const dono = await User.create({ email: `dono-${n}-${Date.now()}@lorflux.test`, passwordHash: 'x', nome: 'Dono', role: 'user' });
  const canal = await Channel.create({ ownerId: dono._id, name: `Canal ${n} ${Date.now()}` });
  const serie = await Series.create({ title: 'Obra Sinalizavel 9', genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', tags: [], channelId: canal._id, ...overrides });
  const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, ep, canal, dono };
}

/** Consumo real: abre o episódio logado (gera EngagementEvent com userId). */
async function consumir(token, ep) {
  await request(app).get(`/api/content/episodes/${ep._id}`).set('Authorization', token).set('X-Forwarded-For', `50.0.${n}.${Math.floor(Math.random() * 250)}`);
  await engagementLogger.flushForTests();
}

describe('POST /api/content/series/:id/sinalizar', () => {
  it('guest -> 401 e nada gravado', async () => {
    const { serie } = await criarObra();
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(401);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('com consumo real -> 201 valida; 2ª do mesmo usuário -> 200 jaSinalizada sem write; motivo não muda', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    await consumir(leitor.token, ep);
    const r1 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r1.status).toBe(201);
    expect(r1.body).toEqual({ jaSinalizada: false });
    const doc = await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean();
    expect(doc).toMatchObject({ valida: true, invalidaMotivo: null, grave: false, motivo: 'spam_ou_enganoso' });
    expect(doc.contaCriadaEm).toBeInstanceOf(Date);
    expect(doc.ipHash).toMatch(/^[0-9a-f]{64}$/);

    const r2 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'outro', descricao: 'mudei de ideia' });
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ jaSinalizada: true });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, userId: leitor.id })).toBe(1);
    expect((await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean()).motivo).toBe('spam_ou_enganoso');
    await svc.flushForTests();
  });

  it('sem consumo (motivo normal) -> 201 igual, mas gravada valida:false sem_consumo; só ReadingProgress NÃO é consumo', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    await request(app).put('/api/me/progress').set('Authorization', leitor.token).send({ seriesId: String(serie._id), episodeId: String(ep._id), contentType: 'hiqua', percent: 0.8, position: 3 });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'discurso_de_odio' });
    expect(r.status).toBe(201);
    const doc = await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean();
    expect(doc).toMatchObject({ valida: false, invalidaMotivo: 'sem_consumo' });
  });

  it('só evento FLAGGED não é consumo (2ª abertura do mesmo episódio pelo mesmo IP em 6h)', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    // 1ª abertura anônima do IP X -> evento válido do anônimo; 2ª abertura
    // logada do MESMO IP e episódio -> flagged:'dedupe' (engagementLogger.js:69-84)
    await request(app).get(`/api/content/episodes/${ep._id}`).set('X-Forwarded-For', '51.0.0.7');
    await request(app).get(`/api/content/episodes/${ep._id}`).set('Authorization', leitor.token).set('X-Forwarded-For', '51.0.0.7');
    await engagementLogger.flushForTests();
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(201);
    expect((await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean()).valida).toBe(false);
  });

  it('grave sem consumo -> valida:true (titular de direitos não precisa ler)', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'direitos_autorais', descricao: 'Arte copiada da minha HQ.' });
    expect(r.status).toBe(201);
    expect((await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean())).toMatchObject({ valida: true, grave: true });
    await svc.flushForTests();
  });

  it('validação do body: motivo fora do enum (inclusive violencia_excessiva) 400; outro sem descrição 400; descrição > 500 400; descrição não-string 400', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    for (const body of [
      { motivo: 'violencia_excessiva' }, { motivo: 'x' }, {}, { motivo: 'outro' }, { motivo: 'outro', descricao: '   ' },
      { motivo: 'spam_ou_enganoso', descricao: 'a'.repeat(501) },
      // Fix round T3 (item 6): descricao não-string coagida por String() virava
      // "[object Object]" e passava a validação de tamanho — 400 explícito.
      { motivo: 'spam_ou_enganoso', descricao: { a: 1 } },
      { motivo: 'spam_ou_enganoso', descricao: ['a'] },
      { motivo: 'spam_ou_enganoso', descricao: 12 },
    ]) {
      const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('rascunho -> 404 sem write (inclusive admin); despublicada -> 404; id malformado -> 404; inexistente -> 404', async () => {
    const { serie } = await criarObra({ isPublished: false });
    const leitor = await criarLeitor();
    for (const token of [leitor.token, `Bearer ${auth.getToken('admin')}`]) {
      const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', token).send({ motivo: 'spam_ou_enganoso' });
      expect(r.status).toBe(404);
    }
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
    expect((await request(app).post('/api/content/series/abc/sinalizar').set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' })).status).toBe(404);
    expect((await request(app).post(`/api/content/series/${new mongoose.Types.ObjectId()}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' })).status).toBe(404);
  });

  it('obra invisível pelo filtro parental -> 404 sem write', async () => {
    const { serie } = await criarObra({ content_rating: 'young', tags: ['terror'] });
    const leitor = await criarLeitor();
    await User.updateOne({ _id: leitor.id }, { $set: { 'parental.classificacaoEtaria': 'kids' } });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(404);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('dono do canal -> 400 code propria_obra, sem write', async () => {
    const { serie, dono } = await criarObra();
    const senha = 'Senha@123';
    await User.updateOne({ _id: dono._id }, { $set: { passwordHash: await bcrypt.hash(senha, 10) } });
    const login = await request(app).post('/api/auth/login').send({ email: dono.email, password: senha });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', `Bearer ${login.body.accessToken}`).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('propria_obra');
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('conta desativada -> 403 herdado do middleware global (nenhuma lógica na rota)', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    await User.updateOne({ _id: leitor.id }, { $set: { isActive: false } });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(403);
  });

  it('contaCriadaEm cai em _id.getTimestamp() para User sem createdAt', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(leitor.id) }, { $unset: { createdAt: 1 } });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'direitos_autorais', descricao: 'x' });
    expect(r.status).toBe(201);
    const doc = await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean();
    expect(doc.contaCriadaEm.getTime()).toBe(new mongoose.Types.ObjectId(leitor.id).getTimestamp().getTime());
    await svc.flushForTests();
  });

  // Fix round T3 (item 5): o teste original chamava-se "falha na avaliação não
  // afeta o 201" mas o mock (`Promise.reject(...).catch(() => null)`) já
  // resolve ANTES de chegar ao spy — nunca exercitou uma rejeição de verdade.
  // A garantia de absorção de erro de dispararAvaliacao já é do
  // curadoriaService.test.js ("dispararAvaliacao absorve o erro"); aqui só
  // provamos QUANDO a rota dispara (só sinalização válida) e QUE dispara
  // depois do 201 já resolvido (fire-and-forget).
  it('sinalização VÁLIDA dispara a avaliação (fire-and-forget, após o 201); inválida NÃO dispara', async () => {
    const { serie, ep } = await criarObra();
    const spy = vi.spyOn(svc, 'dispararAvaliacao');
    const semConsumo = await criarLeitor();
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', semConsumo.token).send({ motivo: 'spam_ou_enganoso' });
    expect(spy).not.toHaveBeenCalled();

    const comConsumo = await criarLeitor();
    await consumir(comConsumo.token, ep);
    spy.mockImplementationOnce(() => Promise.resolve(null));
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', comConsumo.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toBe(String(serie._id));
    // item 3(d) do fix round: os 2 leitores (semConsumo inválida + comConsumo
    // válida) gravaram, cada um, o próprio documento.
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(2);
    spy.mockRestore();
  });

  // Fix round T3 (item 2, MÉDIO): 2 requisições do MESMO leitor em paralelo —
  // ambas podem passar pelo `findOne` de idempotência antes de qualquer uma
  // escrever (corrida real, não simulada). O índice único {userId,seriesId}
  // do banco decide: uma cria (201), a outra esbarra em E11000 e o catch da
  // rota devolve 200 jaSinalizada — nunca 500, nunca 2 documentos.
  it('corrida real (Promise.all) do mesmo leitor -> [200,201] ordenados, 1 único documento', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    await consumir(leitor.token, ep);
    const enviar = () => request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    const [a, b] = await Promise.all([enviar(), enviar()]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 201]);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, userId: leitor.id })).toBe(1);
    await svc.flushForTests();
  });

  // Fix round T3 (item 3a): obra criada sem canal (channelId ausente) — o
  // check de "propria_obra" (que depende de Channel.findById) é pulado; a
  // sinalização segue normal. avaliarObra tratando "sem canal" já é do
  // curadoriaService.test.js — aqui só a ROTA do leitor.
  it('obra sem canal (channelId ausente) -> 201 normal, doc gravado', async () => {
    const { serie, ep } = await criarObra({ channelId: undefined });
    expect(serie.channelId).toBeFalsy();
    const leitor = await criarLeitor();
    await consumir(leitor.token, ep);
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(201);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, userId: leitor.id })).toBe(1);
    await svc.flushForTests();
  });

  // Fix round T3 (item 3b): unique é {userId, seriesId} — dois leitores
  // DIFERENTES na MESMA obra não colidem; cada um grava o próprio documento.
  it('2 leitores diferentes sinalizando a mesma obra -> 2 documentos', async () => {
    const { serie, ep } = await criarObra();
    const leitor1 = await criarLeitor();
    const leitor2 = await criarLeitor();
    await consumir(leitor1.token, ep);
    await consumir(leitor2.token, ep);
    const r1 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor1.token).send({ motivo: 'spam_ou_enganoso' });
    const r2 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor2.token).send({ motivo: 'discurso_de_odio' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(2);
    await svc.flushForTests();
  });

  // Fix round T3 (item 3c): letra da regra 5 (spec, "Modelo Sinalizacao") —
  // uma conta sinaliza uma obra UMA vez PARA SEMPRE, mesmo depois de o caso
  // ser revisado (revisadaEm marcado). O `findOne` de idempotência da rota
  // não filtra por revisadaEm — é {userId, seriesId} puro.
  it('2ª tentativa do mesmo leitor após revisadaEm (caso já revisado) -> ainda 200 jaSinalizada, 1 doc', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    await consumir(leitor.token, ep);
    const r1 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r1.status).toBe(201);
    await svc.flushForTests();
    await Sinalizacao.updateOne({ userId: leitor.id, seriesId: serie._id }, { $set: { revisadaEm: new Date() } });
    const r2 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'outro', descricao: 'nova tentativa' });
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ jaSinalizada: true });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, userId: leitor.id })).toBe(1);
  });
});

describe('GET /api/content/series/:id/sinalizacao', () => {
  it('guest 401; logado sem sinalização {jaSinalizada:false, motivo:null}; com -> motivo; rascunho 404; NUNCA contagens', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    expect((await request(app).get(`/api/content/series/${serie._id}/sinalizacao`)).status).toBe(401);
    const r0 = await request(app).get(`/api/content/series/${serie._id}/sinalizacao`).set('Authorization', leitor.token);
    expect(r0.body).toEqual({ jaSinalizada: false, motivo: null });
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'x' });
    await svc.flushForTests();
    const r1 = await request(app).get(`/api/content/series/${serie._id}/sinalizacao`).set('Authorization', leitor.token);
    expect(r1.body).toEqual({ jaSinalizada: true, motivo: 'conteudo_proibido' });
    expect(Object.keys(r1.body).sort()).toEqual(['jaSinalizada', 'motivo']);

    const { serie: draft } = await criarObra({ isPublished: false });
    expect((await request(app).get(`/api/content/series/${draft._id}/sinalizacao`).set('Authorization', leitor.token)).status).toBe(404);
  });

  // Fix round T3 (item 1, ALTO): o GET usa o MESMO helper serieSinalizavel
  // do POST (Series.findById + isPublished + serieVisivelPara) — este bloco
  // prova cada perna da composição isoladamente, não só via o rascunho do
  // teste acima. Prova por mutação registrada no relatório do fix round
  // (remoção temporária de serieVisivelPara em routes/sinalizacao.js fez
  // este teste cair, depois restaurada).
  it('obra invisível pelo filtro parental -> 404 sem gravar nada', async () => {
    const { serie } = await criarObra({ content_rating: 'young', tags: ['terror'] });
    const leitor = await criarLeitor();
    await User.updateOne({ _id: leitor.id }, { $set: { 'parental.classificacaoEtaria': 'kids' } });
    const r = await request(app).get(`/api/content/series/${serie._id}/sinalizacao`).set('Authorization', leitor.token);
    expect(r.status).toBe(404);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('id inexistente -> 404', async () => {
    const leitor = await criarLeitor();
    const r = await request(app).get(`/api/content/series/${new mongoose.Types.ObjectId()}/sinalizacao`).set('Authorization', leitor.token);
    expect(r.status).toBe(404);
  });

  it('id malformado -> 404', async () => {
    const leitor = await criarLeitor();
    const r = await request(app).get('/api/content/series/abc/sinalizacao').set('Authorization', leitor.token);
    expect(r.status).toBe(404);
  });
});

describe('shape público inalterado', () => {
  it('GET /content/series/:id e /content/series não trazem nenhuma chave de curadoria', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'x' });
    await svc.flushForTests();
    const doc = await request(app).get(`/api/content/series/${serie._id}`).set('Authorization', USER());
    const lista = await request(app).get('/api/content/series').set('Authorization', PREMIUM());
    for (const corpo of [JSON.stringify(doc.body), JSON.stringify(lista.body)]) {
      expect(corpo).not.toMatch(/sinalizac|casoId|gatilho|"S"|"V"|prioridade|curadoria/i);
    }
  });
});

// Fix round T3 (item 4): middlewares/sinalizacaoLimiter.js é no-op quando
// NODE_ENV==='test' (padrão do repo, molde accountLimiter.js) — o resto da
// suíte roda inteira sem NUNCA exercitar o rate-limit de verdade. Este bloco
// força NODE_ENV='development' e recarrega o módulo para testar o limiter
// isolado, num app Express PRÓPRIO e minúsculo (via supertest) — caminho
// escolhido em vez de um `res` fake porque express-rate-limit 7.5.1 usa APIs
// internas (setHeader/getHeader/end) que um mock manual replicaria de forma
// frágil; um app real via supertest é o contrato público da lib. O reload
// usa require.cache diretamente, não vi.resetModules() — achado deste fix
// round: este repo carrega tudo via require() (CJS) puro, e vi.resetModules()
// gerencia o registro de módulos do PRÓPRIO vitest (import/ESM), não o
// require.cache nativo do Node — com só vi.resetModules() o require()
// abaixo devolvia o mesmo no-op já cacheado desde o beforeAll (NODE_ENV
// ainda 'test' na hora em que server.js->routes/sinalizacao.js primeiro
// carregou o módulo) e o teste sempre via 200. Roda por ÚLTIMO no arquivo e
// restaura NODE_ENV/require.cache no afterAll para não vazar para as outras
// describes deste arquivo nem para os próximos arquivos da suíte
// (fileParallelism:false).
describe('middlewares/sinalizacaoLimiter — 30 req/h por usuário (fora de NODE_ENV=test)', () => {
  const NODE_ENV_ORIGINAL = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = NODE_ENV_ORIGINAL;
    // Devolve o módulo ao estado no-op de teste para o resto da suíte
    // (outros arquivos de teste também requerem sinalizacaoLimiter via
    // routes/sinalizacao.js -> server.js).
    delete require.cache[require.resolve('../../middlewares/sinalizacaoLimiter')];
    require('../../middlewares/sinalizacaoLimiter');
  });

  it('31ª requisição do MESMO usuário na janela -> 429; outro usuário na mesma janela não é afetado', async () => {
    // vi.resetModules() por si só NÃO reevalua módulos carregados via
    // require() puro (CJS) neste repo — o cache que decide é o
    // require.cache nativo do Node. sinalizacaoLimiter.js já tinha sido
    // executado em NODE_ENV=test (via server.js no beforeAll) e ficou preso
    // no ramo no-op; sem este delete explícito o teste mede o middleware
    // ERRADO (sempre 200, achado do próprio fix round).
    delete require.cache[require.resolve('../../middlewares/sinalizacaoLimiter')];
    process.env.NODE_ENV = 'development';
    const sinalizacaoLimiter = require('../../middlewares/sinalizacaoLimiter');
    const express = require('express');

    const appTeste = express();
    // keyGenerator da lib usa req.user.id (routes/sinalizacao.js monta o
    // limiter DEPOIS de verifyToken) — aqui simulamos só essa parte.
    appTeste.use((req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); });
    appTeste.use(sinalizacaoLimiter);
    appTeste.get('/ping', (req, res) => res.status(200).json({ ok: true }));

    let statusFinalU1;
    for (let i = 0; i < 31; i++) {
      const r = await request(appTeste).get('/ping').set('x-user', 'u1');
      statusFinalU1 = r.status;
    }
    expect(statusFinalU1).toBe(429);

    const rOutro = await request(appTeste).get('/ping').set('x-user', 'u2');
    expect(rOutro.status).toBe(200);
  });
});
