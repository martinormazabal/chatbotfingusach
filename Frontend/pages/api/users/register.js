import { buildBackendApiUrl, resolveBackendBaseUrl } from "@/lib/backend-url";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const backendUrl = resolveBackendBaseUrl(req);

    try {
      const response = await fetch(buildBackendApiUrl(backendUrl, "/api/users/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization || "",
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("Error en handler:", error);
      res.status(500).json({ message: "Error en el servidor", error: error.message });
    }
  } else {
    res.status(405).json({ message: "Método no permitido" });
  }
}