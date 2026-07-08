const mongoose = require('mongoose');

const FavoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true }
}, { timestamps: true });

// Um favorito por usuário/série (evita duplicatas)
FavoriteSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', FavoriteSchema);
