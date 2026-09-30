import { Router } from 'itty-router';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Router setup
const router = Router();

// Types
interface Env {
  DB: D1Database;
  COLLABORATION: DurableObjectNamespace;
  JWT_SECRET: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface DrawEvent {
  type: 'draw' | 'erase' | 'clear' | 'undo';
  data: any;
  userId: string;
  timestamp: number;
}

// ============= Auth Middleware =============

async function verifyToken(request: Request, env: Env): Promise<User | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    return decoded;
  } catch (e) {
    return null;
  }
}

// ============= Routes =============

// Register
router.post('/api/auth/register', async (request: Request, env: Env) => {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: 'Всі поля обов\'язкові' }),
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Користувач з цією поштою вже існує' }),
        { status: 409 }
      );
    }

    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES (?, ?, ?, ?)`
    ).bind(userId, email, hashedPassword, name).run();

    const token = jwt.sign({ id: userId, email, name }, env.JWT_SECRET, {
      expiresIn: '7d'
    });

    return new Response(
      JSON.stringify({
        message: 'Успішна реєстрація',
        token,
        user: { id: userId, email, name }
      }),
      { status: 201 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Login
router.post('/api/auth/login', async (request: Request, env: Env) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Пошта та пароль обов\'язкові' }),
        { status: 400 }
      );
    }

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first() as any;

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Невірні креденціали' }),
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({ error: 'Невірні креденціали' }),
        { status: 401 }
      );
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return new Response(
      JSON.stringify({
        message: 'Успішний вхід',
        token,
        user: { id: user.id, email: user.email, name: user.name }
      }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Get user projects
router.get('/api/projects', async (request: Request, env: Env) => {
  try {
    const user = await verifyToken(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Не авторизовано' }),
        { status: 401 }
      );
    }

    const projects = await env.DB.prepare(
      `SELECT p.* FROM projects p
       WHERE p.owner_id = ? OR p.id IN (
         SELECT project_id FROM permissions WHERE user_id = ?
       )
       ORDER BY p.updated_at DESC`
    ).bind(user.id, user.id).all() as any;

    return new Response(
      JSON.stringify({ projects: projects.results || [] }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Create project
router.post('/api/projects', async (request: Request, env: Env) => {
  try {
    const user = await verifyToken(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Не авторизовано' }),
        { status: 401 }
      );
    }

    const { name, description } = await request.json();
    const projectId = uuidv4();

    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, description, canvas_data)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(projectId, user.id, name, description, '{}').run();

    return new Response(
      JSON.stringify({
        message: 'Проект створений',
        project: { id: projectId, owner_id: user.id, name, description }
      }),
      { status: 201 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Get project
router.get('/api/projects/:id', async (request: Request, env: Env) => {
  try {
    const user = await verifyToken(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Не авторизовано' }),
        { status: 401 }
      );
    }

    const projectId = request.params.id as string;

    // Check permissions
    const project = await env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(projectId).first() as any;

    if (!project) {
      return new Response(
        JSON.stringify({ error: 'Проект не знайдено' }),
        { status: 404 }
      );
    }

    const hasAccess = project.owner_id === user.id ||
      (await env.DB.prepare(
        'SELECT id FROM permissions WHERE project_id = ? AND user_id = ?'
      ).bind(projectId, user.id).first());

    if (!hasAccess && !project.is_public) {
      return new Response(
        JSON.stringify({ error: 'Доступ заборонено' }),
        { status: 403 }
      );
    }

    return new Response(
      JSON.stringify({ project }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Update project
router.put('/api/projects/:id', async (request: Request, env: Env) => {
  try {
    const user = await verifyToken(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Не авторизовано' }),
        { status: 401 }
      );
    }

    const projectId = request.params.id as string;
    const { name, description, canvas_data } = await request.json();

    const project = await env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(projectId).first() as any;

    if (!project) {
      return new Response(
        JSON.stringify({ error: 'Проект не знайдено' }),
        { status: 404 }
      );
    }

    if (project.owner_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Тільки власник може редагувати' }),
        { status: 403 }
      );
    }

    await env.DB.prepare(
      `UPDATE projects SET name = ?, description = ?, canvas_data = ?,
       updated_at = CURRENT_TIMESTAMP, last_modified_by = ?
       WHERE id = ?`
    ).bind(name || project.name, description || project.description,
           canvas_data || project.canvas_data, user.id, projectId).run();

    return new Response(
      JSON.stringify({ message: 'Проект оновлено' }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Delete project
router.delete('/api/projects/:id', async (request: Request, env: Env) => {
  try {
    const user = await verifyToken(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Не авторизовано' }),
        { status: 401 }
      );
    }

    const projectId = request.params.id as string;

    const project = await env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(projectId).first() as any;

    if (!project) {
      return new Response(
        JSON.stringify({ error: 'Проект не знайдено' }),
        { status: 404 }
      );
    }

    if (project.owner_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Тільки власник може видалити' }),
        { status: 403 }
      );
    }

    await env.DB.prepare('DELETE FROM permissions WHERE project_id = ?')
      .bind(projectId).run();
    await env.DB.prepare('DELETE FROM activity_log WHERE project_id = ?')
      .bind(projectId).run();
    await env.DB.prepare('DELETE FROM projects WHERE id = ?')
      .bind(projectId).run();

    return new Response(
      JSON.stringify({ message: 'Проект видалено' }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

// Default 404
router.all('*', () => new Response('Not Found', { status: 404 }));

// Export handler
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    router.handle(request, env, ctx),
};

// Durable Object for real-time collaboration
export class CollaborationDurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<string, WebSocket> = new Map();
  private drawEvents: DrawEvent[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const { 0: client, 1: server } = new WebSocketPair();

      server.accept();

      const sessionId = uuidv4();
      this.sessions.set(sessionId, server);

      server.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'draw') {
          this.drawEvents.push({
            type: 'draw',
            data: data.payload,
            userId: data.userId,
            timestamp: Date.now(),
          });

          // Broadcast to all sessions
          this.broadcast({
            type: 'draw',
            payload: data.payload,
            userId: data.userId,
          });
        }
      });

      server.addEventListener('close', () => {
        this.sessions.delete(sessionId);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not a WebSocket request', { status: 400 });
  }

  private broadcast(message: any) {
    const msg = JSON.stringify(message);
    for (const ws of this.sessions.values()) {
      ws.send(msg);
    }
  }
}
