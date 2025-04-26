const express = require("express");
const { HfInference } = require("@huggingface/inference");
const pool = require("../db");
require("dotenv").config();

const router = express.Router();

// Cambia aquí el modelo que quieras: llama-2, deepseek, etc.
const HUGGINGFACE_MODEL = "meta-llama/Llama-2-7b-chat-hf"; // Model changed back to Llama-2
// Validar API Key
if (!process.env.HUGGINGFACE_API_KEY) {
  throw new Error("HUGGINGFACE_API_KEY no configurada en .env");
}

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// Registrar consultas en la base de datos
const logRequest = async (query, aiResponse) => {
  try {
        await pool.query(
      `INSERT INTO requests 
       (user_id, query, response, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [1, query, aiResponse] // ID de usuario fijo temporalmente
    );
  } catch (error) {
        console.error("Error registrando consulta:", error);
    
  }
};

// Chatbot
router.post("/chatbot", async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) {
    return res.status(400).json({ error: "Consulta vacía" });
  }

  // 1) obtener contexto de los documentos
  const docs = await pool.query(
    `SELECT content 
       FROM documents 
      WHERE content ILIKE $1
   ORDER BY similarity(title, $2) DESC
      LIMIT 3`,
    [`%${query}%`, query]
  );
  const context = docs.rows.length
    ? docs.rows.map((d, i) => `[Doc ${i+1}]: ${d.content}`).join("\n\n")
    : "No hay documentos relevantes";

  // 2) preparar prompt
  const systemPrompt = `Eres un asistente de la universidad. Usa solo esta información:
${context}

Instrucciones:
- Si la pregunta no es sobre normativas, indica que solo puedes ayudar con eso.
- Si no hay información relevante, di que no tienes datos.
- Usa viñetas para listados.
- Responde en 3–5 oraciones o máximo 150–200 caracteres.
`;

  // 3) combinar prompt y consulta
  const combinedInput = `${systemPrompt}\nUsuario: ${query}\nAsistente:`;

  try {
    // 4) invocar textGeneration
    const { generated_text } = await hf.textGeneration({
      model: HUGGINGFACE_MODEL,
      inputs: combinedInput,
      parameters: {
        max_new_tokens: 200,
        temperature: 0.7
      }
    });

    // 5) guardar en BD
    await logRequest(query, generated_text);

    // 6) devolver respuesta al cliente
    return res.json({ response: generated_text });
  } catch (error) {
    console.error("Error ChatBot (Hugging Face Inference API):", error);
    return res
      .status(502)
      .json({ error: "Error en generación de texto con Hugging Face" });
  }
});

module.exports = router;