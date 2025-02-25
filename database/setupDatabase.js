// database/setupDatabase.js
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");

// Usar variables de entorno
const pool = new Pool({
  user: process.env.DB_USER || 'chatbotuser', // Ej: 'admin'
  password: process.env.DB_PASSWORD || 'cp1619comm2k1',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'chatbotdb'
});

// Ejecutar init.sql
const initFilePath = "init.sql";

const setup = async () => {
  try {
    const initSQL = fs.readFileSync(initFilePath, "utf8");
    await pool.query(initSQL);
    console.log("✅ Repositorio instalado exitosamente");
  } catch (error) {
    // Si el error indica que ya existen objetos, asumimos que ya está instalado.
    if (
      error.message.includes("already exists") ||
      error.message.includes("skipping")
    ) {
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