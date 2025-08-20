import { useState } from "react";
import React from "react";
import axios from "axios";

export default function ChatbotPage() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [judgement, setJudgement] = useState("");
  const [errorType, setErrorType] = useState("");
  const [observations, setObservations] = useState("");
  const [logs, setLogs] = useState([]);
  const [lastResponseTime, setLastResponseTime] = useState(null);
  const [lastCaseId, setLastCaseId] = useState(null);
  const [lastFecha, setLastFecha] = useState(null);
  const [lastQuery, setLastQuery] = useState("");

  const handleSendQuery = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError("");
    const start = performance.now();

    try {
      const res = await axios.post("/api/requests/chatbot", { query });
      const end = performance.now();
      setLastResponseTime(Math.round(end - start));
      setLastCaseId(res.data?.case_id || res.data?.id || Date.now());
      setLastFecha(new Date().toISOString());
      setLastQuery(query);
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

  const handleRegister = async () => {
    if (!response) return;
    const newLog = {
      case_id: lastCaseId,
      fecha: lastFecha,
      rol_usuario: "usuario",
      pregunta_textual: lastQuery,
      referencia_esperada_o_fuente: reference,
      respuesta_chatbot: response,
      juicio_correctitud: judgement,
      tiempo_respuesta_ms: lastResponseTime,
      tipo_error: errorType,
      observaciones: observations,
    };
    try {
       await axios.post("/api/requests/log", newLog);
       setLogs((prev) => [...prev, newLog]); // también lo ves en tabla local
       // limpiar form
       setReference("");
       setJudgement("");
       setErrorType("");
       setObservations("");
     } catch (e) {
       console.error("Error guardando log:", e);
       alert("No se pudo guardar el registro. Intente nuevamente.");
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

          <div className="mt-4 space-y-2">
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Referencia esperada o fuente"
              className="border p-2 rounded w-full"
            />
            <select
              value={judgement}
              onChange={(e) => setJudgement(e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="">Juicio de correctitud</option>
              <option value="Correcta">Correcta</option>
              <option value="Parcial">Parcial</option>
              <option value="Incorrecta">Incorrecta</option>
            </select>
            <select
              value={errorType}
              onChange={(e) => setErrorType(e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="">Tipo de error (si aplica)</option>
              <option value="R-1">R-1 (recuperación insuficiente)</option>
              <option value="G-1">G-1 (generación inexacta)</option>
              <option value="G-2">G-2 (alucinación)</option>
              <option value="C-1">C-1 (consulta ambigua)</option>
              <option value="S-1">S-1 (seguridad/privacidad)</option>
              <option value="P-1">P-1 (performance)</option>
            </select>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observaciones"
              className="border p-2 rounded w-full"
            />
            <button
              onClick={handleRegister}
              disabled={!judgement || !reference}
              className={`px-4 py-2 rounded text-white
                ${!judgement || !reference ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"}`}>
              Registrar
            </button>
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-8 overflow-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2">case_id</th>
                <th className="border px-2">fecha</th>
                <th className="border px-2">rol_usuario</th>
                <th className="border px-2">pregunta_textual</th>
                <th className="border px-2">referencia_esperada_o_fuente</th>
                <th className="border px-2">respuesta_chatbot</th>
                <th className="border px-2">juicio_correctitud</th>
                <th className="border px-2">tiempo_respuesta_ms</th>
                <th className="border px-2">tipo_error</th>
                <th className="border px-2">observaciones</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => (
                <tr key={idx}>
                  <td className="border px-2">{log.case_id}</td>
                  <td className="border px-2">{log.fecha}</td>
                  <td className="border px-2">{log.rol_usuario}</td>
                  <td className="border px-2">{log.pregunta_textual}</td>
                  <td className="border px-2">{log.referencia_esperada_o_fuente}</td>
                  <td className="border px-2">{log.respuesta_chatbot}</td>
                  <td className="border px-2">{log.juicio_correctitud}</td>
                  <td className="border px-2">{log.tiempo_respuesta_ms}</td>
                  <td className="border px-2">{log.tipo_error}</td>
                  <td className="border px-2">{log.observaciones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}