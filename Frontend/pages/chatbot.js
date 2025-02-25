import { useState } from "react";
import axios from "axios";

export default function ChatbotPage() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendQuery = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setError("");
    
    try {
      const res = await axios.post("/api/requests/chatbot", { query });
      setResponse(res.data.response);
    } catch (error) {
      if (error.response?.status === 429) {
        setError("Espera un momento antes de otra consulta.");
      } else {
        setError(error.response?.data?.details || "Error en la consulta");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Asistente Normativo</h1>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej: ¿Cuál es el proceso de apelación?"
          className="border p-2 rounded flex-grow"
          onKeyPress={(e) => e.key === 'Enter' && handleSendQuery()}
        />
        <button
          onClick={handleSendQuery}
          disabled={isLoading}
          className={`px-4 py-2 rounded ${
            isLoading 
              ? "bg-gray-400 cursor-not-allowed" 
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {isLoading ? "Procesando..." : "Consultar"}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {response && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h2 className="font-semibold mb-2">Respuesta:</h2>
          <div className="prose">
            {response.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}