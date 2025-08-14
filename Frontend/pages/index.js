// frontend/pages/index.js
import React from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
    router.push('/');
  };

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Panel Principal</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        {user?.role === 'funcionario' || user?.role === 'admin' ? (
          <>
            <Link href="/admin/create-user"><button>Crear Usuario</button></Link>
            <Link href="/admin/assign-role"><button>Asignar Perfiles</button></Link>
          </>
        ) : null}

        {user?.role === 'administrador de documentos' || user?.role === 'admin' ? (
          <>
            <Link href="/upload"><button>Subir Documentos</button></Link>
            <Link href="/documents"><button>Ver Documentos Subidos</button></Link>
          </>
        ) : null}

        {user && (
          <Link href="/chatbot"><button>Consultar Reglamentos</button></Link>
        )}

        {!user ? (
          <Link href="/login"><button>Iniciar Sesión</button></Link>
        ) : (
          <button onClick={logout}>Cerrar Sesión</button>
        )}
      </div>
    </div>
  );
}