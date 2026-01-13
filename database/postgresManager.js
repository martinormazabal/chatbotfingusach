const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const dataDir = path.resolve(__dirname, "local");
const logFile = path.resolve(__dirname, "local/logfile");
const socketDir = "/tmp/postgres";
const initLockFile = path.resolve(__dirname, ".postgres-init.lock");
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

const isLocalHost = (host) => ["localhost", "127.0.0.1"].includes(host);

const ensureDataDirInitialized = () => {
  if (!fs.existsSync(dataDir)) {
    console.log(`📁 Directorio de datos no encontrado. Creando: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pgVersionFile = path.join(dataDir, "PG_VERSION");
  if (fs.existsSync(pgVersionFile)) {
    return true;
  }

  if (fs.existsSync(initLockFile) && !isLockStale()) {
    console.log("⏳ Inicialización de PostgreSQL en curso desde otro proceso. Esperando...");
    return false;
  }

  if (fs.existsSync(initLockFile) && isLockStale()) {
    console.warn("⚠️  Se detectó un lock de inicialización antiguo. Limpiando...");
    fs.unlinkSync(initLockFile);
  }

  const hasExistingFiles = fs.readdirSync(dataDir).length > 0;
  if (hasExistingFiles) {
    console.warn("⚠️  El directorio de datos no está vacío y falta PG_VERSION. Se omitirá initdb.");
    return false;
  }

  try {
    execSync("initdb --version", { stdio: "ignore" });
  } catch (err) {
    console.warn("⚠️  initdb no está disponible en el PATH. Se omitirá la inicialización de PostgreSQL.");
    return false;
  }

  let lockHandle;
  try {
    lockHandle = fs.openSync(initLockFile, "wx");
  } catch (lockError) {
    if (lockError.code === "EEXIST") {
      console.log("⏳ Otro proceso está inicializando PostgreSQL. Se omitirá initdb.");
      return false;
    }
    throw lockError;
  }

  try {
    console.log("🧱 Inicializando clúster de PostgreSQL...");
    execSync(`initdb -D ${dataDir}`, { stdio: "inherit" });
    console.log("✅ Directorio de datos inicializado");
    return true;
  } finally {
    if (lockHandle) {
      fs.closeSync(lockHandle);
    }
    if (fs.existsSync(initLockFile)) {
      fs.unlinkSync(initLockFile);
    }
  }
};

const ensurePostgresRunning = ({
  host = process.env.DB_HOST || "localhost",
  port = process.env.DB_PORT || 5432,
} = {}) => {
  if (!isLocalHost(host)) {
    console.log("ℹ️  PostgreSQL externo detectado. Se omitirá la autogestión local.");
    return;
  }

  try {
    execSync("pg_ctl --version", { stdio: "ignore" });
  } catch (err) {
    console.warn("⚠️  pg_ctl no está disponible en el PATH. Se omitirá la autogestión de PostgreSQL.");
    return;
  }

  const dataDirReady = ensureDataDirInitialized();
  if (!dataDirReady) {
    console.log("ℹ️  Continuando sin gestión automática de PostgreSQL. Asegúrate de que el servicio esté disponible.");
    return;
  }

  try {
    execSync(`pg_ctl status -D ${dataDir}`, { stdio: "ignore" });
    console.log("✔️ PostgreSQL ya está en ejecución");
    return;
  } catch (err) {
    if (err?.status !== 3) {
      console.warn("⚠️  No se pudo verificar el estado de PostgreSQL con pg_ctl:", err.message || err);
      console.log("ℹ️  Continuando sin gestión automática de PostgreSQL. Asegúrate de que el servicio esté disponible.");
      return;
    }
  }

  try {
    console.log("🔄 PostgreSQL no está en ejecución. Iniciando...");
    execSync(`mkdir -p ${socketDir}`, { stdio: "inherit" });
    execSync(`chmod 777 ${socketDir}`, { stdio: "inherit" });
    execSync(
      `pg_ctl \
        -D ${dataDir} \
        -l ${logFile} \
        start -w \
        -o "-c listen_addresses='localhost' \
            -c port=${port} \
            -c unix_socket_directories='${socketDir}'"`,
      { stdio: "inherit" }
    );
    console.log("✅ PostgreSQL iniciado");
  } catch (startErr) {
    console.error("❌ No se pudo iniciar PostgreSQL con pg_ctl:", startErr.message || startErr);
  }
};

module.exports = {
  ensurePostgresRunning,
};