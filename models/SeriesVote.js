const mongoose = require('mongoose');

const SeriesVoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  type: { type: String, enum: ['like', 'dislike'], required: true },
  createdAt: { type: Date, default: Date.now }
});

// Um voto por usuário/série
SeriesVoteSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

module.exports = mongoose.model('SeriesVote', SeriesVoteSchema);
