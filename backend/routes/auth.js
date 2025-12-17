const express = require("express");
const pool = require("../db");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  // Compatible con tu init.sql (password_hash = crypt('admin', gen_salt('bf')))
  const { rows } = await pool.query(
    `SELECT id, username, email, role
     FROM users
     WHERE email = $1 AND password_hash = crypt($2, password_hash)
     LIMIT 1`,
    [email, password]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  return res.status(200).json({ success: true, user: rows[0] });
});

module.exports = router;