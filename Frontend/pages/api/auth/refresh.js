import { buildBackendApiUrl, resolveBackendBaseUrl } from '@/lib/backend-url';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseResponseSafe(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { error: text || 'Respuesta no válida del backend' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const backendUrl = resolveBackendBaseUrl(req);

  try {
    const upstream = await fetch(buildBackendApiUrl(backendUrl, '/api/auth/refresh'), {
      method: 'POST',
      headers: {
        Authorization: req.headers.authorization || '',
        cookie: req.headers.cookie || '',
      },
    });

    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
    }

    const payload = await parseResponseSafe(upstream);
    return res.status(upstream.status).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Error de comunicación con el servidor de autenticación',
      details: error.message,
    });
  }
}