const mongoose = require('mongoose');

const VoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  episodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Episode', required: true },
  type: { type: String, enum: ['like', 'dislike'], required: true },
  createdAt: { type: Date, default: Date.now }
});

VoteSchema.index({ userId: 1, episodeId: 1 }, { unique: true });

module.exports = mongoose.model('Vote', VoteSchema);
