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
  audioTrack1Url: { type: String }, audioTrack1Lang: { type: String, default: '' },
  audioTrack2Url: { type: String }, audioTrack2Lang: { type: String, default: '' },
  audioTrack3Url: { type: String }, audioTrack3Lang: { type: String, default: '' },
  audioTrack4Url: { type: String }, audioTrack4Lang: { type: String, default: '' },
  hlsAudioLabels: { type: [String], default: [] },
  isPremium: { type: Boolean, default: false },
  status: { type: String, enum: ['processing', 'published', 'draft'], default: 'draft' },
  views: { type: Number, default: 0 },
  order_index: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Episode', EpisodeSchema);
