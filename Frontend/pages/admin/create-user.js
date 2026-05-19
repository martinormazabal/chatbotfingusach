import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { isRootAdminEmail } from "../../lib/rbac";
import styles from "./createUser.module.css";

const ADMIN_ROLE_OPTIONS = [
  { value: "estudiante", label: "Estudiante" },
  { value: "funcionario", label: "Funcionario" },
  { value: "administrador de documentos", label: "Administrador de documentos" },
  { value: "admin", label: "Administrador" },
];

const PRIVILEGED_CREATOR_ROLES = ["funcionario", "admin"];

function getStoredSession() {
  const rawUser = localStorage.getItem("user");
  if (!rawUser) return null;

  const parsedUser = JSON.parse(rawUser);
  const user = parsedUser?.user || parsedUser;
  const accessToken = parsedUser?.accessToken || user?.accessToken || "";


  return {
    ...user,
    role: (user?.role || "").toLowerCase(),
    email: (user?.email || "").toLowerCase(),
    accessToken,
  };
}

function canUseCreateUserPanel(session) {
  return (
    PRIVILEGED_CREATOR_ROLES.includes(session?.role || "") ||
    isRootAdminEmail(session?.email || "")
  );
}

function clearStoredSession() {
  localStorage.removeItem("user");
}

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
  const [session, setSession] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    try {
      const storedSession = getStoredSession();
      const allowed = canUseCreateUserPanel(storedSession);

      setSession(storedSession);
      setIsAuthorized(Boolean(allowed));

      if (!allowed) {
        setMessage("Solo un funcionario o administrador autenticado puede crear usuarios con privilegios.");
      }
    } catch {
      setSession(null);
      setIsAuthorized(false);
      setMessage("No se pudo validar tu sesión administrativa.");
    }
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isAuthorized || !session?.accessToken) {
      setMessage("Debes iniciar sesión como funcionario o administrador para crear usuarios.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/users/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (response.status === 401) {
        clearStoredSession();
        setSession(null);
        setIsAuthorized(false);
      }

      if (response.ok) {
        setMessage(`Usuario creado exitosamente: ${data.user.email}`);
      } else {
        setMessage(data.error || data.message || "Error desconocido al registrar usuario");
      }
    } catch (error) {
      console.error("Error en handleSubmit (fetch or JSON parse):", error);
      setMessage("Error de conexión o respuesta inválida del servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  const goToLogin = () => router.push("/login");

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <h1>Gestión de Usuarios</h1>
        <p>
          Completa los campos para crear una cuenta desde el panel administrativo protegido.
          Los roles privilegiados solo se habilitan para funcionarios o administradores autenticados.
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
            {message || "Acceso denegado."}
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
              disabled={!isAuthorized}
            />
          </label>

          <label className={styles.field}>
            <span>Correo electrónico *</span>
            <input
              type="email"
              name="email"
              placeholder="usuario@usach.cl; Ej: ana.perez@usach.cl"
              onChange={handleChange}
              required
              disabled={!isAuthorized}
            />
          </label>

          <label className={styles.field}>
            <span>Contraseña temporal *</span>
            <input
              type="password"
              name="password"
              placeholder="Mínimo 6 caracteres, con mayúscula, minúscula y número"
              onChange={handleChange}
              required
              disabled={!isAuthorized}
            />
          </label>

          <label className={styles.field}>
            <span>Rol asignado *</span>
            <select
              name="role"
              onChange={handleChange}
              value={formData.role}
              disabled={!isAuthorized}
            >
              {ADMIN_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={isLoading || !isAuthorized} className={styles.submitButton}>
            {isLoading ? "Creando..." : "Registrar"}
          </button>
          {!isAuthorized && (
            <button type="button" onClick={goToLogin} className={styles.submitButton}>
              Iniciar sesión como administrador
            </button>
          )}
          <p className={styles.feedback} role="status" aria-live="polite">
            {message}
          </p>
        </form>
      </main>
    </div>
  );
}