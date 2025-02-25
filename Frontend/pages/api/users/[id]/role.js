export default async function handler(req, res) {
  const { id } = req.query;
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  try {
    const response = await fetch(`${backendUrl}/api/users/${id}/role`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": req.headers.authorization || ""
      },
      body: req.body
    });

    // Propagación correcta del estado HTTP
    const data = await response.json();
    return res.status(response.status).json(data);
    
  } catch (error) {
    console.error("API Gateway Error:", error);
    return res.status(500).json({ 
      message: "Error de comunicación con el servidor",
      error: error.message 
    });
  }
}