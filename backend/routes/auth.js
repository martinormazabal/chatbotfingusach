const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { signAccessToken, verifyAccessToken } = require("../helpers/jwt");
const {
  generateRefreshTokenPlain,
  storeRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshTokenById,
} = require("../auth/refreshTokens");
const {
  authAttemptLimiter,
  clearLoginAttempts,
  registerFailedLogin,
  isAccountLocked,
  recordSecurityEvent,
} = require("../auth/security");
const { parseCookies, buildRefreshCookie, clearRefreshCookie } = require("../helpers/cookies");

const router = express.Router();

const REFRESH_COOKIE_NAME = process.env.JWT_REFRESH_COOKIE_NAME || "refresh_token";
const ROOT_ADMIN_EMAIL = (process.env.ROOT_ADMIN_EMAIL || "admin@usach.cl").toLowerCase();

function normalizeRole(user) {
  if (!user?.email) return user?.role;
  return user.email.toLowerCase() === ROOT_ADMIN_EMAIL ? "admin" : user.role;
}

async function findUserByCredentials(email, password) {
  const { rows } = await pool.query(
    `SELECT id, username, email, role, failed_login_attempts, locked_until
     FROM users
     WHERE email = $1 AND password_hash = crypt($2, password_hash)
     LIMIT 1`,
    [email, password]
  );
  return rows[0] || null;
}

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, username, email, role, failed_login_attempts, locked_until
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function issueSession({ user, deviceInfo, res }) {
  const normalizedRole = normalizeRole(user);
  const { token: accessToken, jti } = signAccessToken({
    sub: String(user.id),
    role: normalizedRole,
    email: user.email,
  });

  const refreshToken = generateRefreshTokenPlain();
  const stored = await storeRefreshToken(user.id, refreshToken, jti, deviceInfo);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildRefreshCookie(stored.expiresAt));

  return {
    accessToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: normalizedRole,
    },
  };
}

router.post("/login", authAttemptLimiter("login"), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const deviceInfo = req.get("user-agent") || null;

  try {
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser && isAccountLocked(existingUser.locked_until)) {
      await recordSecurityEvent({
        userId: existingUser.id,
        email: normalizedEmail,
        eventType: "login_blocked",
        success: false,
        metadata: { reason: "account_locked" },
        req,
      });
      return res.status(423).json({ error: "Cuenta bloqueada temporalmente por intentos fallidos" });
    }

    const user = await findUserByCredentials(normalizedEmail, password);
    if (!user) {
      await registerFailedLogin(existingUser?.id, normalizedEmail);
      await recordSecurityEvent({
        userId: existingUser?.id || null,
        email: normalizedEmail,
        eventType: "login_failed",
        success: false,
        metadata: { reason: "invalid_credentials" },
        req,
      });
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    await clearLoginAttempts(user.id);
    const session = await issueSession({ user, deviceInfo, res });

    await recordSecurityEvent({
      userId: user.id,
      email: normalizedEmail,
      eventType: "login_success",
      success: true,
      metadata: { role: session.user.role },
      req,
    });

    return res.status(200).json({ success: true, accessToken: session.accessToken, user: session.user });
  } catch (error) {
    return res.status(500).json({ error: "No fue posible iniciar sesión" });
  }
});

router.post("/refresh", authAttemptLimiter("refresh"), async (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const receivedToken = cookies[REFRESH_COOKIE_NAME];
  if (!receivedToken) {
    return res.status(401).json({ error: "Refresh token requerido" });
  }

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: "Access token requerido para rotación" });
  }

  try {
    const payload = verifyAccessToken(accessToken, { ignoreExpiration: true });
    const userId = Number(payload.sub);
    const verification = await verifyAndRotateRefreshToken(userId, receivedToken);
    if (!verification.ok) {
      await recordSecurityEvent({
        userId,
        email: payload.email || null,
        eventType: "refresh_failed",
        success: false,
        metadata: { reason: "token_not_found_or_revoked" },
        req,
      });
      res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());
      return res.status(401).json({ error: "Refresh token inválido, revocado o expirado" });
    }

    await revokeRefreshTokenById(verification.dbId);
    const user = await findUserByEmail((payload.email || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const session = await issueSession({ user, deviceInfo: req.get("user-agent") || null, res });
    await recordSecurityEvent({
      userId: user.id,
      email: user.email,
      eventType: "refresh_success",
      success: true,
      metadata: { previousJti: verification.jti },
      req,
    });

    return res.status(200).json({ success: true, accessToken: session.accessToken, user: session.user });
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());
    return res.status(401).json({ error: "No fue posible renovar la sesión" });
  }
});

router.post("/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const receivedToken = cookies[REFRESH_COOKIE_NAME];

  if (receivedToken) {
    const { rows } = await pool.query(
      `SELECT id, user_id, token_hash FROM refresh_tokens WHERE revoked = FALSE ORDER BY issued_at DESC LIMIT 20`
    );
    for (const row of rows) {
      const matches = await bcrypt.compare(receivedToken, row.token_hash);
      if (matches) {
        await revokeRefreshTokenById(row.id);
        await recordSecurityEvent({
          userId: row.user_id,
          email: null,
          eventType: "logout",
          success: true,
          metadata: { refreshTokenId: row.id },
          req,
        });
        break;
      }
    }
  }

  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookie());
  return res.status(200).json({ success: true });
});

module.exports = router;