import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
const legacyDatabase = path.join(config.dataDir, 'mindmesh.sqlite');
const databasePath = fs.existsSync(legacyDatabase) ? legacyDatabase : path.join(config.dataDir, 'iris.sqlite');
export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mindmaps (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, document TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mindmap_members (
  mindmap_id TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
  PRIMARY KEY (mindmap_id, user_id)
);
CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mindmap_id TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, document TEXT NOT NULL, changed_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS revisions_map ON revisions(mindmap_id, version DESC);
`);

export function permissionFor(mapId, userId) {
  return db.prepare(`
    SELECT CASE WHEN m.owner_id = ? THEN 'owner' ELSE mm.role END AS role
    FROM mindmaps m LEFT JOIN mindmap_members mm ON mm.mindmap_id=m.id AND mm.user_id=?
    WHERE m.id=? AND (m.owner_id=? OR mm.user_id=?)
  `).get(userId, userId, mapId, userId, userId)?.role || null;
}
