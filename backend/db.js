const { Pool } = require("pg");
require('dotenv').config();

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || "chatbotuser",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "chatbotdb",
  password: process.env.DB_PASSWORD || "cp1619comm2k1",
  port: process.env.DB_PORT || 5432,
});
console.log(process.env.DB_NAME)
// Exportar el pool para que otros archivos puedan usarlo
module.exports = pool;
