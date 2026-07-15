const mongoose = require('mongoose');

// Sequências atômicas (findOneAndUpdate + $inc) — usado pelo seq do
// EngagementEvent para numerar a cadeia de hash sem corrida.
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: Number, default: 0 }
});

module.exports = mongoose.model('Counter', CounterSchema);
