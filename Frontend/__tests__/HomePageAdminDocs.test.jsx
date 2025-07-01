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
    expect(screen.getByRole('button', { name: /Subir Documentos/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Ver Documentos Subidos/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Consultar Reglamentos/i })).toBeVisible();

    // Check that the admin-only buttons are NOT present
    expect(screen.queryByRole('button', { name: /Crear Usuario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Asignar Perfiles/i })).not.toBeInTheDocument();
  });
});