import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
const secretFile = resolve(import.meta.dirname, '../data/account-license-secret');

function signingSecret() {
  if (process.env.ACCOUNT_LICENSE_SECRET) return process.env.ACCOUNT_LICENSE_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-account-license-secret';
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  mkdirSync(dirname(secretFile), { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(secretFile, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

const secret = signingSecret();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function addMonths(date, months) {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() + Number(months));
  return value;
}

export function issueAccountLicense({ accountId, periodMonths, sequence, startsAt }) {
  if (![6, 12].includes(Number(periodMonths))) throw new TypeError('Validity must be 6 or 12 months');
  const start = new Date(startsAt);
  const ends = addMonths(start, periodMonths);
  const graceEnds = new Date(ends.getTime() + 15 * DAY);
  const payload = { accountId, periodMonths: Number(periodMonths), sequence: Number(sequence), startsAt: start.toISOString(), endsAt: ends.toISOString(), graceEndsAt: graceEnds.toISOString() };
  const encoded = encode(payload);
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { key: `NGS1.${encoded}.${signature}`, ...payload };
}

export function verifyAccountLicense(key, accountId) {
  try {
    const [prefix, encoded, signature] = String(key).split('.');
    if (prefix !== 'NGS1' || !encoded || !signature) return null;
    const expected = createHmac('sha256', secret).update(encoded).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return payload.accountId === accountId && [6, 12].includes(Number(payload.periodMonths)) ? payload : null;
  } catch { return null; }
}

export function accountLicenseStatus(account, now = new Date()) {
  const payload = verifyAccountLicense(account?.accountLicenseKey, account?.id);
  if (!payload || Number(payload.sequence) !== Number(account?.accountLicenseSequence)) return { status: 'INVALID', canOperate: false, daysRemaining: 0, graceDaysRemaining: 0 };
  const current = now.getTime();
  const end = Date.parse(payload.endsAt);
  const graceEnd = Date.parse(payload.graceEndsAt);
  const status = current <= end ? 'ACTIVE' : current <= graceEnd ? 'GRACE' : 'EXPIRED';
  return { ...payload, status, canOperate: status === 'ACTIVE' || status === 'GRACE', daysRemaining: status === 'ACTIVE' ? Math.max(0, Math.ceil((end - current) / DAY)) : 0, graceDaysRemaining: status === 'GRACE' ? Math.max(0, Math.ceil((graceEnd - current) / DAY)) : 0, renewalAvailable: current >= end - 15 * DAY };
}
