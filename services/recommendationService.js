/**
 * Algoritmo de recomendação (Fase 4, Bloco 4) — score por obra.
 *
 * Task 2 (este commit): `leitoresUnicos` + Qualidade (0–30, Etapa 2 do PDF —
 * cada métrica é proporcional POR LEITOR ÚNICO e normalizada pelo melhor do
 * mesmo `content_type`) + esqueleto de `computeSeriesScore`/`computeAllScores`
 * que já grava o que existe até aqui. Retenção, Descoberta, Potential,
 * Confidence, penalizações e `scoreFinal` chegam nas Tasks 3 e 4.
 *
 * Spec: docs/superpowers/specs/2026-08-20-algoritmo-recomendacao-design.md
 * Ledger: .superpowers/sdd/2026-08-20-algoritmo/progress.md
 *   P4 — eventos flagged do anti-fraude ficam FORA de toda contagem.
 */
const mongoose = require('mongoose');
const Series = require('../models/Series');
const SeriesScore = require('../models/SeriesScore');
const ReadingProgress = require('../models/ReadingProgress');
const SuperReaderContribution = require('../models/SuperReaderContribution');
const Favorite = require('../models/Favorite');
const SeriesVote = require('../models/SeriesVote');
const EngagementEvent = require('../models/EngagementEvent');

// Peso interno da Qualidade (Etapa 2 do PDF, confirmado pelo cliente).
const PESO_SUPER_READER = 0.45;
const PESO_FAVORITOS = 0.25;
const PESO_LIKES = 0.20;
const PESO_RELEITURAS = 0.10;
const ESCALA_QUALIDADE = 30; // pts máximos da Qualidade dentro dos 100 do PDF

/**
 * Leitores únicos de uma série: identidades distintas em ReadingProgress —
 * `userId` OU `anonymousId` (o modelo exige exatamente um dos dois por doc,
 * nunca os dois — ver models/ReadingProgress.js). Somamos as duas contagens
 * distintas não-nulas.
 *
 * Uma pessoa que leu anônima e DEPOIS logada, em tese, apareceria nas duas
 * listas (contando 2). O claim do Bloco 1 (services/progressService.
 * claimAnonymousProgress) REATRIBUI os documentos do `anonymousId` para o
 * `userId` no login/cadastro — mas só o `anonymousId` EFETIVAMENTE
 * reclamado naquele login (o do aparelho/sessão atual). Achado da revisão
 * da T2: se a mesma pessoa leu em OUTRO aparelho/navegador com um
 * `anonymousId` diferente e nunca logou por lá, aquele progresso fica
 * órfão — conta como um leitor "anônimo" separado do "logado". Edge case
 * herdado do Bloco 1 (o claim é por sessão, não por pessoa) — aceito, fora
 * do escopo deste bloco corrigir.
 */
async function contarLeitoresUnicos(seriesId) {
  const [usuarios, anonimos] = await Promise.all([
    ReadingProgress.distinct('userId', { seriesId, userId: { $ne: null } }),
    ReadingProgress.distinct('anonymousId', { seriesId, anonymousId: { $ne: null } }),
  ]);
  return usuarios.length + anonimos.length;
}

/**
 * Likes − dislikes de SeriesVote, nunca negativo (dislikes não "devem" à
 * obra). Mesmo gate de "ação real de leitor" do Favorito (ver
 * computeMetricasBrutas): só conta voto de quem também tem ReadingProgress
 * na mesma série (`leitoresUserIds`) — sem isso, contas falsas votando sem
 * ler inflariam o máximo do content_type e suprimiriam a qualidade das
 * obras honestas (achado ALTO da revisão da T2).
 */
async function contarLikesLiquidos(seriesObjectId, leitoresUserIds) {
  const porTipo = await SeriesVote.aggregate([
    { $match: { seriesId: seriesObjectId, userId: { $in: leitoresUserIds } } },
    { $group: { _id: '$type', total: { $sum: 1 } } },
  ]);
  const likes = porTipo.find((t) => t._id === 'like')?.total || 0;
  const dislikes = porTipo.find((t) => t._id === 'dislike')?.total || 0;
  return Math.max(0, likes - dislikes);
}

/**
 * Releituras: eventos view/read NÃO flagged da série, além do primeiro POR
 * USUÁRIO (proxy — EngagementEvent não tem `anonymousId`, só `userId`; ver
 * spec, tabela "Dados disponíveis"). Soma de (count−1) para cada userId com
 * count>1. P4 do ledger: flagged fica de fora do $match, nunca conta.
 */
async function contarReleituras(seriesObjectId) {
  const porUsuario = await EngagementEvent.aggregate([
    { $match: { seriesId: seriesObjectId, type: { $in: ['view', 'read'] }, flagged: false, userId: { $ne: null } } },
    { $group: { _id: '$userId', total: { $sum: 1 } } },
    { $match: { total: { $gt: 1 } } },
    { $group: { _id: null, releituras: { $sum: { $subtract: ['$total', 1] } } } },
  ]);
  return porUsuario[0]?.releituras || 0;
}

/**
 * Métricas brutas (por leitor único, ainda SEM normalizar pelo catálogo) das
 * 4 componentes da Qualidade. Privada — usada tanto por `buildQualidadeContexto`
 * (para achar o máximo do content_type) quanto por `computeQualidade` (para o
 * valor da própria série), garantindo que as duas contam do mesmo jeito.
 *
 * Leitores únicos 0 → todas as métricas 0 (sem divisão por zero).
 *
 * Busca a lista de userIds leitores da série (não só a contagem) porque
 * Favorito e Like precisam dela para o gate de "ação real de leitor" abaixo
 * — evita repetir o distinct de contarLeitoresUnicos com outra query.
 */
async function computeMetricasBrutas(seriesId) {
  const seriesObjectId = new mongoose.Types.ObjectId(seriesId);
  const [leitoresUserIds, leitoresAnonimos] = await Promise.all([
    ReadingProgress.distinct('userId', { seriesId: seriesObjectId, userId: { $ne: null } }),
    ReadingProgress.distinct('anonymousId', { seriesId: seriesObjectId, anonymousId: { $ne: null } }),
  ]);
  const leitoresUnicos = leitoresUserIds.length + leitoresAnonimos.length;

  if (leitoresUnicos === 0) {
    return {
      leitoresUnicos: 0,
      superReaderPorLeitor: 0,
      favoritosPorLeitor: 0,
      likesPorLeitor: 0,
      releiturasPorLeitor: 0,
    };
  }

  const [superReaderCount, favoritosCount, likesLiquidos, releiturasCount] = await Promise.all([
    // Super Reader conta SEMPRE, SEM o gate de leitura abaixo: é um gate
    // ECONÔMICO, não comportamental — a contribuição só existe porque
    // passou pelo checkout pago do Stripe (services/superReaderService.js).
    // Além disso, uma contribuição anonimizada (userId: null — exclusão de
    // conta, LGPD do Bloco 3, ver models/SuperReaderContribution.js) perde
    // o vínculo com qualquer leitor: filtrar por leitura descartaria apoios
    // reais e já pagos, sem nenhum ganho anti-fraude (quem paga não é o
    // perfil de ataque barato que o gate abaixo mira).
    SuperReaderContribution.countDocuments({ seriesId: seriesObjectId }),
    // Favorito só conta se quem favoritou também LEU a obra (tem
    // ReadingProgress na mesma série) — achado ALTO da revisão da T2: sem
    // esse filtro, N contas falsas favoritando SEM ler fariam
    // favoritosPorLeitor crescer sem teto e, via o máximo do content_type,
    // SUPRIMIR a qualidade de todas as obras honestas do tipo (é grátis
    // favoritar, ao contrário do Super Reader). $in no conjunto de leitores
    // logados da própria série (já buscado acima) — catálogo pequeno, a
    // escala atual comporta o $in sem paginação (spec, "Fora de escopo").
    Favorite.countDocuments({ seriesId: seriesObjectId, userId: { $in: leitoresUserIds } }),
    contarLikesLiquidos(seriesObjectId, leitoresUserIds),
    contarReleituras(seriesObjectId),
  ]);

  return {
    leitoresUnicos,
    superReaderPorLeitor: superReaderCount / leitoresUnicos,
    favoritosPorLeitor: favoritosCount / leitoresUnicos,
    likesPorLeitor: likesLiquidos / leitoresUnicos,
    releiturasPorLeitor: releiturasCount / leitoresUnicos,
  };
}

/**
 * Contexto de normalização: para cada `content_type`, o MÁXIMO de cada
 * métrica (por leitor único) entre as séries PUBLICADAS daquele tipo.
 * Calculado UMA vez por varredura — `computeAllScores` chama isto uma única
 * vez e passa o resultado para cada `computeSeriesScore`, evitando recalcular
 * o catálogo inteiro série por série.
 *
 * Assinatura escolhida: sem parâmetros, sempre varre `Series` publicadas do
 * banco. Devolve `{ [contentType]: { superReaderPorLeitor, favoritosPorLeitor,
 * likesPorLeitor, releiturasPorLeitor } }` — máximo 0 quando nenhuma série do
 * tipo tem aquela métrica > 0 ainda (computeQualidade trata max 0 como
 * "sem normalização possível", componente fica 0, nunca NaN/Infinity).
 */
async function buildQualidadeContexto() {
  const series = await Series.find({ isPublished: true }, '_id content_type').lean();
  const porSerie = await Promise.all(series.map(async (s) => ({
    contentType: s.content_type,
    metricas: await computeMetricasBrutas(s._id),
  })));

  const contexto = {};
  for (const { contentType, metricas } of porSerie) {
    if (!contexto[contentType]) {
      contexto[contentType] = {
        superReaderPorLeitor: 0, favoritosPorLeitor: 0, likesPorLeitor: 0, releiturasPorLeitor: 0,
      };
    }
    const max = contexto[contentType];
    max.superReaderPorLeitor = Math.max(max.superReaderPorLeitor, metricas.superReaderPorLeitor);
    max.favoritosPorLeitor = Math.max(max.favoritosPorLeitor, metricas.favoritosPorLeitor);
    max.likesPorLeitor = Math.max(max.likesPorLeitor, metricas.likesPorLeitor);
    max.releiturasPorLeitor = Math.max(max.releiturasPorLeitor, metricas.releiturasPorLeitor);
  }
  return contexto;
}

/**
 * Qualidade (0–30 pts, Etapa 2 do PDF): cada métrica por leitor único é
 * normalizada pelo máximo do MESMO `content_type` (contexto, ver
 * `buildQualidadeContexto`) e pesada — Super Reader 45% · Favoritos 25% ·
 * Likes 20% · Releituras 10% — escalada para 0–30. Regra de ouro do PDF:
 * "100 leitores e 20 favoritos > 10.000 leitores e 200 favoritos" — a
 * proporção por leitor é o que importa, não o volume absoluto.
 *
 * `serie` precisa de `_id` e `content_type` (doc do Mongoose ou objeto
 * lean/simples funcionam). `contexto` vem de `buildQualidadeContexto()`; sem
 * ele (ou tipo ausente do contexto), toda normalização cai para 0 —
 * comportamento seguro, nunca NaN/Infinity.
 */
async function computeQualidade(serie, contexto = {}) {
  const metricas = await computeMetricasBrutas(serie._id);

  if (metricas.leitoresUnicos === 0) {
    return { qualidade: 0, leitoresUnicos: 0, metricas };
  }

  const max = contexto[serie.content_type] || {};
  const normalizar = (valor, maximo) => (maximo > 0 ? valor / maximo : 0);

  const superReaderNorm = normalizar(metricas.superReaderPorLeitor, max.superReaderPorLeitor);
  const favoritosNorm = normalizar(metricas.favoritosPorLeitor, max.favoritosPorLeitor);
  const likesNorm = normalizar(metricas.likesPorLeitor, max.likesPorLeitor);
  const releiturasNorm = normalizar(metricas.releiturasPorLeitor, max.releiturasPorLeitor);

  const qualidade = (
    superReaderNorm * PESO_SUPER_READER
    + favoritosNorm * PESO_FAVORITOS
    + likesNorm * PESO_LIKES
    + releiturasNorm * PESO_RELEITURAS
  ) * ESCALA_QUALIDADE;

  return { qualidade, leitoresUnicos: metricas.leitoresUnicos, metricas };
}

/**
 * Esqueleto (Task 2): grava em SeriesScore o que já existe — qualidade,
 * leitoresUnicos, contentType, computedAt. Retenção, Descoberta, Potential,
 * Confidence, penalizações e scoreFinal ficam no default (0/[]) até as
 * Tasks 3 e 4 completarem.
 *
 * `contexto` é opcional — se não vier (chamada avulsa, fora de uma
 * varredura), constrói o próprio via `buildQualidadeContexto()`;
 * `computeAllScores` calcula uma vez e passa para cada chamada, evitando
 * recalcular o catálogo inteiro a cada série.
 *
 * `agora` é sempre injetável (regra do ledger: datas SEMPRE injetáveis) —
 * vira `computedAt`.
 */
async function computeSeriesScore(seriesId, { agora = new Date(), contexto } = {}) {
  const serie = await Series.findById(seriesId).lean();
  if (!serie) {
    const erro = new Error('Série não encontrada.');
    erro.status = 404;
    throw erro;
  }

  const ctx = contexto || await buildQualidadeContexto();
  const { qualidade, leitoresUnicos } = await computeQualidade(serie, ctx);

  return SeriesScore.findOneAndUpdate(
    { seriesId },
    {
      $set: {
        contentType: serie.content_type,
        qualidade,
        leitoresUnicos,
        retencao: 0,
        descoberta: 0,
        scoreFinal: 0,
        potentialScore: 0,
        confidence: 0,
        penalizacoes: [],
        computedAt: agora,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Esqueleto (Task 2): varre todas as séries publicadas e chama
 * `computeSeriesScore` para cada uma, reaproveitando UM contexto de
 * normalização para a varredura inteira (Etapa 2 do PDF: "calculado uma vez
 * por varredura"). Sequencial de propósito — o catálogo é pequeno (spec,
 * "Fora de escopo": cache/paginação da recomendação não é necessário nesta
 * escala) e evita disparar N queries em paralelo contra o Mongo.
 */
async function computeAllScores({ agora = new Date() } = {}) {
  const contexto = await buildQualidadeContexto();
  const series = await Series.find({ isPublished: true }, '_id').lean();

  const resultados = [];
  for (const s of series) {
    resultados.push(await computeSeriesScore(s._id, { agora, contexto }));
  }
  return resultados;
}

module.exports = {
  contarLeitoresUnicos,
  buildQualidadeContexto,
  computeQualidade,
  computeSeriesScore,
  computeAllScores,
};
