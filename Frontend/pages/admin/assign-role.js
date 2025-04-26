// frontend/pages/admin/assign-role.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function AssignRolePage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    userId: "",
    role: "estudiante",
  });
  const [selectedUsers, setSelectedUsers] = useState([]); // Para eliminar
  const [message, setMessage] = useState(""); // Para feedback
  const [isLoading, setIsLoading] = useState(false); // Para botón submit

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        } else {
          setMessage(
            `Error al obtener usuarios: ${res.status} - ${res.statusText}`
          );
          console.error("Error fetching users:", res.status, res.statusText);
        }
      } catch (error) {
        console.error("Error fetching users:", error.message);
        setMessage("Error al cargar usuarios.");
      }
    };
    fetchUsers();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/users/${formData.userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ role: formData.role }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Rol actualizado exitosamente.");
        // Actualizar lista de usuarios
        setUsers(
          users.map((user) =>
            user.id === Number(formData.userId) ? { ...user, role: formData.role } : user
          )
        );
      } else {
        setMessage(data.message || "Error al actualizar rol.");
      }
    } catch (error) {
      console.error("Update error:", error);
      setMessage(
        error.message.includes("Failed to fetch")
          ? "Error de conexión con el servidor"
          : "Error en el servidor"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Para manejar selección de usuarios a eliminar
  const handleUserSelection = (userId) => {
    setSelectedUsers((prevSelected) =>
      prevSelected.includes(userId)
        ? prevSelected.filter((id) => id !== userId)
        : [...prevSelected, userId]
    );
  };

  // Para eliminar usuarios seleccionados
  const deleteSelectedUsers = async () => {
    if (selectedUsers.length === 0) {
      setMessage("Selecciona al menos un usuario para eliminar.");
      return;
    }

    if (confirm("¿Estás seguro de que quieres eliminar los usuarios seleccionados?")) {
      try {
        const res = await fetch("/api/users", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ ids: selectedUsers }),
        });

        const data = await res.json();

        if (res.ok) {
          setMessage(data.message || "Usuarios eliminados exitosamente."); 
          // Refrescar la lista de usuarios
          setUsers(users.filter((user) => !selectedUsers.includes(user.id)));
          setSelectedUsers([]); // Limpiar la selección
        } else {
          setMessage(data.message || "Error al eliminar usuarios.");
        }
      } catch (error) {
        console.error("Error deleting users:", error);
        setMessage("Error al eliminar usuarios.");
      }
    }
  };

  // Efecto para limpiar la selección si se eliminan todos los usuarios
  useEffect(() => {
    if (users.length === 0) {
      setSelectedUsers([]);
    }
  }, [users]);

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white shadow rounded">
      <h2 className="text-xl font-bold mb-4">Asignar Roles</h2>
      <form onSubmit={handleSubmit}>
        <select
          name="userId"
          value={formData.userId}
          onChange={handleChange}
          required
          className="w-full p-2 border mb-2"
        >
          <option value="">Seleccionar usuario</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username} ({user.role})
            </option>
          ))}
        </select>
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          required
          className="w-full p-2 border mb-2"
        > <option value="estudiante">Estudiante</option>
          <option value="funcionario">Funcionario</option>
          <option value="administrador de documentos">Administrador</option>
          <option value="borrar">Borrar</option>
        </select>
        <button
          type="submit"
          disabled={isLoading}
          className="bg-blue-500 text-white w-full p-2 rounded disabled:bg-gray-400"
        >
          {isLoading ? "Actualizando..." : "Asignar Rol"}
        </button>
      </form>
      {/* Sección para eliminar usuarios */}
      <h3 className="text-lg font-semibold mt-6 mb-2">Eliminar Usuarios</h3>
      <ul className="mb-4">
        {users.map((user) => (
          <li key={user.id} className="flex items-center">
            <input
              type="checkbox"
              value={user.id}
              checked={selectedUsers.includes(user.id)}
              onChange={() => handleUserSelection(user.id)}
              className="mr-2"
            />
            {user.username} ({user.role})
          </li>
        ))}
      </ul>
      <button
        onClick={deleteSelectedUsers}
        disabled={selectedUsers.length === 0}
        className="bg-red-500 text-white w-full p-2 rounded disabled:bg-gray-400"
      >
        Eliminar Seleccionados
      </button>
      {message && <p className="mt-4 text-center text-blue-500">{message}</p>}
    </div>
  );
}
