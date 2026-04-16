process.on('unhandledRejection', (reason, p) => {
  console.error('🧯 Unhandled Rejection en promesa:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🧯 Uncaught Exception:', err);
});

const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const removeMd = require('remove-markdown');
const CITATION_REGEX = /:contentReference\[\w+:\d+\]\{index=\d+\}/g;
const INIT_RETRY_DELAY_MS = 5000;
const DB_CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS || 12000);


// Descripción: Limpia texto externo eliminando marcadores y formato Markdown para evitar ruido en respuestas.
// Entrada: text (string) recibido por la API que puede contener markdown o referencias de contenido.
// Salida: string saneado sin marcadores ni formato, listo para almacenarse o mostrarse.
// Procesos:
// 1. Validar que el parámetro sea una cadena y rechazar otros tipos.
// 2. Remover coincidencias definidas por CITATION_REGEX del texto original.
// 3. Eliminar cualquier sintaxis Markdown y devolver el resultado recortado.
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

const pool = require("./db");
const dbState = {
  ready: false,
  lastError: null,
  lastSuccessAt: null,
};

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} superó el tiempo límite de ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// Descripción: Inicializa dependencias críticas (BD y servidor Express) con reintentos en caso de fallo.
// Entrada: No recibe parámetros; usa variables de entorno y conexiones globales.
// Salida: Promesa resuelta cuando el servidor está listo o reintenta en caso de error.
// Procesos:
// 1. Verificar la conexión a PostgreSQL y asegurarse de que la extensión pg_trgm esté disponible.
// 2. Configurar la aplicación Express (rutas, middlewares y chequeo de salud).
// 3. Levantar el servidor en el puerto configurado o reintentar si ocurre un error.

const initializeDatabase = async () => {
  try {
    // 1. Verificar conexión PostgreSQL
    await withTimeout(pool.query('SELECT NOW()'), DB_CONNECT_TIMEOUT_MS, "Conexión a PostgreSQL");
    console.log('✅ PostgreSQL conectado');

    // 2. Instalar extensión pg_trgm
    await withTimeout(pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm"), DB_CONNECT_TIMEOUT_MS, "Verificación de pg_trgm");
    console.log('✅ Extensión pg_trgm instalada/verificada');

    dbState.ready = true;
    dbState.lastError = null;
    dbState.lastSuccessAt = new Date().toISOString();
  } catch (error) {
    dbState.ready = false;
    dbState.lastError = error?.message || String(error);
    console.error('❌ Error de inicialización de BD:', dbState.lastError);
    console.log(`⏳ Reintentando conexión a BD en ${INIT_RETRY_DELAY_MS / 1000}s…`);
    setTimeout(initializeDatabase, INIT_RETRY_DELAY_MS);
  }
};

const initialize = () => {
  if (!process.env.DATABASE_URL) {
    ensurePostgresRunning();
  } else {
    console.log("🌐 Usando base de datos externa (Supabase)");
  }
  const app = express();

  // Descripción: Entrega un estado resumido del backend para monitoreo y debugging rápido.
  // Entrada: req (Request) con datos de la petición HTTP, res (Response) para enviar el estado.
  // Salida: JSON con indicadores de disponibilidad de la app, la base de datos y la API de Gemini.
  // Procesos:
  // 1. Construir un estado base con indicadores de servicio y presencia de GEMINI_API_KEY.
  // 2. Probar la conexión a la base de datos y agregar el resultado al estado.
  // 3. Responder con el objeto de estado en formato JSON al cliente.

  app.get('/api/healthz', async (req, res) => {
    const status = {
      up: true,
      geminiKey: !!process.env.GEMINI_API_KEY,
      dbReady: dbState.ready,
      dbLastSuccessAt: dbState.lastSuccessAt,
    };
    try {
      await withTimeout(pool.query('SELECT 1'), DB_CONNECT_TIMEOUT_MS, "Health check DB");
      status.db = true;
    } catch (e) {
      status.db = false;
      status.dbError = e.message;
      status.dbInitError = dbState.lastError;
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
  allowedOrigins.add("https://chatbotfingusach.vercel.app");

  // Descripción: Valida orígenes permitidos para CORS según listas configuradas y dominios seguros.
  // Entrada: origin (string) del encabezado de la petición y callback (Function) para responder la verificación.
  // Salida: Llamada al callback con permiso o error para el middleware CORS.
  // Procesos:
  // 1. Permitir solicitudes sin origen (como Postman) o presentes en la lista blanca configurada.
  // 2. Intentar parsear el origen y aceptar dominios seguros predefinidos si coinciden.
  // 3. Rechazar la solicitud con error cuando el origen no está autorizado o es inválido.

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);

      try {
        const hostname = new URL(origin).hostname;

        if (
          hostname.endsWith("cloudworkstations.dev") ||
          hostname.endsWith("web.app") ||
          hostname.endsWith("firebaseapp.com") ||
          hostname.endsWith("vercel.app")
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

  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.secure || process.env.NODE_ENV !== "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  app.use(cors({ ...corsOptions, credentials: true }));
  app.use((req, _res, next) => {
    if (process.env.DEBUG_AUTH_HEADERS === 'true') {
      console.log('Headers:', req.headers);
      console.log('Authorization:', req.headers.authorization);
    }
    next();
  });
  app.use('/uploads', express.static(uploadDir));
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: true, limit: "12mb" }));

  // Rutas
  app.use("/api/users", require('./routes/users')); // Asegúrate que la ruta sea correcta
  app.use("/api/documents", require('./routes/documents'));
  app.use("/api/requests", require('./routes/requests'));
  app.use("/api/auth", require("./routes/auth"));

  // Manejo de errores
  // Descripción: Captura errores no manejados en rutas y devuelve respuesta genérica para el cliente.
  // Entrada: err (Error) lanzado en middlewares previos, req y res objetos de Express, next para delegar.
  // Salida: Respuesta HTTP 500 con mensaje estándar y registro del stack en consola.
  // Procesos:
  // 1. Registrar el error completo en el log del servidor para análisis.
  // 2. Enviar un JSON con un mensaje de error genérico al cliente.
  // 3. Evitar fuga de detalles internos retornando solo información controlada.
  app.use((err, req, res, next) => {
    console.error('🔥 Error Global:', err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  // Iniciar servidor
  const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Backend en http://0.0.0.0:${PORT}`);
  });

  initializeDatabase();

};

// Ejecutar inicialización
initialize();