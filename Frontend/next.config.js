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
  origins.add("https://*.cloudworkstations.dev");

  return Array.from(origins);
})();

module.exports = {
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