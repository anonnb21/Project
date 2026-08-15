import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { db, permissionFor } from './db.js';
import { endSession, requireUser, startSession, userFromRequest } from './auth.js';
import { createDocument, newId, validateTree } from './tree.js';
import { fromOpml, toOpml } from './opml.js';

const packageMetadata = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const moduleVersion = String(packageMetadata.version || '0.0.0');

const app = express();
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'");
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      const expected = `${req.protocol}://${req.get('host')}`;
      if (origin !== expected) return res.status(403).json({ error: 'Origin rejected' });
    }
  }
  next();
});

const cleanEmail = (value) => String(value || '').trim().toLowerCase();
const publicUser = (user) => ({ id: user.id, email: user.email, displayName: user.displayName });

app.get('/healthz', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

app.get('/api/meta', (_req, res) => res.json({ mindmapModuleVersion: moduleVersion }));
app.get('/api/auth/config', (_req, res) => res.json({ allowRegistration: config.allowRegistration }));
app.post('/api/auth/register', async (req, res) => {
  if (!config.allowRegistration) return res.status(403).json({ error: 'Registration is disabled' });
  const email = cleanEmail(req.body.email);
  const displayName = String(req.body.displayName || '').trim();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || displayName.length < 2 || displayName.length > 80 || password.length < 10) {
    return res.status(400).json({ error: 'Use a valid email, a name, and a password of at least 10 characters' });
  }
  try {
    const id = newId();
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users(id,email,display_name,password_hash) VALUES(?,?,?,?)').run(id, email, displayName, hash);
    startSession(res, id);
    return res.status(201).json({ user: { id, email, displayName } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account already uses that email' });
    throw error;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = cleanEmail(req.body.email);
  const row = db.prepare('SELECT id,email,display_name AS displayName,password_hash FROM users WHERE email=?').get(email);
  if (!row || !(await bcrypt.compare(String(req.body.password || ''), row.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  startSession(res, row.id);
  res.json({ user: publicUser(row) });
});
app.post('/api/auth/logout', (req, res) => { endSession(req, res); res.status(204).end(); });
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));

app.get('/api/mindmaps', requireUser, (req, res) => {
  const rows = db.prepare(`SELECT m.id,m.title,m.version,m.updated_at AS updatedAt,
    CASE WHEN m.owner_id=? THEN 'owner' ELSE mm.role END AS role,
    u.display_name AS ownerName
    FROM mindmaps m JOIN users u ON u.id=m.owner_id
    LEFT JOIN mindmap_members mm ON mm.mindmap_id=m.id AND mm.user_id=?
    WHERE m.owner_id=? OR mm.user_id=? ORDER BY m.updated_at DESC`).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json({ mindmaps: rows });
});

app.post('/api/mindmaps', requireUser, (req, res) => {
  const title = String(req.body.title || 'Untitled mind map').trim().slice(0, 120) || 'Untitled mind map';
  const id = newId();
  const document = createDocument(title);
  db.prepare('INSERT INTO mindmaps(id,title,document,owner_id) VALUES(?,?,?,?)')
    .run(id, title, JSON.stringify(document), req.user.id);
  res.status(201).json({ mindmap: { id, title, document, version: 1, role: 'owner' } });
});

function getMap(req, res, next) {
  req.role = permissionFor(req.params.id, req.user.id);
  if (!req.role) return res.status(404).json({ error: 'Mind map not found' });
  req.map = db.prepare('SELECT id,title,document,version,owner_id AS ownerId,updated_at AS updatedAt FROM mindmaps WHERE id=?').get(req.params.id);
  req.map.document = JSON.parse(req.map.document);
  next();
}

app.get('/api/mindmaps/:id', requireUser, getMap, (req, res) => res.json({ mindmap: { ...req.map, role: req.role } }));

const updateMap = db.transaction((id, title, document, expectedVersion, userId) => {
  const result = db.prepare(`UPDATE mindmaps SET title=?,document=?,version=version+1,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND version=?`).run(title, JSON.stringify(document), id, expectedVersion);
  if (!result.changes) return null;
  const version = expectedVersion + 1;
  db.prepare('INSERT INTO revisions(mindmap_id,version,document,changed_by) VALUES(?,?,?,?)')
    .run(id, version, JSON.stringify(document), userId);
  return version;
});

app.patch('/api/mindmaps/:id', requireUser, getMap, (req, res) => {
  if (!['owner', 'editor'].includes(req.role)) return res.status(403).json({ error: 'Edit permission required' });
  const document = req.body.document;
  const title = String(req.body.title || '').trim().slice(0, 120);
  const version = Number(req.body.version);
  if (!title || !Number.isInteger(version) || !validateTree(document)) return res.status(400).json({ error: 'Invalid mind map data' });
  const nextVersion = updateMap(req.params.id, title, document, version, req.user.id);
  if (!nextVersion) {
    const current = db.prepare('SELECT title,document,version FROM mindmaps WHERE id=?').get(req.params.id);
    return res.status(409).json({ error: 'This map changed in another session', mindmap: { ...current, document: JSON.parse(current.document) } });
  }
  broadcast(req.params.id, { type: 'updated', mindmap: { title, document, version: nextVersion }, actor: req.user });
  res.json({ version: nextVersion });
});

app.delete('/api/mindmaps/:id', requireUser, getMap, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: 'Only the owner can delete a mind map' });
  db.prepare('DELETE FROM mindmaps WHERE id=?').run(req.params.id);
  broadcast(req.params.id, { type: 'deleted' });
  res.status(204).end();
});

app.get('/api/mindmaps/:id/members', requireUser, getMap, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: 'Only the owner can view the access list' });
  const members = db.prepare(`SELECT u.id,u.email,u.display_name AS displayName,
    CASE WHEN u.id=m.owner_id THEN 'owner' ELSE mm.role END AS role
    FROM mindmaps m JOIN users u ON u.id=m.owner_id LEFT JOIN mindmap_members ignored ON 1=0
    LEFT JOIN mindmap_members mm ON mm.mindmap_id=m.id AND mm.user_id=u.id WHERE m.id=?
    UNION ALL SELECT u.id,u.email,u.display_name,mm.role FROM mindmap_members mm
    JOIN users u ON u.id=mm.user_id WHERE mm.mindmap_id=?`).all(req.params.id, req.params.id);
  res.json({ members });
});

app.put('/api/mindmaps/:id/members', requireUser, getMap, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: 'Only the owner can manage access' });
  const email = cleanEmail(req.body.email);
  const role = req.body.role;
  if (!['viewer', 'editor'].includes(role)) return res.status(400).json({ error: 'Role must be viewer or editor' });
  const user = db.prepare('SELECT id,email,display_name AS displayName FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'That user must create an account first' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'The owner already has full access' });
  db.prepare(`INSERT INTO mindmap_members(mindmap_id,user_id,role) VALUES(?,?,?)
    ON CONFLICT(mindmap_id,user_id) DO UPDATE SET role=excluded.role`).run(req.params.id, user.id, role);
  res.json({ member: { ...user, role } });
});

app.delete('/api/mindmaps/:id/members/:userId', requireUser, getMap, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: 'Only the owner can manage access' });
  db.prepare('DELETE FROM mindmap_members WHERE mindmap_id=? AND user_id=?').run(req.params.id, req.params.userId);
  for (const ws of rooms.get(req.params.id) || []) {
    if (ws.user.id === req.params.userId) ws.close(1008, 'Access revoked');
  }
  res.status(204).end();
});

app.get('/api/mindmaps/:id/export.opml', requireUser, getMap, (req, res) => {
  const safeName = req.map.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'mindmap';
  res.attachment(`${safeName}.opml`).type('application/xml').send(toOpml(req.map.title, req.map.document));
});

app.post('/api/mindmaps/import', requireUser, express.text({ type: ['application/xml', 'text/xml'], limit: '2mb' }), (req, res) => {
  try {
    const document = fromOpml(req.body);
    const title = document.title.slice(0, 120);
    const id = newId();
    db.prepare('INSERT INTO mindmaps(id,title,document,owner_id) VALUES(?,?,?,?)').run(id, title, JSON.stringify(document), req.user.id);
    res.status(201).json({ mindmap: { id, title, version: 1, role: 'owner' } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use('/vendor/phosphor', express.static(path.join(appDir, 'node_modules', '@phosphor-icons', 'web', 'src', 'regular')));
app.use('/vendor/montserrat', express.static(path.join(appDir, 'node_modules', '@fontsource', 'montserrat')));
app.use('/vendor/flextree', express.static(path.join(appDir, 'node_modules', 'd3-flextree', 'build')));
app.use(express.static(publicDir, { extensions: ['html'], maxAge: config.production ? '1h' : 0 }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Unexpected server error' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const rooms = new Map();
function broadcast(mapId, message) {
  for (const ws of rooms.get(mapId) || []) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
function presence(mapId) {
  const connections = rooms.get(mapId) || new Set();
  broadcast(mapId, { type: 'presence', count: connections.size });
}
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const mapId = url.searchParams.get('map');
  const user = userFromRequest(req);
  if (url.pathname !== '/live' || !user || !mapId || !permissionFor(mapId, user.id)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.mapId = mapId;
    ws.user = user;
    wss.emit('connection', ws);
  });
});
wss.on('connection', (ws) => {
  if (!rooms.has(ws.mapId)) rooms.set(ws.mapId, new Set());
  rooms.get(ws.mapId).add(ws);
  presence(ws.mapId);
  ws.on('close', () => {
    rooms.get(ws.mapId)?.delete(ws);
    if (!rooms.get(ws.mapId)?.size) rooms.delete(ws.mapId); else presence(ws.mapId);
  });
});

setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run(), 3600_000).unref();
server.listen(config.port, () => console.log(`IRIS listening on http://localhost:${config.port}`));
