const mongoose = require('mongoose');

const EpisodeSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  episode_number: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String },
  video_url: { type: String },
  bunnyVideoId: { type: String },
  thumbnail: { type: String },
  duration: { type: Number },
  panels: [{
    image_url: String,
    order: Number,
    translationLayers: [{
      language: { type: String, enum: ['pt', 'en', 'es', 'zh'] },
      imageUrl: String
    }]
  }],
  audioTrack1Url: { type: String }, // Dublagem / Voice Comic
  audioTrack2Url: { type: String }, // Trilha sonora / Áudio alternativo
  isPremium: { type: Boolean, default: false },
  status: { type: String, enum: ['processing', 'published', 'draft'], default: 'draft' },
  views: { type: Number, default: 0 },
  order_index: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Episode', EpisodeSchema);
