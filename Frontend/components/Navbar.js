import Link from 'next/link';

export default function Navbar() {
  return (
    <nav style={{ display: 'flex', justifyContent: 'space-around', padding: '10px', background: '#007BFF', color: 'white' }}>
      <Link href="/">Inicio</Link>
      <Link href="/admin/create-user">Crear Usuario</Link>
      <Link href="/admin/assign-role">Asignar Perfiles</Link>
      <Link href="/documents">Subir Documentos</Link>
      <Link href="/chatbot">ChatBot</Link>
      <Link href="/login">Login</Link>
    </nav>
  );
}
