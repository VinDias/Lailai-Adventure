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
 * Task 5: gatilhos fire-and-forget de recálculo por obra (`dispararRecalculo`,
 * mesmo molde do push do Bloco 2) e a varredura periódica de 24h + inicial no
 * boot (`iniciarVarreduraPeriodica`/`pararVarreduraPeriodica`) — ver
 * comentários de cada função. As rotas que disparam `dispararRecalculo` estão
 * listadas na spec, seção "Rotas".
 *
 * Task 6 (este commit): junta tudo — Afinidade por leitor (`computeAffinityProfile`
 * + `computeAfinidade`, 0–25 pts, calculada NO REQUEST, NÃO persistida) e
 * `buildRecommendations` (Etapa 10: distribuição 50/30/20 + Etapa 12: efeito
 * do Confidence na ordenação + Etapa 8: diversidade). Ver comentários de cada
 * função na seção "Task 6" abaixo, perto do fim do arquivo.
 *
 * Fix round da revisão final do Bloco 4 (4 achados, rulings fechados):
 *   A1 (ALTO) — `computeMetricasBrutas`: denominador da Qualidade/Potential
 *     passa de `leitoresUnicos` (logados+anônimos) para `leitoresLogados`,
 *     mesma população dos numeradores (que já eram estruturalmente
 *     só-logados). `leitoresUnicos` continua persistido/usado no Confidence.
 *   A2 (ALTO) — `computeNeutroDerivado`/`buildRecommendations`: neutro da
 *     Afinidade de obra SEM tags deixa de ser 12,5 fixo e passa a ser a
 *     MÉDIA das afinidades das obras COM tags do mesmo request.
 *   M1 (MÉDIO) — `temaForte`/`conflitoAdjacente`/`aplicarDiversidade`: a 4ª
 *     regra de diversidade do PDF ("alternar temas e estilos") entra no
 *     passe, junto com o canal adjacente.
 *   M2 (MÉDIO, este commit) — `buildQualidadeContexto`/`metricasComReuso`: o
 *     contexto de normalização devolve também `porSerie` (métricas já
 *     calculadas de toda obra do tipo), reusado por
 *     `computeQualidade`/`computePotential` em vez de recomputar a própria
 *     série.
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
 * Métricas brutas (por leitor, ainda SEM normalizar pelo catálogo) das 4
 * componentes da Qualidade. Privada — usada tanto por `buildQualidadeContexto`
 * (para achar o máximo do content_type) quanto por `computeQualidade`/
 * `computePotential` (para o valor da própria série), garantindo que todas
 * contam do mesmo jeito.
 *
 * FIX ROUND da revisão final do Bloco 4 (achado ALTO A1): o denominador das 4
 * taxas abaixo é `leitoresLogados` (`leitoresUserIds.length`) — NÃO
 * `leitoresUnicos` (logados+anônimos). Motivo: os numeradores são
 * ESTRUTURALMENTE só-logados — Favorito e Like exigem `userId` (gate da T2,
 * abaixo) e o próprio schema; Super Reader exige `userId` real no checkout
 * (anonimizado perde o vínculo); releituras já contam por `userId` do
 * `EngagementEvent`. Dividir numerador só-logado por um denominador que
 * inclui visitantes anônimos (progresso grátis, sem token) dilui a taxa por
 * PURO volume de visita, sem nenhuma ação real correspondente — medido na
 * revisão: uma obra com 27 visitantes anônimos a mais que uma obra idêntica
 * em comportamento logado levava 10× de penalização, uma realimentação
 * negativa orgânica (mais gente abre a obra → métrica de qualidade CAI).
 * `leitoresUnicos` (logados+anônimos) CONTINUA sendo devolvido aqui e é o
 * valor PERSISTIDO no `SeriesScore.leitoresUnicos` e usado no Confidence
 * Score (Etapa 12) — esse cálculo não muda, ele é sobre "quantas identidades
 * geraram sinal de leitura", não sobre a proporção interna da Qualidade.
 * Retenção (`computeRetencao`) também NÃO muda — lá cada sub-métrica já
 * inclui anônimos em numerador E denominador de forma consistente (o
 * documento de `ReadingProgress` inteiro é a unidade, não uma ação
 * exclusiva de logado), populações compatíveis desde o início.
 *
 * Este fix fecha, de fato, A MAIOR PARTE da DÍVIDA registrada no fim da T2
 * (ledger): "diluição do denominador via ReadingProgress ANÔNIMO grátis" (um
 * atacante inflava o denominador de um RIVAL só com progresso anônimo —
 * grátis, sem passar pelo `accountLimiter` — sem precisar de nenhuma ação
 * adicional). Numericamente: SR (peso 45%) + Favoritos (25%) + Likes (20%)
 * = 90% do peso interno da Qualidade tinham numerador gateado a uma AÇÃO
 * real e adicional (pagar/favoritar/curtir) mas, até este fix, DIVIDIDOS por
 * um denominador que qualquer visitante inflava de graça — essa fatia
 * (90%) deixa de ser diluível por progresso anônimo puro. Releituras (10%
 * restante) mede reincidência de LEITURA em si, não uma ação adicional
 * separada — o vetor residual ali é falsificar CONTAS logadas relendo
 * (mitigado pelo `accountLimiter` da T2, não por este fix), não progresso
 * anônimo — por isso fica de fora do "fecha a dívida" e a dívida original
 * segue registrada (agora só para esse resíduo).
 *
 * Leitores logados 0 → todas as métricas 0 (sem divisão por zero) — mesmo
 * com leitores anônimos existindo (eles não geram numerador algum nas 4
 * métricas gateadas/reader-based, então a taxa é honestamente 0, não
 * indefinida).
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
  const leitoresLogados = leitoresUserIds.length;

  if (leitoresLogados === 0) {
    return {
      leitoresUnicos,
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
    superReaderPorLeitor: superReaderCount / leitoresLogados,
    favoritosPorLeitor: favoritosCount / leitoresLogados,
    likesPorLeitor: likesLiquidos / leitoresLogados,
    releiturasPorLeitor: releiturasCount / leitoresLogados,
  };
}

/**
 * Contexto de normalização: para cada `content_type`, o MÁXIMO de cada
 * métrica (por leitor logado — Item 1 do fix round) entre as séries
 * PUBLICADAS daquele tipo. Calculado UMA vez por varredura —
 * `computeAllScores` chama isto uma única vez e passa o resultado para cada
 * `computeSeriesScore`, evitando recalcular o catálogo inteiro série por
 * série.
 *
 * Assinatura escolhida: sem parâmetros, sempre varre `Series` publicadas do
 * banco. Devolve `{ [contentType]: { superReaderPorLeitor, favoritosPorLeitor,
 * likesPorLeitor, releiturasPorLeitor }, porSerie: { [seriesId]: metricas } }`
 * — máximo 0 quando nenhuma série do tipo tem aquela métrica > 0 ainda
 * (computeQualidade trata max 0 como "sem normalização possível", componente
 * fica 0, nunca NaN/Infinity).
 *
 * FIX ROUND da revisão final do Bloco 4 (Item 4, M2): `porSerie` é NOVO —
 * este scan já chama `computeMetricasBrutas` para TODAS as séries do tipo
 * (pra achar o máximo); antes disso, `computeQualidade` e `computePotential`
 * IGNORAVAM esse trabalho e chamavam `computeMetricasBrutas` de NOVO, cada
 * uma, só pra própria série — 2 recomputações redundantes por série. Guardar
 * o mapa aqui deixa as duas reaproveitarem o que este scan já sabe (ver
 * `computeQualidade`/`computePotential` abaixo — chave é `String(seriesId)`,
 * igual ao resto do arquivo, ex. `scorePorSerie` em `buildRecommendations`).
 */
async function buildQualidadeContexto(contentType) {
  // A normalização é POR content_type (spec, "Proporcionalidade"): o máximo de
  // um tipo nunca entra na conta de outro. Um recálculo avulso (gatilho de
  // voto/favorito/etc.) só precisa dos máximos do tipo da própria série —
  // filtrar aqui corta a varredura de O(catálogo inteiro) para O(catálogo do
  // tipo) por gatilho, com resultado idêntico (achado da revisão da T8).
  // Sem argumento (varredura 24h/boot), varre tudo como antes.
  const filtro = { isPublished: true };
  if (contentType) filtro.content_type = contentType;
  const series = await Series.find(filtro, '_id content_type').lean();
  const porSerieCalculada = await Promise.all(series.map(async (s) => ({
    seriesId: String(s._id),
    contentType: s.content_type,
    metricas: await computeMetricasBrutas(s._id),
  })));

  const contexto = {};
  const porSerie = {};
  for (const { seriesId, contentType: tipo, metricas } of porSerieCalculada) {
    porSerie[seriesId] = metricas;
    if (!contexto[tipo]) {
      contexto[tipo] = {
        superReaderPorLeitor: 0, favoritosPorLeitor: 0, likesPorLeitor: 0, releiturasPorLeitor: 0,
      };
    }
    const max = contexto[tipo];
    max.superReaderPorLeitor = Math.max(max.superReaderPorLeitor, metricas.superReaderPorLeitor);
    max.favoritosPorLeitor = Math.max(max.favoritosPorLeitor, metricas.favoritosPorLeitor);
    max.likesPorLeitor = Math.max(max.likesPorLeitor, metricas.likesPorLeitor);
    max.releiturasPorLeitor = Math.max(max.releiturasPorLeitor, metricas.releiturasPorLeitor);
  }
  contexto.porSerie = porSerie;
  return contexto;
}

/**
 * Reusa `contexto.porSerie[seriesId]` (populado por `buildQualidadeContexto`
 * acima) quando presente — fix round Item 4 (M2): evita recomputar
 * `computeMetricasBrutas` da MESMA série que o contexto já calculou.
 * Fallback pra computar na hora quando ausente — chamadas AVULSAS de teste
 * que passam `{}` ou um contexto parcial continuam funcionando idêntico a
 * antes (compatibilidade, ruling explícito).
 */
async function metricasComReuso(serie, contexto) {
  const doContexto = contexto && contexto.porSerie && contexto.porSerie[String(serie._id)];
  return doContexto || computeMetricasBrutas(serie._id);
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
 * comportamento seguro, nunca NaN/Infinity. Reusa `contexto.porSerie` quando
 * presente (`metricasComReuso`, Item 4 do fix round) em vez de recomputar.
 */
async function computeQualidade(serie, contexto = {}) {
  const metricas = await metricasComReuso(serie, contexto);

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
 * para a MESMA série (evita recalcular a agregação de Retenção aqui). Reusa
 * `contexto.porSerie` quando presente (`metricasComReuso`, Item 4 do fix
 * round) em vez de recomputar `computeMetricasBrutas` da própria série.
 */
async function computePotential(serie, contexto = {}, retencaoPontos = 0) {
  const metricas = await metricasComReuso(serie, contexto);
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

  const ctx = contexto || await buildQualidadeContexto(serie.content_type);
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

// ============================================================================
// Task 6 — Afinidade por leitor + rota de recomendação (spec: "Afinidade
// (Etapa 4)", "Distribuição 50/30/20 (Etapa 10)", "Diversidade (Etapa 8)").
// ============================================================================

// Pesos das fontes da Afinidade (spec, "Afinidade (Etapa 4)"): favoritos ×3,
// Super Reader ×4 (só logado), likes de SeriesVote ×2 (só like — dislike NÃO
// soma), progresso de leitura ×1 (logado OU anônimo).
const PESO_AFINIDADE_FAVORITO = 3;
const PESO_AFINIDADE_SUPER_READER = 4;
const PESO_AFINIDADE_LIKE = 2;
const PESO_AFINIDADE_PROGRESSO = 1;
const ESCALA_AFINIDADE = 25; // pts máximos da Afinidade dentro dos 100 do PDF
const NEUTRO_AFINIDADE = ESCALA_AFINIDADE / 2; // "sem histórico → 12,5 pts neutros" (spec)

/**
 * Perfil de afinidade do leitor: histograma de TAGS, calculado NO REQUEST e
 * NUNCA PERSISTIDO (spec, decisão "Afinidade (Etapa 4)" — LGPD by design:
 * nada novo entra no export/exclusão do Centro de Privacidade porque é
 * derivado, na hora, de coleções que já são exportadas/apagadas por outros
 * fluxos do app).
 *
 * Cada fonte contribui o SEU peso para CADA tag de CADA série ENVOLVIDA —
 * série DISTINTA, não documento: um leitor com 5 documentos de progresso na
 * MESMA série conta essa série UMA vez, não 5×  (por isso usamos `.distinct`,
 * não `.find`, para achar as séries de cada fonte). As 4 fontes:
 *
 *  - Favoritos ×3 — `Favorite.userId` é obrigatório no schema (visitante
 *    anônimo não favorita), então esta fonte só roda com `userId`.
 *  - Super Reader ×4 — SÓ LOGADO (spec: "só logado; contribuição anonimizada
 *    não é rastreável"). `SuperReaderContribution.userId` vira `null` numa
 *    contribuição ANONIMIZADA (exclusão de conta, LGPD do Bloco 3) — filtrar
 *    por um `userId` real nunca bate com essas, então elas SIMPLESMENTE NÃO
 *    aparecem no perfil de ninguém (perdem o vínculo, não são "roubadas" por
 *    outro leitor por engano).
 *  - Likes de SeriesVote ×2 — filtro `type: 'like'` explícito; dislike é
 *    sinal NEGATIVO, não soma afinidade nenhuma.
 *  - Progresso de leitura ×1 — a ÚNICA fonte que também aceita `anonymousId`:
 *    mesmo mecanismo de identidade anônima do Bloco 1 (`utils/requestIdentity`,
 *    header `X-Anonymous-Id`, já usado por `routes/progress.js`) — qualquer
 *    documento de `ReadingProgress` da identidade (logada OU anônima) conta a
 *    série dele.
 *
 * Sem `userId` NEM `anonymousId`, ou com identidade mas SEM nenhum histórico
 * em nenhuma das 4 fontes: devolve `{}` (perfil vazio) — `computeAfinidade`
 * trata isso como "sem histórico" (12,5 pts neutros pra toda série).
 */
async function computeAffinityProfileCompleto({ userId, anonymousId } = {}) {
  const perfil = {};
  // Séries com QUALQUER interação do leitor (as mesmas 4 fontes do perfil) —
  // usadas pelo neutro derivado para excluir da média o que ele JÁ consumiu
  // (observação 1 da re-revisão final): as obras lidas são sistematicamente
  // as de maior afinidade (as tags delas estão no perfil justamente porque
  // foram lidas), então incluí-las inflava o neutro acima da melhor obra
  // AINDA NÃO lida em catálogos quase todo consumidos.
  const seriesConsumidas = new Set();
  const fontes = [];

  if (userId) {
    fontes.push({ model: Favorite, filtro: { userId }, peso: PESO_AFINIDADE_FAVORITO });
    fontes.push({ model: SuperReaderContribution, filtro: { userId }, peso: PESO_AFINIDADE_SUPER_READER });
    fontes.push({ model: SeriesVote, filtro: { userId, type: 'like' }, peso: PESO_AFINIDADE_LIKE });
  }
  if (userId || anonymousId) {
    const filtroProgresso = userId ? { userId } : { anonymousId };
    fontes.push({ model: ReadingProgress, filtro: filtroProgresso, peso: PESO_AFINIDADE_PROGRESSO });
  }

  for (const { model, filtro, peso } of fontes) {
    const seriesIds = await model.distinct('seriesId', filtro);
    if (!seriesIds.length) continue;
    for (const id of seriesIds) seriesConsumidas.add(String(id));
    const series = await Series.find({ _id: { $in: seriesIds } }, 'tags').lean();
    for (const serie of series) {
      for (const tag of serie.tags || []) {
        perfil[tag] = (perfil[tag] || 0) + peso;
      }
    }
  }

  return { perfil, seriesConsumidas };
}

/** Compatibilidade: quem só precisa do histograma (testes/chamadas avulsas). */
async function computeAffinityProfile(identidade = {}) {
  const { perfil } = await computeAffinityProfileCompleto(identidade);
  return perfil;
}

/**
 * Afinidade (0–25 pts, Etapa 4 do PDF): sobreposição normalizada entre as
 * tags da série e o perfil (histograma) do leitor.
 *
 * Sem perfil (objeto vazio — leitor sem NENHUM histórico em nenhuma das 4
 * fontes): 12,5 pts NEUTROS pra qualquer série (spec, "Afinidade (Etapa 4)").
 *
 * RULING (Task 6 — a spec delega explicitamente: "série SEM tags com perfil
 * existente... DECISÃO DA SPEC NÃO COBRE"): série SEM tags (`tags: []`,
 * acervo antigo ainda sem curadoria da Etapa 5) recebe o MESMO neutro (12,5),
 * MESMO com perfil existente. O vazio aqui é da CURADORIA da obra, não do
 * leitor — tratar como sobreposição 0 enterraria TODO o acervo antigo atrás
 * de qualquer obra já tagueada, por uma lacuna que não é culpa da obra.
 * Reportado ao ledger (.superpowers/sdd/2026-08-20-algoritmo/progress.md).
 *
 * Com perfil E série com tags: soma dos pesos do perfil nas tags da série
 * (`sobreposicao`), dividida pela soma TOTAL de pesos do perfil (0–1), vezes
 * 25. Se TODAS as tags do perfil aparecem na série, a fração é exatamente 1
 * (25 pts cheios); se nenhuma bate, a fração é 0.
 */
function computeAfinidade(serie, perfil = {}) {
  const temPerfil = perfil && Object.keys(perfil).length > 0;
  if (!temPerfil) return NEUTRO_AFINIDADE;

  const tags = (serie && serie.tags) || [];
  if (tags.length === 0) return NEUTRO_AFINIDADE; // RULING acima

  const somaTotal = Object.values(perfil).reduce((acc, peso) => acc + peso, 0);
  if (somaTotal <= 0) return NEUTRO_AFINIDADE; // blindagem — pesos são sempre > 0, não deveria ocorrer

  const sobreposicao = tags.reduce((acc, tag) => acc + (perfil[tag] || 0), 0);
  return (sobreposicao / somaTotal) * ESCALA_AFINIDADE;
}

// Distribuição 50/30/20 (Etapa 10 do PDF, spec "Distribuição 50/30/20").
const FRACAO_CONSOLIDADAS = 0.5;
const FRACAO_POTENCIAL = 0.3;
const DIAS_JANELA_NOVAS = 90;

/**
 * Cotas 50/30/20 (Etapa 10 do PDF): recebe as séries do catálogo do
 * content_type já ENRIQUECIDAS com `valorOrdenacao`/`potentialScore`/
 * `createdAt` (ver `buildRecommendations`) e devolve
 * `{ consolidadas, potencial, novas }` — SEM sobreposição (dedupe garantido
 * por construção: cada série entra em NO MÁXIMO uma cota, nunca duas).
 *
 * `consolidadas` = ceil(50% de N) melhores por `valorOrdenacao`.
 * `potencial` = ceil(30% de N) melhores por `potentialScore`, dentre as que
 * SOBRARAM depois de `consolidadas` — capado ao que sobrar (catálogo pequeno
 * não pode pedir mais do que existe; sem o `Math.min`, N pequeno faria
 * `consolidadas.length + potencial.length` estourar N).
 * `novas` = o QUE SOBRAR pra completar N (~20%): séries com `createdAt`
 * dentro dos últimos `DIAS_JANELA_NOVAS` dias (`agora` sempre injetado),
 * melhores por `valorOrdenacao` dentro dessa janela; se a janela não tiver
 * séries suficientes, COMPLETA com as melhores restantes por `valorOrdenacao`
 * SEM o filtro de data — degradação natural (spec: "se não houver novas
 * suficientes, complete com as melhores restantes").
 *
 * Exportada separadamente (mesmo padrão do resto do serviço — funções puras
 * testáveis isoladamente, ex.: `aplicarPenalizacoesNaSoma`) para os testes de
 * contagem por cota não dependerem de reconstruir o catálogo inteiro via
 * `buildRecommendations`.
 */
function montarCotas(seriesEnriquecidas, agora = new Date()) {
  const N = seriesEnriquecidas.length;
  const usados = new Set();

  const porValorDesc = [...seriesEnriquecidas].sort((a, b) => b.valorOrdenacao - a.valorOrdenacao);
  const countConsolidadas = Math.min(N, Math.ceil(N * FRACAO_CONSOLIDADAS));
  const consolidadas = porValorDesc.slice(0, countConsolidadas);
  consolidadas.forEach((s) => usados.add(String(s._id)));

  const disponiveisAposConsolidadas = seriesEnriquecidas.filter((s) => !usados.has(String(s._id)));
  const countPotencialAlvo = Math.min(Math.ceil(N * FRACAO_POTENCIAL), disponiveisAposConsolidadas.length);
  const potencial = [...disponiveisAposConsolidadas]
    .sort((a, b) => b.potentialScore - a.potentialScore)
    .slice(0, countPotencialAlvo);
  potencial.forEach((s) => usados.add(String(s._id)));

  const disponiveisAposPotencial = seriesEnriquecidas.filter((s) => !usados.has(String(s._id)));
  const countNovasAlvo = N - consolidadas.length - potencial.length;

  const limiteNovas = new Date(agora.getTime() - DIAS_JANELA_NOVAS * 24 * 60 * 60 * 1000);
  const candidatasDentroDaJanela = disponiveisAposPotencial
    .filter((s) => s.createdAt && s.createdAt.getTime() >= limiteNovas.getTime())
    .sort((a, b) => b.valorOrdenacao - a.valorOrdenacao);

  const novas = candidatasDentroDaJanela.slice(0, countNovasAlvo);
  novas.forEach((s) => usados.add(String(s._id)));

  // Degradação (spec): a janela de 90 dias não tinha candidatas suficientes
  // → completa com as melhores restantes por valorOrdenacao (mesmo critério
  // de "consolidadas" — isto não é uma 4ª cota, é o preenchimento natural
  // da 3ª quando o catálogo não tem obras novas o bastante).
  const faltam = countNovasAlvo - novas.length;
  if (faltam > 0) {
    const complemento = seriesEnriquecidas
      .filter((s) => !usados.has(String(s._id)))
      .sort((a, b) => b.valorOrdenacao - a.valorOrdenacao)
      .slice(0, faltam);
    novas.push(...complemento);
    complemento.forEach((s) => usados.add(String(s._id)));
  }

  return { consolidadas, potencial, novas };
}

/**
 * Intercala as 3 cotas (spec, "Diversidade (Etapa 8)": "intercalar cotas...
 * em vez de blocos") — consolidada[0], potencial[0], nova[0], consolidada[1],
 * potencial[1], nova[1]... A ordem INTERNA de cada cota (já ordenada por
 * `montarCotas`) é preservada; só a POSIÇÃO relativa ENTRE cotas intercala.
 * Cota mais curta simplesmente para de contribuir — sem furo no resultado.
 */
function intercalarCotas(consolidadas, potencial, novas) {
  const tamanho = Math.max(consolidadas.length, potencial.length, novas.length);
  const resultado = [];
  for (let i = 0; i < tamanho; i++) {
    if (consolidadas[i]) resultado.push(consolidadas[i]);
    if (potencial[i]) resultado.push(potencial[i]);
    if (novas[i]) resultado.push(novas[i]);
  }
  return resultado;
}

/**
 * Duas séries são do "mesmo canal" só se AMBAS tiverem `channelId` definido
 * e igual — `channelId` ausente (obra sem canal cadastrado) NUNCA conflita
 * com nada, mesmo com outra série também sem `channelId`: não há "mesmo
 * autor" real a proteger de repetição quando nenhum canal foi informado.
 */
function mesmoCanal(a, b) {
  if (!a.channelId || !b.channelId) return false;
  return String(a.channelId) === String(b.channelId);
}

/**
 * FIX ROUND da revisão final do Bloco 4 (achado MÉDIO M1): "tema forte"
 * entre duas obras — a 4ª regra do PDF ("alternar temas e estilos") que
 * faltava no passe de diversidade (só canal adjacente existia até aqui).
 *
 * Duas obras têm tema forte só se AMBAS tiverem tags — obra sem tags (acervo
 * sem curadoria) NUNCA conflita por tema, mesmo adjacente a outra sem tags
 * (mesmo espírito do `mesmoCanal`: sem dado, sem conflito) — E a
 * INTERSEÇÃO de tags for MAIOR que 50% do MENOR conjunto de tags das duas.
 * "Menor conjunto" de propósito: uma obra com poucas tags (ex.: 5) e outra
 * com muitas (ex.: 15) — se 3 das 5 tags da primeira (60%) aparecem também
 * na segunda, as duas são tematicamente próximas o bastante pra conflitar,
 * MESMO que 3/15 (20%) pareça pouco do lado da obra com mais tags. Medir
 * pela MENOR evita que uma obra super-tagueada nunca "conflite" com nada
 * (o denominador grande esconderia qualquer sobreposição).
 */
function temaForte(a, b) {
  const tagsA = a.tags || [];
  const tagsB = b.tags || [];
  if (tagsA.length === 0 || tagsB.length === 0) return false;

  const setB = new Set(tagsB);
  const intersecao = tagsA.filter((tag) => setB.has(tag)).length;
  const menorConjunto = Math.min(tagsA.length, tagsB.length);
  return intersecao > menorConjunto * 0.5;
}

/**
 * Predicado de conflito COMBINADO entre duas obras ADJACENTES (fix round,
 * achado M1): mesmo canal OU tema forte — qualquer um dos dois já basta pra
 * `aplicarDiversidade` tratar o par como colisão a resolver.
 */
function conflitoAdjacente(a, b) {
  return mesmoCanal(a, b) || temaForte(a, b);
}

/**
 * Diversidade (Etapa 8 do PDF): um único passe da esquerda pra direita que
 * evita 2 obras ADJACENTES em conflito — MESMO `channelId` OU tema forte
 * (`conflitoAdjacente` acima, fix round M1: antes só checava canal) — ao
 * achar uma colisão em `i` (conflito com `i-1`), troca de posição com o
 * PRÓXIMO elegível à frente (primeiro `j > i` que NÃO conflita com `i-1`
 * pelo MESMO predicado combinado). Se não existir elegível (ex.: catálogo de
 * um único canal, ou todas as obras restantes do mesmo tema forte), deixa a
 * colisão e segue — spec: "se impossível, deixa e segue".
 *
 * Canal continua tendo precedência DE FATO, não só em teoria: como a busca
 * do candidato `j` usa o MESMO `conflitoAdjacente` (não um predicado teórico
 * separado por regra), um candidato só é aceito se ele NÃO bate nem por
 * canal nem por tema — logo um swap desta função NUNCA pode criar uma
 * colisão de canal nova (o candidato já foi filtrado contra isso antes de
 * entrar no lugar). Uma obra sem tags nunca conflita por tema (ver
 * `temaForte`), então só pode ser reposicionada por causa de canal — o
 * comportamento pré-M1 continua idêntico pra ela.
 *
 * A troca pode empurrar uma colisão NOVA para a posição `j` (contra o que
 * estava em `j-1`) — o próprio avanço sequencial do `for` cobre isso sem
 * lógica extra: quando `i` chegar em `j`, o par `(j-1, j)` é conferido de
 * novo, como qualquer outro.
 *
 * Não muda o CONJUNTO da lista, só troca posições — dedupe continua
 * garantido por `montarCotas` (a fonte de verdade de "quais séries entram").
 */
function aplicarDiversidade(lista) {
  const resultado = [...lista];
  for (let i = 1; i < resultado.length; i++) {
    if (!conflitoAdjacente(resultado[i - 1], resultado[i])) continue;

    let j = i + 1;
    while (j < resultado.length && conflitoAdjacente(resultado[i - 1], resultado[j])) j++;

    if (j < resultado.length) {
      const tmp = resultado[i];
      resultado[i] = resultado[j];
      resultado[j] = tmp;
    }
    // else: nenhum elegível à frente (canal único, ou tema forte
    // dominante) — deixa a colisão e segue, como a spec manda.
  }
  return resultado;
}

/**
 * Reconstrói a "parte por obra" PÓS-penalização (0–65 pts) a partir do
 * `scoreFinal` (0–100) JÁ PERSISTIDO, em vez de recomputar Qualidade +
 * Retenção + Descoberta + penalizações do zero a cada request de recomendação
 * (spec, Task 6: "use os componentes crus persistidos; reconstrua a soma
 * pós-penalização a partir de scoreFinal×65/100 para não recomputar").
 * `computeScoreFinal` faz o caminho inverso: `(somaPosPenalizacao/65)×100`.
 */
function reconstituirParteDaObra(scoreFinal) {
  return (scoreFinal / 100) * ESCALA_SOMA_OBRA;
}

/**
 * FIX ROUND da revisão final do Bloco 4 (achado ALTO A2): neutro DERIVADO
 * para série SEM tags, em vez do 12,5 fixo de `computeAfinidade`.
 *
 * Divisão de responsabilidade (ruling): `computeAfinidade` (função pura,
 * SEM alteração neste fix) continua sendo a fonte de verdade da afinidade de
 * uma obra COM tags — sobreposição normalizada, ou 12,5 quando o LEITOR não
 * tem perfil algum. O neutro de uma obra SEM tags não é mais aquela mesma
 * constante fixa: é a MÉDIA das afinidades já calculadas das obras COM tags
 * do MESMO request — só `buildRecommendations` (que enxerga a lista inteira)
 * tem essa informação, por isso o cálculo mora aqui, não em `computeAfinidade`.
 *
 * Por quê: 12,5 fixo era o teto TEÓRICO de uma obra sem tags, mas o teto REAL
 * de um leitor com histórico diverso é bem menor — a sobreposição máxima
 * possível é a soma dos pesos das tags que aparecem numa ÚNICA obra dividida
 * pela soma TOTAL do perfil (várias obras/temas), quase sempre < 1. Com o
 * neutro fixo em 12,5, um acervo com curadoria incompleta "abria o feed"
 * para as obras sem tags, empurrando pra trás obras que o leitor
 * DEMONSTRAVELMENTE gosta. Com o neutro derivado, a obra sem tags intercala
 * no nível TÍPICO daquele leitor — nunca acima nem abaixo da média do que
 * ele já demonstrou.
 *
 * Casos onde o neutro derivado degrada para o 12,5 fixo (mesmo comportamento
 * de hoje, sem regressão):
 *  - leitor SEM perfil (`perfil` vazio) — toda obra com tags já cai no 12,5
 *    de `computeAfinidade` (sem histórico pra comparar), então a MÉDIA delas
 *    também é 12,5 — nenhum código especial precisa checar isso à parte;
 *  - catálogo do request SEM NENHUMA obra tagueada — não há afinidade
 *    nenhuma calculada pra tirar média; cai no `NEUTRO_AFINIDADE` fixo.
 */
function computeNeutroDerivado(series, perfil, seriesConsumidas = null) {
  const comTags = series.filter((serie) => (serie.tags || []).length > 0);
  // Exclui da média as obras que o leitor JÁ consumiu (observação 1 da
  // re-revisão final): a média deve refletir o que ele encontraria de NOVO.
  // Se ele já leu TODAS as tagueadas, cai na média completa — é o único
  // sinal disponível e, nesse estado, a disputa é entre obras já lidas.
  let base = comTags;
  if (seriesConsumidas && seriesConsumidas.size > 0) {
    const naoConsumidas = comTags.filter((serie) => !seriesConsumidas.has(String(serie._id)));
    if (naoConsumidas.length > 0) base = naoConsumidas;
  }
  if (base.length === 0) return NEUTRO_AFINIDADE;
  const afinidades = base.map((serie) => computeAfinidade(serie, perfil));
  const soma = afinidades.reduce((acc, valor) => acc + valor, 0);
  return soma / afinidades.length;
}

/**
 * Monta a recomendação 50/30/20 de um `content_type` — a função que JUNTA
 * tudo (spec, "Distribuição 50/30/20" + "Rotas"):
 *
 *   valorOrdenacao = parteDaObra × confidence + afinidade
 *
 * (Confidence Score, Etapa 12: "obra nova oscila menos o topo, mas continua
 * entrando pela cota de descoberta" — a multiplicação por `confidence` é o
 * que blinda o topo contra um score alto mas pouco confiável).
 *
 * 1. Carrega as séries PUBLICADAS do tipo + os `SeriesScore` delas.
 * 2. Score AUSENTE (série publicada sem `SeriesScore` ainda — varredura não
 *    rodou pra ela): trata como `scoreFinal 0` / `confidence 0` /
 *    `potentialScore 0` — a série NÃO é excluída (spec: "score ausente →
 *    trate como scoreFinal 0/confidence 0 mas NÃO exclua a série"); ela ainda
 *    entra no catálogo e pode aparecer pela Afinidade ou pela degradação das
 *    cotas.
 * 3. Afinidade: obras COM tags usam `computeAfinidade` direto; obras SEM
 *    tags usam o neutro DERIVADO de `computeNeutroDerivado` acima (fix round
 *    da revisão final, achado A2) — calculado UMA vez por request, reusado
 *    pra todas as obras sem tags dele.
 * 4. Cotas 50/30/20 (`montarCotas`) + diversidade (`intercalarCotas` +
 *    `aplicarDiversidade`).
 * 5. Devolve as séries no MESMO shape do `GET /series` (lean, SEM os campos
 *    internos `potentialScore`/`valorOrdenacao` usados só pra ordenar — spec,
 *    "Fora de escopo": "Potential/Confidence expostos na API pública" fica
 *    de fora).
 *
 * NÃO captura erro nenhum (spec: "Falha em QUALQUER etapa → lança; quem
 * degrada é a ROTA") — qualquer rejeição de query propaga pro chamador.
 */
async function buildRecommendations({ contentType, userId, anonymousId, agora = new Date() } = {}) {
  const series = await Series.find({ isPublished: true, content_type: contentType }).lean();
  if (series.length === 0) return [];

  const scores = await SeriesScore.find({ seriesId: { $in: series.map((s) => s._id) } }).lean();
  const scorePorSerie = new Map(scores.map((s) => [String(s.seriesId), s]));

  const { perfil, seriesConsumidas } = await computeAffinityProfileCompleto({ userId, anonymousId });
  const neutroDerivado = computeNeutroDerivado(series, perfil, seriesConsumidas);

  const enriquecidas = series.map((serie) => {
    const score = scorePorSerie.get(String(serie._id));
    const parteDaObra = reconstituirParteDaObra(score?.scoreFinal || 0);
    const confidence = score?.confidence || 0;
    const temTags = (serie.tags || []).length > 0;
    const afinidade = temTags ? computeAfinidade(serie, perfil) : neutroDerivado;
    return {
      ...serie,
      potentialScore: score?.potentialScore || 0,
      valorOrdenacao: parteDaObra * confidence + afinidade,
    };
  });

  const { consolidadas, potencial, novas } = montarCotas(enriquecidas, agora);
  const intercalado = intercalarCotas(consolidadas, potencial, novas);
  const comDiversidade = aplicarDiversidade(intercalado);

  // potentialScore/valorOrdenacao são campos internos de ordenação — nunca
  // saem no shape público (spec, "Fora de escopo": Potential/Confidence não
  // expostos na API).
  return comDiversidade.map(({ potentialScore, valorOrdenacao, ...serie }) => serie);
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
  computeAffinityProfile,
  computeAffinityProfileCompleto,
  computeAfinidade,
  computeNeutroDerivado,
  montarCotas,
  intercalarCotas,
  mesmoCanal,
  temaForte,
  conflitoAdjacente,
  aplicarDiversidade,
  buildRecommendations,
};
