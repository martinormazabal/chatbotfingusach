import React from 'react';
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { can, isRootAdminEmail } from "../lib/rbac";
import styles from "./documents.module.css";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [currentContent, setCurrentContent] = useState('');
  const [isLoadingContent] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(null); // Track OCR processing by ID
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const EMPTY_CONTENT_MESSAGE = 'No hay contenido disponible todavía. Utiliza "Procesar OCR" para intentar extraerlo.';

  const statusMap = useMemo(
    () => ({
      'embedded-text': { label: 'Texto embebido detectado', tone: 'success' },
      'ocr-success': { label: 'Texto extraído mediante OCR', tone: 'success' },
      completed: { label: 'Procesamiento completado', tone: 'success' },
      'ocr-empty': { label: 'OCR sin texto legible', tone: 'warning' },
      'ocr-failed': { label: 'OCR fallido o pendiente', tone: 'danger' },
      failed: { label: 'OCR fallido o pendiente', tone: 'danger' },
      'ocr-skipped': { label: 'OCR omitido por usuario', tone: 'info' },
      pending: { label: 'Pendiente de procesamiento', tone: 'info' },
    }),
    []
  );

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
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUserRole(parsedUser?.role || parsedUser?.user?.role || '');
        setUserEmail(parsedUser?.email || parsedUser?.user?.email || '');
      } catch (storageError) {
        console.warn('No se pudo leer el usuario almacenado:', storageError);
        setUserRole('');
        setUserEmail('');
      }
    }
    fetchDocuments();
  }, []);

  const normalizedRole = useMemo(
    () => (userRole ? userRole.toLowerCase() : ''),
    [userRole]
  );

  const canDeleteDocuments = useMemo(
    () => can(normalizedRole, "manage_docs") || isRootAdminEmail(userEmail),
    [normalizedRole, userEmail]
  );


  const toggleExpand = (doc) => {
    if (expandedId === doc.id) {
      setExpandedId(null);
      setCurrentContent('');
    } else {
      // The content is now loaded initially with the document list.
      setCurrentContent(doc.content?.trim() ? doc.content : (doc.ocr_message || EMPTY_CONTENT_MESSAGE));
      setExpandedId(doc.id);
    }
  };

  const renderStatusBadges = (doc) => {
    const badges = [];
    const statusConfig = statusMap[doc.ocr_status] || statusMap.pending;
    badges.push(statusConfig);
    badges.push(doc.has_text ? { label: 'Texto almacenado', tone: 'success' } : { label: 'Sin texto disponible', tone: 'danger' });
    if (doc.ocr_used) {
      badges.push({ label: 'OCR utilizado', tone: 'info' });
    }

    return badges.map((badge, index) => (
      <span
        key={`${doc.id}-${badge.label}-${index}`}
        className={`${styles.statusBadge} ${styles[`status${badge.tone.charAt(0).toUpperCase()}${badge.tone.slice(1)}`]}`}
      >
        {badge.label}
      </span>
    ));
  };

  const canRequestOCR = (doc) => !doc.has_text || ['ocr-empty', 'ocr-failed', 'failed', 'pending'].includes(doc.ocr_status);

  // ADDED: Function to handle on-demand OCR processing.
  const handleRunOCR = async (doc) => {
    if (!canRequestOCR(doc)) {
      setError('Este documento ya tiene texto almacenado. Solo se permite reprocesar los que siguen vacíos.');
      setSuccessMessage('');
      return;
    }

    setIsProcessingOCR(doc.id);
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/api/documents/${doc.id}/ocr`);
      // Refresh the document list to show the new content
      await fetchDocuments();
      setSuccessMessage(res.data.message || "OCR procesado con éxito.");
      // If the processed document is expanded, update its content view
      if (expandedId === doc.id) {
        const updatedDoc = res.data.content;
        setCurrentContent(updatedDoc?.trim() ? updatedDoc : EMPTY_CONTENT_MESSAGE);
      }
    } catch (err) {
      console.error("Error running OCR:", err);
      const apiMessage = err.response?.data?.details || err.response?.data?.error || "Falló el procesamiento OCR.";
      if (err.response?.status === 404) {
        setError(`${apiMessage} Sube nuevamente el PDF para regenerar el vínculo entre la base de datos y el archivo en Firebase Storage.`);
      } else {
        setError(apiMessage);
      }
    } finally {
      setIsProcessingOCR(null);
    }
  };

  const handleDelete = async (id) => {
    if (!canDeleteDocuments) {
      setError('No tienes permisos para eliminar documentos.');
      setSuccessMessage('');
      return;
    }
    if (window.confirm("¿Estás seguro de que quieres eliminar este documento?")) {
      try {
        await axios.delete(`/api/documents/${id}`, {
          headers: {
            'x-user-role': normalizedRole,
            'x-user-email': userEmail,
          },
        });
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

  const statusClass = useMemo(() => {
    if (error) return styles.alertError;
    if (successMessage) return styles.alertSuccess;
    return '';
  }, [error, successMessage]);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <h1>Documentos subidos</h1>
        <p>Explora el repositorio institucional, procesa OCR bajo demanda y gestiona los archivos existentes.</p>
        <ul>
          <li>Utiliza la búsqueda para encontrar documentos rápidamente.</li>
          <li>Aplica OCR en caso de que el contenido aún no esté disponible.</li>
          <li>Elimina documentos obsoletos para mantener la base actualizada.</li>
        </ul>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h2>Repositorio institucional</h2>
            <p>Resultados filtrados según tu búsqueda.</p>
          </div>
          <label className={styles.search}>
            <span>Buscar por título</span>
            <input
              type="text"
              placeholder="Ej: Reglamento estudiantes"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
        </header>

        {(error || successMessage) && (
          <p className={`${styles.alert} ${statusClass}`} role="status" aria-live="assertive">
            {error ? `Error: ${error}` : successMessage}
          </p>
        )}

        {filteredDocuments.length === 0 && !error ? (
          <div className={styles.emptyState}>
            <h3>No hay documentos aún</h3>
            <p>Cuando subas archivos los verás en esta lista con sus detalles y contenido.</p>
            <Link href="/upload" legacyBehavior>
              <a>Subir mi primer documento</a>
            </Link>
          </div>
        ) : (
          <ul className={styles.list}>
            {filteredDocuments.map((doc) => (
              <li key={doc.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <div>
                    <h3>{doc.title}</h3>
                    <p>Subido por {doc.uploaded_by} el {doc.upload_date}</p>
                    <p className={styles.fileMeta}>
                      <span className={styles.fileTag}>Servidor: {doc.filename}</span>
                      {doc.original_filename && doc.original_filename !== doc.filename && (
                        <span className={styles.fileTag}>Original: {doc.original_filename}</span>
                      )}
                    </p>
                  </div>
                  <div className={styles.actions}>
                  {doc.source_url ? (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.ghostButton}
                      >
                        Ver documento
                      </a>
                    ) : null}
                    <button onClick={() => toggleExpand(doc)} className={styles.secondaryButton}>
                    {expandedId === doc.id ? "Ocultar texto" : "Ver texto chatbot"}
                    </button>
                    <button
                      onClick={() => handleRunOCR(doc)}
                      className={styles.primaryButton}
                      disabled={isProcessingOCR === doc.id || !canRequestOCR(doc)}
                    >
                      {isProcessingOCR === doc.id
                        ? 'Procesando...'
                        : canRequestOCR(doc)
                        ? 'Procesar OCR'
                        : 'OCR actualizado'}
                    </button>
                    <Link href={`/documents/${doc.id}`} legacyBehavior>
                      <a className={styles.ghostButton}>Ver detalles</a>
                    </Link>
                    {canDeleteDocuments && (
                      <button onClick={() => handleDelete(doc.id)} className={styles.dangerButton}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.statusRow}>
                  <div className={styles.statusBadges}>{renderStatusBadges(doc)}</div>
                  {doc.ocr_message && (
                    <p className={styles.statusMessage}>{doc.ocr_message}</p>
                  )}
                </div>
                {!doc.source_url && (
                  <p className={styles.notice}>No hay archivo vinculado en Storage para este documento.</p>
                )}
                {(!doc.content || !doc.content.trim()) && (
                  <p className={styles.notice}>{doc.ocr_message || 'No se ha extraído texto todavía. Ejecuta el OCR para intentarlo.'}</p>
                )}
                {expandedId === doc.id && (
                  <div className={styles.contentBox}>
                    {isLoadingContent ? <p>Cargando...</p> : <p>{currentContent}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}