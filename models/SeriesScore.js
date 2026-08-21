const mongoose = require('mongoose');

/**
 * Score pré-computado por obra (Fase 4, Bloco 4 — algoritmo de recomendação).
 * Um documento por série: os componentes calculáveis SEM o contexto do
 * leitor — Qualidade 30 + Retenção 25 + Descoberta 10 = "parte por obra"
 * (65 pts) — mais Potential Score e Confidence, tudo pré-computado pela
 * varredura (services/recommendationService.js) para não recalcular o
 * catálogo inteiro a cada request. Afinidade (25 pts, por leitor) e
 * Diversidade (10 pts, pela LISTA) NÃO entram aqui — são calculadas no
 * request de recomendação (Task 6).
 *
 * `contentType` é denormalizado de Series.content_type só para a varredura
 * por tipo (índice composto abaixo) não precisar de $lookup a cada consulta.
 *
 * `scoreFinal` reescala (qualidade+retencao+descoberta)/65×100 para o 0–100
 * do PDF, JÁ APÓS as penalizações (Etapa 9, Task 3). A ORDENAÇÃO da
 * recomendação usa os componentes crus (65 pts + afinidade 25), não este
 * reescalado — ver services/recommendationService.js.
 *
 * Task 2 (este commit) só preenche qualidade/leitoresUnicos/contentType/
 * computedAt via computeSeriesScore; os demais campos ficam no default
 * (0/[]) até as Tasks 3 e 4.
 *
 * Spec: docs/superpowers/specs/2026-08-20-algoritmo-recomendacao-design.md,
 * seção "Modelo `SeriesScore`".
 */
const SeriesScoreSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true, unique: true },
  contentType: { type: String, enum: ['hqcine', 'vcine', 'hiqua'] },
  scoreFinal: { type: Number, default: 0 },
  qualidade: { type: Number, default: 0 },
  retencao: { type: Number, default: 0 },
  descoberta: { type: Number, default: 0 },
  potentialScore: { type: Number, default: 0 },
  confidence: { type: Number, default: 0 },
  leitoresUnicos: { type: Number, default: 0 },
  // Ex.: ['retencao_baixa'] — vazio = nenhuma penalização aplicada (Etapa 9, Task 3).
  penalizacoes: { type: [String], default: [] },
  computedAt: { type: Date },
}, { timestamps: true });

// Varredura por tipo, ordenando pelo melhor scoreFinal dentro do content_type
// (feeds e o timer de 24h consultam por aqui). seriesId já é unique pelo
// campo acima (um doc por série).
SeriesScoreSchema.index({ contentType: 1, scoreFinal: -1 });

module.exports = mongoose.model('SeriesScore', SeriesScoreSchema);
