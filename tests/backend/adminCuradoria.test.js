/**
 * Fase 5 Bloco 3, Task 4 — Fila de Revisão do admin e as 4 decisões. Regra
 * 8: o admin vê NÚMEROS, nunca identidades (nenhum userId/e-mail de leitor na
 * resposta); regra 1: "remover" = despublicar, nunca DELETE.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Favorite, Sinalizacao, CasoCuradoria, MensagemPortal, AdminLog, svc, L;
const AGORA = new Date('2026-09-12T09:00:00.000Z');
const dias = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);
const oid = () => new mongoose.Types.ObjectId();
const ADMIN = () => `Bearer ${auth.getToken('admin')}`;

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
async function sinalizar(serieId, { quantas, motivo = 'spam_ou_enganoso', idadeDias = 30, valida = true, invalidaMotivo = null, descricao = null }) {
  return Sinalizacao.insertMany(Array.from({ length: quantas }, (_, i) => ({
    seriesId: serieId, userId: oid(), motivo, grave: L.ehGrave(motivo), valida, invalidaMotivo, descricao,
    contaCriadaEm: dias(idadeDias), ipHash: `ip-${n}-${i}`,
  })));
}
/** Abre um caso grave (5 graves maduras; V=0 basta). */
async function abrirCasoGrave(serie) {
  await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 9, descricao: 'descrição do leitor' });
  return svc.avaliarObra(serie._id, { agora: AGORA });
}
async function abrirCasoNormal(serie) {
  // V=0 -> limiar 20; 20 válidas maduras abrem caso 'pequena'
  await sinalizar(serie._id, { quantas: 20 });
  return svc.avaliarObra(serie._id, { agora: AGORA });
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
    expect(JSON.stringify(r.body)).not.toMatch(/userId|@lorflux\.test|ipHash|contaCriadaEm/);
  });

  it('roda reavaliarPendentes antes de listar: contas que amadureceram abrem caso ao abrir a fila', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 30 });
    // nada avaliou ainda (insertMany direto) -> a fila precisa abrir o caso
    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(r.body.casos.some(c => c.obra && c.obra.id === String(serie._id))).toBe(true);
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
});

describe('ações do curador', () => {
  it('não-admin 403 nas 4; casoId malformado 404; inexistente 404', async () => {
    for (const acao of ['aprovar', 'reclassificar', 'solicitar-correcao', 'remover']) {
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).set('Authorization', `Bearer ${auth.getToken('user')}`).send({})).status).toBe(403);
      expect((await request(app).post(`/api/admin/curadoria/abc/${acao}`).set('Authorization', ADMIN()).send({ content_rating: 'teen', texto: 'x', motivo: 'x' })).status).toBe(404);
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).set('Authorization', ADMIN()).send({ content_rating: 'teen', texto: 'x', motivo: 'x' })).status).toBe(404);
    }
  });

  it('aprovar: fecha, revisadaEm em todas, aviso curto sem dígitos fora do título, AdminLog do admin; 2ª ação -> 409', async () => {
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
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_APROVAR', adminId: auth.getId('admin'), targetId: String(serie._id) })).toBe(1);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({})).status).toBe(409);
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

  it('reclassificar: rating fora do enum 400; válido grava content_rating, fecha, aviso com rótulo Teen', async () => {
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
  });

  it('solicitar correção: texto obrigatório (400), caso -> aguardando_artista (continua aberto), obra CONTINUA publicada, mensagem com refId e texto do editor; depois aceita as 4 ações', async () => {
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

  it('remover: motivo obrigatório; despublica (NÃO apaga: episódios/favoritos intactos), fecha, aviso com motivo, AdminLog; obra já despublicada -> fecha mesmo assim', async () => {
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
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) })).toBe(1);

    const { serie: s2 } = await criarObra();
    const c2 = await abrirCasoGrave(s2);
    await Series.updateOne({ _id: s2._id }, { $set: { isPublished: false } });
    expect((await request(app).post(`/api/admin/curadoria/${c2._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' })).status).toBe(200);
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
