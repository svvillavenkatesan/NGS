import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hashPassword } from './auth.js';

const now = () => new Date().toISOString();
const user = (id, parentId, role, name, phone, password, schemeRates) => ({ id, parentId, role, name, phone, passwordHash: hashPassword(password), isActive: true, createdAt: now(), ...(schemeRates ? { schemeRates } : {}) });
const initialSchemeIds = ['scheme-a', 'scheme-b', 'scheme-c', 'scheme-all-single', 'scheme-ab', 'scheme-ac', 'scheme-bc', 'scheme-all-doubles', 'scheme-3d-25-10k', 'scheme-3d-30-15k', 'scheme-3d-35-17k', 'scheme-3d-40-25k', 'scheme-3d-70-35k', 'scheme-4d-20-1l', 'scheme-4d-110-5l', 'scheme-4d-60-2l'];
const universalSchemeIds = initialSchemeIds.slice(0, 8);
const defaultSchemeRates = { 'scheme-3d-25-10k': 25, 'scheme-3d-30-15k': 30, 'scheme-3d-35-17k': 35, 'scheme-3d-40-25k': 40, 'scheme-3d-70-35k': 70, 'scheme-4d-20-1l': 25, 'scheme-4d-110-5l': 120, 'scheme-4d-60-2l': 60 };
const initialRateFor = (id) => defaultSchemeRates[id] ?? (['scheme-ab', 'scheme-ac', 'scheme-bc', 'scheme-all-doubles'].includes(id) ? 15 : 13);

export const store = {
  security: { resultPasswordHash: null, managementPasswordHash: null },
  settings: {
    subDistributorEnabled: false,
    maxSellers: 2000,
    baseRate: 10,
    minimumProfit: { mode: 'PERCENTAGE', value: 20 },
    boards: [
      { id: 'kerala', code: 'KL', name: 'Kerala', enabled: true, schemeIds: [...initialSchemeIds], schedules: [] },
      { id: 'dear', code: 'DR', name: 'Dear', enabled: true, schemeIds: [...initialSchemeIds], schedules: [] }
    ],
    schemeCatalog: [
      { id: 'scheme-a', name: '1A', pattern: 'A', defaultRate: 10, minimumRate: 10.60, mrp: 13, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 0, singleDigitPrize: 100, universal: true, enabled: true },
      { id: 'scheme-b', name: '1B', pattern: 'B', defaultRate: 10, minimumRate: 10.60, mrp: 13, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 0, singleDigitPrize: 100, universal: true, enabled: true },
      { id: 'scheme-c', name: '1C', pattern: 'C', defaultRate: 10, minimumRate: 10.60, mrp: 13, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 0, singleDigitPrize: 100, universal: true, enabled: true },
      { id: 'scheme-all-single', name: 'ALL SINGLE', pattern: 'ALL', defaultRate: 10, minimumRate: 10.60, mrp: 13, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 0, singleDigitPrize: 100, universal: true, enabled: true },
      { id: 'scheme-ab', name: '2AB', pattern: 'AB', defaultRate: 15, minimumRate: 10.60, mrp: 15, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 1000, singleDigitPrize: 0, universal: true, enabled: true },
      { id: 'scheme-ac', name: '2AC', pattern: 'AC', defaultRate: 15, minimumRate: 10.60, mrp: 15, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 1000, singleDigitPrize: 0, universal: true, enabled: true },
      { id: 'scheme-bc', name: '2BC', pattern: 'BC', defaultRate: 15, minimumRate: 10.60, mrp: 15, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 1000, singleDigitPrize: 0, universal: true, enabled: true },
      { id: 'scheme-all-doubles', name: 'ALL DOUBLES', pattern: 'ALL', defaultRate: 15, minimumRate: 10.60, mrp: 15, fourDigitPrize: 0, threeDigitPrize: 0, twoDigitPrize: 1000, singleDigitPrize: 0, universal: true, enabled: true },
      { id: 'scheme-3d-25-10k', name: '3D-25-10K', pattern: 'ABC', defaultRate: 25, minimumRate: 20, fourDigitPrize: 0, threeDigitPrize: 10000, twoDigitPrize: 500, singleDigitPrize: 50, enabled: true },
      { id: 'scheme-3d-30-15k', name: '3D-30-15K', pattern: 'ABC', defaultRate: 30, minimumRate: 25, fourDigitPrize: 0, threeDigitPrize: 15000, twoDigitPrize: 500, singleDigitPrize: 50, enabled: true },
      { id: 'scheme-3d-35-17k', name: '3D-35-17K', pattern: 'ABC', defaultRate: 35, minimumRate: 27.50, fourDigitPrize: 0, threeDigitPrize: 17500, twoDigitPrize: 500, singleDigitPrize: 50, enabled: true },
      { id: 'scheme-3d-40-25k', name: '3D-40-25K', pattern: 'ABC', defaultRate: 40, minimumRate: 35, fourDigitPrize: 0, threeDigitPrize: 25000, twoDigitPrize: 500, singleDigitPrize: 50, enabled: true },
      { id: 'scheme-3d-70-35k', name: '3D-70-35K', pattern: 'ABC', defaultRate: 70, minimumRate: 54, fourDigitPrize: 0, threeDigitPrize: 35000, twoDigitPrize: 1000, singleDigitPrize: 100, enabled: true },
      { id: 'scheme-4d-20-1l', name: '4D-25-1L', pattern: 'DABC', defaultRate: 25, minimumRate: 11, mrp: 25, fourDigitPrize: 100000, threeDigitPrize: 0, twoDigitPrize: 0, singleDigitPrize: 0, enabled: true },
      { id: 'scheme-4d-110-5l', name: '4D-120-5L', pattern: 'DABC', defaultRate: 120, minimumRate: 77, mrp: 120, fourDigitPrize: 500000, threeDigitPrize: 10000, twoDigitPrize: 1000, singleDigitPrize: 100, enabled: true },
      { id: 'scheme-4d-60-2l', name: '4D-60-2.5L', pattern: 'DABC', defaultRate: 60, minimumRate: 39, mrp: 60, fourDigitPrize: 250000, threeDigitPrize: 5000, twoDigitPrize: 500, singleDigitPrize: 50, enabled: true }
    ],
    pricing: { baseRate: 10, distributorRate: 12, subDistributorRate: 14, sellerRate: 16, customerRate: 20 },
    schemes: {
      FOUR_DIGIT: { type: 'FOUR_DIGIT', label: '4 Digit', length: 4, prizes: { four: 50000, three: 10000, two: 2000, one: 500 } },
      THREE_DIGIT: { type: 'THREE_DIGIT', label: '3 Digit', length: 3, prizes: { three: 25000, two: 10000, one: 1000 } },
      TWO_DIGIT_STANDARD: { type: 'TWO_DIGIT', label: '2 Digit Standard', length: 2, premium: false },
      TWO_DIGIT_PREMIUM: { type: 'TWO_DIGIT', label: '2 Digit Premium', length: 2, premium: true, enabled: true },
      ONE_DIGIT_STANDARD: { type: 'ONE_DIGIT', label: '1 Digit Standard', length: 1, premium: false },
      ONE_DIGIT_PREMIUM: { type: 'ONE_DIGIT', label: '1 Digit Premium', length: 1, premium: true, enabled: true }
    }
  },
  users: [
    user('owner-1', null, 'OWNER', 'System Owner', '9000000000', 'Owner@123'),
    user('admin-1', null, 'SUPER_ADMIN', 'Super Admin', '9000000001', 'Admin@123'),
    { ...user('seller-1', 'admin-1', 'SELLER', 'Demo Seller', '9000000004', 'Seller@123'), commissionPercentage: 0, lotCodeIds: ['kerala'], lotCodeSchemeRates: { kerala: Object.fromEntries(initialSchemeIds.map((id) => [id, { enabled: true, rate: initialRateFor(id) }])) }, catalogSchemeRates: Object.fromEntries(initialSchemeIds.map((id) => [id, { enabled: true, rate: initialRateFor(id) }])) }
  ], contests: [], tickets: [], bills: [], draws: [], saleReports: [], reportCorrections: [], weeklyPayments: [], dailyExpenses: [], bonusRules: [], audit: []
};

const dataFile = resolve(import.meta.dirname, '../data/application-data.json');
let postgresPool = null;
let postgresWrite = Promise.resolve();
if (process.env.NODE_ENV !== 'test' && existsSync(dataFile)) {
  try {
    const saved = JSON.parse(readFileSync(dataFile, 'utf8'));
    for (const key of Object.keys(store)) if (saved[key] !== undefined) store[key] = saved[key];
  } catch (error) {
    throw new Error(`Stored application data cannot be read: ${error.message}`);
  }
}

// NGS is direct-only: preserve Seller access while retiring legacy tiers.
const retiredSubDistributors = new Map(store.users.filter((item) => item.role === 'SUB_DISTRIBUTOR').map((item) => [item.id, item.parentId]));
for (const account of store.users) {
  if (account.role === 'SELLER' && retiredSubDistributors.has(account.parentId)) account.parentId = retiredSubDistributors.get(account.parentId);
  if (account.role === 'SELLER') account.commissionPercentage ??= 0;
}
const legacyDistributors = new Map(store.users.filter((item) => item.role === 'DISTRIBUTOR').map((item) => [item.id, item]));
for (const account of store.users.filter((item) => item.role === 'SELLER')) {
  const distributor = legacyDistributors.get(account.parentId);
  if (!distributor) continue;
  account.parentId = 'admin-1';
  account.lotCodeIds ??= [...(distributor.lotCodeIds ?? [])];
  account.lotCodeSchemeRates ??= structuredClone(distributor.lotCodeSchemeRates ?? {});
  account.catalogSchemeRates ??= structuredClone(distributor.catalogSchemeRates ?? {});
  account.schemeRates ??= structuredClone(distributor.schemeRates ?? {});
  account.lotCodeGraceMinutes ??= structuredClone(distributor.lotCodeGraceMinutes ?? {});
}
store.users = store.users.filter((item) => !['SUB_DISTRIBUTOR', 'DISTRIBUTOR'].includes(item.role));
store.settings.subDistributorEnabled = false;
store.settings.maxSellers ??= 2000;
if (!store.users.some((item) => item.role === 'OWNER')) store.users.unshift(user('owner-1', null, 'OWNER', 'System Owner', '9000000000', 'Owner@123'));
store.saleReports ??= [];
store.reportCorrections ??= [];
store.bills ??= [];
if (process.env.NODE_ENV !== 'test') {
  const kerala = store.settings.boards.find((item) => item.id === 'kerala');
  const dear = store.settings.boards.find((item) => item.id === 'dear');
  if (kerala && !(kerala.schedules ?? []).length) kerala.schedules = [{ id: 'show1', label: 'KL 3:00 PM', startTime: '00:01', endTime: '15:00', enabled: true }];
  if (dear && !(dear.schedules ?? []).length) dear.schedules = [{ id: 'show1', label: 'DEAR 1:00 PM', startTime: '00:01', endTime: '12:58', enabled: true }, { id: 'show2', label: 'DEAR 6:00 PM', startTime: '00:01', endTime: '17:58', enabled: true }, { id: 'show3', label: 'DEAR 8:00 PM', startTime: '00:01', endTime: '19:58', enabled: true }];
}

for (const scheme of store.settings.schemeCatalog) {
  scheme.minimumRate ??= scheme.defaultRate ?? 10;
  scheme.mrp ??= scheme.defaultRate ?? 12;
}
persistStore();

export const createRecord = (collection, value) => {
  const record = { id: randomUUID(), createdAt: now(), ...value };
  store[collection].push(record);
  return record;
};

export function publicUser({ passwordHash, ...safe }) { return safe; }
export function audit(actorId, action, entityType, entityId, payload = {}) { createRecord('audit', { actorId, action, entityType, entityId, payload }); }
export function persistStore() {
  if (process.env.NODE_ENV === 'test') return;
  mkdirSync(dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, dataFile);
  if (postgresPool) {
    const snapshot = JSON.stringify(store);
    postgresWrite = postgresWrite.then(() => postgresPool.query("INSERT INTO application_state (id, state, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()", [snapshot])).catch((error) => console.error(`PostgreSQL persistence failed: ${error.message}`));
  }
}
export async function initializeDatabasePersistence() {
  if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) return { mode: 'JSON' };
  const { Pool } = await import('pg');
  postgresPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : false });
  await postgresPool.query("CREATE TABLE IF NOT EXISTS application_state (id smallint PRIMARY KEY CHECK (id = 1), state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  const result = await postgresPool.query('SELECT state FROM application_state WHERE id = 1');
  if (result.rows.length) {
    const saved = result.rows[0].state;
    for (const key of Object.keys(store)) if (saved[key] !== undefined) store[key] = saved[key];
  } else {
    await postgresPool.query('INSERT INTO application_state (id, state) VALUES (1, $1::jsonb)', [JSON.stringify(store)]);
  }
  return { mode: 'POSTGRESQL' };
}
export function descendantsOf(parentId) {
  const direct = store.users.filter((item) => item.parentId === parentId);
  return direct.concat(direct.flatMap((item) => descendantsOf(item.id)));
}
