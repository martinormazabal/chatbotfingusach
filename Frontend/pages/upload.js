import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './upload.module.css';
import { sanitizeBaseUrl } from '@/lib/backend-url';

export default function DocumentUpload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
  const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

  const uploadEndpoint = useMemo(() => {
    const base = sanitizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL || '');
    return base ? `${base}/api/documents/upload` : '/api/documents/upload';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setFeedback({ type: 'error', text: 'Por favor, seleccione un archivo para subir.' });
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setFeedback({
        type: 'error',
        text: `El archivo supera el límite permitido de ${MAX_UPLOAD_MB} MB. Redúcelo o divídelo antes de intentarlo nuevamente.`
      });
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

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error(`El archivo excede el límite de ${MAX_UPLOAD_MB} MB permitido por el servidor.`);
        }

        let errorDetails = `Error del servidor: ${response.status}`;
        try {
          // El servidor PUEDE responder con un JSON de error estructurado.
          const errorJson = await response.clone().json();
          errorDetails =
            errorJson.details ||
            errorJson.error ||
            errorJson.message ||
            'Error desconocido en la respuesta de la API.';
        } catch (jsonError) {
          try {
            const responseText = await response.text();
            errorDetails = `La comunicación con el servidor falló: ${response.status} ${response.statusText}. Respuesta: ${responseText.substring(0, 160)}...`;
            console.error('La respuesta de error no era JSON. Contenido:', responseText);
          } catch (readError) {
            console.error('No se pudo leer el cuerpo de la respuesta de error', readError);
            errorDetails = 'La comunicación con el servidor falló y no fue posible leer la respuesta de error.';
          }
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
          <li>Tamaño máximo recomendado: {MAX_UPLOAD_MB} MB.</li>
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