const { Pool } = require("pg");

function validateSupavisorSessionUrl(connectionString) {
  const errors = [];

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch (error) {
    return ["DATABASE_URL no es una URL válida."];
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    errors.push("El protocolo debe ser postgres:// o postgresql://.");
  }

  const expectedHostPattern = /^aws-0-[a-z0-9-]+\.pooler\.supabase\.com$/i;
  if (!expectedHostPattern.test(parsed.hostname)) {
    errors.push("El host debe tener formato aws-0-<region>.pooler.supabase.com.");
  }

  const port = parsed.port || "5432";
  if (port !== "5432") {
    errors.push("El puerto debe ser 5432 para Supavisor session mode.");
  }

  const username = decodeURIComponent(parsed.username || "");
  if (!/^postgres\.[a-z0-9]+$/i.test(username)) {
    errors.push("El usuario debe ser postgres.<project_ref> (no solo postgres).");
  }

  const password = decodeURIComponent(parsed.password || "");
  const invalidPlaceholders = new Set(["<password>", "password", "changeme", "your_password"]);
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