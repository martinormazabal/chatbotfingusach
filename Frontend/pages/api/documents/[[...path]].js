import { buildBackendApiUrl, resolveBackendBaseUrl } from "@/lib/backend-url";

function appendQueryParams(url, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }
    params.append(key, String(value));
  });
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return { error: text || "Respuesta no válida del backend" };
}

function shouldForwardBody(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export default async function handler(req, res) {
  const backendUrl = resolveBackendBaseUrl(req);
  const pathSegments = Array.isArray(req.query.path) ? req.query.path : [];
  const subPath = pathSegments.length ? `/${pathSegments.join("/")}` : "";

  const { path, ...query } = req.query;
  const upstreamUrl = appendQueryParams(
    buildBackendApiUrl(backendUrl, `/api/documents${subPath}`),
    query
  );

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        Authorization: req.headers.authorization || "",
        "x-user-role": req.headers["x-user-role"] || "",
        "x-user-email": req.headers["x-user-email"] || "",
        "Content-Type": req.headers["content-type"] || "application/json",
      },
      body: shouldForwardBody(req.method) ? JSON.stringify(req.body || {}) : undefined,
    });

    const data = await parseResponse(upstream);
    return res.status(upstream.status).json(data);
  } catch (error) {
    console.error("Error proxying /api/documents:", error);
    return res.status(500).json({ error: "Error de comunicación con backend", details: error.message });
  }
}