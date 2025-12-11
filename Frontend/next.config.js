const sanitizeBaseUrl = (url = "") =>
  typeof url === "string" ? url.trim().replace(/\/$/, "") : "";

const parseOrigins = (value = "") =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const backendOrigin =
  sanitizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL) ||
  sanitizeBaseUrl(process.env.BACKEND_URL) ||
  `http://localhost:${process.env.BACKEND_PORT || 5000}`;

const allowedDevOrigins = (() => {
  const origins = new Set(parseOrigins(process.env.NEXT_ALLOWED_DEV_ORIGINS));

  origins.add("http://localhost:3000");
  origins.add("http://127.0.0.1:3000");
  // Los patrones comodín no son aceptados por Next.js, así que registramos explícitamente el dominio base y permitimos inyectar valores concretos via
  // NEXT_ALLOWED_DEV_ORIGINS o NEXT_DEV_ORIGIN.
  const cloudWorkstationPattern = /^https?:\/\/[\w.-]*\.cloudworkstations\.dev$/;
  origins.add(cloudWorkstationPattern);
  origins.add("https://cloudworkstations.dev");

  // En algunos entornos el dominio expuesto cambia de forma impredecible (por ejemplo, cuando se usan túneles o puertos reexpuestos), lo que provoca que el origen real no coincida con el dominio comodín anterior y Next.js bloquee las peticiones a /_next/*. Para evitarlo, permitimos cualquier origen HTTP(S) en modo desarrollo; la opción solo se usa durante el hot-reload y no afecta a producción.
  const catchAllDevOrigin = /^https?:\/\/[^\s]+$/;
  origins.add(catchAllDevOrigin);

  // Permite inyectar explícitamente un origen concreto en entornos no previstos.
  const explicitDevOrigin = sanitizeBaseUrl(process.env.NEXT_DEV_ORIGIN);
  if (explicitDevOrigin) {
    origins.add(explicitDevOrigin);
  }

  return Array.from(origins);
})();

module.exports = {
  // Evita la advertencia de múltiples lockfiles seleccionando el raíz explícitamente
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            // Permite que las rutas Next.js bajo /api/users se resuelvan internamente (evita que el proxy las desvíe al backend directamente, lo que generaba respuestas HTML 404).
            source: "/api/users/:path*",
            destination: "/api/users/:path*",
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
};