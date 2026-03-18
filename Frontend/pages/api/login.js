// frontend/pages/api/login.js
const backendBase = (() => {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    `http://localhost:${process.env.BACKEND_PORT || 5000}`;

  return String(base).trim().replace(/\/$/, "");
})();

function toAbsUrl(path) {
  const p = String(path || "").trim();
  const pathname = p.startsWith("/") ? p : `/${p}`;
  return new URL(pathname, backendBase).toString();
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      error: "Respuesta no-JSON desde el backend",
      details: (text || "").slice(0, 400),
      status: response.status,
    };
  }
}

async function tryLogin(req, res, path) {
  const url = toAbsUrl(path);

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: req.headers.cookie || "" },
    body: JSON.stringify(req.body ?? {}),
  });

  const setCookie = upstream.headers.get("set-cookie");
  const payload = await parseJsonSafe(upstream);
  return { status: upstream.status, payload, setCookie };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Prueba varias rutas típicas (por si tu backend cambió el prefijo)
  const candidates = [
    "/api/auth/login",
    "/api/login",
    "/auth/login",
    "/login",
  ];

  let last;
  for (const path of candidates) {
    last = await tryLogin(req, res, path);
    // Si NO es 404, ya es “la ruta correcta” (aunque sea 401 por credenciales)
    if (last.status !== 404) break;
  }

  if (last.setCookie) {
    res.setHeader("set-cookie", last.setCookie);
  }
  return res.status(last.status).json(last.payload);
}