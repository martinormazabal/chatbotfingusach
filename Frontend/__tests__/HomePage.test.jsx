// __tests__/HomePage.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../pages/index';             // Ajusta la ruta si tu componente está en otro lugar

// Create a simple mock for useRouter
jest.mock('next/router', () => ({
  useRouter() {
    return {
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
    };
  },
}));

describe('Home Page (sin autenticación)', () => {
  beforeEach(() => {
    // Asegurar que no haya nada en localStorage
    window.localStorage.clear();
  });

  test('Muestra solo el botón "Iniciar Sesión" y oculta los demás', () => {
    render(<Home />);

    // El botón "Iniciar Sesión" debe existir
    expect(screen.getByRole('button', { name: /iniciar sesión/i }))
      .toBeInTheDocument();

    // Todos los demás botones NO deben existir
    const otros = [
      /crear usuario/i,
      /asignar perfiles?/i,
      /subir documentos/i,
      /ver documentos subidos/i,
      /consultar reglamentos/i,
      /Usuarios/i, // Assuming 'Usuarios' is an admin button
      /Solicitudes/i // Assuming 'Solicitudes' is another authenticated button
    ];
    otros.forEach((label) => {
      expect(screen.queryByRole('button', { name: label }))
        .not.toBeInTheDocument();
    });
  });
});
