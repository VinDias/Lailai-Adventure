const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:     { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: '1h' } // TTL: expira em 1 hora
});

module.exports = mongoose.model('PasswordResetToken', schema);
