import crypto from 'node:crypto';
import { parse, serialize } from 'cookie';
import { db } from './db.js';
import { config } from './config.js';

const SESSION_DAYS = 7;
const SESSION_COOKIE = 'iris_session';
const LEGACY_SESSION_COOKIE = 'mindmesh_session';
const tokenHash = (token) => crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
const tokenFromRequest = (req) => {
  const cookies = parse(req.headers.cookie || '');
  return cookies[SESSION_COOKIE] || cookies[LEGACY_SESSION_COOKIE];
};

export function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .run(tokenHash(token), userId, expires.toISOString());
  res.setHeader('Set-Cookie', serialize(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: config.production, path: '/', expires,
  }));
}

export function endSession(req, res) {
  const token = tokenFromRequest(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
  res.setHeader('Set-Cookie', [SESSION_COOKIE, LEGACY_SESSION_COOKIE].map((name) => serialize(name, '', {
    httpOnly: true, sameSite: 'strict', secure: config.production, path: '/', maxAge: 0,
  })));
}

export function userFromRequest(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  return db.prepare(`SELECT u.id,u.email,u.display_name AS displayName FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP`)
    .get(tokenHash(token)) || null;
}

export function requireUser(req, res, next) {
  req.user = userFromRequest(req);
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}
