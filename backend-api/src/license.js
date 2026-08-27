import { createHash, randomUUID } from 'node:crypto';
import { hostname, platform, arch } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
const stateFile = resolve(import.meta.dirname, '../data/license-state.json');
const deviceId = createHash('sha256').update(`${hostname()}|${platform()}|${arch()}`).digest('hex').slice(0, 24).toUpperCase();

function initialState() {
  const trialStartedAt = new Date().toISOString();
  return {
    installationId: randomUUID(),
    deviceId,
    trialStartedAt,
    trialEndsAt: new Date(Date.parse(trialStartedAt) + (7 * DAY)).toISOString(),
    licenseStatus: 'TRIAL',
    licenseEndsAt: null,
    suspended: false,
    lastSeenAt: trialStartedAt
  };
}

function loadState() {
  try {
    if (existsSync(stateFile)) {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (state.deviceId === deviceId && state.trialStartedAt && state.trialEndsAt) return state;
    }
  } catch { /* A damaged file is replaced and recorded as a fresh local installation. */ }
  const state = initialState();
  persist(state);
  return state;
}

function persist(state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

const state = loadState();

export function calculateLicenseStatus(value, now = new Date()) {
  const current = now.getTime();
  if (value.suspended) return 'SUSPENDED';
  if (value.licenseStatus === 'ACTIVE' && value.licenseEndsAt && current <= Date.parse(value.licenseEndsAt)) return 'ACTIVE';
  if (current <= Date.parse(value.trialEndsAt)) return 'TRIAL';
  return 'EXPIRED';
}

export function licenseStatus(now = new Date()) {
  const current = now.getTime();
  // Moving the computer clock backwards cannot extend the locally recorded time.
  const effectiveNow = Math.max(current, Date.parse(state.lastSeenAt || state.trialStartedAt));
  if (effectiveNow > Date.parse(state.lastSeenAt || state.trialStartedAt)) {
    state.lastSeenAt = new Date(effectiveNow).toISOString();
    persist(state);
  }
  const status = calculateLicenseStatus(state, new Date(effectiveNow));
  const endAt = status === 'ACTIVE' ? state.licenseEndsAt : state.trialEndsAt;
  return {
    status,
    deviceId: state.deviceId,
    trialStartedAt: state.trialStartedAt,
    trialEndsAt: state.trialEndsAt,
    licenseEndsAt: state.licenseEndsAt,
    daysRemaining: status === 'SUSPENDED' || status === 'EXPIRED' ? 0 : Math.max(0, Math.ceil((Date.parse(endAt) - effectiveNow) / DAY)),
    canOperate: status === 'TRIAL' || status === 'ACTIVE'
  };
}

export function requireOperationalLicense() {
  const license = licenseStatus();
  if (license.canOperate) return license;
  const error = new Error(license.status === 'SUSPENDED' ? 'License is suspended. Contact the software administrator.' : 'Trial has expired. Contact the software administrator to activate the license.');
  error.status = 402;
  throw error;
}
