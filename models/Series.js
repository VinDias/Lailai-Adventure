const mongoose = require('mongoose');

// Tags internas do algoritmo de recomendação (Fase 4, Bloco 4, Etapa 5 do PDF
// do cliente) — alimentam a Afinidade calculada por leitor e NUNCA são
// exibidas na UI (o campo `genre` continua sendo o rótulo visível ao leitor).
// 0 tags = obra antiga ainda sem curadoria; se a obra recebe tags, o mínimo
// de 5 evita curadoria parcial que distorceria o perfil de afinidade.
//
// Normalização (trim, minúsculas, dedupe) fica no SETTER — não em
// pre('validate'), que só roda em .save()/.create(). As rotas de série usam
// findByIdAndUpdate(..., { runValidators: true }) no PUT: isso aplica o
// setter no cast do update (confirmado: setters de SchemaType rodam no
// castUpdate do Mongoose), mas NÃO dispara hooks de documento como
// pre('validate'). Por isso o setter cobre os dois caminhos (create e
// update) e o validator abaixo — esse sim honrado por runValidators — checa
// a contagem final e recusa itens vazios.
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return tags;
  const vistas = new Set();
  const normalizadas = [];
  for (const tag of tags) {
    const limpa = typeof tag === 'string' ? tag.trim().toLowerCase() : tag;
    // Mantém string vazia na lista (não descarta em silêncio) para o
    // validator recusar com mensagem clara, em vez de mascarar erro de
    // digitação do admin.
    if (limpa === '') { normalizadas.push(limpa); continue; }
    if (!vistas.has(limpa)) { vistas.add(limpa); normalizadas.push(limpa); }
  }
  return normalizadas;
}

function validateTags(tags) {
  if (!Array.isArray(tags)) return false;
  if (tags.some(t => typeof t !== 'string' || t.trim() === '')) return false;
  if (tags.length === 0) return true;
  return tags.length >= 5 && tags.length <= 15;
}

const SeriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  // Required só quando a obra vai ao ar: o portal do ilustrador (Fase 5
  // Bloco 1) cria série em draft sem gênero — o Master preenche na
  // aprovação. Publicar sem gênero continua barrado pelo required condicional.
  genre: { type: String, required: function () { return this.isPublished === true; } },
  description: { type: String },
  cover_image: { type: String },
  isPremium: { type: Boolean, default: false },
  content_type: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  order_index: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
  // Classificação sugerida pelo ilustrador no portal (Fase 5 Bloco 1) — vira
  // oficial (content_rating) só no Bloco 2.
  content_rating_sugerida: { type: String, enum: ['kids', 'teen', 'young'], default: null },
  // Classificação etária OFICIAL (Fase 5 Bloco 2) — só o Master define, na
  // aprovação da Fila (T6) ou no admin. NENHUMA rota escreve neste campo
  // ainda nesta task (T1 só cria o campo); a exigência "aprovar → obrigatório"
  // mora NA ROTA do aprovar, nunca no service compartilhado (applySeriesUpdate)
  // — o PUT admin continua publicando sem rating (fail-safe do filtro T4/T5 +
  // badge "não classificadas" cobrem o acervo). Semântica do filtro é
  // POSITIVA (kids/teen/young): null OU campo ausente (acervo pré-B2) contam
  // como "não classificada" e só aparecem para young — nunca precisou de
  // migração de dado para o default null cobrir o acervo existente.
  content_rating: { type: String, enum: ['kids', 'teen', 'young'], default: null },
  // Marcador de "Enviar para aprovação" do portal (Fase 5 Bloco 1): não-null
  // = aguardando revisão do Master; a Fila de Aprovação lista só séries com
  // este campo preenchido e ainda não publicadas.
  submittedAt: { type: Date, default: null },
  // Dia da semana de lançamento (0=domingo) — alimenta a Agenda
  releaseDay: { type: Number, min: 0, max: 6, default: null },
  // Canal do ilustrador (Fase 3): agrupa a obra no relatório de royalties.
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  // Tags internas do algoritmo (Bloco 4) — só admin escreve, nunca exibidas
  // ao leitor. Ver normalizeTags/validateTags acima.
  tags: {
    type: [String],
    default: [],
    set: normalizeTags,
    validate: {
      validator: validateTags,
      message: 'Tags: envie 0 (sem curadoria) ou entre 5 e 15 tags, todas não vazias.',
    },
  },
  // Preenchido automaticamente pelo translationService no save.
  // Título NÃO é traduzido (decisão do cliente).
  translations: {
    en: { genre: String, description: String },
    es: { genre: String, description: String },
    zh: { genre: String, description: String }
  }
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
