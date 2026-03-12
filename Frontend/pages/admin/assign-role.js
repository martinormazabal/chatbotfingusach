// frontend/pages/admin/assign-role.js
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { isRootAdminEmail } from '../../lib/rbac';
import styles from "./assignRole.module.css";

const PROTECTED_EMAIL = 'admin@usach.cl';

async function parseJsonSafe(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  if (text?.trim().startsWith("<")) {
    return {
      message:
        "No se pudo contactar con el servicio de roles. Intenta nuevamente o verifica el backend.",
    };
  }
  return { message: text || "Respuesta no válida del servidor" };
}

export default function AssignRolePage() {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    userId: "",
    role: "estudiante",
  });
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      setIsAuthorized(false);
      setMessage('No tienes permisos para asignar roles.');
      return;
    }

    try {
      const parsedUser = JSON.parse(rawUser);
      const role = (parsedUser?.role || parsedUser?.user?.role || '').toLowerCase();
      const email = (parsedUser?.email || parsedUser?.user?.email || '').toLowerCase();
      const allowed = role === 'funcionario' || role === 'admin' || isRootAdminEmail(email);
      setCurrentUserRole(role);
      setCurrentUserEmail(email);
      setIsAuthorized(allowed);
      if (!allowed) {
        setMessage('No tienes permisos para asignar roles.');
      }
    } catch {
      setIsAuthorized(false);
      setMessage('No se pudo validar tu sesión.');
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    async function fetchUsers() {
      try {
        const res = await fetch("/api/users", {
          headers: {
            'x-user-role': currentUserRole,
            'x-user-email': currentUserEmail,
          },
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await parseJsonSafe(res);
        const sanitized = Array.isArray(data) ? data.filter(user => user.email !== PROTECTED_EMAIL) : [];
        setUsers(sanitized);
      } catch (err) {
        console.error("Error fetching users:", err);
        setUsers([]);
        setMessage("Error al cargar usuarios.");
      }
    }
    fetchUsers();
  }, [currentUserEmail, currentUserRole, isAuthorized]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthorized) return setMessage("No tienes permisos para asignar roles.");
    if (!formData.userId) return setMessage("Selecciona un usuario.");
    setIsLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/users/${formData.userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          'x-user-role': currentUserRole,
          'x-user-email': currentUserEmail,
        },
        body: JSON.stringify({ role: formData.role }),
      });
      const data = await parseJsonSafe(res);
      if (res.ok) {
        setMessage("Rol actualizado exitosamente.");
        setUsers(prev =>
          prev.map(u =>
            u.id === Number(formData.userId) ? { ...u, role: formData.role } : u
          )
        );
      } else {
        setMessage(data.message || "Error al actualizar rol.");
      }
    } catch (err) {
      console.error("Update error:", err);
      setMessage("Error en el servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelection = (id) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const deleteSelectedUsers = async () => {
    if (!selectedUsers.length) return setMessage("Selecciona al menos un usuario.");
    if (!isAuthorized) return setMessage("No tienes permisos para eliminar usuarios.");
    if (!confirm("¿Eliminar seleccionados?")) return;
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          'x-user-role': currentUserRole,
          'x-user-email': currentUserEmail,
        },
        body: JSON.stringify({ ids: selectedUsers }),
      });
      const data = await parseJsonSafe(res);
      if (res.ok) {
        setMessage(data.message);
        setUsers(prev => prev.filter(u => !selectedUsers.includes(u.id)));
        setSelectedUsers([]);
      } else {
        setMessage(data.message || "Error al eliminar usuarios.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Error al eliminar usuarios.");
    }
  };

  if (!users) {
    return <p className={styles.loading}>Cargando…</p>;
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <h1>Asignación de roles</h1>
        <p>Revisa la lista de usuarios, actualiza permisos y elimina cuentas cuando sea necesario.</p>
        <Link href="/admin/create-user" legacyBehavior>
          <a className={styles.ctaButton}>Crear cuentas</a>
        </Link>
        <div className={styles.statusCard}>
          <h2>Guía rápida</h2>
          <ul>
            <li>Selecciona un usuario y asigna un rol a la vez.</li>
            <li>Usa la lista inferior para eliminar múltiples cuentas.</li>
            <li>Recibirás confirmaciones inmediatas tras cada acción.</li>
          </ul>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.panel}>
          <header>
            <h2>Actualizar rol</h2>
            <p>Selecciona una cuenta y define el permiso correcto.</p>
          </header>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.field}>
              <span>Usuario *</span>
              <select
                name="userId"
                value={formData.userId}
                onChange={handleChange}
                required
              >
                <option value="">-- Selecciona un usuario --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({u.role})
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Rol *</span>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
              >
                <option value="estudiante">Estudiante</option>
                <option value="funcionario">Funcionario</option>
                <option value="administrador de documentos">Administrador de documentos</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={isLoading || !isAuthorized}
              className={styles.primaryButton}
            >
              {isLoading ? "Actualizando..." : "Asignar rol"}
            </button>
          </form>
          <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
        </section>

        <section className={styles.panel}>
          <header>
            <h2>Eliminar usuarios</h2>
            <p>Selecciona uno o varios usuarios de la lista para eliminarlos definitivamente.</p>
          </header>
          <div className={styles.userList}>
            {users.map(u => (
              <label key={u.id} className={styles.userRow}>
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(u.id)}
                  onChange={() => handleUserSelection(u.id)}
                />
                <div>
                  <p>{u.username}</p>
                  <small>{u.role}</small>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={deleteSelectedUsers}
            disabled={!selectedUsers.length || !isAuthorized}
            className={styles.dangerButton}
          >
            Eliminar seleccionados
          </button>
        </section>
      </main>
    </div>
  );
}