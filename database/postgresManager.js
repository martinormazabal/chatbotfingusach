const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const dataDir = path.resolve(__dirname, ".pgdata");
const portFile = path.resolve(dataDir, "PORT");

const isLocalHost = (host) => ["localhost", "127.0.0.1"].includes(host);

const readPortFile = () => {
  if (!fs.existsSync(portFile)) {
    return null;
  }

  const portValue = fs.readFileSync(portFile, "utf8").trim();
  return portValue ? Number(portValue) : null;
};

const ensurePostgresRunning = ({
  host = process.env.DB_HOST || "localhost",
} = {}) => {
  if (!isLocalHost(host)) {
    console.log("ℹ️  PostgreSQL externo detectado. Se omitirá la autogestión local.");
    return;
  }

  try {
    execSync("bash ./pg-up.sh", { cwd: __dirname, stdio: "inherit" });
  } catch (err) {
    console.error("❌ No se pudo iniciar PostgreSQL con pg-up.sh:", err.message || err);
    return;
  }

  const detectedPort = readPortFile();
  if (detectedPort) {
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = String(detectedPort);
  }
};

module.exports = {
  ensurePostgresRunning,
};