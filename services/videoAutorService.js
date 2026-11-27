/**
 * Vídeo enviado pelo AUTOR, no portal (Fase 7, frente A, item 9): V-Show
 * (`vcine`) e Anicom (`hqcine`).
 *
 * O arquivo vai do navegador direto ao Bunny Stream (protocolo TUS), sem
 * passar pelo disco nem pela memória da VPS. O servidor só:
 *   1. cria o vídeo vazio no Bunny e entrega uma autorização de curta duração
 *      para ESSE vídeo (a chave da biblioteca nunca vai ao navegador);
 *   2. acompanha o estado do vídeo (webhook do Bunny, ou consulta quando o
 *      autor olha o capítulo), para o portal avisar "vídeo pronto".
 *
 * REGRA QUE NÃO PODE SE PERDER (risco R9 do plano): vídeo de autor que
 * termina de processar NÃO publica o episódio. O webhook do Bunny, que para o
 * vídeo enviado pelo admin põe o episódio como publicado e dispara o aviso de
 * capítulo novo, aqui só marca o vídeo como "pronto"; o episódio segue
 * rascunho até o moderador aprovar na fila. `aplicarStatusDoBunny` é o único
 * lugar que decide isso, e é chamado pelos DOIS caminhos que hoje publicam
 * por estado do Bunny (webhook e a consulta manual do admin).
 *
 * Como se reconhece o vídeo de autor: o episódio guarda `videoEnvio.videoId`
 * no pedido de autorização. Enquanto esse id for o `bunnyVideoId` do
 * episódio, o vídeo é do autor. Se o admin trocar o vídeo pelo painel dele
 * (outro `bunnyVideoId`), volta a valer o caminho do admin, como sempre foi.
 */
const Episode = require('../models/Episode');
const Setting = require('../models/Setting');
const bunnyStream = require('../utils/bunnyStream');
const logger = require('../utils/logger');

/** Tipos de obra cujo episódio é um vídeo. */
const TIPOS_DE_VIDEO = ['vcine', 'hqcine'];
/** Tipos de obra que o autor pode criar no portal. */
const TIPOS_DO_PORTAL = ['hiqua', ...TIPOS_DE_VIDEO];

// Curta duração: a autorização vale só para um vídeo e pelo tempo que o envio
// dele deve levar: o tamanho do arquivo a 250 KB/s (2 Mbps de subida), nunca
// menos de 5 minutos nem mais de 2 horas. Sem o tamanho, 5 minutos (a tela
// sempre manda o tamanho). Um envio que dure mais pede outra (`renovar`,
// 5 minutos), para o mesmo vídeo; a tela renova sozinha quando faltam 2
// minutos (utils/envioVideoTus.ts).
//
// Desde 27/11/2026 o episódio NÃO espera mais esta validade vencer para ir à
// fila (o cliente leu a espera como erro). O que protege o moderador de
// aprovar um vídeo trocado por fora é: (1) a validade curta; (2) o Bunny
// avisar que o vídeo mudou (`aplicarStatusDoBunny` tira o episódio da fila);
// (3) a conferência com o Bunny na hora de aprovar (`conferirAntesDeAprovar`).
const VALIDADE_MAXIMA_SEGUNDOS = 2 * 60 * 60;
const VALIDADE_MINIMA_SEGUNDOS = 5 * 60;
const BYTES_POR_SEGUNDO_ESPERADOS = 250 * 1000;
const VALIDADE_SEGUNDOS = VALIDADE_MAXIMA_SEGUNDOS;

function validadePara(tamanho) {
  if (!Number.isInteger(tamanho) || tamanho <= 0) return VALIDADE_MINIMA_SEGUNDOS;
  const estimada = Math.ceil(tamanho / BYTES_POR_SEGUNDO_ESPERADOS);
  return Math.min(VALIDADE_MAXIMA_SEGUNDOS, Math.max(VALIDADE_MINIMA_SEGUNDOS, estimada));
}
// O mesmo teto do envio de vídeo do admin (routes/bunnyWebhook.js, multer de
// 800 MB), mudável no admin pela chave `limite_mb_video`.
const CHAVE_LIMITE_MB_VIDEO = 'limite_mb_video';
const LIMITE_MB_VIDEO_PADRAO = 800;
const BYTES_POR_MB = 1024 * 1024;
// Os mesmos formatos que o envio do admin aceita.
const TIPOS_DE_ARQUIVO = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/mkv', 'video/matroska'];
// Entre duas consultas ao Bunny pelo mesmo vídeo (o portal pergunta de tempos
// em tempos enquanto o vídeo processa).
const INTERVALO_DE_CONSULTA_MS = 5000;

// Estados do Bunny Stream: 0 criado, 1 enviado, 2 processando, 3 convertendo,
// 4 pronto, 5 erro, 6 envio falhou.
const ESTADO_POR_STATUS = { 0: 'enviando', 1: 'processando', 2: 'processando', 3: 'processando', 4: 'pronto', 5: 'erro', 6: 'erro' };

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function ehObraDeVideo(serie) {
  return !!serie && TIPOS_DE_VIDEO.includes(serie.content_type);
}

async function lerLimiteBytes() {
  const doc = await Setting.findOne({ key: CHAVE_LIMITE_MB_VIDEO }).lean();
  const texto = doc ? String(doc.value).trim() : '';
  const n = Number.parseInt(texto, 10);
  const mb = Number.isInteger(n) && n > 0 && String(n) === texto ? n : LIMITE_MB_VIDEO_PADRAO;
  return mb * BYTES_POR_MB;
}

/** O que o portal mostra do vídeo de um episódio. */
function resumo(episode) {
  const v = episode && episode.videoEnvio;
  if (!v || !v.videoId) return { estado: 'sem-video', videoId: null, atualizadoEm: null };
  // Vídeo trocado pelo admin depois: o envio do autor não vale mais.
  if (episode.bunnyVideoId !== v.videoId) return { estado: 'sem-video', videoId: null, atualizadoEm: null };
  return { estado: v.estado || 'enviando', videoId: v.videoId, atualizadoEm: v.atualizadoEm ?? null, autorizadoAte: v.autorizadoAte ?? null };
}

function autorizacaoPara(videoId, limiteBytes, validadeSegundos) {
  const expira = Math.floor(Date.now() / 1000) + validadeSegundos;
  return {
    videoId,
    libraryId: bunnyStream.libraryId(),
    endpoint: bunnyStream.ENDPOINT_TUS,
    assinatura: bunnyStream.assinaturaTus(videoId, expira),
    expira,
    validadeSegundos,
    tamanhoMaximo: limiteBytes,
  };
}

/** Vídeo pronto para ir à fila: o do autor, pronto; ou um que o admin pôs e já tem endereço. */
function temVideoPronto(episode) {
  const r = resumo(episode);
  if (r.estado === 'pronto') return true;
  return r.estado === 'sem-video' && !!episode.video_url;
}

/**
 * Última conferência antes de publicar um episódio com vídeo de AUTOR: pergunta
 * ao Bunny como o vídeo está AGORA. Se ele deixou de estar pronto (voltou a
 * processar, deu erro: o arquivo foi trocado depois de o moderador ver), o
 * episódio sai da fila e volta para o autor, pelo mesmo caminho do webhook
 * (`aplicarStatusDoBunny`), e a aprovação é recusada. Cobre o aviso do Bunny
 * que se perdeu no caminho.
 *
 * Não trava a moderação por causa do Bunny: sem resposta (fora do ar, vídeo
 * não encontrado na consulta), a aprovação segue, com registro no log.
 * Vídeo posto pelo admin não passa por aqui.
 */
async function conferirAntesDeAprovar(episode) {
  const atual = resumo(episode);
  if (!atual.videoId || !bunnyStream.isConfigured()) return { ok: true };
  let video;
  try {
    video = await bunnyStream.getVideo(atual.videoId);
  } catch (e) {
    logger.error(`[VideoAutor] Aprovação sem conferir o vídeo ${atual.videoId} no Bunny (consulta falhou)`, e);
    return { ok: true };
  }
  if (!video || ESTADO_POR_STATUS[video.status] === undefined || ESTADO_POR_STATUS[video.status] === 'pronto') return { ok: true };
  await aplicarStatusDoBunny(atual.videoId, video.status);
  return { ok: false, mensagem: 'O vídeo deste episódio mudou depois de enviado para aprovação. O episódio saiu da fila e voltou para o autor.' };
}

/**
 * Autorização para o navegador enviar o vídeo do episódio direto ao Bunny.
 * `episode` e `series` já vêm conferidos pela rota: são do dono logado.
 * - `renovar`: o envio em andamento passou da validade; devolve outra
 *   autorização para o MESMO vídeo.
 * - senão: vídeo novo. Se o episódio já tinha um vídeo enviado pelo autor, o
 *   antigo é apagado do Bunny depois da troca.
 */
async function autorizarEnvio({ episode, series, tamanho, tipo, renovar = false }) {
  if (!ehObraDeVideo(series)) {
    throw erro(400, 'Esta obra é de quadrinhos: o capítulo recebe painéis, não vídeo.');
  }
  if (episode.status !== 'draft') {
    throw erro(403, 'Só é possível enviar o vídeo de um episódio em rascunho.');
  }
  if (episode.submittedAt) {
    throw erro(403, 'Episódio em análise não pode receber outro vídeo. Aguarde a aprovação ou a devolução.');
  }
  if (!bunnyStream.isConfigured()) {
    throw erro(503, 'O envio de vídeo não está configurado no servidor.');
  }
  const limiteBytes = await lerLimiteBytes();

  if (renovar) {
    const atual = resumo(episode);
    if (atual.estado !== 'enviando') throw erro(409, 'Não há envio de vídeo em andamento neste episódio. Comece o envio de novo.');
    const renovada = autorizacaoPara(atual.videoId, limiteBytes, VALIDADE_MINIMA_SEGUNDOS);
    const gravou = await Episode.updateOne(
      { _id: episode._id, status: 'draft', submittedAt: null, bunnyVideoId: atual.videoId, 'videoEnvio.estado': 'enviando' },
      { $max: { 'videoEnvio.autorizadoAte': new Date(renovada.expira * 1000) } }
    );
    if (gravou.matchedCount === 0) throw erro(409, 'Não há envio de vídeo em andamento neste episódio. Comece o envio de novo.');
    return renovada;
  }

  if (tamanho !== undefined && tamanho !== null) {
    if (!Number.isInteger(tamanho) || tamanho <= 0) throw erro(400, 'Tamanho do arquivo inválido.');
    if (tamanho > limiteBytes) {
      throw erro(413, `O vídeo passa do tamanho máximo de ${Math.round(limiteBytes / BYTES_POR_MB)} MB.`);
    }
  }
  if (tipo !== undefined && tipo !== null && tipo !== '' && !TIPOS_DE_ARQUIVO.includes(tipo)) {
    throw erro(400, 'Apenas MP4, MOV e MKV são permitidos.');
  }

  let videoId;
  try {
    videoId = await bunnyStream.createVideo(`${series.title} - EP ${episode.episode_number} - ${episode.title}`.slice(0, 200));
  } catch (e) {
    logger.error('[VideoAutor] Falha ao criar o vídeo no Bunny Stream', e);
    throw erro(502, 'Não foi possível preparar o envio do vídeo. Tente de novo.');
  }

  const autorizacao = autorizacaoPara(videoId, limiteBytes, validadePara(tamanho));

  // A guarda de rascunho vai no filtro do próprio update: um "Enviar para
  // aprovação" feito no meio do caminho não é atropelado. `status` NÃO muda:
  // o episódio do autor nunca passa por 'processing'.
  const antigo = await Episode.findOneAndUpdate(
    { _id: episode._id, status: 'draft', submittedAt: null },
    {
      $set: {
        bunnyVideoId: videoId,
        videoEnvio: { videoId, estado: 'enviando', atualizadoEm: new Date(), autorizadoAte: new Date(autorizacao.expira * 1000) },
      },
      $unset: { video_url: 1 },
    },
    { new: false }
  ).select('bunnyVideoId videoEnvio').lean();
  if (!antigo) {
    await bunnyStream.deleteVideo(videoId).catch(e => logger.error(`[VideoAutor] Vídeo ${videoId} ficou sem episódio no Bunny`, e));
    throw erro(409, 'O episódio mudou durante o pedido (foi enviado para aprovação ou apagado). Nada foi alterado.');
  }

  // O vídeo que o autor tinha enviado antes sai do Bunny. Só o que ESTE fluxo
  // criou: vídeo posto pelo admin nunca é apagado aqui.
  const anterior = antigo.videoEnvio && antigo.videoEnvio.videoId;
  if (anterior && anterior !== videoId) {
    await bunnyStream.deleteVideo(anterior).catch(e => logger.error(`[VideoAutor] Falha ao apagar o vídeo anterior ${anterior}`, e));
  }

  return autorizacao;
}

/**
 * Um estado do Bunny para o vídeo `videoGuid`. Se o vídeo é de AUTOR, grava
 * só o estado do vídeo (e o endereço, quando pronto) e devolve o episódio:
 * quem chamou NÃO publica nem avisa ninguém. Se não é de autor, devolve null
 * e quem chamou segue o caminho de sempre (o do admin).
 */
async function aplicarStatusDoBunny(videoGuid, statusDoBunny) {
  if (!videoGuid) return null;
  const estado = ESTADO_POR_STATUS[statusDoBunny];
  const filtro = { bunnyVideoId: String(videoGuid), 'videoEnvio.videoId': String(videoGuid) };
  if (!estado) return Episode.findOne(filtro);

  const set = { 'videoEnvio.estado': estado, 'videoEnvio.atualizadoEm': new Date() };
  const cdn = process.env.BUNNY_CDN_HOSTNAME;
  if (estado === 'pronto' && cdn) set.video_url = `https://${cdn}/${videoGuid}/playlist.m3u8`;
  const antes = await Episode.findOneAndUpdate(filtro, { $set: set }, { new: false }).select('videoEnvio status submittedAt title').lean();
  if (!antes) return null;

  // O vídeo já estava pronto e o Bunny diz que ele mudou (voltou a processar,
  // deu erro): o arquivo foi trocado depois de pronto. Se o episódio está na
  // fila, sai dela e volta para o autor, que envia de novo quando o vídeo
  // estiver pronto: o moderador não aprova um vídeo diferente do que viu.
  // Publicado não é tirado do ar daqui (pode ser reprocessamento pedido no
  // painel do Bunny): fica o registro no log.
  const deixouDeEstarPronto = antes.videoEnvio && antes.videoEnvio.estado === 'pronto' && estado !== 'pronto';
  if (deixouDeEstarPronto && antes.status === 'published') {
    logger.error(`[VideoAutor] O vídeo ${videoGuid} do episódio PUBLICADO "${antes.title}" mudou no Bunny depois de pronto (estado ${statusDoBunny}). Conferir o vídeo no ar.`);
  } else if (deixouDeEstarPronto && antes.submittedAt) {
    await Episode.updateOne({ _id: antes._id, status: { $ne: 'published' }, 'videoEnvio.videoId': String(videoGuid) }, { $set: { submittedAt: null } });
    logger.warn(`[VideoAutor] O vídeo ${videoGuid} mudou depois de enviado para aprovação: episódio "${antes.title}" saiu da fila.`);
  }
  return Episode.findById(antes._id);
}

/**
 * Estado do vídeo para o portal. Enquanto o vídeo não chegou a um estado
 * final, confere com o Bunny (o aviso de vídeo pronto não depende só do
 * webhook, que pode se perder), no máximo uma vez a cada poucos segundos.
 */
async function consultarEstado(episode) {
  let atual = resumo(episode);
  const emAndamento = atual.estado === 'enviando' || atual.estado === 'processando';
  const recente = atual.atualizadoEm && Date.now() - new Date(atual.atualizadoEm).getTime() < INTERVALO_DE_CONSULTA_MS;
  if (emAndamento && !recente && bunnyStream.isConfigured()) {
    try {
      const video = await bunnyStream.getVideo(atual.videoId);
      if (video) {
        const depois = await aplicarStatusDoBunny(atual.videoId, video.status);
        if (depois) atual = resumo(depois);
      }
    } catch (e) {
      logger.error(`[VideoAutor] Falha ao consultar o vídeo ${atual.videoId} no Bunny`, e);
    }
  }
  return { ...atual, pronto: atual.estado === 'pronto' };
}

module.exports = {
  autorizarEnvio,
  aplicarStatusDoBunny,
  consultarEstado,
  resumo,
  temVideoPronto,
  conferirAntesDeAprovar,
  validadePara,
  ehObraDeVideo,
  lerLimiteBytes,
  TIPOS_DE_VIDEO,
  TIPOS_DO_PORTAL,
  TIPOS_DE_ARQUIVO,
  VALIDADE_SEGUNDOS,
  CHAVE_LIMITE_MB_VIDEO,
  LIMITE_MB_VIDEO_PADRAO,
};
