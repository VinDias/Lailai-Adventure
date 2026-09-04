/**
 * Fase 5 Bloco 3, Task 5 — fronteira LGPD e órfãos. A sinalização é dado do
 * LEITOR (export + exclusão dele); casos/sinalizações sobre a obra do ARTISTA
 * não são dado dele (nada no export dele além das MensagemPortal do B1).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Sinalizacao, CasoCuradoria, MensagemPortal, svc, L;
const oid = () => new mongoose.Types.ObjectId();
const ADMIN = () => `Bearer ${auth.getToken('admin')}`;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode'); Channel = require('../../models/Channel');
  User = require('../../models/User'); Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  MensagemPortal = require('../../models/MensagemPortal');
  svc = require('../../services/curadoriaService'); L = require('../../utils/curadoriaLimiares');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

let n = 0;
async function criarConta(role = 'user') {
  n += 1;
  const email = `lgpd-${n}-${Date.now()}@lorflux.test`; const senha = 'Senha@123';
  const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome: `Conta ${n}`, role });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { user, id: String(user._id), token: `Bearer ${login.body.accessToken}`, senha };
}
async function criarObraDe(dono, title = 'Obra LGPD 8') {
  const canal = await Channel.create({ ownerId: dono.user._id, name: `Canal ${n} ${Date.now()}` });
  const serie = await Series.create({ title, genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', channelId: canal._id });
  await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, canal };
}
async function abrirCasoGrave(serieId) {
  await Sinalizacao.insertMany(Array.from({ length: 5 }, (_, i) => ({ seriesId: serieId, userId: oid(), motivo: 'conteudo_proibido', grave: true, valida: true, contaCriadaEm: new Date('2026-01-01T00:00:00Z'), ipHash: `ip${n}${i}` })));
  return svc.avaliarObra(serieId, { agora: new Date('2026-09-12T00:00:00Z') });
}

describe('export do TITULAR', () => {
  it('inclui sinalizacoes {seriesId, titulo, motivo, descricao, createdAt}; título null se a série foi apagada; nunca o caso', async () => {
    const leitor = await criarConta();
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista, 'Titulo Exportado 3');
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'direitos_autorais', descricao: 'minha arte' });
    await svc.flushForTests();
    const apagada = await Series.create({ title: 'Vai Sumir', genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young' });
    await Sinalizacao.create({ seriesId: apagada._id, userId: leitor.id, motivo: 'outro', descricao: 'x', grave: false, valida: false, invalidaMotivo: 'sem_consumo', contaCriadaEm: new Date() });
    await Series.deleteOne({ _id: apagada._id }); // apagada por fora, sem limpeza

    const r = await request(app).get('/api/account/me/export').set('Authorization', leitor.token);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.text);
    expect(body.sinalizacoes).toHaveLength(2);
    const s1 = body.sinalizacoes.find(s => s.titulo === 'Titulo Exportado 3');
    expect(s1).toEqual({ seriesId: String(serie._id), titulo: 'Titulo Exportado 3', motivo: 'direitos_autorais', descricao: 'minha arte', createdAt: expect.any(String) });
    expect(body.sinalizacoes.find(s => s.seriesId === String(apagada._id)).titulo).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/casoId|gatilho|valida|ipHash|contaCriadaEm/);
  });

  it('export do ARTISTA não recebe nada de curadoria (só as MensagemPortal do B1)', async () => {
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista, 'Obra do Artista 6');
    await abrirCasoGrave(serie._id);
    const r = await request(app).get('/api/account/me/export').set('Authorization', artista.token);
    const body = JSON.parse(r.text);
    expect(body.sinalizacoes).toEqual([]);
    expect(body.portalMessages.some(m => String(m.refId) === String(serie._id))).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/sinalizacoesRecebidas|casos|gatilho|"S"|prioridade/);
  });
});

describe('DELETE /api/account/me', () => {
  it('apaga as sinalizações do titular (descrições junto) e NÃO as de outros leitores — escopo provado por contagem global', async () => {
    const leitor = await criarConta();
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista);
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'apagar comigo' });
    await svc.flushForTests();
    expect(await Sinalizacao.countDocuments({ userId: leitor.id })).toBe(1);
    // TESTEMUNHA: outro leitor, outra obra. Sem ela, um
    // `Sinalizacao.deleteMany({})` no lugar do `{userId}` passaria VERDE —
    // provado por mutação. A contagem GLOBAL com delta exato é o pino.
    const outroLeitor = await criarConta();
    const { serie: outraSerie } = await criarObraDe(artista, 'Obra Testemunha 4');
    await request(app).post(`/api/content/series/${outraSerie._id}/sinalizar`).set('Authorization', outroLeitor.token).send({ motivo: 'conteudo_proibido', descricao: 'fica' });
    await svc.flushForTests();

    const antes = await Sinalizacao.countDocuments({});
    const r = await request(app).delete('/api/account/me').set('Authorization', leitor.token).send({ password: leitor.senha });
    expect(r.status).toBe(200);
    expect(await Sinalizacao.countDocuments({ userId: leitor.id })).toBe(0);
    expect(await Sinalizacao.countDocuments({})).toBe(antes - 1);
    expect(await Sinalizacao.countDocuments({ userId: outroLeitor.id })).toBe(1);
  });
});

describe('DELETE /api/content/series/:id (admin)', () => {
  it('apaga Sinalizacao e CasoCuradoria da obra: fila fica sem o caso, badge cai, 0 órfãs no export do leitor; nada de OUTRAS obras é tocado', async () => {
    const leitor = await criarConta();
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista);
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'x' });
    await svc.flushForTests();
    const caso = await abrirCasoGrave(serie._id);
    expect(caso).toBeTruthy();
    // TESTEMUNHAS: sinalização de outro leitor e CASO ABERTO de OUTRA obra.
    // Sem elas, trocar os dois filtros `{seriesId}` por `{}` mantinha a suíte
    // verde (provado por mutação); as contagens GLOBAIS com delta exato são o
    // pino de escopo.
    const outroLeitor = await criarConta();
    const { serie: outraSerie } = await criarObraDe(artista, 'Obra Testemunha 9');
    await request(app).post(`/api/content/series/${outraSerie._id}/sinalizar`).set('Authorization', outroLeitor.token).send({ motivo: 'conteudo_proibido', descricao: 'fica' });
    await svc.flushForTests();
    const casoTestemunha = await abrirCasoGrave(outraSerie._id);
    expect(casoTestemunha).toBeTruthy();

    const antes = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    const antesSinalizacoes = await Sinalizacao.countDocuments({});
    const antesCasos = await CasoCuradoria.countDocuments({});

    const r = await request(app).delete(`/api/content/series/${serie._id}`).set('Authorization', ADMIN());
    expect(r.status).toBe(200);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(0);
    // 6 = 1 do leitor + as 5 do gatilho grave desta obra; 1 caso.
    expect(await Sinalizacao.countDocuments({})).toBe(antesSinalizacoes - 6);
    expect(await CasoCuradoria.countDocuments({})).toBe(antesCasos - 1);
    expect(await CasoCuradoria.countDocuments({ _id: casoTestemunha._id })).toBe(1);
    expect(await Sinalizacao.countDocuments({ seriesId: outraSerie._id })).toBe(6);
    const fila = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(fila.body.casos.some(c => c.casoId === String(caso._id))).toBe(false);
    const depois = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(depois.body.curadoria.abertos).toBe(antes.body.curadoria.abertos - 1);
    const exp = JSON.parse((await request(app).get('/api/account/me/export').set('Authorization', leitor.token)).text);
    expect(exp.sinalizacoes.some(s => s.seriesId === String(serie._id))).toBe(false);
  });
});

describe('portal do artista sem vazamento', () => {
  it('GET /portal/series e /portal/meu-estudio não trazem nenhuma chave de curadoria; o aviso conta como não lida', async () => {
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista);
    await abrirCasoGrave(serie._id);
    const series = await request(app).get('/api/portal/series').set('Authorization', artista.token);
    const estudio = await request(app).get('/api/portal/meu-estudio').set('Authorization', artista.token);
    for (const corpo of [JSON.stringify(series.body), JSON.stringify(estudio.body)]) {
      expect(corpo).not.toMatch(/sinalizac|casoId|gatilho|prioridade|curadoria|emRevisao/i);
    }
    // não lidas: a rota do estúdio expõe a contagem de mensagens do editor não lidas (routes/portal.js:68-74) — campo real: mensagensNaoLidas.
    expect(JSON.stringify(estudio.body)).toMatch(/aoLidas|naoLidas|unread/i);
  });
});
