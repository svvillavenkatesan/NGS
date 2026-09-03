import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyRange, dailyLedger, validateDailyPayment } from '../src/services/daily-ledger.js';

test('daily accounts: independent dates, partial receipts, payouts and corrections', () => {
  const reports = [
    { businessDate: '2026-09-02', totalSales: 100, totalPrize: 0, totalBonus: 10, totalQuantity: 2, status: 'FINALIZED' },
    { businessDate: '2026-09-03', totalSales: 100, totalPrize: 200, totalBonus: 0, status: 'FINALIZED' }
  ];
  const payments = [
    { accountDate: '2026-09-02', direction: 'RECEIVED', amount: 40 },
    { accountDate: '2026-09-03', direction: 'PAID', amount: 25 }
  ];
  let days = dailyLedger(reports, payments, '2026-09-02', '2026-09-03');
  assert.equal(days[0].balance, -75);
  assert.equal(days[1].balance, 50);
  assert.deepEqual(validateDailyPayment({ expectedBalance: -75, direction: 'PAID', settle: true }, days[0]), { direction: 'PAID', amount: 75 });
  assert.throws(() => validateDailyPayment({ expectedBalance: 50, direction: 'PAID', amount: 10 }, days[1]));
  assert.throws(() => validateDailyPayment({ expectedBalance: 50, direction: 'RECEIVED', amount: 51 }, days[1]));
  assert.throws(() => validateDailyPayment({ expectedBalance: 50, direction: 'RECEIVED', amount: 1.001 }, days[1]));
  assert.throws(() => validateDailyPayment({ expectedBalance: 90, direction: 'RECEIVED', amount: 10 }, days[1]), /Balance changed/);
  payments.push({ accountDate: '2026-09-02', direction: 'RECEIVED', amount: 50 });
  days = dailyLedger(reports, payments, '2026-09-02', '2026-09-03');
  assert.equal(days[1].settled, true);
  reports[0].totalSales += 10;
  assert.equal(dailyLedger(reports, payments, '2026-09-02', '2026-09-03')[1].settled, false);
});

test('daily ranges: 15 days by default, history, invalid and future dates', () => {
  assert.deepEqual(dailyRange(null, null, '2026-09-03'), { from: '2026-08-20', to: '2026-09-03' });
  assert.equal(dailyLedger([], [], '2026-08-20', '2026-09-03').length, 15);
  assert.throws(() => dailyRange('2026-02-30', '2026-03-01', '2026-09-03'));
  assert.throws(() => dailyRange(null, '2026-09-04', '2026-09-03'));
  assert.deepEqual(dailyRange('2025-09-03', '2025-09-03', '2026-09-03'), { from: '2025-09-03', to: '2025-09-03' });
});

test('daily ledger API: ownership, permission, duplicate protection, persistence record', async (context) => {
  process.env.NODE_ENV = 'test';
  const { server } = await import('../src/server.js');
  const { store } = await import('../src/store.js');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, token, body) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const admin = (await call('/api/auth/login', null, { phone: '9000000001', password: 'Admin@123' })).data.token;
  const sellerToken = (await call('/api/auth/login', null, { phone: '9000000004', password: 'Seller@123' })).data.token;
  const seller = store.users.find((item) => item.phone === '9000000004');
  store.saleReports.push({ id: 'daily-test', sellerId: seller.id, businessDate: '2026-09-02', status: 'FINALIZED' });
  store.tickets.push({ id: 'daily-ticket', reportId: 'daily-test', sellerId: seller.id, total: 100, quantity: 1, unitPrice: 100, prize: 0, createdAt: '2026-09-02T00:00:00Z' });
  const url = `/api/reports/seller-daily?sellerId=${seller.id}&from=2026-09-02&to=2026-09-02`;
  assert.equal((await call(url, sellerToken)).status, 403);
  assert.equal((await call('/api/reports/seller-daily?sellerId=other', admin)).status, 404);
  assert.equal((await call(url, admin)).data.days[0].balance, 100);
  const body = { sellerId: seller.id, accountDate: '2026-09-02', expectedBalance: 100, direction: 'RECEIVED', amount: 40, actionPassword: 'Admin@123', requestId: 'test-payment-request-0001' };
  assert.equal((await call('/api/seller-daily-payments', admin, { ...body, actionPassword: 'wrong' })).status, 403);
  assert.equal((await call('/api/seller-daily-payments', admin, body)).status, 201);
  assert.equal((await call('/api/seller-daily-payments', admin, body)).data.duplicate, true);
  assert.equal(store.dailySellerPayments.length, 1);
  assert.equal((await call(url, admin)).data.days[0].balance, 60);
  assert.equal((await call('/api/seller-daily-payments', admin, { ...body, requestId: 'test-payment-request-0002' })).status, 409);
  assert.equal((await call('/api/seller-daily-payments', admin, { ...body, requestId: 'test-payment-request-0003', expectedBalance: 60, settle: true })).status, 201);
  assert.equal((await call(url, admin)).data.days[0].settled, true);
});
