const sanitizeBaseUrl = (url = "") =>
  typeof url === "string" ? url.trim().replace(/\/$/, "") : "";

// Evita que advertencias conocidas saturen la consola de desarrollo.
// Next.js emite repetidamente "Warning: Ran out of space in font private use area" al
// trabajar con ciertas fuentes de PDF; el hook hace que solo se registre una vez.
const muteKnownWarnings = () => {
  if (process.env.NODE_ENV !== "development") return;

  const originalWarn = console.warn;
  const seen = new Set();
  console.warn = (...args) => {
    const message = args.join(" ");

    if (message.includes("Ran out of space in font private use area")) {
      if (seen.has("font-private-use")) return;
      seen.add("font-private-use");
    }

    originalWarn(...args);
  };
};

const parseOrigins = (value = "") =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const parseBytes = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return null;

  const lower = value.trim().toLowerCase();
  if (lower.endsWith("kb")) return Math.floor(numeric * 1024);
  if (lower.endsWith("mb")) return Math.floor(numeric * 1024 * 1024);
  if (lower.endsWith("gb")) return Math.floor(numeric * 1024 * 1024 * 1024);

  return Math.floor(numeric);
};

const backendOrigin =
  sanitizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL) ||
  sanitizeBaseUrl(process.env.BACKEND_URL) ||
  `http://localhost:${process.env.BACKEND_PORT || 5000}`;

muteKnownWarnings();

// Límite máximo permitido por el servidor de desarrollo de Next.js antes de reenviar la petición al backend.
// Previene el error "Request body exceeded 10MB" al subir PDFs grandes vía proxy.
const middlewareClientMaxBodySize =
  parseBytes(process.env.NEXT_MIDDLEWARE_MAX_BODY_SIZE) || 50 * 1024 * 1024;

const allowedDevOrigins = (() => {
  const origins = new Set(parseOrigins(process.env.NEXT_ALLOWED_DEV_ORIGINS));

  origins.add("http://localhost:3000");
  origins.add("http://127.0.0.1:3000");
  origins.add("cloudworkstations.dev");
  origins.add("*.cloudworkstations.dev");

  const explicitDevOrigin = sanitizeBaseUrl(process.env.NEXT_DEV_ORIGIN);
  if (explicitDevOrigin) {
    origins.add(explicitDevOrigin);
  }

  // Si se conoce el dominio público que expone el IDE (por ejemplo Cloud Workstations), se puede inyectar vía NEXT_PUBLIC_SITE_ORIGIN.
  const publicDevOrigin = sanitizeBaseUrl(process.env.NEXT_PUBLIC_SITE_ORIGIN);
  if (publicDevOrigin) {
    origins.add(publicDevOrigin);
  }

  return Array.from(origins);
})();

module.exports = {
  // Evita la advertencia de múltiples lockfiles seleccionando el raíz explícitamente
  turbopack: {
    root: __dirname,
  },
  middlewareClientMaxBodySize,
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/login",
            destination: "/api/login",
          },
          {
            // Permite que las rutas Next.js bajo /api/users se resuelvan internamente (evita que el proxy las desvíe al backend directamente, lo que generaba respuestas HTML 404).
            source: "/api/users/:path*",
            destination: "/api/users/:path*",
          },
          {
            source: "/api/requests/log",
            destination: "/api/requests/log",
          },
          {
            source: "/api/:path*",
            destination: `${backendOrigin}/api/:path*`,
          },
        ]
      : [];
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: backendOrigin,
  },
  experimental: {
    serverActions: {
      allowedOrigins: allowedDevOrigins,
    },
  },
  // Permite importar módulos que residen fuera del directorio Frontend (por ejemplo, "backend/db.js").
  externalDir: true,
};