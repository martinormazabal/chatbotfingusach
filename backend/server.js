process.on('unhandledRejection', (reason, p) => {
  console.error('🧯 Unhandled Rejection en promesa:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🧯 Uncaught Exception:', err);
});

const express = require("express");
const cors = require("cors");
const fs = require("fs"); // Importar el módulo fs
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const pool = require("./db");
const { execSync } = require("child_process");
const removeMd = require('remove-markdown');
const CITATION_REGEX = /:contentReference\[\w+:\d+\]\{index=\d+\}/g;


//Tu función sanitize se aplica a los textos que llegan o salen de tu API, no al propio código
function sanitize(text) {
  if (typeof text !== 'string') {
    throw new Error('Invalid input type for sanitize function. Expected a string.');
  }
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

let pgCtlAvailable = false;

//Configuración inicial
try {
  execSync('pg_ctl --version', { stdio: 'ignore' });
  pgCtlAvailable = true;
} catch (err) {
  console.warn('⚠️  pg_ctl no está disponible en el PATH. Se omitirá la autogestión de PostgreSQL.');
}

let isRunning = null;

if (pgCtlAvailable) {
  let isRunning;

  try {
    if (!fs.existsSync(dataDir)) {
      console.log(`📁 Directorio de datos no encontrado. Creando: ${dataDir}`);
      fs.mkdirSync(dataDir, { recursive: true });
    }
    execSync(`pg_ctl status -D ${dataDir}`, { stdio: 'ignore' });
    isRunning = true;
  } catch (err) {
    if (err?.status === 3) {
      isRunning = false;
    } else {
      console.error('⚠️  No se pudo verificar el estado de PostgreSQL con pg_ctl:', err.message || err);
      isRunning = null;
    }
  }

  if (isRunning === false) {
    try {
      console.log('🔄 PostgreSQL no está en ejecución. Iniciando...');
      execSync(`mkdir -p ${socketDir}`, { stdio: 'inherit' });
      execSync(`chmod 777 ${socketDir}`, { stdio: 'inherit' });
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
      isRunning = true;
    } catch (startErr) {
      console.error('❌ No se pudo iniciar PostgreSQL con pg_ctl:', startErr.message || startErr);
    }
  } else if (isRunning) {
    console.log('✔️ PostgreSQL ya está en ejecución');
  } else {
    console.log('ℹ️  Continuando sin gestión automática de PostgreSQL. Asegúrate de que el servicio esté disponible.');
  }
} else {
  console.log('ℹ️  Continuando sin gestión automática de PostgreSQL. Se asumirá que la base de datos está gestionada externamente.');
}

const INIT_RETRY_DELAY_MS = 5000;

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

    app.get('/api/healthz', async (req, res) => {
      const status = {
        up: true,
        geminiKey: !!process.env.GEMINI_API_KEY,
      };
      try {
        await pool.query('SELECT 1');
        status.db = true;
      } catch (e) {
        status.db = false;
        status.dbError = e.message;
      }
      res.json(status);
    });

    const uploadDir = path.join(__dirname, 'uploads');
    // Middlewares
    const allowedOrigins = new Set(
      (process.env.FRONTEND_URL || process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    );
    allowedOrigins.add("http://localhost:3000");

    const corsOptions = {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);

        try {
          const hostname = new URL(origin).hostname;
          
          if (
            hostname.endsWith("cloudworkstations.dev") ||
            hostname.endsWith("web.app") ||
            hostname.endsWith("firebaseapp.com")
          ) {
            return callback(null, true);
          }
        } catch (parseError) {
          console.warn("Origen de CORS inválido recibido:", origin, parseError.message);
          return callback(new Error("Solicitud bloqueada por CORS"));
        }

        return callback(new Error("Solicitud bloqueada por CORS"));
      },
    };

    app.use(cors(corsOptions));
    app.use('/uploads', express.static(uploadDir));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Rutas
    app.use("/api/users", require('./routes/users')); // Asegúrate que la ruta sea correcta
    app.use("/api/documents", require('./routes/documents'));
    app.use("/api/requests", require('./routes/requests'));
    app.use("/api/auth", require("./routes/auth"));

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
    console.error('❌ Error de inicialización:', error?.message || error);
    console.log(`⏳ Reintentando inicialización en ${INIT_RETRY_DELAY_MS / 1000}s…`);
    setTimeout(initialize, INIT_RETRY_DELAY_MS);
  }
};

// Ejecutar inicialización
initialize();