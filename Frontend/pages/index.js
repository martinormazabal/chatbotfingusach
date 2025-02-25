import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Panel Principal</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <Link href="/admin/create-user"><button>Crear Usuario</button></Link>
        <Link href="/admin/assign-role"><button>Asignar Perfiles</button></Link>
        <Link href="/upload"><button>Subir Documentos</button></Link>
        <Link href="/documents"><button>Ver Documentos Subidos</button></Link>
        <Link href="/chatbot"><button>Consultar Reglamentos</button></Link>
        <Link href="/login"><button>Iniciar Sesión</button></Link>
      </div>
    </div>
  );
}
