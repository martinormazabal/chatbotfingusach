// database/setupDatabase.js
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");
const path = require('path');
const { ensurePostgresRunning } = require("./postgresManager");

const { host: runtimeHost, port: runtimePort } = ensurePostgresRunning();
// Verificar y depurar la configuración del Pool
console.log('Pool config:', {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});
const dbUser = process.env.DB_USER || "chatbotuser";
const dbPassword = process.env.DB_PASSWORD || "cp1619comm2k1";
const dbHost = process.env.DB_HOST || runtimeHost || "localhost";
const dbPort = Number(process.env.DB_PORT || runtimePort);
const dbName = process.env.DB_NAME || "chatbotdb";
const adminPassword = process.env.DB_ADMIN_PASSWORD || "";
const adminDatabase = process.env.DB_ADMIN_DB || "postgres";
const adminUserCandidates = [
  process.env.DB_ADMIN_USER,
  process.env.PGUSER,
  'postgres',
  process.env.USER,
  process.env.LOGNAME,
].filter(Boolean);

const isSafeIdentifier = (identifier) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
const escapeLiteral = (value) => String(value).replace(/'/g, "''");

if (![dbUser, dbName].every(isSafeIdentifier)) {
  throw new Error("Invalid database identifier. Use alphanumeric characters and underscores only.");
}

let pool;

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = Number(process.env.DB_MAX_RETRIES || 10);

const isRoleMissingError = (error) => /role ".+" does not exist/i.test(error.message);

const waitForDatabase = async (poolToCheck, retries = 0, { stopOnRoleMissing = false } = {}) => {
  try {
    await poolToCheck.query("SELECT 1");
    return { ready: true };
  } catch (error) {
    if (stopOnRoleMissing && isRoleMissingError(error)) {
      console.warn(`⚠️  ${error.message}`);
      return { ready: false, reason: "role-missing" };
    }

    if (retries >= MAX_RETRIES) {
      console.error(`❌ No se pudo conectar a PostgreSQL tras ${retries} intentos:`, error.message);
      return { ready: false, reason: "unreachable" };
    }

    const nextAttempt = retries + 1;
    console.log(
      `⏳ PostgreSQL no responde (intento ${nextAttempt}/${MAX_RETRIES}). Reintentando en ${
        RETRY_DELAY_MS / 1000
      }s...`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return waitForDatabase(poolToCheck, nextAttempt, { stopOnRoleMissing });
  }
};

const buildAdminPool = (adminUser) =>
  new Pool({
    user: adminUser,
    password: adminPassword || undefined,
    host: dbHost,
    port: dbPort,
    database: adminDatabase,
  });

const resolveAdminPool = async () => {
  const uniqueCandidates = [...new Set(adminUserCandidates)];

  for (const candidate of uniqueCandidates) {
    const candidatePool = buildAdminPool(candidate);
    const result = await waitForDatabase(candidatePool, 0, { stopOnRoleMissing: true });
    if (result.ready) {
      return { adminUser: candidate, adminPool: candidatePool };
    }

    await candidatePool.end().catch(() => undefined);
  }

  console.error(
    "❌ No se pudo encontrar un usuario administrador válido. Configura DB_ADMIN_USER/DB_ADMIN_PASSWORD o revisa la instalación de PostgreSQL."
  );
  return null;
};

// Ejecutar init.sql
const initFilePath = path.resolve(__dirname, "init.sql");

const ensureRoleAndDatabase = async (adminPool) => {
  const roleNameLiteral = escapeLiteral(dbUser);
  const rolePasswordLiteral = escapeLiteral(dbPassword);
  const databaseNameLiteral = escapeLiteral(dbName);

  await adminPool.query(`
    DO $$
    DECLARE
      role_name text := '${roleNameLiteral}';
      role_password text := '${rolePasswordLiteral}';
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', role_name, role_password);
      END IF;

      EXECUTE format('ALTER ROLE %I CREATEDB', role_name);
      EXECUTE format('ALTER ROLE %I CREATEROLE', role_name);
    END $$;
  `);

  const dbExists = await adminPool.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName]
  );

  if (dbExists.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
  }
};

const setup = async () => {
  let resolvedAdmin;
  try {
    resolvedAdmin = await resolveAdminPool();
    if (!resolvedAdmin) {
      process.exit(1);
    }

    const { adminPool, adminUser } = resolvedAdmin;
    console.log(`ℹ️  Usando usuario administrador: ${adminUser}`);

    const adminReady = await waitForDatabase(adminPool);
    if (!adminReady.ready) {
      await adminPool.end();
      process.exit(1);
    }

    await ensureRoleAndDatabase(adminPool);

    pool = new Pool({
      user: dbUser,
      password: dbPassword,
      host: dbHost,
      port: dbPort,
      database: dbName
    });

    const dbReady = await waitForDatabase(pool);
    if (!dbReady.ready) {
      await adminPool.end();
      process.exit(1);
    }

    const initSQL = fs.readFileSync(initFilePath, "utf8");
    await pool.query(initSQL);
    console.log("✅ Repositorio instalado exitosamente");
  } catch (error) {
    // Si el error indica que ya existen objetos, asumimos que ya está instalado.
    if (error.message.includes("already exists") || error.message.includes("skipping")) {
      console.log("ℹ️ El repositorio ya está instalado");
    } else {
      console.error("❌ Error Setup:", error.message);
      process.exit(1);
    }
  } finally {
    if (resolvedAdmin?.adminPool) {
      await resolvedAdmin.adminPool.end();
    }
    if (pool) {
      await pool.end();
    }
  }
};

setup();