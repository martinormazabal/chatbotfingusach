const express = require("express");
const cors = require("cors");
const fs = require('fs'); // Importar el módulo fs
require('dotenv').config();
const pool = require('./db');
const { execSync } = require('child_process');
const path = require('path');
const removeMd = require('remove-markdown');
const CITATION_REGEX = /:contentReference\[\w+:\d+\]\{index=\d+\}/g;

//Tu función sanitize se aplica a los textos que llegan o salen de tu API, no al propio código
function sanitize(text) {
  // 1) Elimina marcadores de contenido del texto
  let clean = text.replace(CITATION_REGEX, '');
  // 2) Quita cualquier sintaxis Markdown
  clean = removeMd(clean);
  return clean.trim();
}
// Definir rutas absolutas
const dataDir = path.resolve(__dirname, '../database/local');
const logFile = path.resolve(__dirname, '../database/local/logfile');
const socketDir = '/tmp/pgsocket';

let isRunning;

// Configuración inicial
try {
  // Verificar si el directorio de datos existe
  if (!fs.existsSync(dataDir)) {
    console.log(`📁 Directorio de datos no encontrado. Creando: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }
  // Verificar estado de PostgreSQL
  execSync(`pg_ctl status -D ${dataDir}`, { stdio: 'ignore' });
  isRunning = true;
} catch (err) {
  if (err.status === 3) {
    isRunning = false;
  } else {
    console.error('Error verificando estado de PostgreSQL:', err);
    process.exit(1);
  }
}
if (!isRunning) {
  console.log('🔄 PostgreSQL no está en ejecución. Iniciando...');
  // Crea el directorio para el socket
  execSync(`mkdir -p ${socketDir}`,    { stdio: 'inherit' });
  execSync(`chmod 777 ${socketDir}`,    { stdio: 'inherit' });

  // Arranca PostgreSQL con pg_ctl y espera (-w)
  execSync(
    `pg_ctl \
      -D ${dataDir} \
      -l ${logFile} \
      start -w \
      -o "-c listen_addresses='localhost' \
          -c port=5432 \
          -c unix_socket_directories='${socketDir}'"`,
    { stdio: 'inherit' }
  );

  console.log('✅ PostgreSQL iniciado');
} else {
  console.log('✔️ PostgreSQL ya está en ejecución');
}

const initialize = async () => {
  try {
    // 1. Verificar conexión PostgreSQL
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado');

    // 2. Instalar extensión pg_trgm
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    console.log('✅ Extensión pg_trgm instalada/verificada');

    // 3. Iniciar servidor Express
    const app = express();
    const uploadDir = path.join(__dirname, 'uploads');
    // Middlewares
    app.use(cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
    }));
    app.use(
      '/uploads',
      express.static(uploadDir)); //:contentReference[oaicite:0]{index=0}
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cors(/*…*/));

    // Rutas
    app.use("/api/users", require('./routes/users')); // Asegúrate que la ruta sea correcta
    app.use("/api/documents", require('./routes/documents'));
    app.use("/api/requests", require('./routes/requests'));

       // Manejo de errores
       app.use((err, req, res, next) => {
      console.error('🔥 Error Global:', err.stack);
      res.status(500).json({ error: 'Error interno del servidor' });
    });

    // Iniciar servidor
    const PORT = process.env.BACKEND_PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Backend en http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Error de inicialización:', error.message);
    process.exit(1);  // Salir con código de error
  }
};

// Ejecutar inicialización
initialize();