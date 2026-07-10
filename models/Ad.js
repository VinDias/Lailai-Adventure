const mongoose = require('mongoose');

const AdSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image_url: { type: String, required: true },
  // MP4/WebM opcional: quando presente, o interstitial toca o vídeo e a
  // image_url vira poster/fallback (inclusive no banner de feed).
  video_url: { type: String },
  link_url: { type: String },
  advertiser: { type: String },
  isActive: { type: Boolean, default: true },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  startsAt: { type: Date },
  endsAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Ad', AdSchema);
