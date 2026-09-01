import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { accountLicenseStatus, issueAccountLicense } = await import('../src/account-license.js');

test('accepts only signed account-specific license keys', () => {
  const issued = issueAccountLicense({ accountId: 'admin-a', periodMonths: 6, sequence: 1, startsAt: '2026-09-01T00:00:00.000Z' });
  const account = { id: 'admin-a', accountLicenseKey: issued.key, accountLicenseSequence: 1 };
  assert.equal(accountLicenseStatus(account, new Date('2026-10-01T00:00:00.000Z')).status, 'ACTIVE');
  assert.equal(accountLicenseStatus({ ...account, id: 'admin-b' }).status, 'INVALID');
  assert.equal(accountLicenseStatus({ ...account, accountLicenseKey: `${issued.key}x` }).status, 'INVALID');
  assert.equal(accountLicenseStatus({ ...account, accountLicenseSequence: 2 }).status, 'INVALID');
});

test('provides fifteen days of grace and then blocks operation', () => {
  const issued = issueAccountLicense({ accountId: 'admin-a', periodMonths: 6, sequence: 1, startsAt: '2026-01-01T00:00:00.000Z' });
  const account = { id: 'admin-a', accountLicenseKey: issued.key, accountLicenseSequence: 1 };
  assert.equal(accountLicenseStatus(account, new Date('2026-07-10T00:00:00.000Z')).status, 'GRACE');
  assert.equal(accountLicenseStatus(account, new Date('2026-07-10T00:00:00.000Z')).canOperate, true);
  assert.equal(accountLicenseStatus(account, new Date('2026-07-17T00:00:00.000Z')).status, 'EXPIRED');
  assert.equal(accountLicenseStatus(account, new Date('2026-07-17T00:00:00.000Z')).canOperate, false);
});
