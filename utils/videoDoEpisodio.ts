import { Video } from '../types';
import type { MotivoBloqueio } from '../components/ConteudoBloqueado';

/**
 * Monta o Video que o player recebe a partir de um item de
 * GET /api/content/series/:id/episodes e da obra.
 *
 * Desde 19/11/2026 o servidor tira a mídia do episódio pago da LISTA para
 * quem não pode assistir e manda `bloqueio` no lugar
 * (utils/autorizacaoConteudo.js, episodiosParaLista). Sem passar esse campo
 * adiante, o player receberia um vídeo sem bunnyVideoId e sem video_url e
 * ficaria em tela preta, em vez de convidar a criar conta ou assinar.
 */
export function videoDoEpisodio(ep: any, series: any, type: 'hqcine' | 'vcine', duracao: number): Video {
  return {
    id: (ep._id || ep.id)?.toString(),
    // Fase 4 (progresso): id real da série/obra, separado do id do episódio acima.
    seriesId: series._id,
    titulo: ep.title,
    categoria: series.genre,
    descricao: ep.description,
    duracao,
    arquivoUrl: ep.video_url,
    bunnyVideoId: ep.bunnyVideoId,
    thumbnailUrl: ep.thumbnail,
    isPremium: series.isPremium,
    criadoEm: new Date().toISOString(),
    type,
    hlsAudioLabels: ep.hlsAudioLabels,
    ...(ep.bloqueio
      ? { bloqueio: { motivo: ep.bloqueio as MotivoBloqueio, obra: { title: series.title, cover_image: series.cover_image } } }
      : {}),
  };
}
