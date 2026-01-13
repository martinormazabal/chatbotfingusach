// database/setupDatabase.js
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");
const path = require('path');
const { ensurePostgresRunning } = require("./postgresManager");

ensurePostgresRunning();
// Verificar y depurar la configuración del Pool
console.log('Pool config:', {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});
const dbUser = process.env.DB_USER || 'chatbotuser';
const dbPassword = process.env.DB_PASSWORD || 'cp1619comm2k1';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;
const dbName = process.env.DB_NAME || 'chatbotdb';
const adminUser = process.env.DB_ADMIN_USER || 'postgres';
const adminPassword = process.env.DB_ADMIN_PASSWORD || '';
const adminDatabase = process.env.DB_ADMIN_DB || 'postgres';

const isSafeIdentifier = (identifier) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);

if (![dbUser, dbName, adminUser, adminDatabase].every(isSafeIdentifier)) {
  throw new Error("Invalid database identifier. Use alphanumeric characters and underscores only.");
}

const pool = new Pool({
  user: dbUser,
  password: dbPassword,
  host: dbHost,
  port: dbPort,
  database: dbName
});

const adminPool = new Pool({
  user: adminUser,
  password: adminPassword,
  host: dbHost,
  port: dbPort,
  database: adminDatabase
});

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = Number(process.env.DB_MAX_RETRIES || 10);

const waitForDatabase = async (poolToCheck, retries = 0) => {
  try {
    await poolToCheck.query("SELECT 1");
    return true;
  } catch (error) {
    if (retries >= MAX_RETRIES) {
      console.error(`❌ No se pudo conectar a PostgreSQL tras ${retries} intentos:`, error.message);
      return false;
    }

    const nextAttempt = retries + 1;
    console.log(
      `⏳ PostgreSQL no responde (intento ${nextAttempt}/${MAX_RETRIES}). Reintentando en ${
        RETRY_DELAY_MS / 1000
      }s...`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return waitForDatabase(poolToCheck, nextAttempt);
  }
};

// Ejecutar init.sql
const initFilePath = path.resolve(__dirname, 'init.sql');

const ensureRoleAndDatabase = async () => {
  const roleResult = await adminPool.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [dbUser]
  );

  if (roleResult.rowCount === 0) {
    await adminPool.query(`CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD $1`, [dbPassword]);
  }

  await adminPool.query(`ALTER ROLE "${dbUser}" CREATEDB`);
  await adminPool.query(`ALTER ROLE "${dbUser}" CREATEROLE`);

  const dbResult = await adminPool.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName]
  );

  if (dbResult.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
  }
};

const setup = async () => {
  try {
    const adminReady = await waitForDatabase(adminPool);
    if (!adminReady) {
      process.exit(1);
    }

    await ensureRoleAndDatabase();

    const dbReady = await waitForDatabase(pool);
    if (!dbReady) {
      process.exit(1);
    }
    const initSQL = fs.readFileSync(initFilePath, 'utf8');
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
    await adminPool.end();
    await pool.end();
  }
};

setup();