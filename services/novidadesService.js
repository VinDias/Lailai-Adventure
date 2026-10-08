// Resumo semanal de novidades (Fase 6, T6).
//
// A Fase 6 prometeu "e-mail de novidades"; o Fellipe fechou em 06/10 o formato
// RESUMO SEMANAL AUTOMÁTICO, em vez de um disparo por capítulo (um aviso por
// capítulo novo em obra popular viraria spam, e o push de capítulo novo —
// services/notificationService.js — já cobre quem favoritou).
//
// Três regras que não são negociáveis aqui:
//
//  1. Só vai para `consent.marketing === true` (LGPD, Art. 8º). O opt-in já
//     existia em models/User.js e é escrito pelo PUT /api/account/me/consent.
//  2. O conteúdo respeita a classificação da CONTA, pelo mesmo predicado puro
//     do push (`passaFiltroParental`, sem exceção de admin nem de dono):
//     anunciar obra que a pessoa não consegue abrir é pior que não anunciar.
//  3. Todo e-mail sai com descadastro em um clique, sem exigir login.
//
// A varredura não tem agendador externo (nada de cron na VPS, que o Fellipe
// teria de manter à parte): roda de hora em hora igual às outras varreduras do
// projeto e só age no dia/hora de envio. A idempotência vem do índice único de
// models/EnvioNovidades.js, não do relógio.
const crypto = require('crypto');
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const User = require('../models/User');
const EnvioNovidades = require('../models/EnvioNovidades');
const { passaFiltroParental } = require('../utils/parentalFilter');
const logger = require('../utils/logger');

const DIA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_MS = 60 * 60 * 1000;
const JANELA_DIAS = 7;
// Segunda-feira de manhã: a semana começa e o acervo da semana anterior está
// fechado. Em UTC — o servidor roda em UTC e 12h UTC é meio da manhã no Brasil.
const DIA_DE_ENVIO = 1; // 0=domingo ... 1=segunda
const HORA_DE_ENVIO = 12; // UTC

let timer = null;

// ─── período ──────────────────────────────────────────────────────────────

/**
 * Semana ISO ('2026-W41') da data. É a CHAVE de idempotência: qualquer tique
 * da mesma semana devolve a mesma string, então o índice único de
 * EnvioNovidades reconhece "já mandei" sem depender de comparar datas.
 */
function chaveDoPeriodo(data) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  // Regra ISO-8601: a semana pertence ao ano da sua QUINTA-FEIRA — é o que faz
  // a virada de ano não gerar duas "semana 1" nem perder a última do ano.
  const diaIso = d.getUTCDay() || 7; // segunda=1 ... domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - diaIso);
  const ano = d.getUTCFullYear();
  const semana = Math.ceil(((d.getTime() - Date.UTC(ano, 0, 1)) / DIA_MS + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

// ─── descadastro ──────────────────────────────────────────────────────────

/**
 * Token de descadastro: HMAC do id da conta, NÃO um token guardado no banco.
 *
 * O motivo é prático: o e-mail fica anos na caixa de entrada da pessoa, e um
 * token com prazo (molde do PasswordResetToken) deixaria de funcionar
 * justamente quando ela decidisse sair — o contrário do que a LGPD pede.
 * Assinado, não adivinhável, sem prazo e sem crescer uma coleção a cada envio.
 *
 * `NEWSLETTER_SECRET` é opcional e existe para quem precisar trocar o
 * JWT_SECRET sem invalidar os links já enviados.
 */
function tokenDescadastro(userId) {
  const segredo = process.env.NEWSLETTER_SECRET || process.env.JWT_SECRET;
  if (!segredo) throw new Error('NEWSLETTER_SECRET ou JWT_SECRET é obrigatório para o link de descadastro.');
  return crypto.createHmac('sha256', segredo).update(`novidades:${userId}`).digest('hex');
}

/** Comparação em tempo constante — o token é um segredo, não um identificador. */
function validarTokenDescadastro(userId, token) {
  if (typeof token !== 'string' || token.length === 0) return false;
  let esperado;
  try {
    esperado = Buffer.from(tokenDescadastro(userId), 'utf8');
  } catch {
    return false;
  }
  const recebido = Buffer.from(token, 'utf8');
  if (esperado.length !== recebido.length) return false;
  return crypto.timingSafeEqual(esperado, recebido);
}

function urlDescadastro(userId) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/api/account/novidades/descadastrar?u=${userId}&t=${tokenDescadastro(userId)}`;
}

// ─── o que entrou no ar na semana ─────────────────────────────────────────

/**
 * Capítulos que passaram a ser consumíveis na janela, agrupados por obra.
 *
 * "Consumível" tem a MESMA definição do push de capítulo novo
 * (notificationService): episódio `published`, obra publicada, e conteúdo de
 * verdade presente (painéis ou vídeo) — esqueleto que o admin criou antes de
 * subir a arte não é novidade para ninguém.
 *
 * A data usada é `createdAt`, que é o proxy de recência já adotado no projeto
 * para "último capítulo publicado" (services/recommendationService.js:575).
 * Não existe campo `publishedAt`, e inventar um aqui exigiria backfill do
 * acervo inteiro para um ganho que o fluxo real não tem: na Lorflux o episódio
 * é criado e publicado no mesmo movimento.
 */
async function novidadesDaSemana({ desde, ate }) {
  const episodios = await Episode.find({
    status: 'published',
    createdAt: { $gte: desde, $lt: ate },
    // Conteúdo presente, conferido na própria query para não trazer o array
    // de painéis inteiro (um capítulo tem dezenas) só para medir o tamanho.
    $or: [{ 'panels.0': { $exists: true } }, { video_url: { $nin: [null, ''] } }],
  }).select('seriesId episode_number title createdAt').sort({ createdAt: 1 }).lean();

  if (episodios.length === 0) return [];

  const seriesIds = [...new Set(episodios.map((e) => String(e.seriesId)))];
  const series = await Series.find({ _id: { $in: seriesIds }, isPublished: true })
    .select('title cover_image content_type content_rating tags isPremium')
    .lean();

  const porSerie = new Map(series.map((s) => [String(s._id), { serie: s, episodios: [] }]));
  for (const ep of episodios) {
    // Obra despublicada (ou apagada) depois da publicação do capítulo não
    // entra: o grupo nem foi criado acima.
    const grupo = porSerie.get(String(ep.seriesId));
    if (grupo) grupo.episodios.push(ep);
  }

  return [...porSerie.values()].filter((g) => g.episodios.length > 0);
}

/**
 * Recorta os grupos pela classificação e pelas tags bloqueadas da conta.
 * Predicado PURO, sem exceção de admin nem de dono — mesma escolha do push
 * (ledger P5): o e-mail é uma superfície de lista, e nela o filtro vale para
 * todo mundo, inclusive para quem bloqueou a tag da própria obra.
 */
function gruposVisiveisPara(parental, grupos) {
  return grupos.filter((g) => {
    try {
      return passaFiltroParental(parental ?? null, g.serie);
    } catch (erro) {
      // passaFiltroParental LANÇA quando a obra chega sem content_rating/tags
      // (doc com o campo `$unset`). Fail-closed: a obra fica FORA do e-mail,
      // e o lote inteiro não morre por causa de um documento torto.
      logger.warn(`[Novidades] Obra ${g.serie._id} fora do resumo: ${erro.message}`);
      return false;
    }
  });
}

// ─── envio ────────────────────────────────────────────────────────────────

/**
 * Monta e envia o resumo da semana para quem aceitou receber.
 *
 * Sequencial de propósito: o SMTP da Hostinger tem limite por minuto, e o
 * resumo nunca tem pressa. Falha de um destinatário não interrompe os demais
 * (devolve o claim e segue) — mesmo "melhor esforço" do push.
 */
async function enviarResumoSemanal({ agora = new Date() } = {}) {
  const periodo = chaveDoPeriodo(agora);
  const resumo = { periodo, obras: 0, enviados: 0, semNovidade: 0, jaEnviados: 0, falhas: 0 };

  const grupos = await novidadesDaSemana({ desde: new Date(agora.getTime() - JANELA_DIAS * DIA_MS), ate: agora });
  if (grupos.length === 0) {
    logger.info(`[Novidades] ${periodo}: semana sem capitulo novo, nada enviado.`);
    return resumo;
  }
  resumo.obras = grupos.length;

  const destinatarios = await User.find({ 'consent.marketing': true, isActive: true })
    .select('email nome parental')
    .lean();

  const { sendResumoSemanal } = require('./emailService');

  for (const destinatario of destinatarios) {
    const visiveis = gruposVisiveisPara(destinatario.parental, grupos);
    // Nada visível para esta conta: não manda e-mail vazio E NÃO registra o
    // período — se a obra for reclassificada ainda nesta semana, o próximo
    // tique ainda pode avisar.
    if (visiveis.length === 0) {
      resumo.semNovidade += 1;
      continue;
    }

    const capitulos = visiveis.reduce((total, g) => total + g.episodios.length, 0);

    try {
      await EnvioNovidades.create({ userId: destinatario._id, periodo, obras: visiveis.length, capitulos });
    } catch (erro) {
      if (erro && erro.code === 11000) {
        resumo.jaEnviados += 1; // outro tique (ou outra instância) já mandou
        continue;
      }
      throw erro;
    }

    try {
      await sendResumoSemanal(destinatario, {
        grupos: visiveis,
        urlDescadastro: urlDescadastro(destinatario._id),
      });
      resumo.enviados += 1;
    } catch (erro) {
      // Devolve a vez: sem isto, uma queda do SMTP calaria o resumo da semana
      // inteira para essa conta.
      await EnvioNovidades.deleteOne({ userId: destinatario._id, periodo }).catch(() => {});
      resumo.falhas += 1;
      logger.error(`[Novidades] Falha ao enviar resumo para userId ${destinatario._id}: ${erro && erro.message}`);
    }
  }

  logger.info(
    `[Novidades] ${periodo}: ${resumo.enviados} enviado(s), ${resumo.semNovidade} sem novidade, ` +
    `${resumo.jaEnviados} ja enviado(s), ${resumo.falhas} falha(s).`
  );
  return resumo;
}

/** Dia e hora de envio — a idempotência é do índice único, isto é só a janela. */
function estaNaHoraDeEnviar(agora = new Date()) {
  return agora.getUTCDay() === DIA_DE_ENVIO && agora.getUTCHours() >= HORA_DE_ENVIO;
}

function iniciarResumoSemanal() {
  if (process.env.NODE_ENV === 'test') return; // mesma guarda das outras varreduras
  if (timer) return; // idempotente

  const tique = () => {
    if (!estaNaHoraDeEnviar()) return;
    enviarResumoSemanal().catch((erro) =>
      logger.error('[Novidades] Varredura do resumo semanal falhou', erro && erro.message)
    );
  };

  timer = setInterval(tique, INTERVALO_MS);
  if (typeof timer.unref === 'function') timer.unref();

  // Tique de boot: se o deploy caiu justamente na segunda de manhã, o resumo
  // da semana sai assim que o processo volta, em vez de esperar sete dias.
  tique();
}

function pararResumoSemanal() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  chaveDoPeriodo,
  tokenDescadastro,
  validarTokenDescadastro,
  urlDescadastro,
  novidadesDaSemana,
  gruposVisiveisPara,
  enviarResumoSemanal,
  estaNaHoraDeEnviar,
  iniciarResumoSemanal,
  pararResumoSemanal,
};
