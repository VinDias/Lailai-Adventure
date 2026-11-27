/**
 * Envio da pasta de um episódio de Hi-Qua (Fase 7, frente A, item 3).
 *
 * Três passos, para nenhum pedido carregar o episódio inteiro na memória (o
 * pm2 reinicia o site acima de 500 MB, ecosystem.config.js; o envio em lote
 * antigo guarda tudo na memória):
 *
 *  1. iniciarEnvio: recebe só a LISTA dos arquivos (nome, largura, altura),
 *     roda as regras de shared/organizacaoEpisodio.mjs (as mesmas da tela),
 *     aplica o limite de painéis depois do corte (Setting
 *     `limite_paineis_episodio`, padrão 100) e, só se o admin ligar, o de
 *     tamanho do episódio (Setting `limite_mb_episodio`, sobre os originais;
 *     vazio ou 0 = sem limite, que é o padrão desde 26/11/2026), e grava
 *     o que espera receber,
 *     com o nome que o SERVIDOR monta no Bunny:
 *       lorflux/series/<obra>/ep-<nn>/<envio>/pagina-008-2-en.png
 *     Uma subpasta por envio: nome novo a cada envio, então o CDN nunca serve
 *     a imagem antiga de um reenvio (não temos a chave para limpar o cache).
 *  2. receberParte: alguns arquivos por pedido (o navegador já cortou as
 *     páginas altas). Cada um é conferido pelo CONTEÚDO (tipo e tamanho pelo
 *     cabeçalho) contra o que foi anunciado, e sobe ao Bunny. Mandar a mesma
 *     parte de novo sobrescreve: é a nova tentativa só do que falhou.
 *  3. concluirEnvio: com tudo recebido, troca os painéis do episódio num único
 *     updateOne, e só depois apaga do Bunny os arquivos da versão anterior que
 *     eram só deste episódio.
 *
 * Quem pode: admin em qualquer episódio; dono do canal em episódio em
 * rascunho NÃO enviado para aprovação (mesma regra de routes/portal.js) e, no
 * item 7, em episódio PUBLICADO: aí o envio não troca o episódio, grava a
 * revisão que o moderador aprova (services/revisaoEpisodioService.js).
 */
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const Setting = require('../models/Setting');
const EnvioEpisodio = require('../models/EnvioEpisodio');
const RevisaoEpisodio = require('../models/RevisaoEpisodio');
const bunnyStorage = require('../utils/bunnyStorage');
const { toSlug } = require('../utils/slug');
const { isAdminUser } = require('../utils/ownership');
const logger = require('../utils/logger');

const CHAVE_LIMITE = 'limite_paineis_episodio';
const CHAVE_LIMITE_MB = 'limite_mb_episodio';
const MAXIMO_ARQUIVOS_NA_LISTA = 2000;
// Por pedido de parte. O navegador agrupa os arquivos até esse total; o
// limite global de 300 pedidos por 15 min (server.js) impede um pedido por
// arquivo num episódio de 100 painéis com 4 idiomas (500 arquivos).
// 8 MB por parte: cada pedido fica na memória do processo
// até subir ao Bunny (multer em memória) e o pm2 reinicia acima de 500 MB,
// com vários autores enviando ao mesmo tempo. E cabe num client_max_body_size
// de 10M no nginx, que não está no repositório.
const TAMANHO_MAXIMO_PARTE = 8 * 1024 * 1024;
const ARQUIVOS_POR_PARTE = 60;
// Só vale com o limite de MB LIGADO no admin (sem limite, não há teto do
// episódio: o Vin pediu em 26/11/2026 para não barrar o autor por megabytes).
// O limite de MB conta os originais da pasta. O corte no navegador regrava as
// fatias: JPEG a 0,9 fica do mesmo tamanho, mas PNG de balão regravado pelo
// canvas cresce de 2 a 2,7 vezes (medido no Chromium com o HáQa Stone EP3 do
// Vin em 25/11/2026). O que chega de fato ao Bunny pode ir até 3 vezes o
// limite; acima disso a parte é recusada (é alguém mandando outra coisa).
const FOLGA_DO_CORTE = 3;
const ENVIOS_SIMULTANEOS_AO_BUNNY = 4;

let regras;
async function carregarRegras() {
  if (!regras) regras = await import('../shared/organizacaoEpisodio.mjs');
  return regras;
}

function erro(status, mensagem, extra = {}) {
  const e = new Error(mensagem);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

/** Inteiro positivo gravado no Setting, ou o padrão (vazio, texto, 0, 1.5). */
async function lerInteiroDoSetting(chave, padrao) {
  const doc = await Setting.findOne({ key: chave }).lean();
  const texto = doc ? String(doc.value).trim() : '';
  const n = Number.parseInt(texto, 10);
  return Number.isInteger(n) && n > 0 && String(n) === texto ? n : padrao;
}

async function lerLimitePaineis() {
  const { LIMITE_PAINEIS_PADRAO } = await carregarRegras();
  return lerInteiroDoSetting(CHAVE_LIMITE, LIMITE_PAINEIS_PADRAO);
}

/**
 * Limite de tamanho do episódio, em bytes (o Setting guarda MB). 0 = sem
 * limite, que é o padrão: Setting ausente, vazio, 0 ou ilegível.
 */
async function lerLimiteBytes() {
  const { LIMITE_MB_EPISODIO_PADRAO, BYTES_POR_MB } = await carregarRegras();
  return (await lerInteiroDoSetting(CHAVE_LIMITE_MB, LIMITE_MB_EPISODIO_PADRAO)) * BYTES_POR_MB;
}

/**
 * Quanto um episódio pode ocupar DE FATO no Bunny: o limite de MB vezes a
 * folga do corte (ver FOLGA_DO_CORTE). Uma regra só, para o envio da pasta
 * (partes recebidas) e para a troca de um arquivo pela grade (item 6).
 * 0 = sem teto (limite de MB desligado).
 */
async function tetoBytesDoEpisodio() {
  return (await lerLimiteBytes()) * FOLGA_DO_CORTE;
}

/** Soma dos bytes conhecidos dos painéis e balões (painel antigo sem `bytes` conta 0). */
function bytesDosPaineis(panels) {
  let soma = 0;
  for (const p of panels || []) {
    soma += p.bytes || 0;
    for (const c of p.translationLayers || []) soma += c.bytes || 0;
  }
  return soma;
}

/**
 * A regra do envio aplicada à troca de UM arquivo: o episódio, com o arquivo
 * novo no lugar do antigo, não pode passar do teto. Troca que não aumenta o
 * episódio sempre passa (o limite pode ter sido baixado depois no admin).
 */
async function conferirTetoNaTroca(panels, bytesQueSai, bytesQueEntra) {
  if (bytesQueEntra <= (bytesQueSai || 0)) return;
  const teto = await tetoBytesDoEpisodio();
  if (!teto) return; // sem limite de MB: o autor não é barrado pelo peso do episódio
  const depois = bytesDosPaineis(panels) - (bytesQueSai || 0) + bytesQueEntra;
  if (depois > teto) {
    const { BYTES_POR_MB } = await carregarRegras();
    const limiteMb = Math.round((await lerLimiteBytes()) / BYTES_POR_MB);
    throw erro(413, `Com este arquivo o episódio passa do tamanho máximo (limite de ${limiteMb} MB por episódio). Use um arquivo menor.`);
  }
}

async function configuracao() {
  const { ALTURA_MAXIMA } = await carregarRegras();
  return {
    limitePaineis: await lerLimitePaineis(),
    limiteBytes: await lerLimiteBytes(),
    alturaMaxima: ALTURA_MAXIMA,
    tamanhoMaximoParte: TAMANHO_MAXIMO_PARTE,
    arquivosPorParte: ARQUIVOS_POR_PARTE,
  };
}

/**
 * Episódio + série, se o usuário pode trocar os painéis dele. Mesmo critério
 * 404 (nunca confirma episódio alheio) e as mesmas mensagens 403 do portal.
 */
async function acessoAoEpisodio(user, episodeId, { leitura = false, aceitaPublicado = false } = {}) {
  let episode;
  try {
    episode = await Episode.findById(episodeId);
  } catch (e) {
    if (e.name === 'CastError') throw erro(404, 'Episódio não encontrado.');
    throw e;
  }
  if (!episode) throw erro(404, 'Episódio não encontrado.');
  const series = await Series.findById(episode.seriesId).select('title channelId content_type cover_image').lean();
  if (!series) throw erro(404, 'Episódio não encontrado.');

  if (isAdminUser(user)) return { episode, series, porAdmin: true };

  const canal = series.channelId
    ? await Channel.findOne({ _id: series.channelId, ownerId: user.id, isActive: true }).select('_id').lean()
    : null;
  if (!canal) throw erro(404, 'Episódio não encontrado.');
  // `leitura`: o dono só quer VER os painéis (grade do Meu Estúdio); as travas
  // de rascunho valem para quem vai mudar alguma coisa.
  // `publicado`: o dono mexe em episódio no ar só por meio de revisão (item 7).
  const publicado = episode.status === 'published';
  if (leitura) return { episode, series, porAdmin: false, publicado };
  if (publicado && aceitaPublicado) return { episode, series, porAdmin: false, publicado: true };
  if (episode.status !== 'draft') {
    throw erro(403, 'Só é possível enviar a pasta de um episódio em rascunho.');
  }
  if (episode.submittedAt) {
    throw erro(403, 'Episódio em análise não pode receber painéis. Aguarde a aprovação ou a devolução.');
  }
  return { episode, series, porAdmin: false, publicado: false };
}

function carimbo(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function pastaDoEpisodio(series, episode, envioId) {
  const obra = toSlug(series.title) || String(series._id);
  const ep = `ep-${String(episode.episode_number ?? 0).padStart(2, '0')}`;
  return `lorflux/series/${obra}/${ep}/${carimbo()}-${String(envioId).slice(-6)}`;
}

/**
 * Das URLs que acabaram de sair de um episódio (painel apagado, imagem ou
 * balão trocado: item 6), apaga do Bunny as que são do nosso CDN e que NADA
 * mais usa: nenhum painel, balão ou capa de episódio (inclusive o próprio,
 * conferido DEPOIS da gravação) e nenhuma capa de obra. Link externo colado à
 * mão nunca é apagado. Mesma regra do `urlsParaApagar` do reenvio da pasta.
 */
async function apagarUrlsSemUso(urls) {
  const nossas = [...new Set((urls || []).filter(u => bunnyStorage.caminhoDaUrl(u)))];
  if (nossas.length === 0) return { apagados: 0, falhas: [] };
  // Revisão de episódio publicado (item 7) também usa arquivo: o que está
  // nela não pode sumir, e o que está no ar não some por causa dela.
  const usa = {
    $or: [
      { 'panels.image_url': { $in: nossas } },
      { 'panels.translationLayers.imageUrl': { $in: nossas } },
      { thumbnail: { $in: nossas } },
    ],
  };
  const [episodios, revisoes, obras] = await Promise.all([
    Episode.find(usa).select('panels thumbnail').lean(),
    RevisaoEpisodio.find(usa).select('panels thumbnail').lean(),
    Series.find({ cover_image: { $in: nossas } }).select('cover_image').lean(),
  ]);
  const emUso = new Set();
  for (const e of [...episodios, ...revisoes]) {
    if (e.thumbnail) emUso.add(e.thumbnail);
    for (const p of e.panels || []) {
      emUso.add(p.image_url);
      for (const c of p.translationLayers || []) emUso.add(c.imageUrl);
    }
  }
  for (const s of obras) emUso.add(s.cover_image);
  return apagarCaminhos(nossas.filter(u => !emUso.has(u)).map(u => bunnyStorage.caminhoDaUrl(u)));
}

/** Apaga do Bunny, sem derrubar quem chamou: devolve o que não deu. */
async function apagarCaminhos(caminhos) {
  const falhas = [];
  let apagados = 0;
  const lista = [...new Set(caminhos)];
  for (let i = 0; i < lista.length; i += ENVIOS_SIMULTANEOS_AO_BUNNY) {
    const lote = lista.slice(i, i + ENVIOS_SIMULTANEOS_AO_BUNNY);
    const r = await Promise.allSettled(lote.map(c => bunnyStorage.deleteFromStorage(c)));
    r.forEach((x, j) => {
      if (x.status === 'fulfilled') apagados++;
      else {
        falhas.push(lote[j]);
        logger.error(`[EnvioEpisodio] Falha ao apagar ${lote[j]} do Bunny`, x.reason);
      }
    });
  }
  return { apagados, falhas };
}

async function cancelarAbertos(episodeId, excetoId = null) {
  const filtro = { episodeId, status: 'aberto' };
  if (excetoId) filtro._id = { $ne: excetoId };
  const abertos = await EnvioEpisodio.find(filtro).lean();
  if (abertos.length === 0) return;
  await EnvioEpisodio.updateMany({ _id: { $in: abertos.map(e => e._id) }, status: 'aberto' }, { $set: { status: 'cancelado' } });
  const recebidos = abertos.flatMap(e => e.arquivos.filter(a => a.recebido).map(a => a.caminho));
  await apagarCaminhos(recebidos);
}

/**
 * Passo 1. `arquivos`: [{ nome, largura, altura, tamanho }] da pasta inteira,
 * como o navegador leu (nome com ou sem a pasta; tamanho em bytes do original). Devolve o envio e, para cada
 * arquivo que vai subir, a `chave` com que ele deve voltar no passo 2, o
 * `indice` na lista recebida e o recorte (y, altura) a fazer antes.
 */
async function iniciarEnvio({ user, episodeId, arquivos }) {
  if (!bunnyStorage.isConfigured() && !bunnyStorage.hasTestUploader()) {
    throw erro(500, 'BUNNY_STORAGE_ZONE e BUNNY_STORAGE_KEY não configurados no .env.');
  }
  if (!Array.isArray(arquivos) || arquivos.length === 0) throw erro(400, 'Envie a lista de arquivos da pasta.');
  if (arquivos.length > MAXIMO_ARQUIVOS_NA_LISTA) throw erro(400, `A pasta tem mais de ${MAXIMO_ARQUIVOS_NA_LISTA} arquivos.`);
  // Sem o tamanho de cada arquivo o limite de MB (quando ligado) e o teto por
  // arquivo não teriam como ser conferidos.
  if (arquivos.some(a => !Number.isInteger(a?.tamanho) || a.tamanho < 0)) {
    throw erro(400, 'Envie o tamanho (em bytes) de cada arquivo da pasta.');
  }
  const lista = arquivos.map(a => ({
    nome: typeof a?.nome === 'string' ? a.nome.slice(0, 300) : '',
    largura: Number.isInteger(a?.largura) ? a.largura : undefined,
    altura: Number.isInteger(a?.altura) ? a.altura : undefined,
    tamanho: a.tamanho,
  }));

  const { episode, series, porAdmin, publicado } = await acessoAoEpisodio(user, episodeId, { aceitaPublicado: true });
  // Obra de vídeo (V-Show, Anicom; item 9): o episódio do autor recebe vídeo.
  if (!porAdmin && ['vcine', 'hqcine'].includes(series.content_type)) {
    throw erro(400, 'Esta obra é de vídeo: envie o vídeo do episódio, não a pasta de painéis.');
  }
  // Autor em episódio publicado: a pasta vai para a revisão (item 7). Com uma
  // edição já na fila, espera a aprovação ou a devolução.
  const paraRevisao = !porAdmin && publicado;
  if (paraRevisao) {
    const rev = await RevisaoEpisodio.findById(episode._id).select('status').lean();
    if (rev && rev.status !== 'editando') throw erro(403, require('./revisaoEpisodioService').MSG_EM_ANALISE);
  }
  const { organizarPasta } = await carregarRegras();
  const limitePaineis = await lerLimitePaineis();
  const limiteBytes = await lerLimiteBytes();
  const org = organizarPasta(lista, { limitePaineis, limiteBytes, tamanhoMaximoArquivo: TAMANHO_MAXIMO_PARTE });
  if (!org.podeEnviar) {
    throw erro(400, 'A pasta tem problemas que impedem o envio.', { problemas: org.problemas });
  }

  const envio = new EnvioEpisodio({
    episodeId: episode._id,
    userId: user.id,
    porAdmin,
    paraRevisao,
    totalPaineis: org.totalPaineis,
    bytesDeclarados: org.totalBytes,
    tetoBytes: await tetoBytesDoEpisodio(),
    pasta: 'pendente',
  });
  envio.pasta = pastaDoEpisodio(series, episode, envio._id);

  const esperados = [];
  const recortes = [];
  for (const p of org.paineis) {
    esperados.push({ chave: String(p.ordem), tipo: 'pagina', ordem: p.ordem, largura: p.largura, altura: p.altura, caminho: `${envio.pasta}/${p.pagina.arquivo}` });
    recortes.push({ chave: String(p.ordem), indice: p.pagina.indice, tipo: 'pagina', y: p.y, altura: p.altura, largura: p.largura });
    for (const [idioma, b] of Object.entries(p.baloes)) {
      const chave = `${p.ordem}-${idioma}`;
      esperados.push({ chave, tipo: 'balao', ordem: p.ordem, idioma, largura: p.largura, altura: p.altura, caminho: `${envio.pasta}/${b.arquivo}` });
      recortes.push({ chave, indice: b.indice, tipo: 'balao', idioma, y: p.y, altura: p.altura, largura: p.largura });
    }
  }
  if (org.capa) {
    esperados.push({ chave: 'capa', tipo: 'capa', caminho: `${envio.pasta}/${org.capa.arquivo}` });
    recortes.push({ chave: 'capa', indice: org.capa.indice, tipo: 'capa', y: null, altura: null, largura: null });
  }
  envio.arquivos = esperados;
  await envio.save();

  // Um envio aberto por episódio: o anterior (abandonado no meio) sai, e o
  // que ele já tinha subido é apagado.
  await cancelarAbertos(episode._id, envio._id);

  return {
    envioId: String(envio._id),
    totalPaineis: org.totalPaineis,
    totalPaginas: org.totalPaginas,
    porIdioma: org.porIdioma,
    limitePaineis,
    totalBytes: org.totalBytes,
    limiteBytes,
    problemas: org.problemas,
    arquivos: recortes,
    paraRevisao,
  };
}

async function envioDoUsuario(user, envioId) {
  let envio;
  try {
    envio = await EnvioEpisodio.findById(envioId);
  } catch (e) {
    if (e.name === 'CastError') throw erro(404, 'Envio não encontrado.');
    throw e;
  }
  if (!envio || String(envio.userId) !== String(user.id)) throw erro(404, 'Envio não encontrado.');
  return envio;
}

function tipoEsperado(esperado) {
  if (esperado.tipo === 'pagina') return ['jpeg'];
  if (esperado.tipo === 'balao') return ['png'];
  return esperado.caminho.endsWith('.png') ? ['png'] : ['jpeg'];
}

/**
 * Passo 2. `arquivos`: [{ chave, buffer }]. Confere TUDO antes de subir
 * qualquer um: uma parte com um arquivo errado é recusada inteira (é erro da
 * tela ou alguém mexendo à mão), com a lista do que estava errado.
 */
async function receberParte({ user, envioId, arquivos }) {
  const envio = await envioDoUsuario(user, envioId);
  if (envio.status !== 'aberto') throw erro(409, 'Este envio já foi concluído ou cancelado. Comece de novo.');
  if (!Array.isArray(arquivos) || arquivos.length === 0) throw erro(400, 'Nenhum arquivo na parte.');

  const { tipoPeloConteudo, tamanhoPeloCabecalho } = await carregarRegras();
  const porChave = new Map(envio.arquivos.map(a => [a.chave, a]));
  const recusados = [];
  const vistos = new Set();

  for (const a of arquivos) {
    const esperado = porChave.get(a.chave);
    if (!esperado) { recusados.push({ chave: a.chave, motivo: 'Arquivo que não faz parte deste envio.' }); continue; }
    if (vistos.has(a.chave)) { recusados.push({ chave: a.chave, motivo: 'Arquivo repetido na parte.' }); continue; }
    vistos.add(a.chave);
    const tipo = tipoPeloConteudo(a.buffer);
    if (!tipoEsperado(esperado).includes(tipo)) {
      recusados.push({ chave: a.chave, motivo: esperado.tipo === 'balao' ? 'O balão tem de ser PNG.' : 'A página tem de ser JPEG.' });
      continue;
    }
    if (esperado.tipo === 'capa') continue;
    const tam = tamanhoPeloCabecalho(a.buffer);
    if (!tam || tam.largura !== esperado.largura || tam.altura !== esperado.altura) {
      recusados.push({
        chave: a.chave,
        motivo: `Tamanho ${tam ? `${tam.largura}x${tam.altura}` : 'ilegível'}; o esperado era ${esperado.largura}x${esperado.altura}.`,
      });
    }
  }
  if (recusados.length > 0) throw erro(400, 'Parte recusada: arquivos fora do esperado.', { recusados });

  // Teto do que chega de fato (ver FOLGA_DO_CORTE), só com o limite de MB
  // ligado (tetoBytes 0 = sem teto). Reenvio de um arquivo conta o tamanho
  // novo no lugar do antigo.
  const novos = new Map(arquivos.map(a => [a.chave, a.buffer.length]));
  const somaDepois = envio.arquivos.reduce((s, a) => s + (novos.has(a.chave) ? novos.get(a.chave) : (a.recebido ? a.bytes || 0 : 0)), 0);
  if (envio.tetoBytes && somaDepois > envio.tetoBytes) {
    throw erro(413, 'Os arquivos deste envio passaram do tamanho esperado para o episódio.');
  }

  const falhas = [];
  for (let i = 0; i < arquivos.length; i += ENVIOS_SIMULTANEOS_AO_BUNNY) {
    const lote = arquivos.slice(i, i + ENVIOS_SIMULTANEOS_AO_BUNNY);
    await Promise.all(lote.map(async (a) => {
      const esperado = porChave.get(a.chave);
      const contentType = tipoPeloConteudo(a.buffer) === 'png' ? 'image/png' : 'image/jpeg';
      try {
        const url = await bunnyStorage.uploadBufferToStorage(a.buffer, esperado.caminho, contentType);
        await EnvioEpisodio.updateOne(
          { _id: envio._id, status: 'aberto', 'arquivos.chave': a.chave },
          { $set: { 'arquivos.$.recebido': true, 'arquivos.$.url': url, 'arquivos.$.bytes': a.buffer.length } }
        );
      } catch (e) {
        logger.error(`[EnvioEpisodio] Falha ao subir ${esperado.caminho}`, e);
        falhas.push(a.chave);
      }
    }));
  }

  const atual = await EnvioEpisodio.findById(envio._id).select('arquivos.recebido status').lean();
  const recebidos = atual.arquivos.filter(a => a.recebido).length;
  if (falhas.length > 0) {
    throw erro(502, 'Parte dos arquivos não chegou ao Bunny. Tente de novo esta parte.', { falhas, recebidos, total: atual.arquivos.length });
  }
  return { recebidos, total: atual.arquivos.length };
}

/**
 * URLs que a versão anterior usava e que podem ser apagadas: do nosso CDN,
 * fora da versão nova e sem nenhum outro episódio ou obra usando. A capa
 * antiga só sai se foi gravada por um envio de pasta (pasta ep-..), porque a
 * de upload avulso fica em covers/ e pode ser a mesma da obra.
 */
async function urlsParaApagar(episodioAntigo, novasUrls, thumbnailAntigoSai) {
  const candidatas = new Set();
  for (const p of episodioAntigo.panels || []) {
    if (p.image_url) candidatas.add(p.image_url);
    for (const c of p.translationLayers || []) if (c.imageUrl) candidatas.add(c.imageUrl);
  }
  if (thumbnailAntigoSai && episodioAntigo.thumbnail && /\/ep-\d+\//.test(episodioAntigo.thumbnail)) {
    candidatas.add(episodioAntigo.thumbnail);
  }
  for (const u of novasUrls) candidatas.delete(u);
  const nossas = [...candidatas].filter(u => bunnyStorage.caminhoDaUrl(u));
  if (nossas.length === 0) return [];

  const usa = [
    { 'panels.image_url': { $in: nossas } },
    { 'panels.translationLayers.imageUrl': { $in: nossas } },
    { thumbnail: { $in: nossas } },
  ];
  const [outrosEpisodios, revisoes, obras] = await Promise.all([
    Episode.find({ _id: { $ne: episodioAntigo._id }, $or: usa }).select('panels thumbnail').lean(),
    // Item 7: a edição de um publicado (inclusive a deste episódio) nasce como
    // cópia dos painéis do ar; o que ela ainda usa não pode ser apagado.
    RevisaoEpisodio.find({ $or: usa }).select('panels thumbnail').lean(),
    Series.find({ cover_image: { $in: nossas } }).select('cover_image').lean(),
  ]);
  const emUso = new Set();
  for (const e of [...outrosEpisodios, ...revisoes]) {
    if (e.thumbnail) emUso.add(e.thumbnail);
    for (const p of e.panels || []) {
      emUso.add(p.image_url);
      for (const c of p.translationLayers || []) emUso.add(c.imageUrl);
    }
  }
  for (const s of obras) emUso.add(s.cover_image);
  return nossas.filter(u => !emUso.has(u));
}

/** Passo 3. */
async function concluirEnvio({ user, envioId }) {
  const envio = await envioDoUsuario(user, envioId);
  if (envio.status !== 'aberto') throw erro(409, 'Este envio já foi concluído ou cancelado.');

  const faltando = envio.arquivos.filter(a => !a.recebido).map(a => a.chave);
  if (faltando.length > 0) throw erro(409, `Faltam ${faltando.length} arquivo(s) deste envio.`, { faltando });

  // Trava o envio: dois "concluir" ao mesmo tempo não trocam os painéis duas vezes.
  const travado = await EnvioEpisodio.findOneAndUpdate({ _id: envio._id, status: 'aberto' }, { $set: { status: 'concluindo' } }, { new: true });
  if (!travado) throw erro(409, 'Este envio já foi concluído ou cancelado.');
  const destravar = () => EnvioEpisodio.updateOne({ _id: envio._id, status: 'concluindo' }, { $set: { status: 'aberto' } });

  let acesso;
  try {
    acesso = await acessoAoEpisodio(user, envio.episodeId, { aceitaPublicado: !!travado.paraRevisao });
    if (!!travado.paraRevisao !== (!acesso.porAdmin && !!acesso.publicado)) {
      throw erro(409, 'O episódio mudou de estado durante o envio. Nada foi trocado; comece o envio de novo.');
    }
  } catch (e) {
    await destravar();
    throw e;
  }
  const { episode } = acesso;

  const paineis = [];
  for (const a of travado.arquivos) {
    if (a.tipo !== 'pagina') continue;
    // largura/altura: o item 6 usa para conferir a imagem ou o balão trocado
    // depois (o balão tem de ter o tamanho do painel).
    paineis[a.ordem] = { image_url: a.url, order: a.ordem, largura: a.largura, altura: a.altura, bytes: a.bytes || 0, translationLayers: [] };
  }
  for (const a of travado.arquivos) {
    if (a.tipo === 'balao') paineis[a.ordem].translationLayers.push({ language: a.idioma, imageUrl: a.url, bytes: a.bytes || 0 });
  }
  const capa = travado.arquivos.find(a => a.tipo === 'capa');

  if (travado.paraRevisao) return concluirNaRevisao({ user, envio: travado, episode, paineis, capa, destravar });

  const urlsAntigasDosPaineis = new Set((episode.panels || []).map(p => p.image_url));
  const set = { panels: paineis };
  let thumbnailAntigoSai = false;
  if (capa) {
    set.thumbnail = capa.url;
    thumbnailAntigoSai = true;
  } else if (episode.thumbnail && urlsAntigasDosPaineis.has(episode.thumbnail)) {
    // Capa automática do portal (a imagem do 1o painel): acompanha o 1o painel novo.
    set.thumbnail = paineis[0].image_url;
  }

  // Troca de uma vez. A condição repete a guarda do autor, para um "Enviar
  // para aprovação" feito no meio do caminho não ser atropelado.
  const filtro = { _id: episode._id };
  if (!acesso.porAdmin) Object.assign(filtro, { status: 'draft', submittedAt: null });
  const antigo = await Episode.findOneAndUpdate(filtro, { $set: set, $inc: { __v: 1 } }, { new: false });
  if (!antigo) {
    await destravar();
    throw erro(409, 'O episódio mudou durante o envio (foi enviado para aprovação ou apagado). Nada foi trocado.');
  }

  await EnvioEpisodio.updateOne({ _id: envio._id }, { $set: { status: 'concluido', concluidoEm: new Date() } });

  if (antigo.status === 'published') {
    // Mesmo caminho do addPanels: a guarda de envio único (notificationSentAt)
    // impede repetir o aviso de capítulo novo num reenvio.
    require('./notificationService')
      .notifyEpisodePublished(antigo._id)
      .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));
    require('./recommendationService').dispararRecalculo(antigo.seriesId, 'capitulo_publicado');
  }

  const novasUrls = new Set(travado.arquivos.map(a => a.url));
  const aApagar = await urlsParaApagar(antigo, novasUrls, thumbnailAntigoSai);
  const limpeza = await apagarCaminhos(aApagar.map(u => bunnyStorage.caminhoDaUrl(u)));

  const atualizado = await Episode.findById(episode._id).lean();
  return {
    episode: atualizado,
    totalPaineis: paineis.length,
    apagadosDoBunny: limpeza.apagados,
    naoApagados: limpeza.falhas,
  };
}

/**
 * Passo 3 quando o autor reenviou a pasta de um episódio PUBLICADO (item 7):
 * os painéis novos vão para a revisão, de uma vez; o episódio no ar não muda,
 * nenhum aviso de capítulo novo sai, e do Bunny só saem os arquivos que a
 * revisão anterior usava sozinha.
 */
async function concluirNaRevisao({ user, envio, episode, paineis, capa, destravar }) {
  const revisaoService = require('./revisaoEpisodioService');
  let antiga;
  try {
    await revisaoService.abrirParaEdicao(episode, user);
    const set = { panels: paineis };
    if (capa) set.thumbnail = capa.url;
    antiga = await RevisaoEpisodio.findOneAndUpdate(
      { _id: episode._id, status: 'editando' },
      { $set: set, $inc: { __v: 1 } },
      { new: false }
    ).lean();
    if (!antiga) throw erro(409, revisaoService.MSG_EM_ANALISE);
  } catch (e) {
    await destravar();
    throw e;
  }
  await EnvioEpisodio.updateOne({ _id: envio._id }, { $set: { status: 'concluido', concluidoEm: new Date() } });

  const saiu = [];
  for (const p of antiga.panels || []) {
    saiu.push(p.image_url);
    for (const c of p.translationLayers || []) saiu.push(c.imageUrl);
  }
  if (capa && antiga.thumbnail) saiu.push(antiga.thumbnail);
  const limpeza = await apagarUrlsSemUso(saiu);

  const revisao = await RevisaoEpisodio.findById(episode._id).lean();
  return {
    // O episódio como está NO AR (não mudou): a tela não troca nada do leitor.
    episode: await Episode.findById(episode._id).lean(),
    paraRevisao: true,
    revisao: revisaoService.resumo(revisao),
    totalPaineis: paineis.length,
    apagadosDoBunny: limpeza.apagados,
    naoApagados: limpeza.falhas,
  };
}

async function cancelarEnvio({ user, envioId }) {
  const envio = await envioDoUsuario(user, envioId);
  if (envio.status !== 'aberto') return { cancelado: false };
  const r = await EnvioEpisodio.updateOne({ _id: envio._id, status: 'aberto' }, { $set: { status: 'cancelado' } });
  if (r.modifiedCount === 0) return { cancelado: false };
  await apagarCaminhos(envio.arquivos.filter(a => a.recebido).map(a => a.caminho));
  return { cancelado: true };
}

module.exports = {
  iniciarEnvio,
  receberParte,
  concluirEnvio,
  cancelarEnvio,
  configuracao,
  acessoAoEpisodio,
  pastaDoEpisodio,
  apagarCaminhos,
  apagarUrlsSemUso,
  cancelarAbertos,
  carregarRegras,
  lerLimitePaineis,
  lerLimiteBytes,
  tetoBytesDoEpisodio,
  bytesDosPaineis,
  conferirTetoNaTroca,
  CHAVE_LIMITE,
  CHAVE_LIMITE_MB,
  FOLGA_DO_CORTE,
  TAMANHO_MAXIMO_PARTE,
  ARQUIVOS_POR_PARTE,
};
