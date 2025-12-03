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
  return { message: text || "Respuesta no válida del servidor" };
}

export default async function handler(req, res) {
  const backendUrl = resolveBackendBaseUrl(req);

  if (req.method === "GET") {
    try {
      const response = await fetch(buildBackendApiUrl(backendUrl, "/api/users"), {
        headers: { Authorization: req.headers.authorization || "" },
      });
      const data = await parseResponse(response);
      return res.status(response.status).json(data);
    } catch (error) {
      console.error("Error al obtener usuarios:", error);
      return res
        .status(500)
        .json({ message: "Error de comunicación con el servidor", error: error.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const response = await fetch(`${backendUrl}/api/users`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization || "",
        },
        body: JSON.stringify(req.body),
      });
      const data = await parseResponse(response);
      return res.status(response.status).json(data);
    } catch (error) {
      console.error("Error al eliminar usuarios:", error);
      return res
        .status(500)
        .json({ message: "Error de comunicación con el servidor", error: error.message });
    }
  }

  return res.status(405).json({ message: "Método no permitido" });
}