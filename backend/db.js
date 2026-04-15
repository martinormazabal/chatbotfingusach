const { Pool } = require("pg");

function safeDecodeURIComponent(value) {
  try {
    return { value: decodeURIComponent(value), failed: false };
  } catch (_error) {
    return { value, failed: true };
  }
}

function hasUnencodedReservedChars(value) {
  // RFC3986 reserved chars that must be percent-encoded in userinfo when literal.
  return /[\/?#\[\]@]/.test(value);
}

function validateSupavisorSessionUrl(connectionString) {
  const errors = [];

  if (typeof connectionString !== "string" || connectionString.trim().length === 0) {
    return ["DATABASE_URL está vacía o no es un string."];
  }

  const rawValue = connectionString.trim();

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch (error) {
    const malformedHints = [];
    if (rawValue.includes("[") || rawValue.includes("]")) {
      malformedHints.push(
        "Se detectaron corchetes en DATABASE_URL; reemplaza [YOUR-PASSWORD] por la contraseña real.",
      );
    }
    malformedHints.push("Si la contraseña tiene caracteres especiales, usa URL encoding.");
    return ["DATABASE_URL no es una URL válida.", ...malformedHints];
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    errors.push("El protocolo debe ser postgres:// o postgresql://.");
  }

  if (!parsed.hostname.toLowerCase().endsWith(".pooler.supabase.com")) {
    errors.push("El host debe terminar en .pooler.supabase.com.");
  }

  const port = parsed.port || "5432";
  if (port !== "5432") {
    errors.push("El puerto debe ser 5432 para Supavisor session mode.");
  }

  const decodedUsername = safeDecodeURIComponent(parsed.username || "");
  if (decodedUsername.failed) {
    errors.push("El usuario contiene un encoding inválido. Usa URL encoding válido.");
  }
  const username = decodedUsername.value;
  if (!/^postgres\.[a-z0-9]+$/i.test(username)) {
    errors.push("El usuario debe ser postgres.<project_ref> (no solo postgres).");
  }

  const rawPassword = parsed.password || "";
  const decodedPassword = safeDecodeURIComponent(rawPassword);
  if (decodedPassword.failed) {
    errors.push("La contraseña tiene URL encoding inválido. Revisa caracteres especiales y vuelve a codificar.");
  }

  if (hasUnencodedReservedChars(rawPassword)) {
    errors.push("La contraseña contiene caracteres reservados sin codificar. Debes aplicar URL encoding.");
  }

  const password = decodedPassword.value;
  const invalidPlaceholders = new Set([
    "<password>",
    "<your-password>",
    "password",
    "changeme",
    "your_password",
    "[your-password]",
    "[your_password]",
  ]);
  if (!password || invalidPlaceholders.has(password.toLowerCase())) {
    errors.push("La contraseña debe ser la Database Password real de tu proyecto Supabase.");
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (databaseName !== "postgres") {
    errors.push("La base de datos debe ser /postgres para la cadena recomendada de Supavisor.");
  }

  return errors;
}

if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
  const validationErrors = validateSupavisorSessionUrl(process.env.DATABASE_URL);
  if (validationErrors.length > 0) {
    const checklist = validationErrors.map((error) => `- ${error}`).join("\n");
    throw new Error(
      `DATABASE_URL inválida para Render + Supabase (Supavisor session mode):\n${checklist}\n` +
      "Actualiza la variable en Render y redeploya el servicio.",
    );
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;