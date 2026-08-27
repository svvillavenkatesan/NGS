import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLicenseStatus } from '../src/license.js';

const base = { trialEndsAt: '2026-01-08T00:00:00.000Z', licenseStatus: 'TRIAL', licenseEndsAt: null, suspended: false };

test('allows a trial before its seven-day expiry', () => {
  assert.equal(calculateLicenseStatus(base, new Date('2026-01-07T23:59:59.000Z')), 'TRIAL');
});

test('expires a trial after its deadline', () => {
  assert.equal(calculateLicenseStatus(base, new Date('2026-01-08T00:00:01.000Z')), 'EXPIRED');
});

test('honours active and suspended licenses', () => {
  assert.equal(calculateLicenseStatus({ ...base, licenseStatus: 'ACTIVE', licenseEndsAt: '2027-01-01T00:00:00.000Z' }, new Date('2026-06-01T00:00:00.000Z')), 'ACTIVE');
  assert.equal(calculateLicenseStatus({ ...base, suspended: true }, new Date('2026-01-02T00:00:00.000Z')), 'SUSPENDED');
});
