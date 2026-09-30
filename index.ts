import { AutoRouter } from 'itty-router';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Ініціалізація сучасного AutoRouter (itty-router v5)
const router = AutoRouter();

// Головна сторінка API (перевірка працездатності сервера)
router.get('/', () => {
  return new Response(
    JSON.stringify({
      status: 'online',
      service: 'psboard-collab',
      message: 'Cloudflare Worker працює ідеально!',
      timestamp: new Date().toISOString(),
      availableEndpoints: [
        'GET /',
        'GET /api/health',
        'GET /api/token-demo',
        'GET /api/uuid'
      ]
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
});

// Ендпоінт статусу системи
router.get('/api/health', () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      uptime: 'live',
      jwt: 'ready',
      bcrypt: 'ready'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
});

// Генерація унікального UUID
router.get('/api/uuid', () => {
  return new Response(
    JSON.stringify({
      id: uuidv4()
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
});

// Демонстрація роботи jsonwebtoken та bcryptjs
router.get('/api/token-demo', async () => {
  const secret = 'psboard-sample-secret-key';
  const token = jwt.sign({ user: 'demo-user', role: 'admin' }, secret, { expiresIn: '1h' });
  const hash = await bcrypt.hash('sample-password', 8);

  return new Response(
    JSON.stringify({
      message: 'JWT та bcrypt успішно протестовані',
      sampleJwt: token,
      sampleHash: hash
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
});

// Головний експорт для Cloudflare Worker
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    try {
      const response = await router.fetch(request, env, ctx);
      if (response) {
        return response;
      }

      // Якщо шлях не знайдено (404)
      return new Response(
        JSON.stringify({
          error: 'Route not found',
          path: new URL(request.url).pathname
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          details: err?.message || String(err)
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  }
};
