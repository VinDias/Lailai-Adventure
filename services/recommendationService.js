/**
 * Algoritmo de recomendação (Fase 4, Bloco 4) — score por obra.
 *
 * Task 2: `leitoresUnicos` + Qualidade (0–30, Etapa 2 do PDF — cada métrica é
 * proporcional POR LEITOR ÚNICO e normalizada pelo melhor do mesmo
 * `content_type`).
 *
 * Task 3: Retenção (0–25, Etapa 3 do PDF — redistribuição 45/33/22 do ledger
 * P2, tempo médio de leitura não coletado) e Penalizações (Etapa 9 —
 * multiplicadores sobre a soma pré-escala, piso de 20%).
 *
 * Task 4 (este commit): Descoberta (0–10, Etapa 6), Potential Score (0–100,
 * Etapa 7), Confidence Score (0–1, Etapa 12) e a composição final —
 * `scoreFinal = (qualidade+retencao+descoberta)/65×100`, penalizações
 * aplicadas SOBRE a soma crua ANTES de reescalar. `computeSeriesScore` grava
 * TODOS os campos do SeriesScore agora; `computeAllScores` devolve o resumo
 * `{ total, erros }` (erro de UMA série não para a varredura — loga e segue).
 * Também executa o RULING da inatividade decidido no fim da T3 (ledger): ver
 * comentário de `coletarSinaisInatividade` abaixo.
 *
 * Task 5 (este commit): gatilhos fire-and-forget de recálculo por obra
 * (`dispararRecalculo`, mesmo molde do push do Bloco 2) e a varredura
 * periódica de 24h + inicial no boot (`iniciarVarreduraPeriodica`/
 * `pararVarreduraPeriodica`) — ver comentários de cada função no fim do
 * arquivo. As rotas que disparam `dispararRecalculo` estão listadas na spec,
 * seção "Rotas".
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
const Episode = require('../models/Episode');
const logger = require('../utils/logger');

// Peso interno da Qualidade (Etapa 2 do PDF, confirmado pelo cliente).
const PESO_SUPER_READER = 0.45;
const PESO_FAVORITOS = 0.25;
const PESO_LIKES = 0.20;
const PESO_RELEITURAS = 0.10;
const ESCALA_QUALIDADE = 30; // pts máximos da Qualidade dentro dos 100 do PDF

// Peso interno da Retenção (Etapa 3 do PDF). Redistribuído 45/33/22 — o PDF
// original tinha uma 4ª métrica, "tempo médio de leitura" (10%), que o app
// NÃO coleta (ledger P2). Concluídos 40→45, percentual 30→33, outro-dia
// 20→22 — mesma proporção relativa entre si, somando 100% dos 3 restantes.
// Dívida registrada na spec: voltar a 40/30/20/10 quando o tempo for coletado.
const PESO_CONCLUIDOS = 0.45;
const PESO_PERCENTUAL_MEDIO = 0.33;
const PESO_OUTRO_DIA = 0.22;
const ESCALA_RETENCAO = 25; // pts máximos da Retenção dentro dos 100 do PDF

// Penalizações (Etapa 9 do PDF, spec "Penalizações (Etapa 9)"). Limiares são
// decisão nossa — documentados aqui, dívida registrada na spec (ficarem
// configuráveis por `Setting`). Cada limiar documenta explicitamente se é
// inclusive ou exclusive na fronteira, conforme pedido no ledger.
const LIMIAR_RETENCAO_BAIXA = 0.30; // fração de ESCALA_RETENCAO — EXCLUSIVE: retencao < 30% dispara; exatos 30% NÃO dispara.
const MULTIPLICADOR_RETENCAO_BAIXA = 0.80;

const LIMIAR_ABANDONO_RAPIDO = 0.60;  // fração de leitores — INCLUSIVE: >=60% dispara.
const LIMIAR_PERCENT_ABANDONO = 0.25; // percent no episódio 1 — EXCLUSIVE: percent < 25% dispara; exatos 25% NÃO dispara.
const MULTIPLICADOR_ABANDONO_RAPIDO = 0.85;

const DIAS_INATIVIDADE = 60; // dias desde o último capítulo publicado — EXCLUSIVE: >60 dispara; exatos 60 NÃO dispara.
const MULTIPLICADOR_INATIVIDADE = 0.90;

const MULTIPLICADORES_PENALIZACAO = {
  retencao_baixa: MULTIPLICADOR_RETENCAO_BAIXA,
  abandono_rapido: MULTIPLICADOR_ABANDONO_RAPIDO,
  inatividade: MULTIPLICADOR_INATIVIDADE,
};

// "Piso: o resultado pós-multiplicadores nunca fica abaixo de 20% do valor
// pré-penalização" (spec). Com os 3 códigos reais de hoje o produto mínimo é
// 0,80×0,85×0,90 = 61,2% — o piso nunca é alcançado na prática atual; ele é
// uma blindagem para o futuro (mais penalizações, limiares mais severos).
// Ver aplicarPenalizacoesNaSoma e o teste "piso de 20%" (cenário sintético).
const PISO_PENALIZACAO = 0.20;

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
 * Concluídos (45% da Retenção): para cada leitor (identidade userId OU
 * anonymousId com QUALQUER ReadingProgress na série), a fração de episódios
 * PUBLICADOS que ele concluiu (`completed: true`), depois a MÉDIA dessa
 * fração entre todos os leitores (quem não concluiu nada entra com 0 — não é
 * excluído da média). `Math.min(1, …)` blinda um caso degenerado (episódio
 * apagado depois de concluído deixaria completados > totalEpisodios).
 *
 * Devolve `{ fracaoMedia, totalLeitores }` — `totalLeitores` é reaproveitado
 * pelas outras duas sub-métricas e pelo `leitoresUnicos` do doc final, uma
 * única contagem por chamada de computeRetencao (ver Promise.all abaixo).
 */
async function computeConcluidosPorLeitor(seriesObjectId, totalEpisodios) {
  const porLeitor = await ReadingProgress.aggregate([
    { $match: { seriesId: seriesObjectId } },
    { $group: {
      _id: { $ifNull: ['$userId', '$anonymousId'] },
      completados: { $sum: { $cond: ['$completed', 1, 0] } },
    } },
  ]);

  const totalLeitores = porLeitor.length;
  if (totalLeitores === 0 || totalEpisodios === 0) {
    // "Sem episódios → componente 0" (spec) — também cobre o caso sem leitor.
    return { fracaoMedia: 0, totalLeitores };
  }

  const somaFracoes = porLeitor.reduce((acc, l) => acc + Math.min(1, l.completados / totalEpisodios), 0);
  return { fracaoMedia: somaFracoes / totalLeitores, totalLeitores };
}

/**
 * Percentual médio (33% da Retenção): média simples de `percent` de TODOS os
 * documentos de ReadingProgress da série — por DOCUMENTO, não por leitor
 * (diferente de Concluídos acima). Identidades logadas e anônimas entram
 * igual (spec, "Percentual médio").
 */
async function computePercentualMedio(seriesObjectId) {
  const resultado = await ReadingProgress.aggregate([
    { $match: { seriesId: seriesObjectId } },
    { $group: { _id: null, media: { $avg: '$percent' } } },
  ]);
  return resultado[0]?.media || 0;
}

/**
 * Outro dia (22% da Retenção): fração de leitores cuja atividade na série
 * "abrange mais de um dia distinto" — a spec chama isso de PROXY (não temos
 * sessão/tempo real, só os timestamps do próprio ReadingProgress). Duas
 * aproximações, QUALQUER uma basta para contar o leitor:
 *   (a) o leitor tem 2+ documentos (episódios) com `createdAt` em dias
 *       civis diferentes — voltou noutro dia para OUTRO episódio;
 *   (b) um único documento cujo `updatedAt` cai num dia civil diferente do
 *       `createdAt` — voltou noutro dia para o MESMO episódio (retomou a
 *       leitura).
 * Dia civil = string `%Y-%m-%d` em UTC (`$dateToString` default), consistente
 * com o resto do backend (sem fuso de usuário disponível aqui).
 */
async function computeFracaoOutroDia(seriesObjectId) {
  const resultado = await ReadingProgress.aggregate([
    { $match: { seriesId: seriesObjectId } },
    { $project: {
      identidade: { $ifNull: ['$userId', '$anonymousId'] },
      diaCriacao: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      diaAtualizacao: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
    } },
    { $group: {
      _id: '$identidade',
      dias: { $addToSet: '$diaCriacao' },
      temDivergencia: { $max: { $cond: [{ $ne: ['$diaCriacao', '$diaAtualizacao'] }, 1, 0] } },
    } },
    { $project: {
      outroDia: { $cond: [{ $or: [{ $gt: [{ $size: '$dias' }, 1] }, { $eq: ['$temDivergencia', 1] }] }, 1, 0] },
    } },
    { $group: { _id: null, total: { $sum: 1 }, comOutroDia: { $sum: '$outroDia' } } },
  ]);
  const total = resultado[0]?.total || 0;
  const comOutroDia = resultado[0]?.comOutroDia || 0;
  return total > 0 ? comOutroDia / total : 0;
}

/**
 * Retenção (0–25 pts, Etapa 3 do PDF, redistribuição 45/33/22 — ver
 * constantes no topo do arquivo). Diferente da Qualidade: cada sub-métrica
 * já é 0–1 NATURAL (fração/média), então NÃO normaliza pelo catálogo — na
 * spec, a decisão "Proporcionalidade (Etapa 2)" amarra a normalização por
 * catálogo apenas à Qualidade; frações de conclusão/percentual já têm
 * escala própria e comparável entre obras.
 *
 * `serie` precisa só de `_id` (doc do Mongoose ou objeto lean/simples
 * funcionam — mesmo contrato de computeQualidade).
 */
async function computeRetencao(serie) {
  const seriesObjectId = new mongoose.Types.ObjectId(serie._id);

  const [totalEpisodios, percentualMedioComponente, outroDiaComponente] = await Promise.all([
    Episode.countDocuments({ seriesId: seriesObjectId, status: 'published' }),
    computePercentualMedio(seriesObjectId),
    computeFracaoOutroDia(seriesObjectId),
  ]);
  // Concluídos depende de totalEpisodios (denominador) — sequencial após o
  // count acima de propósito, para não duplicar a query de leitores únicos.
  const { fracaoMedia: concluidosComponente, totalLeitores } = await computeConcluidosPorLeitor(seriesObjectId, totalEpisodios);

  const retencao = (
    concluidosComponente * PESO_CONCLUIDOS
    + percentualMedioComponente * PESO_PERCENTUAL_MEDIO
    + outroDiaComponente * PESO_OUTRO_DIA
  ) * ESCALA_RETENCAO;

  return {
    retencao,
    leitoresUnicos: totalLeitores,
    metricas: { concluidosComponente, percentualMedioComponente, outroDiaComponente, totalEpisodios },
  };
}

/** `retencao` já em 0–25 (não fração) — compara direto contra o limiar em pts. */
function retencaoEhBaixa(retencao) {
  return retencao < LIMIAR_RETENCAO_BAIXA * ESCALA_RETENCAO;
}

function abandonoEhRapido(fracaoPresos) {
  return fracaoPresos >= LIMIAR_ABANDONO_RAPIDO;
}

/**
 * `diasSemCapitulo` pode ser `Infinity` (série sem NENHUM episódio publicado
 * — nunca houve "capítulo novo", então trivialmente já passou de 60 dias
 * dele). `temEngajamentoRecente` é um booleano SIMPLES aqui de propósito —
 * "recente" já foi decidido por quem chamou (qualquer EngagementEvent não
 * flagged da série conta como sinal de vida, sem outra janela de data — a
 * spec só define a janela de 60 dias para o capítulo, não para o
 * engajamento).
 */
function estaInativa(diasSemCapitulo, temEngajamentoRecente) {
  return diasSemCapitulo > DIAS_INATIVIDADE && !temEngajamentoRecente;
}

/**
 * Abandono rápido (Etapa 9): fração de leitores cujos documentos de
 * ReadingProgress na série TODOS resolvem para `episode_number === 1` (via
 * $lookup em Episode) E cujo percent médio nesse(s) documento(s) é menor que
 * `LIMIAR_PERCENT_ABANDONO`. `episodeId` que não resolve para nenhum Episode
 * real (apagado, ou dado de teste sem Episode correspondente) vira `null` no
 * `$ifNull` — `null !== 1` derruba a checagem "todos episódio 1" de
 * propósito (sem Episode real para confirmar, não afirmamos que o leitor
 * ficou preso no capítulo 1).
 */
async function computeFracaoAbandono(seriesObjectId, totalLeitores) {
  if (!totalLeitores) return 0;

  const porLeitor = await ReadingProgress.aggregate([
    { $match: { seriesId: seriesObjectId } },
    { $lookup: { from: 'episodes', localField: 'episodeId', foreignField: '_id', as: 'episodio' } },
    { $unwind: { path: '$episodio', preserveNullAndEmptyArrays: true } },
    { $project: {
      identidade: { $ifNull: ['$userId', '$anonymousId'] },
      numeroEpisodio: { $ifNull: ['$episodio.episode_number', null] },
      percent: 1,
    } },
    { $group: {
      _id: '$identidade',
      numeros: { $addToSet: '$numeroEpisodio' },
      percentMedio: { $avg: '$percent' },
    } },
  ]);

  const presos = porLeitor.filter((l) => l.numeros.length === 1 && l.numeros[0] === 1 && l.percentMedio < LIMIAR_PERCENT_ABANDONO);
  return presos.length / totalLeitores;
}

/**
 * Inatividade (Etapa 9): dias desde o Episode PUBLICADO mais recente da
 * série e se existe QUALQUER EngagementEvent não-flagged da série (P4 do
 * ledger: flagged nunca conta como atividade — nem aqui).
 *
 * RULING do fim da T3 (ledger, achado MÉDIO): sem NENHUM episódio publicado,
 * "dias sem capítulo" não pode ser `Infinity` trivial — isso penalizaria
 * toda obra nova vazia só por ainda não ter capítulo, independente da idade
 * da PRÓPRIA obra. Sem episódio, usamos a idade da série (agora −
 * `Series.createdAt`) como proxy de "dias sem capítulo": uma obra
 * recém-criada sem capítulo ainda não teve tempo de ser abandonada; uma
 * obra antiga (>60 dias de existência) que nunca publicou nada É abandono
 * real. `estaInativa` abaixo continua EXATAMENTE igual — só este valor de
 * entrada muda — então o teste "engajamento recente sempre blinda" da T3
 * permanece válido nos dois casos (com ou sem episódio).
 *
 * `serie` precisa de `.createdAt` (mesmo contrato de computeQualidade/
 * computeRetencao — doc do Mongoose ou objeto lean/simples funcionam).
 */
async function coletarSinaisInatividade(serie, seriesObjectId, agora) {
  const [episodioRecente, engajamentoRecente] = await Promise.all([
    Episode.findOne({ seriesId: seriesObjectId, status: 'published' }).sort({ createdAt: -1 }).select('createdAt').lean(),
    EngagementEvent.findOne({ seriesId: seriesObjectId, flagged: false }).select('_id').lean(),
  ]);
  const diasSemCapitulo = episodioRecente
    ? (agora.getTime() - episodioRecente.createdAt.getTime()) / (24 * 60 * 60 * 1000)
    : (agora.getTime() - serie.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  return { diasSemCapitulo, temEngajamentoRecente: Boolean(engajamentoRecente) };
}

/**
 * Determina QUAIS penalizações (Etapa 9) se aplicam a uma série — lista de
 * códigos, pronta para gravar em `SeriesScore.penalizacoes`. Puramente
 * "qual dispara": a APLICAÇÃO numérica dos multiplicadores é
 * `aplicarPenalizacoesNaSoma` (função pura, separada) — a Task 4 vai chamá-la
 * sobre a soma completa Q+R+D antes de reescalar para 0–100.
 *
 * `retencao`/`leitoresUnicos` vêm de `computeRetencao(serie)` — passados
 * pelo chamador (computeSeriesScore já os calcula) para não repetir as
 * agregações.
 *
 * "Obra sem NENHUM leitor: não penalize por retenção/abandono" (spec) —
 * sem `ReadingProgress` não há dado de comportamento real para julgar
 * (retenção zerada por FALTA de dado é diferente de retenção zerada por
 * leitores que abandonaram de fato); inatividade independe de leitor (é
 * sobre publicação/engajamento) e continua se aplicando.
 */
async function computePenalizacoes(serie, { agora = new Date(), retencao, leitoresUnicos }) {
  const seriesObjectId = new mongoose.Types.ObjectId(serie._id);
  const penalizacoes = [];

  if (leitoresUnicos > 0) {
    if (retencaoEhBaixa(retencao)) penalizacoes.push('retencao_baixa');

    const fracaoPresos = await computeFracaoAbandono(seriesObjectId, leitoresUnicos);
    if (abandonoEhRapido(fracaoPresos)) penalizacoes.push('abandono_rapido');
  }

  const { diasSemCapitulo, temEngajamentoRecente } = await coletarSinaisInatividade(serie, seriesObjectId, agora);
  if (estaInativa(diasSemCapitulo, temEngajamentoRecente)) penalizacoes.push('inatividade');

  return penalizacoes;
}

/**
 * Aplica os multiplicadores das penalizações JÁ DETERMINADAS sobre uma soma
 * pré-escala (hoje: Q+R da Task 3; na Task 4, Q+R+D completo) — função PURA,
 * sem I/O, para a Task 4 plugar direto na composição final antes de
 * reescalar para 0–100. Multiplicadores compostos (Etapa 9: "duas
 * penalizações = dois ×") multiplicam entre si; piso de 20% do valor
 * pré-penalização nunca é furado (`Math.max` no final).
 *
 * Com os 3 códigos reais de hoje o produto mínimo é 61,2%
 * (0,80×0,85×0,90) — o piso nunca é alcançado na prática atual (ver
 * constante PISO_PENALIZACAO acima); a função aceita qualquer lista de
 * códigos (inclusive repetidos) para o piso ser testável isoladamente.
 */
function aplicarPenalizacoesNaSoma(somaPreEscala, penalizacoes) {
  const multiplicadorComposto = penalizacoes.reduce(
    (acc, codigo) => acc * (MULTIPLICADORES_PENALIZACAO[codigo] ?? 1),
    1,
  );
  const posPenalizacao = somaPreEscala * multiplicadorComposto;
  const piso = somaPreEscala * PISO_PENALIZACAO;
  return Math.max(posPenalizacao, piso);
}

// Descoberta (Etapa 6 do PDF). Fronteiras — o PDF só dá as faixas; qual lado
// é inclusive é decisão nossa, documentada e testada dos dois lados (ledger):
// idade EXATA de 30/60/90 dias ainda pontua na faixa de CIMA (mais pontos);
// só o dia seguinte cai pra faixa de baixo.
const DIAS_DESCOBERTA_RECENTE = 30; // idade <= 30 dias — INCLUSIVE
const PONTOS_DESCOBERTA_RECENTE = 10;
const DIAS_DESCOBERTA_MEDIA = 60; // idade <= 60 dias — INCLUSIVE
const PONTOS_DESCOBERTA_MEDIA = 7;
const DIAS_DESCOBERTA_ANTIGA = 90; // idade <= 90 dias — INCLUSIVE
const PONTOS_DESCOBERTA_ANTIGA = 4;
const ESCALA_DESCOBERTA = 10; // pts máximos da Descoberta dentro dos 100 do PDF

/**
 * Descoberta (0–10 pts, Etapa 6 do PDF): bônus de "novidade" — quanto mais
 * nova a obra, mais pontos. Idade = agora − `Series.createdAt`, em dias
 * corridos (fronteiras documentadas nas constantes acima).
 *
 * `serie` só precisa de `.createdAt` (mesmo contrato de computeQualidade/
 * computeRetencao); `agora` é SEMPRE injetado pelo chamador (regra do
 * ledger). Função síncrona/pura — sem I/O, já recebe `serie` pronto.
 */
function computeDescoberta(serie, agora) {
  const idadeDias = (agora.getTime() - serie.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (idadeDias <= DIAS_DESCOBERTA_RECENTE) return PONTOS_DESCOBERTA_RECENTE;
  if (idadeDias <= DIAS_DESCOBERTA_MEDIA) return PONTOS_DESCOBERTA_MEDIA;
  if (idadeDias <= DIAS_DESCOBERTA_ANTIGA) return PONTOS_DESCOBERTA_ANTIGA;
  return 0;
}

// Peso interno do Potential Score (Etapa 7 do PDF, confirmado pelo cliente).
// Escala PRÓPRIA de 0–100 — não soma com os 65 pts da "parte por obra".
const PESO_POTENTIAL_LIKES = 0.25;
const PESO_POTENTIAL_FAVORITOS = 0.25;
const PESO_POTENTIAL_SUPER_READER = 0.30;
const PESO_POTENTIAL_RETENCAO = 0.20;
const ESCALA_POTENTIAL = 100;

/**
 * Potential Score (0–100 pts, Etapa 7 do PDF): Likes/leitor 25% · Favoritos/
 * leitor 25% · Super Reader/leitor 30% · Retenção 20%. As 3 primeiras taxas
 * são as MESMAS métricas por-leitor-único da Qualidade — `computeMetricasBrutas`
 * já aplica o gate de "ação real de leitor" (achado ALTO da T2: favorito/
 * like só conta de quem também leu a obra) — normalizadas pelo mesmo
 * `contexto` (máximo do content_type, ver `buildQualidadeContexto`). A
 * Retenção entra como a FRAÇÃO 0–1 já calculada por `computeRetencao`
 * (`retencaoPontos / ESCALA_RETENCAO`) — não normaliza pelo catálogo (mesma
 * decisão da Retenção em si: "retenção é absoluta por natureza").
 *
 * NÃO inclui Releituras — o Potential do PDF só tem estas 4 componentes (3
 * taxas + retenção), diferente da Qualidade que tem 4 (SR/Fav/Likes/
 * Releituras).
 *
 * `serie` precisa de `_id` e `content_type`; `contexto` vem de
 * `buildQualidadeContexto()` (mesmo contrato de computeQualidade — sem
 * contexto ou tipo ausente, normalização cai para 0, nunca NaN/Infinity);
 * `retencaoPontos` é o `.retencao` (0–25) já calculado por `computeRetencao`
 * para a MESMA série (evita recalcular a agregação de Retenção aqui).
 */
async function computePotential(serie, contexto = {}, retencaoPontos = 0) {
  const metricas = await computeMetricasBrutas(serie._id);
  const max = contexto[serie.content_type] || {};
  const normalizar = (valor, maximo) => (maximo > 0 ? valor / maximo : 0);

  const likesNorm = normalizar(metricas.likesPorLeitor, max.likesPorLeitor);
  const favoritosNorm = normalizar(metricas.favoritosPorLeitor, max.favoritosPorLeitor);
  const superReaderNorm = normalizar(metricas.superReaderPorLeitor, max.superReaderPorLeitor);
  const retencaoFracao = retencaoPontos / ESCALA_RETENCAO;

  return (
    likesNorm * PESO_POTENTIAL_LIKES
    + favoritosNorm * PESO_POTENTIAL_FAVORITOS
    + superReaderNorm * PESO_POTENTIAL_SUPER_READER
    + retencaoFracao * PESO_POTENTIAL_RETENCAO
  ) * ESCALA_POTENTIAL;
}

// "Meia-confiança" em 20 leitores únicos (spec, Confidence Score — Etapa 12).
const K_CONFIDENCE = 20;

/**
 * Confidence (0–1, Etapa 12 do PDF): `n/(n+K)` — quanto mais leitores
 * únicos, mais "confiável" o score da obra. NÃO altera `scoreFinal` nem
 * `potentialScore` (spec) — persistido só para a Task 6 usar na ORDENAÇÃO da
 * recomendação (`parteDaObra×confidence + afinidade`). `n=0` → 0 (sem leitor,
 * sem confiança nenhuma); `n=K` → 0,5 (meia-confiança, por definição de K);
 * monotônica crescente em n (mais leitores nunca reduz a confiança); nunca
 * atinge 1 (assíntota), mesmo com n muito maior que K.
 */
function computeConfidence(leitoresUnicos) {
  return leitoresUnicos / (leitoresUnicos + K_CONFIDENCE);
}

// "Parte por obra" da spec: Qualidade 30 + Retenção 25 + Descoberta 10 = 65
// pts pré-computados e persistidos (Afinidade 25 e Diversidade 10 entram só
// no request de recomendação da Task 6 — fora do SeriesScore).
const ESCALA_SOMA_OBRA = ESCALA_QUALIDADE + ESCALA_RETENCAO + ESCALA_DESCOBERTA;

/**
 * Composição final: reescala a "parte por obra" (0–65) para 0–100. Soma
 * crua = qualidade + retenção + descoberta; as penalizações (Etapa 9,
 * `aplicarPenalizacoesNaSoma` — multiplicador composto, piso de 20%) atuam
 * SOBRE essa soma crua, ANTES de reescalar — nunca depois.
 * `scoreFinal = (somaPosPenalizacao/65)×100`.
 *
 * Função PURA — sem I/O — testável isoladamente com componentes conhecidos.
 * A ORDENAÇÃO da recomendação (Task 6) usa os componentes CRUS (65 pts +
 * afinidade 25), não este valor reescalado — ele é só para exibição/painel/
 * a escala 0–100 do PDF (spec, "Modelo SeriesScore").
 */
function computeScoreFinal(qualidade, retencao, descoberta, penalizacoes) {
  const somaCrua = qualidade + retencao + descoberta;
  const somaPosPenalizacao = aplicarPenalizacoesNaSoma(somaCrua, penalizacoes);
  return (somaPosPenalizacao / ESCALA_SOMA_OBRA) * 100;
}

/**
 * Grava em SeriesScore TODOS os campos calculáveis sem o contexto do leitor
 * — qualidade, retenção, descoberta, penalizações, potentialScore,
 * confidence, scoreFinal, leitoresUnicos, contentType, computedAt (spec,
 * "Modelo SeriesScore"). Upsert idempotente (1 doc por série).
 *
 * `contexto` é opcional — se não vier (chamada avulsa, fora de uma
 * varredura), constrói o próprio via `buildQualidadeContexto()`;
 * `computeAllScores` calcula uma vez e passa para cada chamada, evitando
 * recalcular o catálogo inteiro a cada série.
 *
 * `agora` é sempre injetável (regra do ledger: datas SEMPRE injetáveis) —
 * vira `computedAt`, alimenta a Descoberta e a checagem de inatividade das
 * penalizações.
 */
async function computeSeriesScore(seriesId, { agora = new Date(), contexto } = {}) {
  const serie = await Series.findById(seriesId).lean();
  if (!serie) {
    const erro = new Error('Série não encontrada.');
    erro.status = 404;
    throw erro;
  }

  const ctx = contexto || await buildQualidadeContexto();
  const { qualidade } = await computeQualidade(serie, ctx);
  const { retencao, leitoresUnicos } = await computeRetencao(serie);
  const descoberta = computeDescoberta(serie, agora);
  const penalizacoes = await computePenalizacoes(serie, { agora, retencao, leitoresUnicos });
  const potentialScore = await computePotential(serie, ctx, retencao);
  const confidence = computeConfidence(leitoresUnicos);
  const scoreFinal = computeScoreFinal(qualidade, retencao, descoberta, penalizacoes);

  return SeriesScore.findOneAndUpdate(
    { seriesId },
    {
      $set: {
        contentType: serie.content_type,
        qualidade,
        retencao,
        descoberta,
        scoreFinal,
        potentialScore,
        confidence,
        leitoresUnicos,
        penalizacoes,
        computedAt: agora,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Varre todas as séries publicadas e chama `computeSeriesScore` para cada
 * uma, reaproveitando UM contexto de normalização para a varredura inteira
 * (Etapa 2 do PDF: "calculado uma vez por varredura"). Sequencial de
 * propósito — o catálogo é pequeno (spec, "Fora de escopo": cache/paginação
 * da recomendação não é necessário nesta escala) e evita disparar N queries
 * em paralelo contra o Mongo.
 *
 * Erro em UMA série NÃO para a varredura (spec, "Recálculo — Etapa 11"): a
 * varredura geral (timer 24h/boot) não pode travar por causa de uma série em
 * estado inconsistente. Loga via `utils/logger` e segue para a próxima;
 * devolve o resumo `{ total, erros }` (total = séries publicadas varridas,
 * erros = quantas falharam) para o chamador decidir se precisa de um alerta
 * maior.
 */
async function computeAllScores({ agora = new Date() } = {}) {
  const contexto = await buildQualidadeContexto();
  const series = await Series.find({ isPublished: true }, '_id').lean();

  let erros = 0;
  for (const s of series) {
    try {
      await computeSeriesScore(s._id, { agora, contexto });
    } catch (erro) {
      erros += 1;
      logger.error(`[Recomendacao] Falha ao computar SeriesScore da serie ${s._id}: ${erro && erro.message}`);
    }
  }
  return { total: series.length, erros };
}

/**
 * Task 5 (spec, "Recálculo — Etapa 11"): gatilhos fire-and-forget nas rotas
 * existentes recalculam A OBRA (não o catálogo inteiro) sempre que um sinal
 * forte acontece — voto, favorito, Super Reader, conclusão de leitura,
 * capítulo publicado. MESMO MOLDE do disparo de push do Bloco 2
 * (routes/content.js, `notifyEpisodePublished(...).catch(err => logger.error(...))`):
 * um wrapper único aqui evita repetir o `.catch` em ~10 pontos de disparo e
 * carimba a ORIGEM no log, para o painel de erros dizer qual gatilho falhou.
 *
 * NUNCA lança — a promise devolvida por `computeSeriesScore` é sempre
 * "resolvida" do ponto de vista do chamador (o `.catch` interno absorve o
 * erro); a rota que disparou o recálculo não é afetada de forma alguma,
 * mesmo se o recálculo falhar.
 */
function dispararRecalculo(seriesId, origem) {
  computeSeriesScore(seriesId).catch((erro) => {
    logger.error(`[Algoritmo] Recalculo falhou (${origem})`, erro && erro.message);
  });
}

// Varredura geral (spec, "Recálculo — Etapa 11"): "varredura geral a cada
// 24h + no boot se houver série publicada sem score OU com score >24h".
const VARREDURA_INTERVALO_MS = 24 * 60 * 60 * 1000;

// Handle do setInterval — módulo-level de propósito: iniciarVarreduraPeriodica
// precisa ser IDEMPOTENTE (chamadas repetidas não empilham timers, ex.: um
// reload de módulo em dev, ou um teste que chama duas vezes por engano).
let timerVarredura = null;

/**
 * "Cheque barato" (spec) antes de decidir se o BOOT precisa rodar
 * `computeAllScores()` — não varre o catálogo inteiro só para decidir se vai
 * varrer o catálogo inteiro. Devolve `true` se existir QUALQUER série
 * publicada cujo SeriesScore esteja AUSENTE (nunca calculado) OU VELHO
 * (`computedAt` mais antigo que `VARREDURA_INTERVALO_MS`).
 *
 * Implementação: `seriesComScoreRecente` é o conjunto de seriesId com score
 * DENTRO da janela de 24h — uma série publicada que não aparece nesse
 * conjunto está, por definição, sem score OU com score velho (as duas
 * condições da spec, num único `$nin`). Dois index scans baratos (distinct +
 * exists), nunca um cálculo por série — essa parte cara é `computeAllScores`
 * em si, chamada só se isto devolver `true`.
 *
 * `agora` é sempre injetável (regra do ledger: datas SEMPRE injetáveis).
 */
async function precisaVarreduraInicial(agora = new Date()) {
  const limite = new Date(agora.getTime() - VARREDURA_INTERVALO_MS);
  const seriesComScoreRecente = await SeriesScore.distinct('seriesId', { computedAt: { $gte: limite } });
  const faltando = await Series.exists({ isPublished: true, _id: { $nin: seriesComScoreRecente } });
  return Boolean(faltando);
}

/**
 * Liga a varredura periódica de 24h (`computeAllScores`, com catch+log —
 * NUNCA lança) e, se houver série publicada sem score ou com score velho
 * (`precisaVarreduraInicial`), dispara também uma varredura inicial no BOOT
 * (fire-and-forget, não bloqueia o retorno desta função).
 *
 * Guardas (spec + ledger):
 *  - `NODE_ENV === 'test'` → no-op. Sem isto, TODO arquivo de teste que faz
 *    `require('server')` (são ~14 hoje) ganharia um `setInterval` de 24h
 *    real rodando em paralelo com a suíte — o memory-server nem sobrevive
 *    24h, mas o timer ficaria "vazando" (processo do vitest não fecha
 *    limpo) e o boot chamaria `computeAllScores()` sobre um catálogo de
 *    teste a cada arquivo, sem nenhum valor para a suíte.
 *  - Idempotente: `timerVarredura` já setado → retorna sem criar outro
 *    `setInterval` (a checagem acontece ANTES do primeiro `await` da
 *    função, então duas chamadas em sequência — mesmo sem `await` entre
 *    elas — nunca duplicam o timer).
 *  - `.unref()` no timer: não segura o processo vivo sozinho (mesmo padrão
 *    de timers de infraestrutura do Node) — se o resto do app encerrar, a
 *    varredura periódica não impede o processo de sair.
 */
async function iniciarVarreduraPeriodica() {
  if (process.env.NODE_ENV === 'test') return; // ver docstring acima
  if (timerVarredura) return; // idempotente — ver docstring acima

  timerVarredura = setInterval(() => {
    computeAllScores().catch((erro) => logger.error('[Algoritmo] Varredura periodica (24h) falhou', erro && erro.message));
  }, VARREDURA_INTERVALO_MS);
  if (typeof timerVarredura.unref === 'function') timerVarredura.unref();

  const precisaRodarAgora = await precisaVarreduraInicial();
  if (precisaRodarAgora) {
    computeAllScores().catch((erro) => logger.error('[Algoritmo] Varredura inicial (boot) falhou', erro && erro.message));
  }
}

/** Higiene (testes, restart controlado): desliga a varredura periódica. No-op se não estiver ligada. */
function pararVarreduraPeriodica() {
  if (timerVarredura) {
    clearInterval(timerVarredura);
    timerVarredura = null;
  }
}

module.exports = {
  contarLeitoresUnicos,
  buildQualidadeContexto,
  computeQualidade,
  computeRetencao,
  computePenalizacoes,
  retencaoEhBaixa,
  abandonoEhRapido,
  estaInativa,
  aplicarPenalizacoesNaSoma,
  computeDescoberta,
  computePotential,
  computeConfidence,
  computeScoreFinal,
  computeSeriesScore,
  computeAllScores,
  dispararRecalculo,
  precisaVarreduraInicial,
  iniciarVarreduraPeriodica,
  pararVarreduraPeriodica,
};
