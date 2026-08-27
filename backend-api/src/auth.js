import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const secretFile = resolve(import.meta.dirname, '../data/session-secret');
function installationSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-session-secret';
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  mkdirSync(dirname(secretFile), { recursive: true });
  const generated = randomBytes(48).toString('base64url');
  writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}
const secret = installationSecret();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 8) throw new TypeError('Password must be at least 8 characters');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function createToken(user, ttlSeconds = 28800) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: user.id, role: user.role, name: user.name, ver: Number(user.sessionVersion ?? 0), exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token) {
  const [header, payload, signature] = String(token).split('.');
  if (!header || !payload || !signature) throw new Error('Authentication required');
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid session');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Session expired');
  return { id: claims.sub, role: claims.role, name: claims.name, sessionVersion: Number(claims.ver ?? 0) };
}
