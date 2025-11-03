import React from 'react';
import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [currentContent, setCurrentContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(null); // Track OCR processing by ID
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const EMPTY_CONTENT_MESSAGE = 'No hay contenido disponible todavía. Utiliza "Procesar OCR" para intentar extraerlo.';

  async function fetchDocuments() {
    try {
      const { data } = await axios.get("/api/documents");
      if (!Array.isArray(data)) {
        throw new Error("Formato de respuesta inválido");
      }
      // FIX: The API now returns the content again, but it should be truncated or handled safely.
      setDocuments(data);
    } catch (error) {
      console.error("Error fetching documents:", error);
      setError(error.response?.data?.error || "Error obteniendo documentos");
      setDocuments([]);
    }
  }

  useEffect(() => {
    fetchDocuments();
  }, []);

  const toggleExpand = (doc) => {
    if (expandedId === doc.id) {
      setExpandedId(null);
      setCurrentContent('');
    } else {
      // The content is now loaded initially with the document list.
      setCurrentContent(doc.content?.trim() ? doc.content : EMPTY_CONTENT_MESSAGE);
      setExpandedId(doc.id);
    }
  };

  // ADDED: Function to handle on-demand OCR processing.
  const handleRunOCR = async (id) => {
    setIsProcessingOCR(id);
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/api/documents/${id}/run-ocr`);
      // Refresh the document list to show the new content
      await fetchDocuments(); 
      setSuccessMessage(res.data.message || "OCR procesado con éxito.");
      // If the processed document is expanded, update its content view
      if (expandedId === id) {
        const updatedDoc = res.data.content;
        setCurrentContent(updatedDoc?.trim() ? updatedDoc : EMPTY_CONTENT_MESSAGE);
      }
    } catch (err) {
      console.error("Error running OCR:", err);
      setError(err.response?.data?.details || "Falló el procesamiento OCR.");
    } finally {
      setIsProcessingOCR(null);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este documento?")) {
      try {
        await axios.delete(`/api/documents/${id}`);
        setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== id));
        setSuccessMessage("Documento eliminado exitosamente.");
        setError('');
        if (expandedId === id) {
          setExpandedId(null);
          setCurrentContent('');
        }
      } catch (error) {
        console.error("Error deleting document:", error);
        setError(error.response?.data?.details || "Error al eliminar el documento.");
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

      {error && <p className="text-red-500 mb-4">{`Error: ${error}`}</p>}
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
        <p>No hay documentos subidos aún.</p>
      ) : (
        <ul className="space-y-4">
          {filteredDocuments.map((doc) => (
            <li key={doc.id} className="bg-white shadow rounded p-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">{doc.title}</h2>
                <div>
                  <button
                    onClick={() => toggleExpand(doc)}
                    className="bg-blue-500 text-white px-3 py-1 rounded mr-2"
                  >
                    {expandedId === doc.id ? "Ver menos" : "Ver más"}
                  </button>
                   {/* ADDED: Button to trigger OCR processing */}
                  <button
                    onClick={() => handleRunOCR(doc.id)}
                    className="bg-purple-500 text-white px-3 py-1 rounded mr-2"
                    disabled={isProcessingOCR === doc.id}
                  >
                    {isProcessingOCR === doc.id ? 'Procesando...' : 'Procesar OCR'}
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
              {(!doc.content || !doc.content.trim()) && (
                <p className="text-sm text-yellow-700 mt-2">
                  No se ha extraído texto de este documento aún. Usa el botón "Procesar OCR" para intentarlo.
                </p>
              )}
              {expandedId === doc.id && (
                <div className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-60">
                  {isLoadingContent ? <p>Cargando...</p> : <p className="whitespace-pre-wrap">{currentContent}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
