const mongoose = require('mongoose');

const SeriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  genre: { type: String, required: true },
  description: { type: String },
  cover_image: { type: String },
  isPremium: { type: Boolean, default: false },
  content_type: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  order_index: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
  // Canal do ilustrador (Fase 3): agrupa a obra no relatório de royalties.
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  // Preenchido automaticamente pelo translationService no save.
  // Título NÃO é traduzido (decisão do cliente).
  translations: {
    en: { genre: String, description: String },
    es: { genre: String, description: String },
    zh: { genre: String, description: String }
  }
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
