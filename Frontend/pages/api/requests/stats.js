export default async function handler(req, res) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    try {
      const r = await fetch(`${backendUrl}/api/requests/stats`);
      const data = await r.json();
      res.status(r.status).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }