/**
 * Portal do Ilustrador (Fase 5 Bloco 1). Nasceu na Task 3 só com o painel de
 * números — GET /meu-estudio (canais + contagens) e GET /resumo (as MESMAS
 * agregações de royalties que o admin vê, escopadas ao usuário). Task 4
 * acrescenta o CRUD de série/capítulo/painéis do dono do canal e a
 * submissão explícita ("Enviar para aprovação"); Task 6 acrescenta
 * mensagens — todas reaproveitando requireCanalDoUsuario abaixo.
 */
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');
const pick = require('../utils/pick');

const Channel = require('../models/Channel');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const MensagemPortal = require('../models/MensagemPortal');
const RoyaltyPeriod = require('../models/RoyaltyPeriod');
const { parsePeriod, periodoAtual, buildReport, buildSuperReaderSummary } = require('../services/royaltyReportService');
const { addPanels } = require('../services/episodePanelService');

router.use(verifyToken);

/**
 * Guarda de dono, reutilizável pelas Tasks 4/6: exige que o usuário logado
 * seja ownerId de PELO MENOS UM canal ATIVO. 403 com mensagem clara — nunca
 * 404 (diferente do critério de "ver rascunho" de utils/ownership.js: aqui
 * não há segredo a esconder, só uma área que não existe pra quem não é
 * ilustrador). Anexa req.portalChannels (docs) e req.portalChannelIds
 * (string[]) para as rotas usarem sem reconsultar — Tasks 4/6 encadeiam
 * checagem adicional de posse do recurso específico (série/capítulo) em
 * cima disto.
 */
async function requireCanalDoUsuario(req, res, next) {
  try {
    const canais = await Channel.find({ ownerId: req.user.id, isActive: true }).lean();
    if (canais.length === 0) {
      return res.status(403).json({ error: 'Você não é dono de nenhum canal ativo — o Meu Estúdio é só para ilustradores vinculados a um canal.' });
    }
    req.portalChannels = canais;
    req.portalChannelIds = canais.map(c => String(c._id));
    next();
  } catch (err) {
    logger.error('[Portal] requireCanalDoUsuario', err);
    res.status(500).json({ error: 'Erro ao verificar seus canais.' });
  }
}

// GET /api/portal/meu-estudio — canais do usuário + contagens por canal
router.get('/meu-estudio', requireCanalDoUsuario, async (req, res) => {
  try {
    const canais = await Promise.all(req.portalChannels.map(async (canal) => {
      const seriesDoCanal = await Series.find({ channelId: canal._id }).select('_id isPublished submittedAt').lean();
      const seriesIds = seriesDoCanal.map(s => s._id);
      const seriesPendentes = seriesDoCanal.filter(s => s.submittedAt && !s.isPublished).length;

      const [episodiosPendentes, mensagensNaoLidas] = await Promise.all([
        Episode.countDocuments({
          seriesId: { $in: seriesIds },
          submittedAt: { $ne: null },
          status: { $ne: 'published' },
        }),
        // Thread vigente do usuário: canal + ownerUserId = ele mesmo (o
        // dono atual — troca de dono arquiva a thread anterior, T1), só
        // mensagens do editor, ainda não lidas nem arquivadas.
        MensagemPortal.countDocuments({
          canalId: canal._id,
          ownerUserId: req.user.id,
          autorTipo: 'editor',
          lidaEm: null,
          arquivadaEm: null,
        }),
      ]);

      return {
        channelId: canal._id,
        name: canal.name,
        avatar: canal.avatar ?? null,
        obras: seriesDoCanal.length,
        // "Pendentes de aprovação" = submittedAt preenchido e ainda não
        // publicado, somando séries e capítulos (spec).
        pendentes: seriesPendentes + episodiosPendentes,
        mensagensNaoLidas,
      };
    }));

    res.json({ canais });
  } catch (err) {
    logger.error('[Portal] GET /meu-estudio', err);
    res.status(500).json({ error: 'Erro ao montar o Meu Estúdio.' });
  }
});

// GET /api/portal/resumo?period=YYYY-MM — painel de números, escopado aos
// canais ativos do usuário. Mês corrente: pontos/share do MESMO buildReport
// que o admin usa, NUNCA com R$ (o pool só é verdade no fechamento — decisão
// de contrato, não "melhorar" isso). Período fechado: breakdown do
// RoyaltyPeriod, com R$ (números já confirmados). Super Reader sempre por
// mês, escopado.
router.get('/resumo', requireCanalDoUsuario, async (req, res) => {
  try {
    const periodQuery = req.query.period;
    if (periodQuery !== undefined && parsePeriod(periodQuery) === null) {
      return res.status(400).json({ error: 'period deve estar no formato YYYY-MM.' });
    }

    const mesAtual = periodoAtual();
    const period = periodQuery || mesAtual;
    const isMesAtual = period === mesAtual;
    const canalIds = req.portalChannelIds;

    // Dropdown do frontend: períodos fechados em que algum canal do usuário
    // aparece no breakdown (fechado sem nenhum ponto do dono não entra —
    // não há nada a mostrar nele).
    const periodosFechadosDocs = await RoyaltyPeriod.find({ 'breakdown.channelId': { $in: canalIds } })
      .select('period')
      .sort({ period: -1 })
      .lean();
    const periodosFechadosDisponiveis = periodosFechadosDocs.map(p => p.period);

    let status;
    let canais;

    if (isMesAtual) {
      status = 'aberto';
      const range = parsePeriod(period);
      const report = await buildReport(range);
      canais = report.channels
        .filter(c => c.channelId && canalIds.includes(String(c.channelId)))
        .map(c => ({
          channelId: c.channelId,
          channelName: c.channelName,
          points: c.points,
          share: c.share,
          // SEM amount de propósito — mês corrente nunca mostra R$.
        }));
    } else {
      const fechado = await RoyaltyPeriod.findOne({ period }).lean();
      if (!fechado) {
        return res.status(404).json({ error: `Período ${period} não encontrado ou ainda não fechado.` });
      }
      status = 'fechado';
      canais = (fechado.breakdown || [])
        .filter(b => b.channelId && canalIds.includes(String(b.channelId)))
        .map(b => ({
          channelId: b.channelId,
          channelName: b.channelName,
          points: b.points,
          share: b.share,
          amount: b.amount,
        }));
    }

    const srSummary = await buildSuperReaderSummary(period);
    const superReader = {
      porCanal: srSummary.porCanal
        .filter(c => c.channelId && canalIds.includes(String(c.channelId)))
        .map(({ channelId, channelName, apoios, autorCents }) => ({ channelId, channelName, apoios, autorCents })),
    };

    res.json({ period, status, canais, superReader, periodosFechadosDisponiveis });
  } catch (err) {
    logger.error('[Portal] GET /resumo', err);
    res.status(500).json({ error: 'Erro ao montar o resumo.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRUD do portal + submissão (Task 4). Toda rota abaixo já passa por
// verifyToken (router.use no topo) + requireCanalDoUsuario. Ownership do
// recurso ESPECÍFICO (série/episódio) é checado aqui em cima de
// req.portalChannelIds — mesmo critério 404 (nunca 403) de utils/ownership.js:
// A não deve conseguir distinguir "não existe" de "é de B".
// ═══════════════════════════════════════════════════════════════════════════

// Campos que o formulário do portal pode escrever numa série — NUNCA por
// spread do body. content_type/isPublished/genre/tags ficam de fora de
// propósito (pinados/reservados ao Master — ver rotas abaixo e a spec,
// "Formulários do portal"/"Upload do ilustrador").
const PORTAL_SERIES_FIELDS = ['title', 'description', 'cover_image', 'content_rating_sugerida'];
// thumbnail: URL do storage (upload real é T5); status/bunnyVideoId/vídeo
// NUNCA aceitos por aqui — o episódio do portal nasce sempre 'draft'.
const PORTAL_EPISODE_FIELDS = ['title', 'description', 'episode_number', 'thumbnail'];

/**
 * Resolve uma série pertencente a um dos canais ATIVOS do usuário logado, ou
 * `null` se ela não existir ou for de outro dono. Quem chama trata `null`
 * como 404 — nunca confirma a existência do recurso alheio.
 */
async function serieDoDono(seriesId, portalChannelIds) {
  const series = await Series.findById(seriesId);
  if (!series || !series.channelId || !portalChannelIds.includes(String(series.channelId))) {
    return null;
  }
  return series;
}

/**
 * Mesmo critério de serieDoDono, para um episódio: resolve o episódio E a
 * série (pra checar o canal) numa só chamada — as rotas de painéis/enviar
 * precisam das duas.
 */
async function episodioDoDono(episodeId, portalChannelIds) {
  const episode = await Episode.findById(episodeId);
  if (!episode) return null;
  const series = await Series.findById(episode.seriesId).select('channelId isPublished submittedAt').lean();
  if (!series || !series.channelId || !portalChannelIds.includes(String(series.channelId))) {
    return null;
  }
  return { episode, series };
}

// POST /api/portal/series — cria série DRAFT no canal do usuário.
// content_type: 'hiqua' PINADO no servidor (o body é IGNORADO — allowlist
// explícita, spread nunca do req.body inteiro); isPublished: false forçado;
// sem genre (o Master preenche na aprovação, T1) e sem tags (Bloco 2).
router.post('/series', requireCanalDoUsuario, async (req, res) => {
  try {
    const dados = pick(req.body, PORTAL_SERIES_FIELDS);
    if (!dados.title || !String(dados.title).trim()) {
      return res.status(400).json({ error: 'title é obrigatório.' });
    }

    // channelId: obrigatório só quando o dono tem mais de um canal ativo —
    // com um só, o default é óbvio e o form nem precisa perguntar.
    let channelId;
    if (req.portalChannelIds.length === 1) {
      channelId = req.portalChannelIds[0];
    } else {
      const bodyChannelId = req.body.channelId;
      if (!bodyChannelId || !req.portalChannelIds.includes(String(bodyChannelId))) {
        return res.status(400).json({ error: 'channelId é obrigatório (você tem mais de um canal) e deve ser um dos seus canais ativos.' });
      }
      channelId = bodyChannelId;
    }

    // Tradução automática de descrição — mesmo caminho não-crítico do POST
    // admin (buildTranslationsSafe): falha não impede o save. Sem genre aqui
    // (a série do portal nasce sem ele) — nada a traduzir nesse campo ainda.
    const translationService = require('../services/translationService');
    const translations = await translationService.buildTranslationsSafe(
      { description: dados.description }, `série "${dados.title}" (portal)`
    );

    const series = await Series.create({
      ...dados,
      channelId,
      content_type: 'hiqua', // PINADO — depois do spread, vence qualquer content_type do body
      isPublished: false,    // PINADO — idem
      ...(translations ? { translations } : {}),
    });

    logger.info(`[Portal] Série criada: ${series.title} (canal ${channelId})`);
    res.status(201).json(series);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Portal] POST /series', err);
    res.status(500).json({ error: 'Erro ao criar série.' });
  }
});

// PUT /api/portal/series/:id — edita a própria série, só em rascunho NÃO
// submetido (isPublished: false e submittedAt: null). Publicada ou já
// submetida: 403 com mensagem clara — o ilustrador pede ajuste pela thread
// (Task 6), não edita ao vivo.
router.put('/series/:id', requireCanalDoUsuario, async (req, res) => {
  try {
    const series = await serieDoDono(req.params.id, req.portalChannelIds);
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });

    if (series.isPublished || series.submittedAt) {
      return res.status(403).json({ error: 'Só é possível editar uma série em rascunho, antes de enviar para aprovação.' });
    }

    const updates = pick(req.body, PORTAL_SERIES_FIELDS);
    if ('title' in updates && !String(updates.title).trim()) {
      return res.status(400).json({ error: 'title não pode ficar vazio.' });
    }

    if ('description' in updates) {
      const translationService = require('../services/translationService');
      const translations = await translationService.buildTranslationsSafe(
        { description: updates.description }, `série ${series._id} (portal)`
      );
      if (translations) updates.translations = translations;
    }

    Object.assign(series, updates);
    await series.save();
    res.json(series);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Portal] PUT /series/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar série.' });
  }
});

// POST /api/portal/series/:id/episodios — cria episódio DRAFT (status
// forçado) na própria série, draft OU publicada (capítulo novo em obra no ar
// é o fluxo normal: nasce draft e só vai ao ar via aprovação, T2 garante a
// invisibilidade até lá).
router.post('/series/:id/episodios', requireCanalDoUsuario, async (req, res) => {
  try {
    const series = await serieDoDono(req.params.id, req.portalChannelIds);
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });

    const dados = pick(req.body, PORTAL_EPISODE_FIELDS);
    if (!dados.title || !String(dados.title).trim()) {
      return res.status(400).json({ error: 'title é obrigatório.' });
    }
    if (dados.episode_number === undefined || dados.episode_number === null || dados.episode_number === '') {
      return res.status(400).json({ error: 'episode_number é obrigatório.' });
    }

    const translationService = require('../services/translationService');
    const translations = await translationService.buildTranslationsSafe(
      { description: dados.description }, `episódio "${dados.title}" (portal)`
    );

    const episode = await Episode.create({
      ...dados,
      seriesId: series._id,
      status: 'draft', // PINADO — allowlist nem aceita status do body, reforça aqui
      ...(translations ? { translations } : {}),
    });

    logger.info(`[Portal] Episódio criado: ${episode.title} (série ${series._id})`);
    res.status(201).json(episode);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Portal] POST /series/:id/episodios', err);
    res.status(500).json({ error: 'Erro ao criar episódio.' });
  }
});

// POST /api/portal/episodios/:id/paineis — grava painéis no episódio draft
// do dono. Reusa services/episodePanelService.addPanels — MESMA função da
// rota admin (POST /api/content/episodes/:id/panels), então o payload aceita
// translationLayers de graça, sem duplicar validação divergente.
router.post('/episodios/:id/paineis', requireCanalDoUsuario, async (req, res) => {
  try {
    const achado = await episodioDoDono(req.params.id, req.portalChannelIds);
    if (!achado) return res.status(404).json({ error: 'Episódio não encontrado.' });

    if (achado.episode.status !== 'draft') {
      return res.status(403).json({ error: 'Só é possível adicionar painéis a um episódio em rascunho.' });
    }
    // Submetido ainda tem status 'draft' — sem este check, o ilustrador
    // anexaria o painel N+1 ENQUANTO o Master revisa, e ele iria ao ar sem
    // revisão na aprovação. Devolvido (submittedAt limpo) volta a aceitar.
    if (achado.episode.submittedAt) {
      return res.status(403).json({ error: 'Episódio em análise não pode receber painéis. Aguarde a aprovação ou a devolução.' });
    }

    const episode = await addPanels(req.params.id, req.body.panels);
    res.json({ success: true, panelCount: episode.panels.length, episode });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error('[Portal] POST /episodios/:id/paineis', err);
    res.status(500).json({ error: 'Erro ao adicionar painéis.' });
  }
});

// POST /api/portal/series/:id/enviar — marca submittedAt na série draft não
// submetida do dono. Validações mínimas: capa presente + ao menos um
// episódio draft com painéis (senão 400 com o que falta).
router.post('/series/:id/enviar', requireCanalDoUsuario, async (req, res) => {
  try {
    const series = await serieDoDono(req.params.id, req.portalChannelIds);
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });

    if (series.isPublished) {
      return res.status(400).json({ error: 'Série já publicada — não é possível enviar para aprovação de novo.' });
    }
    if (series.submittedAt) {
      return res.status(400).json({ error: 'Série já enviada para aprovação — aguarde a revisão do editor.' });
    }

    const faltando = [];
    if (!series.cover_image) faltando.push('capa');

    const episodioComPainel = await Episode.exists({
      seriesId: series._id,
      status: 'draft',
      'panels.0': { $exists: true },
    });
    if (!episodioComPainel) faltando.push('ao menos um episódio em rascunho com painéis');

    if (faltando.length > 0) {
      return res.status(400).json({ error: `Não é possível enviar para aprovação: falta ${faltando.join(' e ')}.` });
    }

    series.submittedAt = new Date();
    await series.save();
    res.json(series);
  } catch (err) {
    logger.error('[Portal] POST /series/:id/enviar', err);
    res.status(500).json({ error: 'Erro ao enviar série para aprovação.' });
  }
});

// POST /api/portal/episodios/:id/enviar — marca submittedAt no episódio
// draft do dono. Exige ≥1 painel. Fallback do thumbnail MATERIALIZA aqui: se
// o episódio não tem thumbnail, vira a imagem do 1º painel (spec,
// "Formulários do portal").
//
// Regra série×episódio (submissão é SEPARADA — spec): um episódio avulso só
// pode ser enviado quando a série já está publicada OU já foi submetida
// (submittedAt preenchido) — nesses dois casos a obra já tem existência
// reconhecida pelo editor. Enviar a SÉRIE NÃO envia implicitamente os
// episódios draft dela (cada um precisa do próprio "Enviar"); o que a
// submissão da série destrava é justamente ISSO — poder enviar os episódios
// draft dela em seguida, e os dois aparecerem juntos na Fila de Aprovação
// (T7). Série ainda 100% rascunho (nunca publicada, nunca submetida): 400
// orientando a enviar a série primeiro.
router.post('/episodios/:id/enviar', requireCanalDoUsuario, async (req, res) => {
  try {
    const achado = await episodioDoDono(req.params.id, req.portalChannelIds);
    if (!achado) return res.status(404).json({ error: 'Episódio não encontrado.' });
    const { episode, series } = achado;

    if (episode.status !== 'draft') {
      return res.status(400).json({ error: 'Só é possível enviar para aprovação um episódio em rascunho.' });
    }
    if (episode.submittedAt) {
      return res.status(400).json({ error: 'Episódio já enviado para aprovação — aguarde a revisão do editor.' });
    }
    if (!episode.panels || episode.panels.length === 0) {
      return res.status(400).json({ error: 'Adicione ao menos um painel antes de enviar para aprovação.' });
    }
    if (!series.isPublished && !series.submittedAt) {
      return res.status(400).json({
        error: 'A série deste episódio ainda não foi enviada para aprovação — envie a série primeiro; depois volte aqui para enviar o episódio.',
      });
    }

    if (!episode.thumbnail) {
      episode.thumbnail = episode.panels[0].image_url;
    }
    episode.submittedAt = new Date();
    await episode.save();
    res.json(episode);
  } catch (err) {
    logger.error('[Portal] POST /episodios/:id/enviar', err);
    res.status(500).json({ error: 'Erro ao enviar episódio para aprovação.' });
  }
});

module.exports = router;
