/**
 * Adicionar painéis a um episódio (validação + push no array + disparo de
 * push/recálculo quando o episódio já está publicado) — extraído de
 * routes/content.js (POST /episodes/:id/panels, admin) na Fase 5 Bloco 1
 * Task 4 para ser reusado, SEM duplicar a validação, pelo portal do
 * ilustrador (POST /api/portal/episodios/:id/paineis). Mesmo shape de
 * `panels` nos dois caminhos: [{ image_url, order, translationLayers? }] —
 * a rota do portal aceita `translationLayers` de graça, por herdar esta
 * mesma função.
 *
 * Erros de validação/existência são lançados com `err.status` (400/404) —
 * mesmo padrão de services/superReaderService.js `criarSessaoDeApoio`; cada
 * rota chamadora faz `if (err.status) return res.status(err.status)...`.
 */
const Episode = require('../models/Episode');
const logger = require('../utils/logger');

async function addPanels(episodeId, panels) {
  if (!Array.isArray(panels) || panels.length === 0) {
    const err = new Error('panels deve ser um array não vazio.');
    err.status = 400;
    throw err;
  }

  const episode = await Episode.findByIdAndUpdate(
    episodeId,
    { $push: { panels: { $each: panels } } },
    { new: true }
  );
  if (!episode) {
    const err = new Error('Episódio não encontrado.');
    err.status = 404;
    throw err;
  }

  // 5º caminho de disparo (dos 6 do ledger da Fase 4): episódio publicado
  // sem conteúdo (esqueleto) ganha o primeiro painel aqui. O claim + a
  // guarda de conteúdo em notifyEpisodePublished fazem o resto — este é o
  // único anexo que de fato envia; os seguintes são no-op (claim já
  // consumido). NUNCA acontece pelo caminho do portal (Task 4): painéis do
  // portal só entram em episódio `status: 'draft'` — a rota do portal barra
  // isso antes de chamar addPanels.
  if (episode.status === 'published') {
    require('./notificationService')
      .notifyEpisodePublished(episode._id)
      .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));

    require('./recommendationService').dispararRecalculo(episode.seriesId, 'capitulo_publicado');
  }

  return episode;
}

/**
 * Grava (ou substitui) a camada de idioma de UM painel. Extraído de
 * routes/content.js (PUT /episodes/:id/panels/:idx/translations, admin) para
 * o portal do ilustrador reusar a MESMA regra — pedido do cliente em
 * 17/09/2026: quem sobe o capítulo no Meu Estúdio precisa subir os diálogos
 * ali mesmo, sem depender do painel do Master.
 */
const IDIOMAS_DE_CAMADA = ['pt', 'en', 'es', 'zh'];

async function setTranslationLayer(episodeId, panelIndex, language, imageUrl) {
  if (!IDIOMAS_DE_CAMADA.includes(language)) {
    const err = new Error(`language deve ser um de: ${IDIOMAS_DE_CAMADA.join(', ')}.`);
    err.status = 400;
    throw err;
  }
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    const err = new Error('imageUrl é obrigatório.');
    err.status = 400;
    throw err;
  }

  const episode = await Episode.findById(episodeId);
  if (!episode) {
    const err = new Error('Episódio não encontrado.');
    err.status = 404;
    throw err;
  }

  const panel = episode.panels[panelIndex];
  if (!panel) {
    const err = new Error('Painel não encontrado.');
    err.status = 404;
    throw err;
  }

  if (!panel.translationLayers) panel.translationLayers = [];
  const existente = panel.translationLayers.findIndex(l => l.language === language);
  if (existente >= 0) panel.translationLayers[existente].imageUrl = imageUrl;
  else panel.translationLayers.push({ language, imageUrl });

  episode.panels[panelIndex] = panel;
  episode.markModified('panels');
  await episode.save();

  return episode.panels[panelIndex];
}

module.exports = { addPanels, setTranslationLayer, IDIOMAS_DE_CAMADA };
