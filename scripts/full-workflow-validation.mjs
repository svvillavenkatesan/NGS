import { mkdir, writeFile } from 'node:fs/promises';
import { evaluateTicket } from '../backend-api/src/services/prize-engine.js';

const base = 'http://localhost:4000';
const adminPassword = 'Admin@123';
const testPassword = 'Test@12345';
const resultDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.error ?? JSON.stringify(data)}`);
  return data;
}

const login = async (phone, password) => (await api('/api/auth/login', {
  method: 'POST', body: { phone, password }
})).token;

const admin = await login('9000000001', adminPassword);
let dashboard = await api('/api/dashboard', { token: admin });
const schemeIds = dashboard.schemeCatalog.map((scheme) => scheme.id);
const schemeRates = (extra) => Object.fromEntries(dashboard.schemeCatalog.map((scheme) => [scheme.id, {
  enabled: true,
  rate: Math.min(Number(scheme.mrp), Number(scheme.minimumRate) + extra)
}]));

async function configureBoard(boardId, schedules) {
  return api('/api/settings/boards/config', {
    token: admin, method: 'PUT', body: { boardId, schemeIds, schedules, actionPassword: adminPassword }
  });
}

const allDay = (id, label) => [{ id, label, enabled: true, startTime: '00:00', endTime: '23:59' }];
await configureBoard('kerala', allDay('show1', 'Kerala Day'));
await configureBoard('dear', allDay('show1', 'Dear Morning'));

async function ensureAdminUser(spec) {
  const users = await api('/api/users', { token: admin });
  const existing = users.find((item) => item.phone === spec.phone);
  if (existing) return existing;
  return api('/api/users', { token: admin, method: 'POST', body: { ...spec, actionPassword: adminPassword } });
}

const distributors = [];
for (const spec of [
  { name: 'Validation Distributor A', phone: '9800000001', bonus: 10, extra: 1 },
  { name: 'Validation Distributor B', phone: '9800000002', bonus: 15, extra: 2 }
]) {
  const account = await ensureAdminUser({
    role: 'DISTRIBUTOR', name: spec.name, phone: spec.phone, password: testPassword,
    lotCodeId: 'kerala', catalogSchemeRates: schemeRates(spec.extra), graceMinutes: { show1: spec.extra }
  });
  for (const boardId of ['kerala', 'dear']) {
    await api('/api/users/distributor-settings', {
      token: admin, method: 'PUT', body: {
        distributorId: account.id, lotCodeId: boardId, catalogSchemeRates: schemeRates(spec.extra),
        graceMinutes: { show1: spec.extra, show2: spec.extra, show3: spec.extra }, actionPassword: adminPassword
      }
    });
  }
  await api('/api/bonus-rules', {
    token: admin, method: 'POST', body: {
      beneficiaryId: account.id, enabled: true, targetSales: 0,
      percentage: spec.bonus, actionPassword: adminPassword
    }
  });
  distributors.push({ ...spec, ...account, token: await login(spec.phone, testPassword) });
}

const sellerSpecs = [
  { owner: 0, name: 'Validation Seller A1', phone: '9800000011', commission: 5, bonus: 5, boardId: 'kerala', showId: 'show1' },
  { owner: 0, name: 'Validation Seller A2', phone: '9800000012', commission: 7, bonus: 7, boardId: 'dear', showId: 'show1' },
  { owner: 1, name: 'Validation Seller B1', phone: '9800000021', commission: 6, bonus: 6, boardId: 'dear', showId: 'show2' },
  { owner: 1, name: 'Validation Seller B2', phone: '9800000022', commission: 9, bonus: 9, boardId: 'dear', showId: 'show3' }
];
const sellers = [];
for (const spec of sellerSpecs) {
  const owner = distributors[spec.owner];
  let account = (await api('/api/users', { token: owner.token })).find((item) => item.phone === spec.phone);
  if (!account) account = await api('/api/users', {
    token: owner.token, method: 'POST', body: {
      role: 'SELLER', name: spec.name, phone: spec.phone, password: testPassword,
      commissionPercentage: spec.commission
    }
  });
  await api('/api/users/seller-commission', {
    token: owner.token, method: 'PUT', body: { sellerId: account.id, commissionPercentage: spec.commission }
  });
  await api('/api/bonus-rules', {
    token: owner.token, method: 'POST', body: {
      beneficiaryId: account.id, enabled: true, targetSales: 0, percentage: spec.bonus
    }
  });
  sellers.push({ ...spec, ...account, token: await login(spec.phone, testPassword) });
}

let directSeller = await ensureAdminUser({
  role: 'SELLER', name: 'Validation Direct Seller', phone: '9800000031', password: testPassword,
  lotCodeId: 'kerala', catalogSchemeRates: schemeRates(1.5), commissionPercentage: 8
});
await api('/api/users/seller-commission', {
  token: admin, method: 'PUT', body: {
    sellerId: directSeller.id, commissionPercentage: 8, actionPassword: adminPassword
  }
});
await api('/api/bonus-rules', {
  token: admin, method: 'POST', body: {
    beneficiaryId: directSeller.id, enabled: true, targetSales: 0,
    percentage: 8, actionPassword: adminPassword
  }
});
directSeller = { ...directSeller, boardId: 'kerala', showId: 'show1', bonus: 8, token: await login(directSeller.phone, testPassword) };

const entryTemplates = [
  ['scheme-a', '1', 'ONE_DIGIT_STANDARD'], ['scheme-b', '2', 'ONE_DIGIT_STANDARD'],
  ['scheme-c', '4', 'ONE_DIGIT_STANDARD'], ['scheme-all-single', '4', 'ONE_DIGIT_STANDARD'],
  ['scheme-ab', '12', 'TWO_DIGIT_STANDARD'], ['scheme-ac', '14', 'TWO_DIGIT_STANDARD'],
  ['scheme-bc', '24', 'TWO_DIGIT_STANDARD'], ['scheme-all-doubles', '24', 'TWO_DIGIT_STANDARD'],
  ['scheme-3d-25-10k', '124', 'THREE_DIGIT'], ['scheme-3d-30-15k', '224', 'THREE_DIGIT'],
  ['scheme-3d-35-17k', '324', 'THREE_DIGIT'], ['scheme-3d-40-25k', '424', 'THREE_DIGIT'],
  ['scheme-3d-70-35k', '524', 'THREE_DIGIT'], ['scheme-4d-20-1l', '1234', 'FOUR_DIGIT'],
  ['scheme-4d-110-5l', '2234', 'FOUR_DIGIT'], ['scheme-4d-60-2l', '3234', 'FOUR_DIGIT']
];

async function seedSeller(seller) {
  const existing = await api('/api/tickets', { token: seller.token });
  const todayQuantity = existing.filter((ticket) => ticket.businessDate === resultDate).reduce((sum, ticket) => sum + ticket.quantity, 0);
  if (todayQuantity >= 100) return { skipped: true, quantity: todayQuantity };
  const items = entryTemplates.map(([catalogSchemeId, number, scheme]) => ({
    boardId: seller.boardId, catalogSchemeId, number, scheme, quantity: 7
  }));
  const bill = await api('/api/tickets/batch', { token: seller.token, method: 'POST', body: { items } });
  if (bill.quantity < 100) throw new Error(`${seller.name} did not reach 100 tickets`);
  return { skipped: false, quantity: bill.quantity, total: bill.total, expandedEntries: bill.itemCount };
}

const seedResults = {};
seedResults[sellers[0].name] = await seedSeller(sellers[0]);
seedResults[directSeller.name] = await seedSeller(directSeller);
for (const show of ['show1', 'show2', 'show3']) {
  await configureBoard('dear', allDay(show, `Dear ${show}`));
  for (const seller of sellers.filter((item) => item.boardId === 'dear' && item.showId === show)) {
    seedResults[seller.name] = await seedSeller(seller);
  }
}

await configureBoard('kerala', [
  { id: 'show1', label: 'Kerala Day', enabled: true, startTime: '06:00', endTime: '15:00' }
]);
await configureBoard('dear', [
  { id: 'show1', label: 'Morning', enabled: true, startTime: '06:00', endTime: '10:59' },
  { id: 'show2', label: 'Afternoon', enabled: true, startTime: '11:00', endTime: '14:59' },
  { id: 'show3', label: 'Evening', enabled: true, startTime: '15:00', endTime: '19:00' }
]);

const draws = await api('/api/draws', { token: admin });
const drawScopes = [
  ['kerala', 'show1'], ['dear', 'show1'], ['dear', 'show2'], ['dear', 'show3']
];
for (const [boardId, showId] of drawScopes) {
  if (draws.some((draw) => draw.boardId === boardId && draw.showId === showId && draw.resultDate === resultDate)) continue;
  await api('/api/draws', {
    token: admin, method: 'POST', body: {
      winningNumber: '1234', boardId, showId, resultDate,
      actionPassword: adminPassword, overrideBelowTarget: true,
      overrideReason: 'Full hierarchy validation requested by Super Admin'
    }
  });
}

function expectedPrize(ticket, winningNumber) {
  const type = ticket.scheme.startsWith('FOUR') ? 'FOUR_DIGIT'
    : ticket.scheme.startsWith('THREE') ? 'THREE_DIGIT'
      : ticket.scheme.startsWith('TWO') ? 'TWO_DIGIT' : 'ONE_DIGIT';
  const scheme = type === 'FOUR_DIGIT' || type === 'THREE_DIGIT'
    ? { type, prizes: ticket.prizeSnapshot }
    : { type, prize: type === 'TWO_DIGIT' ? ticket.prizeSnapshot.two : ticket.prizeSnapshot.one };
  return evaluateTicket(ticket.number, winningNumber, scheme, ticket.catalogPattern).prize * ticket.quantity;
}

const sellerChecks = [];
for (const seller of [...sellers, directSeller]) {
  const tickets = (await api('/api/tickets', { token: seller.token })).filter((ticket) => ticket.businessDate === resultDate);
  const dashboardData = await api('/api/dashboard', { token: seller.token });
  const mismatches = tickets.filter((ticket) => ticket.drawId && ticket.prize !== expectedPrize(ticket, '1234'));
  sellerChecks.push({
    name: seller.name, parentId: seller.parentId, boardId: seller.boardId,
    quantity: tickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
    sales: tickets.reduce((sum, ticket) => sum + ticket.total, 0),
    prizes: tickets.reduce((sum, ticket) => sum + ticket.prize, 0),
    active: tickets.filter((ticket) => ticket.status === 'ACTIVE').length,
    wins: tickets.filter((ticket) => ticket.status === 'WIN').length,
    losses: tickets.filter((ticket) => ticket.status === 'LOSE').length,
    prizeMismatches: mismatches.length,
    schemeCoverage: [...new Set(tickets.map((ticket) => ticket.catalogSchemeId))].sort(),
    displayCoverage: [...new Set(tickets.map((ticket) => ticket.catalogSchemeName))].sort(),
    bonusPercentage: dashboardData.bonus?.percentage ?? 0,
    bonusEligible: dashboardData.bonus?.eligible ?? false
  });
}

const distributorChecks = [];
for (const distributor of distributors) {
  const data = await api('/api/dashboard', { token: distributor.token });
  distributorChecks.push({
    name: distributor.name, bonusPercentage: data.bonus?.percentage ?? 0,
    quantity: data.distributorAccounts.quantity, sales: data.distributorAccounts.customerSales,
    prizes: data.distributorAccounts.prizes, margin: data.distributorAccounts.margin,
    sellerRows: data.distributorAccounts.sellerRows.map((row) => ({
      name: row.name, quantity: row.quantity, sales: row.customerSales,
      prizes: row.prizes, commission: row.sellerCommission, due: row.sellerDue,
      arithmeticCorrect: Math.abs(row.sellerDue - (row.customerSales - row.prizes - row.sellerCommission)) < 0.01
    }))
  });
}

const cutoffResponse = await fetch(`${base}/api/tickets/batch`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${sellers[0].token}` },
  body: JSON.stringify({ items: [{
    boardId: 'kerala', catalogSchemeId: 'scheme-a', number: '1',
    scheme: 'ONE_DIGIT_STANDARD', quantity: 1
  }] })
});
const cutoffProbe = { status: cutoffResponse.status, ...(await cutoffResponse.json()) };

dashboard = await api('/api/dashboard', { token: admin });
const report = {
  generatedAt: new Date().toISOString(), resultDate,
  configuredTimings: dashboard.boards.map((board) => ({ id: board.id, code: board.code, schedules: board.schedules })),
  seedResults, sellerChecks, distributorChecks,
  cutoffProbe,
  adminWeeklyAccounts: dashboard.weeklyAccounts,
  publishedDraws: (await api('/api/draws', { token: admin })).filter((draw) => draw.resultDate === resultDate),
  passed: sellerChecks.every((item) => item.quantity >= 100 && item.active === 0 && item.prizeMismatches === 0 && item.schemeCoverage.length === schemeIds.length && item.bonusPercentage > 0)
    && distributorChecks.every((item) => item.sellerRows.length === 2 && item.bonusPercentage > 0 && item.sellerRows.every((row) => row.arithmeticCorrect))
    && cutoffProbe.status === 409
};

await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await writeFile(new URL('../reports/full-workflow-validation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  passed: report.passed,
  sellers: sellerChecks,
  distributors: distributorChecks,
  draws: report.publishedDraws.map((draw) => `${draw.boardCode}-${draw.showId}-${draw.winningNumber}`)
}, null, 2));
if (!report.passed) process.exitCode = 1;
