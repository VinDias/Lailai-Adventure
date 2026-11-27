/**
 * Frente A, item 6: edição dos painéis pelo autor, um a um
 * (routes/edicaoPaineis.js + services/edicaoPaineisService.js).
 *
 * Critério da proposta de 21/11/2026: no Meu Estúdio o autor apaga um ou
 * vários painéis, troca a imagem de um painel no lugar, troca ou remove o
 * balão de um idioma; só o dono, só em rascunho; o arquivo que sai é apagado
 * do Bunny; e nenhuma ação salva a lista inteira de painéis (risco R1: foi o
 * defeito do balão em lote, tests/backend/balaoLoteParalelo.test.js).
 *
 * O QUE ESTE ARQUIVO GARANTE:
 * - cada ação, com conta de AUTOR, muda o painel certo e só ele;
 * - outro autor recebe 404 em todas as rotas (e leitor comum, e sem login 401);
 * - episódio enviado para aprovação: o autor recebe 403 e nada muda; admin
 *   edita qualquer um (o autor em episódio PUBLICADO é o item 7, a edição com
 *   aprovação: tests/backend/revisaoEpisodio.test.js);
 * - ações em PARALELO no mesmo episódio não perdem nada (10 balões de uma vez;
 *   imagem, balão, remoção e apagar painel misturados; tudo no mesmo painel);
 * - o arquivo que sai é apagado do Bunny, e só ele: link externo, arquivo
 *   usado por outro episódio e a capa continuam lá;
 * - o servidor confere o arquivo pelo conteúdo (tipo e tamanho).
 *
 * Bunny: nenhum pedido sai daqui (envio e apagar falsos, como no
 * envioEpisodio.test.js). O QUE NÃO GARANTE: nada da tela
 * (tests/frontend/gradePaineis.test.tsx) nem o Bunny de verdade.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Series, Channel, User, bunny;

const CDN = 'cdn-edicao-teste.b-cdn.net';
const url = (c) => `https://${CDN}/${c}`;
let noBunny; // caminho -> buffer
let apagados; // caminhos
let aoSubir; // gancho opcional chamado dentro do envio falso

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  bunny = require('../../utils/bunnyStorage');
  await auth.createUsers(app);
});

const ambiente = {};
beforeAll(() => {
  for (const k of ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_KEY', 'BUNNY_STORAGE_HOSTNAME']) ambiente[k] = process.env[k];
  process.env.BUNNY_STORAGE_ZONE = 'zona-edicao-teste';
  process.env.BUNNY_STORAGE_KEY = 'chave-edicao-teste';
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
  aoSubir = null;
  bunny.__setUploaderForTests(async (buffer, caminho) => {
    if (aoSubir) await aoSubir(caminho);
    noBunny.set(caminho, buffer);
    return url(caminho);
  });
  bunny.__setDeleterForTests(async (caminho) => { apagados.push(caminho); noBunny.delete(caminho); });
});

// ─── imagens reais (o servidor confere tipo e tamanho pelo conteúdo) ───────
const cache = new Map();
async function jpeg(largura = 800, altura = 1280) {
  const k = `j${largura}x${altura}`;
  if (!cache.has(k)) cache.set(k, await sharp({ create: { width: largura, height: altura, channels: 3, background: '#88aacc' } }).jpeg().toBuffer());
  return cache.get(k);
}
async function png(largura = 800, altura = 1280) {
  const k = `p${largura}x${altura}`;
  if (!cache.has(k)) cache.set(k, await sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
  return cache.get(k);
}

// ─── pessoas e conteúdo ────────────────────────────────────────────────────
let contador = 0;
async function criarAutor() {
  contador += 1;
  const email = `edicao-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash('Senha@123', 4);
  const user = await User.create({ email, passwordHash, nome: `Autor ${contador}`, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
  const canal = await Channel.create({ ownerId: user._id, name: `Canal Edicao ${contador} ${Date.now()}` });
  return { token: login.body.accessToken, canal };
}

const IDIOMAS = ['pt', 'en', 'es', 'zh'];
const antiga = (i, sufixo = '') => `lorflux/series/obra-antiga/ep-04/20261125-000000-aaaaaa/pagina-${String(i + 1).padStart(3, '0')}${sufixo}`;

/**
 * Episódio com `n` painéis 800x1280 já "no Bunny" (falso), cada um com balão
 * nos idiomas de `baloes`. Tudo sob lorflux/, como o envio da pasta grava.
 */
async function criarEpisodio({ canalId = null, n = 4, baloes = ['pt', 'en'], status = 'draft', submittedAt = null, comTamanho = true, extra = {} } = {}) {
  contador += 1;
  const series = await Series.create({ title: `Obra Edicao ${contador}`, content_type: 'hiqua', channelId: canalId, isPublished: status === 'published', genre: 'Drama', content_rating: 'teen' });
  const panels = [];
  for (let i = 0; i < n; i++) {
    const img = antiga(i, `-s${contador}.jpg`);
    noBunny.set(img, await jpeg());
    const translationLayers = [];
    for (const l of baloes) {
      const b = antiga(i, `-s${contador}-${l}.png`);
      noBunny.set(b, await png());
      translationLayers.push({ language: l, imageUrl: url(b) });
    }
    panels.push({ image_url: url(img), order: i, ...(comTamanho ? { largura: 800, altura: 1280 } : {}), translationLayers });
  }
  const episode = await Episode.create({ seriesId: series._id, episode_number: 4, title: 'EP4', status, submittedAt, panels, ...extra });
  return { series, episode };
}

const rota = (ep, resto = '') => `/api/edicao-paineis/${ep._id}${resto}`;
const com = (req, token) => req.set('Authorization', `Bearer ${token}`);
const ler = async (ep) => (await Episode.findById(ep._id).lean());
const idDe = (doc, i) => String(doc.panels[i]._id);
const balao = (painel, l) => (painel.translationLayers || []).find(c => c.language === l)?.imageUrl ?? null;
const caminho = (u) => u.replace(`https://${CDN}/`, '');

const trocarImagem = (ep, pid, token, buffer, nome = 'nova.jpg') =>
  com(request(app).put(rota(ep, `/paineis/${pid}/imagem`)), token).attach('arquivo', buffer, nome);
const trocarBalao = (ep, pid, l, token, buffer) =>
  com(request(app).put(rota(ep, `/paineis/${pid}/baloes/${l}`)), token).attach('arquivo', buffer, 'balao.png');
const removerBalao = (ep, pid, l, token) => com(request(app).delete(rota(ep, `/paineis/${pid}/baloes/${l}`)), token);
const apagar = (ep, ids, token) => com(request(app).post(rota(ep, '/apagar')), token).send({ paineis: ids });

// ═══════════════════════════════════════════════════════════════════════════
describe('cada ação com conta de autor, no próprio rascunho', () => {
  it('GET devolve os painéis com _id e diz que dá para editar', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const res = await com(request(app).get(rota(episode)), autor.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ modo: 'rascunho', podeEditar: true, alturaMaxima: 1280 });
    expect(res.body.panels).toHaveLength(4);
    res.body.panels.forEach(p => expect(p._id).toMatch(/^[0-9a-f]{24}$/));
  });

  it('apagar UM painel: sai só ele, a ordem dos outros fica, e os arquivos dele saem do Bunny', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const antes = await ler(episode);
    const res = await apagar(episode, [idDe(antes, 1)], autor.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ removidos: [idDe(antes, 1)], totalPaineis: 3, apagadosDoBunny: 3, naoApagados: [] });

    const depois = await ler(episode);
    expect(depois.panels.map(p => String(p._id))).toEqual([0, 2, 3].map(i => idDe(antes, i)));
    expect(depois.panels.map(p => p.image_url)).toEqual([0, 2, 3].map(i => antes.panels[i].image_url));
    // Os balões dos que ficaram continuam nos painéis deles.
    [0, 2, 3].forEach((i, j) => expect(balao(depois.panels[j], 'en')).toBe(balao(antes.panels[i], 'en')));
    // Do Bunny saiu a página e os 2 balões do painel apagado, e mais nada.
    expect(apagados.sort()).toEqual([antes.panels[1].image_url, balao(antes.panels[1], 'pt'), balao(antes.panels[1], 'en')].map(caminho).sort());
    expect(noBunny.size).toBe(9);
  });

  it('apagar VÁRIOS de uma vez (um único pedido)', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 6, baloes: ['en'] });
    const antes = await ler(episode);
    const res = await apagar(episode, [0, 2, 5].map(i => idDe(antes, i)), autor.token);
    expect(res.status).toBe(200);
    expect(res.body.removidos.sort()).toEqual([0, 2, 5].map(i => idDe(antes, i)).sort());
    const depois = await ler(episode);
    expect(depois.panels.map(p => String(p._id))).toEqual([1, 3, 4].map(i => idDe(antes, i)));
    expect(apagados).toHaveLength(6);
  });

  it('trocar a IMAGEM de um painel: mesma posição, balões no lugar, arquivo antigo apagado, nome novo na pasta do episódio', async () => {
    const autor = await criarAutor();
    const { episode, series } = await criarEpisodio({ canalId: autor.canal._id });
    const antes = await ler(episode);
    const res = await trocarImagem(episode, idDe(antes, 2), autor.token, await jpeg());
    expect(res.status).toBe(200);

    const depois = await ler(episode);
    expect(depois.panels.map(p => String(p._id))).toEqual(antes.panels.map(p => String(p._id)));
    const novo = depois.panels[2];
    expect(novo.image_url).not.toBe(antes.panels[2].image_url);
    expect(res.body.panel.image_url).toBe(novo.image_url);
    expect(caminho(novo.image_url)).toMatch(new RegExp(`^lorflux/series/obra-edicao-\\d+/ep-04/\\d{8}-\\d{6}-[0-9a-f]{6}/painel-[0-9a-f]{6}\\.jpg$`));
    expect(noBunny.has(caminho(novo.image_url))).toBe(true);
    expect(novo).toMatchObject({ order: 2, largura: 800, altura: 1280 });
    // Balões do painel trocado e os outros painéis: intactos.
    expect(novo.translationLayers.map(c => c.imageUrl)).toEqual(antes.panels[2].translationLayers.map(c => c.imageUrl));
    [0, 1, 3].forEach(i => expect(depois.panels[i]).toEqual(antes.panels[i]));
    expect(apagados).toEqual([caminho(antes.panels[2].image_url)]);
    expect(String(series._id)).toBeTruthy();
  });

  it('trocar o BALÃO de um idioma: só aquele idioma daquele painel muda; idioma que não existia é acrescentado', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const antes = await ler(episode);

    const troca = await trocarBalao(episode, idDe(antes, 1), 'en', autor.token, await png());
    expect(troca.status).toBe(200);
    let depois = await ler(episode);
    expect(balao(depois.panels[1], 'en')).not.toBe(balao(antes.panels[1], 'en'));
    expect(caminho(balao(depois.panels[1], 'en'))).toMatch(/\/balao-[0-9a-f]{6}-en\.png$/);
    expect(balao(depois.panels[1], 'pt')).toBe(balao(antes.panels[1], 'pt'));
    expect(depois.panels[1].translationLayers).toHaveLength(2);
    expect(depois.panels[1].image_url).toBe(antes.panels[1].image_url);
    [0, 2, 3].forEach(i => expect(depois.panels[i]).toEqual(antes.panels[i]));
    expect(apagados).toEqual([caminho(balao(antes.panels[1], 'en'))]);

    const novo = await trocarBalao(episode, idDe(antes, 3), 'zh', autor.token, await png());
    expect(novo.status).toBe(200);
    depois = await ler(episode);
    expect(depois.panels[3].translationLayers.map(c => c.language)).toEqual(['pt', 'en', 'zh']);
    expect(apagados).toHaveLength(1); // nada saiu ao acrescentar
  });

  it('REMOVER o balão de um idioma: os outros idiomas e painéis ficam; o arquivo sai do Bunny', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, baloes: IDIOMAS });
    const antes = await ler(episode);
    const res = await removerBalao(episode, idDe(antes, 0), 'es', autor.token);
    expect(res.status).toBe(200);
    expect(res.body.removido).toBe(true);
    const depois = await ler(episode);
    expect(depois.panels[0].translationLayers.map(c => c.language)).toEqual(['pt', 'en', 'zh']);
    [1, 2, 3].forEach(i => expect(depois.panels[i]).toEqual(antes.panels[i]));
    expect(apagados).toEqual([caminho(balao(antes.panels[0], 'es'))]);

    // Remover de novo não é erro e não apaga mais nada.
    const denovo = await removerBalao(episode, idDe(antes, 0), 'es', autor.token);
    expect(denovo.status).toBe(200);
    expect(denovo.body.removido).toBe(false);
    expect(apagados).toHaveLength(1);
  });

  it('capa automática (a imagem do 1o painel) acompanha a imagem trocada e não é apagada enquanto for capa', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const antes = await ler(episode);
    await Episode.updateOne({ _id: episode._id }, { $set: { thumbnail: antes.panels[0].image_url } });

    // Apagar o painel cuja imagem é a capa: o painel sai, o arquivo fica (é a capa).
    const { episode: outro } = await criarEpisodio({ canalId: autor.canal._id });
    const o = await ler(outro);
    await Episode.updateOne({ _id: outro._id }, { $set: { thumbnail: o.panels[1].image_url } });
    const r1 = await apagar(outro, [idDe(o, 1)], autor.token);
    expect(r1.status).toBe(200);
    expect(apagados).not.toContain(caminho(o.panels[1].image_url));
    expect((await ler(outro)).thumbnail).toBe(o.panels[1].image_url);

    apagados.length = 0;
    const r2 = await trocarImagem(episode, idDe(antes, 0), autor.token, await jpeg());
    expect(r2.status).toBe(200);
    const depois = await ler(episode);
    expect(depois.thumbnail).toBe(depois.panels[0].image_url);
    expect(apagados).toEqual([caminho(antes.panels[0].image_url)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('quem pode: dono e rascunho', () => {
  it('OUTRO AUTOR recebe 404 em todas as rotas, e nada muda', async () => {
    const dono = await criarAutor();
    const outro = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: dono.canal._id });
    const antes = await ler(episode);
    const pid = idDe(antes, 0);

    const respostas = {
      listar: await com(request(app).get(rota(episode)), outro.token),
      apagar: await apagar(episode, [pid], outro.token),
      imagem: await trocarImagem(episode, pid, outro.token, await jpeg()),
      balao: await trocarBalao(episode, pid, 'en', outro.token, await png()),
      remover: await removerBalao(episode, pid, 'en', outro.token),
    };
    for (const [acao, res] of Object.entries(respostas)) {
      expect(res.status, acao).toBe(404);
      expect(JSON.stringify(res.body), acao).not.toContain(CDN);
    }
    expect(await ler(episode)).toEqual(antes);
    expect(apagados).toEqual([]);
    expect(noBunny.size).toBe(12); // nada subiu
  });

  it('leitor comum (sem canal) 404; sem login 401', async () => {
    const dono = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: dono.canal._id });
    const antes = await ler(episode);
    const pid = idDe(antes, 0);
    expect((await apagar(episode, [pid], auth.getToken('user'))).status).toBe(404);
    expect((await com(request(app).get(rota(episode)), auth.getToken('user'))).status).toBe(404);
    expect((await request(app).get(rota(episode))).status).toBe(401);
    expect((await request(app).post(rota(episode, '/apagar')).send({ paineis: [pid] })).status).toBe(401);
    expect((await request(app).delete(rota(episode, `/paineis/${pid}/baloes/en`))).status).toBe(401);
    expect(await ler(episode)).toEqual(antes);
  });

  it('episódio ENVIADO para aprovação: o autor vê (GET diz que não dá para editar) e toda ação dá 403', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, submittedAt: new Date() });
    const antes = await ler(episode);
    const pid = idDe(antes, 0);

    const ver = await com(request(app).get(rota(episode)), autor.token);
    expect(ver.status).toBe(200);
    expect(ver.body.podeEditar).toBe(false);
    expect(ver.body.motivo).toMatch(/em análise/);

    expect((await apagar(episode, [pid], autor.token)).status).toBe(403);
    expect((await trocarImagem(episode, pid, autor.token, await jpeg())).status).toBe(403);
    expect((await trocarBalao(episode, pid, 'en', autor.token, await png())).status).toBe(403);
    expect((await removerBalao(episode, pid, 'en', autor.token)).status).toBe(403);
    expect(await ler(episode)).toEqual(antes);
    expect(noBunny.size).toBe(12);
  });

  it('admin edita qualquer episódio, inclusive publicado e sem canal (Gerenciar Conteúdo)', async () => {
    const { episode } = await criarEpisodio({ status: 'published' });
    const antes = await ler(episode);
    const admin = auth.getToken('admin');
    expect((await com(request(app).get(rota(episode)), admin)).body).toMatchObject({ modo: 'admin', podeEditar: true });
    expect((await trocarImagem(episode, idDe(antes, 0), admin, await jpeg())).status).toBe(200);
    expect((await trocarBalao(episode, idDe(antes, 1), 'es', admin, await png())).status).toBe(200);
    expect((await removerBalao(episode, idDe(antes, 2), 'pt', admin)).status).toBe(200);
    expect((await apagar(episode, [idDe(antes, 3)], admin)).status).toBe(200);
    const depois = await ler(episode);
    expect(depois.panels).toHaveLength(3);
    expect(depois.status).toBe('published');
    expect(depois.panels[0].image_url).not.toBe(antes.panels[0].image_url);
    expect(depois.panels[1].translationLayers.map(c => c.language)).toEqual(['pt', 'en', 'es']);
    expect(depois.panels[2].translationLayers.map(c => c.language)).toEqual(['en']);
  });

  it('"Enviar para aprovação" feito NO MEIO de uma troca: a troca não entra (409), o arquivo que subiu é retirado', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id });
    const antes = await ler(episode);
    // O envio ao Bunny acontece depois da conferência de acesso e antes da
    // gravação: é a janela em que o episódio pode ser enviado para aprovação.
    aoSubir = async () => { await Episode.updateOne({ _id: episode._id }, { $set: { submittedAt: new Date() } }); };
    const res = await trocarImagem(episode, idDe(antes, 0), autor.token, await jpeg());
    expect(res.status).toBe(409);
    const depois = await ler(episode);
    expect(depois.panels).toEqual(antes.panels);
    expect(noBunny.size).toBe(12); // o que subiu saiu
    expect(apagados).toHaveLength(1);
    expect(apagados[0]).toMatch(/\/painel-[0-9a-f]{6}\.jpg$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ações em paralelo não perdem nada (modelo: balaoLoteParalelo.test.js)', () => {
  const N = 10;

  /**
   * Segura os envios ao Bunny até `n` terem chegado e solta todos juntos:
   * assim os `n` pedidos chegam à gravação no banco NO MESMO instante, que é
   * onde salvar a lista inteira de painéis perdia dados. Sem a barreira os
   * pedidos HTTP com arquivo chegam escalonados e o teste passaria mesmo com
   * o defeito (medido em 27/11/2026 numa cópia com o defeito de volta).
   */
  function juntarEnvios(n) {
    let chegaram = 0;
    let soltar;
    const todos = new Promise((resolve) => { soltar = resolve; });
    aoSubir = async () => {
      chegaram += 1;
      if (chegaram >= n) soltar();
      await todos;
    };
  }

  it('10 balões trocados ao mesmo tempo, um por painel: todas 200 e cada um no painel dele', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: N, baloes: ['pt'] });
    const antes = await ler(episode);
    const buf = await png();
    juntarEnvios(N);
    const ok = await Promise.all(antes.panels.map(p => trocarBalao(episode, String(p._id), 'en', autor.token, buf)));
    expect(ok.map(r => r.status)).toEqual(Array(N).fill(200));
    const depois = await ler(episode);
    depois.panels.forEach((p, i) => {
      expect(String(p._id)).toBe(idDe(antes, i));
      expect(p.translationLayers.map(c => c.language)).toEqual(['pt', 'en']);
      // O arquivo de cada balão leva o fim do _id do painel no nome.
      expect(caminho(balao(p, 'en'))).toContain(`balao-${idDe(antes, i).slice(-6)}-en.png`);
      expect(ok[i].body.panel.translationLayers).toHaveLength(2);
      expect(balao(p, 'pt')).toBe(balao(antes.panels[i], 'pt'));
    });
  });

  it('imagem, balão, remoção de balão e apagar painel misturados no mesmo episódio, de uma vez', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: N, baloes: ['pt', 'en'] });
    const antes = await ler(episode);
    const id = (i) => idDe(antes, i);
    const [j, p] = [await jpeg(), await png()];

    juntarEnvios(6);
    const rs = await Promise.all([
      trocarImagem(episode, id(0), autor.token, j),
      trocarImagem(episode, id(1), autor.token, j),
      trocarImagem(episode, id(2), autor.token, j),
      trocarBalao(episode, id(3), 'es', autor.token, p),
      trocarBalao(episode, id(4), 'es', autor.token, p),
      trocarBalao(episode, id(5), 'en', autor.token, p),
      removerBalao(episode, id(6), 'en', autor.token),
      removerBalao(episode, id(7), 'pt', autor.token),
      apagar(episode, [id(8)], autor.token),
      apagar(episode, [id(9)], autor.token),
    ]);
    expect(rs.map(r => r.status)).toEqual(Array(10).fill(200));

    const depois = await ler(episode);
    // Saíram só o 9o e o 10o; os outros 8, na ordem.
    expect(depois.panels.map(x => String(x._id))).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(id));
    [0, 1, 2].forEach(i => {
      expect(depois.panels[i].image_url).not.toBe(antes.panels[i].image_url);
      expect(depois.panels[i].translationLayers).toEqual(antes.panels[i].translationLayers);
    });
    [3, 4].forEach(i => {
      expect(depois.panels[i].translationLayers.map(c => c.language)).toEqual(['pt', 'en', 'es']);
      expect(depois.panels[i].image_url).toBe(antes.panels[i].image_url);
    });
    expect(balao(depois.panels[5], 'en')).not.toBe(balao(antes.panels[5], 'en'));
    expect(balao(depois.panels[5], 'pt')).toBe(balao(antes.panels[5], 'pt'));
    expect(depois.panels[6].translationLayers.map(c => c.language)).toEqual(['pt']);
    expect(depois.panels[7].translationLayers.map(c => c.language)).toEqual(['en']);

    // Bunny: tudo o que os painéis usam existe; tudo o que saiu foi apagado.
    const emUso = depois.panels.flatMap(x => [x.image_url, ...x.translationLayers.map(c => c.imageUrl)]).map(caminho);
    emUso.forEach(c => expect(noBunny.has(c), c).toBe(true));
    expect(noBunny.size).toBe(emUso.length);
  });

  it('tudo no MESMO painel ao mesmo tempo: imagem, dois balões novos e uma remoção entram todos', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 3, baloes: ['pt'] });
    const antes = await ler(episode);
    const pid = idDe(antes, 1);
    juntarEnvios(3);
    const rs = await Promise.all([
      trocarImagem(episode, pid, autor.token, await jpeg()),
      trocarBalao(episode, pid, 'en', autor.token, await png()),
      trocarBalao(episode, pid, 'es', autor.token, await png()),
      removerBalao(episode, pid, 'pt', autor.token),
    ]);
    expect(rs.map(r => r.status)).toEqual([200, 200, 200, 200]);
    const depois = await ler(episode);
    expect(depois.panels[1].image_url).not.toBe(antes.panels[1].image_url);
    expect(depois.panels[1].translationLayers.map(c => c.language).sort()).toEqual(['en', 'es']);
    expect(depois.panels[0]).toEqual(antes.panels[0]);
    expect(depois.panels[2]).toEqual(antes.panels[2]);
  });

  it('o mesmo idioma no mesmo painel, 5 vezes de uma vez: um balão só, e só o arquivo dele fica no Bunny', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 2, baloes: [] });
    const antes = await ler(episode);
    const pid = idDe(antes, 0);
    const buf = await png();
    juntarEnvios(5);
    const rs = await Promise.all(Array.from({ length: 5 }, () => trocarBalao(episode, pid, 'zh', autor.token, buf)));
    expect(rs.map(r => r.status)).toEqual(Array(5).fill(200));
    const depois = await ler(episode);
    expect(depois.panels[0].translationLayers).toHaveLength(1);
    expect(depois.panels[0].translationLayers[0].language).toBe('zh');
    const baloesNoBunny = [...noBunny.keys()].filter(c => c.includes('balao-'));
    expect(baloesNoBunny).toEqual([caminho(balao(depois.panels[0], 'zh'))]);
  });

  it('pelo serviço, sem HTTP no meio: 10 balões, 10 imagens e 10 remoções ao mesmo tempo, nada se perde', async () => {
    const svc = require('../../services/edicaoPaineisService');
    const { episode } = await criarEpisodio({ n: N, baloes: ['pt'] });
    const antes = await ler(episode);
    const admin = { id: auth.getId('admin'), role: 'admin' };
    const [j, p] = [await jpeg(), await png()];
    const r = await Promise.allSettled(antes.panels.flatMap(x => [
      svc.trocarBalao({ user: admin, episodeId: String(episode._id), painelId: String(x._id), idioma: 'en', buffer: p }),
      svc.trocarImagem({ user: admin, episodeId: String(episode._id), painelId: String(x._id), buffer: j }),
      svc.removerBalao({ user: admin, episodeId: String(episode._id), painelId: String(x._id), idioma: 'pt' }),
    ]));
    const falhas = r.filter(x => x.status === 'rejected').map(x => x.reason && (x.reason.name + ': ' + x.reason.message));
    expect(falhas, `pedidos que falharam: ${falhas.join(' | ')}`).toEqual([]);
    const depois = await ler(episode);
    depois.panels.forEach((x, i) => {
      expect(String(x._id)).toBe(idDe(antes, i));
      expect(x.image_url, `imagem do painel ${i + 1}`).not.toBe(antes.panels[i].image_url);
      expect(x.translationLayers.map(c => c.language), `balões do painel ${i + 1}`).toEqual(['en']);
    });
  });

  it('apagar um painel enquanto o balão de OUTRO é trocado: o balão não vai para o painel vizinho', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 5, baloes: [] });
    const antes = await ler(episode);
    const rs = await Promise.all([
      apagar(episode, [idDe(antes, 0), idDe(antes, 1)], autor.token),
      trocarBalao(episode, idDe(antes, 3), 'en', autor.token, await png()),
    ]);
    expect(rs.map(r => r.status)).toEqual([200, 200]);
    const depois = await ler(episode);
    expect(depois.panels.map(p => String(p._id))).toEqual([2, 3, 4].map(i => idDe(antes, i)));
    expect(depois.panels.map(p => p.translationLayers.length)).toEqual([0, 1, 0]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o que sai do Bunny, e o que não sai', () => {
  it('link externo colado à mão nunca é apagado; arquivo usado por outro episódio também não', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 3, baloes: [] });
    const antes = await ler(episode);
    const externa = 'https://outro-site.exemplo/imagem.jpg';
    await Episode.updateOne({ _id: episode._id }, { $set: { 'panels.0.image_url': externa } });
    // O painel 1 usa um arquivo que outro episódio também usa.
    const compartilhada = antes.panels[1].image_url;
    await Episode.create({ seriesId: new mongoose.Types.ObjectId(), episode_number: 9, title: 'Outro', panels: [{ image_url: compartilhada, order: 0 }] });

    const res = await apagar(episode, [idDe(antes, 0), idDe(antes, 1), idDe(antes, 2)], autor.token);
    expect(res.status).toBe(200);
    expect(res.body.apagadosDoBunny).toBe(1);
    expect(apagados).toEqual([caminho(antes.panels[2].image_url)]);
    expect(noBunny.has(caminho(compartilhada))).toBe(true);
    expect((await ler(episode)).panels).toEqual([]);
  });

  it('falha ao apagar do Bunny não desfaz a edição: o painel muda e o arquivo é devolvido em naoApagados', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 2, baloes: ['en'] });
    const antes = await ler(episode);
    bunny.__setDeleterForTests(async () => { throw new Error('Bunny fora do ar'); });
    const res = await removerBalao(episode, idDe(antes, 0), 'en', autor.token);
    expect(res.status).toBe(200);
    expect(res.body.naoApagados).toEqual([caminho(balao(antes.panels[0], 'en'))]);
    expect((await ler(episode)).panels[0].translationLayers).toEqual([]);
  });

  it('o Bunny recusa o envio: 502 e o painel fica como estava', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 2 });
    const antes = await ler(episode);
    aoSubir = async () => { throw new Error('Bunny caiu'); };
    expect((await trocarImagem(episode, idDe(antes, 0), autor.token, await jpeg())).status).toBe(502);
    expect((await trocarBalao(episode, idDe(antes, 0), 'en', autor.token, await png())).status).toBe(502);
    expect(await ler(episode)).toEqual(antes);
    expect(apagados).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o servidor confere o arquivo e o pedido', () => {
  it('balão que não é PNG, balão de outro tamanho, imagem de outro tamanho com balão, imagem alta demais: 400 e nada muda', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 2, baloes: ['en'] });
    const antes = await ler(episode);
    const pid = idDe(antes, 0);

    const naoPng = await trocarBalao(episode, pid, 'es', autor.token, await jpeg());
    expect(naoPng.status).toBe(400);
    expect(naoPng.body.error).toMatch(/PNG/);

    const outroTamanho = await trocarBalao(episode, pid, 'es', autor.token, await png(800, 900));
    expect(outroTamanho.status).toBe(400);
    expect(outroTamanho.body.error).toMatch(/800x900.*800x1280/);

    const imagemMenor = await trocarImagem(episode, pid, autor.token, await jpeg(800, 900));
    expect(imagemMenor.status).toBe(400);
    expect(imagemMenor.body.error).toMatch(/balões de 800x1280/);

    const texto = await trocarImagem(episode, pid, autor.token, Buffer.from('isto não é uma imagem, é só texto'), 'falsa.jpg');
    expect(texto.status).toBe(400);

    expect(await ler(episode)).toEqual(antes);
    expect(noBunny.size).toBe(4);
  });

  it('painel SEM balão: o autor pode trocar por imagem de outro tamanho até 1280 de altura; acima disso só o admin', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 2, baloes: [] });
    const antes = await ler(episode);
    const menor = await trocarImagem(episode, idDe(antes, 0), autor.token, await jpeg(800, 900));
    expect(menor.status).toBe(200);
    expect(menor.body.panel).toMatchObject({ largura: 800, altura: 900 });

    const alta = await trocarImagem(episode, idDe(antes, 1), autor.token, await jpeg(800, 1281));
    expect(alta.status).toBe(400);
    expect(alta.body.error).toMatch(/1281.*1280/);
    const altaAdmin = await trocarImagem(episode, idDe(antes, 1), auth.getToken('admin'), await jpeg(800, 1281));
    expect(altaAdmin.status).toBe(200);
  });

  it('idioma fora dos 4, painel que não existe, id torto, lista vazia: erro claro e nada muda', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 2 });
    const antes = await ler(episode);
    const pid = idDe(antes, 0);
    const fantasma = String(new mongoose.Types.ObjectId());

    expect((await trocarBalao(episode, pid, 'fr', autor.token, await png())).status).toBe(400);
    expect((await removerBalao(episode, pid, 'fr', autor.token)).status).toBe(400);
    expect((await trocarBalao(episode, fantasma, 'en', autor.token, await png())).status).toBe(404);
    expect((await trocarImagem(episode, fantasma, autor.token, await jpeg())).status).toBe(404);
    expect((await removerBalao(episode, fantasma, 'en', autor.token)).status).toBe(404);
    expect((await apagar(episode, [fantasma], autor.token)).status).toBe(404);
    expect((await apagar(episode, ['torto'], autor.token)).status).toBe(404);
    expect((await apagar(episode, [], autor.token)).status).toBe(400);
    // Pedido sem arquivo.
    expect((await com(request(app).put(rota(episode, `/paineis/${pid}/imagem`)), autor.token)).status).toBe(400);
    expect((await com(request(app).get('/api/edicao-paineis/nao-e-id'), autor.token)).status).toBe(404);
    expect(await ler(episode)).toEqual(antes);
    expect(noBunny.size).toBe(6);
  });

  it('painel antigo SEM _id (gravado fora do Mongoose) ganha _id ao abrir a grade e passa a ser editável', async () => {
    const autor = await criarAutor();
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, n: 0 });
    await Episode.collection.updateOne({ _id: episode._id }, { $set: { panels: [
      { image_url: 'https://outro-site.exemplo/a.jpg', order: 1 },
      { image_url: 'https://outro-site.exemplo/b.jpg', order: 2, translationLayers: null },
      { image_url: 'https://outro-site.exemplo/c.jpg', order: 3 },
    ] } });
    const cru = await Episode.collection.findOne({ _id: episode._id });
    expect(cru.panels.every(p => !p._id)).toBe(true);

    const lista = await com(request(app).get(rota(episode)), autor.token);
    expect(lista.status).toBe(200);
    const ids = lista.body.panels.map(p => p._id);
    ids.forEach(i => expect(i).toMatch(/^[0-9a-f]{24}$/));
    expect(new Set(ids).size).toBe(3);

    // Painel antigo sem a lista de balões (nula): o balão entra mesmo assim.
    expect((await trocarBalao(episode, ids[1], 'en', autor.token, await png())).status).toBe(200);
    expect((await apagar(episode, [ids[0]], autor.token)).status).toBe(200);
    const depois = await ler(episode);
    expect(depois.panels.map(p => p.image_url)).toEqual(['https://outro-site.exemplo/b.jpg', 'https://outro-site.exemplo/c.jpg']);
    expect(depois.panels[0].translationLayers.map(c => c.language)).toEqual(['en']);
    expect(apagados).toEqual([]); // links externos: nada a apagar
  });
});

// Ponta solta do item 6 (27/11/2026): a troca de um arquivo conferia só o
// teto de 8 MB por arquivo; agora confere também o limite de MB do EPISÓDIO,
// pela mesma regra do envio da pasta (o que chega de fato pode ir a 3x o
// limite, por causa do PNG regravado no corte; acima disso, 413).
describe('troca de um arquivo confere o limite de MB do episódio QUANDO LIGADO no admin (mesma regra do envio)', () => {
  const MB = 1024 * 1024;
  const crypto = require('crypto');
  let Setting;
  // Ruído não comprime: JPEG 800x1280 a 100 passa de 1 MB; PNG RGBA fica perto de 4 MB.
  const jpegGrande = () => sharp(crypto.randomBytes(800 * 1280 * 3), { raw: { width: 800, height: 1280, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  const pngGrande = () => sharp(crypto.randomBytes(800 * 1280 * 4), { raw: { width: 800, height: 1280, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
  const limite = async (mb) => {
    await Setting.deleteMany({ key: 'limite_mb_episodio' });
    if (mb) await Setting.create({ key: 'limite_mb_episodio', value: String(mb) });
  };
  /** Episódio de 4 painéis que já ocupa 2,8 MB (700 KB por painel, sem balão). */
  const quaseCheio = async (autor) => {
    const { episode } = await criarEpisodio({ canalId: autor.canal._id, baloes: [] });
    await Episode.updateOne({ _id: episode._id }, { $set: Object.fromEntries([0, 1, 2, 3].map(i => [`panels.${i}.bytes`, 700 * 1024])) });
    return episode;
  };

  beforeAll(() => { Setting = require('../../models/Setting'); });
  afterEach(() => limite(null));

  it('imagem que faz o episódio passar do teto é recusada (413), nada sobe e o painel fica como estava', async () => {
    await limite(1); // teto de fato = 3 MB
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    const antes = await ler(episode);
    const grande = await jpegGrande();
    expect(grande.length).toBeGreaterThan(1 * MB);
    expect(grande.length).toBeLessThan(8 * MB); // passa no teto por arquivo: só o do episódio barra

    const res = await trocarImagem(episode, idDe(antes, 0), autor.token, grande);
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/limite de 1 MB por episódio/);
    expect(noBunny.size).toBe(4);
    expect(apagados).toEqual([]);
    expect((await ler(episode)).panels[0].image_url).toBe(antes.panels[0].image_url);
  });

  it('o admin obedece ao mesmo limite (como no envio da pasta)', async () => {
    await limite(1);
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    const antes = await ler(episode);
    const res = await trocarImagem(episode, idDe(antes, 0), auth.getToken('admin'), await jpegGrande());
    expect(res.status).toBe(413);
  });

  it('subindo o limite no admin (Setting) a mesma troca passa, e o tamanho novo fica gravado no painel', async () => {
    await limite(2); // teto de fato = 6 MB
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    const antes = await ler(episode);
    const grande = await jpegGrande();
    const res = await trocarImagem(episode, idDe(antes, 0), autor.token, grande);
    expect(res.status).toBe(200);
    const depois = await ler(episode);
    expect(depois.panels[0].bytes).toBe(grande.length);
    expect(depois.panels[1].bytes).toBe(700 * 1024);
  });

  it('troca que não aumenta o episódio sempre passa, mesmo com o episódio já acima do teto', async () => {
    await limite(1);
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    await Episode.updateOne({ _id: episode._id }, { $set: { 'panels.1.bytes': 5 * MB } }); // limite baixado depois
    const antes = await ler(episode);
    const pequena = await jpeg();
    expect(pequena.length).toBeLessThan(700 * 1024);
    const res = await trocarImagem(episode, idDe(antes, 0), autor.token, pequena);
    expect(res.status).toBe(200);
    expect((await ler(episode)).panels[0].bytes).toBe(pequena.length);
  });

  it('balão novo que estoura o teto é recusado (413); o tamanho do balão aceito fica gravado', async () => {
    await limite(1);
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    const antes = await ler(episode);
    const balaoGrande = await pngGrande();
    expect(balaoGrande.length).toBeGreaterThan(1 * MB);
    expect(balaoGrande.length).toBeLessThan(8 * MB);

    const recusado = await trocarBalao(episode, idDe(antes, 2), 'en', autor.token, balaoGrande);
    expect(recusado.status).toBe(413);
    expect(noBunny.size).toBe(4);
    expect((await ler(episode)).panels[2].translationLayers).toEqual([]);

    const pequeno = await png();
    const aceito = await trocarBalao(episode, idDe(antes, 2), 'en', autor.token, pequeno);
    expect(aceito.status).toBe(200);
    const camada = (await ler(episode)).panels[2].translationLayers[0];
    expect(camada).toMatchObject({ language: 'en', bytes: pequeno.length });
    // Trocar o mesmo balão por outro: conta o novo no lugar do antigo.
    expect((await trocarBalao(episode, idDe(antes, 2), 'en', autor.token, pequeno)).status).toBe(200);
    expect((await ler(episode)).panels[2].translationLayers).toHaveLength(1);
  });

  // Regressão (26/11/2026, pedido do Vin): "mantenha a liberação para não
  // barrar o autor pela quantidade de megabytes". Sem Setting não há limite
  // de MB do episódio: o padrão antigo (20 MB, teto de 60) devolvia 413 aqui.
  it('sem Setting NÃO há limite de MB: episódio de 59,5 MB aceita imagem e balão novos (antes, 413 pelo teto de 60)', async () => {
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    await Episode.updateOne({ _id: episode._id }, { $set: { 'panels.1.bytes': 59.5 * MB - 3 * 700 * 1024 } });
    const antes = await ler(episode);
    const grande = await jpegGrande();
    expect(grande.length).toBeGreaterThan(1 * MB);
    const res = await trocarImagem(episode, idDe(antes, 0), autor.token, grande);
    expect(res.status).toBe(200);
    expect((await ler(episode)).panels[0].bytes).toBe(grande.length);
    expect((await trocarBalao(episode, idDe(antes, 2), 'en', autor.token, await pngGrande())).status).toBe(200);
  });

  it('Setting vazio ou 0 também é sem limite', async () => {
    for (const valor of ['', '0']) {
      await Setting.deleteMany({ key: 'limite_mb_episodio' });
      await Setting.create({ key: 'limite_mb_episodio', value: valor });
      const autor = await criarAutor();
      const episode = await quaseCheio(autor);
      await Episode.updateOne({ _id: episode._id }, { $set: { 'panels.1.bytes': 200 * MB } });
      const antes = await ler(episode);
      expect((await trocarImagem(episode, idDe(antes, 0), autor.token, await jpegGrande())).status).toBe(200);
    }
  });

  it('com o Setting em 30 o limite volta a valer (teto de 90 MB): o mesmo episódio em 89,5 MB recusa a imagem (413)', async () => {
    await limite(30);
    const autor = await criarAutor();
    const episode = await quaseCheio(autor);
    await Episode.updateOne({ _id: episode._id }, { $set: { 'panels.1.bytes': 89.5 * MB - 3 * 700 * 1024 } });
    const antes = await ler(episode);
    const res = await trocarImagem(episode, idDe(antes, 0), autor.token, await jpegGrande());
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/limite de 30 MB por episódio/);
    expect((await ler(episode)).panels[0].image_url).toBe(antes.panels[0].image_url);
  });
});

describe('o que já existia continua igual', () => {
  it('rota pública do episódio publicado devolve os painéis como antes (largura e altura são campos a mais, opcionais)', async () => {
    const { episode } = await criarEpisodio({ status: 'published', comTamanho: false, n: 2 });
    const res = await request(app).get(`/api/content/episodes/${episode._id}`);
    expect(res.status).toBe(200);
    expect(res.body.panels).toHaveLength(2);
    expect(res.body.panels[0]).not.toHaveProperty('largura');
    expect(res.body.panels[0].translationLayers.map(c => c.language)).toEqual(['pt', 'en']);
  });
});
