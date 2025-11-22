import React from 'react';
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import styles from "./documents.module.css";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [currentContent, setCurrentContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(null); // Track OCR processing by ID
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userEmail, setUserEmail] = useState('');
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
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUserRole(parsedUser.role || '');
        setUserEmail(parsedUser.email || '');
      } catch (storageError) {
        console.warn('No se pudo leer el usuario almacenado:', storageError);
        setUserRole('');
        setUserEmail('');
      }
    }
    fetchDocuments();
  }, []);

  const isAdminRole = useMemo(() => userRole?.toLowerCase() === 'admin', [userRole]);
  const isDocumentAdmin = useMemo(
    () => userRole?.toLowerCase() === 'administrador de documentos',
    [userRole]
  );
  const isPrototypeAdmin = useMemo(
    () => userEmail?.toLowerCase() === 'admin@usach.cl',
    [userEmail]
  );

  const canDeleteDocuments = useMemo(
    () => isPrototypeAdmin || isAdminRole || isDocumentAdmin,
    [isPrototypeAdmin, isAdminRole, isDocumentAdmin]
  );


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
    if (!canDeleteDocuments) {
      setError('No tienes permisos para eliminar documentos.');
      setSuccessMessage('');
      return;
    }
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
                  </div>
                  <div className={styles.actions}>
                    <button onClick={() => toggleExpand(doc)} className={styles.secondaryButton}>
                      {expandedId === doc.id ? "Ver menos" : "Ver más"}
                    </button>
                    <button
                      onClick={() => handleRunOCR(doc.id)}
                      className={styles.primaryButton}
                      disabled={isProcessingOCR === doc.id}
                    >
                      {isProcessingOCR === doc.id ? 'Procesando...' : 'Procesar OCR'}
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
                {(!doc.content || !doc.content.trim()) && (
                  <p className={styles.notice}>No se ha extraído texto todavía. Ejecuta el OCR para intentarlo.</p>
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