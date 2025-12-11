// database/setupDatabase.js
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");
const path = require('path');
// Verificar y depurar la configuración del Pool
console.log('Pool config:', {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});
// Usar variables de entorno
const pool = new Pool({
  user: process.env.DB_USER || 'chatbotuser', // Ej: 'admin'
  password: process.env.DB_PASSWORD || 'cp1619comm2k1',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'chatbotdb'
});

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = Number(process.env.DB_MAX_RETRIES || 10);

const waitForDatabase = async (retries = 0) => {
  try {
    await pool.query("SELECT 1");
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
    return waitForDatabase(nextAttempt);
  }
};

// Ejecutar init.sql
const initFilePath = path.resolve(__dirname, 'init.sql');

const setup = async () => {
  const dbReady = await waitForDatabase();
  if (!dbReady) {
    process.exit(1);
  }
  try {
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
    pool.end();
  }
};

setup();