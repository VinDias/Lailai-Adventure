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
  genre: { type: String, required: true },
  description: { type: String },
  cover_image: { type: String },
  isPremium: { type: Boolean, default: false },
  content_type: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  order_index: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
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
