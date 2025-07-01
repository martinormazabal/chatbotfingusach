// __tests__/LoginPage.test.jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../pages/login';
import axios from 'axios';

// Mock next/router
const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('LoginPage Component', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('successfully logs in and stores user data in localStorage', async () => {
    // Preparo el mock de axios.post
    const mockAxiosPost = jest.fn(() =>
      Promise.resolve({
        data: {
          id: 1,
          email: 'test@example.com',
          role: 'estudiante',
        },
      })
    );
    axios.post = mockAxiosPost;

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText(/Correo/i);
    const passwordInput = screen.getByPlaceholderText(/Contraseña/i);
    const loginButton = screen.getByRole('button', { name: /Ingresar/i });

    // 1) Tipo en los inputs (await para que React procese el estado)
    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, 'password123');

    // 2) Click submit con userEvent
    await userEvent.click(loginButton);

    // 3) Espero a que axios.post sea invocado
    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockAxiosPost).toHaveBeenCalledWith('/api/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    // 4) Verifico localStorage y redirección
    const storedUser = JSON.parse(localStorage.getItem('user'));
    expect(storedUser).toEqual({
      id: 1,
      email: 'test@example.com',
      role: 'estudiante',
    });
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});

