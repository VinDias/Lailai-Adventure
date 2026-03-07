
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  nome: { type: String, required: true },
  avatar: { type: String, default: '' },
  provider: { type: String, enum: ['local', 'google', 'microsoft'], default: 'local' },
  providerId: { type: String },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: { type: Date },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  isActive: { type: Boolean, default: true },
  followingChannelIds: [{ type: Number }]
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
