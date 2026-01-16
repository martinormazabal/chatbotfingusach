// database/postgresManager.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function ensurePostgresRunning() {
  const cwd = __dirname; // carpeta database
  execFileSync("bash", ["./pg-up.sh"], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  const portFile = path.join(cwd, ".pgdata", "PORT");
  const port = fs.readFileSync(portFile, "utf8").trim();

  // Sincroniza variables para el resto del proyecto
  process.env.PGHOST = process.env.PGHOST || "127.0.0.1";
  process.env.PGPORT = port;

  // si tu app usa DB_*:
  process.env.DB_HOST = process.env.DB_HOST || process.env.PGHOST;
  process.env.DB_PORT = port;

  return { host: process.env.PGHOST, port: Number(port) };
}

module.exports = { ensurePostgresRunning };