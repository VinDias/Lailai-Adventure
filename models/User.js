
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nome: { type: String },
  role: { 
    type: String, 
    enum: ["user", "admin", "superadmin"], 
    default: "user" 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: { type: Date },
  avatar: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
