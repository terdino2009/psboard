-- Користувачи
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Проекти
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  canvas_data TEXT,
  is_public BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_modified_by TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (last_modified_by) REFERENCES users(id)
);

-- Дозволи (для спільного редагування)
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- viewer, editor, admin
  shared_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (shared_by) REFERENCES users(id)
);

-- Лог активності
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- draw, erase, save, share, delete
  data TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Активні сесії
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Індекси для оптимізації
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_permissions_project ON permissions(project_id);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON collaboration_sessions(project_id);
