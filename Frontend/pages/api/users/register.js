  export default async function handler(req, res) {
    if (req.method === "POST") {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
      try {
        const response = await fetch(`${backendUrl}/api/users/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
  
