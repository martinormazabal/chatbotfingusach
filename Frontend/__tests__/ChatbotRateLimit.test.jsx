// __tests__/ChatbotRateLimit.test.jsx
import React, { useState } from "react";
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatbotPage from '../pages/chatbot';
import axios from 'axios';

jest.mock('axios');

describe('Chatbot Rate Limit Handling', () => {
  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    // Cada llamada a axios.post incrementa callCount.
    axios.post.mockImplementation((url, { query }) => {
      callCount++;
      if (callCount >= 16) {
        // Simula un error HTTP 429
        const error = new Error('RESOURCE_EXHAUSTED');
        error.response = { status: 429 };
        return Promise.reject(error);
      }
      // Simula respuesta normal
      return Promise.resolve({ data: { response: 'Respuesta simulada' } });
    });
  });

  it('muestra mensaje de límite tras la petición 16', async () => {
    render(<ChatbotPage />);

    const input  = screen.getByPlaceholderText(/Ej: ¿Cuál es el proceso/i);
    const button = screen.getByRole('button', { name: /Consultar/i });

    // Lanza 16 peticiones
    for (let i = 0; i < 16; i++) {
      // Necesitamos envolver el click+espera en act para evitar warning
      await act(async () => {
        fireEvent.change(input, { target: { value: `Test query ${i}` } });
        fireEvent.click(button);
      });
    }

    // Ahora esperamos a que aparezca el mensaje de error
    await waitFor(() => {
      expect(
        screen.getByText(/Espera un momento antes de otra consulta\./i)
      ).toBeInTheDocument();
    });
  });
});
