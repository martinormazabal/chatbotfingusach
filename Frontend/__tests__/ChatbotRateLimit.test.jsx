// __tests__/ChatbotRateLimit.test.jsx
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatbotPage from '../pages/chatbot';
import axios from 'axios';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';

// Mock de axios
jest.mock('axios');

// JSDOM no implementa scrollIntoView. Hay que mockearlo.
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// Función para crear un mock del router
function createMockRouter(router) {
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
    ...router,
  };
}

describe('Chatbot Rate Limit Handling', () => {
  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    axios.post.mockImplementation((url) => {
      callCount++;
      if (callCount >= 16) {
        const error = new Error('Too many requests');
        error.response = { status: 429 };
        return Promise.reject(error);
      }
      // La API real de chatbot no usa axios, usa fetch. 
      // Y la respuesta es { answer: '...' }
      return Promise.resolve({ data: { answer: 'Respuesta simulada' } });
    });
  });

  it('muestra mensaje de límite tras la petición 16', async () => {
    const mockRouter = createMockRouter({});
    
    render(
      <RouterContext.Provider value={mockRouter}>
        <ChatbotPage />
      </RouterContext.Provider>
    );

    const input = screen.getByPlaceholderText(/Haz tu consulta normativa/i);
    const button = screen.getByRole('button', { name: /Enviar/i });

    // El componente real usa fetch, no axios. Necesitamos mockear fetch.
    global.fetch = jest.fn((url) => {
        callCount++;
        if (callCount >= 16) {
            return Promise.resolve({ 
                ok: false, 
                status: 429,
                json: () => Promise.resolve({ error: "Límite de solicitudes alcanzado" })
            });
        }
        return Promise.resolve({ 
            ok: true, 
            json: () => Promise.resolve({ answer: "Respuesta simulada" })
        });
    });

    for (let i = 0; i < 16; i++) {
      await act(async () => {
        fireEvent.change(input, { target: { value: `Test query ${i}` } });
        fireEvent.click(button);
      });
    }

    await waitFor(() => {
        // El mensaje de error viene de la lógica catch del componente
        expect(screen.getByText(/Hubo un problema: Límite de solicitudes alcanzado/i)).toBeInTheDocument();
    });
  });
});
