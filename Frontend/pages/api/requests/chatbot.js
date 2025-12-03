import { buildBackendApiUrl, resolveBackendBaseUrl } from "@/lib/backend-url";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const backendBaseUrl = resolveBackendBaseUrl(req);

  try {
    const response = await fetch(
      buildBackendApiUrl(backendBaseUrl, "/api/requests/chatbot"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {}),
      }
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("/api/requests/chatbot proxy error:", error);
    return res.status(502).json({
      error:
        "No se pudo contactar al backend. Verifica que el servicio esté en ejecución y accesible desde el entorno actual.",
    });
  }
}