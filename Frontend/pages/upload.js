import React, { useState } from 'react';

export default function DocumentUpload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
    const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setFeedback({ type: 'error', text: 'Por favor, seleccione un archivo para subir.' });
      return;
    }

    // Aumentar el tiempo de espera a 5 minutos (300,000 ms) para dar tiempo al OCR.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    setIsLoading(true);
    setFeedback({ type: 'info', text: 'Subiendo y procesando el documento... Esto puede tardar varios minutos.' });

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('title', title);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetails = `Error del servidor: ${response.status}`;
        try {
          // El servidor PUEDE responder con un JSON de error estructurado.
          const errorJson = await response.json();
          errorDetails = errorJson.details || errorJson.error || 'Error desconocido en la respuesta de la API.';
        } catch (jsonError) {
          // Si el parseo JSON falla, la respuesta no era JSON (ej. un error 502/504 de gateway).
          const responseText = await response.text();
          errorDetails = `La comunicación con el servidor falló: ${response.status} ${response.statusText}. Respuesta: ${responseText.substring(0, 100)}...`;
          console.error("La respuesta de error no era JSON. Contenido:", responseText);
        }
        throw new Error(errorDetails);
      }

      const result = await response.json();
      if (!result?.success) {
        throw new Error(result?.error || 'La API no confirmó la subida del documento.');
      }

      let alertType = 'success';
      let alertText = '¡Documento subido correctamente!';

      if (result?.ocr?.attempted) {
        if (result.ocr.succeeded) {
          alertText = result.ocr.message || 'Documento subido y texto extraído mediante OCR.';
        } else {
          alertType = 'warning';
          alertText = result.ocr.message || 'Documento subido, pero no fue posible extraer texto automáticamente.';
        }
      } else if (result?.ocr?.message) {
        alertText = result.ocr.message;
      }

      setFeedback({ type: alertType, text: alertText });
      setFile(null);
      setTitle('');
      e.target.reset(); // Resetea el formulario, incluyendo el input de archivo.

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        setFeedback({
          type: 'warning',
          text: '⏳ El tiempo de espera ha sido excedido (5 minutos). El archivo podría ser muy grande o el servidor está sobrecargado. Por favor, inténtelo de nuevo.'
        });
      } else {
        setFeedback({ type: 'error', text: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">Subir Documento</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-2 font-medium">Archivo PDF:</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full p-2 border rounded file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            required
          />
        </div>

        <div>
          <label className="block mb-2 font-medium">Título (Opcional):</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Si se deja en blanco, se usará el nombre del archivo"
          />
        </div>

        <button 
          type="submit" 
          disabled={isLoading}
          className={`w-full py-2 px-4 rounded text-white font-medium transition-colors 
            ${isLoading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isLoading ? 'Procesando...' : 'Subir y Procesar'}
        </button>

        {feedback.text && (
          <div
            className={`mt-4 p-3 rounded-md text-center ${
              feedback.type === 'success'
                ? 'bg-green-100 text-green-800'
                : feedback.type === 'warning'
                ? 'bg-yellow-100 text-yellow-800'
                : feedback.type === 'info'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </form>
    </div>
  );
}