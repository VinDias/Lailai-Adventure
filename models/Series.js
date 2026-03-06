const mongoose = require('mongoose');

const SeriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  genre: { type: String, required: true },
  description: { type: String },
  cover_image: { type: String },
  isPremium: { type: Boolean, default: false },
  content_type: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  order_index: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
