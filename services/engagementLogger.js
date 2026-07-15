/**
 * Fase 3 — Logger de eventos de engajamento com cadeia de hash e anti-fraude.
 *
 * Cada evento (view/read/ad_impression/ad_click) vira um EngagementEvent
 * encadeado por sha256 (prevHash → hash), formando um log append-only
 * auditável — a base de cálculo dos royalties.
 *
 * SERIALIZAÇÃO: os appends passam por uma fila de promessas em processo.
 * Isso exige o app em INSTÂNCIA ÚNICA (PM2 fork, como está hoje) — se um dia
 * virar cluster, o append precisa migrar para uma fila externa (BullMQ).
 *
 * As rotas chamam logEvent() em fire-and-forget: falha de log NUNCA pode
 * afetar a resposta ao usuário.
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h — 1 consumo válido por user/ip × episódio
const BURST_WINDOW_MS = 60 * 1000;
const BURST_LIMIT = 30;                      // >30 eventos do mesmo IP em 60s = flag
const DEDUPE_TYPES = new Set(['view', 'read']);

// Fila que serializa os appends (garante seq/prevHash consistentes).
let chain = Promise.resolve();

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// LGPD: IP/UA nunca são gravados puros — pseudonimização com salt do ambiente.
function pseudonymize(value) {
  if (!value) return '';
  const salt = process.env.IP_HASH_SALT || process.env.JWT_SECRET || 'lorflux';
  return sha256(`${salt}|${value}`);
}

/**
 * Campos que entram no hash — a verificação de integridade recomputa isto.
 * userId fica DE FORA do hash de propósito: a exclusão de conta (LGPD)
 * desvincula o usuário dos eventos ($unset userId) sem quebrar a cadeia.
 * Os fatos relevantes ao royalty (tipo, obra, ip pseudonimizado, tempo)
 * continuam selados.
 */
function computeHash(ev) {
  return sha256([
    ev.prevHash,
    ev.seq,
    ev.type,
    ev.seriesId ? String(ev.seriesId) : '',
    ev.episodeId ? String(ev.episodeId) : '',
    ev.adId ? String(ev.adId) : '',
    ev.ipHash || '',
    ev.createdAt.toISOString(),
  ].join('|'));
}

async function appendEvent({ type, seriesId, episodeId, adId, userId, ip, ua }) {
  const EngagementEvent = require('../models/EngagementEvent');
  const Counter = require('../models/Counter');

  const ipHash = pseudonymize(ip);
  const uaHash = pseudonymize(ua);
  const now = new Date();

  // ─── Anti-fraude (no momento do log) ────────────────────────────────────
  let flagged = false;
  let flagReason = '';

  // Dedupe: 1 view/read válida por (usuário OU ip) × episódio × janela de 6h.
  if (DEDUPE_TYPES.has(type) && episodeId) {
    const identity = [];
    if (userId) identity.push({ userId });
    if (ipHash) identity.push({ ipHash });
    if (identity.length) {
      const duplicate = await EngagementEvent.findOne({
        type,
        episodeId,
        flagged: false,
        createdAt: { $gte: new Date(now.getTime() - DEDUPE_WINDOW_MS) },
        $or: identity,
      }).select('_id').lean();
      if (duplicate) { flagged = true; flagReason = 'dedupe'; }
    }
  }

  // Burst: rajada do mesmo IP (bot/fraude) — vale para todos os tipos.
  if (!flagged && ipHash) {
    const recent = await EngagementEvent.countDocuments({
      ipHash,
      createdAt: { $gte: new Date(now.getTime() - BURST_WINDOW_MS) },
    });
    if (recent >= BURST_LIMIT) { flagged = true; flagReason = 'burst'; }
  }

  // ─── Append encadeado ────────────────────────────────────────────────────
  const counter = await Counter.findOneAndUpdate(
    { _id: 'engagement_seq' },
    { $inc: { value: 1 } },
    { upsert: true, new: true }
  );
  const seq = counter.value;

  // Último elo real da cadeia (tolerante a gaps de seq por falha de create).
  const last = await EngagementEvent.findOne().sort({ seq: -1 }).select('hash').lean();
  const prevHash = last ? last.hash : 'GENESIS';

  const event = {
    seq, type,
    seriesId: seriesId || undefined,
    episodeId: episodeId || undefined,
    adId: adId || undefined,
    userId: userId || undefined,
    ipHash, uaHash, flagged, flagReason,
    prevHash,
    createdAt: now,
  };
  event.hash = computeHash(event);

  return EngagementEvent.create(event);
}

/**
 * Registra um evento. Serializado internamente; nunca lança para o chamador
 * (falha vira log de erro e retorno null).
 */
function logEvent(data) {
  const task = chain.then(() => appendEvent(data)).catch(err => {
    logger.error(`[Engagement] Falha ao registrar evento ${data?.type}: ${err.message}`);
    return null;
  });
  // A fila nunca fica rejeitada (o catch acima absorve).
  chain = task.then(() => undefined);
  return task;
}

/** Aguarda a fila esvaziar — usado pelos testes após chamadas fire-and-forget. */
function flushForTests() {
  return chain;
}

module.exports = { logEvent, flushForTests, computeHash, pseudonymize };
