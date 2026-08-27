import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, hashPassword, verifyPassword, verifyToken } from '../src/auth.js';

test('hashes and verifies passwords', () => {
  const hash = hashPassword('Secure@123');
  assert.equal(verifyPassword('Secure@123', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});
test('creates signed expiring sessions', () => {
  const token = createToken({ id: 'u1', role: 'SELLER', name: 'Seller' });
  assert.deepEqual(verifyToken(token), { id: 'u1', role: 'SELLER', name: 'Seller', sessionVersion: 0 });
  assert.throws(() => verifyToken(`${token}x`), /Invalid session/);
});
