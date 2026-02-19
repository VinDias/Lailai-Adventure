
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const verifyToken = require("../middlewares/verifyToken");
const requireRole = require("../middlewares/requireRole");
const bcrypt = require("bcrypt");
const logger = require("../utils/logger");

// Criar novo administrador ou superadmin (Apenas Superadmin)
router.post("/create-admin", verifyToken, requireRole("superadmin"), async (req, res) => {
  try {
    const { email, password, nome, role } = req.body;

    if (!["admin", "superadmin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified." });
    }

    // Validação de limite de administradores
    const adminCount = await User.countDocuments({ role: { $in: ["admin", "superadmin"] } });
    const maxAdmins = parseInt(process.env.MAX_ADMIN_COUNT || "10");
    
    if (adminCount >= maxAdmins) {
      return res.status(400).json({ message: `Admin limit reached (${maxAdmins}).` });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = await User.create({
      email,
      password: hashedPassword,
      nome,
      role,
      isActive: true
    });

    // Log da ação
    await AdminLog.create({
      adminId: req.user.id,
      action: "CREATE_ADMIN",
      targetId: newAdmin.id,
      details: { role, email }
    });

    logger.info(`[SuperAdmin] ${req.user.email} criou novo ${role}: ${email}`);
    
    res.status(201).json({ 
      message: "Administrator created successfully",
      id: newAdmin.id 
    });
  } catch (err) {
    logger.error("[Admin Management Error]", err);
    res.status(500).json({ error: "Internal server error during admin creation." });
  }
});

// Ativar/Desativar conta de administrador (Apenas Superadmin)
router.put("/toggle-status/:id", verifyToken, requireRole("superadmin"), async (req, res) => {
  try {
    const { isActive } = req.body;
    const target = await User.findById(req.params.id);

    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === 'superadmin' && req.user.id !== target.id) {
       return res.status(403).json({ message: "Cannot toggle status of another superadmin" });
    }

    target.isActive = isActive;
    await target.save();

    await AdminLog.create({
      adminId: req.user.id,
      action: isActive ? "ACTIVATE_ACCOUNT" : "DEACTIVATE_ACCOUNT",
      targetId: target.id
    });

    res.json({ message: `Account ${isActive ? 'activated' : 'deactivated'} successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
