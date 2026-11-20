/**
 * Regressão: GET /api/content/series/:id/episodes entregava a MÍDIA de
 * episódio Premium (URLs dos painéis, camadas de idioma, video_url,
 * bunnyVideoId, faixas de áudio) a quem não tem direito — visitante, conta
 * gratuita, assinatura vencida.
 *
 * Achado em 19/11/2026 lendo o código. A Fase 6 (363af62, 07/10/2026) passou
 * o Premium para o servidor em GET /episodes/:id e em /api/bunny/signed-url,
 * mas a LISTA continuou devolvendo o documento inteiro do episódio. Como o
 * leitor e o player buscam a lista antes de abrir o episódio, o conteúdo pago
 * estava dentro de uma resposta pública: o 403 do detalhe era contornável
 * com uma chamada só.
 *
 * O que se exige aqui, por perfil:
 *   - visitante, conta gratuita, assinatura vencida: o episódio Premium
 *     CONTINUA na lista (é vitrine, a tela precisa vender), mas sem nenhum
 *     campo de mídia e com `bloqueio` dizendo o convite certo;
 *   - assinante ativo, autor dono da obra, admin: lista completa;
 *   - episódio gratuito: completo para todos.
 *
 * A decisão de quem lê fica em utils/autorizacaoConteudo.js; o teste não
 * depende de como a rota chama a porta, só do que sai pela rede.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const { createUsers, getToken } = require('../helpers/auth');

let app;
let Series, Episode, Channel, User;
let tokenAutor, tokenVencido;
let seriePaga, serieMista;
let epPago1, epPago2, epGratis, epPagoNaSerieGratis;

// Toda chave de mídia que não pode sair para quem não tem direito.
const CAMPOS_DE_MIDIA = [
  'video_url', 'bunnyVideoId',
  'audioTrack1Url', 'audioTrack2Url', 'audioTrack3Url', 'audioTrack4Url',
];

const PAINEIS = [
  {
    image_url: 'https://lorflux-storage.b-cdn.net/lorflux/series/x/panels/pago-1.jpg',
    order: 0,
    translationLayers: [{ language: 'en', imageUrl: 'https://lorflux-storage.b-cdn.net/lorflux/series/x/panels/pago-1-en.png' }],
  },
  { image_url: 'https://lorflux-storage.b-cdn.net/lorflux/series/x/panels/pago-2.jpg', order: 1 },
];

function midiaDoEpisodio(sufixo) {
  return {
    video_url: `https://vz-teste.b-cdn.net/${sufixo}/playlist.m3u8`,
    bunnyVideoId: `guid-${sufixo}`,
    audioTrack1Url: `https://lorflux-storage.b-cdn.net/audio/${sufixo}-pt.mp3`,
    audioTrack2Url: `https://lorflux-storage.b-cdn.net/audio/${sufixo}-en.mp3`,
    panels: PAINEIS,
  };
}

async function criarELogar(email, extra = {}) {
  await User.create({
    email, passwordHash: await bcrypt.hash('Senha@12345', 10), nome: email.split('@')[0], role: 'user', isActive: true, ...extra,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Senha@12345' });
  if (res.status !== 200) throw new Error(`login de ${email} falhou: ${res.status}`);
  return res.body.accessToken;
}

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  await createUsers(app);

  tokenAutor = await criarELogar('autor-premium-lista@lorflux.test');
  const autor = await User.findOne({ email: 'autor-premium-lista@lorflux.test' }).lean();
  // isPremium ligado com prazo no passado: é o caso de quem cancelou e cujo
  // token antigo ainda diz isPremium — o servidor tem de ler o banco.
  tokenVencido = await criarELogar('vencido-premium-lista@lorflux.test', {
    isPremium: true, premiumExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });

  const canal = await Channel.create({ ownerId: autor._id, name: `Canal Premium Lista ${Date.now()}` });

  // Obra inteira paga (isPremium na série): todo episódio dela é pago.
  seriePaga = await Series.create({
    title: 'Obra Paga Lista', genre: 'Drama', content_type: 'hiqua',
    isPublished: true, content_rating: 'teen', isPremium: true, channelId: canal._id,
    cover_image: 'https://lorflux-storage.b-cdn.net/capas/obra-paga.jpg',
  });
  epPago1 = await Episode.create({ seriesId: seriePaga._id, episode_number: 1, title: 'Pago 1', status: 'published', thumbnail: 'https://lorflux-storage.b-cdn.net/thumb/p1.jpg', ...midiaDoEpisodio('pago1') });
  epPago2 = await Episode.create({ seriesId: seriePaga._id, episode_number: 2, title: 'Pago 2', status: 'published', ...midiaDoEpisodio('pago2') });

  // Obra gratuita com UM episódio marcado como Premium (isPremium no episódio).
  serieMista = await Series.create({
    title: 'Obra Mista Lista', genre: 'Drama', content_type: 'vcine',
    isPublished: true, content_rating: 'teen', isPremium: false, channelId: canal._id,
  });
  epGratis = await Episode.create({ seriesId: serieMista._id, episode_number: 1, title: 'Gratis 1', status: 'published', ...midiaDoEpisodio('gratis1') });
  epPagoNaSerieGratis = await Episode.create({ seriesId: serieMista._id, episode_number: 2, title: 'Pago na gratis', status: 'published', isPremium: true, ...midiaDoEpisodio('mista2') });
});

afterAll(() => db.closeDatabase());

function listar(serie, token) {
  const r = request(app).get(`/api/content/series/${serie._id}/episodes`);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
}

function porId(lista, ep) {
  const achado = lista.find(e => String(e._id) === String(ep._id));
  if (!achado) throw new Error(`episódio ${ep.title} sumiu da lista`);
  return achado;
}

/** Afirma que nenhum byte de mídia do episódio saiu na resposta. */
function semMidia(ep) {
  for (const campo of CAMPOS_DE_MIDIA) {
    expect(ep[campo] ?? null, `${campo} vazou`).toBeNull();
  }
  expect(ep.panels ?? [], 'painéis vazaram').toEqual([]);
  // Nenhuma URL de painel ou camada em lugar nenhum do objeto (pega também
  // um campo novo que alguém acrescente ao schema sem lembrar da porta).
  expect(JSON.stringify(ep)).not.toMatch(/panels\/pago|playlist\.m3u8|\/audio\/|guid-/);
}

function comMidia(ep, sufixo) {
  expect(ep.video_url).toBe(`https://vz-teste.b-cdn.net/${sufixo}/playlist.m3u8`);
  expect(ep.bunnyVideoId).toBe(`guid-${sufixo}`);
  expect(ep.audioTrack1Url).toContain(`${sufixo}-pt.mp3`);
  expect(ep.panels).toHaveLength(2);
  expect(ep.panels[0].image_url).toContain('pago-1.jpg');
  expect(ep.panels[0].translationLayers[0].imageUrl).toContain('pago-1-en.png');
  expect(ep.bloqueio).toBeUndefined();
}

describe('GET /api/content/series/:id/episodes — mídia de episódio Premium', () => {
  it('visitante sem conta: episódio pago aparece na lista SEM mídia, com convite para criar conta', async () => {
    const res = await listar(seriePaga);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const ep of [epPago1, epPago2]) {
      const item = porId(res.body, ep);
      semMidia(item);
      expect(item.bloqueio).toBe('login_necessario');
    }
    // A vitrine continua: título, número e capa do episódio saem.
    const p1 = porId(res.body, epPago1);
    expect(p1.title).toBe('Pago 1');
    expect(p1.episode_number).toBe(1);
    expect(p1.thumbnail).toContain('thumb/p1.jpg');
  });

  it('conta gratuita: episódio pago SEM mídia, com convite para assinar', async () => {
    const res = await listar(seriePaga, getToken('user'));
    expect(res.status).toBe(200);
    for (const ep of [epPago1, epPago2]) {
      const item = porId(res.body, ep);
      semMidia(item);
      expect(item.bloqueio).toBe('assinatura_necessaria');
    }
  });

  it('assinatura vencida (isPremium ainda ligado no banco, prazo no passado): SEM mídia', async () => {
    const res = await listar(seriePaga, tokenVencido);
    expect(res.status).toBe(200);
    semMidia(porId(res.body, epPago1));
    expect(porId(res.body, epPago1).bloqueio).toBe('assinatura_necessaria');
  });

  it('assinante ativo: lista completa', async () => {
    const res = await listar(seriePaga, getToken('premium'));
    expect(res.status).toBe(200);
    comMidia(porId(res.body, epPago1), 'pago1');
    comMidia(porId(res.body, epPago2), 'pago2');
  });

  it('autor dono da obra (sem assinatura): lista completa da própria obra', async () => {
    const res = await listar(seriePaga, tokenAutor);
    expect(res.status).toBe(200);
    comMidia(porId(res.body, epPago1), 'pago1');
  });

  it('admin: lista completa', async () => {
    const res = await listar(seriePaga, getToken('admin'));
    expect(res.status).toBe(200);
    comMidia(porId(res.body, epPago1), 'pago1');
  });

  it('obra gratuita com um episódio Premium: o gratuito sai completo, só o pago perde a mídia', async () => {
    for (const [token, motivo] of [[undefined, 'login_necessario'], [getToken('user'), 'assinatura_necessaria']]) {
      const res = await listar(serieMista, token);
      expect(res.status).toBe(200);
      comMidia(porId(res.body, epGratis), 'gratis1');
      const pago = porId(res.body, epPagoNaSerieGratis);
      semMidia(pago);
      expect(pago.bloqueio).toBe(motivo);
    }
    const assinante = await listar(serieMista, getToken('premium'));
    comMidia(porId(assinante.body, epPagoNaSerieGratis), 'mista2');
  });

  // Compra avulsa (Bilhete de cinema): decidida em 21/10/2026, ainda NÃO
  // existe no código (nenhum modelo, rota ou campo de compra por episódio em
  // 19/11/2026). Quando entrar, ela tem de passar pela mesma porta
  // (autorizarConteudo) e este teste vira real.
  it.todo('comprador de Bilhete do episódio: lista completa daquele episódio, sem mídia nos outros pagos');
});

describe('GET /api/content/episodes/:id e /api/bunny/signed-url continuam fechados (a mesma porta)', () => {
  let cdnAnterior, tokenAnterior;
  beforeAll(() => {
    cdnAnterior = process.env.BUNNY_CDN_HOSTNAME;
    tokenAnterior = process.env.BUNNY_TOKEN_KEY;
    process.env.BUNNY_CDN_HOSTNAME = 'vz-teste.b-cdn.net';
    process.env.BUNNY_TOKEN_KEY = 'chave-teste-premium-lista';
  });
  afterAll(() => {
    if (cdnAnterior !== undefined) process.env.BUNNY_CDN_HOSTNAME = cdnAnterior; else delete process.env.BUNNY_CDN_HOSTNAME;
    if (tokenAnterior !== undefined) process.env.BUNNY_TOKEN_KEY = tokenAnterior; else delete process.env.BUNNY_TOKEN_KEY;
  });

  it('detalhe do episódio pago: 403 para visitante e conta gratuita, 200 para assinante, dono e admin', async () => {
    const url = `/api/content/episodes/${epPago1._id}`;
    expect((await request(app).get(url)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${getToken('user')}`)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${tokenVencido}`)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${getToken('premium')}`)).status).toBe(200);
    expect((await request(app).get(url).set('Authorization', `Bearer ${tokenAutor}`)).status).toBe(200);
    expect((await request(app).get(url).set('Authorization', `Bearer ${getToken('admin')}`)).status).toBe(200);
  });

  it('URL assinada do vídeo pago: 403 para visitante e conta gratuita, 200 para assinante, dono e admin', async () => {
    const url = `/api/bunny/signed-url?videoId=guid-mista2`;
    expect((await request(app).get(url)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${getToken('user')}`)).status).toBe(403);
    expect((await request(app).get(url).set('Authorization', `Bearer ${getToken('premium')}`)).status).toBe(200);
    expect((await request(app).get(url).set('Authorization', `Bearer ${tokenAutor}`)).status).toBe(200);
    expect((await request(app).get(url).set('Authorization', `Bearer ${getToken('admin')}`)).status).toBe(200);
  });
});
