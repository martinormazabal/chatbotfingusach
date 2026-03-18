const { parseDuration } = require("../auth/refreshTokens");

const REFRESH_COOKIE_NAME = process.env.JWT_REFRESH_COOKIE_NAME || "refresh_token";
const sameSite = (process.env.JWT_REFRESH_COOKIE_SAMESITE || "strict").toLowerCase();

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      const key = part.slice(0, index).trim();
      const value = decodeURIComponent(part.slice(index + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function secureCookiesEnabled() {
  return process.env.NODE_ENV === "production" || process.env.JWT_COOKIE_SECURE === "true";
}

function buildRefreshCookie(expiresAt) {
  return {
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite,
    expires: expiresAt,
    path: "/api/auth",
  };
}

function clearRefreshCookie() {
  return {
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite,
    expires: new Date(Date.now() - parseDuration("1h", 3600000)),
    path: "/api/auth",
  };
}

module.exports = { REFRESH_COOKIE_NAME, parseCookies, buildRefreshCookie, clearRefreshCookie };