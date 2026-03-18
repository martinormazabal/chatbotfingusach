const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ISSUER = process.env.JWT_ISSUER || "chatbot-fing-usach";
const AUDIENCE = process.env.JWT_AUDIENCE || "chatbot-clients";
const ACCESS_EXP = process.env.JWT_ACCESS_EXP || "15m";

function getKey(name, pathName) {
  const inlineValue = process.env[name];
  if (inlineValue) {
    return inlineValue.includes("\\n") ? inlineValue.replace(/\\n/g, "\n") : inlineValue;
  }

  const filePath = process.env[pathName];
  if (filePath) {
    return require("fs").readFileSync(filePath, "utf8");
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

  throw new Error(`Falta configurar ${name} o ${pathName}`);
}

const PRIVATE_KEY = getKey("JWT_PRIVATE_KEY", "JWT_PRIVATE_KEY_PATH");
const PUBLIC_KEY = getKey("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_PATH");

function signAccessToken(payload = {}) {
  const jti = crypto.randomUUID();
  const subject = payload.sub || payload.userId;
  const token = jwt.sign({ ...payload, sub: String(subject) }, PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: ACCESS_EXP,
    issuer: ISSUER,
    audience: AUDIENCE,
    jwtid: jti,
  });
  return { token, jti };
}

function verifyAccessToken(token, extraOptions = {}) {
  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ["RS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
    ...extraOptions,
  });
}

module.exports = { signAccessToken, verifyAccessToken };