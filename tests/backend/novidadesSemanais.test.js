/**
 * Testes: resumo semanal de novidades (Fase 6, T6).
 *
 * Spec: docs/superpowers/specs/2026-10-06-fase6-assinatura-acesso-design.md,
 * seção 4.6. Decisão do Fellipe (06/10): resumo SEMANAL automático, não um
 * e-mail por capítulo.
 *
 * O que estes testes travam, em ordem de importância:
 *  1. e-mail de marketing só sai com `consent.marketing === true` (LGPD);
 *  2. o resumo respeita a classificação da CONTA — anunciar obra que a pessoa
 *     não consegue abrir seria anúncio de porta fechada;
 *  3. o mesmo resumo não sai duas vezes na mesma semana (a varredura roda de
 *     hora em hora e reinicia a cada deploy);
 *  4. descadastro funciona SEM login e é idempotente.
 */
const request = require('supertest');
const db = require('../helpers/db');

let app;
let User, Series, Episode, EnvioNovidades, servico, emailService;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  EnvioNovidades = require('../../models/EnvioNovidades');
  servico = require('../../services/novidadesService');
  emailService = require('../../services/emailService');
  // O índice único (userId, periodo) É o mecanismo de "não manda duas vezes":
  // sem esperar a construção, o teste de idempotência ficaria dependendo de
  // corrida com o Mongoose.
  await EnvioNovidades.init();
});

afterAll(() => db.closeDatabase());

// Captura dos e-mails em vez de SMTP de verdade (mesmo padrão de
// parentalPinRoutes.test.js).
let enviados;
beforeEach(async () => {
  enviados = [];
  emailService.__setSenderForTests(async (opts) => {
    enviados.push(opts);
    return { messageId: `teste-${enviados.length}` };
  });
  await Promise.all([Series.deleteMany({}), Episode.deleteMany({}), EnvioNovidades.deleteMany({}), User.deleteMany({})]);
});
afterEach(() => emailService.__setSenderForTests(null));

const DIA_MS = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-10-05T12:00:00Z'); // uma segunda-feira
const DENTRO = new Date(AGORA.getTime() - 2 * DIA_MS);
const FORA = new Date(AGORA.getTime() - 20 * DIA_MS);

let contador = 0;
const unico = (p) => `${p}-${(contador += 1)}-${Date.now()}`;

async function criarLeitor({ marketing = true, isActive = true, classificacaoEtaria = 'young', tagsBloqueadas = [] } = {}) {
  return User.create({
    email: `${unico('leitor')}@lorflux.test`,
    passwordHash: 'x',
    nome: 'Leitor',
    isActive,
    consent: { marketing },
    parental: { classificacaoEtaria, tagsBloqueadas },
  });
}

/**
 * `createdAt` é IMUTÁVEL no Mongoose quando o schema tem `timestamps` — um
 * `$set` pelo model é descartado em silêncio, inclusive com
 * `{ timestamps: false }`. Para datar o capítulo no passado e testar a janela
 * da semana, a escrita tem de passar pela coleção nativa.
 */
async function forcarCriadoEm(episodeId, data) {
  await Episode.collection.updateOne({ _id: episodeId }, { $set: { createdAt: data } });
}

async function criarObraComCapitulo({ content_rating = 'teen', tags = [], isPublished = true, status = 'published', criadoEm = DENTRO, comConteudo = true } = {}) {
  const serie = await Series.create({
    title: unico('Obra'), genre: 'Teste', content_type: 'hiqua', isPublished, content_rating, tags,
  });
  const episodio = await Episode.create({
    seriesId: serie._id, episode_number: 1, title: 'Capitulo 1', status,
    panels: comConteudo ? [{ image_url: 'https://cdn/p1.jpg', order: 0 }] : [],
  });
  await forcarCriadoEm(episodio._id, criadoEm);
  return { serie, episodio };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) Chave do período (semana ISO)
// ═══════════════════════════════════════════════════════════════════════════

describe('chaveDoPeriodo', () => {
  it('dias diferentes da MESMA semana dão a mesma chave', () => {
    const segunda = servico.chaveDoPeriodo(new Date('2026-10-05T00:00:00Z'));
    const domingo = servico.chaveDoPeriodo(new Date('2026-10-11T23:59:00Z'));
    expect(segunda).toBe(domingo);
  });

  it('semanas vizinhas dão chaves diferentes', () => {
    const estaSemana = servico.chaveDoPeriodo(new Date('2026-10-05T00:00:00Z'));
    const proxima = servico.chaveDoPeriodo(new Date('2026-10-12T00:00:00Z'));
    expect(estaSemana).not.toBe(proxima);
  });

  it('usa o formato ANO-Wnn', () => {
    expect(servico.chaveDoPeriodo(new Date('2026-10-05T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('virada de ano: 31/12/2026 pertence à semana 53 de 2026 (regra ISO da quinta-feira)', () => {
    // 31/12/2026 é quinta — a quinta-feira define o ano da semana, então não
    // vira "2027-W01". É o caso que um `Math.floor(dia do ano / 7)` erraria.
    expect(servico.chaveDoPeriodo(new Date('2026-12-31T00:00:00Z'))).toBe('2026-W53');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2) Token de descadastro
// ═══════════════════════════════════════════════════════════════════════════

describe('token de descadastro', () => {
  it('o token da própria conta valida', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(servico.validarTokenDescadastro(id, servico.tokenDescadastro(id))).toBe(true);
  });

  it('token de OUTRA conta não valida (não é um id disfarçado)', () => {
    const a = '507f1f77bcf86cd799439011';
    const b = '507f1f77bcf86cd799439012';
    expect(servico.validarTokenDescadastro(a, servico.tokenDescadastro(b))).toBe(false);
  });

  it('token vazio, ausente ou com tamanho errado não valida', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(servico.validarTokenDescadastro(id, '')).toBe(false);
    expect(servico.validarTokenDescadastro(id, undefined)).toBe(false);
    expect(servico.validarTokenDescadastro(id, 'abc')).toBe(false);
  });

  it('é estável entre chamadas (o link do e-mail precisa durar anos)', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(servico.tokenDescadastro(id)).toBe(servico.tokenDescadastro(id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3) O que entra na semana
// ═══════════════════════════════════════════════════════════════════════════

describe('novidadesDaSemana', () => {
  const janela = () => ({ desde: new Date(AGORA.getTime() - 7 * DIA_MS), ate: AGORA });

  it('inclui capítulo publicado na janela, agrupado pela obra', async () => {
    const { serie } = await criarObraComCapitulo();
    const grupos = await servico.novidadesDaSemana(janela());
    expect(grupos).toHaveLength(1);
    expect(String(grupos[0].serie._id)).toBe(String(serie._id));
    expect(grupos[0].episodios).toHaveLength(1);
  });

  it('agrupa VÁRIOS capítulos da mesma obra em um item só', async () => {
    const { serie } = await criarObraComCapitulo();
    const outro = await Episode.create({
      seriesId: serie._id, episode_number: 2, title: 'Capitulo 2', status: 'published',
      panels: [{ image_url: 'https://cdn/p2.jpg', order: 0 }],
    });
    await forcarCriadoEm(outro._id, DENTRO);

    const grupos = await servico.novidadesDaSemana(janela());
    expect(grupos).toHaveLength(1);
    expect(grupos[0].episodios.map((e) => e.episode_number).sort()).toEqual([1, 2]);
  });

  it('ignora capítulo fora da janela', async () => {
    await criarObraComCapitulo({ criadoEm: FORA });
    expect(await servico.novidadesDaSemana(janela())).toHaveLength(0);
  });

  it('ignora rascunho (status != published)', async () => {
    await criarObraComCapitulo({ status: 'draft' });
    expect(await servico.novidadesDaSemana(janela())).toHaveLength(0);
  });

  it('ignora esqueleto sem painel nem vídeo (não é consumível)', async () => {
    await criarObraComCapitulo({ comConteudo: false });
    expect(await servico.novidadesDaSemana(janela())).toHaveLength(0);
  });

  it('aceita episódio de VÍDEO (sem painel, com video_url)', async () => {
    const { serie } = await criarObraComCapitulo({ comConteudo: false });
    const ep = await Episode.create({
      seriesId: serie._id, episode_number: 2, title: 'Episodio video', status: 'published',
      video_url: 'https://video/ep2.m3u8',
    });
    await forcarCriadoEm(ep._id, DENTRO);
    expect(await servico.novidadesDaSemana(janela())).toHaveLength(1);
  });

  it('ignora capítulo de obra DESPUBLICADA', async () => {
    await criarObraComCapitulo({ isPublished: false });
    expect(await servico.novidadesDaSemana(janela())).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4) Recorte por classificação da conta
// ═══════════════════════════════════════════════════════════════════════════

describe('gruposVisiveisPara', () => {
  const grupo = (overrides) => ({
    serie: { _id: 'x', title: 'Obra', content_type: 'hiqua', content_rating: 'teen', tags: [], ...overrides },
    episodios: [{ episode_number: 1 }],
  });

  it('conta teen não recebe obra young', () => {
    const visiveis = servico.gruposVisiveisPara({ classificacaoEtaria: 'teen' }, [grupo({ content_rating: 'young' })]);
    expect(visiveis).toHaveLength(0);
  });

  it('conta teen recebe obra kids e teen', () => {
    const visiveis = servico.gruposVisiveisPara({ classificacaoEtaria: 'teen' }, [
      grupo({ content_rating: 'kids' }), grupo({ content_rating: 'teen' }),
    ]);
    expect(visiveis).toHaveLength(2);
  });

  it('tag bloqueada tira a obra do resumo', () => {
    const visiveis = servico.gruposVisiveisPara(
      { classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] },
      [grupo({ content_rating: 'young', tags: ['acao'] })]
    );
    expect(visiveis).toHaveLength(0);
  });

  it('obra sem content_rating/tags no doc fica FORA, sem derrubar o lote', () => {
    // passaFiltroParental lança nesse caso (fail-closed, ledger P4). O resumo
    // precisa excluir a obra torta e continuar com as demais.
    const torta = { serie: { _id: 'torta', title: 'Torta' }, episodios: [{ episode_number: 1 }] };
    const visiveis = servico.gruposVisiveisPara({ classificacaoEtaria: 'young' }, [torta, grupo({ content_rating: 'young' })]);
    expect(visiveis).toHaveLength(1);
    expect(visiveis[0].serie._id).not.toBe('torta');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5) Envio
// ═══════════════════════════════════════════════════════════════════════════

describe('enviarResumoSemanal', () => {
  it('envia para quem aceitou e NÃO envia para quem não aceitou', async () => {
    await criarObraComCapitulo();
    const aceitou = await criarLeitor({ marketing: true });
    await criarLeitor({ marketing: false });

    const resumo = await servico.enviarResumoSemanal({ agora: AGORA });

    expect(resumo.enviados).toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe(aceitou.email);
  });

  it('não envia para conta desativada, mesmo com consentimento', async () => {
    await criarObraComCapitulo();
    await criarLeitor({ marketing: true, isActive: false });
    const resumo = await servico.enviarResumoSemanal({ agora: AGORA });
    expect(resumo.enviados).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it('semana sem capítulo novo não manda e-mail nenhum', async () => {
    await criarObraComCapitulo({ criadoEm: FORA });
    await criarLeitor();
    const resumo = await servico.enviarResumoSemanal({ agora: AGORA });
    expect(resumo.enviados).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it('conta teen não recebe resumo de semana que só teve obra young', async () => {
    await criarObraComCapitulo({ content_rating: 'young' });
    await criarLeitor({ classificacaoEtaria: 'teen' });
    const resumo = await servico.enviarResumoSemanal({ agora: AGORA });
    expect(resumo.enviados).toBe(0);
    expect(resumo.semNovidade).toBe(1);
    expect(enviados).toHaveLength(0);
  });

  it('cada conta recebe só o que a sua classificação permite', async () => {
    const { serie: obraTeen } = await criarObraComCapitulo({ content_rating: 'teen' });
    const { serie: obraYoung } = await criarObraComCapitulo({ content_rating: 'young' });
    const teen = await criarLeitor({ classificacaoEtaria: 'teen' });
    const young = await criarLeitor({ classificacaoEtaria: 'young' });

    await servico.enviarResumoSemanal({ agora: AGORA });

    const paraTeen = enviados.find((e) => e.to === teen.email);
    const paraYoung = enviados.find((e) => e.to === young.email);
    expect(paraTeen.html).toContain(obraTeen.title);
    expect(paraTeen.html).not.toContain(obraYoung.title);
    expect(paraYoung.html).toContain(obraTeen.title);
    expect(paraYoung.html).toContain(obraYoung.title);
  });

  it('não repete o resumo na mesma semana (2ª chamada não manda nada)', async () => {
    await criarObraComCapitulo();
    await criarLeitor();

    const primeira = await servico.enviarResumoSemanal({ agora: AGORA });
    const segunda = await servico.enviarResumoSemanal({ agora: new Date(AGORA.getTime() + 3 * 60 * 60 * 1000) });

    expect(primeira.enviados).toBe(1);
    expect(segunda.enviados).toBe(0);
    expect(segunda.jaEnviados).toBe(1);
    expect(enviados).toHaveLength(1);
  });

  it('semana seguinte volta a enviar', async () => {
    await criarObraComCapitulo();
    await criarLeitor();
    await servico.enviarResumoSemanal({ agora: AGORA });

    // Capítulo novo na semana seguinte, e o relógio uma semana à frente.
    const proximaSemana = new Date(AGORA.getTime() + 7 * DIA_MS);
    await criarObraComCapitulo({ criadoEm: new Date(proximaSemana.getTime() - DIA_MS) });

    const resumo = await servico.enviarResumoSemanal({ agora: proximaSemana });
    expect(resumo.enviados).toBe(1);
    expect(enviados).toHaveLength(2);
  });

  it('registra o envio com a contagem do que foi anunciado', async () => {
    await criarObraComCapitulo();
    const leitor = await criarLeitor();
    await servico.enviarResumoSemanal({ agora: AGORA });

    const registro = await EnvioNovidades.findOne({ userId: leitor._id }).lean();
    expect(registro.periodo).toBe(servico.chaveDoPeriodo(AGORA));
    expect(registro.obras).toBe(1);
    expect(registro.capitulos).toBe(1);
  });

  it('falha de SMTP devolve a vez: a próxima varredura tenta de novo', async () => {
    await criarObraComCapitulo();
    const leitor = await criarLeitor();
    emailService.__setSenderForTests(async () => { throw new Error('smtp fora do ar'); });

    const falhou = await servico.enviarResumoSemanal({ agora: AGORA });
    expect(falhou.falhas).toBe(1);
    expect(await EnvioNovidades.countDocuments({ userId: leitor._id })).toBe(0);

    // Volta a funcionar: o mesmo período ainda pode sair.
    emailService.__setSenderForTests(async (opts) => { enviados.push(opts); return {}; });
    const segunda = await servico.enviarResumoSemanal({ agora: AGORA });
    expect(segunda.enviados).toBe(1);
  });

  it('o e-mail traz os cabeçalhos de descadastro e o link no corpo', async () => {
    await criarObraComCapitulo();
    const leitor = await criarLeitor();
    await servico.enviarResumoSemanal({ agora: AGORA });

    const email = enviados[0];
    expect(email.headers['List-Unsubscribe']).toContain('/api/account/novidades/descadastrar');
    expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(email.html).toContain(servico.tokenDescadastro(String(leitor._id)));
    expect(email.text).toContain('Para não receber mais este resumo');
  });

  it('uma conta que falhou não impede o envio das demais', async () => {
    await criarObraComCapitulo();
    const primeiro = await criarLeitor();
    await criarLeitor();
    emailService.__setSenderForTests(async (opts) => {
      if (opts.to === primeiro.email) throw new Error('caixa cheia');
      enviados.push(opts);
      return {};
    });

    const resumo = await servico.enviarResumoSemanal({ agora: AGORA });
    expect(resumo.falhas).toBe(1);
    expect(resumo.enviados).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6) Janela de disparo
// ═══════════════════════════════════════════════════════════════════════════

describe('estaNaHoraDeEnviar', () => {
  it('segunda ao meio-dia UTC: sim', () => {
    expect(servico.estaNaHoraDeEnviar(new Date('2026-10-05T12:00:00Z'))).toBe(true);
  });

  it('segunda de madrugada: ainda não', () => {
    expect(servico.estaNaHoraDeEnviar(new Date('2026-10-05T03:00:00Z'))).toBe(false);
  });

  it('terça: não (a semana já foi resumida)', () => {
    expect(servico.estaNaHoraDeEnviar(new Date('2026-10-06T12:00:00Z'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7) Descadastro pela rota (sem login)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET/POST /api/account/novidades/descadastrar', () => {
  it('desliga o consentimento SEM token de login', async () => {
    const leitor = await criarLeitor({ marketing: true });
    const id = String(leitor._id);

    const res = await request(app)
      .get('/api/account/novidades/descadastrar')
      .query({ u: id, t: servico.tokenDescadastro(id) });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect((await User.findById(id).lean()).consent.marketing).toBe(false);
  });

  it('clicar duas vezes dá o mesmo resultado', async () => {
    const leitor = await criarLeitor({ marketing: true });
    const id = String(leitor._id);
    const url = '/api/account/novidades/descadastrar';
    const q = { u: id, t: servico.tokenDescadastro(id) };

    await request(app).get(url).query(q);
    const segunda = await request(app).get(url).query(q);

    expect(segunda.status).toBe(200);
    expect((await User.findById(id).lean()).consent.marketing).toBe(false);
  });

  it('token inválido não descadastra ninguém', async () => {
    const leitor = await criarLeitor({ marketing: true });
    const id = String(leitor._id);

    const res = await request(app)
      .get('/api/account/novidades/descadastrar')
      .query({ u: id, t: 'a'.repeat(64) });

    expect(res.status).toBe(400);
    expect((await User.findById(id).lean()).consent.marketing).toBe(true);
  });

  it('token de OUTRA conta não descadastra a conta do parâmetro', async () => {
    const vitima = await criarLeitor({ marketing: true });
    const outro = await criarLeitor({ marketing: true });

    const res = await request(app)
      .get('/api/account/novidades/descadastrar')
      .query({ u: String(vitima._id), t: servico.tokenDescadastro(String(outro._id)) });

    expect(res.status).toBe(400);
    expect((await User.findById(vitima._id).lean()).consent.marketing).toBe(true);
  });

  it('POST (One-Click do RFC 8058) descadastra e responde vazio', async () => {
    const leitor = await criarLeitor({ marketing: true });
    const id = String(leitor._id);

    const res = await request(app)
      .post('/api/account/novidades/descadastrar')
      .send({ u: id, t: servico.tokenDescadastro(id) });

    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect((await User.findById(id).lean()).consent.marketing).toBe(false);
  });

  it('depois de descadastrar, o resumo da semana não sai mais', async () => {
    await criarObraComCapitulo();
    const leitor = await criarLeitor({ marketing: true });
    const id = String(leitor._id);

    await request(app).get('/api/account/novidades/descadastrar').query({ u: id, t: servico.tokenDescadastro(id) });
    const resumo = await servico.enviarResumoSemanal({ agora: AGORA });

    expect(resumo.enviados).toBe(0);
    expect(enviados).toHaveLength(0);
  });
});
