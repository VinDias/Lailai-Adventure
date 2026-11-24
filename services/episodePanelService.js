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

  if (!Number.isInteger(panelIndex) || panelIndex < 0) {
    throw painelNaoEncontrado();
  }

  // Gravacao ATOMICA no proprio painel (defeito medido em 23/11/2026): antes
  // o servico lia o episodio, mexia num painel e salvava a lista INTEIRA de
  // paineis com a versao do documento. O envio em lote (admin e Meu Estudio)
  // grava os baloes em paralelo, entao so o primeiro pedido passava e os
  // outros davam VersionError (rota 500, balao perdido). Agora cada pedido
  // toca so `panels.<i>.translationLayers` no banco, sem depender do que os
  // outros leram. O `$inc: { __v: 1 }` mantem quem AINDA salva a lista inteira
  // a partir de uma leitura antiga (DELETE de painel) recebendo conflito, em
  // vez de apagar o balao recem-gravado.
  const caminho = `panels.${panelIndex}`;
  const camadas = `${caminho}.translationLayers`;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    // 1) O painel ja tem esse idioma: troca so a URL.
    const troca = await Episode.updateOne(
      { _id: episodeId, [`${camadas}.language`]: language },
      { $set: { [`${camadas}.$[camada].imageUrl`]: imageUrl }, $inc: { __v: 1 } },
      { arrayFilters: [{ 'camada.language': language }] }
    );
    if (troca.matchedCount > 0) return lerPainel(episodeId, panelIndex);

    // 2) Ainda nao tem: acrescenta. A condicao `$ne` impede duplicar o idioma
    //    se outro pedido o criou entre o passo 1 e este.
    const acrescenta = await Episode.updateOne(
      { _id: episodeId, [caminho]: { $exists: true }, [camadas]: { $type: 'array' }, [`${camadas}.language`]: { $ne: language } },
      { $push: { [camadas]: { language, imageUrl } }, $inc: { __v: 1 } }
    );
    if (acrescenta.matchedCount > 0) return lerPainel(episodeId, panelIndex);

    // 3) Painel antigo sem o campo (ou nulo): cria a lista com esta camada.
    const cria = await Episode.updateOne(
      { _id: episodeId, [caminho]: { $exists: true }, [camadas]: null },
      { $set: { [camadas]: [{ language, imageUrl }] }, $inc: { __v: 1 } }
    );
    if (cria.matchedCount > 0) return lerPainel(episodeId, panelIndex);

    // Nada casou: episodio ou painel nao existe, ou outro pedido mudou o
    // painel entre um passo e outro (ai a proxima volta acha o idioma).
    const existe = await Episode.exists({ _id: episodeId });
    if (!existe) throw episodioNaoEncontrado();
    const comPainel = await Episode.exists({ _id: episodeId, [caminho]: { $exists: true } });
    if (!comPainel) throw painelNaoEncontrado();
  }

  throw new Error(`Camada ${language} do painel ${panelIndex} nao gravou depois de 5 tentativas.`);
}

/**
 * Remove a camada de idioma de UM painel, tambem atomico ($pull no proprio
 * painel), pelo mesmo motivo do setTranslationLayer: remover um balao nao
 * pode apagar outro gravado ao mesmo tempo, nem falhar por versao.
 */
async function removeTranslationLayer(episodeId, panelIndex, language) {
  if (!Number.isInteger(panelIndex) || panelIndex < 0) throw painelNaoEncontrado();
  const caminho = `panels.${panelIndex}`;
  const r = await Episode.updateOne(
    { _id: episodeId, [caminho]: { $exists: true } },
    { $pull: { [`${caminho}.translationLayers`]: { language } }, $inc: { __v: 1 } }
  );
  if (r.matchedCount === 0) {
    if (!(await Episode.exists({ _id: episodeId }))) throw episodioNaoEncontrado();
    throw painelNaoEncontrado();
  }
  return lerPainel(episodeId, panelIndex);
}

async function lerPainel(episodeId, panelIndex) {
  const episode = await Episode.findById(episodeId).select('panels');
  if (!episode) throw episodioNaoEncontrado();
  const panel = episode.panels[panelIndex];
  if (!panel) throw painelNaoEncontrado();
  return panel;
}

function episodioNaoEncontrado() {
  const err = new Error('Episódio não encontrado.');
  err.status = 404;
  return err;
}

function painelNaoEncontrado() {
  const err = new Error('Painel não encontrado.');
  err.status = 404;
  return err;
}

module.exports = { addPanels, setTranslationLayer, removeTranslationLayer, IDIOMAS_DE_CAMADA };
