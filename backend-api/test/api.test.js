import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { server } = await import('../src/server.js');
const { store } = await import('../src/store.js');
const { issueAccountLicense } = await import('../src/account-license.js');

test('NGS direct Seller workflow', async (context) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = async (path, token, options = {}) => {
    const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
    return { response, data: await response.json() };
  };
  const login = async (phone, password) => {
    const { response, data } = await json('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ phone, password }) });
    assert.equal(response.status, 200);
    return data.token;
  };

  const admin = await login('9000000001', 'Admin@123');
  const seller = await login('9000000004', 'Seller@123');
  const owner = await login('9000000000', 'Owner@123');
  await login('SA260001', 'Admin@123');
  await login('sa260001', 'Admin@123');
  await login('Sa 26-0001', 'Admin@123');
  await login('01001', 'Seller@123');
  await login('joker', 'Owner@123');
  await login('JOKER', 'Owner@123');
  const wrongCasePassword = await json('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ phone: 'sa260001', password: 'admin@123' }) });
  assert.equal(wrongCasePassword.response.status, 401);

  const retiredDistributor = await json('/api/users', admin, { method: 'POST', body: JSON.stringify({ role: 'DISTRIBUTOR', name: 'Blocked Distributor', phone: '9111111111', password: 'Welcome@123', actionPassword: 'Admin@123' }) });
  assert.equal(retiredDistributor.response.status, 403);

  const directSeller = await json('/api/users', admin, { method: 'POST', body: JSON.stringify({ role: 'SELLER', name: 'Admin Direct Seller', phone: '9555555555', password: 'Seller@789', lotCodeId: 'kerala', catalogSchemeRates: { 'scheme-a': { enabled: true, rate: 10.6 }, 'scheme-3d-30-15k': { enabled: true, rate: 30 } }, commissionPercentage: 20, actionPassword: 'Admin@123' }) });
  assert.equal(directSeller.response.status, 201);
  assert.equal(directSeller.data.parentId, 'admin-1');
  assert.equal(directSeller.data.role, 'SELLER');
  assert.equal(directSeller.data.sellerCode, '01002');
  assert.deepEqual(directSeller.data.lotCodeIds, ['kerala', 'dear']);
  assert.equal(directSeller.data.commissionPercentage, 20);

  const updatedSeller = await json('/api/users/seller-settings', admin, { method: 'PUT', body: JSON.stringify({ sellerId: directSeller.data.id, lotCodeId: 'dear', catalogSchemeRates: { 'scheme-a': { enabled: true, rate: 10.6 }, 'scheme-4d-60-2l': { enabled: true, rate: 39 } }, commissionPercentage: 25, graceMinutes: { show1: 2, show2: 0, show3: 5 }, actionPassword: 'Admin@123' }) });
  assert.equal(updatedSeller.response.status, 200);
  assert.deepEqual(updatedSeller.data.lotCodeIds, ['kerala', 'dear']);
  assert.equal(updatedSeller.data.lotCodeSchemeRates.dear['scheme-4d-60-2l'].enabled, true);
  assert.equal(updatedSeller.data.commissionPercentage, 25);
  assert.equal(updatedSeller.data.lotCodeGraceMinutes.dear.show1, 2);
  assert.equal(updatedSeller.data.lotCodeGraceMinutes.dear.show3, 5);

  const ownerControl = await json('/api/owner/control', owner);
  assert.equal(ownerControl.response.status, 200);
  assert.equal(ownerControl.data.currentSellers, 2);
  const primaryAdminReport = ownerControl.data.superAdmins.find((item) => item.id === 'admin-1');
  assert.equal(primaryAdminReport.superAdminCode, 'SA260001');
  assert.equal(primaryAdminReport.totalSellersCreated, 2);
  assert.equal(typeof primaryAdminReport.financials.today.netProfit, 'number');
  assert.deepEqual(Object.keys(primaryAdminReport.financials).sort(), ['month', 'periods', 'today', 'week']);
  const newAdminOne = await json('/api/owner/super-admin', owner, { method: 'POST', body: JSON.stringify({ name: 'Branch Admin One', phone: '9777777771', password: 'Branch@123', sellerLimit: 1, validityMonths: 6, ownerPassword: 'Owner@123' }) });
  const newAdminTwo = await json('/api/owner/super-admin', owner, { method: 'POST', body: JSON.stringify({ name: 'Branch Admin Two', phone: '9777777772', password: 'Branch@124', sellerLimit: 5, validityMonths: 12, ownerPassword: 'Owner@123' }) });
  assert.equal(newAdminOne.response.status, 201);
  assert.equal(newAdminTwo.response.status, 201);
  assert.equal(newAdminOne.data.superAdminCode, 'SA260002');
  assert.equal(newAdminTwo.data.superAdminCode, 'SA260003');
  const sellerLimit = await json('/api/owner/seller-limit', owner, { method: 'PUT', body: JSON.stringify({ superAdminId: 'admin-1', sellerLimit: 2, ownerPassword: 'Owner@123' }) });
  assert.equal(sellerLimit.response.status, 200);
  assert.equal(sellerLimit.data.remaining, 0);
  const blockedByLimit = await json('/api/users', admin, { method: 'POST', body: JSON.stringify({ role: 'SELLER', name: 'Over Limit', phone: '9666666666', password: 'Seller@999', lotCodeId: 'kerala', catalogSchemeRates: { 'scheme-a': { enabled: true, rate: 10.6 } }, commissionPercentage: 0, actionPassword: 'Admin@123' }) });
  assert.equal(blockedByLimit.response.status, 409);

  const branchAdmin = await login('9777777771', 'Branch@123');
  const branchSeller = await json('/api/users', branchAdmin, { method: 'POST', body: JSON.stringify({ role: 'SELLER', name: 'Branch Seller', phone: '9777777781', password: 'Seller@321', lotCodeId: 'kerala', catalogSchemeRates: { 'scheme-a': { enabled: true, rate: 10.6 } }, commissionPercentage: 0, actionPassword: 'Branch@123' }) });
  assert.equal(branchSeller.response.status, 201);
  assert.equal(branchSeller.data.parentId, newAdminOne.data.id);
  assert.equal(branchSeller.data.sellerCode, '02001');
  assert.deepEqual(branchSeller.data.lotCodeIds, ['kerala', 'dear']);
  await login('02001', 'Seller@321');
  const removedBranchLot = await json('/api/users/seller-settings', branchAdmin, { method: 'PUT', body: JSON.stringify({ sellerId: branchSeller.data.id, lotCodeId: 'dear', removeLotCode: true, actionPassword: 'Branch@123' }) });
  assert.equal(removedBranchLot.response.status, 200);
  assert.deepEqual(removedBranchLot.data.lotCodeIds, ['kerala']);
  const branchOverLimit = await json('/api/users', branchAdmin, { method: 'POST', body: JSON.stringify({ role: 'SELLER', name: 'Branch Seller Two', phone: '9777777782', password: 'Seller@322', lotCodeId: 'kerala', catalogSchemeRates: { 'scheme-a': { enabled: true, rate: 10.6 } }, commissionPercentage: 0, actionPassword: 'Branch@123' }) });
  assert.equal(branchOverLimit.response.status, 409);

  const directToken = await login('9555555555', 'Seller@789');
  const directDashboard = await json('/api/dashboard', directToken);
  assert.equal(directDashboard.response.status, 200);
  assert.deepEqual(directDashboard.data.boards.map((item) => item.id), ['kerala', 'dear']);
  assert.equal(directDashboard.data.schemeCatalog.some((item) => item.id === 'scheme-3d-30-15k'), true);

  const sale = await json('/api/tickets/batch', directToken, { method: 'POST', body: JSON.stringify({ items: [
    { boardId: 'kerala', catalogSchemeId: 'scheme-3d-30-15k', number: '234', scheme: 'THREE_DIGIT', quantity: 2 },
    { boardId: 'kerala', catalogSchemeId: 'scheme-bc', number: '34', scheme: 'TWO_DIGIT_STANDARD', quantity: 3 }
  ] }) });
  assert.equal(sale.response.status, 201);
  assert.equal(sale.data.quantity, 5);
  assert.equal(sale.data.total, 105);
  const unlimitedBatch = await json('/api/tickets/batch', directToken, { method: 'POST', body: JSON.stringify({ items: Array.from({ length: 101 }, (_, index) => ({ boardId: 'kerala', catalogSchemeId: 'scheme-a', number: String(index % 10), scheme: 'ONE_DIGIT_STANDARD', quantity: 1 })) }) });
  assert.equal(unlimitedBatch.response.status, 201);
  assert.equal(unlimitedBatch.data.itemCount, 101);

  const users = await json('/api/users', admin);
  assert.equal(users.response.status, 200);
  assert.equal(users.data.every((item) => item.role === 'SELLER' && item.parentId === 'admin-1'), true);

  const dashboard = await json('/api/dashboard', admin);
  assert.equal(dashboard.response.status, 200);
  assert.equal(Array.isArray(dashboard.data.directSellerPerformance), true);
  assert.equal('distributorPerformance' in dashboard.data, false);

  const reports = await json('/api/reports/sales', directToken);
  assert.equal(reports.response.status, 200);
  assert.equal(reports.data.length, 1);
  assert.equal(reports.data[0].sellerCode, '01002');
  assert.equal(reports.data[0].superAdminCode, 'SA260001');
  assert.equal(Number.isFinite(reports.data[0].totalBonus), true);
  assert.equal(reports.data[0].totalNet, reports.data[0].totalSales - reports.data[0].totalPrize - reports.data[0].totalBonus);
  const detail = await json(`/api/reports/sale?reportId=${reports.data[0].id}`, directToken);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.data.seller.code, '01002');
  assert.equal(detail.data.superAdmin.code, 'SA260001');
  assert.equal(detail.data.entries.every((item) => 'bonusAmount' in item && 'netAmount' in item && 'billNumber' in item), true);

  const correctionDraw = { id: 'test-correction-draw', createdAt: new Date().toISOString(), boardId: reports.data[0].boardId, boardCode: reports.data[0].boardCode, boardName: 'Kerala', showId: reports.data[0].showId, showLabel: reports.data[0].showLabel, resultDate: reports.data[0].businessDate, winningNumber: '9999', publishedBy: 'admin-1', status: 'PUBLISHED', locked: true };
  store.draws.push(correctionDraw);
  const correctionRequest = await json('/api/result-corrections', admin, { method: 'POST', body: JSON.stringify({ drawId: correctionDraw.id, proposedWinningNumber: '0234', reason: 'Official result correction', actionPassword: 'Admin@123' }) });
  assert.equal(correctionRequest.response.status, 201);
  assert.equal(correctionRequest.data.status, 'PENDING');
  assert.equal(correctionRequest.data.oldWinningNumber, '9999');
  const ownerCorrections = await json('/api/owner/result-corrections', owner);
  assert.equal(ownerCorrections.data.some((item) => item.id === correctionRequest.data.id && item.superAdminCode === 'SA260001'), true);
  assert.equal(correctionRequest.data.preview.ticketQuantity, 106);
  const approvedCorrection = await json('/api/owner/result-corrections/approve', owner, { method: 'POST', body: JSON.stringify({ requestId: correctionRequest.data.id, ownerPassword: 'Owner@123', verified: 'on' }) });
  assert.equal(approvedCorrection.response.status, 200);
  assert.equal(approvedCorrection.data.draw.winningNumber, '0234');
  assert.equal(approvedCorrection.data.draw.correctionHistory[0].oldWinningNumber, '9999');
  assert.equal(approvedCorrection.data.request.status, 'APPROVED');
  assert.equal(approvedCorrection.data.recalculatedTickets > 0, true);
  assert.equal(store.tickets.some((item) => item.reportId === reports.data[0].id && item.prize > 0), true);
  assert.equal(store.saleReports.find((item) => item.id === reports.data[0].id).winningNumber, '0234');

  const commission = await json('/api/users/seller-commission', admin, { method: 'PUT', body: JSON.stringify({ sellerId: directSeller.data.id, commissionPercentage: 30, actionPassword: 'Admin@123' }) });
  assert.equal(commission.response.status, 200);
  assert.equal(commission.data.commissionPercentage, 30);

  const passwordChange = await json('/api/me/password', directToken, { method: 'PUT', body: JSON.stringify({ currentPassword: 'Seller@789', newPassword: 'Changed@789' }) });
  assert.equal(passwordChange.response.status, 200);
  await login('9555555555', 'Changed@789');

  const forgotSeller = await json('/api/auth/forgot-password', null, { method: 'POST', body: JSON.stringify({ phone: '9777777781' }) });
  assert.equal(forgotSeller.response.status, 200);
  const branchRequests = await json('/api/password-reset-requests', branchAdmin);
  assert.equal(branchRequests.data.some((item) => item.userId === branchSeller.data.id), true);
  const resetSeller = await json('/api/users/password-reset', branchAdmin, { method: 'PUT', body: JSON.stringify({ userId: branchSeller.data.id, newPassword: 'Reset@321', actionPassword: 'Branch@123' }) });
  assert.equal(resetSeller.response.status, 200);
  await login('9777777781', 'Reset@321');

  const forgotAdmin = await json('/api/auth/forgot-password', null, { method: 'POST', body: JSON.stringify({ phone: '9777777772' }) });
  assert.equal(forgotAdmin.response.status, 200);
  const ownerRequests = await json('/api/password-reset-requests', owner);
  assert.equal(ownerRequests.data.some((item) => item.userId === newAdminTwo.data.id), true);
  const resetAdmin = await json('/api/owner/super-admin-password-reset', owner, { method: 'PUT', body: JSON.stringify({ superAdminId: newAdminTwo.data.id, newPassword: 'Reset@124', ownerPassword: 'Owner@123' }) });
  assert.equal(resetAdmin.response.status, 200);
  await login('9777777772', 'Reset@124');

  const newLotCode = await json('/api/settings/boards', admin, { method: 'POST', body: JSON.stringify({ code: 'TS', name: 'Test State', actionPassword: 'Admin@123' }) });
  assert.equal(newLotCode.response.status, 201);
  const usersAfterNewLot = await json('/api/users', admin);
  assert.equal(usersAfterNewLot.data.every((item) => item.lotCodeIds.includes(newLotCode.data.id)), true);
  assert.equal(usersAfterNewLot.data.every((item) => Object.keys(item.lotCodeSchemeRates[newLotCode.data.id]).length === 8), true);

  const renewalAccount = store.users.find((item) => item.id === newAdminOne.data.id);
  const renewalStart = new Date(); renewalStart.setUTCMonth(renewalStart.getUTCMonth() - 6); renewalStart.setUTCDate(renewalStart.getUTCDate() + 10);
  const expiringLicense = issueAccountLicense({ accountId: renewalAccount.id, periodMonths: 6, sequence: 1, startsAt: renewalStart });
  renewalAccount.accountLicenseKey = expiringLicense.key; renewalAccount.accountLicenseSequence = 1;
  const renewalRequest = await json('/api/license/renewal-request', branchAdmin, { method: 'POST', body: JSON.stringify({ periodMonths: 12 }) });
  assert.equal(renewalRequest.response.status, 201);
  const approvedRenewal = await json('/api/owner/renewals/approve', owner, { method: 'POST', body: JSON.stringify({ requestId: renewalRequest.data.id, ownerPassword: 'Owner@123' }) });
  assert.equal(approvedRenewal.response.status, 200);
  assert.equal(approvedRenewal.data.accountValidity.status, 'ACTIVE');
  assert.equal(approvedRenewal.data.accountValidity.sequence, 2);
});
