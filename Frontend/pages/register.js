import React, { useState } from "react";
import Link from "next/link";
import styles from "./admin/createUser.module.css";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "estudiante",
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, role: "estudiante" }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage(`Cuenta creada exitosamente: ${data.user.email}`);
      } else {
        setMessage(data.error || data.message || "Error desconocido al registrar usuario");
      }
    } catch (error) {
      console.error("Error en registro público:", error);
      setMessage("Error de conexión o respuesta inválida del servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/login" legacyBehavior>
          <a className={styles.backLink}>← Volver a iniciar sesión</a>
        </Link>
        <h1>Crear cuenta estudiante</h1>
        <p>
          El registro público crea únicamente cuentas con perfil estudiante. Las cuentas con
          privilegios deben ser gestionadas desde el panel administrativo protegido.
        </p>
        <ul className={styles.hints}>
          <li>Utiliza tu correo institucional.</li>
          <li>Define una contraseña segura y única.</li>
          <li>El rol se asigna automáticamente como estudiante.</li>
        </ul>
      </aside>

      <main className={styles.formArea}>
        <header className={styles.formHeader}>
          <h2>Registro público</h2>
          <p>Los campos marcados con * son obligatorios.</p>
        </header>

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
              placeholder="usuario@usach.cl; Ej: ana.perez@usach.cl"
              onChange={handleChange}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Contraseña *</span>
            <input
              type="password"
              name="password"
              placeholder="Mínimo 6 caracteres, con mayúscula, minúscula y número"
              onChange={handleChange}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Rol asignado</span>
            <input type="text" name="role" value="Estudiante" disabled readOnly />
          </label>

          <button type="submit" disabled={isLoading} className={styles.submitButton}>
            {isLoading ? "Creando..." : "Crear cuenta"}
          </button>

          <p className={styles.feedback} role="status" aria-live="polite">
            {message}
          </p>
        </form>
      </main>
    </div>
  );
}