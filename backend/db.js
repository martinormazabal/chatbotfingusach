// backend/db.js
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Configuración de la conexión a PostgreSQL
function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

const rawDatabaseUrl = String(process.env.DATABASE_URL || "").trim();
const usingDatabaseUrl = Boolean(rawDatabaseUrl);

if (usingDatabaseUrl && rawDatabaseUrl.includes("@HOST:")) {
  throw new Error(
    "DATABASE_URL contiene host placeholder (HOST). Reemplázala con la URL real de Supabase para Render."
  );
}
const forceSSL = isTruthy(process.env.DB_SSL);

const pool = usingDatabaseUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL || rawDatabaseUrl,
      ssl: forceSSL ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool({
      user: process.env.DB_USER || "chatbotuser",
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME || "chatbotdb",
      password: process.env.DB_PASSWORD || "cp1619comm2k1",
      port: Number(process.env.DB_PORT || 5432),
      ssl: forceSSL ? { rejectUnauthorized: false } : undefined,
    });

console.log(`ℹ️ PostgreSQL config: ${usingDatabaseUrl ? "DATABASE_URL" : "DB_HOST/DB_NAME"}`);
// Exportar el pool para que otros archivos puedan usarlo
module.exports = pool;
