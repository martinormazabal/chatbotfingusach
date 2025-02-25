import { useState, useEffect } from "react";
import axios from "axios";

export default function Requests() {
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [steps, setSteps] = useState(null);

  // Buscar solicitudes
  const fetchRequests = async () => {
    try {
      const { data } = await axios.get("/api/requests", {
        params: { search },
      });
      setRequests(data);
    } catch (error) {
      console.error("Error al buscar solicitudes:", error.message);
    }
  };

  // Obtener detalles de la solicitud seleccionada
  const fetchDetails = async (id) => {
    try {
      const { data } = await axios.get(`/api/requests/${id}`);
      setSelectedRequest(data);
    } catch (error) {
      console.error("Error al obtener detalles:", error.message);
    }
  };

  // Obtener pasos de la solicitud
  const fetchSteps = async (id) => {
    try {
      const { data } = await axios.get(`/api/requests/${id}/steps`);
      setSteps(data.steps);
    } catch (error) {
      console.error("Error al obtener pasos:", error.message);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [search]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Buscar Solicitudes</h1>
      <input
        type="text"
        placeholder="Buscar solicitudes..."
        className="border p-2 rounded w-full mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ul className="mb-4">
        {requests.map((req) => (
          <li
            key={req.id}
            className="cursor-pointer p-2 border-b"
            onClick={() => {
              fetchDetails(req.id);
              fetchSteps(req.id);
            }}
          >
            {req.name}
          </li>
        ))}
      </ul>

      {selectedRequest && (
        <div className="border p-4 rounded">
          <h2 className="text-xl font-bold">{selectedRequest.name}</h2>
          <p>{selectedRequest.description}</p>
          {steps && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold">Pasos:</h3>
              <pre className="bg-gray-100 p-4 rounded">{steps}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
