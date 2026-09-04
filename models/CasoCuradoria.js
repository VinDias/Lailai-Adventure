const mongoose = require('mongoose');
const { MOTIVOS, TEXTO_ADMIN_MAX } = require('../utils/curadoriaLimiares');

const STATUS = ['aberto', 'aguardando_artista', 'fechado'];
const STATUS_ABERTOS = ['aberto', 'aguardando_artista'];
const DECISOES = ['aprovar', 'reclassificar', 'solicitar_correcao', 'remover'];

/**
 * Caso da Fila de Revisão (Fase 5 Bloco 3). Guarda SÓ agregados — nunca
 * userId de leitor nem descrições (regra 8 do Vin; as descrições ficam em
 * Sinalizacao e só o admin as lê, anonimizadas).
 *
 * "1 caso aberto por obra" é garantido pelo BANCO: índice único parcial em
 * {seriesId} filtrado por emAberto:true. `emAberto` é um booleano derivado
 * (true em aberto/aguardando_artista, false em fechado) porque
 * partialFilterExpression com $in/$ne exige MongoDB >= 6 e a versão da VPS
 * não está confirmada — igualdade booleana funciona em qualquer versão
 * (molde de índice único parcial: models/ReadingProgress.js:38-45).
 */
const CasoCuradoriaSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  emAberto: { type: Boolean, default: true },
  status: { type: String, enum: STATUS, default: 'aberto' },
  prioridade: { type: String, enum: ['normal', 'grave'], default: 'normal' },
  abertoEm: { type: Date, required: true },
  gatilho: {
    tipo: { type: String, enum: ['pequena', 'normal', 'grave'], required: true },
    S: { type: Number, required: true },
    V: { type: Number, required: true },
    limiar: { type: Number, required: true },
  },
  // { motivo: contagem } só das sinalizações válidas pendentes — Mixed
  // porque as chaves são os slugs do vocabulário.
  resumoMotivos: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  mensagemAvisoId: { type: mongoose.Schema.Types.ObjectId, ref: 'MensagemPortal', default: null },
  avisoArtista: { type: String, enum: ['pendente', 'enviado', 'sem_canal', 'falhou'], default: 'pendente' },
  decisao: { type: String, enum: [...DECISOES, null], default: null },
  // Texto do curador que acompanha a decisão (motivo do "remover", pedido
  // do "solicitar correção") — vai ao artista via MensagemPortal.
  motivoDecisao: { type: String, maxlength: TEXTO_ADMIN_MAX, default: null },
  sinalizacoesAbusivas: { type: Boolean, default: false },
  decididoPor: { type: String, default: null },
  decisaoEm: { type: Date, default: null },
  observacao: { type: String, maxlength: 2000, default: null },
  // MUTEX das 4 ações do curador (services/curadoriaService.reivindicarCaso):
  // marca que alguém está decidindo este caso AGORA. Campo próprio, e não
  // `emAberto`, porque `emAberto` é a chave do índice único parcial que
  // garante "1 caso aberto por obra" — zerá-lo durante a janela da ação
  // liberava o índice e deixava `avaliarObra` criar um caso IRMÃO para a
  // mesma obra (achado da rodada 2 do fix round). Expira sozinho
  // (RECLAMACAO_VALIDADE_MS): processo derrubado no meio de uma ação não
  // prende o caso.
  reivindicadoEm: { type: Date, default: null },
}, { timestamps: true });

CasoCuradoriaSchema.index(
  { seriesId: 1 },
  { unique: true, partialFilterExpression: { emAberto: true } },
);
CasoCuradoriaSchema.index({ emAberto: 1, prioridade: 1, abertoEm: 1 });
// removidaPelaCuradoria em GET /admin/aprovacoes: último caso da obra com
// decisao 'remover'.
CasoCuradoriaSchema.index({ seriesId: 1, decisao: 1, decisaoEm: -1 });

CasoCuradoriaSchema.statics.STATUS_ABERTOS = STATUS_ABERTOS;
CasoCuradoriaSchema.statics.DECISOES = DECISOES;

// emAberto é DERIVADO do status (nunca aceito do caller): o índice único
// parcial que garante "1 caso aberto por obra" confia neste campo, e um
// valor divergente do status abriria uma brecha na garantia do banco.
CasoCuradoriaSchema.pre('validate', function (next) {
  this.emAberto = this.status !== 'fechado';
  next();
});

// Sanidade: um caso não pode nascer com resumoMotivos fora do vocabulário.
// `invalidate()` (não `new mongoose.Error.ValidationError(new Error(msg))`)
// porque o construtor de ValidationError espera o DOCUMENTO, não um Error —
// passar um Error produzia "Validation failed" com `errors` vazio, perdendo
// a mensagem que dizia qual motivo era o desconhecido.
CasoCuradoriaSchema.pre('validate', function (next) {
  const chaves = Object.keys(this.resumoMotivos || {});
  const invalida = chaves.find(k => !MOTIVOS.includes(k));
  if (invalida) {
    this.invalidate('resumoMotivos', `motivo desconhecido "${invalida}"`);
    return next();
  }
  next();
});

module.exports = mongoose.model('CasoCuradoria', CasoCuradoriaSchema);
