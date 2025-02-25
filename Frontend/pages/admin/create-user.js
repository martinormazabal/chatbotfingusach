import { useState } from "react";
import { useRouter } from "next/router";

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

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Error al registrar usuario");
        router.push("/");
        return;
      } else {
        setMessage("Usuario creado exitosamente");
      }
    } catch (error) {
      console.error("Error en handleSubmit:", error);
      setMessage(
        error.message.includes("Failed to fetch")
          ? "Error de conexión con el servidor"
          : error.message.includes("duplicate")
          ? "El correo ya está registrado"
          : "Error en el servidor"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white shadow-md rounded">
      <h2 className="text-xl font-bold mb-4">Crear Nuevo Usuario</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          placeholder="Nombre de usuario"
          onChange={handleChange}
          required
          className="w-full p-2 border mb-2"
        />
        <input
          type="email"
          name="email"
          placeholder="Correo electrónico"
          onChange={handleChange}
          required
          className="w-full p-2 border mb-2"
        />
        <input
          type="password"
          name="password"
          placeholder="Contraseña"
          onChange={handleChange}
          required
          className="w-full p-2 border mb-2"
        />
        <select
          name="role"
          onChange={handleChange}
          defaultValue="estudiante"
          className="w-full p-2 border mb-2"
        >
          <option value="estudiante">Estudiante</option>
          <option value="funcionario">Funcionario</option>
          <option value="administrador de documentos">
            Administrador de documentos
          </option>
        </select>
        <button type="submit" disabled={isLoading} className="bg-blue-500 text-white w-full p-2">
          {isLoading ? "Creando..." : "Registrar"}
        </button>
      </form>
      {message && <p className="mt-4 text-center">{message}</p>}
    </div>
  );
}
