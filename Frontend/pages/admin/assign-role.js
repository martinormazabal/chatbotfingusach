import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function AssignRolePage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    userId: "",
    role: "estudiante"
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Obtener lista de usuarios
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users");
        const data = await res.json();
        if (res.ok) setUsers(data);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, []);

  // Manejar cambios en el formulario
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Enviar actualización
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/users/${formData.userId}/role`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ role: formData.role })
      });

      const data = await res.json();
      
      if (res.ok) {
        setMessage("Rol actualizado exitosamente");
        // Actualizar lista de usuarios
        setUsers(users.map(user => 
          user.id === Number(formData.userId) 
            ? { ...user, role: formData.role } 
            : user
        ));
      } else {
        setMessage(data.message || "Error al actualizar rol");
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

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white shadow-md rounded">
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
          {users.map(user => (
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
        >
          <option value="estudiante">Estudiante</option>
          <option value="funcionario">Funcionario</option>
          <option value="administrador de documentos">Administrador</option>
        </select>

        <button 
          type="submit" 
          disabled={isLoading}
          className="bg-blue-500 text-white w-full p-2 disabled:bg-gray-400"
        >
          {isLoading ? "Actualizando..." : "Asignar Rol"}
        </button>
      </form>

      {message && <p className="mt-4 text-center">{message}</p>}
    </div>
  );
}