/**
 * Edição de episódio publicado com aprovação (Fase 7, frente A, item 7).
 *
 * Em episódio PUBLICADO, o que o autor faz na grade (item 6) e o reenvio da
 * pasta (item 3) não tocam o episódio: gravam numa revisão
 * (models/RevisaoEpisodio.js). O leitor continua na versão do ar. O autor
 * envia a revisão para aprovação; a fila do moderador mostra a revisão, que
 * ele lê no leitor (item 8); aprovar troca os painéis do episódio DE UMA VEZ
 * e apaga do Bunny os arquivos que saíram; devolver guarda o motivo, que o
 * autor vê, e nada muda no ar.
 *
 * Sem novo aviso de capítulo novo (risco R7): aprovar uma edição NÃO chama
 * notifyEpisodePublished nem o recálculo de recomendação. O progresso de quem
 * estava no meio da leitura pode deslocar (R8), aceito na proposta.
 */
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const RevisaoEpisodio = require('../models/RevisaoEpisodio');
const MensagemPortal = require('../models/MensagemPortal');

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

const MSG_EM_ANALISE = 'A edição deste episódio está em análise. Aguarde a aprovação ou a devolução.';

/** O que as telas precisam saber de uma revisão (sem os painéis). */
function resumo(rev) {
  if (!rev) return null;
  return {
    episodeId: String(rev._id),
    status: rev.status === 'aprovando' ? 'enviada' : rev.status,
    submittedAt: rev.submittedAt ?? null,
    totalPaineis: (rev.panels || []).length,
    devolucao: rev.devolucao && rev.devolucao.motivo ? { motivo: rev.devolucao.motivo, em: rev.devolucao.em } : null,
    updatedAt: rev.updatedAt ?? null,
  };
}

/**
 * A revisão em que o autor está mexendo; se o episódio ainda não tem, nasce
 * agora como cópia dos painéis publicados (mesmos `_id`: o painel clicado na
 * grade é o mesmo na revisão). Upsert pelo `_id` do episódio: dois pedidos ao
 * mesmo tempo criam UMA revisão.
 */
async function abrirParaEdicao(episode, user) {
  let rev;
  try {
    rev = await RevisaoEpisodio.findOneAndUpdate(
      { _id: episode._id },
      {
        $setOnInsert: {
          seriesId: episode.seriesId,
          userId: user.id,
          panels: (episode.toObject ? episode.toObject() : episode).panels || [],
          status: 'editando',
        },
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    if (e && e.code === 11000) rev = await RevisaoEpisodio.findById(episode._id);
    else throw e;
  }
  if (!rev) throw erro(409, 'Não foi possível abrir a edição deste episódio. Tente de novo.');
  if (rev.status !== 'editando') throw erro(403, MSG_EM_ANALISE);
  return rev;
}

/** Autor envia a edição para aprovação. */
async function enviarParaAprovacao(episodeId) {
  const rev = await RevisaoEpisodio.findById(episodeId).select('status panels').lean();
  if (!rev) throw erro(400, 'Este episódio não tem edição para enviar. Faça a mudança primeiro.');
  if (rev.status !== 'editando') throw erro(400, 'A edição já foi enviada para aprovação. Aguarde a revisão do editor.');
  if (!rev.panels || rev.panels.length === 0) throw erro(400, 'A edição ficou sem nenhum painel. Um episódio publicado precisa de ao menos um.');
  const enviada = await RevisaoEpisodio.findOneAndUpdate(
    { _id: episodeId, status: 'editando', 'panels.0': { $exists: true } },
    { $set: { status: 'enviada', submittedAt: new Date() } },
    { new: true }
  );
  if (!enviada) throw erro(409, 'A edição mudou durante o envio. Atualize a tela e tente de novo.');
  return resumo(enviada);
}

function urlsDe(doc) {
  const urls = [];
  for (const p of (doc && doc.panels) || []) {
    if (p.image_url) urls.push(p.image_url);
    for (const c of p.translationLayers || []) if (c.imageUrl) urls.push(c.imageUrl);
  }
  return urls;
}

/** Autor desiste da edição: a revisão some e os arquivos que só ela usava saem do Bunny. */
async function descartar(episodeId) {
  const rev = await RevisaoEpisodio.findOneAndDelete({ _id: episodeId, status: 'editando' }).lean();
  if (!rev) {
    const existe = await RevisaoEpisodio.exists({ _id: episodeId });
    if (existe) throw erro(403, MSG_EM_ANALISE);
    return { descartada: false, apagadosDoBunny: 0 };
  }
  const limpeza = await require('./envioEpisodioService').apagarUrlsSemUso([...urlsDe(rev), rev.thumbnail]);
  return { descartada: true, apagadosDoBunny: limpeza.apagados, naoApagados: limpeza.falhas };
}

/**
 * Episódio(s) que o admin acabou de APAGAR: a edição pendente de cada um não
 * tem mais para onde ir. Sai junto, e com ela os arquivos que só ela usava
 * (os que o autor subiu para a edição). Os arquivos do próprio episódio
 * apagado ficam onde estavam, como sempre foi ao apagar episódio.
 * `episodios`: os documentos como eram ANTES de apagar (painéis e capa).
 */
async function removerComOsEpisodios(episodios) {
  const lista = (episodios || []).filter(Boolean);
  if (lista.length === 0) return { removidas: 0, apagadosDoBunny: 0, naoApagados: [] };
  const revisoes = await RevisaoEpisodio.find({ _id: { $in: lista.map(e => e._id) } }).lean();
  if (revisoes.length === 0) return { removidas: 0, apagadosDoBunny: 0, naoApagados: [] };
  await RevisaoEpisodio.deleteMany({ _id: { $in: revisoes.map(r => r._id) } });

  const epPorId = new Map(lista.map(e => [String(e._id), e]));
  const soDaRevisao = [];
  for (const rev of revisoes) {
    const ep = epPorId.get(String(rev._id));
    const doEpisodio = new Set([...urlsDe(ep), ep && ep.thumbnail]);
    for (const u of [...urlsDe(rev), rev.thumbnail]) if (u && !doEpisodio.has(u)) soDaRevisao.push(u);
  }
  const limpeza = await require('./envioEpisodioService').apagarUrlsSemUso(soDaRevisao);
  return { removidas: revisoes.length, apagadosDoBunny: limpeza.apagados, naoApagados: limpeza.falhas };
}

/**
 * Moderador aprova: os painéis da revisão viram os do episódio num único
 * update; só depois a revisão é apagada e os arquivos que saíram, também.
 */
async function aprovar(episodeId) {
  const rev = await RevisaoEpisodio.findOneAndUpdate(
    { _id: episodeId, status: 'enviada' },
    { $set: { status: 'aprovando' } },
    { new: true }
  ).lean();
  if (!rev) {
    const existe = await RevisaoEpisodio.exists({ _id: episodeId });
    throw existe
      ? erro(400, 'Esta edição não está aguardando aprovação (nada a aprovar).')
      : erro(404, 'Edição não encontrada.');
  }
  const destravar = () => RevisaoEpisodio.updateOne({ _id: episodeId, status: 'aprovando' }, { $set: { status: 'enviada' } });

  try {
    if (!rev.panels || rev.panels.length === 0) throw erro(400, 'A edição não tem nenhum painel.');
    const atual = await Episode.findById(episodeId).select('status panels thumbnail').lean();
    if (!atual) throw erro(404, 'Episódio não encontrado.');
    if (atual.status !== 'published') throw erro(409, 'O episódio não está mais publicado. Nada foi trocado.');

    const set = { panels: rev.panels };
    const imagensNovas = new Set(rev.panels.map(p => p.image_url));
    const imagensAntigas = new Set((atual.panels || []).map(p => p.image_url));
    let capaAntiga = null;
    if (rev.thumbnail) {
      set.thumbnail = rev.thumbnail;
      // Capa gravada por um envio de pasta (pasta ep-..) sai junto; a de
      // upload avulso fica em covers/ e pode ser a mesma da obra.
      if (atual.thumbnail && /\/ep-\d+\//.test(atual.thumbnail)) capaAntiga = atual.thumbnail;
    } else if (atual.thumbnail && imagensAntigas.has(atual.thumbnail) && !imagensNovas.has(atual.thumbnail)) {
      // Capa automática (a imagem de um painel que saiu): passa a ser o 1o painel novo.
      set.thumbnail = rev.panels[0].image_url;
    }

    const antigo = await Episode.findOneAndUpdate(
      { _id: episodeId, status: 'published' },
      { $set: set, $inc: { __v: 1 } },
      { new: false }
    ).lean();
    if (!antigo) throw erro(409, 'O episódio mudou durante a aprovação. Nada foi trocado.');

    await RevisaoEpisodio.deleteOne({ _id: episodeId });
    // R7: NÃO chama notifyEpisodePublished nem dispararRecalculo. É uma
    // correção do que já está no ar, não um capítulo novo.
    const limpeza = await require('./envioEpisodioService').apagarUrlsSemUso([...urlsDe(antigo), capaAntiga]);
    const episode = await Episode.findById(episodeId).lean();
    return { episode, totalPaineis: rev.panels.length, apagadosDoBunny: limpeza.apagados, naoApagados: limpeza.falhas };
  } catch (e) {
    await destravar();
    throw e;
  }
}

/**
 * Moderador devolve: a revisão volta para o autor com o motivo; o episódio no
 * ar não é tocado. O motivo também entra na conversa do canal, como nas
 * devoluções de obra e de capítulo novo.
 */
async function devolver(episodeId, texto, adminId) {
  const motivo = typeof texto === 'string' ? texto.trim() : '';
  if (!motivo) throw erro(400, 'texto é obrigatório.');
  const episode = await Episode.findById(episodeId).select('seriesId title').lean();
  const serie = episode ? await Series.findById(episode.seriesId).select('channelId').lean() : null;
  const canal = serie && serie.channelId ? await Channel.findById(serie.channelId).lean() : null;

  const rev = await RevisaoEpisodio.findOneAndUpdate(
    { _id: episodeId, status: 'enviada' },
    { $set: { status: 'editando', submittedAt: null, devolucao: { motivo, em: new Date() } } },
    { new: true }
  );
  if (!rev) {
    const existe = await RevisaoEpisodio.exists({ _id: episodeId });
    throw existe
      ? erro(400, 'Este item não está aguardando aprovação (nada a devolver).')
      : erro(404, 'Edição não encontrada.');
  }

  let mensagem = null;
  if (canal) {
    mensagem = await MensagemPortal.create({
      canalId: canal._id,
      ownerUserId: canal.ownerId,
      autorTipo: 'editor',
      autorUserId: adminId,
      texto: motivo,
      refTipo: 'episode',
      refId: episodeId,
    });
  }
  return { revisao: resumo(rev), mensagem, canalId: canal ? String(canal._id) : null };
}

module.exports = { abrirParaEdicao, enviarParaAprovacao, descartar, aprovar, devolver, removerComOsEpisodios, resumo, MSG_EM_ANALISE };
