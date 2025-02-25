import { useState } from 'react';

export default function DocumentUpload() {
  const [state, setState] = useState({
    file: null,
    title: '',
    uploadedBy: '',
    message: '',
    isLoading: false
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 minutos

    setState(prev => ({ ...prev, isLoading: true, message: '' }));

    try {
      const formData = new FormData();
      formData.append('document', state.file);
      formData.append('title', state.title);
      formData.append('uploaded_by', state.uploadedBy);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Error desconocido');
      }

      setState({
        file: null,
        title: '',
        uploadedBy: '',
        message: '✅ Documento subido exitosamente!',
        isLoading: false
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        message: error.name === 'AbortError' 
          ? '⏳ Tiempo de espera excedido' 
          : error.message,
        isLoading: false
      }));
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
            onChange={(e) => setState(prev => ({
              ...prev, 
              file: e.target.files[0]
            }))}
            className="w-full p-2 border rounded"
            required
          />
        </div>

        <div>
          <label className="block mb-2 font-medium">Título:</label>
          <input
            type="text"
            value={state.title}
            onChange={(e) => setState(prev => ({ ...prev, title: e.target.value }))}
            className="w-full p-2 border rounded"
            placeholder="Título del documento"
          />
        </div>

        <button 
          type="submit" 
          disabled={state.isLoading}
          className={`w-full py-2 px-4 rounded text-white font-medium 
            ${state.isLoading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {state.isLoading ? 'Procesando...' : 'Subir Documento'}
        </button>

        {state.message && (
          <div className={`p-3 rounded-md ${
            state.message.includes('✅') 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            {state.message}
          </div>
        )}
      </form>
    </div>
  );
}