// frontend/pages/documents/[id].js
import React from 'react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import styles from './detail.module.css';
import { sanitizeBaseUrl } from '../../lib/backend-url';

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

  if (error) {
    return (
      <div className={styles.page}>
        <p className={`${styles.alert} ${styles.alertError}`}>{error}</p>
        <Link href="/documents" legacyBehavior>
          <a className={styles.backLink}>← Volver al listado</a>
        </Link>
      </div>
    );
  }

  const isRichContent = content && typeof content === 'object';
  const plainText = isRichContent ? content?.text || '' : content;
  const backendBaseUrl = sanitizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL || '');
  const fileHref = isRichContent && content?.filename
    ? `${backendBaseUrl}/uploads/${content.filename}`
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.breadcrumb}>Documentos · Detalle</p>
          <h1>Documento {id}</h1>
          <p>Visualiza el contenido extraído por OCR y descarga el archivo original.</p>
        </div>
        <Link href="/documents" legacyBehavior>
          <a className={styles.backLink}>← Volver al listado</a>
        </Link>
      </header>

      <section className={styles.contentCard}>
        <h2>Texto procesado</h2>
        <pre>{plainText || 'No existe contenido disponible todavía.'}</pre>
      </section>

      {fileHref && (
        <a
          href={fileHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.downloadButton}
        >
          Descargar PDF original
        </a>
      )}
    </div>
  );
}