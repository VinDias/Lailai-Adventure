/**
 * Fase 5 Bloco 3, Task 4 — Fila de Revisão do admin e as 4 decisões. Regra
 * 8: o admin vê NÚMEROS, nunca identidades (nenhum userId/e-mail de leitor na
 * resposta); regra 1: "remover" = despublicar, nunca DELETE.
 *
 * Fix round T4 (revisão do commit 53470d5): itens 1-10 do revisor —
 * submittedAt no remover, robustez de solicitar-correcao/observacao, lock
 * otimista no fechamento (services/curadoriaService.js, testado aqui do lado
 * HTTP — o unitário mora em curadoriaService.test.js) e pinos de teste que a
 * suíte original não cobria (ciclo de descrições, relógio real, grep
 * anti-identidade, cobertura de AdminLog/404/401/mistura de prioridades).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Favorite, Sinalizacao, CasoCuradoria, MensagemPortal, AdminLog, svc, L;
const DIA_MS = 24 * 60 * 60 * 1000;
const oid = () => new mongoose.Types.ObjectId();
const ADMIN = () => `Bearer ${auth.getToken('admin')}`;
// Fix round T4 (item 9): grep por CHAVE JSON entre aspas, case-insensitive —
// a versão anterior (`/userId|@lorflux\.test|ipHash|contaCriadaEm/`) sem
// aspas corria o risco de casar substring solta; `decididoPor` (id do ADMIN,
// que É esperado na resposta) não contém nenhuma das chaves proibidas, então
// não casa em nenhuma das duas versões — mas a versão com aspas é a correta
// para não depender disso por sorte.
const REGEX_IDENTIDADE = /"(userId|ownerId|autorUserId|ownerUserId|ipHash|contaCriadaEm)"|@lorflux\.test/i;
// Fix round T4 (item 10b): AdminLog.details das 4 ações só guarda agregados
// (casoId, content_rating, motivo/texto DO CURADOR, avisoArtista) — nunca
// userId de leitor, a descrição de uma sinalização ou um e-mail de teste.
const REGEX_DETAILS_VAZAMENTO = /userId|descricao|@lorflux/i;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode'); Channel = require('../../models/Channel');
  User = require('../../models/User'); Favorite = require('../../models/Favorite');
  Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  MensagemPortal = require('../../models/MensagemPortal'); AdminLog = require('../../models/AdminLog');
  svc = require('../../services/curadoriaService'); L = require('../../utils/curadoriaLimiares');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

let n = 0;
async function criarObra({ comCanal = true, title = 'Obra da Fila 4' } = {}) {
  n += 1;
  let canal = null, dono = null;
  if (comCanal) {
    dono = await User.create({ email: `dono-fila-${n}-${Date.now()}@lorflux.test`, passwordHash: 'x', nome: `Dono ${n}`, role: 'user' });
    canal = await Channel.create({ ownerId: dono._id, name: `Canal ${n} ${Date.now()}` });
  }
  const serie = await Series.create({ title, genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', cover_image: 'https://cdn.exemplo/c.jpg', ...(canal ? { channelId: canal._id } : {}) });
  await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, canal, dono };
}
/** Dono com senha logável (molde curadoriaSinalizar.test.js:31-38) — só para o teste do item 10f (PUT /portal). */
async function criarObraComDonoLogavel(overrides = {}) {
  n += 1;
  const senha = 'Senha@123';
  const dono = await User.create({ email: `dono-fila-login-${n}-${Date.now()}@lorflux.test`, passwordHash: await bcrypt.hash(senha, 10), nome: `Dono Logavel ${n}`, role: 'user' });
  const canal = await Channel.create({ ownerId: dono._id, name: `Canal Login ${n} ${Date.now()}` });
  const serie = await Series.create({ title: 'Obra Portal 403', genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', channelId: canal._id, ...overrides });
  await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  const login = await request(app).post('/api/auth/login').send({ email: dono.email, password: senha });
  return { serie, canal, dono, donoToken: `Bearer ${login.body.accessToken}` };
}
async function sinalizar(serieId, { quantas, motivo = 'spam_ou_enganoso', idadeDias = 30, valida = true, invalidaMotivo = null, descricao = null }) {
  return Sinalizacao.insertMany(Array.from({ length: quantas }, (_, i) => ({
    seriesId: serieId, userId: oid(), motivo, grave: L.ehGrave(motivo), valida, invalidaMotivo, descricao,
    // Fix round T4 (item 8): contaCriadaEm relativo ao RELÓGIO REAL. GET
    // /admin/curadoria chama contarSinalizacoes SEM `agora` injetado (é a
    // contagem AO VIVO da fila — routes/adminCuradoria.js) — fixtures presas
    // a uma data ficcional (ex. 2026-09-12) furavam a idade mínima assim que
    // o relógio real do teste passasse dessa data, zerando S/S_grave/
    // ipsDistintos na resposta HTTP sem que nenhum teste percebesse (nenhum
    // conferia itemGrave.contagem antes deste fix round).
    contaCriadaEm: new Date(Date.now() - idadeDias * DIA_MS), ipHash: `ip-${n}-${i}`,
  })));
}
/** Abre um caso grave (5 graves maduras; V=0 basta). `agora` real — a rota lê ao vivo. */
async function abrirCasoGrave(serie) {
  await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 9, descricao: 'descrição do leitor' });
  return svc.avaliarObra(serie._id, { agora: new Date() });
}
async function abrirCasoNormal(serie) {
  // V=0 -> limiar 20; 20 válidas maduras abrem caso 'pequena'
  await sinalizar(serie._id, { quantas: 20 });
  return svc.avaliarObra(serie._id, { agora: new Date() });
}

describe('GET /api/admin/curadoria', () => {
  it('401 sem token; 403 não-admin', async () => {
    expect((await request(app).get('/api/admin/curadoria')).status).toBe(401);
    expect((await request(app).get('/api/admin/curadoria').set('Authorization', `Bearer ${auth.getToken('user')}`)).status).toBe(403);
  });

  it('lista abertos: graves primeiro, depois S/limiar desc; item com obra/canal/contagem/descrições anonimizadas/thread vigente; sem identidades', async () => {
    const { serie: normal, canal } = await criarObra({ title: 'Normal 12' });
    await abrirCasoNormal(normal);
    const { serie: grave } = await criarObra({ title: 'Grave 34' });
    await abrirCasoGrave(grave);
    // resposta do ilustrador na thread vigente (sem refId — portal.js:606-628)
    await MensagemPortal.create({ canalId: canal._id, ownerUserId: canal.ownerId, autorTipo: 'ilustrador', autorUserId: canal.ownerId, texto: 'Minha defesa aqui.' });

    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(r.status).toBe(200);
    const ids = r.body.casos.map(c => c.obra.id);
    expect(ids.indexOf(String(grave._id))).toBeLessThan(ids.indexOf(String(normal._id)));
    expect(r.body.graves).toBeGreaterThanOrEqual(1);
    expect(r.body.total).toBe(r.body.casos.length);

    const itemNormal = r.body.casos.find(c => c.obra.id === String(normal._id));
    expect(itemNormal).toMatchObject({ status: 'aberto', prioridade: 'normal', avisoArtista: 'enviado' });
    expect(itemNormal.obra).toMatchObject({ title: 'Normal 12', content_type: 'hiqua', content_rating: 'young', isPublished: true });
    expect(itemNormal.canal).toEqual({ id: String(canal._id), name: canal.name });
    expect(itemNormal.contagem).toMatchObject({ S: 20, S_grave: 0, V: 0, limiar: 20, semConsumo: 0, contasRecentes: 0, ipsDistintos: 20 });
    expect(itemNormal.thread.map(m => m.texto)).toContain('Minha defesa aqui.');
    expect(itemNormal.thread.every(m => Object.keys(m).sort().join() === ['autorTipo', 'createdAt', 'refId', 'texto'].join())).toBe(true);

    const itemGrave = r.body.casos.find(c => c.obra.id === String(grave._id));
    expect(itemGrave.descricoes).toHaveLength(5);
    expect(itemGrave.descricoes[0]).toEqual(expect.objectContaining({ motivo: 'conteudo_proibido', descricao: 'descrição do leitor' }));
    expect(Object.keys(itemGrave.descricoes[0]).sort()).toEqual(['createdAt', 'descricao', 'motivo']);
    // Fix round T4 (item 8): contagem ao vivo do item GRAVE nunca tinha sido
    // assertada — com o relógio real, S_grave=5 confirma que a idade mínima
    // de 7 dias (contas de 9 dias) está sendo aplicada corretamente na rota.
    expect(itemGrave.contagem).toMatchObject({ S: 5, S_grave: 5, V: 0, limiar: 5, semConsumo: 0, contasRecentes: 0, ipsDistintos: 5 });
    expect(JSON.stringify(r.body)).not.toMatch(REGEX_IDENTIDADE);
  });

  it('ordena dois casos graves entre si por S_grave desc (fix round T4, item 8)', async () => {
    const { serie: grave5 } = await criarObra({ title: 'Grave Cinco 41' });
    await abrirCasoGrave(grave5); // S_grave = 5
    const { serie: grave6 } = await criarObra({ title: 'Grave Seis 42' });
    await sinalizar(grave6._id, { quantas: 6, motivo: 'conteudo_proibido', idadeDias: 9 });
    await svc.avaliarObra(grave6._id, { agora: new Date() });

    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    const ids = r.body.casos.map(c => c.obra && c.obra.id);
    expect(ids.indexOf(String(grave6._id))).toBeLessThan(ids.indexOf(String(grave5._id)));
  });

  it('descrições são só do CICLO atual (revisadaEm:null) — fix round T4, item 7 (pino perdido, provado por mutação)', async () => {
    const { serie } = await criarObra({ title: 'Ciclo Duplo 5' });
    const caso1 = await abrirCasoGrave(serie); // ciclo 1: 5 descrições 'descrição do leitor'
    await request(app).post(`/api/admin/curadoria/${caso1._id}/aprovar`).set('Authorization', ADMIN()).send({});
    // ciclo 2: outras 5 graves maduras com descrição diferente
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 9, descricao: 'ciclo novo' });
    await svc.avaliarObra(serie._id, { agora: new Date() });

    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    const item = r.body.casos.find(c => c.obra && c.obra.id === String(serie._id));
    expect(item.descricoes).toHaveLength(5);
    expect(item.descricoes.every(d => d.descricao === 'ciclo novo')).toBe(true);
  });

  it('roda reavaliarPendentes antes de listar: contas que amadureceram abrem caso ao abrir a fila', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 30 });
    // nada avaliou ainda (insertMany direto) -> a fila precisa abrir o caso
    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(r.body.casos.some(c => c.obra && c.obra.id === String(serie._id))).toBe(true);
  });

  it('erro em reavaliarPendentes não derruba a fila: GET responde 200 mesmo assim (fix round T4, item 6)', async () => {
    // A varredura de candidatas passou a ser um aggregate (consolidação,
    // item 4) — o spy tem de mirar nele, senão o teste deixa de exercitar o
    // try/catch e passa por acidente.
    const spy = vi.spyOn(Sinalizacao, 'aggregate').mockRejectedValueOnce(new Error('mongo off'));
    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    spy.mockRestore();
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.casos)).toBe(true);
  });

  it('?status=fechado lista histórico com decisao/motivoDecisao/decididoPor; obra apagada -> obra null sem 500', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia de terceiro.' });
    await Series.deleteOne({ _id: serie._id });
    const r = await request(app).get('/api/admin/curadoria?status=fechado').set('Authorization', ADMIN());
    const item = r.body.casos.find(c => c.casoId === String(caso._id));
    expect(item).toMatchObject({ status: 'fechado', decisao: 'remover', motivoDecisao: 'Cópia de terceiro.', decididoPor: auth.getId('admin'), obra: null });
  });

  it('troca de dono do canal com caso aberto: caso continua listado, thread vazia, sem 500', async () => {
    const { serie, canal } = await criarObra();
    await abrirCasoGrave(serie);
    await MensagemPortal.arquivarThreadDoCanal(canal._id);
    await Channel.updateOne({ _id: canal._id }, { $set: { ownerId: oid() } });
    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    const item = r.body.casos.find(c => c.obra && c.obra.id === String(serie._id));
    expect(item.thread).toEqual([]);
  });

  it('total/graves refletem mistura real: 2 graves + 1 normal -> graves 2 entre os itens desta fixture (fix round T4, item 10e)', async () => {
    const { serie: g1 } = await criarObra({ title: 'Grave Mix 51' });
    await abrirCasoGrave(g1);
    const { serie: g2 } = await criarObra({ title: 'Grave Mix 52' });
    await abrirCasoGrave(g2);
    const { serie: nrm } = await criarObra({ title: 'Normal Mix 53' });
    await abrirCasoNormal(nrm);

    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    const idsRelevantes = new Set([String(g1._id), String(g2._id), String(nrm._id)]);
    const relevantes = r.body.casos.filter(c => c.obra && idsRelevantes.has(c.obra.id));
    expect(relevantes).toHaveLength(3);
    expect(relevantes.filter(c => c.prioridade === 'grave')).toHaveLength(2);
    // `graves` do payload é sempre a contagem do array `casos` inteiro (que
    // pode incluir casos de outros testes) — mas precisa bater exatamente.
    expect(r.body.graves).toBe(r.body.casos.filter(c => c.prioridade === 'grave').length);
  });
});

describe('ações do curador', () => {
  it('não-admin 403 nas 4; casoId malformado 404; inexistente 404', async () => {
    for (const acao of ['aprovar', 'reclassificar', 'solicitar-correcao', 'remover']) {
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).set('Authorization', `Bearer ${auth.getToken('user')}`).send({})).status).toBe(403);
      expect((await request(app).post(`/api/admin/curadoria/abc/${acao}`).set('Authorization', ADMIN()).send({ content_rating: 'teen', texto: 'x', motivo: 'x' })).status).toBe(404);
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).set('Authorization', ADMIN()).send({ content_rating: 'teen', texto: 'x', motivo: 'x' })).status).toBe(404);
    }
  });

  it('401 sem token nas 4 ações (fix round T4, item 10d)', async () => {
    for (const acao of ['aprovar', 'reclassificar', 'solicitar-correcao', 'remover']) {
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).send({})).status).toBe(401);
    }
  });

  it('aprovar: fecha, revisadaEm em todas, aviso curto sem dígitos fora do título, AdminLog do admin sem identidades; 2ª ação -> 409', async () => {
    const { serie } = await criarObra({ title: 'Aprovada 77' });
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({ observacao: 'ok' });
    expect(r.status).toBe(200);
    expect(r.body.caso).toMatchObject({ status: 'fechado', decisao: 'aprovar', observacao: 'ok', sinalizacoesAbusivas: false });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, revisadaEm: null })).toBe(0);
    const avisos = await MensagemPortal.find({ refId: serie._id }).sort({ createdAt: 1 }).lean();
    expect(avisos).toHaveLength(2); // abertura + fechamento
    expect(avisos[1].texto).toMatch(/mantida sem alterações/);
    expect(/\d/.test(avisos[1].texto.split(serie.title).join(''))).toBe(false);
    expect(String(avisos[1].autorUserId)).toBe(auth.getId('admin'));
    const log = await AdminLog.findOne({ action: 'CURADORIA_APROVAR', adminId: auth.getId('admin'), targetId: String(serie._id) }).lean();
    expect(log).toBeTruthy();
    expect(JSON.stringify(log.details)).not.toMatch(REGEX_DETAILS_VAZAMENTO);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({})).status).toBe(409);
  });

  it('aprovar: observacao não-string 400; >2000 chars 400; exatamente 2000 chars 200 (fix round T4, item 3)', async () => {
    const { serie: s1 } = await criarObra();
    const c1 = await abrirCasoGrave(s1);
    const r1 = await request(app).post(`/api/admin/curadoria/${c1._id}/aprovar`).set('Authorization', ADMIN()).send({ observacao: { a: 1 } });
    expect(r1.status).toBe(400);
    expect((await CasoCuradoria.findById(c1._id).lean()).status).toBe('aberto');

    const { serie: s2 } = await criarObra();
    const c2 = await abrirCasoGrave(s2);
    expect((await request(app).post(`/api/admin/curadoria/${c2._id}/aprovar`).set('Authorization', ADMIN()).send({ observacao: 'a'.repeat(2001) })).status).toBe(400);

    const { serie: s3 } = await criarObra();
    const c3 = await abrirCasoGrave(s3);
    const r3 = await request(app).post(`/api/admin/curadoria/${c3._id}/aprovar`).set('Authorization', ADMIN()).send({ observacao: 'a'.repeat(2000) });
    expect(r3.status).toBe(200);
    expect(r3.body.caso.observacao.length).toBe(2000);
  });

  it('lock otimista: 2 aprovar concorrentes no mesmo caso -> [200,409]; 2 MensagemPortal (abertura+1 fechamento); 1 AdminLog CURADORIA_APROVAR (fix round T4, item 4)', async () => {
    const { serie } = await criarObra({ title: 'Concorrencia Aprovar 9' });
    const caso = await abrirCasoGrave(serie);
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({}),
      request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({}),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(2);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_APROVAR', targetId: String(serie._id) })).toBe(1);
  });

  it('aprovar com abuso:true -> só as válidas viram abuso; sem_consumo preservada', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 2, valida: false, invalidaMotivo: 'sem_consumo' });
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({ abuso: true });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, invalidaMotivo: 'abuso' })).toBe(5);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, invalidaMotivo: 'sem_consumo' })).toBe(2);
    expect((await CasoCuradoria.findById(caso._id).lean()).sinalizacoesAbusivas).toBe(true);
  });

  it('reclassificar: rating fora do enum 400; válido grava content_rating, fecha, aviso com rótulo Teen; AdminLog sem identidades', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: '12+' })).status).toBe(400);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: 'teen' });
    expect(r.status).toBe(200);
    expect((await Series.findById(serie._id).lean()).content_rating).toBe('teen');
    expect(r.body.caso.decisao).toBe('reclassificar');
    const aviso = await MensagemPortal.findOne({ refId: serie._id, texto: /classificação etária/ }).lean();
    expect(aviso.texto).toContain('Teen');
    expect(/\d/.test(aviso.texto.split(serie.title).join(''))).toBe(false);
    const log = await AdminLog.findOne({ action: 'CURADORIA_RECLASSIFICAR', targetId: String(serie._id) }).lean();
    expect(log.adminId).toBe(auth.getId('admin'));
    expect(JSON.stringify(log.details)).not.toMatch(REGEX_DETAILS_VAZAMENTO);
  });

  it('reclassificar: observacao não-string -> 400, caso continua aberto (fix round T4, item 3)', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: 'teen', observacao: 123 });
    expect(r.status).toBe(400);
    expect((await CasoCuradoria.findById(caso._id).lean()).status).toBe('aberto');
  });

  it('reclassificar em obra apagada -> 404, caso continua aberto sem 500 (fix round T4, item 10c)', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await Series.deleteOne({ _id: serie._id });
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: 'teen' });
    expect(r.status).toBe(404);
    expect((await CasoCuradoria.findById(caso._id).lean()).status).toBe('aberto');
  });

  it('solicitar correção: texto obrigatório (400), caso -> aguardando_artista (continua aberto), obra CONTINUA publicada, mensagem com refId e texto do editor, AdminLog sem identidades; depois aceita as 4 ações', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({})).status).toBe(400);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'a'.repeat(1501) })).status).toBe(400);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Troque a capa.' });
    expect(r.status).toBe(200);
    expect(r.body.caso).toMatchObject({ status: 'aguardando_artista', emAberto: true, motivoDecisao: 'Troque a capa.' });
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(true);
    const msg = await MensagemPortal.findOne({ refId: serie._id, texto: /Troque a capa/ }).lean();
    expect(msg.texto).toMatch(/editor/);
    const log = await AdminLog.findOne({ action: 'CURADORIA_SOLICITAR_CORRECAO', targetId: String(serie._id) }).lean();
    expect(log.adminId).toBe(auth.getId('admin'));
    expect(JSON.stringify(log.details)).not.toMatch(REGEX_DETAILS_VAZAMENTO);
    // escalonamento/ações continuam válidas em aguardando_artista
    const r2 = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Sem resposta.' });
    expect(r2.status).toBe(200);
  });

  it('solicitar correção em obra sem canal -> 400 e nada muda', async () => {
    const { serie } = await criarObra({ comCanal: false });
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'x' });
    expect(r.status).toBe(400);
    expect((await CasoCuradoria.findById(caso._id).lean()).status).toBe('aberto');
  });

  it('solicitar correção: falha ao enviar a mensagem (MensagemPortal.create rejeita) -> 500, caso continua ABERTO (fix round T4, item 2)', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    const spy = vi.spyOn(MensagemPortal, 'create').mockRejectedValueOnce(new Error('boom'));
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Ajuste algo.' });
    spy.mockRestore();
    expect(r.status).toBe(500);
    // Consolidação (item 2): a gravação do caso passou a vir ANTES do envio
    // (é ela que fecha a corrida com um `aprovar` concorrente), então o caso
    // fica em 'aguardando_artista' SEM a mensagem — continua `emAberto` e o
    // curador repete a ação. O que não pode acontecer é o caso sair da fila.
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido).toMatchObject({ emAberto: true, status: 'aguardando_artista', decisao: null });
  });

  it('fecharCaso grava motivoDecisao SEMPRE (fix round T4, item 5): solicitar correção deixa motivoDecisao, aprovar depois limpa para null', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Ajuste a capa.' });
    expect((await CasoCuradoria.findById(caso._id).lean()).motivoDecisao).toBe('Ajuste a capa.');
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({});
    expect(r.status).toBe(200);
    expect(r.body.caso.motivoDecisao).toBeNull();
    expect((await CasoCuradoria.findById(caso._id).lean()).motivoDecisao).toBeNull();
  });

  it('PUT /portal/series/:id do dono continua 403 após solicitar correção (obra publicada não é editável ao vivo) (fix round T4, item 10f)', async () => {
    const { serie, donoToken } = await criarObraComDonoLogavel();
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Ajuste algo.' });
    const r = await request(app).put(`/api/portal/series/${serie._id}`).set('Authorization', donoToken).send({ title: 'Tentando editar' });
    expect(r.status).toBe(403);
  });

  it('remover: motivo obrigatório; despublica (NÃO apaga: episódios/favoritos intactos), fecha, aviso com motivo, AdminLog sem identidades; obra já despublicada -> fecha mesmo assim', async () => {
    const { serie } = await criarObra();
    await Favorite.create({ userId: auth.getId('premium'), seriesId: serie._id });
    const caso = await abrirCasoGrave(serie);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({})).status).toBe(400);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Conteúdo proibido confirmado.' });
    expect(r.status).toBe(200);
    const s = await Series.findById(serie._id).lean();
    expect(s.isPublished).toBe(false);
    expect(await Episode.countDocuments({ seriesId: serie._id })).toBe(1);
    expect(await Favorite.countDocuments({ seriesId: serie._id })).toBe(1);
    expect((await MensagemPortal.findOne({ refId: serie._id, texto: /retirada do ar/ }).lean()).texto).toContain('Conteúdo proibido confirmado.');
    const log = await AdminLog.findOne({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) }).lean();
    expect(log).toBeTruthy();
    expect(JSON.stringify(log.details)).not.toMatch(REGEX_DETAILS_VAZAMENTO);

    const { serie: s2 } = await criarObra();
    const c2 = await abrirCasoGrave(s2);
    await Series.updateOne({ _id: s2._id }, { $set: { isPublished: false } });
    expect((await request(app).post(`/api/admin/curadoria/${c2._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' })).status).toBe(200);
  });

  it('remover limpa submittedAt (mesmo que a série publicada ainda o tivesse preenchido) e a obra NÃO entra na Fila de Aprovação até reenvio (fix round T4, item 1)', async () => {
    const { serie } = await criarObra({ title: 'Submetida Publicada 6' });
    // simula uma obra publicada que ainda carrega submittedAt (fluxo herdado do B1)
    await Series.updateOne({ _id: serie._id }, { $set: { submittedAt: new Date('2026-08-01T00:00:00Z') } });
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia confirmada.' });
    expect(r.status).toBe(200);
    const s = await Series.findById(serie._id).lean();
    expect(s.isPublished).toBe(false);
    expect(s.submittedAt).toBeNull();
    const fila = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(fila.body.itens.some(i => i.tipo === 'series' && i.id === String(serie._id))).toBe(false);
  });

  it('remover: observacao não-string -> 400, nada muda (fix round T4, item 3)', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x', observacao: ['a'] });
    expect(r.status).toBe(400);
    expect((await CasoCuradoria.findById(caso._id).lean()).status).toBe('aberto');
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(true);
  });

  it('remover em obra apagada -> 404, caso continua aberto sem 500 (fix round T4, item 10c)', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await Series.deleteOne({ _id: serie._id });
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' });
    expect(r.status).toBe(404);
    expect((await CasoCuradoria.findById(caso._id).lean()).status).toBe('aberto');
  });
});

/**
 * Fix round de CONSOLIDAÇÃO do backend (painel adversarial + sondas de
 * execução). Cada teste aqui reproduz um defeito CONFIRMADO por sonda: a obra
 * mudava fora do lock (item 1), `solicitar-correcao` gravava por cima de um
 * caso já fechado (item 2), `fecharCaso` deixava o caso preso em falha parcial
 * (item 5), o histórico filtrava por `emAberto` (item 6) e a Fila de Aprovação
 * inteira caía junto com a curadoria (item 7).
 */
describe('consolidação: concorrência e robustez das ações', () => {
  it('item 5: falha no updateMany de revisadaEm -> 500, mas o caso fica FECHADO e decidido, fora da fila (nunca preso em emAberto:false + status aberto)', async () => {
    const { serie } = await criarObra({ title: 'Falha Parcial 8' });
    const caso = await abrirCasoGrave(serie);
    // sem `abuso`, o ÚNICO updateMany de Sinalizacao do fechamento é o de revisadaEm
    const spy = vi.spyOn(Sinalizacao, 'updateMany').mockRejectedValueOnce(new Error('mongo off'));
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({});
    spy.mockRestore();
    expect(r.status).toBe(500);
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido).toMatchObject({ emAberto: false, status: 'fechado', decisao: 'aprovar', decididoPor: auth.getId('admin') });
    const fila = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(fila.body.casos.some(c => c.casoId === String(caso._id))).toBe(false);
  });

  it('item 6: caso MEIO-FECHADO (emAberto:false, status:aberto) não aparece na fila NEM no histórico — só `status` diz que houve decisão', async () => {
    const { serie } = await criarObra({ title: 'Em Voo 3' });
    const caso = await abrirCasoGrave(serie);
    await CasoCuradoria.updateOne({ _id: caso._id }, { $set: { emAberto: false } });
    const fila = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(fila.body.casos.some(c => c.casoId === String(caso._id))).toBe(false);
    const hist = await request(app).get('/api/admin/curadoria?status=fechado').set('Authorization', ADMIN());
    expect(hist.body.casos.some(c => c.casoId === String(caso._id))).toBe(false);
  });

  /**
   * O curador concorrente é simulado pela ROTA de verdade (não por
   * `svc.fecharCaso` direto): é o caminho que ele realmente percorre, e é o
   * único jeito de exercitar o mutex das 4 ações — a rodada 2 provou que
   * chamar o serviço direto testava um adversário que não existe.
   */
  it('item 1: remover reivindica ANTES de despublicar — o `aprovar` concorrente na janela leva 409 e a obra só muda pelas mãos de quem reivindicou', async () => {
    const { serie } = await criarObra({ title: 'Corrida Remover 4' });
    const caso = await abrirCasoGrave(serie);
    const seriesPublishService = require('../../services/seriesPublishService');
    const original = seriesPublishService.applySeriesUpdate;
    let statusConcorrente = null;
    const spy = vi.spyOn(seriesPublishService, 'applySeriesUpdate').mockImplementationOnce(async (id, updates) => {
      // Outro curador tenta APROVAR o mesmo caso exatamente na janela em que
      // a obra está sendo alterada. Com o mutex ele perde (409); sem ele
      // vence e a obra some do ar com decisão 'aprovar' gravada, ZERO
      // AdminLog de remoção e "obra mantida sem alterações" para o artista.
      const rc = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({});
      statusConcorrente = rc.status;
      return original(id, updates);
    });
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia confirmada.' });
    spy.mockRestore();
    expect(statusConcorrente).toBe(409);
    expect(r.status).toBe(200);
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ status: 'fechado', decisao: 'remover', motivoDecisao: 'Cópia confirmada.', reivindicadoEm: null });
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(false);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) })).toBe(1);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_APROVAR', targetId: String(serie._id) })).toBe(0);
  });

  it('item 1: reclassificar reivindica ANTES de gravar o content_rating — o concorrente leva 409 e o rating é o do vencedor', async () => {
    const { serie } = await criarObra({ title: 'Corrida Reclassificar 5' });
    const caso = await abrirCasoGrave(serie);
    const seriesPublishService = require('../../services/seriesPublishService');
    const original = seriesPublishService.applySeriesUpdate;
    let statusConcorrente = null;
    const spy = vi.spyOn(seriesPublishService, 'applySeriesUpdate').mockImplementationOnce(async (id, updates) => {
      const rc = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({});
      statusConcorrente = rc.status;
      return original(id, updates);
    });
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: 'teen' });
    spy.mockRestore();
    expect(statusConcorrente).toBe(409);
    expect(r.status).toBe(200);
    expect((await Series.findById(serie._id).lean()).content_rating).toBe('teen');
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ status: 'fechado', decisao: 'reclassificar', reivindicadoEm: null });
  });

  it('item 1: caso fechado ANTES da requisição -> 409 nas duas ações com a obra INALTERADA e 0 AdminLog', async () => {
    const { serie } = await criarObra({ title: 'Ja Fechado 6' });
    const caso = await abrirCasoGrave(serie);
    await svc.fecharCaso(caso, { decisao: 'aprovar', adminId: auth.getId('admin') });
    const rRemover = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' });
    const rReclass = await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: 'kids' });
    expect([rRemover.status, rReclass.status]).toEqual([409, 409]);
    const s = await Series.findById(serie._id).lean();
    expect(s.isPublished).toBe(true);
    expect(s.content_rating).toBe('young');
    expect(await AdminLog.countDocuments({ action: { $in: ['CURADORIA_REMOVER', 'CURADORIA_RECLASSIFICAR'] }, targetId: String(serie._id) })).toBe(0);
  });

  it('item 1: falha no applySeriesUpdate devolve a reivindicação — o caso volta para a fila', async () => {
    const { serie } = await criarObra({ title: 'Rollback Remover 2' });
    const caso = await abrirCasoGrave(serie);
    const seriesPublishService = require('../../services/seriesPublishService');
    const spy = vi.spyOn(seriesPublishService, 'applySeriesUpdate').mockRejectedValueOnce(new Error('boom'));
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' });
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ emAberto: true, status: 'aberto', decisao: null });
    const fila = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(fila.body.casos.some(c => c.casoId === String(caso._id))).toBe(true);
  });

  it('rodada 2 (a): falha no FECHAMENTO depois de alterar a obra -> 500, caso volta destravado para a fila e a ação pode ser repetida', async () => {
    const { serie } = await criarObra({ title: 'Fechamento Falhou 3' });
    const caso = await abrirCasoGrave(serie);
    // fecharCaso é o único findOneAndUpdate desta rota
    const spy = vi.spyOn(CasoCuradoria, 'findOneAndUpdate').mockRejectedValueOnce(new Error('mongo off'));
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    spy.mockRestore();
    expect(r.status).toBe(500);
    // O caso NÃO fica preso: volta aberto, sem decisão e sem mutex.
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ emAberto: true, status: 'aberto', decisao: null, reivindicadoEm: null });
    const fila = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(fila.body.casos.some(c => c.casoId === String(caso._id))).toBe(true);
    // LIMITAÇÃO DECLARADA: a obra já saiu do ar (o applySeriesUpdate rodou
    // antes da falha). A recuperação é o curador REPETIR a ação — o
    // applySeriesUpdate com o mesmo valor é no-op e o caso fecha.
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(false);
    const r2 = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    expect(r2.status).toBe(200);
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ status: 'fechado', decisao: 'remover' });
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) })).toBe(1);
  });

  it('rodada 2 (b): remover e aprovar DISPUTANDO o mesmo caso -> [200,409]; a obra fica no estado do vencedor, 1 AdminLog e 1 aviso de fechamento', async () => {
    const { serie } = await criarObra({ title: 'Disputa Acoes 8' });
    const caso = await abrirCasoGrave(serie);
    const [rRemover, rAprovar] = await Promise.all([
      request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' }),
      request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({}),
    ]);
    expect([rRemover.status, rAprovar.status].sort()).toEqual([200, 409]);
    const venceuRemover = rRemover.status === 200;
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido.decisao).toBe(venceuRemover ? 'remover' : 'aprovar');
    expect(relido.reivindicadoEm).toBeNull();
    // a obra segue a ação VENCEDORA — nunca despublicada por quem perdeu
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(!venceuRemover);
    expect(await AdminLog.countDocuments({ targetId: String(serie._id), action: { $in: ['CURADORIA_REMOVER', 'CURADORIA_APROVAR'] } })).toBe(1);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(2); // abertura + 1 fechamento
  });

  it('rodada 3 (a): quem PERDEU o lock por expiração no meio da ação NÃO altera a obra — 409 com a obra intacta', async () => {
    const { serie } = await criarObra({ title: 'Perdeu o Lock 9' });
    const caso = await abrirCasoGrave(serie);
    const originalReivindicar = svc.reivindicarCaso;
    let statusB = null;
    // A reivindica; a reivindicação de A envelhece 6 minutos (expira) e B
    // toma o caso por expiração e VENCE. A precisa descobrir que perdeu o
    // lock ANTES de despublicar — senão a obra sai do ar com a decisão
    // 'aprovar' de B gravada e o artista lê "obra mantida sem alterações".
    const spy = vi.spyOn(svc, 'reivindicarCaso').mockImplementationOnce(async (id, opts) => {
      const token = await originalReivindicar(id, opts);
      await CasoCuradoria.updateOne({ _id: id }, { $set: { reivindicadoEm: new Date(Date.now() - 6 * 60 * 1000) } });
      const rB = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({});
      statusB = rB.status;
      return token; // A segue achando que tem o lock
    });
    const rA = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    spy.mockRestore();

    expect(statusB).toBe(200);
    expect(rA.status).toBe(409);
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(true);
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ status: 'fechado', decisao: 'aprovar' });
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) })).toBe(0);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_APROVAR', targetId: String(serie._id) })).toBe(1);
    // o artista recebeu só abertura + o aviso do aprovar (nenhum de remoção)
    const avisos = await MensagemPortal.find({ refId: serie._id }).sort({ createdAt: 1 }).lean();
    expect(avisos).toHaveLength(2);
    expect(avisos[1].texto).toMatch(/mantida sem alterações/);
  });

  it('revisão final (item 2): aviso de FECHAMENTO que falha é PERSISTIDO no caso e devolvido na resposta', async () => {
    const { serie } = await criarObra({ title: 'Aviso Falhou 7' });
    const caso = await abrirCasoGrave(serie);
    expect((await CasoCuradoria.findById(caso._id).lean()).avisoArtista).toBe('enviado'); // da ABERTURA
    const spy = vi.spyOn(MensagemPortal, 'create').mockRejectedValueOnce(new Error('boom'));
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    spy.mockRestore();
    // A decisão VALEU (a obra saiu do ar) — mas o curador precisa saber que o
    // artista não foi avisado, e o painel não pode seguir mostrando o
    // 'enviado' da abertura (regra 7 do Vin).
    expect(r.status).toBe(200);
    expect(r.body.avisoArtista).toBe('falhou');
    expect(r.body.caso.avisoArtista).toBe('falhou');
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ status: 'fechado', decisao: 'remover', avisoArtista: 'falhou' });
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(false);
  });

  it('revisão final (item 3): falha DEPOIS da decisão gravada NÃO vira 500 — 200 com o caso fechado e a falha logada', async () => {
    const { serie } = await criarObra({ title: 'Log Depois 2' });
    const caso = await abrirCasoGrave(serie);
    const logger = require('../../utils/logger');
    const spyLog = vi.spyOn(logger, 'error');
    const spy = vi.spyOn(AdminLog, 'create').mockRejectedValueOnce(new Error('mongo off'));
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    const mensagens = spyLog.mock.calls.map(c => String(c[0])).join('\n');
    spy.mockRestore(); spyLog.mockRestore();
    // 500 aqui mandaria o curador repetir uma ação que agora responde 409
    // "caso já fechado" para sempre — decisão aplicada e sem registro.
    expect(r.status).toBe(200);
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ status: 'fechado', decisao: 'remover' });
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(false);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) })).toBe(0);
    expect(mensagens).toMatch(/DECISÃO GRAVADA, efeitos posteriores falharam/);
    expect(mensagens).not.toMatch(/continua aberto/);
  });

  it('rodada 3 (d): falha ANTES de alterar a obra loga que a obra NÃO foi tocada (log forense honesto)', async () => {
    const { serie } = await criarObra({ title: 'Log Honesto 5' });
    const caso = await abrirCasoGrave(serie);
    await Series.deleteOne({ _id: serie._id }); // applySeriesUpdate lança 404 antes de escrever
    const logger = require('../../utils/logger');
    const spy = vi.spyOn(logger, 'error');
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' });
    const mensagens = spy.mock.calls.map(c => String(c[0])).join('\n');
    spy.mockRestore();
    expect(r.status).toBe(404);
    expect(mensagens).toMatch(/remover falhou sem alterar a obra/);
    expect(mensagens).not.toMatch(/APÓS alterar a obra/);
  });

  it('rodada 2 (e): solicitar-correcao LIBERA o mutex — reivindicadoEm volta a null e a ação seguinte no mesmo caso é aceita', async () => {
    const { serie } = await criarObra({ title: 'Libera Mutex 4' });
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Troque a capa.' });
    expect(r.status).toBe(200);
    // é a única ação que não fecha o caso: precisa liberar o mutex sozinha,
    // senão o caso ficaria travado até a expiração de 5 minutos.
    expect((await CasoCuradoria.findById(caso._id).lean()).reivindicadoEm).toBeNull();
    const r2 = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({});
    expect(r2.status).toBe(200);
  });

  it('item 2: solicitar-correcao não grava por cima de um caso fechado na janela -> 409 e o caso continua aprovar/fechado', async () => {
    const { serie } = await criarObra({ title: 'Correcao Tardia 7' });
    const caso = await abrirCasoGrave(serie);
    const original = CasoCuradoria.findById.bind(CasoCuradoria);
    // Fecha o caso EXATAMENTE entre o carregamento (carregarCasoAberto) e a
    // gravação de 'aguardando_artista': é a janela que a sonda explorou.
    const spy = vi.spyOn(CasoCuradoria, 'findById').mockImplementationOnce(async (id) => {
      const doc = await original(id);
      await svc.fecharCaso(await original(caso._id), { decisao: 'aprovar', adminId: 'outro-curador' });
      return doc;
    });
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Troque a capa.' });
    spy.mockRestore();
    expect(r.status).toBe(409);
    expect(await CasoCuradoria.findById(caso._id).lean()).toMatchObject({ emAberto: false, status: 'fechado', decisao: 'aprovar', motivoDecisao: null });
  });
});

describe('GET /api/admin/aprovacoes += curadoria e removidaPelaCuradoria', () => {
  it('curadoria: {abertos, graves} reflete os casos abertos', async () => {
    const { serie } = await criarObra();
    await abrirCasoGrave(serie);
    const r = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(r.body.curadoria.abertos).toBeGreaterThanOrEqual(1);
    expect(r.body.curadoria.graves).toBeGreaterThanOrEqual(1);
    expect(r.body.curadoria.abertos).toBe(await CasoCuradoria.countDocuments({ emAberto: true }));
  });

  it('item 7: curadoria fora do ar NÃO derruba a Fila de Aprovação — 200 com itens/naoClassificadas e curadoria zerada', async () => {
    const { serie } = await criarObra({ title: 'Pendente Fila 7' });
    await Series.updateOne({ _id: serie._id }, { $set: { isPublished: false, submittedAt: new Date('2026-09-01T00:00:00Z') } });
    // A Fila de Aprovação é código do Bloco 1 EM PRODUÇÃO e é o único
    // caminho do Master para publicar: a curadoria nunca pode levá-la junto.
    const spy = vi.spyOn(CasoCuradoria, 'find').mockImplementationOnce(() => { throw new Error('mongo off'); });
    const r = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    spy.mockRestore();
    expect(r.status).toBe(200);
    const item = r.body.itens.find(i => i.tipo === 'series' && i.id === String(serie._id));
    expect(item).toBeTruthy();
    expect(item.removidaPelaCuradoria).toBeNull();
    expect(typeof r.body.naoClassificadas).toBe('number');
    expect(r.body.curadoria).toEqual({ abertos: 0, graves: 0 });
  });

  it('obra removida pela curadoria e reenviada pelo portal traz removidaPelaCuradoria no item; série nunca removida -> null', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    // reenvio: o estado pós-remover é {isPublished:false, submittedAt:null}; simula o POST /portal/series/:id/enviar
    await Series.updateOne({ _id: serie._id }, { $set: { submittedAt: new Date('2026-09-13T10:00:00Z') } });
    const r = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    const item = r.body.itens.find(i => i.tipo === 'series' && i.id === String(serie._id));
    expect(item.removidaPelaCuradoria).toEqual({ decisaoEm: expect.any(String), motivo: 'Cópia.' });

    const { serie: limpa } = await criarObra();
    await Series.updateOne({ _id: limpa._id }, { $set: { isPublished: false, submittedAt: new Date() } });
    const r2 = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(r2.body.itens.find(i => i.id === String(limpa._id)).removidaPelaCuradoria).toBeNull();
  });
});
