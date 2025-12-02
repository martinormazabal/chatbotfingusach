import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import styles from './requests.module.css';

export default function Requests() {
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState('');

  // Buscar solicitudes
  const fetchRequests = async () => {
    try {
      const { data } = await axios.get('/api/requests', {
        params: { search },
      });
      setRequests(data);
      setError('');
    } catch (err) {
      console.error('Error al buscar solicitudes:', err.message);
      setError('No fue posible recuperar las solicitudes.');
      setRequests([]);
    }
  };

  // Obtener detalles de la solicitud seleccionada
  const fetchDetails = async (id) => {
    try {
      const { data } = await axios.get(`/api/requests/${id}`);
      setSelectedRequest(data);
      setError('');
    } catch (err) {
      console.error('Error al obtener detalles:', err.message);
      setError('No fue posible cargar el detalle de la solicitud.');
      setSelectedRequest(null);
    }
  };

  // Obtener pasos de la solicitud
  const fetchSteps = async (id) => {
    try {
      const { data } = await axios.get(`/api/requests/${id}/steps`);
      setSteps(data.steps);
    } catch (err) {
      console.error('Error al obtener pasos:', err.message);
      setSteps(null);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [search]);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <p className={styles.breadcrumb}>Asistente Virtual · Solicitudes oficiales</p>
        <h1>Consultar flujos y paros oficiales</h1>
        <p>
          Visualiza cada trámite con sus etapas para orientar a estudiantes y funcionarios.
          La interfaz replica la experiencia del chatbot para mantener consistencia visual.
        </p>
        <div className={styles.statusCard}>
          <h2>Heurísticas aplicadas</h2>
          <ul>
            <li>Visibilidad del estado: mensajes claros ante errores de búsqueda.</li>
            <li>Control y libertad: puedes reiniciar la búsqueda sin perder el contexto.</li>
            <li>Consistencia: misma jerarquía de títulos y botones que el panel principal.</li>
            <li>Prevención de errores: se limita la eliminación a acciones confirmadas en el backend.</li>
          </ul>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.panel}>
          <header>
            <div>
              <p className={styles.breadcrumb}>Solicitudes · Búsqueda</p>
              <h2>Explora trámites disponibles</h2>
            </div>
            <label className={styles.search}>
              <span>Buscar por nombre</span>
              <input
                type="text"
                placeholder="Ej: suspensión de estudios"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </header>

          {error && (
            <p className={styles.alert} role="status" aria-live="assertive">
              {error}
            </p>
          )}

          <ul className={styles.list}>
            {requests.map((req) => (
              <li key={req.id}>
                <button
                  type="button"
                  className={`${styles.listButton} ${selectedRequest?.id === req.id ? styles.listButtonActive : ''}`}
                  onClick={() => {
                    fetchDetails(req.id);
                    fetchSteps(req.id);
                  }}
                >
                  <h3>{req.name}</h3>
                  <p>{req.description}</p>
                </button>
              </li>
            ))}

            {requests.length === 0 && !error && (
              <li className={styles.emptyState}>No se encontraron resultados para esa búsqueda.</li>
            )}
          </ul>
        </section>

        <section className={styles.panel}>
          <header>
            <h2>Detalle del flujo</h2>
            <p>Selecciona una solicitud para revisar su descripción y pasos oficiales.</p>
          </header>
          {selectedRequest ? (
            <div className={styles.detailCard}>
              <h3>{selectedRequest.name}</h3>
              <p>{selectedRequest.description}</p>
              {steps && (
                <div className={styles.steps}>
                  <h4>Pasos:</h4>
                  <pre>{steps}</pre>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.placeholder}>Elige una solicitud de la lista para ver la información completa.</p>
          )}
        </section>
      </main>
    </div>
  );
}