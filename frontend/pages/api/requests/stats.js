import { resolveBackendBaseUrl } from "../../../lib/backend-url";

export default async function handler(req, res) {
  const backendUrl = resolveBackendBaseUrl(req);

  try {
    const response = await fetch(`${backendUrl}/api/requests/stats`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}