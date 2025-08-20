import React from 'react';
import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const { data } = await axios.get("/api/documents");

        if (!Array.isArray(data)) {
          throw new Error("Formato de respuesta inválido: Se esperaba un array de documentos");
        }
        setDocuments(data);
      } catch (error) {
        console.error("Error:", error);
        setError(error.response?.data?.error || "Error obteniendo documentos");
        setDocuments([]); // Asegurar array vacío
      }
    };

    fetchDocuments();
  }, []);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este documento?")) {
      try {
        const res = await axios.delete(`/api/documents/${id}`);
        if (res.status === 200) {
          setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== id));
          setSuccessMessage("Documento eliminado exitosamente.");
          setError(''); // Clear any previous error
        } else {
          setError(res.data.message || "Error al eliminar el documento.");
          setSuccessMessage('');
        }
      } catch (error) {
        console.error("Error deleting document:", error);
        setError(error.response?.data?.message || "Error al eliminar el documento.");
        setSuccessMessage('');
      }
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Documentos Subidos</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {successMessage && <p className="text-green-500 mb-4">{successMessage}</p>}

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por título..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
        />
      </div>

      {filteredDocuments.length === 0 && !error ? (
        <p>No hay documentos subidos aún o no se encontraron resultados para su búsqueda.</p>
      ) : (
        <ul className="space-y-4">
          {filteredDocuments.map((doc) => (
            <li key={doc.id} className="bg-white shadow rounded p-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">{doc.title}</h2>
                <div>
                  <button
                    onClick={() => toggleExpand(doc.id)}
                    className="bg-blue-500 text-white px-3 py-1 rounded mr-2"
                  >
                    {expandedId === doc.id ? "Ver menos" : "Ver más"}
                  </button>
                  <Link href={`/documents/${doc.id}`}>
                    <button className="bg-green-500 text-white px-3 py-1 rounded mr-2">Ver detalles</button>
                  </Link>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="bg-red-500 text-white px-3 py-1 rounded"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500">Subido por: {doc.uploaded_by} el {doc.upload_date}</p>
              {expandedId === doc.id && (
                <div className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40">
                  <p className="whitespace-pre-wrap">{doc.content}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
