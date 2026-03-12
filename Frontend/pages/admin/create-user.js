import React from 'react';
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from 'next/router';
import { isRootAdminEmail } from '../../lib/rbac';
import styles from "./createUser.module.css";

export default function CreateUser() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "estudiante",
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const accessSource = useMemo(
    () => (typeof router.query.source === 'string' ? router.query.source : ''),
    [router.query.source]
  );

  useEffect(() => {
    if (!router.isReady) return;

    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      const canSelfRegister = accessSource === 'login';
      setIsAuthorized(canSelfRegister);
      if (!canSelfRegister) {
        setMessage('Solo Funcionario/Admin o acceso desde login pueden crear usuarios.');
      }
      return;
    }

    try {
      const parsedUser = JSON.parse(rawUser);
      const role = (parsedUser?.role || parsedUser?.user?.role || '').toLowerCase();
      const email = (parsedUser?.email || parsedUser?.user?.email || '').toLowerCase();
      const allowed = role === 'funcionario' || role === 'admin' || isRootAdminEmail(email) || accessSource === 'login';
      setCurrentUserRole(role);
      setCurrentUserEmail(email);
      setIsAuthorized(allowed);
      if (!allowed) {
        setMessage('No tienes permisos para crear usuarios.');
      }
    } catch {
      setIsAuthorized(false);
      setCurrentUserRole('');
      setCurrentUserEmail('');
      setMessage('No se pudo validar tu sesión.');
    }
  }, [accessSource, router.isReady]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthorized) {
      setMessage('No tienes permisos para crear usuarios.');
      return;
    }
    setIsLoading(true);
    setMessage(""); // Clear previous messages
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUserRole,
          "x-user-email": currentUserEmail,
          "x-access-source": accessSource,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();      
      if (res.ok) {
        setMessage("Usuario creado exitosamente: " + data.user.email);
      } else {
        // The backend sends specific messages for validation or duplicate errors
        setMessage(data.message || "Error desconocido al registrar usuario");
      }

    } catch (error) {
      console.error("Error en handleSubmit (fetch or JSON parse):", error);
      // This catch block is for network errors or issues parsing the response
      setMessage("Error de conexión o respuesta inválida del servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <h1>Gestión de Usuarios</h1>
        <p>
          Completa los campos para crear una cuenta. Los mensajes de ayuda y errores se muestran de forma clara para una experiencia
          consistente.
        </p>
        <ul className={styles.hints}>
          <li>Utiliza correos institucionales válidos.</li>
          <li>Define contraseñas seguras y únicas.</li>
          <li>Selecciona el rol apropiado antes de guardar.</li>
        </ul>
      </aside>

      <main className={styles.formArea}>
        <header className={styles.formHeader}>
          <h2>Crear nuevo usuario</h2>
          <p>Los campos marcados con * son obligatorios.</p>
        </header>

        {!isAuthorized && (
          <p className={styles.feedback} role="alert">
            {message || 'Acceso denegado.'}
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>Nombre de usuario *</span>
            <input
              type="text"
              name="username"
              placeholder="Ej: Ana Perez"
              onChange={handleChange}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Correo electrónico *</span>
            <input
              type="email"
              name="email"
              placeholder="usuario@usach.cl; Ej:ana.perez@usach.cl"
              onChange={handleChange}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Contraseña temporal *</span>
            <input
              type="password"
              name="password"
              placeholder="Mínimo 6 caracteres"
              onChange={handleChange}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Rol asignado *</span>
            <select
              name="role"
              onChange={handleChange}
              defaultValue="estudiante"
            >
              <option value="estudiante">Estudiante</option>
              <option value="funcionario">Funcionario</option>
              <option value="administrador de documentos">Administrador de documentos</option>
            </select>
          </label>

          <button type="submit" disabled={isLoading || !isAuthorized} className={styles.submitButton}>
            {isLoading ? "Creando..." : "Registrar"}
          </button>

          <p className={styles.feedback} role="status" aria-live="polite">
            {message}
          </p>
        </form>
      </main>
    </div>
  );
}