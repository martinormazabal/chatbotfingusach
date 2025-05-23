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

  const filteredDocs = documents.filter(doc => 
    doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.content?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleContent = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleDelete = async (id) => {
    if (confirm("¿Estás seguro de que quieres eliminar este documento?")) {
      try {
        await axios.delete(`/api/documents/${id}`);
        setSuccessMessage('Documento eliminado exitosamente');
        setDocuments(documents.filter(doc => doc.id !== id));
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
        
        // Refresh the document list (though already updated, ensures consistency)
        refreshDocuments();
      } catch (error) {
        console.error("Error deleting document:", error);
        setError(error.response?.data?.error || "Error eliminando documento");
        setTimeout(() => {
          setError('');
        }, 3000);
      }
    }
  };

  const refreshDocuments = async () => {
    try {
      const { data } = await axios.get("/api/documents");
      setDocuments(data);
    } catch (error) {
      console.error("Error refreshing documents:", error);
      setError(error.response?.data?.error || "Error actualizando documentos");
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Documentos Subidos</h1>
      
      {/* Barra de búsqueda */}
      <input
        type="text"
        placeholder="Buscar documentos..."
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4 p-2 border rounded w-full"
      />

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-100 text-green-700 p-3 rounded mb-4">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4">
        {filteredDocs.map((doc) => {
          if (
            doc &&
            typeof doc === 'object' &&
            'title' in doc &&
            'content' in doc &&
            'uploaded_by' in doc &&
            'upload_date' in doc
          ) {
            return (
              <div key={doc.id} className="border rounded-lg p-4 shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold">{doc.title}</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Subido por: {doc.uploaded_by} - {doc.upload_date}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleContent(doc.id)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {expandedId === doc.id ? 'Ocultar' : 'Ver más'}
                  </button>
                </div>

                {expandedId === doc.id && (
                  <div className="mt-4">
                    <div
                      className="bg-gray-50 p-3 rounded"
                      style={{
                        maxHeight: '300px',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        wordWrap: 'break-word',
                      }}
                    >
                      <pre className="whitespace-pre-wrap font-sans">
                        {doc.content}
                      </pre>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                      <div key={doc.id} className="border rounded-lg p-4 shadow-md">
                        <Link href={`/documents/${doc.id}`} legacyBehavior>
                          <a className="text-sm text-blue-600 hover:underline">
                            Ver detalle
                          </a>
                        </Link>
                      </div>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          } else {
            console.warn('Invalid document data:', doc);
            return null; // Skip rendering invalid document
          }
        })}
        
        {documents.length === 0 && !error && (
          <div className="text-center py-8 text-gray-500">
            No hay documentos subidos aún
          </div>
        )}
      </div>
    </div>
  );
}