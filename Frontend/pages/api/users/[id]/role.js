import { buildBackendApiUrl, resolveBackendBaseUrl } from "@/lib/backend-url";

function isJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json");
}

async function parseResponse(response) {
  if (isJsonResponse(response)) {
    return response.json();
  }
  const text = await response.text();
  if (text?.trim().startsWith("<")) {
    return {
      message:
        "No se pudo actualizar el rol porque el servicio de backend no respondió como JSON.",
    };
  }
  return { message: text || "Respuesta no válida del servidor" };
}

const ALLOWED_METHODS = ["PUT", "POST"];

async function forwardRoleUpdate({ url, method, req }) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.authorization || "",
      "x-user-role": req.headers["x-user-role"] || "",
      "x-user-email": req.headers["x-user-email"] || "",
    },
    body: JSON.stringify(req.body),
  });

  const data = await parseResponse(response);
  return { response, data };
}

function shouldRetryWithAlternatePath(response) {
  return response.status === 404 && !isJsonResponse(response);
}

export default async function handler(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const { id } = req.query;
  const backendUrl = resolveBackendBaseUrl(req);
  const method = req.method === "POST" ? "POST" : "PUT";

  try {
    const targetUrl = buildBackendApiUrl(backendUrl, `/api/users/${id}/role`);
    const primary = await forwardRoleUpdate({ url: targetUrl, method, req });

    if (!primary.response.ok && shouldRetryWithAlternatePath(primary.response)) {
      const fallbackUrl = buildBackendApiUrl(backendUrl, `/users/${id}/role`);
      const secondary = await forwardRoleUpdate({ url: fallbackUrl, method, req });
      return res.status(secondary.response.status).json(secondary.data);
    }

    return res.status(primary.response.status).json(primary.data);
    
  } catch (error) {
    console.error("API Gateway Error:", error);
    return res.status(500).json({
      message: "Error de comunicación con el servidor",
      error: error.message
    });
  }
}