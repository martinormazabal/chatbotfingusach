const { verifyAccessToken } = require("../helpers/jwt");

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Sin token" });
    }
    const token = auth.slice(7);
    const payload = verifyAccessToken(token);
    req.user = { id: Number(payload.sub), role: payload.role, email: payload.email, jti: payload.jti };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}

module.exports = requireAuth;