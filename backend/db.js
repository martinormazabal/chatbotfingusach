// backend/db.js
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Configuración de la conexión a PostgreSQL
function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

const usingDatabaseUrl = Boolean(process.env.DATABASE_URL);
const forceSSL = isTruthy(process.env.DB_SSL);

const pool = usingDatabaseUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
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
