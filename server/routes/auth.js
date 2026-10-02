const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const requireDatabase = require("../middleware/require-database");
const { query } = require("../db/connection");
const { getJwtSecret } = require("../config/jwt");

const router = express.Router();

function createToken(user) {
  const secret = getJwtSecret();
  if (!secret) {
    const error = new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
    error.status = 503;
    throw error;
  }
  return jwt.sign({ id: user.id, email: user.email, is_admin: Boolean(user.is_admin) }, secret, { expiresIn: "7d" });
}

router.post("/register", requireDatabase, async (req, res, next) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Enter a name between 2 and 100 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Your password must be at least 8 characters." });
  try {
    const isAdmin = email.toLowerCase() === (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const result = await query(
      "INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)",
      [name, email, await bcrypt.hash(password, 12), isAdmin]
    );
    const user = { id: result.insertId, name, email, is_admin: isAdmin };
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An account with that email already exists." });
    next(error);
  }
});

router.post("/login", requireDatabase, async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });
  try {
    const rows = await query("SELECT id, name, email, password_hash, is_admin FROM users WHERE email = ?", [email]);
    const record = rows[0];
    if (!record || !(await bcrypt.compare(password, record.password_hash))) {
      return res.status(401).json({ error: "That email and password do not match." });
    }
    const user = { id: record.id, name: record.name, email: record.email, is_admin: Boolean(record.is_admin) };
    res.json({ user, token: createToken(user) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;