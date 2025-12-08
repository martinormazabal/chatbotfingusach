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
  // Los patrones comodín no son aceptados por Next.js, por lo que usamos
  // expresiones regulares para abarcar los dominios efímeros de cloudworkstations.
  const cloudWorkstationPattern = /^https?:\/\/[\w.-]*\.cloudworkstations\.dev$/;
  origins.add(cloudWorkstationPattern);

  // Permite inyectar explícitamente un origen concreto en entornos no previstos.
  const explicitDevOrigin = sanitizeBaseUrl(process.env.NEXT_DEV_ORIGIN);
  if (explicitDevOrigin) {
    origins.add(explicitDevOrigin);
  }

  return Array.from(origins);
})();

const uploadBodySizeLimit = 50 * 1024 * 1024; // 50 MB

module.exports = {
  // Permite subir PDFs pesados sin que Next.js trunque el cuerpo a 10 MB
  middlewareClientMaxBodySize: uploadBodySizeLimit,
    // Evita advertencias de origen cruzado en desarrollo para los dominios permitidos
  allowedDevOrigins,
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            // Permite que las rutas Next.js bajo /api/users se resuelvan
            // internamente (evita que el proxy las desvíe al backend
            // directamente, lo que generaba respuestas HTML 404).
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