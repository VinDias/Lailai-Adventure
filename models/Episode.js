const mongoose = require('mongoose');

const EpisodeSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  episode_number: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String },
  video_url: { type: String },
  bunnyVideoId: { type: String },
  // Vídeo enviado pelo AUTOR no portal (frente A, item 9). Opcional: só
  // existe em episódio de V-Show ou Anicom cujo vídeo o autor subiu. Enquanto
  // `videoId` for o `bunnyVideoId` acima, o vídeo é de autor: o webhook do
  // Bunny só atualiza `estado` e NUNCA publica o episódio
  // (services/videoAutorService.js).
  videoEnvio: {
    videoId: { type: String },
    estado: { type: String, enum: ['enviando', 'processando', 'pronto', 'erro'] },
    atualizadoEm: { type: Date },
    // Até quando vale a última autorização de envio entregue ao autor. Antes
    // disso o episódio não pode ir para aprovação (item 10): o moderador só
    // vê o vídeo quando o autor já não consegue trocá-lo.
    autorizadoAte: { type: Date },
  },
  thumbnail: { type: String },
  duration: { type: Number },
  panels: [{
    image_url: String,
    order: Number,
    // Tamanho da imagem do painel, em px (frente A, item 6). Opcional: só os
    // painéis gravados pelo envio da pasta ou trocados pela grade têm. Com ele
    // o servidor recusa balão ou imagem nova de tamanho diferente.
    largura: Number,
    altura: Number,
    // Tamanho do arquivo da imagem, em bytes (frente A, 27/11). Opcional: só o
    // que foi gravado pelo envio da pasta ou trocado pela grade tem. É com ele
    // que a troca de um arquivo confere o limite de MB do episódio.
    bytes: Number,
    translationLayers: [{
      language: { type: String, enum: ['pt', 'en', 'es', 'zh'] },
      imageUrl: String,
      bytes: Number
    }]
  }],
  audioTrack1Url: { type: String }, audioTrack1Lang: { type: String, default: '' },
  audioTrack2Url: { type: String }, audioTrack2Lang: { type: String, default: '' },
  audioTrack3Url: { type: String }, audioTrack3Lang: { type: String, default: '' },
  audioTrack4Url: { type: String }, audioTrack4Lang: { type: String, default: '' },
  hlsAudioLabels: { type: [String], default: [] },
  webtoonLanguageLabels: {
    pt: { type: String, default: '' },
    en: { type: String, default: '' },
    es: { type: String, default: '' },
    zh: { type: String, default: '' }
  },
  // Preenchido automaticamente pelo translationService no save (só descrição;
  // título do episódio fica intacto).
  translations: {
    en: { description: String },
    es: { description: String },
    zh: { description: String }
  },
  isPremium: { type: Boolean, default: false },
  status: { type: String, enum: ['processing', 'published', 'draft'], default: 'draft' },
  views: { type: Number, default: 0 },
  order_index: { type: Number, default: 0 },
  // Guarda de envio único do push de capítulo novo
  notificationSentAt: { type: Date, default: null },
  // Marcador de "Enviar para aprovação" do portal (Fase 5 Bloco 1) — ver
  // Series.submittedAt para o mesmo mecanismo em nível de obra.
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Episode', EpisodeSchema);
