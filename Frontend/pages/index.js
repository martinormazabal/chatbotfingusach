// frontend/pages/index.js
import React from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { can } from '../lib/rbac';
import styles from './home.module.css';

export default function Home() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
    router.push('/');
  };

  const roleLabel = useMemo(() => {
    if (!user?.role) return '';
    return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  }, [user?.role]);

  const normalizedRole = useMemo(
    () => (user?.role ? user.role.toLowerCase() : ''),
    [user?.role]
  );

  const displayName = useMemo(() => {
    if (!user?.username) return 'Usuario';
    const parts = user.username.trim().split(/\s+/);
    return parts[0] || 'Usuario';
  }, [user?.username]);

  const visibility = useMemo(() => {
    if (!normalizedRole) {
      return {
        showUsers: true,
        showDocuments: true,
        showChatbot: true,
      };
    }

    const normalizedRole = role.toLowerCase();

    return {
      showUsers: can(normalizedRole, 'manage_users'),
      showDocuments: can(normalizedRole, 'manage_docs'),
      showChatbot: can(normalizedRole, 'chat'),
    };
  }, [normalizedRole]);

  const emptyState = !user && (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2>Acceso restringido</h2>
        <p>Para mantener la confidencialidad institucional inicia sesión antes de continuar.</p>
      </div>
      <div className={styles.actionGrid}>
        <Link href="/login" legacyBehavior>
          <a className={`${styles.actionCard} ${styles.actionPrimary}`}>
            <h3>Iniciar sesión</h3>
            <p>Identifícate para habilitar los módulos del ecosistema documental.</p>
          </a>
        </Link>
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <div className={styles.badgeArea}>
        <div className={styles.badgeCircle} aria-hidden>
          <span>USACH</span>
        </div>
      </div>
      <header className={styles.header}>
        <div>
          <p className={styles.breadcrumb}>Inicio</p>
          <h1 className={styles.title}>Panel Principal</h1>
          <p className={styles.subtitle}>
            Accede rápidamente a las acciones principales del sistema. Cada sección mantiene
            coherencia visual y mensajes claros siguiendo las heurísticas de Nielsen.
          </p>
        </div>
        {user && (
          <div className={styles.userCard}>
            <p className={styles.userGreeting}>Hola, {displayName}</p>
            <p className={styles.userRole}>Perfil: {roleLabel}</p>
            <button type="button" onClick={logout} className={styles.logoutButton}>
              Cerrar Sesión
            </button>
          </div>
        )}
      </header>

      <main className={styles.main}>
      {!user && emptyState}

        {user && visibility.showUsers && (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2>Gestión de Usuarios</h2>
              <p>Administra cuentas y roles de forma segura y consistente.</p>
            </div>
            <div className={styles.actionGrid}>
              <Link href="/admin/create-user" legacyBehavior>
                <a className={`${styles.actionCard} ${styles.actionPrimary}`}>
                  <h3>Crear Usuario</h3>
                  <p>Registra nuevas personas con perfiles alineados al rol institucional.</p>
                </a>
              </Link>
              <Link href="/admin/assign-role" legacyBehavior>
                <a className={styles.actionCard}>
                  <h3>Asignar Perfiles</h3>
                  <p>Otorga permisos adecuados respetando la visibilidad del sistema.</p>
                </a>
              </Link>
            </div>
          </section>
        )}

        {user && visibility.showDocuments && (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2>Gestión Documental</h2>
              <p>Sube, revisa y valida documentos manteniendo un flujo transparente.</p>
            </div>
            <div className={styles.actionGrid}>
              <Link href="/upload" legacyBehavior>
                <a className={styles.actionCard}>
                  <h3>Subir Documentos</h3>
                  <p>Digitaliza reglamentos y asegura retroalimentación inmediata.</p>
                </a>
              </Link>
              <Link href="/documents" legacyBehavior>
                <a className={styles.actionCard}>
                  <h3>Ver Documentos Subidos</h3>
                  <p>Monitorea el estado de los archivos y accede al historial OCR.</p>
                </a>
              </Link>
            </div>
          </section>
        )}

        {user && visibility.showChatbot && (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2>Asistente Virtual</h2>
              <p>Consulta los reglamentos directamente desde el chatbot institucional.</p>
            </div>
            <div className={styles.actionGrid}>
              <Link href="/chatbot" legacyBehavior>
                <a className={`${styles.actionCard} ${styles.actionAccent}`}>
                  <h3>Consultar Reglamentos</h3>
                  <p>Accede a respuestas rápidas con historial de conversaciones.</p>
                </a>
              </Link>
            </div>
          </section>
        )}

        {user && !visibility.showUsers && !visibility.showDocuments && !visibility.showChatbot && (
          <p className={styles.loginReminder}>
          Tu cuenta aún no tiene accesos configurados. Contacta a soporte para solicitar un perfil válido.
          </p>
        )}
      </main>
    </div>
  );
}