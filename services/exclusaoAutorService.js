/**
 * O AUTOR exclui capítulo ou obra SEUS, pelo Meu Estúdio (retorno do cliente
 * em 27/11/2026: "os arquivos depois de enviados o autor não consegue apagar.
 * Deveria ter uma tecla excluir. Porque muitas vezes o autor desiste e quer
 * excluir a série ou algum capítulo").
 *
 * REGRAS
 * - Só o dono: a rota (routes/portal.js) resolve a obra ou o capítulo pelos
 *   canais ativos de quem está logado; o que é de outro autor responde 404.
 * - Rascunho, enviado (na Fila de Aprovação) e devolvido: exclui direto. A
 *   confirmação é da tela.
 * - PUBLICADO (obra `isPublished` ou capítulo `status: 'published'`): o autor
 *   também exclui, mas o servidor exige o TÍTULO digitado (`confirmacao`),
 *   para um clique errado, ou um pedido montado à mão, não tirar do ar o que
 *   os leitores estão lendo. Some do catálogo na hora.
 * - Sai da fila por construção: a fila lê `Series`/`Episode` com
 *   `submittedAt`, e a edição de publicado (`RevisaoEpisodio`) sai junto.
 * - Arquivos: do Bunny Storage saem os que SÓ o que foi excluído usava
 *   (`apagarUrlsSemUso`, a mesma regra dos itens 3, 6 e 7: nosso CDN e sem
 *   outro episódio, edição ou capa de obra usando); do Bunny Stream sai o
 *   vídeo que o AUTOR enviou (`videoEnvio`), nunca o que o admin pôs. Falha
 *   ao apagar arquivo não desfaz a exclusão: fica no log e na resposta.
 * - Quem excluiu fica no `AdminLog` (`AUTOR_EXCLUIU_EPISODIO`,
 *   `AUTOR_EXCLUIU_OBRA`), com título, estado e canal.
 *
 * Ordem na obra: os episódios e o que depende deles primeiro, a obra por
 * último (como no DELETE do admin): se algo falhar no meio, o autor repete a
 * exclusão, porque a obra ainda existe.
 */
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const RevisaoEpisodio = require('../models/RevisaoEpisodio');
const EnvioEpisodio = require('../models/EnvioEpisodio');
const AdminLog = require('../models/AdminLog');
const bunnyStream = require('../utils/bunnyStream');
const logger = require('../utils/logger');

function erro(status, mensagem, extra = {}) {
  const e = new Error(mensagem);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

const normalizar = (texto) => String(texto ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Em publicado, o título digitado tem de ser o do que vai ser excluído. */
function exigirTitulo(titulo, confirmacao, oQue) {
  if (normalizar(confirmacao) && normalizar(confirmacao) === normalizar(titulo)) return;
  throw erro(400, `${oQue} no ar. Para excluir, digite o título exatamente como aparece.`, { exigeConfirmacao: true });
}

function urlsDe(doc) {
  const urls = [];
  if (!doc) return urls;
  if (doc.thumbnail) urls.push(doc.thumbnail);
  for (const p of doc.panels || []) {
    if (p.image_url) urls.push(p.image_url);
    for (const c of p.translationLayers || []) if (c.imageUrl) urls.push(c.imageUrl);
  }
  return urls;
}

function estadoDoEpisodio(ep) {
  if (ep.status === 'published') return 'publicado';
  return ep.submittedAt ? 'na fila' : 'rascunho';
}

function estadoDaObra(s) {
  if (s.isPublished) return 'publicada';
  return s.submittedAt ? 'na fila' : 'rascunho';
}

/** Vídeo que o autor enviou para este episódio (não o que o admin pôs). */
function videoDoAutor(ep) {
  const v = ep.videoEnvio;
  return v && v.videoId && v.videoId === ep.bunnyVideoId ? v.videoId : null;
}

/**
 * Apaga os episódios (documentos lean, como estão AGORA) e o que só existe
 * por causa deles. Devolve as URLs que eles usavam, para a limpeza do
 * Storage, que quem chama faz DEPOIS de apagar também a obra, se for o caso.
 */
async function apagarEpisodios(episodios) {
  const ids = episodios.map(e => e._id);
  if (ids.length === 0) return { urls: [], videos: 0, videosNaoApagados: [] };
  const envio = require('./envioEpisodioService');

  // Envio de pasta aberto (partes já no Bunny, nunca concluído).
  for (const id of ids) {
    await envio.cancelarAbertos(id).catch(e => logger.error(`[ExclusaoAutor] Envio aberto do episódio ${id} não cancelado`, e));
  }
  // Edição de publicado (item 7): sai da fila junto.
  const revisoes = await RevisaoEpisodio.find({ _id: { $in: ids } }).select('panels thumbnail').lean();
  const urls = [...episodios.flatMap(urlsDe), ...revisoes.flatMap(urlsDe)];

  await RevisaoEpisodio.deleteMany({ _id: { $in: ids } });
  await Episode.deleteMany({ _id: { $in: ids } });
  await Promise.all([
    require('../models/Vote').deleteMany({ episodeId: { $in: ids } }),
    EnvioEpisodio.deleteMany({ episodeId: { $in: ids } }),
  ]);

  let videos = 0;
  const videosNaoApagados = [];
  if (bunnyStream.isConfigured()) {
    for (const videoId of [...new Set(episodios.map(videoDoAutor).filter(Boolean))]) {
      try {
        await bunnyStream.deleteVideo(videoId);
        videos += 1;
      } catch (e) {
        videosNaoApagados.push(videoId);
        logger.error(`[ExclusaoAutor] Vídeo ${videoId} não apagado do Bunny Stream`, e);
      }
    }
  }
  return { urls, videos, videosNaoApagados };
}

async function registrar(user, action, targetId, details) {
  try {
    await AdminLog.create({ adminId: String(user.id), action, targetId: String(targetId), details });
  } catch (e) {
    logger.error(`[ExclusaoAutor] ${action} de ${targetId} por ${user.id} não gravado no AdminLog`, e);
  }
  logger.warn(`[ExclusaoAutor] ${action}: "${details.title}" (${targetId}), estado ${details.estado}, por ${user.id}`);
}

/** `episode` e `series` já vêm conferidos pela rota: são do dono logado. */
async function excluirEpisodio({ user, episode, series, confirmacao }) {
  const ep = episode.toObject ? episode.toObject() : episode;
  const publicado = ep.status === 'published';
  if (publicado) exigirTitulo(ep.title, confirmacao, 'Este capítulo está');

  const estado = estadoDoEpisodio(ep);
  const feito = await apagarEpisodios([ep]);
  const limpeza = await require('./envioEpisodioService').apagarUrlsSemUso(feito.urls);

  await registrar(user, 'AUTOR_EXCLUIU_EPISODIO', ep._id, {
    title: ep.title, episode_number: ep.episode_number, estado, publicado,
    seriesId: String(ep.seriesId), serie: series.title, channelId: String(series.channelId),
    arquivosApagados: limpeza.apagados, videosApagados: feito.videos,
  });
  if (publicado && series.isPublished) {
    require('./recommendationService').dispararRecalculo(ep.seriesId, 'capitulo_excluido_pelo_autor');
  }
  return {
    excluido: true, estado,
    arquivosApagados: limpeza.apagados, naoApagados: limpeza.falhas,
    videosApagados: feito.videos, videosNaoApagados: feito.videosNaoApagados,
  };
}

/** `series` já vem conferida pela rota: é de um canal ativo do dono logado. */
async function excluirObra({ user, series, confirmacao }) {
  const obra = series.toObject ? series.toObject() : series;
  if (obra.isPublished) exigirTitulo(obra.title, confirmacao, 'Esta obra está');

  const estado = estadoDaObra(obra);
  const episodios = await Episode.find({ seriesId: obra._id }).lean();
  const feito = await apagarEpisodios(episodios);

  // O que aponta para a obra: sem isto ficam órfãos (favorito e voto vazam no
  // export LGPD; caso de curadoria fica eterno na fila). Mesma lista do
  // DELETE /api/content/series/:id do admin.
  await Promise.all([
    require('../models/Favorite').deleteMany({ seriesId: obra._id }),
    require('../models/SeriesVote').deleteMany({ seriesId: obra._id }),
    require('../models/Sinalizacao').deleteMany({ seriesId: obra._id }),
    require('../models/CasoCuradoria').deleteMany({ seriesId: obra._id }),
    require('../models/SeriesScore').deleteMany({ seriesId: obra._id }),
  ]);
  await Series.deleteOne({ _id: obra._id });

  // Só agora os arquivos: com a obra e os episódios fora do banco, o que
  // ninguém mais usa pode sair (a capa, inclusive).
  const limpeza = await require('./envioEpisodioService').apagarUrlsSemUso([...feito.urls, obra.cover_image]);

  await registrar(user, 'AUTOR_EXCLUIU_OBRA', obra._id, {
    title: obra.title, content_type: obra.content_type, estado, publicado: !!obra.isPublished,
    channelId: String(obra.channelId), episodios: episodios.length,
    episodiosPublicados: episodios.filter(e => e.status === 'published').length,
    arquivosApagados: limpeza.apagados, videosApagados: feito.videos,
  });
  return {
    excluido: true, estado, episodios: episodios.length,
    arquivosApagados: limpeza.apagados, naoApagados: limpeza.falhas,
    videosApagados: feito.videos, videosNaoApagados: feito.videosNaoApagados,
  };
}

module.exports = { excluirEpisodio, excluirObra };
