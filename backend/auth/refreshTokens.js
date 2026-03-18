const pool = require("../db");

const WINDOW_MS = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000", 10);
const MAX_REQUESTS = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10);
const MAX_FAILED_ATTEMPTS = Number.parseInt(process.env.AUTH_LOCK_MAX_ATTEMPTS || "5", 10);
const LOCK_MINUTES = Number.parseInt(process.env.AUTH_LOCK_MINUTES || "15", 10);
const buckets = new Map();

function authAttemptLimiter(scope) {
  return (req, res, next) => {
    const key = `${scope}:${req.ip}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + WINDOW_MS;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > MAX_REQUESTS) {
      return res.status(429).json({ error: "Demasiados intentos, intenta nuevamente más tarde" });
    }
    return next();
  };
}

function isAccountLocked(lockedUntil) {
  return lockedUntil && new Date(lockedUntil) > new Date();
}

async function registerFailedLogin(userId, email) {
  if (!userId) return;
  await pool.query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
           WHEN failed_login_attempts + 1 >= $2 THEN NOW() + ($3 * INTERVAL '1 minute')
           ELSE locked_until
         END
     WHERE id = $1`,
    [userId, MAX_FAILED_ATTEMPTS, LOCK_MINUTES]
  );
}

async function clearLoginAttempts(userId) {
  await pool.query(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

async function recordSecurityEvent({ userId = null, email = null, eventType, success, metadata = null, req }) {
  await pool.query(
    `INSERT INTO auth_security_logs (user_id, email, event_type, success, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, email, eventType, success, req.ip, req.get("user-agent") || null, metadata]
  );
}

module.exports = {
  authAttemptLimiter,
  clearLoginAttempts,
  registerFailedLogin,
  isAccountLocked,
  recordSecurityEvent,
};