import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './upload.module.css';

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

  const feedbackClass = useMemo(() => {
    if (!feedback.text) return '';
    switch (feedback.type) {
      case 'success':
        return styles.feedbackSuccess;
      case 'warning':
        return styles.feedbackWarning;
      case 'info':
        return styles.feedbackInfo;
      default:
        return styles.feedbackError;
    }
  }, [feedback]);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <h1>Gestión documental</h1>
        <p>
          Sube reglamentos en formato PDF. Recibirás retroalimentación paso a paso sobre el proceso y el estado del OCR.
        </p>
        <ul>
          <li>Formatos aceptados: PDF.</li>
          <li>Tiempo estimado: hasta 5 minutos por OCR.</li>
          <li>No cierres la ventana hasta recibir confirmación.</li>
        </ul>
      </aside>

      <main className={styles.formArea}>
        <header className={styles.header}>
          <h2>Subir documento</h2>
          <p>Selecciona tu archivo y añade un título de referencia.</p>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>Archivo PDF *</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files[0])}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Título (opcional)</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Si se deja vacío se usará el nombre del archivo"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className={styles.submitButton}
          >
            {isLoading ? 'Procesando...' : 'Subir y procesar'}
          </button>

          <p className={`${styles.feedback} ${feedbackClass}`} role="status" aria-live="polite">
            {feedback.text}
          </p>
        </form>
      </main>
    </div>
  );
}