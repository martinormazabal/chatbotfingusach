// database/postgresManager.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function hasUsableDatabaseUrl() {
  const value = String(process.env.DATABASE_URL || "").trim();
  return Boolean(value) && !value.includes("@HOST:");
}

function shouldUseExternalDatabase() {
  if (isTruthy(process.env.SKIP_LOCAL_POSTGRES)) return true;
  if (hasUsableDatabaseUrl()) return true;

  // En producción (Render), jamás intentamos levantar PostgreSQL local.
  if (process.env.NODE_ENV === "production") return true;

  return false;
}

function ensurePostgresRunning() {
  if (shouldUseExternalDatabase()) {
    if (process.env.NODE_ENV === "production" && !hasUsableDatabaseUrl()) {
      throw new Error("Falta DATABASE_URL válida en producción (Render). Configura la cadena real de Supabase.");
    }

    console.log("ℹ️ DB externa detectada (DATABASE_URL/SKIP_LOCAL_POSTGRES/producción). Se omite pg-up.sh.");
    return { host: process.env.DB_HOST || "remote", port: Number(process.env.DB_PORT || 5432), external: true };
  }
  const cwd = __dirname; // carpeta database
  execFileSync("bash", ["./pg-up.sh"], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  const portFile = path.join(cwd, ".pgdata", "PORT");
  const port = fs.readFileSync(portFile, "utf8").trim();
  if (!port || !/^\d+$/.test(port)) {
    throw new Error(`PORT inválido en ${portFile}: "${port}"`);
  }

  // Sincroniza variables para el resto del proyecto
  process.env.PGHOST = process.env.PGHOST || "127.0.0.1";
  process.env.PGPORT = port;

  // si tu app usa DB_*:
  process.env.DB_HOST = process.env.DB_HOST || process.env.PGHOST;
  process.env.DB_PORT = port;

  return { host: "localhost", port: Number(port), external: false };
}

module.exports = { ensurePostgresRunning, shouldUseExternalDatabase, hasUsableDatabaseUrl };