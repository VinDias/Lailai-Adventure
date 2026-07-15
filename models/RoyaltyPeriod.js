const mongoose = require('mongoose');

// Fechamento mensal de royalties (pool híbrido: o sistema sugere, o admin
// confirma o valor final). O breakdown é um snapshot imutável do fechamento.
const RoyaltyPeriodSchema = new mongoose.Schema({
  period: { type: String, required: true, unique: true }, // 'YYYY-MM'
  poolSuggested: { type: Number, default: 0 },
  poolFinal: { type: Number, required: true },
  status: { type: String, enum: ['draft', 'closed'], default: 'closed' },
  breakdown: [{
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
    channelName: String,
    points: Number,
    share: Number,   // 0..1
    amount: Number   // share × poolFinal
  }],
  closedAt: { type: Date },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('RoyaltyPeriod', RoyaltyPeriodSchema);
