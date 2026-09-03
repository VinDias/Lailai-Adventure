
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  nome: { type: String, required: true },
  avatar: { type: String, default: '' },
  provider: { type: String, enum: ['local', 'google', 'microsoft'], default: 'local' },
  providerId: { type: String },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: { type: Date },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  isActive: { type: Boolean, default: true },
  followingChannelIds: [{ type: Number }],
  // LGPD: registro de consentimento (Art. 8º) e marketing opcional.
  consent: {
    termsAcceptedAt: { type: Date },
    privacyAcceptedAt: { type: Date },
    marketing: { type: Boolean, default: false },
    ip: { type: String }
  },
  // Fase 5, Bloco 2: "Classificação etária e Preferências de conteúdo"
  // (nomenclatura da UI — NUNCA "controle parental" no rótulo). Irmão de
  // `consent`. classificacaoEtaria é a idade do PRÓPRIO usuário/perfil desta
  // conta (usada para o filtro etário positivo — ver utils/parentalFilter,
  // T4); tagsBloqueadas são slugs do vocabulário fechado (utils/
  // tagsVocabulario) que o usuário não quer ver — filtro pessoal, obra
  // continua publicada para os demais.
  //
  // tagsBloqueadas NÃO é validada contra o vocabulário AQUI de propósito: a
  // rota PUT /api/parental (T3) valida contra o vocabulário vigente no
  // momento da escrita. Deixar o schema permissivo evita que uma mudança
  // futura no vocabulário (slug removido/renomeado) quebre a leitura de
  // documentos antigos já salvos.
  //
  // pinHash: select:false — fora de TODA query por padrão (inclusive
  // .lean()); as rotas do parental (T3) usam .select('+parental.pinHash')
  // para comparar. adminManagement.js exclui `parental` inteiro da projeção
  // de listagem (preferências são privadas — nem superadmin vê, letra do
  // PDF de 26/08). pinTentativas/pinBloqueadoAte: rate limit do PIN
  // persistido no próprio usuário (T3) — não em memória, sobrevive a
  // restart do processo.
  parental: {
    classificacaoEtaria: { type: String, enum: ['kids', 'teen', 'young'], default: 'young' },
    tagsBloqueadas: { type: [String], default: [] },
    pinHash: { type: String, default: null, select: false },
    pinTentativas: { type: Number, default: 0 },
    pinBloqueadoAte: { type: Date, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
