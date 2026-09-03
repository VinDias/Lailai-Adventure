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

module.exports = { addPanels };
