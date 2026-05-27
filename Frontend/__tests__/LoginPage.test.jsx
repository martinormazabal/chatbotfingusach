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
    // El componente espera que la respuesta de axios tenga { data: { user: {...}, accessToken: '' } }
    const mockUserData = {
      id: 1,
      email: 'test@example.com',
      role: 'estudiante',
    };
    
    const mockAxiosPost = jest.fn(() =>
      Promise.resolve({
        data: {
          user: mockUserData,
          accessToken: 'fake-jwt-token',
        },
      })
    );
    axios.post = mockAxiosPost;

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/Correo institucional/i);
    const passwordInput = screen.getByLabelText(/Contraseña/i);
    const loginButton = screen.getByRole('button', { name: /Ingresar/i });

    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockAxiosPost).toHaveBeenCalledWith('/api/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    const storedUser = JSON.parse(localStorage.getItem('user'));

    // El objeto guardado ahora debe incluir el accessToken
    expect(storedUser).toEqual({
      ...mockUserData,
      accessToken: 'fake-jwt-token',
    });
    
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
