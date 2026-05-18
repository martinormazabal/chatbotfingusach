const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ISSUER = process.env.JWT_ISSUER || "chatbot-fing-usach";
const AUDIENCE = process.env.JWT_AUDIENCE || "chatbot-clients";
const ACCESS_EXP = process.env.JWT_ACCESS_EXP || "15m";
const SHARED_SECRET = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : "";
const AUTH_DIAGNOSTICS_ENABLED = process.env.JWT_DIAGNOSTICS !== "false";

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

function fingerprint(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function formatNumericDate(value) {
  if (!Number.isFinite(Number(value))) return null;
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeJwtMetadata(token) {
  const decoded = jwt.decode(token, { complete: true }) || {};
  const header = decoded.header || {};
  const payload = decoded.payload || {};
  return {
    algorithm: header.alg || "unknown",
    keyId: header.kid || null,
    issuer: payload.iss || null,
    audience: payload.aud || null,
    subject: payload.sub || null,
    role: payload.role || null,
    expiresAt: formatNumericDate(payload.exp),
    issuedAt: formatNumericDate(payload.iat),
    tokenFingerprint: fingerprint(token),
  };
}

function logAuthDiagnostic(message, metadata = {}, level = "log") {
  if (!AUTH_DIAGNOSTICS_ENABLED) return;
  const safeMetadata = {
    issuerExpected: ISSUER,
    audienceExpected: AUDIENCE,
    activeAlgorithm: SHARED_SECRET ? "HS256" : "RS256",
    ...metadata,
  };
  console[level](`[auth:jwt] ${message}`, safeMetadata);
}

function assertRsaKeyPairMatches() {
  if (SHARED_SECRET) {
    logAuthDiagnostic("JWT configurado con secreto compartido HS256", {
      secretFingerprint: fingerprint(SHARED_SECRET),
      hasLegacySharedSecret: true,
    });
    return;
  }

  const privateKeyObject = crypto.createPrivateKey(PRIVATE_KEY);
  const publicKeyObject = crypto.createPublicKey(PUBLIC_KEY);
  const publicFromPrivate = crypto.createPublicKey(privateKeyObject)
    .export({ type: "spki", format: "pem" })
    .toString();
  const configuredPublic = publicKeyObject.export({ type: "spki", format: "pem" }).toString();

  if (publicFromPrivate !== configuredPublic) {
    const error = new Error(
      "JWT_PRIVATE_KEY y JWT_PUBLIC_KEY no pertenecen al mismo par criptográfico RSA."
    );
    logAuthDiagnostic(
      "Par RSA incompatible; los tokens firmados por este backend no podrán validarse con la clave pública configurada",
      {
        privateKeyPublicFingerprint: fingerprint(publicFromPrivate),
        configuredPublicKeyFingerprint: fingerprint(configuredPublic),
      },
      "error"
    );
    throw error;
  }

  logAuthDiagnostic("Par RSA JWT validado correctamente", {
    publicKeyFingerprint: fingerprint(configuredPublic),
  });
}

assertRsaKeyPairMatches();

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
  logAuthDiagnostic("Access token emitido", safeJwtMetadata(token));
  return { token, jti };
}

function verifyAccessToken(token, extraOptions = {}) {
  const metadata = safeJwtMetadata(token);
  const verifyBase = {
    issuer: ISSUER,
    audience: AUDIENCE,
    ...extraOptions,
  };

  try {
    const payload = SHARED_SECRET
      ? jwt.verify(token, SHARED_SECRET, {
          algorithms: ["HS256"],
          ...verifyBase,
        })
      : jwt.verify(token, PUBLIC_KEY, {
          algorithms: ["RS256"],
          ...verifyBase,
        });

    logAuthDiagnostic("Access token verificado", metadata);
    return payload;
  } catch (error) {
    logAuthDiagnostic(
      "Fallo al verificar access token",
      {
        ...metadata,
        errorName: error.name,
        errorMessage: error.message,
        expectedAlgorithms: SHARED_SECRET ? ["HS256"] : ["RS256"],
        keyFingerprint: SHARED_SECRET ? fingerprint(SHARED_SECRET) : fingerprint(PUBLIC_KEY),
      },
      error.name === "TokenExpiredError" ? "warn" : "error"
    );
    throw error;
  }
}

module.exports = { signAccessToken, verifyAccessToken, safeJwtMetadata };