// __tests__/HomePageAdminDocs.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../pages/index';

// Mock del router más completo para evitar problemas de contexto
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '',
    query: {},
    asPath: '',
    push: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
    isFallback: false,
    isLocaleDomain: false,
    isReady: true,
    isPreview: false,
  }),
}));

describe('HomePage for administrador de documentos role', () => {
  beforeEach(() => {
    // Simula un usuario autenticado con el rol 'administrador de documentos'
    const mockUser = {
      id: 2,
      email: 'admin_docs@example.com',
      role: 'administrador de documentos',
      username: 'Admin Documentos'
    };
    // localStorage espera un objeto 'user' que contiene los datos del usuario
    localStorage.setItem('user', JSON.stringify({ user: mockUser }));
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('Muestra los botones correctos para el rol y oculta los de gestión de usuarios', () => {
    render(<Home />);

    // 1. Verificar que los botones de gestión de documentos y chat estén visibles
    expect(screen.getByRole('link', { name: /Subir Documentos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver Documentos Subidos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Consultar Reglamentos/i })).toBeInTheDocument();
    
    // 2. Verificar que el botón de cerrar sesión esté presente
    expect(screen.getByRole('button', { name: /Cerrar Sesión/i })).toBeInTheDocument();

    // 3. Verificar que los botones de gestión de usuarios NO estén visibles
    // Usamos queryByRole para que no falle si no los encuentra (que es lo esperado)
    expect(screen.queryByRole('link', { name: /Crear Usuario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Asignar Perfiles/i })).not.toBeInTheDocument();
  });
});
