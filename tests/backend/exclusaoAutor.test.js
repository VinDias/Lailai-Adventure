/**
 * O autor exclui capítulo e obra SEUS pelo Meu Estúdio
 * (routes/portal.js DELETE /episodios/:id e /series/:id,
 * services/exclusaoAutorService.js).
 *
 * RETORNO DO CLIENTE EM 27/11/2026: "os arquivos depois de enviados o autor
 * não consegue apagar. Deveria ter uma tecla excluir. Porque muitas vezes o
 * autor desiste e quer excluir a série ou algum capítulo." Até aqui só o admin
 * apagava (DELETE /api/content/...), e sem apagar os arquivos.
 *
 * O QUE ESTE ARQUIVO GARANTE
 * - só o dono: sem login 401, conta sem canal 403, OUTRO AUTOR 404, e em
 *   nenhum desses casos alguma coisa é apagada;
 * - capítulo em rascunho, enviado (na Fila de Aprovação) e devolvido: exclui
 *   direto, sai da fila, e os arquivos que só ele usava saem do Bunny; arquivo
 *   que outro capítulo ou a capa da obra usa fica; link de fora nunca é
 *   apagado;
 * - capítulo PUBLICADO: sem o título digitado, ou com o título errado, 400 e
 *   nada muda no ar; com o título, some do catálogo, e a edição pendente dele
 *   (item 7) sai da fila com os arquivos dela;
 * - vídeo: o vídeo que o AUTOR enviou sai do Bunny Stream; o que o admin pôs,
 *   não; Bunny fora do ar não impede a exclusão;
 * - envio de pasta aberto (partes já no Bunny) é cancelado e limpo;
 * - obra em rascunho, na fila e PUBLICADA (esta com o título): saem a obra,
 *   todos os capítulos, favoritos e votos; some do catálogo; a obra de outro
 *   autor não é tocada;
 * - quem excluiu fica no AdminLog.
 *
 * Bunny Storage e Bunny Stream FALSOS: nenhuma chamada de rede.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Series, Channel, User, RevisaoEpisodio, EnvioEpisodio, AdminLog, Favorite, SeriesVote, Vote, bunny, bunnyStream;

const CDN = 'cdn-exclusao-teste.b-cdn.net';
const url = (c) => `https://${CDN}/${c}`;
let apagados;
let videosApagados;
let falharNoStream;
const ambiente = {};
const VARIAVEIS = ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_KEY', 'BUNNY_STORAGE_HOSTNAME', 'BUNNY_API_KEY', 'BUNNY_LIBRARY_ID', 'BUNNY_CDN_HOSTNAME'];
let fetchReal;
let chamadasDeRede;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  RevisaoEpisodio = require('../../models/RevisaoEpisodio');
  EnvioEpisodio = require('../../models/EnvioEpisodio');
  AdminLog = require('../../models/AdminLog');
  Favorite = require('../../models/Favorite');
  SeriesVote = require('../../models/SeriesVote');
  Vote = require('../../models/Vote');
  bunny = require('../../utils/bunnyStorage');
  bunnyStream = require('../../utils/bunnyStream');
  await auth.createUsers(app);
  for (const k of VARIAVEIS) ambiente[k] = process.env[k];
  process.env.BUNNY_STORAGE_ZONE = 'zona-exclusao-teste';
  process.env.BUNNY_STORAGE_KEY = 'chave-exclusao-teste';
  process.env.BUNNY_STORAGE_HOSTNAME = CDN;
  process.env.BUNNY_API_KEY = 'chave-stream-exclusao';
  process.env.BUNNY_LIBRARY_ID = '424242';
  process.env.BUNNY_CDN_HOSTNAME = 'vz-exclusao.b-cdn.net';
  fetchReal = global.fetch;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(ambiente)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  bunny.__setUploaderForTests(null);
  bunny.__setDeleterForTests(null);
  bunnyStream.__setClientForTests(null);
  global.fetch = fetchReal;
  await db.closeDatabase();
});

beforeEach(() => {
  apagados = [];
  videosApagados = [];
  falharNoStream = false;
  chamadasDeRede = [];
  bunny.__setUploaderForTests(async (_b, c) => url(c));
  bunny.__setDeleterForTests(async (c) => { apagados.push(c); });
  bunnyStream.__setClientForTests({
    createVideo: async () => 'nao-usado',
    getVideo: async () => null,
    deleteVideo: async (id) => { if (falharNoStream) throw new Error('Bunny Stream fora do ar'); videosApagados.push(id); },
  });
  global.fetch = async (u) => { chamadasDeRede.push(String(u)); throw new Error(`chamada de rede em teste: ${u}`); };
  vi.restoreAllMocks();
  vi.spyOn(require('../../services/recommendationService'), 'dispararRecalculo').mockImplementation(() => {});
});
afterEach(() => {
  expect(chamadasDeRede).toEqual([]);
});

let contador = 0;
async function criarAutor() {
  contador += 1;
  const email = `exclusao-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash('Senha@123', 4);
  const user = await User.create({ email, passwordHash, nome: `Autor ${contador}`, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Exclusao ${contador} ${Date.now()}` });
  return { token: login.body.accessToken, canal, id: String(user._id) };
}

/** Obra do autor, direto no banco, com a capa "no Bunny". */
async function obra(autor, extra = {}) {
  contador += 1;
  const pasta = `lorflux/series/obra-${contador}`;
  const series = await Series.create({
    title: `Obra ${contador}`, content_type: 'hiqua', channelId: autor.canal._id,
    cover_image: url(`${pasta}/covers/capa.jpg`), isPublished: false, ...extra,
  });
  return { series, pasta };
}

/** Capítulo com `n` painéis e um balão em inglês em cada, tudo "no Bunny". */
async function capitulo(series, pasta, numero, extra = {}, n = 2) {
  const base = `${pasta}/ep-${String(numero).padStart(2, '0')}/20261127-000000-aaaaaa`;
  const panels = [];
  for (let i = 0; i < n; i++) {
    const img = `${base}/pagina-${String(i + 1).padStart(3, '0')}.jpg`;
    panels.push({ image_url: url(img), order: i, translationLayers: [{ language: 'en', imageUrl: url(img.replace('.jpg', '-en.png')) }] });
  }
  return Episode.create({ seriesId: series._id, episode_number: numero, title: `Capítulo ${numero}`, status: 'draft', panels, thumbnail: panels[0]?.image_url, ...extra });
}
const caminhosDe = (ep) => ep.panels.flatMap(p => [p.image_url, ...p.translationLayers.map(c => c.imageUrl)]).map(u => u.replace(`https://${CDN}/`, ''));

const com = (req, token) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
const admin = () => auth.getToken('admin');
const excluirEp = (ep, token, body) => com(request(app).delete(`/api/portal/episodios/${ep._id}`), token).send(body);
const excluirObra = (s, token, body) => com(request(app).delete(`/api/portal/series/${s._id}`), token).send(body);
const fila = async () => (await com(request(app).get('/api/admin/aprovacoes'), admin())).body.itens;
const naFila = async (id) => (await fila()).find(i => String(i.id) === String(id));
const noCatalogo = async (id) => (await request(app).get('/api/content/series?type=hiqua')).body.some(s => String(s._id) === String(id));
const logDe = (id) => AdminLog.findOne({ targetId: String(id) }).lean();

// ═══════════════════════════════════════════════════════════════════════════
describe('só o dono exclui', () => {
  it('sem login 401; conta sem canal 403 (leitor e admin); OUTRO AUTOR 404. Nada é apagado, nem do banco nem do Bunny', async () => {
    const dono = await criarAutor();
    const outro = await criarAutor();
    const { series, pasta } = await obra(dono);
    const ep = await capitulo(series, pasta, 1);

    expect((await excluirEp(ep, null)).status).toBe(401);
    expect((await excluirObra(series, null)).status).toBe(401);
    for (const papel of ['user', 'premium', 'admin']) {
      expect((await excluirEp(ep, auth.getToken(papel))).status).toBe(403);
      expect((await excluirObra(series, auth.getToken(papel))).status).toBe(403);
    }
    const rEp = await excluirEp(ep, outro.token, { confirmacao: ep.title });
    const rObra = await excluirObra(series, outro.token, { confirmacao: series.title });
    expect(rEp.status).toBe(404);
    expect(rObra.status).toBe(404);
    // A resposta ao outro autor é a mesma de um id que não existe.
    expect((await excluirEp({ _id: '6566a1b2c3d4e5f6a7b8c9d0' }, outro.token)).body).toEqual(rEp.body);
    expect((await excluirEp({ _id: 'nao-e-um-id' }, outro.token)).status).toBe(404);

    expect(await Episode.exists({ _id: ep._id })).toBeTruthy();
    expect(await Series.exists({ _id: series._id })).toBeTruthy();
    expect(apagados).toEqual([]);
    expect(await AdminLog.countDocuments({ targetId: { $in: [String(ep._id), String(series._id)] } })).toBe(0);
  });

  it('canal desativado: o ex-dono não exclui mais (403 da guarda do portal)', async () => {
    const dono = await criarAutor();
    const { series, pasta } = await obra(dono);
    const ep = await capitulo(series, pasta, 1);
    await Channel.updateOne({ _id: dono.canal._id }, { $set: { isActive: false } });
    expect((await excluirEp(ep, dono.token)).status).toBe(403);
    expect(await Episode.exists({ _id: ep._id })).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('excluir capítulo', () => {
  it('rascunho: exclui direto; os arquivos que só ele usava saem do Bunny; o que outro capítulo ou a capa da obra usa fica; link de fora não é tocado', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor);
    const ep = await capitulo(series, pasta, 1);
    const vizinho = await capitulo(series, pasta, 2);
    // Um painel do capítulo é a mesma imagem de um painel do vizinho; a
    // miniatura é a capa da obra; e há um link de fora, colado à mão.
    const compartilhada = vizinho.panels[0].image_url;
    await Episode.updateOne({ _id: ep._id }, {
      $set: { thumbnail: series.cover_image },
      $push: { panels: { $each: [{ image_url: compartilhada, order: 2 }, { image_url: 'https://outro-site.test/lorflux/x.jpg', order: 3 }] } },
    });

    const r = await excluirEp(ep, autor.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ excluido: true, estado: 'rascunho', arquivosApagados: 4, naoApagados: [] });

    expect(await Episode.exists({ _id: ep._id })).toBeNull();
    expect(apagados.sort()).toEqual(caminhosDe(ep).sort());
    // O vizinho e a obra continuam inteiros.
    expect(await Episode.exists({ _id: vizinho._id })).toBeTruthy();
    expect(await Series.exists({ _id: series._id })).toBeTruthy();

    expect(await logDe(ep._id)).toMatchObject({
      adminId: autor.id, action: 'AUTOR_EXCLUIU_EPISODIO',
      details: { title: 'Capítulo 1', estado: 'rascunho', publicado: false, seriesId: String(series._id), arquivosApagados: 4 },
    });
  });

  it('enviado (na Fila de Aprovação): exclui direto e SAI DA FILA', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { isPublished: true, genre: 'Drama', content_rating: 'teen' });
    const ep = await capitulo(series, pasta, 1, { submittedAt: new Date() });
    expect(await naFila(ep._id)).toBeTruthy();

    const r = await excluirEp(ep, autor.token);
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('na fila');
    expect(await naFila(ep._id)).toBeUndefined();
    expect(await Episode.exists({ _id: ep._id })).toBeNull();
    expect(apagados.sort()).toEqual(caminhosDe(ep).sort());
    // O moderador que estava com o card aberto recebe 404, não aprova um fantasma.
    expect((await com(request(app).post(`/api/admin/aprovacoes/episodes/${ep._id}/aprovar`), admin())).status).toBe(404);
  });

  it('devolvido pelo moderador: exclui direto', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { isPublished: true, genre: 'Drama', content_rating: 'teen' });
    const ep = await capitulo(series, pasta, 1, { submittedAt: new Date() });
    const dev = await com(request(app).post(`/api/admin/aprovacoes/episode/${ep._id}/devolver`), admin()).send({ texto: 'Falta o balão.' });
    expect(dev.status).toBe(200);

    const r = await excluirEp(ep, autor.token);
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('rascunho');
    expect(await Episode.exists({ _id: ep._id })).toBeNull();
  });

  it('PUBLICADO: sem o título, ou com o título errado, 400 e nada muda no ar; com o título, some do catálogo e fica no log quem excluiu', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { isPublished: true, genre: 'Drama', content_rating: 'teen' });
    const ep = await capitulo(series, pasta, 1, { status: 'published', title: 'O Fim da Linha' });
    const leitor = await User.findOne({ email: auth.USERS.user.email });
    await Vote.create({ userId: leitor._id, episodeId: ep._id, type: 'like' });
    const publico = () => request(app).get(`/api/content/series/${series._id}/episodes`);
    expect((await publico()).body.map(e => String(e._id))).toContain(String(ep._id));

    for (const body of [undefined, {}, { confirmacao: '' }, { confirmacao: 'O Fim' }, { confirmacao: 'Capítulo 1' }]) {
      const r = await excluirEp(ep, autor.token, body);
      expect(r.status).toBe(400);
      expect(r.body.exigeConfirmacao).toBe(true);
      expect(r.body.error).toMatch(/digite o título/);
    }
    expect((await publico()).body.map(e => String(e._id))).toContain(String(ep._id));
    expect(apagados).toEqual([]);
    expect(await logDe(ep._id)).toBeNull();

    // Maiúsculas e espaços a mais não atrapalham quem digitou certo.
    const r = await excluirEp(ep, autor.token, { confirmacao: '  o fim da  linha ' });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('publicado');
    expect((await publico()).body.map(e => String(e._id))).not.toContain(String(ep._id));
    expect((await request(app).get(`/api/content/episodes/${ep._id}`)).status).toBe(404);
    expect(apagados.sort()).toEqual(caminhosDe(ep).sort());
    expect(await Vote.countDocuments({ episodeId: ep._id })).toBe(0);
    expect(await logDe(ep._id)).toMatchObject({ adminId: autor.id, action: 'AUTOR_EXCLUIU_EPISODIO', details: { estado: 'publicado', publicado: true, title: 'O Fim da Linha' } });
    // A obra continua no ar.
    expect(await noCatalogo(series._id)).toBe(true);
  });

  it('publicado com edição na fila (item 7): a edição sai da fila e os arquivos que só ela usava saem do Bunny', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { isPublished: true, genre: 'Drama', content_rating: 'teen' });
    const ep = await capitulo(series, pasta, 1, { status: 'published' });
    const soDaEdicao = `${pasta}/ep-01/edicao/pagina-nova.jpg`;
    await RevisaoEpisodio.create({
      _id: ep._id, seriesId: series._id, userId: autor.id, status: 'enviada', submittedAt: new Date(),
      panels: [{ image_url: ep.panels[0].image_url, order: 0 }, { image_url: url(soDaEdicao), order: 1 }],
    });
    expect((await naFila(ep._id)).tipo).toBe('revisao');

    expect((await excluirEp(ep, autor.token, { confirmacao: ep.title })).status).toBe(200);
    expect(await RevisaoEpisodio.exists({ _id: ep._id })).toBeNull();
    expect(await naFila(ep._id)).toBeUndefined();
    expect(apagados.sort()).toEqual([...caminhosDe(ep), soDaEdicao].sort());
  });

  it('capítulo de vídeo: o vídeo que o AUTOR enviou sai do Bunny Stream; o que o admin pôs fica', async () => {
    const autor = await criarAutor();
    const { series } = await obra(autor, { content_type: 'vcine' });
    const doAutor = await Episode.create({ seriesId: series._id, episode_number: 1, title: 'Vídeo do autor', status: 'draft', bunnyVideoId: 'guid-autor', videoEnvio: { videoId: 'guid-autor', estado: 'pronto' }, submittedAt: new Date() });
    const doAdmin = await Episode.create({ seriesId: series._id, episode_number: 2, title: 'Vídeo do admin', status: 'draft', bunnyVideoId: 'guid-admin', video_url: 'https://vz-exclusao.b-cdn.net/guid-admin/playlist.m3u8' });
    // O admin trocou o vídeo depois: o envio antigo do autor não é mais o vídeo do episódio.
    const trocado = await Episode.create({ seriesId: series._id, episode_number: 3, title: 'Trocado pelo admin', status: 'draft', bunnyVideoId: 'guid-admin-2', videoEnvio: { videoId: 'guid-autor-velho', estado: 'pronto' } });

    const r = await excluirEp(doAutor, autor.token);
    expect(r.status).toBe(200);
    expect(r.body.videosApagados).toBe(1);
    expect((await excluirEp(doAdmin, autor.token)).status).toBe(200);
    expect((await excluirEp(trocado, autor.token)).status).toBe(200);
    expect(videosApagados).toEqual(['guid-autor']);
    expect(await Episode.countDocuments({ seriesId: series._id })).toBe(0);
  });

  it('Bunny Stream fora do ar: o capítulo é excluído do mesmo jeito e a resposta diz qual vídeo ficou para trás', async () => {
    const autor = await criarAutor();
    const { series } = await obra(autor, { content_type: 'hqcine' });
    const ep = await Episode.create({ seriesId: series._id, episode_number: 1, title: 'Vídeo', status: 'draft', bunnyVideoId: 'guid-x', videoEnvio: { videoId: 'guid-x', estado: 'processando' } });
    falharNoStream = true;
    const r = await excluirEp(ep, autor.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ excluido: true, videosApagados: 0, videosNaoApagados: ['guid-x'] });
    expect(await Episode.exists({ _id: ep._id })).toBeNull();
  });

  it('envio de pasta que ficou aberto (partes já no Bunny): é cancelado e as partes saem', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor);
    const ep = await capitulo(series, pasta, 1, {}, 0);
    const parte = `${pasta}/ep-01/20261127-101010-bbbbbb/pagina-001.jpg`;
    await EnvioEpisodio.create({
      episodeId: ep._id, userId: autor.id, pasta: `${pasta}/ep-01/20261127-101010-bbbbbb`, totalPaineis: 2,
      arquivos: [
        { chave: '0', tipo: 'pagina', ordem: 0, caminho: parte, recebido: true, url: url(parte) },
        { chave: '1', tipo: 'pagina', ordem: 1, caminho: parte.replace('001', '002'), recebido: false },
      ],
    });
    expect((await excluirEp(ep, autor.token)).status).toBe(200);
    expect(apagados).toEqual([parte]);
    expect(await EnvioEpisodio.countDocuments({ episodeId: ep._id })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('excluir obra', () => {
  it('rascunho: saem a obra, todos os capítulos, a capa e os arquivos; a obra de OUTRO autor que usa os mesmos nomes não é tocada', async () => {
    const autor = await criarAutor();
    const outro = await criarAutor();
    const { series, pasta } = await obra(autor);
    const ep1 = await capitulo(series, pasta, 1);
    const ep2 = await capitulo(series, pasta, 2, { submittedAt: new Date() });
    const alheia = await obra(outro);
    const epAlheio = await capitulo(alheia.series, alheia.pasta, 1);

    const r = await excluirObra(series, autor.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ excluido: true, estado: 'rascunho', episodios: 2, naoApagados: [] });

    expect(await Series.exists({ _id: series._id })).toBeNull();
    expect(await Episode.countDocuments({ seriesId: series._id })).toBe(0);
    expect(apagados.sort()).toEqual([...caminhosDe(ep1), ...caminhosDe(ep2), `${pasta}/covers/capa.jpg`].sort());
    expect(await Series.exists({ _id: alheia.series._id })).toBeTruthy();
    expect(await Episode.exists({ _id: epAlheio._id })).toBeTruthy();
    expect(await logDe(series._id)).toMatchObject({ adminId: autor.id, action: 'AUTOR_EXCLUIU_OBRA', details: { estado: 'rascunho', publicado: false, episodios: 2 } });
    // Sumiu do Meu Estúdio.
    const minhas = await com(request(app).get('/api/portal/series'), autor.token);
    expect(minhas.body.series.map(s => String(s._id))).not.toContain(String(series._id));
  });

  it('enviada (na fila), com capítulo também na fila: os dois saem da fila', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { submittedAt: new Date() });
    const ep = await capitulo(series, pasta, 1, { submittedAt: new Date() });
    expect(await naFila(series._id)).toBeTruthy();
    expect(await naFila(ep._id)).toBeTruthy();

    const r = await excluirObra(series, autor.token);
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('na fila');
    expect(await naFila(series._id)).toBeUndefined();
    expect(await naFila(ep._id)).toBeUndefined();
  });

  it('PUBLICADA: sem o título 400 e continua no catálogo; com o título, some do catálogo com capítulos, favoritos e votos, e fica no log quem excluiu', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { isPublished: true, genre: 'Drama', content_rating: 'teen', title: `Em Breve ${Date.now()}` });
    const ep = await capitulo(series, pasta, 1, { status: 'published' });
    await capitulo(series, pasta, 2);
    const leitor = await User.findOne({ email: auth.USERS.user.email });
    await Favorite.create({ userId: leitor._id, seriesId: series._id });
    await SeriesVote.create({ userId: leitor._id, seriesId: series._id, type: 'like' });
    expect(await noCatalogo(series._id)).toBe(true);

    for (const body of [undefined, { confirmacao: 'Em Breve' }, { confirmacao: 'outra coisa' }]) {
      const r = await excluirObra(series, autor.token, body);
      expect(r.status).toBe(400);
      expect(r.body.exigeConfirmacao).toBe(true);
    }
    expect(await noCatalogo(series._id)).toBe(true);
    expect(await Episode.countDocuments({ seriesId: series._id })).toBe(2);
    expect(apagados).toEqual([]);

    const r = await excluirObra(series, autor.token, { confirmacao: series.title.toUpperCase() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'publicada', episodios: 2 });
    expect(await noCatalogo(series._id)).toBe(false);
    expect((await request(app).get(`/api/content/series/${series._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/content/episodes/${ep._id}`)).status).toBe(404);
    expect(await Favorite.countDocuments({ seriesId: series._id })).toBe(0);
    expect(await SeriesVote.countDocuments({ seriesId: series._id })).toBe(0);
    expect(await logDe(series._id)).toMatchObject({
      adminId: autor.id, action: 'AUTOR_EXCLUIU_OBRA',
      details: { title: series.title, estado: 'publicada', publicado: true, episodios: 2, episodiosPublicados: 1, channelId: String(autor.canal._id) },
    });
  });

  it('obra removida pela curadoria (fora do ar, capítulos ainda "publicados"): não está no catálogo, exclui sem pedir o título', async () => {
    const autor = await criarAutor();
    const { series, pasta } = await obra(autor, { isPublished: false, submittedAt: null });
    await capitulo(series, pasta, 1, { status: 'published' });
    const r = await excluirObra(series, autor.token);
    expect(r.status).toBe(200);
    expect(await Episode.countDocuments({ seriesId: series._id })).toBe(0);
  });

  it('obra de vídeo: os vídeos que o autor enviou saem do Bunny Stream junto', async () => {
    const autor = await criarAutor();
    const { series } = await obra(autor, { content_type: 'vcine' });
    await Episode.create({ seriesId: series._id, episode_number: 1, title: 'A', status: 'draft', bunnyVideoId: 'v-a', videoEnvio: { videoId: 'v-a', estado: 'pronto' } });
    await Episode.create({ seriesId: series._id, episode_number: 2, title: 'B', status: 'draft', bunnyVideoId: 'v-b', videoEnvio: { videoId: 'v-b', estado: 'enviando' } });
    await Episode.create({ seriesId: series._id, episode_number: 3, title: 'C', status: 'draft', bunnyVideoId: 'v-admin' });
    const r = await excluirObra(series, autor.token);
    expect(r.status).toBe(200);
    expect(r.body.videosApagados).toBe(2);
    expect(videosApagados.sort()).toEqual(['v-a', 'v-b']);
  });
});
