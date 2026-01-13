const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const envPath = path.resolve(__dirname, "pg.env");
const pgUpScript = path.resolve(__dirname, "pg-up.sh");

const loadEnv = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length)
      : trimmed;
    const [key, ...rest] = withoutExport.split("=");
    if (!key || rest.length === 0) {
      continue;
    }

    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace("$PWD", __dirname);
    env[key.trim()] = value;
  }

  return env;
};

if (!fs.existsSync(envPath)) {
  console.error("No se encontró database/pg.env. Crea el archivo con la configuración de PostgreSQL local.");
  process.exit(1);
}

if (!fs.existsSync(pgUpScript)) {
  console.error("No se encontró database/pg-up.sh. Asegúrate de tener el script disponible.");
  process.exit(1);
}

const envOverrides = loadEnv(envPath);
const nextEnv = { ...process.env, ...envOverrides };

execFileSync("bash", [pgUpScript], { stdio: "inherit", env: nextEnv });