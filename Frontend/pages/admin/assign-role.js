// frontend/pages/admin/assign-role.js
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function AssignRolePage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    userId: "",
    role: "estudiante",
  });
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error fetching users:", err);
        setUsers([]);
        setMessage("Error al cargar usuarios.");
      }
    }
    fetchUsers();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.userId) return setMessage("Selecciona un usuario.");
    setIsLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/users/${formData.userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: formData.role }),
      });
      const data = await res.json();
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
    if (!confirm("¿Eliminar seleccionados?")) return;
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedUsers }),
      });
      const data = await res.json();
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

  if (!users) return <p>Cargando...</p>;

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white shadow rounded">
      <h2 className="text-xl font-bold mb-4">Asignar Roles</h2>
      {message && <p className="mb-4 text-center text-blue-500">{message}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <select
          name="userId"
          value={formData.userId}
          onChange={handleChange}
          required
          className="w-full p-2 border"
        >
          <option value="">-- Seleccionar usuario --</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.username} ({u.role})
            </option>
          ))}
        </select>
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          required
          className="w-full p-2 border"
        >
          <option value="estudiante">Estudiante</option>
          <option value="funcionario">Funcionario</option>
          <option value="administrador de documentos">Administrador de documentos</option>
        </select>
        <button
          type="submit"
          disabled={isLoading}
          className="bg-blue-500 text-white w-full p-2 rounded disabled:bg-gray-400"
        >
          {isLoading ? "Actualizando..." : "Asignar Rol"}
        </button>
      </form>

      <h3 className="text-lg font-semibold mt-8 mb-2">Eliminar Usuarios</h3>
      <ul className="mb-4">
        {users.map(u => (
          <li key={u.id} className="flex items-center">
            <input
              type="checkbox"
              checked={selectedUsers.includes(u.id)}
              onChange={() => handleUserSelection(u.id)}
              className="mr-2"
            />
            {u.username} ({u.role})
          </li>
        ))}
      </ul>
      <button
        onClick={deleteSelectedUsers}
        disabled={!selectedUsers.length}
        className="bg-red-500 text-white w-full p-2 rounded disabled:bg-gray-400"
      >
        Eliminar Seleccionados
      </button>
    </div>
  );
}