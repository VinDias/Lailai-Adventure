const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, default: '' },
  label: { type: String },
  group: { type: String, default: 'general' }
}, { timestamps: true });

module.exports = mongoose.model('Setting', SettingSchema);
