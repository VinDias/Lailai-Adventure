/**
 * Motor de agregação de royalties (Fase 3) — extraído de routes/royalties.js
 * na Fase 5 Bloco 1, Task 3, SEM mudar comportamento: mesma lógica, mesmas
 * queries, mesmos nomes de campo. Motivo: routes/portal.js (painel de
 * números do ilustrador) precisa das MESMAS agregações que o admin usa —
 * um só ponto de verdade pros números de royalties, sem criar cálculo
 * paralelo que possa divergir no fechamento do período.
 * routes/royalties.js importa daqui; tests/backend/royalties.test.js
 * continua verde sem alteração (prova da extração limpa).
 */
const EngagementEvent = require('../models/EngagementEvent');
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const Setting = require('../models/Setting');
const User = require('../models/User');
const SuperReaderContribution = require('../models/SuperReaderContribution');

// Razão pontos/consumidores-únicos acima disso vira alerta de anomalia no relatório.
const ANOMALY_RATIO = 20;

function parsePeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const [year, month] = period.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/**
 * 'YYYY-MM' do mês corrente, em UTC (mesma convenção de parsePeriod/
 * RoyaltyPeriod.period). `agora` é SEMPRE injetável (regra do ledger: datas
 * SEMPRE injetáveis) — default `new Date()` para uso em produção (rotas HTTP
 * não têm como injetar via query sem abrir brecha de spoofing de data), mas
 * testável isoladamente com uma data fixa.
 * Novo nesta task — routes/royalties.js não tinha equivalente (cada rota
 * recebe `period` explícito do admin); routes/portal.js usa isto para saber
 * se o `period` pedido é o mês corrente (nunca mostra R$) ou um fechado.
 */
function periodoAtual(agora = new Date()) {
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getSettingNumber(key, fallback) {
  const doc = await Setting.findOne({ key }).lean();
  const value = parseFloat(doc?.value);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Monta o relatório do período: pontos válidos (view/read não-flagged) por
 * canal, share, alertas de anomalia e o pool sugerido (regra híbrida:
 * impressões÷1000 × CPM + assinantes premium ativos × valor-por-assinante).
 */
async function buildReport(range) {
  // Pontos por série + consumidores únicos (userId ou ipHash) para anomalia
  const perSeries = await EngagementEvent.aggregate([
    { $match: {
      type: { $in: ['view', 'read'] },
      flagged: false,
      seriesId: { $ne: null },
      createdAt: { $gte: range.start, $lt: range.end },
    } },
    { $group: {
      _id: '$seriesId',
      points: { $sum: 1 },
      consumers: { $addToSet: { $ifNull: ['$userId', '$ipHash'] } },
    } },
  ]);

  const seriesIds = perSeries.map(s => s._id);
  const seriesDocs = await Series.find({ _id: { $in: seriesIds } }).select('title channelId').lean();
  const seriesById = new Map(seriesDocs.map(s => [String(s._id), s]));

  // Agrupa por canal
  const byChannel = new Map();
  for (const row of perSeries) {
    const serie = seriesById.get(String(row._id));
    const channelKey = serie?.channelId ? String(serie.channelId) : 'none';
    if (!byChannel.has(channelKey)) {
      byChannel.set(channelKey, { channelId: serie?.channelId ?? null, points: 0, consumers: 0, series: [] });
    }
    const ch = byChannel.get(channelKey);
    ch.points += row.points;
    ch.consumers += row.consumers.length;
    ch.series.push({ seriesId: row._id, title: serie?.title ?? '(série removida)', points: row.points });
  }

  const channelIds = [...byChannel.values()].map(c => c.channelId).filter(Boolean);
  const channelDocs = await Channel.find({ _id: { $in: channelIds } }).select('name').lean();
  const channelNames = new Map(channelDocs.map(c => [String(c._id), c.name]));

  const totalPoints = [...byChannel.values()].reduce((sum, c) => sum + c.points, 0);
  const channels = [...byChannel.entries()].map(([key, c]) => ({
    channelId: c.channelId,
    channelName: c.channelId ? (channelNames.get(key) ?? '(canal removido)') : 'Sem canal',
    points: c.points,
    share: totalPoints > 0 ? c.points / totalPoints : 0,
    anomaly: c.consumers > 0 && c.points / c.consumers > ANOMALY_RATIO,
    series: c.series.sort((a, b) => b.points - a.points),
  })).sort((a, b) => b.points - a.points);

  // Pool sugerido (híbrido — o admin confirma/ajusta no fechamento)
  const [adImpressions, cpm, perSub, authorShare] = await Promise.all([
    EngagementEvent.countDocuments({
      type: 'ad_impression', flagged: false,
      createdAt: { $gte: range.start, $lt: range.end },
    }),
    getSettingNumber('premium_cpm_rate', 0),
    getSettingNumber('royalty_premium_per_sub', 0),
    // Regra do cliente: 60% da receita de anúncios e assinaturas vai para os
    // autores, 40% fica com a plataforma. Configurável sem alterar código.
    getSettingNumber('royalty_author_share', 0.6),
  ]);
  const now = new Date();
  const premiumUsers = await User.countDocuments({
    isPremium: true,
    $or: [{ premiumExpiresAt: null }, { premiumExpiresAt: { $gt: now } }],
  });
  const grossRevenue = (adImpressions / 1000) * cpm + premiumUsers * perSub;
  const poolSuggested = grossRevenue * authorShare;

  return { channels, totalPoints, adImpressions, premiumUsers, cpm, perSub, grossRevenue, authorShare, poolSuggested };
}

/**
 * Soma o apoio Super Reader (80% autor / 20% plataforma) por canal no
 * período — SEPARADO do pool mensal de royalties (decisão da spec, seção
 * "Relatório"): não entra em poolSuggested nem no breakdown de POST /close.
 * `period` é a mesma string 'YYYY-MM' que o report já usa (o modelo grava o
 * período assim, sem precisar de range de datas).
 * Retorna também `plataformaCents` por canal para uso interno do CSV — o
 * shape público de GET /report expõe só { channelId, channelName, apoios,
 * autorCents } por canal, como definido na spec.
 */
async function buildSuperReaderSummary(period) {
  const perChannel = await SuperReaderContribution.aggregate([
    { $match: { period } },
    { $group: {
      _id: '$channelId',
      apoios: { $sum: 1 },
      autorCents: { $sum: '$authorShareCents' },
      plataformaCents: { $sum: '$platformShareCents' },
    } },
  ]);

  const channelIds = perChannel.map(c => c._id).filter(Boolean);
  const channelDocs = await Channel.find({ _id: { $in: channelIds } }).select('name').lean();
  const channelNames = new Map(channelDocs.map(c => [String(c._id), c.name]));

  const porCanal = perChannel.map(c => ({
    channelId: c._id,
    // Canal apagado (ou sem canal, o que não deveria ocorrer — channelId é
    // required no modelo) → null, sem explodir.
    channelName: c._id ? (channelNames.get(String(c._id)) ?? null) : null,
    apoios: c.apoios,
    autorCents: c.autorCents,
    plataformaCents: c.plataformaCents,
  }));

  const totalApoios = porCanal.reduce((sum, c) => sum + c.apoios, 0);
  const totalAutorCents = porCanal.reduce((sum, c) => sum + c.autorCents, 0);
  const totalPlataformaCents = porCanal.reduce((sum, c) => sum + c.plataformaCents, 0);

  return { porCanal, totalApoios, totalAutorCents, totalPlataformaCents };
}

module.exports = {
  ANOMALY_RATIO,
  parsePeriod,
  periodoAtual,
  buildReport,
  buildSuperReaderSummary,
};
