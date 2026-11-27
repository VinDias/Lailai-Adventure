/**
 * Frente A, item 7: edição de episódio PUBLICADO com aprovação
 * (services/revisaoEpisodioService.js, models/RevisaoEpisodio.js, e os
 * desvios em edicaoPaineisService e envioEpisodioService).
 *
 * Critério da proposta de 21/11/2026 e do plano: "editar publicado não muda o
 * que a rota pública devolve até aprovar; devolver mantém; aprovar troca; o
 * aviso não sai de novo".
 *
 * O QUE ESTE ARQUIVO GARANTE:
 * - o autor edita episódio publicado pela grade (item 6) e pelo reenvio da
 *   pasta (item 3) e o LEITOR não vê nada: as duas rotas públicas devolvem os
 *   mesmos painéis e a mesma capa, e nenhum arquivo do ar sai do Bunny;
 * - a edição só entra na fila quando o autor envia; na fila ninguém mexe;
 * - o moderador (e só ele) lê a edição pela rota de leitura;
 * - DEVOLVER guarda o motivo, o autor vê, e nada muda no ar;
 * - APROVAR troca os painéis de uma vez, apaga do Bunny só o que saiu, e NÃO
 *   dispara aviso de capítulo novo nem recálculo (R7);
 * - outro autor recebe 404; rascunho continua como era (item 6);
 * - o admin que mexe direto no episódio no ar não apaga arquivo que uma
 *   edição pendente usa.
 *
 * Bunny falso (envio e apagar guardam o que receberam). O QUE NÃO GARANTE: a
 * tela (tests/frontend/revisaoEpisodio.test.tsx) nem o push de verdade.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Series, Channel, User, RevisaoEpisodio, MensagemPortal, AdminLog, bunny;
let notificationService, recommendationService;

const CDN = 'cdn-revisao-teste.b-cdn.net';
const url = (c) => `https://${CDN}/${c}`;
const caminho = (u) => u.replace(`https://${CDN}/`, '');
let noBunny;
let apagados;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  RevisaoEpisodio = require('../../models/RevisaoEpisodio');
  MensagemPortal = require('../../models/MensagemPortal');
  AdminLog = require('../../models/AdminLog');
  bunny = require('../../utils/bunnyStorage');
  notificationService = require('../../services/notificationService');
  recommendationService = require('../../services/recommendationService');
  await auth.createUsers(app);
});

const ambiente = {};
beforeAll(() => {
  for (const k of ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_KEY', 'BUNNY_STORAGE_HOSTNAME']) ambiente[k] = process.env[k];
  process.env.BUNNY_STORAGE_ZONE = 'zona-revisao-teste';
  process.env.BUNNY_STORAGE_KEY = 'chave-revisao-teste';
  process.env.BUNNY_STORAGE_HOSTNAME = CDN;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(ambiente)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  bunny.__setUploaderForTests(null);
  bunny.__setDeleterForTests(null);
  await db.closeDatabase();
});

beforeEach(() => {
  noBunny = new Map();
  apagados = [];
  bunny.__setUploaderForTests(async (buffer, c) => { noBunny.set(c, buffer); return url(c); });
  bunny.__setDeleterForTests(async (c) => { apagados.push(c); noBunny.delete(c); });
});

const cache = new Map();
async function jpeg(largura = 80, altura = 128) {
  const k = `j${largura}x${altura}`;
  if (!cache.has(k)) cache.set(k, await sharp({ create: { width: largura, height: altura, channels: 3, background: '#88aacc' } }).jpeg().toBuffer());
  return cache.get(k);
}
async function png(largura = 80, altura = 128) {
  const k = `p${largura}x${altura}`;
  if (!cache.has(k)) cache.set(k, await sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
  return cache.get(k);
}

let contador = 0;
async function criarAutor() {
  contador += 1;
  const email = `revisao-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash('Senha@123', 4);
  const user = await User.create({ email, passwordHash, nome: `Autor ${contador}`, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Revisao ${contador} ${Date.now()}` });
  return { token: login.body.accessToken, canal, id: String(user._id) };
}

const JA_AVISADO = new Date('2026-11-01T12:00:00.000Z');

/** Episódio PUBLICADO, com `n` painéis 80x128 e balões, tudo "no Bunny". */
async function publicado(autor, { n = 4, baloes = ['pt', 'en'], extra = {} } = {}) {
  contador += 1;
  const series = await Series.create({
    title: `Obra No Ar ${contador}`, content_type: 'hiqua', channelId: autor.canal._id,
    isPublished: true, genre: 'Drama', content_rating: 'teen',
  });
  const panels = [];
  for (let i = 0; i < n; i++) {
    const img = `lorflux/series/obra-no-ar-${contador}/ep-04/20261101-000000-aaaaaa/pagina-${String(i + 1).padStart(3, '0')}.jpg`;
    noBunny.set(img, await jpeg());
    const translationLayers = [];
    for (const l of baloes) {
      const b = img.replace('.jpg', `-${l}.png`);
      noBunny.set(b, await png());
      translationLayers.push({ language: l, imageUrl: url(b) });
    }
    panels.push({ image_url: url(img), order: i, largura: 80, altura: 128, translationLayers });
  }
  const episode = await Episode.create({
    seriesId: series._id, episode_number: 4, title: 'EP4 no ar', status: 'published',
    panels, thumbnail: panels[0]?.image_url, notificationSentAt: JA_AVISADO, ...extra,
  });
  return { series, episode };
}

const com = (req, token) => req.set('Authorization', `Bearer ${token}`);
const admin = () => auth.getToken('admin');
const grade = (ep, resto = '') => `/api/edicao-paineis/${ep._id}${resto}`;
const trocarImagem = (ep, pid, token, buffer) => com(request(app).put(grade(ep, `/paineis/${pid}/imagem`)), token).attach('arquivo', buffer, 'nova.jpg');
const trocarBalao = (ep, pid, l, token, buffer) => com(request(app).put(grade(ep, `/paineis/${pid}/baloes/${l}`)), token).attach('arquivo', buffer, 'balao.png');
const removerBalao = (ep, pid, l, token) => com(request(app).delete(grade(ep, `/paineis/${pid}/baloes/${l}`)), token);
const apagar = (ep, ids, token) => com(request(app).post(grade(ep, '/apagar')), token).send({ paineis: ids });
const enviarRevisao = (ep, token) => com(request(app).post(`/api/portal/episodios/${ep._id}/revisao/enviar`), token);
const descartar = (ep, token) => com(request(app).delete(`/api/portal/episodios/${ep._id}/revisao`), token);
const aprovar = (ep, token = admin()) => com(request(app).post(`/api/admin/aprovacoes/revisoes/${ep._id}/aprovar`), token);
const devolver = (ep, texto, token = admin()) => com(request(app).post(`/api/admin/aprovacoes/revisao/${ep._id}/devolver`), token).send({ texto });
const leitura = (ep, token) => { const r = request(app).get(`/api/admin/aprovacoes/revisoes/${ep._id}/leitura`); return token ? com(r, token) : r; };
const fila = async () => (await com(request(app).get('/api/admin/aprovacoes'), admin())).body.itens;

/** O que o LEITOR recebe: as duas rotas públicas, sem login. */
async function noAr(ep, series) {
  const detalhe = await request(app).get(`/api/content/episodes/${ep._id}`);
  const lista = await request(app).get(`/api/content/series/${series._id}/episodes`);
  expect(detalhe.status).toBe(200);
  expect(lista.status).toBe(200);
  const daLista = lista.body.find(e => String(e._id) === String(ep._id));
  const so = (e) => ({
    status: e.status,
    thumbnail: e.thumbnail,
    panels: e.panels.map(p => ({ _id: String(p._id), image_url: p.image_url, order: p.order, baloes: (p.translationLayers || []).map(c => `${c.language}=${c.imageUrl}`) })),
  });
  expect(so(daLista)).toEqual(so(detalhe.body));
  return so(detalhe.body);
}

/** As quatro ações da grade, de uma vez, num episódio de 4 painéis. */
async function editarTudo(ep, autor) {
  const doc = await Episode.findById(ep._id).lean();
  const id = (i) => String(doc.panels[i]._id);
  const rs = [
    await trocarImagem(ep, id(0), autor.token, await jpeg()),
    await trocarBalao(ep, id(1), 'en', autor.token, await png()),
    await removerBalao(ep, id(2), 'pt', autor.token),
    await apagar(ep, [id(3)], autor.token),
  ];
  expect(rs.map(r => r.status)).toEqual([200, 200, 200, 200]);
  return doc;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('editar episódio publicado não muda o que o leitor recebe', () => {
  it('abrir a grade não cria edição; a 1a mudança cria, como cópia do que está no ar', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const antes = await com(request(app).get(grade(episode)), autor.token);
    expect(antes.status).toBe(200);
    expect(antes.body).toMatchObject({ modo: 'publicado', podeEditar: true, revisao: null });
    expect(antes.body.panels).toHaveLength(4);
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);

    const doc = await Episode.findById(episode._id).lean();
    expect((await removerBalao(episode, String(doc.panels[1]._id), 'en', autor.token)).status).toBe(200);
    const rev = await RevisaoEpisodio.findById(episode._id).lean();
    expect(rev.status).toBe('editando');
    expect(rev.panels.map(p => String(p._id))).toEqual(doc.panels.map(p => String(p._id)));
    expect(rev.panels[1].translationLayers.map(c => c.language)).toEqual(['pt']);
    expect(rev.panels[0].translationLayers).toEqual(doc.panels[0].translationLayers);

    const depois = await com(request(app).get(grade(episode)), autor.token);
    expect(depois.body).toMatchObject({ modo: 'revisao', podeEditar: true });
    expect(depois.body.revisao).toMatchObject({ status: 'editando', totalPaineis: 4, devolucao: null });
    expect(depois.body.panels[1].translationLayers.map(c => c.language)).toEqual(['pt']);
  });

  it('as 4 ações da grade ficam na edição: as rotas públicas devolvem o MESMO episódio e nenhum arquivo do ar sai do Bunny', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    const arquivosDoAr = [...noBunny.keys()];

    await editarTudo(episode, autor);

    expect(await noAr(episode, series)).toEqual(antes);
    arquivosDoAr.forEach(c => expect(noBunny.has(c), c).toBe(true));
    expect(apagados).toEqual([]);
    const doc = await Episode.findById(episode._id).lean();
    expect(doc.status).toBe('published');
    expect(doc.notificationSentAt).toEqual(JA_AVISADO);

    // A edição tem as 4 mudanças.
    const rev = await RevisaoEpisodio.findById(episode._id).lean();
    expect(rev.panels).toHaveLength(3);
    expect(rev.panels[0].image_url).not.toBe(doc.panels[0].image_url);
    expect(rev.panels[1].translationLayers.find(c => c.language === 'en').imageUrl).not.toBe(doc.panels[1].translationLayers.find(c => c.language === 'en').imageUrl);
    expect(rev.panels[2].translationLayers.map(c => c.language)).toEqual(['en']);
  });

  it('duas mudanças ao mesmo tempo num episódio sem edição: UMA edição, com as duas', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const doc = await Episode.findById(episode._id).lean();
    const rs = await Promise.all([
      removerBalao(episode, String(doc.panels[0]._id), 'pt', autor.token),
      removerBalao(episode, String(doc.panels[1]._id), 'en', autor.token),
      apagar(episode, [String(doc.panels[3]._id)], autor.token),
    ]);
    expect(rs.map(r => r.status)).toEqual([200, 200, 200]);
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(1);
    const rev = await RevisaoEpisodio.findById(episode._id).lean();
    expect(rev.panels).toHaveLength(3);
    expect(rev.panels[0].translationLayers.map(c => c.language)).toEqual(['en']);
    expect(rev.panels[1].translationLayers.map(c => c.language)).toEqual(['pt']);
  });

  it('arquivo trocado duas vezes dentro da edição: o do meio sai do Bunny, o do ar fica', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const doc = await Episode.findById(episode._id).lean();
    const pid = String(doc.panels[0]._id);
    const r1 = await trocarImagem(episode, pid, autor.token, await jpeg());
    const r2 = await trocarImagem(episode, pid, autor.token, await jpeg());
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(apagados).toEqual([caminho(r1.body.panel.image_url)]);
    expect(noBunny.has(caminho(doc.panels[0].image_url))).toBe(true);
    expect(noBunny.has(caminho(r2.body.panel.image_url))).toBe(true);
  });

  it('outro autor: 404 na grade e nas rotas da edição, e nenhuma edição nasce', async () => {
    const dono = await criarAutor();
    const outro = await criarAutor();
    const { episode, series } = await publicado(dono);
    const doc = await Episode.findById(episode._id).lean();
    const pid = String(doc.panels[0]._id);
    const respostas = [
      await com(request(app).get(grade(episode)), outro.token),
      await apagar(episode, [pid], outro.token),
      await trocarImagem(episode, pid, outro.token, await jpeg()),
      await removerBalao(episode, pid, 'en', outro.token),
      await enviarRevisao(episode, outro.token),
      await descartar(episode, outro.token),
      await com(request(app).get(`/api/portal/series/${series._id}/revisoes`), outro.token),
    ];
    expect(respostas.map(r => r.status)).toEqual(Array(7).fill(404));
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('enviar a edição para aprovação', () => {
  it('só entra na fila depois de enviada; na fila o autor não mexe mais (403) e o leitor continua igual', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    const doc = await editarTudo(episode, autor);

    expect((await fila()).some(i => i.tipo === 'revisao')).toBe(false);
    const lista = await com(request(app).get(`/api/portal/series/${series._id}/revisoes`), autor.token);
    expect(lista.body.revisoes).toEqual([expect.objectContaining({ episodeId: String(episode._id), status: 'editando', totalPaineis: 3 })]);

    const env = await enviarRevisao(episode, autor.token);
    expect(env.status).toBe(200);
    expect(env.body.revisao).toMatchObject({ status: 'enviada', totalPaineis: 3 });

    const item = (await fila()).find(i => i.tipo === 'revisao' && String(i.id) === String(episode._id));
    expect(item).toMatchObject({
      title: 'EP4 no ar', panelCount: 3, panelCountNoAr: 4,
      serie: { id: String(series._id), title: series.title, isPublished: true },
      canal: { id: String(autor.canal._id), name: autor.canal.name },
    });
    // O episódio publicado NÃO aparece como capítulo novo na fila.
    expect((await fila()).some(i => i.tipo === 'episode' && String(i.id) === String(episode._id))).toBe(false);

    const pid = String(doc.panels[0]._id);
    const travado = [
      await apagar(episode, [pid], autor.token),
      await trocarImagem(episode, pid, autor.token, await jpeg()),
      await trocarBalao(episode, pid, 'es', autor.token, await png()),
      await removerBalao(episode, pid, 'en', autor.token),
      await descartar(episode, autor.token),
    ];
    expect(travado.map(r => r.status)).toEqual(Array(5).fill(403));
    travado.forEach(r => expect(r.body.error).toMatch(/em análise/));
    expect((await enviarRevisao(episode, autor.token)).status).toBe(400);
    const verGrade = await com(request(app).get(grade(episode)), autor.token);
    expect(verGrade.body).toMatchObject({ modo: 'revisao', podeEditar: false });
    expect(verGrade.body.motivo).toMatch(/em análise/);

    expect(await noAr(episode, series)).toEqual(antes);
  });

  it('sem edição não há o que enviar; edição sem nenhum painel não vai; rascunho não usa esta rota', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor, { n: 2 });
    expect((await enviarRevisao(episode, autor.token)).status).toBe(400);

    const doc = await Episode.findById(episode._id).lean();
    expect((await apagar(episode, doc.panels.map(p => String(p._id)), autor.token)).status).toBe(200);
    const vazia = await enviarRevisao(episode, autor.token);
    expect(vazia.status).toBe(400);
    expect(vazia.body.error).toMatch(/nenhum painel/);

    const series = await Series.create({ title: 'Obra Rascunho Rev', content_type: 'hiqua', channelId: autor.canal._id });
    const rascunho = await Episode.create({ seriesId: series._id, episode_number: 1, title: 'Rascunho', status: 'draft', panels: [{ image_url: 'https://x/p.jpg', order: 0 }] });
    expect((await enviarRevisao(rascunho, autor.token)).status).toBe(400);
    // E o rascunho continua sendo editado direto, como no item 6 (sem edição à parte).
    const r = await Episode.findById(rascunho._id).lean();
    expect((await apagar(rascunho, [String(r.panels[0]._id)], autor.token)).status).toBe(200);
    expect((await Episode.findById(rascunho._id).lean()).panels).toEqual([]);
    expect(await RevisaoEpisodio.countDocuments({ _id: rascunho._id })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o moderador lê a edição (leitor do item 8)', () => {
  it('admin recebe os painéis DA EDIÇÃO; qualquer outro é negado; edição não enviada dá 404', async () => {
    const autor = await criarAutor();
    const outro = await criarAutor();
    const { episode, series } = await publicado(autor);
    await editarTudo(episode, autor);

    expect((await leitura(episode, admin())).status).toBe(404); // ainda não enviada
    await enviarRevisao(episode, autor.token);

    const res = await leitura(episode, admin());
    expect(res.status).toBe(200);
    const rev = await RevisaoEpisodio.findById(episode._id).lean();
    expect(res.body).toMatchObject({ title: 'EP4 no ar', status: 'published', revisao: true, serie: { id: String(series._id), title: series.title } });
    expect(res.body.panels.map(p => p.image_url)).toEqual(rev.panels.map(p => p.image_url));
    expect(res.body.porIdioma).toEqual({ pt: 2, en: 3, es: 0, zh: 0 });

    expect((await leitura(episode)).status).toBe(401);
    for (const token of [auth.getToken('user'), auth.getToken('premium'), autor.token, outro.token]) {
      const neg = await leitura(episode, token);
      expect(neg.status).toBe(403);
      expect(JSON.stringify(neg.body)).not.toContain(CDN);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('devolver', () => {
  it('guarda o motivo, o autor vê, nada muda no ar, e o autor pode mexer e reenviar', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    await editarTudo(episode, autor);
    await enviarRevisao(episode, autor.token);
    const arquivos = noBunny.size;

    expect((await devolver(episode, '   ')).status).toBe(400);
    expect((await devolver(episode, 'x', autor.token)).status).toBe(403);

    const res = await devolver(episode, 'O balão do painel 2 está cortado.');
    expect(res.status).toBe(200);
    expect(res.body.revisao).toMatchObject({ status: 'editando', devolucao: { motivo: 'O balão do painel 2 está cortado.' } });

    // Nada mudou no ar, nada saiu do Bunny.
    expect(await noAr(episode, series)).toEqual(antes);
    expect(noBunny.size).toBe(arquivos);
    expect(apagados).toEqual([]);

    // O autor vê o motivo no Meu Estúdio e na conversa do canal.
    const lista = await com(request(app).get(`/api/portal/series/${series._id}/revisoes`), autor.token);
    expect(lista.body.revisoes[0]).toMatchObject({ status: 'editando', submittedAt: null });
    expect(lista.body.revisoes[0].devolucao.motivo).toBe('O balão do painel 2 está cortado.');
    const msg = await MensagemPortal.findOne({ refTipo: 'episode', refId: episode._id }).lean();
    expect(msg).toMatchObject({ autorTipo: 'editor', texto: 'O balão do painel 2 está cortado.', ownerUserId: expect.anything() });
    expect(String(msg.canalId)).toBe(String(autor.canal._id));
    expect(await AdminLog.countDocuments({ action: 'DEVOLVER_REVISAO_EPISODIO', targetId: String(episode._id) })).toBe(1);

    // Saiu da fila; devolver de novo não tem o que devolver.
    expect((await fila()).some(i => i.tipo === 'revisao' && String(i.id) === String(episode._id))).toBe(false);
    expect((await devolver(episode, 'de novo')).status).toBe(400);
    expect((await aprovar(episode)).status).toBe(400);

    // Volta a ser editável e reenviável.
    const rev = await RevisaoEpisodio.findById(episode._id).lean();
    expect((await trocarBalao(episode, String(rev.panels[1]._id), 'en', autor.token, await png())).status).toBe(200);
    expect((await enviarRevisao(episode, autor.token)).status).toBe(200);
    expect(await noAr(episode, series)).toEqual(antes);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('aprovar', () => {
  it('troca os painéis de uma vez, apaga do Bunny só o que saiu, e NÃO avisa capítulo novo nem recalcula', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    const doc = await editarTudo(episode, autor);
    await enviarRevisao(episode, autor.token);
    const rev = await RevisaoEpisodio.findById(episode._id).lean();

    const spyPush = vi.spyOn(notificationService, 'notifyEpisodePublished');
    const spyRecalculo = vi.spyOn(recommendationService, 'dispararRecalculo');
    try {
      expect((await aprovar(episode, autor.token)).status).toBe(403);
      expect((await aprovar(episode, auth.getToken('user'))).status).toBe(403);
      expect(await noAr(episode, series)).toEqual(antes);

      const res = await aprovar(episode);
      expect(res.status).toBe(200);
      expect(res.body.totalPaineis).toBe(3);

      // O leitor passa a receber exatamente os painéis da edição.
      const agora = await noAr(episode, series);
      expect(agora.status).toBe('published');
      expect(agora.panels.map(p => p.image_url)).toEqual(rev.panels.map(p => p.image_url));
      expect(agora.panels.map(p => p._id)).toEqual(rev.panels.map(p => String(p._id)));
      expect(agora.panels[1].baloes).toEqual(rev.panels[1].translationLayers.map(c => `${c.language}=${c.imageUrl}`));
      expect(agora.panels[2].baloes).toEqual([`en=${doc.panels[2].translationLayers[1].imageUrl}`]);
      // A capa era a imagem do 1o painel (automática): acompanha a imagem nova.
      expect(agora.thumbnail).toBe(rev.panels[0].image_url);

      // Do Bunny saiu só o que deixou de ser usado: a imagem antiga do painel
      // 1, o balão EN antigo do 2, o balão PT do 3 e os 3 arquivos do painel 4.
      const esperados = [
        doc.panels[0].image_url,
        doc.panels[1].translationLayers[1].imageUrl,
        doc.panels[2].translationLayers[0].imageUrl,
        doc.panels[3].image_url, doc.panels[3].translationLayers[0].imageUrl, doc.panels[3].translationLayers[1].imageUrl,
      ].map(caminho).sort();
      expect([...apagados].sort()).toEqual(esperados);
      const emUso = (await Episode.findById(episode._id).lean()).panels.flatMap(p => [p.image_url, ...p.translationLayers.map(c => c.imageUrl)]).map(caminho);
      emUso.forEach(c => expect(noBunny.has(c), c).toBe(true));
      expect(noBunny.size).toBe(emUso.length);

      // R7: nenhum aviso de capítulo novo, nenhum recálculo, e a guarda do aviso intacta.
      await new Promise(r => setTimeout(r, 150));
      expect(spyPush).not.toHaveBeenCalled();
      expect(spyRecalculo).not.toHaveBeenCalled();
      const salvo = await Episode.findById(episode._id).lean();
      expect(salvo.notificationSentAt).toEqual(JA_AVISADO);
      expect(salvo.status).toBe('published');
      expect(salvo.submittedAt).toBeNull();

      // A edição acabou: some da fila, não se aprova duas vezes, fica o registro.
      expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);
      expect((await fila()).some(i => i.tipo === 'revisao' && String(i.id) === String(episode._id))).toBe(false);
      expect((await aprovar(episode)).status).toBe(404);
      expect(await AdminLog.countDocuments({ action: 'APROVAR_REVISAO_EPISODIO', targetId: String(episode._id) })).toBe(1);
      // E o autor pode começar outra edição.
      expect((await removerBalao(episode, String(salvo.panels[0]._id), 'pt', autor.token)).status).toBe(200);
    } finally {
      spyPush.mockRestore();
      spyRecalculo.mockRestore();
    }
  });

  it('episódio que nunca teve o aviso enviado (notificationSentAt vazio): aprovar a edição também não avisa', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor, { extra: { notificationSentAt: null } });
    const doc = await Episode.findById(episode._id).lean();
    await removerBalao(episode, String(doc.panels[0]._id), 'pt', autor.token);
    await enviarRevisao(episode, autor.token);
    const enviados = [];
    notificationService.__setTransportForTests(async (...args) => { enviados.push(args); });
    const spyPush = vi.spyOn(notificationService, 'notifyEpisodePublished');
    try {
      expect((await aprovar(episode)).status).toBe(200);
      await new Promise(r => setTimeout(r, 150));
      expect(spyPush).not.toHaveBeenCalled();
      expect(enviados).toEqual([]);
      expect((await Episode.findById(episode._id).lean()).notificationSentAt).toBeNull();
    } finally {
      spyPush.mockRestore();
      notificationService.__setTransportForTests(null);
    }
  });

  it('só edição ENVIADA se aprova: em rascunho do autor dá 400 e nada muda no ar', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    await editarTudo(episode, autor);
    const res = await aprovar(episode);
    expect(res.status).toBe(400);
    expect(await noAr(episode, series)).toEqual(antes);
    expect((await RevisaoEpisodio.findById(episode._id).lean()).status).toBe('editando');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('reenvio da pasta (item 3) em episódio publicado vira edição', () => {
  const SUFIXO = { pt: 'PORT', en: 'ENG', es: 'ESP', zh: 'ZHO' };
  async function pasta(paginas, { capa = false } = {}) {
    const lista = [];
    const bytes = [];
    if (capa) { bytes.push(await jpeg(60, 90)); lista.push({ nome: 'EP/Capa.jpeg', largura: 60, altura: 90, tamanho: bytes.at(-1).length }); }
    for (const p of paginas) {
      const nome = `EP/Pagina ${String(p.n).padStart(3, '0')}`;
      bytes.push(await jpeg()); lista.push({ nome: `${nome}.jpeg`, largura: 80, altura: 128, tamanho: bytes.at(-1).length });
      for (const l of p.baloes || []) { bytes.push(await png()); lista.push({ nome: `${nome}_${SUFIXO[l]}.png`, largura: 80, altura: 128, tamanho: bytes.at(-1).length }); }
    }
    return { lista, bytes };
  }
  async function enviarPasta(token, ep, paginas, opcoes) {
    const { lista, bytes } = await pasta(paginas, opcoes);
    const ini = await com(request(app).post(`/api/envio-episodio/${ep._id}/iniciar`), token).send({ arquivos: lista });
    if (ini.status !== 201) return { ini };
    let parte = com(request(app).post(`/api/envio-episodio/${ini.body.envioId}/partes`), token);
    for (const a of ini.body.arquivos) {
      const balao = a.tipo === 'balao';
      parte = parte.attach(a.chave, bytes[a.indice], { filename: `${a.chave}.${balao ? 'png' : 'jpg'}`, contentType: balao ? 'image/png' : 'image/jpeg' });
    }
    expect((await parte).status).toBe(200);
    const fim = await com(request(app).post(`/api/envio-episodio/${ini.body.envioId}/concluir`), token);
    return { ini, fim };
  }

  it('o autor reenvia a pasta: o ar não muda, a edição recebe os painéis novos; aprovado, troca tudo e apaga a versão antiga', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    const arquivosDoAr = [...noBunny.keys()];

    const spyPush = vi.spyOn(notificationService, 'notifyEpisodePublished');
    try {
      const { ini, fim } = await enviarPasta(autor.token, episode, [{ n: 1, baloes: ['en'] }, { n: 2 }, { n: 3, baloes: ['en', 'zh'] }, { n: 4 }, { n: 5 }], { capa: true });
      expect(ini.status).toBe(201);
      expect(ini.body.paraRevisao).toBe(true);
      expect(fim.status).toBe(200);
      expect(fim.body).toMatchObject({ paraRevisao: true, totalPaineis: 5, revisao: { status: 'editando', totalPaineis: 5 } });
      // A resposta traz o episódio COMO ESTÁ NO AR.
      expect(fim.body.episode.panels.map(p => p.image_url)).toEqual(antes.panels.map(p => p.image_url));

      expect(await noAr(episode, series)).toEqual(antes);
      arquivosDoAr.forEach(c => expect(noBunny.has(c), c).toBe(true));
      expect(apagados).toEqual([]);
      await new Promise(r => setTimeout(r, 100));
      expect(spyPush).not.toHaveBeenCalled();

      const rev = await RevisaoEpisodio.findById(episode._id).lean();
      expect(rev.panels).toHaveLength(5);
      expect(rev.panels.map(p => p.translationLayers.map(c => c.language))).toEqual([['en'], [], ['en', 'zh'], [], []]);
      expect(rev.thumbnail).toMatch(/capa\.jpg$/);

      expect((await enviarRevisao(episode, autor.token)).status).toBe(200);
      // Com a edição na fila, um novo envio de pasta é recusado.
      const denovo = await enviarPasta(autor.token, episode, [{ n: 1 }]);
      expect(denovo.ini.status).toBe(403);

      expect((await aprovar(episode)).status).toBe(200);
      const agora = await noAr(episode, series);
      expect(agora.panels.map(p => p.image_url)).toEqual(rev.panels.map(p => p.image_url));
      expect(agora.thumbnail).toBe(rev.thumbnail);
      // A versão antiga inteira (4 páginas e 8 balões) saiu do Bunny.
      expect([...apagados].sort()).toEqual([...arquivosDoAr].sort());
      expect(spyPush).not.toHaveBeenCalled();
    } finally {
      spyPush.mockRestore();
    }
  });

  it('segunda pasta antes de enviar: substitui a edição e apaga os arquivos da primeira, nunca os do ar', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    const arquivosDoAr = [...noBunny.keys()];
    await enviarPasta(autor.token, episode, [{ n: 1, baloes: ['en'] }, { n: 2 }]);
    const primeira = (await RevisaoEpisodio.findById(episode._id).lean()).panels.flatMap(p => [p.image_url, ...p.translationLayers.map(c => c.imageUrl)]).map(caminho);
    expect(primeira).toHaveLength(3);

    const { fim } = await enviarPasta(autor.token, episode, [{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(fim.status).toBe(200);
    expect([...apagados].sort()).toEqual([...primeira].sort());
    arquivosDoAr.forEach(c => expect(noBunny.has(c), c).toBe(true));
    expect(await noAr(episode, series)).toEqual(antes);
    expect((await RevisaoEpisodio.findById(episode._id).lean()).panels).toHaveLength(3);
  });

  it('o admin continua trocando direto o episódio publicado (como no item 3), sem edição à parte', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const { ini, fim } = await enviarPasta(admin(), episode, [{ n: 1 }, { n: 2 }]);
    expect(ini.body.paraRevisao).toBe(false);
    expect(fim.status).toBe(200);
    expect(fim.body.paraRevisao).toBeUndefined();
    expect((await Episode.findById(episode._id).lean()).panels).toHaveLength(2);
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('desistir, e o admin mexendo no ar com edição pendente', () => {
  it('descartar: a edição some, os arquivos que só ela usava saem do Bunny, o ar fica igual', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const antes = await noAr(episode, series);
    const arquivosDoAr = [...noBunny.keys()];
    await editarTudo(episode, autor);
    const novos = [...noBunny.keys()].filter(c => !arquivosDoAr.includes(c));
    expect(novos).toHaveLength(2); // a imagem nova do painel 1 e o balão EN novo do 2

    const res = await descartar(episode, autor.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ descartada: true, apagadosDoBunny: 2 });
    expect([...apagados].sort()).toEqual([...novos].sort());
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);
    expect(await noAr(episode, series)).toEqual(antes);
    expect([...noBunny.keys()].sort()).toEqual([...arquivosDoAr].sort());
    // Descartar sem edição não é erro.
    expect((await descartar(episode, autor.token)).body.descartada).toBe(false);
  });

  it('admin apaga um painel do episódio NO AR com edição pendente: o arquivo que a edição ainda usa não sai do Bunny', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const doc = await Episode.findById(episode._id).lean();
    // A edição só tira um balão do painel 1; os outros painéis seguem iguais aos do ar.
    await removerBalao(episode, String(doc.panels[0]._id), 'pt', autor.token);

    const res = await apagar(episode, [String(doc.panels[3]._id)], admin());
    expect(res.status).toBe(200);
    expect((await Episode.findById(episode._id).lean()).panels).toHaveLength(3);
    expect(apagados).toEqual([]);
    expect(noBunny.has(caminho(doc.panels[3].image_url))).toBe(true);
    // A edição do autor não foi tocada pelo admin.
    expect((await RevisaoEpisodio.findById(episode._id).lean()).panels).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Pontas soltas dos itens 6 e 7 (27/11/2026).
describe('admin apaga o episódio (ou a obra) que tem edição pendente', () => {
  const apagarEpisodio = (ep) => com(request(app).delete(`/api/content/episodes/${ep._id}`), admin());

  it('a edição sai junto e os arquivos que só ela usava saem do Bunny; os do episódio apagado ficam, como antes', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const arquivosDoAr = [...noBunny.keys()];
    await editarTudo(episode, autor);
    const soDaEdicao = [...noBunny.keys()].filter(c => !arquivosDoAr.includes(c));
    expect(soDaEdicao).toHaveLength(2);
    expect((await enviarRevisao(episode, autor.token)).status).toBe(200);
    expect((await fila()).some(i => i.tipo === 'revisao' && String(i.id) === String(episode._id))).toBe(true);
    apagados.length = 0;

    const res = await apagarEpisodio(episode);
    expect(res.status).toBe(200);
    expect(await Episode.countDocuments({ _id: episode._id })).toBe(0);
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);
    expect([...apagados].sort()).toEqual([...soDaEdicao].sort());
    expect([...noBunny.keys()].sort()).toEqual([...arquivosDoAr].sort());
    expect((await fila()).some(i => String(i.id) === String(episode._id))).toBe(false);
  });

  it('episódio sem edição: apagar continua igual e nada sai do Bunny', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const res = await apagarEpisodio(episode);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Episódio removido.' });
    expect(apagados).toEqual([]);
  });

  it('arquivo da edição que OUTRO episódio usa não é apagado', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const doc = await Episode.findById(episode._id).lean();
    expect((await trocarImagem(episode, String(doc.panels[0]._id), autor.token, await jpeg())).status).toBe(200);
    const nova = (await RevisaoEpisodio.findById(episode._id).lean()).panels[0].image_url;
    const outro = await publicado(autor, { n: 1, baloes: [] });
    await Episode.updateOne({ _id: outro.episode._id }, { $set: { thumbnail: nova } });
    apagados.length = 0;

    expect((await apagarEpisodio(episode)).status).toBe(200);
    expect(await RevisaoEpisodio.countDocuments({ _id: episode._id })).toBe(0);
    expect(apagados).toEqual([]);
    expect(noBunny.has(caminho(nova))).toBe(true);
  });

  it('apagar a OBRA inteira: as edições dos episódios dela saem, com os arquivos que só elas usavam', async () => {
    const autor = await criarAutor();
    const { episode, series } = await publicado(autor);
    const arquivosDoAr = [...noBunny.keys()];
    await editarTudo(episode, autor);
    const soDaEdicao = [...noBunny.keys()].filter(c => !arquivosDoAr.includes(c));
    apagados.length = 0;

    const res = await com(request(app).delete(`/api/content/series/${series._id}`), admin());
    expect(res.status).toBe(200);
    expect(await RevisaoEpisodio.countDocuments({ seriesId: series._id })).toBe(0);
    expect([...apagados].sort()).toEqual([...soDaEdicao].sort());
  });
});

describe('Meu Estúdio: o contador de pendentes conta a edição na fila', () => {
  const pendentes = async (autor) => {
    const res = await com(request(app).get('/api/portal/meu-estudio'), autor.token);
    expect(res.status).toBe(200);
    return res.body.canais[0].pendentes;
  };

  it('edição em rascunho não conta; enviada conta 1; devolvida ou aprovada volta a 0', async () => {
    const autor = await criarAutor();
    const { episode } = await publicado(autor);
    const segundo = await publicado(autor);
    expect(await pendentes(autor)).toBe(0);

    await editarTudo(episode, autor);
    expect(await pendentes(autor)).toBe(0); // o autor ainda está mexendo
    expect((await enviarRevisao(episode, autor.token)).status).toBe(200);
    expect(await pendentes(autor)).toBe(1);

    await editarTudo(segundo.episode, autor);
    expect((await enviarRevisao(segundo.episode, autor.token)).status).toBe(200);
    expect(await pendentes(autor)).toBe(2);

    expect((await devolver(episode, 'Falta o balão do painel 2.')).status).toBe(200);
    expect(await pendentes(autor)).toBe(1);
    expect((await aprovar(segundo.episode)).status).toBe(200);
    expect(await pendentes(autor)).toBe(0);
  });

  it('a edição de OUTRO autor não entra na conta', async () => {
    const autor = await criarAutor();
    const outro = await criarAutor();
    await publicado(autor);
    const { episode } = await publicado(outro);
    await editarTudo(episode, outro);
    expect((await enviarRevisao(episode, outro.token)).status).toBe(200);
    expect(await pendentes(autor)).toBe(0);
    expect(await pendentes(outro)).toBe(1);
  });
});
