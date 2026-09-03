import test from 'node:test';
import assert from 'node:assert/strict';

test('scheme create and edit require management PWD and preserve sold snapshots', async (context) => {
  process.env.NODE_ENV = 'test';
  const { server } = await import('../src/server.js');
  const { store } = await import('../src/store.js');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  const call = async (path, method, body) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  token = (await call('/api/auth/login', 'POST', { phone: '9000000001', password: 'Admin@123' })).data.token;
  const values = { name: 'Editor test', pattern: 'ABC', defaultRate: 30, mrp: 30, minimumRate: 25, fourDigitPrize: 0, threeDigitPrize: 15000, twoDigitPrize: 500, singleDigitPrize: 50, actionPassword: 'Admin@123' };
  assert.equal((await call('/api/settings/scheme-catalog', 'POST', { ...values, actionPassword: 'wrong' })).status, 403);
  const created = await call('/api/settings/scheme-catalog', 'POST', values);
  assert.equal(created.status, 201);
  const id = created.data.id;
  const sold = { id: 'snapshot-test', catalogSchemeId: id, catalogSchemeName: values.name, catalogPattern: 'ABC', total: 30, quantity: 1, prizeSnapshot: { three: 15000 }, rateSnapshot: { distributorRate: 25 } };
  store.tickets.push(sold);
  const snapshot = JSON.stringify(sold);
  const updated = { ...values, id, name: 'Renamed test', pattern: 'DABC', fourDigitPrize: 100000, threeDigitPrize: 20000 };
  assert.equal((await call('/api/settings/scheme-catalog', 'PUT', { ...updated, actionPassword: 'wrong' })).status, 403);
  assert.equal((await call('/api/settings/scheme-catalog', 'PUT', updated)).status, 200);
  assert.equal(store.settings.schemeCatalog.find((item) => item.id === id).name, 'Renamed test');
  assert.equal(JSON.stringify(sold), snapshot);
  assert.equal((await call('/api/settings/scheme-catalog', 'PUT', { ...updated, minimumRate: 31 })).status, 400);
  assert.equal((await call('/api/settings/scheme-catalog', 'PUT', { ...updated, name: store.settings.schemeCatalog[0].name })).status, 409);
  assert.equal(store.audit.some((item) => item.payload?.previous?.id === id), true);
});
