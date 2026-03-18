const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const REFRESH_EXP = process.env.JWT_REFRESH_EXP || "30d";
const SALT_ROUNDS = Number.parseInt(process.env.REFRESH_TOKEN_HASH_SALT_ROUNDS || "12", 10);

function parseDuration(value, fallbackMs) {
  if (typeof value === "number") return value;
  const match = String(value || "").trim().match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return amount * multipliers[unit];
}

function generateRefreshTokenPlain() {
  return crypto.randomBytes(64).toString("hex");
}

async function storeRefreshToken(userId, plainToken, jti, deviceInfo = null) {
  const hash = await bcrypt.hash(plainToken, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXP, 30 * 24 * 60 * 60 * 1000));
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, jti, device_info, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hash, jti, deviceInfo, expiresAt]
  );
  return { expiresAt };
}

async function verifyAndRotateRefreshToken(userId, receivedToken) {
  const { rows } = await pool.query(
    `SELECT id, token_hash, jti, expires_at, revoked
     FROM refresh_tokens
     WHERE user_id = $1
     ORDER BY issued_at DESC
     LIMIT 10`,
    [userId]
  );

  for (const row of rows) {
    if (row.revoked || new Date(row.expires_at) < new Date()) continue;
    const match = await bcrypt.compare(receivedToken, row.token_hash);
    if (match) return { ok: true, jti: row.jti, dbId: row.id };
  }

  return { ok: false };
}

async function revokeRefreshTokenById(id) {
  await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [id]);
}

module.exports = {
  generateRefreshTokenPlain,
  storeRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshTokenById,
  parseDuration,
};