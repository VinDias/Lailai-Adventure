/**
 * Teste de regressao: baloes (camadas de idioma) enviados em LOTE se perdiam.
 *
 * DEFEITO (linguagem de negocio): o Master (Gerenciar Conteudo) e o autor
 * (Meu Estudio) escolhem um idioma, selecionam as imagens dos baloes de varios
 * paineis e mandam o lote. Os dois clientes gravam os baloes EM PARALELO, um
 * pedido por painel. O servico lia o episodio inteiro, mexia num painel e
 * salvava a lista INTEIRA de paineis com a versao do documento (__v): o
 * primeiro pedido gravava e os outros davam VersionError. A rota respondia 500
 * e o balao daquele painel simplesmente nao existia no capitulo. No admin o
 * erro nem aparecia (o arquivo ja estava marcado "concluido").
 *
 * Medido em 23/11/2026 (sonda em docs/recorte-frenteA-sonda/ do projeto, banco
 * de teste da suite): servico 3 de 10 gravados (7 VersionError); rota HTTP do
 * admin 1 de 10 (9 respostas 500), tres rodadas iguais.
 * Conserto: services/episodePanelService.js grava a camada com update atomico
 * no proprio painel (sem salvar a lista inteira), commit fix(paineis) da branch
 * fix/balao-lote-paralelo.
 *
 * O QUE ESTE ARQUIVO GARANTE:
 * - 10 baloes em paralelo no mesmo episodio: os 10 gravados, cada um no painel
 *   do seu indice, pelo servico e pelas DUAS rotas (admin e portal), todas 200;
 * - trocar e acrescentar idioma no MESMO painel ao mesmo tempo nao perde nada;
 * - o mesmo idioma no mesmo painel em paralelo nao duplica a camada;
 * - remover uma camada enquanto outra e gravada no mesmo painel preserva as duas
 *   operacoes;
 * - quem ainda salva a lista inteira de paineis com uma leitura antiga (o
 *   DELETE de painel faz isso) recebe conflito em vez de apagar o balao novo.
 *
 * O QUE NAO GARANTE: nada dos clientes (ver tests/frontend/balaoLoteErro*.test.tsx)
 * nem o deslocamento de indice quando um PAINEL e apagado no meio de um lote
 * (outro defeito, nao medido).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Episode, Channel, User, svc;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Episode = require('../../models/Episode');
  Channel = require('../../models/Channel');
  User = require('../../models/User');
  svc = require('../../services/episodePanelService');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

const N = 10;

async function episodioCom(nPaineis, extra = {}) {
  return Episode.create({
    seriesId: new mongoose.Types.ObjectId(),
    episode_number: 1,
    title: 'Cap do lote',
    panels: Array.from({ length: nPaineis }, (_, i) => ({ image_url: `https://cdn/base${i + 1}.jpg`, order: i + 1 })),
    ...extra,
  });
}

// Mapa painel -> url da camada no idioma, para a mensagem de falha mostrar
// exatamente quais baloes sumiram.
async function camadas(episodeId, lang) {
  const doc = await Episode.findById(episodeId).lean();
  return doc.panels.map(p => {
    const l = (p.translationLayers || []).filter(c => c.language === lang);
    return l.length === 0 ? null : l.length === 1 ? l[0].imageUrl : l.map(c => c.imageUrl);
  });
}

const esperado = lang => Array.from({ length: N }, (_, i) => `https://cdn/${lang}${i + 1}.png`);

describe('balao em lote: gravacoes em paralelo no mesmo episodio', () => {
  it('servico: 10 baloes em paralelo, os 10 gravados no painel certo', async () => {
    const ep = await episodioCom(N);
    const r = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => svc.setTranslationLayer(ep._id, i, 'en', `https://cdn/en${i + 1}.png`))
    );
    const falhas = r.filter(x => x.status === 'rejected').map(x => x.reason && x.reason.name);
    expect(falhas, `pedidos que falharam: ${falhas.join(', ')}`).toEqual([]);
    expect(await camadas(ep._id, 'en')).toEqual(esperado('en'));
    // Mesmo formato de antes: cada camada e subdocumento com _id proprio.
    const doc = await Episode.findById(ep._id).lean();
    doc.panels.forEach(p => expect(p.translationLayers[0]._id).toBeDefined());
  });

  it('rota do admin (PUT /api/content/.../translations): 10 em paralelo, todas 200 e 10 gravados', async () => {
    const ep = await episodioCom(N);
    const tok = auth.getToken('admin');
    const rs = await Promise.all(Array.from({ length: N }, (_, i) =>
      request(app)
        .put(`/api/content/episodes/${ep._id}/panels/${i}/translations`)
        .set('Authorization', `Bearer ${tok}`)
        .send({ language: 'es', imageUrl: `https://cdn/es${i + 1}.png` })
    ));
    expect(rs.map(r => r.status)).toEqual(Array(N).fill(200));
    rs.forEach((r, i) => {
      expect(r.body.panel.translationLayers).toEqual([
        expect.objectContaining({ language: 'es', imageUrl: `https://cdn/es${i + 1}.png` }),
      ]);
    });
    expect(await camadas(ep._id, 'es')).toEqual(esperado('es'));
  });

  it('rota do Meu Estudio (PUT /api/portal/.../traducoes): 10 em paralelo, todas 200 e 10 gravados', async () => {
    const email = `balao-lote-${Date.now()}@lorflux.test`;
    const user = await User.create({ email, passwordHash: await bcrypt.hash('Senha@123', 10), nome: 'Autor Lote', role: 'user' });
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
    const token = login.body.accessToken;
    await Channel.create({ ownerId: user._id, name: `Canal Lote ${Date.now()}` });

    const serie = await request(app).post('/api/portal/series')
      .set('Authorization', `Bearer ${token}`).send({ title: 'Serie do Lote' });
    expect(serie.status).toBe(201);
    const cap = await request(app).post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${token}`).send({ title: 'Cap Lote', episode_number: 1 });
    expect(cap.status).toBe(201);
    const pn = await request(app).post(`/api/portal/episodios/${cap.body._id}/paineis`)
      .set('Authorization', `Bearer ${token}`)
      .send({ panels: Array.from({ length: N }, (_, i) => ({ image_url: `https://cdn/base${i + 1}.jpg`, order: i + 1 })) });
    expect(pn.status).toBeLessThan(300);

    const rs = await Promise.all(Array.from({ length: N }, (_, i) =>
      request(app)
        .put(`/api/portal/episodios/${cap.body._id}/paineis/${i}/traducoes`)
        .set('Authorization', `Bearer ${token}`)
        .send({ language: 'zh', imageUrl: `https://cdn/zh${i + 1}.png` })
    ));
    expect(rs.map(r => r.status)).toEqual(Array(N).fill(200));
    expect(await camadas(cap.body._id, 'zh')).toEqual(esperado('zh'));
  });

  it('trocar EN e acrescentar ES no mesmo painel ao mesmo tempo: as duas ficam', async () => {
    const ep = await episodioCom(2);
    await svc.setTranslationLayer(ep._id, 0, 'en', 'https://cdn/en-v1.png');
    await Promise.all([
      svc.setTranslationLayer(ep._id, 0, 'en', 'https://cdn/en-v2.png'),
      svc.setTranslationLayer(ep._id, 0, 'es', 'https://cdn/es-v1.png'),
      svc.setTranslationLayer(ep._id, 0, 'pt', 'https://cdn/pt-v1.png'),
    ]);
    const doc = await Episode.findById(ep._id).lean();
    const porIdioma = Object.fromEntries(doc.panels[0].translationLayers.map(l => [l.language, l.imageUrl]));
    expect(doc.panels[0].translationLayers).toHaveLength(3);
    expect(porIdioma).toEqual({ en: 'https://cdn/en-v2.png', es: 'https://cdn/es-v1.png', pt: 'https://cdn/pt-v1.png' });
    expect(doc.panels[1].translationLayers).toEqual([]);
  });

  it('o mesmo idioma no mesmo painel em paralelo nao duplica a camada', async () => {
    const ep = await episodioCom(1);
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      svc.setTranslationLayer(ep._id, 0, 'en', `https://cdn/en-tentativa${i + 1}.png`)));
    const doc = await Episode.findById(ep._id).lean();
    expect(doc.panels[0].translationLayers.filter(l => l.language === 'en')).toHaveLength(1);
  });

  it('remover ES enquanto grava EN no mesmo painel: EN fica e ES sai', async () => {
    const ep = await episodioCom(1);
    await svc.setTranslationLayer(ep._id, 0, 'es', 'https://cdn/es.png');
    const tok = auth.getToken('admin');
    const [del, put] = await Promise.all([
      request(app).delete(`/api/content/episodes/${ep._id}/panels/0/translations/es`).set('Authorization', `Bearer ${tok}`),
      request(app).put(`/api/content/episodes/${ep._id}/panels/0/translations`).set('Authorization', `Bearer ${tok}`)
        .send({ language: 'en', imageUrl: 'https://cdn/en.png' }),
    ]);
    expect([del.status, put.status]).toEqual([200, 200]);
    const doc = await Episode.findById(ep._id).lean();
    expect(doc.panels[0].translationLayers.map(l => l.language)).toEqual(['en']);
  });

  it('salvar a lista inteira a partir de uma leitura antiga da conflito e nao apaga o balao novo', async () => {
    const ep = await episodioCom(3);
    const antigo = await Episode.findById(ep._id); // leitura antes do balao
    await svc.setTranslationLayer(ep._id, 1, 'en', 'https://cdn/en2.png');
    antigo.panels.splice(2, 1); // o que o DELETE de painel faz
    await expect(antigo.save()).rejects.toThrow(/version|No matching document/i);
    expect((await camadas(ep._id, 'en'))[1]).toBe('https://cdn/en2.png');
  });

  it('validacoes de antes continuam: painel inexistente 404, indice invalido 404, idioma fora 400', async () => {
    const ep = await episodioCom(2);
    await expect(svc.setTranslationLayer(ep._id, 5, 'en', 'https://cdn/x.png')).rejects.toMatchObject({ status: 404 });
    await expect(svc.setTranslationLayer(ep._id, NaN, 'en', 'https://cdn/x.png')).rejects.toMatchObject({ status: 404 });
    await expect(svc.setTranslationLayer(ep._id, -1, 'en', 'https://cdn/x.png')).rejects.toMatchObject({ status: 404 });
    await expect(svc.setTranslationLayer(new mongoose.Types.ObjectId(), 0, 'en', 'https://cdn/x.png'))
      .rejects.toMatchObject({ status: 404, message: 'Episódio não encontrado.' });
    await expect(svc.setTranslationLayer(ep._id, 0, 'fr', 'https://cdn/x.png')).rejects.toMatchObject({ status: 400 });
    // Painel antigo sem o campo translationLayers (documento anterior ao campo)
    await Episode.collection.updateOne({ _id: ep._id }, { $unset: { 'panels.1.translationLayers': '' } });
    const painel = await svc.setTranslationLayer(ep._id, 1, 'en', 'https://cdn/en-legado.png');
    expect(painel.translationLayers.map(l => [l.language, l.imageUrl])).toEqual([['en', 'https://cdn/en-legado.png']]);
  });
});
