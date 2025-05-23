// frontend/pages/documents/[id].js
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function DocumentDetail() {
  const { query: { id } } = useRouter();
  const [content, setContent] = useState('');
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!id) return;
    axios.get(`/api/documents/${id}/content`)
      .then(res => setContent(res.data.content))
      .catch(err => setError(err.response?.data?.error || 'Error al cargar'));
  }, [id]);

  if (error) return <p className="text-red-500">{error}</p>;
  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">Detalle del Documento {id}</h1>
      <pre className="whitespace-pre-wrap">{content}</pre>
      <a 
        href={`/uploads/${content.filename}`} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        Descargar PDF original
      </a>
    </div>
  );
}