// __tests__/HomePageAdminDocs.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../pages/index';

// Mock the useRouter hook
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('HomePage for administrador de documentos role', () => {
  beforeEach(() => {
    // Mock localStorage to simulate an authenticated user with the 'administrador de documentos' role
    const mockUser = {
      id: 2,
      email: 'admin_docs@example.com',
      role: 'administrador de documentos',
    };
    localStorage.setItem('user', JSON.stringify(mockUser));
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('displays the correct buttons for administrador de documentos', () => {
    render(<Home />);

    // Check for the buttons that should be visible
    expect(screen.getByRole('link', { name: /Subir Documentos/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /Ver Documentos Subidos/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /Consultar Reglamentos/i })).toBeVisible();

    // Check that administrador de documentos can manage users too
    expect(screen.getByRole('link', { name: /Crear Usuario/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /Asignar Perfiles/i })).toBeVisible();
  });
});