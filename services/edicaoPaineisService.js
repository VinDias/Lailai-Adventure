/**
 * Edição dos painéis de um episódio de Hi-Qua, um a um (Fase 7, frente A,
 * item 6): apagar um ou vários, trocar a imagem de um painel no lugar, trocar
 * ou remover o balão de um idioma. Serve a grade do Meu Estúdio e a do
 * Gerenciar Conteúdo (components/EnvioEpisodio/GradePaineis.tsx).
 *
 * Regras que não podem se perder:
 *
 * - GRAVAÇÃO ATÔMICA POR PAINEL. Nenhuma função aqui lê o episódio, mexe na
 *   lista e salva a lista inteira: foi isso que perdia balão no envio em lote
 *   (REGRESSOES.md, 24/11/2026). Cada ação é UM update no banco que toca só o
 *   painel dela, achado pelo `_id` do painel (e não pelo índice, que desloca
 *   quando outro painel é apagado ao mesmo tempo). Ações em paralelo no mesmo
 *   episódio não se atropelam (tests/backend/edicaoPaineis.test.js).
 * - GUARDA DENTRO DO UPDATE. O autor mexe em rascunho não enviado; a
 *   condição vai no filtro do próprio update, para um "Enviar para aprovação"
 *   feito no meio do caminho não ser atropelado. Admin mexe em qualquer um.
 *   Em episódio PUBLICADO o autor não toca o que está no ar: as mesmas ações
 *   gravam na revisão do episódio (item 7, `alvoDaEdicao`).
 *   Quem não é dono recebe 404 (mesma guarda do envio da pasta:
 *   envioEpisodioService.acessoAoEpisodio).
 * - ARQUIVO QUE SAI É APAGADO DO BUNNY, depois da gravação, pela função do
 *   item 3 (`apagarUrlsSemUso`): só URL do nosso CDN que nada mais usa.
 * - O SERVIDOR MONTA O NOME no Bunny (nome novo a cada troca: o CDN nunca
 *   serve a imagem antiga) e confere o arquivo pelo CONTEÚDO: página JPEG ou
 *   PNG, balão PNG, e balão do tamanho do painel quando o tamanho é conhecido.
 */
const mongoose = require('mongoose');
const Episode = require('../models/Episode');
const bunnyStorage = require('../utils/bunnyStorage');
const logger = require('../utils/logger');
const RevisaoEpisodio = require('../models/RevisaoEpisodio');
const envio = require('./envioEpisodioService');
const revisaoService = require('./revisaoEpisodioService');

const IDIOMAS = ['pt', 'en', 'es', 'zh'];
const MAXIMO_POR_PEDIDO = 500;

function erro(status, mensagem, extra = {}) {
  const e = new Error(mensagem);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

function idDePainel(valor) {
  if (typeof valor !== 'string' || !mongoose.Types.ObjectId.isValid(valor) || valor.length !== 24) {
    throw erro(404, 'Painel não encontrado.');
  }
  return new mongoose.Types.ObjectId(valor);
}

/**
 * Onde a edição grava.
 * - Admin: o próprio episódio, qualquer um.
 * - Dono, episódio em rascunho não enviado: o próprio episódio (a condição
 *   `guarda` entra em todo update).
 * - Dono, episódio PUBLICADO (item 7): a REVISÃO do episódio, nunca o que está
 *   no ar. Na primeira mudança a revisão nasce como cópia dos painéis
 *   publicados; com a revisão na fila do moderador, ninguém mexe (403).
 *   Para só ler (`leitura`), sem revisão ainda, mostra os painéis do ar.
 */
async function alvoDaEdicao(user, episodeId, { leitura = false } = {}) {
  const { episode, series, porAdmin, publicado } = await envio.acessoAoEpisodio(user, episodeId, { leitura, aceitaPublicado: true });
  if (!porAdmin && publicado) {
    const existente = leitura
      ? await RevisaoEpisodio.findById(episode._id).select('status').lean()
      : await revisaoService.abrirParaEdicao(episode, user);
    if (existente) {
      return {
        Model: RevisaoEpisodio,
        id: episode._id,
        guarda: leitura ? {} : { status: 'editando' },
        modo: 'revisao',
        episode,
        series,
        porAdmin: false,
      };
    }
    return { Model: Episode, id: episode._id, guarda: { status: 'published' }, modo: 'publicado', episode, series, porAdmin: false };
  }
  return {
    Model: Episode,
    id: episode._id,
    guarda: porAdmin ? {} : { status: 'draft', submittedAt: null },
    modo: porAdmin ? 'admin' : 'rascunho',
    episode,
    series,
    porAdmin,
  };
}

/**
 * Painel antigo pode não ter `_id` (gravado fora do Mongoose). A grade acha o
 * painel pelo `_id`, então quem não tem ganha um aqui: um update por painel,
 * condicionado à imagem daquele índice (se a lista mudou no meio, não casa e
 * nada é gravado no painel errado).
 */
async function garantirIds(alvo) {
  const doc = await alvo.Model.findById(alvo.id).select('panels').lean();
  if (!doc) return;
  const semId = (doc.panels || []).map((p, i) => ({ p, i })).filter(({ p }) => p && !p._id);
  for (const { p, i } of semId) {
    await alvo.Model.updateOne(
      { _id: alvo.id, [`panels.${i}.image_url`]: p.image_url, [`panels.${i}._id`]: { $exists: false } },
      { $set: { [`panels.${i}._id`]: new mongoose.Types.ObjectId() } }
    );
  }
}

async function lerPaineis(alvo) {
  const doc = await alvo.Model.findById(alvo.id).select('panels thumbnail').lean();
  if (!doc) throw erro(404, 'Episódio não encontrado.');
  return doc;
}

async function lerPainel(alvo, painelId, { comTodos = false } = {}) {
  const doc = await lerPaineis(alvo);
  const painel = (doc.panels || []).find(p => String(p._id) === String(painelId));
  if (!painel) throw erro(404, 'Painel não encontrado.');
  return comTodos ? { painel, panels: doc.panels || [] } : painel;
}

/**
 * Um update que não casou: o painel não existe (404) ou o episódio saiu do
 * estado em que o autor pode mexer enquanto o pedido estava a caminho (409).
 */
async function porQueNaoCasou(alvo, painelId) {
  const doc = await alvo.Model.findOne({ _id: alvo.id, ...alvo.guarda }).select('panels._id').lean();
  if (!doc) {
    return erro(409, alvo.modo === 'revisao'
      ? 'A edição mudou durante o pedido (foi enviada para aprovação ou descartada). Nada foi alterado.'
      : 'O episódio mudou durante a edição (foi enviado para aprovação ou apagado). Nada foi alterado.');
  }
  if (painelId && !(doc.panels || []).some(p => String(p._id) === String(painelId))) return erro(404, 'Painel não encontrado.');
  return erro(409, 'O painel mudou durante a edição. Atualize a tela e tente de novo.');
}

/** GET: os painéis como a grade precisa (todos com `_id`), e se dá para editar. */
async function listar({ user, episodeId }) {
  const alvo = await alvoDaEdicao(user, episodeId, { leitura: true });
  await garantirIds(alvo);
  const doc = await lerPaineis(alvo);
  let podeEditar = true;
  let motivo = null;
  let revisao = null;
  if (alvo.modo === 'revisao' || alvo.modo === 'publicado') {
    // Só leitura aqui: abrir a grade não cria a revisão (ela nasce na 1a mudança).
    const rev = alvo.modo === 'revisao' ? await RevisaoEpisodio.findById(alvo.id).lean() : null;
    revisao = revisaoService.resumo(rev);
    if (rev && rev.status !== 'editando') {
      podeEditar = false;
      motivo = revisaoService.MSG_EM_ANALISE;
    }
  } else {
    try {
      await alvoDaEdicao(user, episodeId);
    } catch (e) {
      if (e.status !== 403) throw e;
      podeEditar = false;
      motivo = e.message;
    }
  }
  const { ALTURA_MAXIMA } = await envio.carregarRegras();
  return {
    episodeId: String(alvo.id),
    modo: alvo.modo,
    podeEditar,
    motivo,
    revisao,
    panels: doc.panels || [],
    alturaMaxima: ALTURA_MAXIMA,
    tamanhoMaximoArquivo: envio.TAMANHO_MAXIMO_PARTE,
  };
}

/** Apaga um ou vários painéis, num único `$pull`. `paineis`: ids. */
async function apagarPaineis({ user, episodeId, paineis }) {
  if (!Array.isArray(paineis) || paineis.length === 0) throw erro(400, 'Informe os painéis a apagar.');
  if (paineis.length > MAXIMO_POR_PEDIDO) throw erro(400, `No máximo ${MAXIMO_POR_PEDIDO} painéis por pedido.`);
  const ids = paineis.map(idDePainel);
  const alvo = await alvoDaEdicao(user, episodeId);
  await garantirIds(alvo);

  // `panels._id` no filtro: pedido que não acha nenhum painel não toca o episódio.
  const antigo = await alvo.Model.findOneAndUpdate(
    { _id: alvo.id, ...alvo.guarda, 'panels._id': { $in: ids } },
    { $pull: { panels: { _id: { $in: ids } } }, $inc: { __v: 1 } },
    { new: false }
  ).select('panels').lean();
  if (!antigo) {
    const existe = await alvo.Model.exists({ _id: alvo.id, ...alvo.guarda });
    throw existe ? erro(404, 'Painel não encontrado.') : await porQueNaoCasou(alvo, null);
  }

  const pedidos = new Set(ids.map(String));
  const removidos = (antigo.panels || []).filter(p => pedidos.has(String(p._id)));
  if (removidos.length === 0) throw erro(404, 'Painel não encontrado.');

  const urls = removidos.flatMap(p => [p.image_url, ...(p.translationLayers || []).map(c => c.imageUrl)]);
  const limpeza = await envio.apagarUrlsSemUso(urls);
  return {
    removidos: removidos.map(p => String(p._id)),
    totalPaineis: (antigo.panels || []).length - removidos.length,
    apagadosDoBunny: limpeza.apagados,
    naoApagados: limpeza.falhas,
  };
}

/** Tipo e tamanho do arquivo recebido, pelo conteúdo. */
async function conferirArquivo(buffer, { tiposAceitos, mensagemTipo }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw erro(400, 'Envie o arquivo da imagem.');
  const { tipoPeloConteudo, tamanhoPeloCabecalho } = await envio.carregarRegras();
  const tipo = tipoPeloConteudo(buffer);
  if (!tiposAceitos.includes(tipo)) throw erro(400, mensagemTipo);
  const tamanho = tamanhoPeloCabecalho(buffer);
  if (!tamanho) throw erro(400, 'Não foi possível ler o tamanho da imagem.');
  return { tipo, ...tamanho };
}

async function caminhoNovo(alvo, nome) {
  if (!bunnyStorage.isConfigured() && !bunnyStorage.hasTestUploader()) {
    throw erro(500, 'BUNNY_STORAGE_ZONE e BUNNY_STORAGE_KEY não configurados no .env.');
  }
  // Mesma pasta do envio (lorflux/series/<obra>/ep-<nn>/<carimbo>-<6>): uma
  // subpasta por troca, então o nome nunca repete.
  return `${envio.pastaDoEpisodio(alvo.series, alvo.episode, new mongoose.Types.ObjectId())}/${nome}`;
}

async function subir(buffer, caminho, tipo) {
  try {
    return await bunnyStorage.uploadBufferToStorage(buffer, caminho, tipo === 'png' ? 'image/png' : 'image/jpeg');
  } catch (e) {
    logger.error(`[EdicaoPaineis] Falha ao subir ${caminho}`, e);
    throw erro(502, 'A imagem não chegou ao Bunny. Tente de novo.');
  }
}

async function desfazerEnvio(caminho) {
  await envio.apagarCaminhos([caminho]);
}

/**
 * Troca a imagem de UM painel, no lugar (posição e balões ficam). Autor: até
 * 1280 px de altura (regra do Studio). Painel com balão e tamanho conhecido:
 * a imagem nova tem de ter o mesmo tamanho, senão o balão sai do lugar.
 */
async function trocarImagem({ user, episodeId, painelId, buffer }) {
  const pid = idDePainel(painelId);
  const alvo = await alvoDaEdicao(user, episodeId);
  await garantirIds(alvo);
  const arq = await conferirArquivo(buffer, { tiposAceitos: ['jpeg', 'png'], mensagemTipo: 'A imagem do painel tem de ser JPEG ou PNG.' });
  const { painel, panels } = await lerPainel(alvo, pid, { comTodos: true });

  const temBalao = (painel.translationLayers || []).length > 0;
  if (temBalao && painel.largura && painel.altura && (arq.largura !== painel.largura || arq.altura !== painel.altura)) {
    throw erro(400, `Este painel tem balões de ${painel.largura}x${painel.altura}; a imagem nova tem ${arq.largura}x${arq.altura}. Use o mesmo tamanho ou remova os balões antes.`);
  }
  const { ALTURA_MAXIMA } = await envio.carregarRegras();
  if (!alvo.porAdmin && arq.altura > ALTURA_MAXIMA) {
    throw erro(400, `A imagem tem ${arq.altura} px de altura; o máximo de um painel é ${ALTURA_MAXIMA}. Para página alta, use "Enviar pasta do episódio".`);
  }

  // Limite de MB do episódio, pela mesma regra do envio da pasta (o teto de
  // 8 MB por arquivo já foi conferido na rota).
  await envio.conferirTetoNaTroca(panels, painel.bytes, buffer.length);

  const caminho = await caminhoNovo(alvo, `painel-${String(pid).slice(-6)}.${arq.tipo === 'png' ? 'png' : 'jpg'}`);
  const url = await subir(buffer, caminho, arq.tipo);

  const antigo = await alvo.Model.findOneAndUpdate(
    { _id: alvo.id, ...alvo.guarda, 'panels._id': pid },
    { $set: { 'panels.$.image_url': url, 'panels.$.largura': arq.largura, 'panels.$.altura': arq.altura, 'panels.$.bytes': buffer.length }, $inc: { __v: 1 } },
    { new: false }
  ).select('panels thumbnail').lean();
  if (!antigo) {
    await desfazerEnvio(caminho);
    throw await porQueNaoCasou(alvo, pid);
  }
  const urlAntiga = (antigo.panels || []).find(p => String(p._id) === String(pid))?.image_url;

  // Capa automática do portal (a imagem do painel): acompanha a imagem nova.
  if (urlAntiga && antigo.thumbnail === urlAntiga) {
    await alvo.Model.updateOne({ _id: alvo.id, thumbnail: urlAntiga }, { $set: { thumbnail: url } });
  }
  const limpeza = await envio.apagarUrlsSemUso([urlAntiga]);
  return { panel: await lerPainel(alvo, pid), apagadosDoBunny: limpeza.apagados, naoApagados: limpeza.falhas };
}

/**
 * Põe ou troca o balão de UM idioma de UM painel. PNG, do tamanho do painel
 * quando o tamanho é conhecido (regra do Studio: balão de tamanho diferente
 * fica fora do lugar no leitor).
 */
async function trocarBalao({ user, episodeId, painelId, idioma, buffer }) {
  const pid = idDePainel(painelId);
  if (!IDIOMAS.includes(idioma)) throw erro(400, `Idioma deve ser um de: ${IDIOMAS.join(', ')}.`);
  const alvo = await alvoDaEdicao(user, episodeId);
  await garantirIds(alvo);
  const arq = await conferirArquivo(buffer, { tiposAceitos: ['png'], mensagemTipo: 'O balão tem de ser PNG.' });
  const { painel, panels } = await lerPainel(alvo, pid, { comTodos: true });
  if (painel.largura && painel.altura && (arq.largura !== painel.largura || arq.altura !== painel.altura)) {
    throw erro(400, `O balão tem ${arq.largura}x${arq.altura}; o painel tem ${painel.largura}x${painel.altura}. O balão tem de ter o tamanho do painel.`);
  }
  const balaoAtual = (painel.translationLayers || []).find(c => c.language === idioma);
  await envio.conferirTetoNaTroca(panels, balaoAtual ? balaoAtual.bytes : 0, buffer.length);
  const bytes = buffer.length;

  const caminho = await caminhoNovo(alvo, `balao-${String(pid).slice(-6)}-${idioma}.png`);
  const url = await subir(buffer, caminho, 'png');

  const base = { _id: alvo.id, ...alvo.guarda };
  let urlAntiga = null;
  let gravou = false;
  for (let tentativa = 0; tentativa < 5 && !gravou; tentativa++) {
    // 1) O painel já tem esse idioma: troca só a URL (e guarda a que sai).
    const troca = await alvo.Model.findOneAndUpdate(
      { ...base, panels: { $elemMatch: { _id: pid, 'translationLayers.language': idioma } } },
      { $set: { 'panels.$[p].translationLayers.$[c].imageUrl': url, 'panels.$[p].translationLayers.$[c].bytes': bytes }, $inc: { __v: 1 } },
      { new: false, arrayFilters: [{ 'p._id': pid }, { 'c.language': idioma }] }
    ).select('panels').lean();
    if (troca) {
      const antes = (troca.panels || []).find(p => String(p._id) === String(pid));
      urlAntiga = (antes?.translationLayers || []).find(c => c.language === idioma)?.imageUrl ?? null;
      gravou = true;
      break;
    }
    // 2) Ainda não tem: acrescenta. O `$ne` impede duplicar o idioma se outro
    //    pedido o criou entre o passo 1 e este.
    const acrescenta = await alvo.Model.updateOne(
      { ...base, panels: { $elemMatch: { _id: pid, translationLayers: { $type: 'array' }, 'translationLayers.language': { $ne: idioma } } } },
      { $push: { 'panels.$.translationLayers': { language: idioma, imageUrl: url, bytes } }, $inc: { __v: 1 } }
    );
    if (acrescenta.matchedCount > 0) { gravou = true; break; }
    // 3) Painel antigo sem a lista de balões: cria a lista com este.
    const cria = await alvo.Model.updateOne(
      { ...base, panels: { $elemMatch: { _id: pid, translationLayers: null } } },
      { $set: { 'panels.$.translationLayers': [{ language: idioma, imageUrl: url, bytes }] }, $inc: { __v: 1 } }
    );
    if (cria.matchedCount > 0) { gravou = true; break; }

    const motivo = await porQueNaoCasou(alvo, pid);
    if (motivo.message.startsWith('O painel mudou')) continue; // outro pedido mexeu no mesmo painel: tenta de novo
    await desfazerEnvio(caminho);
    throw motivo;
  }
  if (!gravou) {
    await desfazerEnvio(caminho);
    throw erro(409, 'O painel mudou durante a edição. Atualize a tela e tente de novo.');
  }

  const limpeza = await envio.apagarUrlsSemUso([urlAntiga]);
  return { panel: await lerPainel(alvo, pid), apagadosDoBunny: limpeza.apagados, naoApagados: limpeza.falhas };
}

/** Remove o balão de UM idioma de UM painel (`$pull` no próprio painel). */
async function removerBalao({ user, episodeId, painelId, idioma }) {
  const pid = idDePainel(painelId);
  if (!IDIOMAS.includes(idioma)) throw erro(400, `Idioma deve ser um de: ${IDIOMAS.join(', ')}.`);
  const alvo = await alvoDaEdicao(user, episodeId);
  await garantirIds(alvo);

  const antigo = await alvo.Model.findOneAndUpdate(
    { _id: alvo.id, ...alvo.guarda, 'panels._id': pid },
    { $pull: { 'panels.$.translationLayers': { language: idioma } }, $inc: { __v: 1 } },
    { new: false }
  ).select('panels').lean();
  if (!antigo) throw await porQueNaoCasou(alvo, pid);

  const antes = (antigo.panels || []).find(p => String(p._id) === String(pid));
  const saiu = (antes?.translationLayers || []).filter(c => c.language === idioma).map(c => c.imageUrl);
  const limpeza = await envio.apagarUrlsSemUso(saiu);
  return { panel: await lerPainel(alvo, pid), removido: saiu.length > 0, apagadosDoBunny: limpeza.apagados, naoApagados: limpeza.falhas };
}

module.exports = { listar, apagarPaineis, trocarImagem, trocarBalao, removerBalao, alvoDaEdicao, IDIOMAS };
