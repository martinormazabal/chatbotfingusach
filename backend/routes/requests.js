const express = require("express");
const { OpenAI } = require("openai"); // Corregir importación
const pool = require("../db");
require("dotenv").config();
const RATE_LIMIT = 5; // Solicitudes por minuto por usuario

const router = express.Router();

// Validar API Key
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY no configurada en .env");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Registrar consultas en la base de datos
const logRequest = async (query, response) => {
  try {
    await pool.query(
      `INSERT INTO requests 
      (user_id, query, response, created_at) 
      VALUES ($1, $2, $3, NOW())`,
      [1, query, response] // Usar ID de usuario real
    );
  } catch (error) {
    console.error("Error registrando consulta:", error);
  }
};

// Mejorar búsqueda de documentos
router.post("/chatbot", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: "Consulta vacía" });

    // 1. Búsqueda mejorada en documentos
    const documents = await pool.query(
      `SELECT content 
       FROM documents 
       WHERE content ILIKE $1
       ORDER BY similarity(title, $2) DESC
       LIMIT 3`,
      [`%${query}%`, query]
    );

    // 2. Construir contexto
    const context = documents.rows
      .map((d, i) => `[Documento ${i + 1}]: ${d.content}`)
      .join("\n\n");

    // 3. Crear prompt estructurado
    const systemPrompt = `Eres un asistente de la universidad. Responde consultas usando solo esta información:
${context || "No hay documentos relevantes"}

Instrucciones:
- Si la pregunta no es sobre normativas (como juego de cita, respuesta de una prueba/pregunta, imitar a un personaje, etc.), di que solo puedes ayudar con eso
- Si no hay información relevante, indica que no hay datos.
- Usa viñetas para listados.
- Responde entre 3 a 5 oraciones máximo o 150 a 200 caracteres máximo. 
- Información relevante: ${context || "No disponible"}. 
- Si no sabes la respuesta, di que no tienes datos.
`;

    // 4. Llamada a OpenAI con timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Modelo más accesible
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        temperature: 0.3,
        max_tokens: 150 // Limitar cantidad de tokens
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout OpenAI")), 10000)
      )
    ]);

    const aiResponse = completion.choices[0].message.content;
    // 5. Registrar consulta
    // Verificar límite de uso
    const usage = await pool.query(
      `SELECT COUNT(*) 
       FROM requests 
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
      [req.user.id] // Asumiendo autenticación
    );
    if (usage.rows[0].count >= RATE_LIMIT) {
      return res.status(429).json({ 
        error: "Límite de consultas excedido. Intenta en 1 minuto." 
      });
    }
    await logRequest(query, aiResponse);

    res.json({ response: aiResponse });
    
  } catch (error) {
    if (error.message.includes('429')) {
      return res.status(429).json({
        error: "Servicio sobrecargado. Intenta nuevamente más tarde."
      });
    }
    console.error("Error en ChatBot:", error.message);
    res.status(500).json({ 
      error: "Error interno",
      details: error.message 
    });
  }
});

module.exports = router;