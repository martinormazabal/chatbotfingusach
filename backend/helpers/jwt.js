const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ISSUER = process.env.JWT_ISSUER || "chatbot-fing-usach";
const AUDIENCE = process.env.JWT_AUDIENCE || "chatbot-clients";
const ACCESS_EXP = process.env.JWT_ACCESS_EXP || "15m";
const SHARED_SECRET = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : "";

function normalizeKeyValue(rawValue) {
  if (!rawValue) return "";
  const trimmed = String(rawValue).trim();
  if (!trimmed) return "";

  if (trimmed.includes("BEGIN ")) {
    return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
  }

  try {
    return Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return trimmed;
  }
}

function readKeyFromFile(filePath) {
  const resolved = path.resolve(filePath);
  return fs.readFileSync(resolved, "utf8");
}

function buildMissingKeyError(name, pathName, base64Name) {
  return new Error(
    `Falta configurar ${name}, ${pathName} o ${base64Name}. ` +
      "Genera las claves RSA y cárgalas como texto PEM, Base64 o ruta a archivo."
  );
}

function getKey(name, pathName, base64Name) {
  const inlineValue = normalizeKeyValue(process.env[name]);
  if (inlineValue) {
    return inlineValue;
  }

  const inlineBase64Value = normalizeKeyValue(process.env[base64Name]);
  if (inlineBase64Value) {
    return inlineBase64Value;
  }

  const filePath = process.env[pathName];
  if (filePath) {
    return readKeyFromFile(filePath);
  }

  if (process.env.NODE_ENV !== "production") {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    return name === "JWT_PRIVATE_KEY" ? privateKey : publicKey;
  }

  throw buildMissingKeyError(name, pathName, base64Name);
}

const PRIVATE_KEY = SHARED_SECRET ? "" : getKey("JWT_PRIVATE_KEY", "JWT_PRIVATE_KEY_PATH", "JWT_PRIVATE_KEY_BASE64");
const PUBLIC_KEY = SHARED_SECRET ? "" : getKey("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_PATH", "JWT_PUBLIC_KEY_BASE64");

function signAccessToken(payload = {}) {
  const jti = crypto.randomUUID();
  const subject = payload.sub || payload.userId;
  const token = jwt.sign(
    { ...payload, sub: String(subject) },
    SHARED_SECRET || PRIVATE_KEY,
    {
      algorithm: SHARED_SECRET ? "HS256" : "RS256",
      expiresIn: ACCESS_EXP,
      issuer: ISSUER,
      audience: AUDIENCE,
      jwtid: jti,
    }
  );
  return { token, jti };
}

function verifyAccessToken(token, extraOptions = {}) {
  const verifyBase = {
    issuer: ISSUER,
    audience: AUDIENCE,
    ...extraOptions,
  };

  if (SHARED_SECRET) {
    return jwt.verify(token, SHARED_SECRET, {
      algorithms: ["HS256"],
      ...verifyBase,
    });
  }

  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ["RS256"],
    ...verifyBase,
  });
}

module.exports = { signAccessToken, verifyAccessToken };