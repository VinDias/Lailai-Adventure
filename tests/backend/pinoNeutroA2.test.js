/**
 * Regressao A2 — "obra SEM tags abre o feed na frente de obra que o leitor
 * demonstrou gostar".
 *
 * O DEFEITO, em linguagem de negocio: toda obra ainda sem tags recebia 12,5
 * pontos FIXOS de afinidade (o "neutro" de quem nao tem historico). Quando o
 * leitor nao tinha match forte com nada do catalogo — todas as afinidades
 * reais baixas —, esses 12,5 de enfeite superavam a MELHOR obra de verdade e
 * a obra sem curadoria ficava em PRIMEIRO lugar na recomendacao, na frente
 * das obras que o leitor de fato mostrou gostar. A correcao troca o 12,5 fixo
 * por um neutro DERIVADO do proprio catalogo (media das afinidades reais):
 * como media nunca supera o maximo, a obra sem tags deixou de poder "abrir o
 * feed" por causa do placeholder.
 *
 * MEDIDO EM: 21/10/2026, pela triagem de regressoes (grupo pino-a2).
 *
 * COMMITS: a correcao de PRODUCAO vive em services/recommendationService.js
 * (buildRecommendations: `const afinidade = temTags ? computeAfinidade(serie,
 * perfil) : neutroDerivado;`). O commit 9285a2f ("fix(parental): restaura o
 * pino da regressao A2 no teste de neutro", 03/09/2026) NAO mexeu em
 * producao: ele consertou a FORCA do teste que vigia essa linha. A migracao
 * T2 havia dado 3 de 3 tags do perfil a obra "Catalogo Alta" (afinidade 25),
 * o que fez o neutro derivado daquele cenario cair em (25+0)/2 = 12,5 —
 * EXATAMENTE igual ao neutro fixo antigo. Com os dois valores coincidindo, o
 * teste de ordenacao passava mesmo com a regressao instalada: tinha virado um
 * teste-fantasma. A triagem confirmou isso por mutacao (144 testes passando
 * com a regressao de volta).
 *
 * O QUE ESTE ARQUIVO GARANTE:
 *  - a propriedade matematica que sustenta a correcao, medida com as funcoes
 *    de producao: o neutro derivado NUNCA excede a melhor afinidade real da
 *    base (nem fica abaixo da pior);
 *  - que a obra sem tags nao abre o feed em DOIS cenarios de catalogo
 *    diferentes, cada um exercitando buildRecommendations de ponta a ponta
 *    (Mongo de verdade, perfil montado a partir de progresso de leitura real):
 *    catalogo em que o leitor nao bate com NADA, e catalogo em que a melhor
 *    afinidade real existe mas e modesta;
 *  - que cada cenario AINDA DISCRIMINA a regressao, por um guard numerico que
 *    compara a melhor afinidade real do catalogo com o neutro FIXO obtido da
 *    propria producao (`computeNeutroDerivado([], perfil)`, o caminho
 *    documentado "catalogo sem nenhuma obra tagueada cai no neutro fixo").
 *    E esse guard que impede o teste de virar fantasma outra vez: se alguem
 *    re-taguear a obra do cenario como a migracao T2 fez, o guard quebra na
 *    hora, com mensagem dizendo o porque, em vez de passar calado.
 *
 * O QUE ELE NAO GARANTE:
 *  - nao vigia a qualidade dos OUTROS testes do projeto (nao existe harness
 *    de mutacao aqui; perda de pino em outro arquivo continua invisivel);
 *  - nao cobre a exclusao das obras JA consumidas da media (regra separada da
 *    re-revisao), nem as cotas 50/30/20, a intercalacao ou a diversidade — as
 *    afirmacoes de ordem se limitam a QUEM ABRE a lista, a unica posicao que
 *    e consequencia direta do valor de ordenacao;
 *  - nao fixa a magnitude dos pesos do perfil nem da escala de afinidade:
 *    verifica relacoes entre valores que a producao calcula, nao numeros
 *    cravados (a unica excecao e o 12,5 da spec, ancorado num assert
 *    proprio).
 */
const mongoose = require('mongoose');
const db = require('../helpers/db');

let Series, SeriesScore, ReadingProgress, recommendationService;

beforeAll(async () => {
  await db.connect();
  Series = require('../../models/Series');
  SeriesScore = require('../../models/SeriesScore');
  ReadingProgress = require('../../models/ReadingProgress');
  recommendationService = require('../../services/recommendationService');
});

afterAll(() => db.closeDatabase());

beforeEach(() => db.clearDatabase());

// Mesmo molde dos vizinhos de tests/backend/recommendations.test.js:
// obra publicada de hiqua, content_rating 'teen' (o filtro parental nao entra
// aqui porque o servico e chamado direto, sem filtroExtra, mas o shape fica
// igual ao dos outros testes).
function criarSerie(overrides = {}) {
  return Series.create({
    title: 'Serie Recomendacao', genre: 'Teste', content_type: 'hiqua', isPublished: true,
    content_rating: 'teen', ...overrides,
  });
}

function criarScore(seriesId, overrides = {}) {
  return SeriesScore.create({
    seriesId, contentType: 'hiqua', scoreFinal: 0, qualidade: 0, retencao: 0, descoberta: 0,
    potentialScore: 0, confidence: 0, leitoresUnicos: 0, penalizacoes: [], computedAt: new Date(),
    ...overrides,
  });
}

// Perfil real do leitor: progresso de leitura em 3 obras de OUTRO
// content_type (vcine), que por isso alimentam o perfil sem competir no
// catalogo hiqua medido. Devolve o userId.
async function leitorComPerfilDeTresTemas() {
  const temas = ['romance', 'drama', 'comedia'];
  const leitor = new mongoose.Types.ObjectId();
  for (const [i, tema] of temas.entries()) {
    const serie = await Series.create({
      title: `Perfil Tema${i + 1}`, genre: 'Teste', content_type: 'vcine', isPublished: true, tags: [tema],
    });
    await ReadingProgress.create({
      userId: leitor, seriesId: serie._id, episodeId: new mongoose.Types.ObjectId(),
      contentType: 'vcine', percent: 0.5,
    });
  }
  return leitor;
}

// Tudo medido pela producao: perfil do leitor, afinidades reais do catalogo
// hiqua, neutro derivado do cenario e o neutro FIXO antigo (o caminho
// documentado de catalogo sem nenhuma obra tagueada).
async function medirCenario(leitor) {
  const { perfil, seriesConsumidas } = await recommendationService.computeAffinityProfileCompleto({ userId: leitor });
  const catalogo = await Series.find({ isPublished: true, content_type: 'hiqua' }).lean();
  const afinidadesReais = catalogo
    .filter((serie) => (serie.tags || []).length > 0)
    .map((serie) => recommendationService.computeAfinidade(serie, perfil));
  return {
    perfil,
    afinidadesReais,
    melhorAfinidadeReal: Math.max(...afinidadesReais),
    neutroDerivado: recommendationService.computeNeutroDerivado(catalogo, perfil, seriesConsumidas),
    neutroFixo: recommendationService.computeNeutroDerivado([], perfil),
  };
}

describe('regressao A2 — neutro de afinidade derivado do catalogo', () => {
  it('o neutro FIXO da spec e 12,5 (ancora do guard dos cenarios abaixo)', async () => {
    const leitor = await leitorComPerfilDeTresTemas();
    const { perfil } = await recommendationService.computeAffinityProfileCompleto({ userId: leitor });
    // Caminho documentado: catalogo SEM nenhuma obra tagueada nao tem
    // afinidade real nenhuma pra tirar media e cai no neutro fixo. E dele que
    // os guards tiram o valor que a regressao usaria, sem numero magico.
    expect(recommendationService.computeNeutroDerivado([], perfil)).toBe(12.5);
  });

  it('o neutro derivado fica SEMPRE dentro da faixa das afinidades reais da base (media nunca supera o maximo)', async () => {
    const perfil = { romance: 1, drama: 1, comedia: 1 };
    const casos = [
      { nome: 'catalogo frio (nada bate o perfil)', tags: [['terror'], ['acao']] },
      { nome: 'melhor afinidade modesta (1 de 3 temas)', tags: [['romance'], ['terror']] },
      { nome: 'melhor afinidade media (2 de 3 temas)', tags: [['romance', 'drama'], ['terror']] },
      { nome: 'armadilha do pino (3 de 3 temas)', tags: [['romance', 'drama', 'comedia'], ['terror']] },
      { nome: 'catalogo todo quente', tags: [['romance', 'drama', 'comedia'], ['romance', 'drama']] },
    ];

    for (const caso of casos) {
      const series = caso.tags.map((tags, i) => ({ _id: `s${i}`, tags }));
      const afinidades = series.map((serie) => recommendationService.computeAfinidade(serie, perfil));
      const neutro = recommendationService.computeNeutroDerivado(series, perfil);
      // A propriedade que faz a correcao valer: o placeholder da obra sem
      // tags nao pode desbancar a melhor obra real, porque e media delas.
      expect(neutro, caso.nome).toBeLessThanOrEqual(Math.max(...afinidades));
      expect(neutro, caso.nome).toBeGreaterThanOrEqual(Math.min(...afinidades));
    }
  });

  it('cenario com 3 de 3 tags do perfil e CEGO para a regressao — e por isso que o pino existe', async () => {
    const perfil = { romance: 1, drama: 1, comedia: 1 };
    const neutroFixo = recommendationService.computeNeutroDerivado([], perfil);
    // Exatamente o catalogo que a migracao T2 deixou no teste antigo: obra
    // batendo os 3 temas + obra batendo nenhum. O neutro derivado COINCIDE
    // com o fixo, entao nenhum assert de ordem consegue distinguir os dois
    // comportamentos. Qualquer cenario de ordenacao nessa condicao e
    // decorativo.
    const cego = [{ _id: 'alta', tags: ['romance', 'drama', 'comedia'] }, { _id: 'baixa', tags: ['terror'] }];
    expect(recommendationService.computeNeutroDerivado(cego, perfil)).toBe(neutroFixo);
    // E o cenario usado pelos testes de ponta a ponta abaixo: obra batendo 1
    // dos 3 temas. Derivado estritamente MENOR que o fixo — da pra distinguir.
    const discriminante = [{ _id: 'alta', tags: ['romance'] }, { _id: 'baixa', tags: ['terror'] }];
    expect(recommendationService.computeNeutroDerivado(discriminante, perfil)).toBeLessThan(neutroFixo);
  });

  it('catalogo em que o leitor nao bate com NADA: obra sem tags nao abre o feed na frente de obra avaliada', async () => {
    const leitor = await leitorComPerfilDeTresTemas();

    // Catalogo hiqua: duas obras tagueadas que nao batem nenhum tema do
    // perfil (afinidade real 0) e uma obra SEM tags. As duas tagueadas tem
    // score pequeno: parteDaObra = scoreFinal x 0,65 = 6,5, vezes confidence
    // 0,2 = 1,3 de valor de ordenacao (teto garantido: scoreFinal 10 x
    // confidence 0,2 = 2, porque parteDaObra nunca passa de scoreFinal).
    const avaliada1 = await criarSerie({ title: 'Catalogo Fria Avaliada 1', tags: ['terror'] });
    const avaliada2 = await criarSerie({ title: 'Catalogo Fria Avaliada 2', tags: ['acao'] });
    const semTags = await criarSerie({ title: 'Catalogo Fria Sem Tags' });
    await criarScore(avaliada1._id, { scoreFinal: 10, confidence: 0.2 });
    await criarScore(avaliada2._id, { scoreFinal: 10, confidence: 0.2 });

    const medida = await medirCenario(leitor);
    // Guard do cenario (tudo medido na producao): nenhuma obra bate o perfil,
    // entao o neutro derivado e 0 — a obra sem tags fica atras de qualquer
    // obra com nota. Com o neutro FIXO, ela ganharia 12,5, acima do teto de 2
    // das avaliadas: o cenario DISCRIMINA a regressao.
    expect(medida.melhorAfinidadeReal).toBe(0);
    expect(medida.neutroDerivado).toBe(0);
    expect(medida.neutroFixo).toBeGreaterThan(2);

    const ids = (await recommendationService.buildRecommendations({ contentType: 'hiqua', userId: leitor }))
      .map((serie) => String(serie._id));

    expect(ids).toHaveLength(3);
    // Quem abre a lista e sempre a de maior valor de ordenacao: uma das
    // avaliadas, nunca a sem tags.
    expect(ids[0]).not.toBe(String(semTags._id));
    expect([String(avaliada1._id), String(avaliada2._id)]).toContain(ids[0]);
  });

  it('catalogo com melhor afinidade MODESTA: obra sem tags nao desbanca a obra de maior afinidade real', async () => {
    const leitor = await leitorComPerfilDeTresTemas();

    // O cenario do pino, com a carga que 9285a2f restaurou: a melhor
    // afinidade real do catalogo bate 1 dos 3 temas (8,33) e por isso fica
    // ABAIXO do neutro fixo antigo (12,5). Sem SeriesScore nenhum, o valor de
    // ordenacao e afinidade pura.
    const alta = await criarSerie({ title: 'Catalogo Alta Modesta', tags: ['romance'] });
    const baixa = await criarSerie({ title: 'Catalogo Baixa Modesta', tags: ['terror'] });
    const semTags = await criarSerie({ title: 'Catalogo Modesta Sem Tags' });

    const medida = await medirCenario(leitor);
    // Guard anti-fantasma: se alguem re-taguear `alta` com mais temas do
    // perfil (foi o que a migracao T2 fez), a melhor afinidade real sobe pra
    // 12,5 ou mais, o cenario para de distinguir neutro derivado de neutro
    // fixo e ESTE assert quebra — em vez de o teste seguir passando calado.
    expect(medida.melhorAfinidadeReal).toBeGreaterThan(0);
    expect(medida.melhorAfinidadeReal).toBeLessThan(medida.neutroFixo);
    expect(medida.neutroDerivado).toBeLessThan(medida.melhorAfinidadeReal);

    const ids = (await recommendationService.buildRecommendations({ contentType: 'hiqua', userId: leitor }))
      .map((serie) => String(serie._id));

    expect(ids).toHaveLength(3);
    // Com o neutro derivado, quem abre o feed e a obra de maior afinidade
    // real; com o neutro fixo, a sem tags passaria na frente dela.
    expect(ids[0]).toBe(String(alta._id));
    expect(ids.indexOf(String(semTags._id))).toBeGreaterThan(0);
    expect(ids).toContain(String(baixa._id));
  });
});
