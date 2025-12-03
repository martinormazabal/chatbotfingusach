import { buildBackendApiUrl, resolveBackendBaseUrl } from "@/lib/backend-url";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const backendUrl = resolveBackendBaseUrl(req);

  try {
    const response = await fetch(buildBackendApiUrl(backendUrl, "/api/requests/log"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Error proxying /api/requests/log:", error);
    res.status(500).json({ message: "Error en el servidor", error: error.message });
  }
}