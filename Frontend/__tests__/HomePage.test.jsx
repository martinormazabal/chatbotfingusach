// __tests__/HomePage.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../pages/index';

// Mock de useRouter más completo
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
    window.localStorage.clear();
  });

  test('Muestra solo el enlace "Iniciar Sesión" y oculta los demás', () => {
    render(<Home />);

    // El enlace "Iniciar Sesión" debe existir. Buscamos por el rol 'link' y el nombre.
    // El "nombre" accesible puede incluir texto de elementos anidados (como h3 y p).
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument();

    // Todos los demás enlaces de acciones no deben existir
    const otrosEnlaces = [
      /crear usuario/i,
      /asignar perfiles/i, // El signo de interrogación era un error tipográfico
      /subir documentos/i,
      /ver documentos subidos/i,
      /consultar reglamentos/i,
    ];

    otrosEnlaces.forEach((label) => {
      // Usamos queryByRole para evitar que el test falle si no encuentra el elemento
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    });

    // El botón de logout tampoco debe estar
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });
});
