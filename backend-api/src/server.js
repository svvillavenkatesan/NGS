import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { URL } from 'node:url';
import { audit, createRecord, descendantsOf, initializeDatabasePersistence, persistStore, publicUser, store } from './store.js';
import { createToken, hashPassword, verifyPassword, verifyToken } from './auth.js';
import { evaluateTicket } from './services/prize-engine.js';
import { calculateBonus } from './services/bonus-engine.js';
import { calculateTierProfits, validatePricingHierarchy } from './services/pricing-engine.js';
import { findOpenSchedule, minutesInTimeZone, resultPublishReady } from './services/schedule-engine.js';
import { licenseStatus, requireOperationalLicense } from './license.js';

const port = Number(process.env.PORT ?? 4000);
const root = resolve(import.meta.dirname, '../..');
const clients = new Set();
migrateLegacyReports();
persistStore();

const routes = {
  'GET /health': () => ok({ status: 'ok', service: 'number-game-api' }),
  'POST /api/auth/login': ({ body, req }) => {
    const account = store.users.find((item) => item.phone === String(body.phone) && item.isActive);
    if (!account || !verifyPassword(body.password ?? '', account.passwordHash)) return fail(401, 'Phone number or password is incorrect');
    if (account.role === 'SELLER' && process.env.NODE_ENV === 'production' && !isAndroidSellerRequest(req)) return fail(403, 'Seller Entry is available only in the Android app');
    return ok({ token: createToken(account), user: publicUser(account) });
  },
  'GET /api/me': ({ user }) => ok(publicUser(store.users.find((item) => item.id === user.id))),
  'PUT /api/me/password': ({ body, user }) => {
    const account = store.users.find((item) => item.id === user.id);
    if (!account || !verifyPassword(String(body.currentPassword ?? ''), account.passwordHash)) return fail(403, 'Current password is incorrect');
    const newPassword = String(body.newPassword ?? '');
    if (newPassword.length < 8) return fail(400, 'New password must contain at least 8 characters');
    if (verifyPassword(newPassword, account.passwordHash)) return fail(400, 'New password must be different from the current password');
    account.passwordHash = hashPassword(newPassword);
    account.sessionVersion = Number(account.sessionVersion ?? 0) + 1;
    audit(user.id, 'OWN_PASSWORD_CHANGED', 'user', account.id);
    return ok({ changed: true, loginRequired: true });
  },
  'PUT /api/users/password-reset': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const account = store.users.find((item) => item.id === body.userId && ['DISTRIBUTOR', 'SELLER'].includes(item.role));
    if (!account) return fail(404, 'Distributor or Seller not found');
    const newPassword = String(body.newPassword ?? '');
    if (newPassword.length < 8) return fail(400, 'New password must contain at least 8 characters');
    account.passwordHash = hashPassword(newPassword);
    account.sessionVersion = Number(account.sessionVersion ?? 0) + 1;
    audit(user.id, 'USER_PASSWORD_RESET', 'user', account.id, { role: account.role });
    return ok({ changed: true, userId: account.id, loginRequired: true });
  },
  'GET /api/license/status': () => ok(licenseStatus()),
  'GET /api/settings': ({ user }) => ok(user.role === 'SUPER_ADMIN' ? store.settings : { schemes: visibleSchemes(user), schemeRates: assignedSchemeRates(user), pricing: visiblePricing(user.role) }),
  'PUT /api/settings': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    if (body.pricing) validatePricingHierarchy(body.pricing);
    if (body.minimumProfit) {
      const mode = body.minimumProfit.mode;
      const value = Number(body.minimumProfit.value);
      if (!['PERCENTAGE', 'AMOUNT'].includes(mode) || !Number.isFinite(value) || value < 0 || (mode === 'PERCENTAGE' && value > 100)) return fail(400, 'Minimum profit setting is invalid');
      store.settings.minimumProfit = { mode, value };
    }
    if (body.schemePrizes) updateSchemePrizes(body.schemePrizes);
    if (typeof body.subDistributorEnabled === 'boolean') store.settings.subDistributorEnabled = body.subDistributorEnabled;
    if (body.pricing) store.settings.pricing = body.pricing;
    audit(user.id, 'SETTINGS_UPDATED', 'settings', null, body);
    return ok(store.settings);
  },
  'POST /api/settings/boards': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const name = String(body.name ?? '').trim();
    if (name.length < 2 || name.length > 40) return fail(400, 'Board name must contain 2 to 40 characters');
    if (store.settings.boards.some((item) => item.name.toLowerCase() === name.toLowerCase())) return fail(409, 'Board name already exists');
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(code)) return fail(400, 'Board code must contain 1 to 8 letters or numbers');
    if (store.settings.boards.some((item) => item.code === code)) return fail(409, 'Board code already exists');
    const board = { id: `board-${Date.now().toString(36)}`, code, name, enabled: true, schemeIds: store.settings.schemeCatalog.filter((scheme) => scheme.enabled && scheme.universal).map((scheme) => scheme.id), schedules: [] };
    store.settings.boards.push(board);
    audit(user.id, 'BOARD_CREATED', 'board', null, board);
    return created(board);
  },
  'PATCH /api/settings/boards': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const board = store.settings.boards.find((item) => item.id === body.id);
    if (!board) return fail(404, 'Board not found');
    board.enabled = Boolean(body.enabled);
    audit(user.id, 'BOARD_STATUS_CHANGED', 'board', null, board);
    return ok(board);
  },
  'PUT /api/settings/boards/config': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const board = store.settings.boards.find((item) => item.id === body.boardId);
    if (!board) return fail(404, 'Board not found');
    const universalIds = store.settings.schemeCatalog.filter((scheme) => scheme.enabled && scheme.universal).map((scheme) => scheme.id);
    const schemeIds = [...new Set([...universalIds, ...(Array.isArray(body.schemeIds) ? body.schemeIds : [])])];
    if (schemeIds.some((id) => !store.settings.schemeCatalog.some((scheme) => scheme.id === id && scheme.enabled))) return fail(400, 'One or more schemes are invalid');
    const schedules = (Array.isArray(body.schedules) ? body.schedules : []).filter((item) => item.enabled).map((item) => {
      const label = String(item.label ?? '').trim();
      const startTime = String(item.startTime ?? '');
      const endTime = String(item.endTime ?? '');
      if (!label || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) { const error = new Error('Each enabled timing needs a valid label, start, and end time'); error.status = 400; throw error; }
      const id = /^show[1-5]$/.test(String(item.id ?? '')) ? String(item.id) : label.toLowerCase().replace(/[^a-z0-9]+/g, '');
      return { id, label, startTime, endTime, enabled: true };
    });
    board.schemeIds = schemeIds;
    board.schedules = schedules;
    audit(user.id, 'BOARD_CONFIG_UPDATED', 'board', null, { boardId: board.id, schemeIds, schedules });
    return ok(board);
  },
  'POST /api/settings/scheme-catalog': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const name = String(body.name ?? '').trim();
    if (name.length < 1 || name.length > 60) return fail(400, 'Scheme name must contain 1 to 60 characters');
    if (store.settings.schemeCatalog.some((item) => item.name.toLowerCase() === name.toLowerCase())) return fail(409, 'Scheme name already exists');
    const pattern = String(body.pattern ?? '').trim().toUpperCase();
    if (!/^[A-Z]{1,8}$/.test(pattern)) return fail(400, 'Pattern must contain 1 to 8 letters');
    const defaultRate = Number(body.defaultRate);
    const minimumRate = Number(body.minimumRate);
    const mrp = Number(body.mrp);
    if (![defaultRate, minimumRate, mrp].every(Number.isFinite) || [defaultRate, minimumRate, mrp].some((value) => value < 0)) return fail(400, 'Scheme Rate, Minimum Price and MRP must be valid amounts');
    if (minimumRate > mrp) return fail(400, 'Minimum Price cannot be above MRP');
    const amounts = ['fourDigitPrize', 'threeDigitPrize', 'twoDigitPrize', 'singleDigitPrize'];
    const values = Object.fromEntries(amounts.map((key) => {
      const amount = Number(body[key]);
      if (!Number.isFinite(amount) || amount < 0) { const error = new Error(`${key} must be a non-negative amount`); error.status = 400; throw error; }
      return [key, amount];
    }));
    const scheme = { id: `scheme-${Date.now().toString(36)}`, name, pattern, defaultRate, minimumRate, mrp, ...values, enabled: true };
    store.settings.schemeCatalog.push(scheme);
    audit(user.id, 'SCHEME_CREATED', 'schemeCatalog', null, scheme);
    return created(scheme);
  },
  'PUT /api/settings/scheme-catalog': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const scheme = store.settings.schemeCatalog.find((item) => item.id === body.id);
    if (!scheme) return fail(404, 'Scheme not found');
    const defaultRate = Number(body.defaultRate);
    const minimumRate = Number(body.minimumRate);
    const mrp = Number(body.mrp);
    if (![defaultRate, minimumRate, mrp].every(Number.isFinite) || [defaultRate, minimumRate, mrp].some((value) => value < 0)) return fail(400, 'Scheme Rate, Minimum Price and MRP must be valid amounts');
    if (minimumRate > mrp) return fail(400, 'Minimum Price cannot be above MRP');
    const prizeUpdates = {};
    for (const field of ['fourDigitPrize', 'threeDigitPrize', 'twoDigitPrize', 'singleDigitPrize']) {
      const value = body[field] === undefined ? Number(scheme[field] ?? 0) : Number(body[field]);
      if (!Number.isFinite(value) || value < 0) return fail(400, `${field} must be a non-negative amount`);
      prizeUpdates[field] = value;
    }
    Object.assign(scheme, { defaultRate, minimumRate, mrp, ...prizeUpdates });
    for (const account of store.users.filter((item) => ['DISTRIBUTOR', 'SELLER'].includes(item.role))) {
      for (const rates of Object.values(account.lotCodeSchemeRates ?? {})) {
        if (rates[scheme.id]?.enabled && Number(rates[scheme.id].rate) < minimumRate) rates[scheme.id].rate = minimumRate;
      }
      if (account.lotCodeSchemeRates) account.catalogSchemeRates = mergeCatalogSchemeRates(account.lotCodeSchemeRates);
    }
    audit(user.id, 'SCHEME_PRICING_AND_PRIZES_UPDATED', 'schemeCatalog', scheme.id, { defaultRate, minimumRate, mrp, ...prizeUpdates });
    return ok(scheme);
  },
  'GET /api/users': ({ user }) => ok(visibleUsers(user).map(publicUser)),
  'POST /api/users': ({ body, user }) => {
    if (user.role !== 'SUPER_ADMIN' || body.role !== 'SELLER') return fail(403, 'NGS allows Direct Seller accounts only');
    requireActionPassword(body, user, 'management');
    if (!body.name?.trim() || !/^\d{10,15}$/.test(String(body.phone))) return fail(400, 'Valid name and phone are required');
    if (store.users.some((item) => item.phone === String(body.phone))) return fail(409, 'Phone number already exists');
    let schemeRates;
    let distributorAccess;
    distributorAccess = validateDistributorLotAssignment(body.lotCodeId, body.catalogSchemeRates);
    schemeRates = deriveNumberTypeRates(distributorAccess.catalogSchemeRates);
    const commissionPercentage = body.role === 'SELLER' ? Number(body.commissionPercentage ?? 0) : 0;
    if (body.role === 'SELLER' && (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 50)) return fail(400, 'Seller commission percentage must be between 0 and 50');
    const record = createRecord('users', { parentId: user.id, role: 'SELLER', name: body.name.trim(), phone: String(body.phone), passwordHash: hashPassword(body.password), isActive: true, commissionPercentage, schemeRates, ...distributorAccess });
    audit(user.id, 'USER_CREATED', 'user', record.id, { role: record.role });
    return created(publicUser(record));
  },
  'PUT /api/users/distributor-settings': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const distributor = store.users.find((item) => item.id === body.distributorId && item.role === 'DISTRIBUTOR' && item.parentId === user.id);
    if (!distributor) return fail(404, 'Distributor not found');
    const access = validateDistributorLotAssignment(body.lotCodeId, body.catalogSchemeRates);
    distributor.lotCodeSchemeRates = { ...(distributor.lotCodeSchemeRates ?? {}), [access.lotCodeId]: access.catalogSchemeRates };
    distributor.lotCodeIds = Object.keys(distributor.lotCodeSchemeRates);
    distributor.catalogSchemeRates = mergeCatalogSchemeRates(distributor.lotCodeSchemeRates);
    distributor.schemeRates = deriveNumberTypeRates(distributor.catalogSchemeRates);
    distributor.lotCodeGraceMinutes = { ...(distributor.lotCodeGraceMinutes ?? {}), [access.lotCodeId]: validateGraceMinutes(body.graceMinutes) };
    audit(user.id, 'DISTRIBUTOR_SETTINGS_UPDATED', 'user', distributor.id, { lotCodeId: access.lotCodeId, catalogSchemeRates: access.catalogSchemeRates, graceMinutes: distributor.lotCodeGraceMinutes[access.lotCodeId] });
    return ok(publicUser(distributor));
  },
  'POST /api/contests': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    const name = String(body.name ?? '').trim();
    if (name.length < 2 || name.length > 60) return fail(400, 'Contest name must contain 2 to 60 characters');
    const board = store.settings.boards.find((item) => item.id === body.lotCodeId && item.enabled);
    if (!board) return fail(400, 'Select an available Lot Code');
    if (!Array.isArray(body.schemes) || !body.schemes.length) return fail(400, 'Select at least one contest scheme');
    const seen = new Set();
    const schemes = body.schemes.map((row) => {
      const scheme = store.settings.schemeCatalog.find((item) => item.id === row.schemeId && item.enabled && board.schemeIds.includes(item.id));
      if (!scheme || seen.has(scheme.id)) { const error = new Error('Contest contains an invalid or duplicate scheme'); error.status = 400; throw error; }
      seen.add(scheme.id);
      const prize = Number(row.prize), adminCost = Number(row.adminCost), distributorCost = Number(row.distributorCost), sellerPrice = Number(row.sellerPrice);
      if (![prize, adminCost, distributorCost, sellerPrice].every(Number.isFinite) || [prize, adminCost, distributorCost, sellerPrice].some((value) => value < 0)) { const error = new Error(`${scheme.name} amounts must be non-negative numbers`); error.status = 400; throw error; }
      if (!(adminCost <= distributorCost && distributorCost <= sellerPrice)) { const error = new Error(`${scheme.name} price order must be Admin ≤ Distributor ≤ Seller`); error.status = 400; throw error; }
      return { schemeId: scheme.id, schemeName: scheme.name, prize, adminCost, distributorCost, sellerPrice };
    });
    const startAt = body.startAt ? new Date(body.startAt).toISOString() : null;
    const endAt = body.endAt ? new Date(body.endAt).toISOString() : null;
    if (startAt && endAt && startAt >= endAt) return fail(400, 'Contest end time must be after start time');
    const contest = createRecord('contests', { name, lotCodeId: board.id, lotCode: board.code, startAt, endAt, status: 'DRAFT', schemes });
    audit(user.id, 'CONTEST_CREATED', 'contest', contest.id, contest);
    return created(contest);
  },
  'GET /api/contests': ({ user }) => {
    requireRole(user, 'SUPER_ADMIN');
    return ok([...store.contests].reverse());
  },
  'PATCH /api/users/status': ({ body, user }) => {
    const target = visibleUsers(user).find((item) => item.id === body.id);
    if (!target) return fail(404, 'User not found');
    target.isActive = Boolean(body.isActive);
    audit(user.id, 'USER_STATUS_CHANGED', 'user', target.id, { isActive: target.isActive });
    return ok(publicUser(target));
  },
  'PUT /api/users/seller-commission': ({ body, user }) => {
    if (!['SUPER_ADMIN', 'DISTRIBUTOR'].includes(user.role)) return fail(403, 'Permission denied');
    if (user.role === 'SUPER_ADMIN') requireActionPassword(body, user, 'management');
    const seller = store.users.find((item) => item.id === body.sellerId && item.parentId === user.id && item.role === 'SELLER');
    if (!seller) return fail(404, 'Seller not found');
    const commissionPercentage = Number(body.commissionPercentage);
    if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 50) return fail(400, 'Seller commission percentage must be between 0 and 50');
    seller.commissionPercentage = commissionPercentage;
    audit(user.id, 'SELLER_COMMISSION_UPDATED', 'user', seller.id, { commissionPercentage });
    return ok(publicUser(seller));
  },
  'GET /api/bonus-rules': ({ user }) => ok(store.bonusRules.filter((item) => item.ownerId === user.id)),
  'POST /api/bonus-rules': ({ body, user }) => {
    if (user.role === 'SUPER_ADMIN') requireActionPassword(body, user, 'management');
    const beneficiary = visibleUsers(user).find((item) => item.id === body.beneficiaryId);
    if (!beneficiary) return fail(404, 'Direct beneficiary not found');
    const targetSales = Number(body.targetSales);
    const percentage = Number(body.percentage);
    if (!Number.isFinite(targetSales) || targetSales < 0 || !Number.isFinite(percentage) || percentage < 0 || percentage > 50) return fail(400, 'Bonus percentage must be between 0 and 50');
    const existing = store.bonusRules.find((item) => item.ownerId === user.id && item.beneficiaryId === beneficiary.id);
    const values = { enabled: body.enabled === true || body.enabled === 'true', targetSales, percentage };
    const record = existing ? Object.assign(existing, values) : createRecord('bonusRules', { ownerId: user.id, beneficiaryId: beneficiary.id, ...values });
    audit(user.id, 'BONUS_RULE_SAVED', 'bonusRule', record.id, values);
    return existing ? ok(record) : created(record);
  },
  'GET /api/tickets': ({ user }) => ok(visibleTickets(user)),
  'GET /api/bills/recent': ({ user }) => {
    requireRole(user, 'SELLER');
    return ok(store.bills.filter((item) => item.sellerId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(buildBill));
  },
  'GET /api/reports/sales': ({ user }) => ok(visibleSaleReports(user).map(reportSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  'GET /api/reports/sale': ({ user, url }) => {
    const report = visibleSaleReports(user).find((item) => item.id === url.searchParams.get('reportId'));
    if (!report) return fail(404, 'Report not found or access denied');
    return ok(buildSaleReport(report));
  },
  'GET /api/reports/seller-suite': ({ user, url }) => {
    const report = visibleSaleReports(user).find((item) => item.id === url.searchParams.get('reportId'));
    if (!report) return fail(404, 'Report not found or access denied');
    return ok(buildSellerReportSuite(report));
  },
  'PUT /api/reports/sale-entry': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const report = store.saleReports.find((item) => item.id === body.reportId);
    const ticket = store.tickets.find((item) => item.id === body.transactionId && item.reportId === report?.id);
    if (!report || !ticket) return fail(404, 'Report entry not found');
    const reason = String(body.reason ?? '').trim();
    if (reason.length < 5) return fail(400, 'Correction reason must contain at least 5 characters');
    const scheme = store.settings.schemes[ticket.scheme];
    const enteredNumber = String(body.enteredNumber ?? ticket.number);
    const quantity = Number(body.quantity ?? ticket.quantity);
    if (!new RegExp(`^\\d{${scheme.length}}$`).test(enteredNumber)) return fail(400, `Number must contain ${scheme.length} digits`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return fail(400, 'Quantity must be between 1 and 1000');
    const changes = [];
    if (enteredNumber !== ticket.number) changes.push(['number', ticket.number, enteredNumber]);
    if (quantity !== ticket.quantity) changes.push(['quantity', ticket.quantity, quantity]);
    if (!changes.length) return fail(400, 'No correction was entered');
    const correctedAt = new Date().toISOString();
    for (const [changedField, oldValue, newValue] of changes) {
      createRecord('reportCorrections', { reportId: report.id, transactionId: ticket.id, changedField, oldValue, newValue, changedBy: user.id, changedAt: correctedAt, reason });
      audit(user.id, 'REPORT_ENTRY_CORRECTED', 'ticket', ticket.id, { reportId: report.id, changedField, oldValue, newValue, reason });
    }
    ticket.number = enteredNumber;
    ticket.quantity = quantity;
    ticket.total = Number(ticket.unitPrice) * quantity;
    ticket.updatedAt = correctedAt;
    ticket.updatedBy = user.id;
    ticket.correctionReason = reason;
    if (report.winningNumber) {
      const result = evaluateTicket(ticket.number, report.winningNumber, prizeSchemeForTicket(ticket), ticket.catalogPattern);
      ticket.prize = result.prize * ticket.quantity;
      ticket.status = result.prize > 0 ? 'WIN' : 'LOSE';
    }
    report.updatedAt = correctedAt;
    report.updatedBy = user.id;
    return ok(buildSaleReport(report));
  },
  'POST /api/tickets': ({ body, user }) => {
    requireOperationalLicense();
    requireRole(user, 'SELLER');
    const values = validateTicket(body, user);
    const expanded = expandBoxTicket(values, body.boxEntry).flatMap(expandAllSchemeTicket);
    if (expanded.length > 100) return fail(400, 'A sale can contain maximum 100 expanded entries');
    const records = expanded.map((item) => createTicket(user.id, item));
    const bill = createBill(user.id, records);
    const total = records.reduce((sum, item) => sum + item.total, 0);
    audit(user.id, 'TICKET_SOLD', 'bill', bill.id, { billNumber: bill.billNumber, ticketIds: records.map((item) => item.id), total });
    return created(records.length === 1 ? { ...records[0], bill: buildBill(bill) } : { bill: buildBill(bill), tickets: records, itemCount: records.length, quantity: records.reduce((sum, item) => sum + item.quantity, 0), total });
  },
  'POST /api/tickets/batch': ({ body, user }) => {
    requireOperationalLicense();
    requireRole(user, 'SELLER');
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) return fail(400, 'Bill must contain between 1 and 100 items');
    if (new Set(body.items.map((item) => item.boardId)).size !== 1) return fail(400, 'A bill can contain tickets from only one Lot Code');
    if (new Set(body.items.map((item) => item.showId ?? '')).size !== 1) return fail(400, 'A bill can contain tickets from only one Show');
    const values = body.items.flatMap((item) => expandBoxTicket(validateTicket(item, user), item.boxEntry).flatMap(expandAllSchemeTicket));
    if (values.length > 100) return fail(400, 'A bill can contain maximum 100 expanded entries');
    const records = values.map((item) => createTicket(user.id, item));
    const bill = createBill(user.id, records);
    const total = records.reduce((sum, item) => sum + item.total, 0);
    audit(user.id, 'BILL_SETTLED', 'bill', bill.id, { billNumber: bill.billNumber, ticketIds: records.map((item) => item.id), total });
    return created({ bill: buildBill(bill), tickets: records, itemCount: records.length, quantity: records.reduce((sum, item) => sum + item.quantity, 0), total });
  },
  'GET /api/draws': () => ok([...store.draws].reverse()),
  'POST /api/reports/result-preview': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    if (!/^\d{4}$/.test(String(body.winningNumber))) return fail(400, 'Winning number must contain four digits');
    const scope = validateResultScope(body);
    validateResultPublishTime(scope);
    return ok(buildResultPreview(String(body.winningNumber), scope));
  },
  'GET /api/reports/result-candidates': ({ user, url }) => {
    requireRole(user, 'SUPER_ADMIN');
    const suppliedScope = url.searchParams.get('boardId') && url.searchParams.get('showId') && url.searchParams.get('resultDate');
    if (!suppliedScope) return ok({ candidates: [], availableUniqueNumbers: 0 });
    const scope = validateResultScope(Object.fromEntries(url.searchParams));
    const scopedTickets = store.tickets.filter((ticket) => ticketMatchesResultScope(ticket, scope));
    const candidates = [...new Set(scopedTickets
      .filter((ticket) => store.settings.schemes[ticket.scheme]?.length === 4)
      .map((ticket) => ticket.number))]
      .map((number) => buildResultPreview(number, scope))
      .sort((left, right) => right.projectedProfit - left.projectedProfit || left.winningNumber.localeCompare(right.winningNumber))
      .slice(0, 10);
    return ok({ candidates, availableUniqueNumbers: new Set(scopedTickets.filter((ticket) => store.settings.schemes[ticket.scheme]?.length === 4).map((ticket) => ticket.number)).size });
  },
  'POST /api/draws': ({ body, user }) => {
    requireOperationalLicense();
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'result');
    if (!/^\d{4}$/.test(String(body.winningNumber))) return fail(400, 'Winning number must contain four digits');
    const scope = validateResultScope(body);
    if (store.draws.some((draw) => draw.boardId === scope.boardId && draw.showId === scope.showId && draw.resultDate === scope.resultDate)) return fail(409, 'Result is already published and permanently locked for this Lot Code, Show, and date');
    const preview = buildResultPreview(String(body.winningNumber), scope);
    const overrideBelowTarget = body.overrideBelowTarget === true || body.overrideBelowTarget === 'on';
    const overrideReason = String(body.overrideReason ?? '').trim();
    if (!preview.meetsMinimumProfit && !overrideBelowTarget) return fail(409, 'Minimum profit target is not met. Preview another result or use the audited Super Admin override.');
    if (!preview.meetsMinimumProfit && overrideReason.length < 5) return fail(400, 'Enter a clear override reason');
    const draw = createRecord('draws', { winningNumber: String(body.winningNumber), ...scope, publishedBy: user.id, status: 'PUBLISHED', locked: true, belowTargetOverride: !preview.meetsMinimumProfit, overrideReason: !preview.meetsMinimumProfit ? overrideReason : null });
    for (const ticket of store.tickets.filter((item) => ticketMatchesResultScope(item, scope))) {
      const result = evaluateTicket(ticket.number, draw.winningNumber, prizeSchemeForTicket(ticket), ticket.catalogPattern);
      ticket.drawId = draw.id; ticket.prize = result.prize * ticket.quantity; ticket.status = result.prize > 0 ? 'WIN' : 'LOSE';
    }
    for (const report of store.saleReports.filter((item) => reportMatchesResultScope(item, scope))) {
      report.drawId = draw.id; report.winningNumber = draw.winningNumber; report.status = 'FINALIZED'; report.finalizedAt = new Date().toISOString();
    }
    audit(user.id, !preview.meetsMinimumProfit ? 'DRAW_PUBLISHED_WITH_TARGET_OVERRIDE' : 'DRAW_PUBLISHED_AND_LOCKED', 'draw', draw.id, { ...scope, overrideReason: draw.overrideReason });
    broadcast({ event: 'draw.published', draw });
    return created({ draw, preview, belowTarget: !preview.meetsMinimumProfit });
  },
  'GET /api/reports/weekly-accounts': ({ user, url }) => {
    requireRole(user, 'SUPER_ADMIN');
    return ok(buildWeeklyAccounts(url.searchParams.get('weekStart') || undefined));
  },
  'GET /api/reports/distributor-weekly': ({ user, url }) => {
    requireRole(user, 'DISTRIBUTOR');
    return ok(buildDistributorAccounts(user, url.searchParams.get('weekStart') || undefined));
  },
  'POST /api/seller-payments': ({ body, user }) => {
    requireRole(user, 'DISTRIBUTOR');
    const seller = store.users.find((item) => item.id === body.sellerId && item.parentId === user.id && item.role === 'SELLER');
    if (!seller) return fail(404, 'Seller not found');
    const range = weekRange(body.weekStart);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, 'Received amount must be greater than zero');
    const payment = createRecord('weeklyPayments', { distributorId: seller.id, accountRole: 'SELLER', ownerId: user.id, weekStart: range.weekStart, weekEnd: range.weekEnd, amount, reference: String(body.reference ?? '').trim().slice(0, 100), receivedBy: user.id });
    audit(user.id, 'SELLER_PAYMENT_RECORDED', 'weeklyPayment', payment.id, { sellerId: seller.id, weekStart: range.weekStart, amount });
    return created({ payment, accounts: buildDistributorAccounts(user, range.weekStart) });
  },
  'POST /api/weekly-payments': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const account = store.users.find((item) => item.id === body.distributorId && item.parentId === user.id && ['DISTRIBUTOR', 'SELLER'].includes(item.role));
    if (!account) return fail(404, 'Distributor or direct seller not found');
    const range = weekRange(body.weekStart);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, 'Received amount must be greater than zero');
    const payment = createRecord('weeklyPayments', { distributorId: account.id, accountRole: account.role, weekStart: range.weekStart, weekEnd: range.weekEnd, amount, reference: String(body.reference ?? '').trim().slice(0, 100), receivedBy: user.id });
    audit(user.id, 'WEEKLY_PAYMENT_RECORDED', 'weeklyPayment', payment.id, { accountId: account.id, accountRole: account.role, weekStart: range.weekStart, amount });
    return created({ payment, accounts: buildWeeklyAccounts(range.weekStart) });
  },
  'POST /api/daily-expenses': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    requireActionPassword(body, user, 'management');
    const expenseDate = String(body.expenseDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || Number.isNaN(Date.parse(`${expenseDate}T00:00:00+05:30`))) return fail(400, 'Select a valid expense date');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, 'Expense amount must be greater than zero');
    const expense = createRecord('dailyExpenses', { expenseDate, amount, note: String(body.note ?? '').trim().slice(0, 150), recordedBy: user.id });
    audit(user.id, 'DAILY_EXPENSE_RECORDED', 'dailyExpense', expense.id, { expenseDate, amount });
    return created({ expense, accounts: buildWeeklyAccounts(expenseDate) });
  },
  'GET /api/dashboard': ({ user }) => ok(buildDashboard(user)),
  'PUT /api/security/action-passwords': ({ body, user }) => {
    requireRole(user, 'SUPER_ADMIN');
    const account = store.users.find((item) => item.id === user.id);
    if (!verifyPassword(String(body.currentPassword ?? ''), account.passwordHash)) return fail(403, 'Current Super Admin password is incorrect');
    const resultPassword = String(body.resultPassword ?? '');
    const managementPassword = String(body.managementPassword ?? '');
    if (resultPassword.length < 8 || managementPassword.length < 8) return fail(400, 'Each security password must contain at least 8 characters');
    store.security.resultPasswordHash = hashPassword(resultPassword);
    store.security.managementPasswordHash = hashPassword(managementPassword);
    audit(user.id, 'ACTION_PASSWORDS_UPDATED', 'security', null, {});
    return ok({ resultPasswordConfigured: true, managementPasswordConfigured: true });
  },
  'GET /api/audit': ({ user }) => { requireRole(user, 'SUPER_ADMIN'); return ok([...store.audit].reverse().slice(0, 100)); }
};

function updateSchemePrizes(values) {
  const mapping = {
    FOUR_EXACT: ['FOUR_DIGIT', 'prizes', 'four'], FOUR_LAST3: ['FOUR_DIGIT', 'prizes', 'three'],
    FOUR_LAST2: ['FOUR_DIGIT', 'prizes', 'two'], FOUR_LAST1: ['FOUR_DIGIT', 'prizes', 'one'],
    THREE_EXACT: ['THREE_DIGIT', 'prizes', 'three'], THREE_LAST2: ['THREE_DIGIT', 'prizes', 'two'],
    THREE_LAST1: ['THREE_DIGIT', 'prizes', 'one'], TWO_STANDARD: ['TWO_DIGIT_STANDARD', 'prize'],
    TWO_PREMIUM: ['TWO_DIGIT_PREMIUM', 'prize'], ONE_STANDARD: ['ONE_DIGIT_STANDARD', 'prize'],
    ONE_PREMIUM: ['ONE_DIGIT_PREMIUM', 'prize']
  };
  for (const [key, path] of Object.entries(mapping)) {
    if (!(key in values)) continue;
    const amount = Number(values[key]);
    if (!Number.isFinite(amount) || amount < 0) { const error = new Error(`${key} prize must be a non-negative amount`); error.status = 400; throw error; }
    if (path.length === 3) store.settings.schemes[path[0]][path[1]][path[2]] = amount;
    else store.settings.schemes[path[0]][path[1]] = amount;
  }
}

function validateDistributorSchemes(input) {
  const allowed = ['FOUR_EXACT', 'FOUR_LAST3', 'FOUR_LAST2', 'FOUR_LAST1', 'THREE_EXACT', 'THREE_LAST2', 'THREE_LAST1', 'TWO_STANDARD', 'TWO_PREMIUM', 'ONE_STANDARD', 'ONE_PREMIUM'];
  if (!input || typeof input !== 'object') { const error = new Error('Select at least one scheme and rate'); error.status = 400; throw error; }
  const selected = Object.fromEntries(allowed.filter((key) => input[key]?.enabled === true).map((key) => {
    const rate = Number(input[key].rate);
    if (!Number.isFinite(rate) || rate < store.settings.baseRate) { const error = new Error(`${key} rate cannot be below base rate ${store.settings.baseRate}`); error.status = 400; throw error; }
    return [key, { enabled: true, rate }];
  }));
  if (!Object.keys(selected).length) { const error = new Error('Select at least one distributor scheme'); error.status = 400; throw error; }
  return selected;
}

function validateDistributorLotAssignment(lotCodeId, input) {
  const board = store.settings.boards.find((item) => item.id === lotCodeId && item.enabled);
  if (!board) { const error = new Error('Select an available Lot Code'); error.status = 400; throw error; }
  if (!input || typeof input !== 'object') { const error = new Error('Select at least one scheme and rate'); error.status = 400; throw error; }
  const selected = {};
  for (const scheme of store.settings.schemeCatalog.filter((item) => item.enabled && board.schemeIds.includes(item.id))) {
    if (!scheme.universal && input[scheme.id]?.enabled !== true) continue;
    const rate = scheme.universal ? Number(scheme.mrp ?? scheme.defaultRate) : Number(input[scheme.id].rate);
    const minimumRate = Math.max(Number(store.settings.baseRate), Number(scheme.minimumRate ?? 0));
    if (!Number.isFinite(rate) || rate < minimumRate) { const error = new Error(`${scheme.name} rate cannot be below minimum price ${minimumRate}`); error.status = 400; throw error; }
    selected[scheme.id] = { enabled: true, rate };
  }
  if (!Object.keys(selected).length) { const error = new Error('Select at least one scheme for this Lot Code'); error.status = 400; throw error; }
  return { lotCodeId: board.id, lotCodeIds: [board.id], lotCodeSchemeRates: { [board.id]: selected }, catalogSchemeRates: selected };
}

function validateGraceMinutes(input = {}) {
  return Object.fromEntries(['show1', 'show2', 'show3', 'show4', 'show5'].map((id) => {
    const minutes = Number(input?.[id] ?? 0);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) { const error = new Error('Grace time must be between 0 and 60 minutes'); error.status = 400; throw error; }
    return [id, minutes];
  }));
}

function mergeCatalogSchemeRates(assignments = {}) {
  const merged = {};
  for (const rates of Object.values(assignments)) for (const [id, item] of Object.entries(rates)) {
    if (!merged[id] || Number(item.rate) < Number(merged[id].rate)) merged[id] = item;
  }
  return merged;
}

function deriveNumberTypeRates(catalogRates) {
  const selected = store.settings.schemeCatalog.filter((item) => catalogRates[item.id]?.enabled);
  const lowestRate = (field) => Math.min(...selected.filter((item) => Number(item[field]) > 0).map((item) => Number(catalogRates[item.id].rate)));
  const rates = {};
  for (const [field, key] of [['fourDigitPrize', 'FOUR_EXACT'], ['threeDigitPrize', 'THREE_EXACT'], ['twoDigitPrize', 'TWO_STANDARD'], ['singleDigitPrize', 'ONE_STANDARD']]) {
    const rate = lowestRate(field);
    if (Number.isFinite(rate)) rates[key] = { enabled: true, rate };
  }
  return rates;
}

function validateTicket(body, user) {
  const board = store.settings.boards.find((item) => item.id === body.boardId && item.enabled);
  if (!board) { const error = new Error('Select an available board'); error.status = 400; throw error; }
  const accessOwner = assignedAccessOwner(user);
  const assignedLotCodes = accessOwner?.lotCodeIds ?? (accessOwner?.lotCodeId ? [accessOwner.lotCodeId] : []);
  if (accessOwner && !assignedLotCodes.includes(board.id)) { const error = new Error('This Lot Code is not assigned to this Seller network'); error.status = 403; throw error; }
  const activeSchedule = validateSellingWindow(board, accessOwner, body.showId);
  const businessDate = localDateKey();
  const sellingShowId = activeSchedule?.id ?? 'all-day';
  if (store.draws.some((draw) => draw.boardId === board.id && draw.showId === sellingShowId && draw.resultDate === businessDate)) { const error = new Error('Result is already published and ticket entry is permanently closed for this Lot Code and Show'); error.status = 409; throw error; }
  const catalogScheme = store.settings.schemeCatalog.find((item) => item.id === body.catalogSchemeId && item.enabled && board.schemeIds.includes(item.id));
  if (!catalogScheme) { const error = new Error('This scheme is not assigned to the selected board'); error.status = 403; throw error; }
  if (accessOwner && !accessOwner.lotCodeSchemeRates?.[board.id]?.[catalogScheme.id]?.enabled) { const error = new Error('This scheme is not assigned for this Lot Code'); error.status = 403; throw error; }
  const scheme = store.settings.schemes[body.scheme];
  if (!scheme || scheme.enabled === false) { const error = new Error('Scheme is unavailable'); error.status = 400; throw error; }
  if (catalogScheme.id === 'scheme-all-single' && scheme.type !== 'ONE_DIGIT') { const error = new Error('ALL SINGLE requires Single Digit number type'); error.status = 400; throw error; }
  if (catalogScheme.id === 'scheme-all-doubles' && scheme.type !== 'TWO_DIGIT') { const error = new Error('ALL DOUBLES requires 2 Digit number type'); error.status = 400; throw error; }
  if (!Object.hasOwn(visibleSchemes(user), body.scheme)) { const error = new Error('This scheme is not assigned to your distributor'); error.status = 403; throw error; }
  const requiredType = ['A', 'B', 'C'].includes(catalogScheme.pattern) ? 'ONE_DIGIT' : ['AB', 'AC', 'BC'].includes(catalogScheme.pattern) ? 'TWO_DIGIT' : catalogScheme.pattern === 'ABC' ? 'THREE_DIGIT' : catalogScheme.pattern === 'DABC' ? 'FOUR_DIGIT' : null;
  if (requiredType && scheme.type !== requiredType) { const error = new Error(`${catalogScheme.name} requires ${requiredType.replace('_', ' ')} entry`); error.status = 400; throw error; }
  if (!new RegExp(`^\\d{${scheme.length}}$`).test(String(body.number))) { const error = new Error(`Ticket number must contain ${scheme.length} digits`); error.status = 400; throw error; }
  const quantity = Number(body.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) { const error = new Error('Quantity must be between 1 and 1000'); error.status = 400; throw error; }
  const unitPrice = Number(catalogScheme.mrp ?? catalogScheme.defaultRate ?? store.settings.pricing.customerRate);
  const distributorRate = Number(accessOwner?.lotCodeSchemeRates?.[board.id]?.[catalogScheme.id]?.rate ?? catalogScheme.mrp ?? catalogScheme.defaultRate ?? unitPrice);
  const sellerAccount = store.users.find((item) => item.id === user.id);
  const rateSnapshot = { customerPrice: unitPrice, distributorRate, minimumRate: Number(catalogScheme.minimumRate ?? 0), sellerCommissionPercentage: Number(sellerAccount?.commissionPercentage ?? 0) };
  const prizeSnapshot = { four: Number(catalogScheme.fourDigitPrize ?? 0), three: Number(catalogScheme.threeDigitPrize ?? 0), two: Number(catalogScheme.twoDigitPrize ?? 0), one: Number(catalogScheme.singleDigitPrize ?? 0) };
  return { boardId: board.id, boardName: board.name, showId: activeSchedule?.id ?? null, showLabel: activeSchedule?.label ?? null, catalogSchemeId: catalogScheme.id, catalogSchemeName: catalogScheme.name, catalogPattern: catalogScheme.pattern, number: String(body.number), scheme: body.scheme, quantity, unitPrice, rateSnapshot, prizeSnapshot };
}
function validateSellingWindow(board, distributor, requestedShowId) {
  const schedules = (board.schedules ?? []).filter((item) => item.enabled);
  if (!schedules.length) return null;
  const currentMinutes = minutesInTimeZone();
  const grace = distributor?.lotCodeGraceMinutes?.[board.id] ?? {};
  if (requestedShowId && !schedules.some((item) => item.id === requestedShowId)) { const error = new Error('Select a valid Show for this Lot Code'); error.status = 400; throw error; }
  const open = findOpenSchedule(schedules, currentMinutes, grace, requestedShowId || null);
  if (!open) { const error = new Error(requestedShowId ? 'Entry is closed for the selected Show' : 'Ticket entry is closed for this Lot Code at the current time'); error.status = 409; throw error; }
  return open;
}
function expandAllSchemeTicket(values) {
  if (values.catalogSchemeId === 'scheme-all-single') return ['A', 'B', 'C'].map((catalogPattern) => ({ ...values, catalogPattern, catalogSchemeName: `1${catalogPattern}` }));
  if (values.catalogSchemeId === 'scheme-all-doubles') return ['AB', 'AC', 'BC'].map((catalogPattern) => ({ ...values, catalogPattern, catalogSchemeName: `2${catalogPattern}` }));
  return [values];
}
function expandBoxTicket(values, boxEntry) {
  if (!(boxEntry === true || boxEntry === 'true') || values.number.length < 2) return [values];
  const output = new Set();
  const visit = (prefix, remaining) => {
    if (!remaining.length) { output.add(prefix); return; }
    for (let index = 0; index < remaining.length; index += 1) visit(prefix + remaining[index], remaining.slice(0, index) + remaining.slice(index + 1));
  };
  visit('', values.number);
  return [...output].map((number) => ({ ...values, number, boxEntry: true }));
}
function createTicket(sellerId, values) {
  const unitPrice = Number(values.unitPrice);
  const businessDate = localDateKey();
  const report = ensureSaleReport(sellerId, { ...values, businessDate });
  const transactionSequence = store.tickets.filter((item) => item.reportId === report.id).length + 1;
  return createRecord('tickets', { ...values, businessDate, unitPrice, total: values.quantity * unitPrice, sellerId, reportId: report.id, transactionSequence, drawId: null, prize: 0, status: 'ACTIVE' });
}

function createBill(sellerId, tickets) {
  const first = tickets[0];
  const businessDate = first.businessDate;
  const sequence = store.bills.filter((item) => item.businessDate === businessDate).length + 1;
  const boardCode = store.settings.boards.find((item) => item.id === first.boardId)?.code ?? first.boardId.toUpperCase();
  const showHour = String(first.showLabel ?? '').match(/\b(\d{1,2})(?::\d{2})?\s*PM\b/i)?.[1] ?? (first.showId === 'all-day' ? '' : String(first.showId ?? '').replace(/\D/g, ''));
  const date = new Date(`${businessDate}T12:00:00+05:30`);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(date).toUpperCase();
  const day = businessDate.slice(-2);
  const billNumber = `${boardCode}${showHour}-${day}-${weekday}-${String(sequence).padStart(4, '0')}`;
  const bill = createRecord('bills', { billNumber, sequence, sellerId, reportId: first.reportId, boardId: first.boardId, boardCode, showId: first.showId ?? 'all-day', showLabel: first.showLabel ?? 'All Day', businessDate, ticketIds: tickets.map((item) => item.id), totalQuantity: tickets.reduce((sum, item) => sum + item.quantity, 0), total: tickets.reduce((sum, item) => sum + item.total, 0), status: 'SAVED' });
  for (const ticket of tickets) ticket.billId = bill.id;
  return bill;
}

function buildBill(bill) {
  const items = store.tickets.filter((item) => item.billId === bill.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((item) => ({ transactionId: item.id, boardCode: bill.boardCode, showLabel: bill.showLabel, scheme: item.catalogSchemeName ?? item.scheme, number: item.number, quantity: item.quantity, amount: item.total }));
  return { ...bill, items };
}

function reportCode(report) {
  const date = String(report.businessDate).replaceAll('-', '');
  return `REP-${date}-${report.boardCode}-${report.showId}-${report.sellerId.slice(-6)}`.toUpperCase();
}
function distributorForSeller(sellerId) {
  let account = store.users.find((item) => item.id === sellerId);
  while (account?.parentId) {
    account = store.users.find((item) => item.id === account.parentId);
    if (account?.role === 'DISTRIBUTOR') return account;
  }
  return null;
}
function ensureSaleReport(sellerId, values) {
  const showId = values.showId ?? 'all-day';
  let report = store.saleReports.find((item) => item.sellerId === sellerId && item.boardId === values.boardId && item.showId === showId && item.businessDate === values.businessDate);
  if (report) return report;
  const seller = store.users.find((item) => item.id === sellerId);
  const distributor = distributorForSeller(sellerId);
  report = createRecord('saleReports', { sellerId, sellerName: seller?.name ?? sellerId, distributorId: distributor?.id ?? null, distributorName: distributor?.name ?? 'Super Admin Direct', boardId: values.boardId, boardCode: store.settings.boards.find((item) => item.id === values.boardId)?.code ?? values.boardId, showId, showLabel: values.showLabel ?? 'All Day', businessDate: values.businessDate, status: 'OPEN', winningNumber: null, drawId: null });
  report.reportId = reportCode(report);
  return report;
}

function migrateLegacyReports() {
  for (const ticket of store.tickets) {
    const values = { ...ticket, businessDate: ticket.businessDate ?? localDateKey(ticket.createdAt) };
    const report = ensureSaleReport(ticket.sellerId, values);
    ticket.reportId ??= report.id;
    ticket.transactionSequence ??= store.tickets.filter((item) => item.reportId === report.id && item.createdAt <= ticket.createdAt).length;
    const draw = store.draws.find((item) => item.id === ticket.drawId);
    if (draw) { report.drawId = draw.id; report.winningNumber = draw.winningNumber; report.status = 'FINALIZED'; report.finalizedAt ??= draw.createdAt; }
  }
}

function reportMatchesResultScope(report, scope) {
  return report.boardId === scope.boardId && report.showId === scope.showId && report.businessDate === scope.resultDate;
}
function visibleSaleReports(user) {
  if (user.role === 'SUPER_ADMIN') return store.saleReports;
  if (user.role === 'SELLER') return store.saleReports.filter((item) => item.sellerId === user.id);
  return [];
}
function reportSummary(report) {
  const entries = store.tickets.filter((item) => item.reportId === report.id);
  return { ...report, entryCount: entries.length, totalQuantity: entries.reduce((sum, item) => sum + item.quantity, 0), totalSales: entries.reduce((sum, item) => sum + item.total, 0), totalPrize: entries.reduce((sum, item) => sum + item.prize, 0) };
}
function buildSaleReport(report) {
  const seller = store.users.find((item) => item.id === report.sellerId);
  const distributor = store.users.find((item) => item.id === report.distributorId);
  const corrections = store.reportCorrections.filter((item) => item.reportId === report.id);
  const entries = store.tickets.filter((item) => item.reportId === report.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((ticket) => {
    const bill = store.bills.find((item) => item.id === ticket.billId);
    const result = report.winningNumber ? evaluateTicket(ticket.number, report.winningNumber, prizeSchemeForTicket(ticket), ticket.catalogPattern) : { prize: 0, match: null };
    const unitPrize = Number(result.prize ?? 0);
    const prizeAmount = unitPrize * ticket.quantity;
    const ratedAmount = Number(ticket.rateSnapshot?.distributorRate ?? ticket.unitPrice) * ticket.quantity;
    const margin = Math.max(0, Number(ticket.total) - ratedAmount);
    const bonusPercentage = Number(ticket.rateSnapshot?.sellerCommissionPercentage ?? seller?.commissionPercentage ?? 0);
    const bonusAmount = Math.round(margin * bonusPercentage) / 100;
    return { transactionId: ticket.id, sequence: ticket.transactionSequence, timestamp: ticket.createdAt, date: ticket.businessDate ?? localDateKey(ticket.createdAt), time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ticket.createdAt)), billNumber: bill?.billNumber ?? '—', scheme: ticket.catalogSchemeName ?? ticket.scheme, enteredNumber: ticket.number, quantity: ticket.quantity, rate: Number(ticket.unitPrice), winningNumber: report.winningNumber, matchRule: result.match, unitPrize, prizeAmount, saleAmount: ticket.total, bonusPercentage, bonusAmount, netAmount: Number(ticket.total) - bonusAmount - prizeAmount, corrected: corrections.some((item) => item.transactionId === ticket.id) };
  });
  return { ...reportSummary(report), totalBonus: entries.reduce((sum, item) => sum + item.bonusAmount, 0), totalNet: entries.reduce((sum, item) => sum + item.netAmount, 0), seller: { id: report.sellerId, name: seller?.name ?? report.sellerName }, distributor: { id: report.distributorId, name: distributor?.name ?? report.distributorName }, entries, corrections: corrections.sort((a, b) => b.changedAt.localeCompare(a.changedAt)) };
}

function buildSellerReportSuite(report) {
  const detail = buildSaleReport(report);
  const tickets = store.tickets.filter((item) => item.reportId === report.id);
  const grouped = new Map();
  for (const ticket of tickets) {
    const name = ticket.catalogSchemeName ?? ticket.scheme;
    const row = grouped.get(name) ?? { scheme: name, quantity: 0, amount: 0, winning: 0 };
    row.quantity += ticket.quantity;
    row.amount += ticket.total;
    row.winning += ticket.prize;
    grouped.set(name, row);
  }
  const itemReport = [...grouped.values()].sort((a, b) => a.scheme.localeCompare(b.scheme));
  const winningReport = itemReport.filter((item) => item.winning > 0);
  const bills = store.bills.filter((item) => item.reportId === report.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((bill) => {
    const billTickets = tickets.filter((ticket) => ticket.billId === bill.id);
    return { billNumber: bill.billNumber, time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(bill.createdAt)), quantity: bill.totalQuantity, amount: bill.total, prize: billTickets.reduce((sum, ticket) => sum + ticket.prize, 0) };
  });
  const totalQuantity = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
  const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
  const totalPrize = tickets.reduce((sum, ticket) => sum + ticket.prize, 0);
  return {
    report: detail,
    menu: ['ENTRY', 'ITEM', 'SALES', 'WINNING', 'PAYMENT', 'BILL_WINNING', 'SUMMARY'],
    entryReport: detail.entries,
    itemReport,
    salesReport: { entryRows: tickets.length, quantity: totalQuantity, amount: totalSales },
    winningReport,
    paymentReport: { sales: totalSales, prize: totalPrize, balance: totalSales - totalPrize },
    billWinningReport: bills,
    summaryReport: { quantity: totalQuantity, sales: totalSales, prize: totalPrize, balance: totalSales - totalPrize, winningEntries: tickets.filter((ticket) => ticket.prize > 0).length, losingEntries: tickets.filter((ticket) => ticket.status === 'LOSE').length }
  };
}

function assignedDistributor(user) {
  let account = store.users.find((item) => item.id === user.id);
  while (account && account.role !== 'DISTRIBUTOR') account = store.users.find((item) => item.id === account.parentId);
  return account?.role === 'DISTRIBUTOR' ? account : null;
}
function assignedAccessOwner(user) {
  const distributor = assignedDistributor(user);
  if (distributor) return distributor;
  const account = store.users.find((item) => item.id === user.id);
  return account?.role === 'SELLER' && account.lotCodeSchemeRates ? account : null;
}
function assignedSchemeRates(user) {
  if (user.role === 'SUPER_ADMIN') return {};
  return assignedAccessOwner(user)?.schemeRates ?? {};
}
function assignedCatalogSchemeRates(user) {
  if (user.role === 'SUPER_ADMIN') return {};
  const owner = assignedAccessOwner(user);
  if (!owner) return {};
  const lotRates = Object.values(owner.lotCodeSchemeRates ?? {});
  return lotRates.length ? Object.assign({}, ...lotRates) : (owner.catalogSchemeRates ?? {});
}
function visibleSchemes(user) {
  const rates = assignedSchemeRates(user);
  const allowed = new Set();
  if (Object.keys(rates).some((key) => key.startsWith('FOUR_'))) allowed.add('FOUR_DIGIT');
  if (Object.keys(rates).some((key) => key.startsWith('THREE_'))) allowed.add('THREE_DIGIT');
  if (rates.TWO_STANDARD) allowed.add('TWO_DIGIT_STANDARD');
  if (rates.TWO_PREMIUM) allowed.add('TWO_DIGIT_PREMIUM');
  if (rates.ONE_STANDARD) allowed.add('ONE_DIGIT_STANDARD');
  if (rates.ONE_PREMIUM) allowed.add('ONE_DIGIT_PREMIUM');
  return Object.fromEntries(Object.entries(store.settings.schemes).filter(([key]) => allowed.has(key)));
}

function localDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function resultShows(board) {
  const schedules = (board.schedules ?? []).filter((item) => item.enabled);
  return schedules.length ? schedules : [{ id: 'all-day', label: 'All Day' }];
}

function validateResultScope(body) {
  const board = store.settings.boards.find((item) => item.id === String(body.boardId) && item.enabled);
  if (!board) { const error = new Error('Select a valid Lot Code'); error.status = 400; throw error; }
  const show = resultShows(board).find((item) => item.id === String(body.showId));
  if (!show) { const error = new Error('Select a valid Show for this Lot Code'); error.status = 400; throw error; }
  const resultDate = String(body.resultDate ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resultDate) || Number.isNaN(Date.parse(`${resultDate}T00:00:00+05:30`))) { const error = new Error('Select a valid Result date'); error.status = 400; throw error; }
  return { boardId: board.id, boardCode: board.code, boardName: board.name, showId: show.id, showLabel: show.label, resultDate };
}

function validateResultPublishTime(scope) {
  const board = store.settings.boards.find((item) => item.id === scope.boardId);
  const show = (board?.schedules ?? []).find((item) => item.id === scope.showId);
  const currentDate = localDateKey();
  const currentMinutes = minutesInTimeZone();
  const maximumGrace = Math.max(0, ...store.users.filter((item) => item.role === 'SELLER' && item.parentId === 'admin-1' && (item.lotCodeIds ?? []).includes(scope.boardId)).map((item) => Number(item.lotCodeGraceMinutes?.[scope.boardId]?.[scope.showId] ?? 0)));
  if (resultPublishReady(show, scope.resultDate, currentDate, currentMinutes, maximumGrace)) return;
  const error = new Error(scope.resultDate > currentDate ? 'A future Result date cannot be published' : `Result can be published only one minute after ${show?.label ?? 'the Show'} entry closes`);
  error.status = 409;
  throw error;
}

function ticketMatchesResultScope(ticket, scope) {
  if (!scope || ticket.status !== 'ACTIVE') return false;
  const ticketShowId = ticket.showId ?? 'all-day';
  const ticketDate = ticket.businessDate ?? localDateKey(ticket.createdAt);
  return ticket.boardId === scope.boardId && ticketShowId === scope.showId && ticketDate === scope.resultDate;
}

function prizeSchemeForTicket(ticket) {
  const base = store.settings.schemes[ticket.scheme] ?? {};
  if (ticket.prizeSnapshot) {
    if (base.type === 'FOUR_DIGIT') return { ...base, prizes: { ...ticket.prizeSnapshot } };
    if (base.type === 'THREE_DIGIT') return { ...base, prizes: { three: ticket.prizeSnapshot.three, two: ticket.prizeSnapshot.two, one: ticket.prizeSnapshot.one } };
    if (base.type === 'TWO_DIGIT') return { ...base, prize: ticket.prizeSnapshot.two };
    if (base.type === 'ONE_DIGIT') return { ...base, prize: ticket.prizeSnapshot.one };
  }
  const catalog = store.settings.schemeCatalog.find((item) => item.id === ticket.catalogSchemeId);
  if (!catalog) return base;
  if (base.type === 'FOUR_DIGIT') return { ...base, prizes: { four: Number(catalog.fourDigitPrize ?? 0), three: Number(catalog.threeDigitPrize ?? 0), two: Number(catalog.twoDigitPrize ?? 0), one: Number(catalog.singleDigitPrize ?? 0) } };
  if (base.type === 'THREE_DIGIT') return { ...base, prizes: { three: Number(catalog.threeDigitPrize ?? 0), two: Number(catalog.twoDigitPrize ?? 0), one: Number(catalog.singleDigitPrize ?? 0) } };
  if (base.type === 'TWO_DIGIT') return { ...base, prize: Number(catalog.twoDigitPrize ?? 0) };
  if (base.type === 'ONE_DIGIT') return { ...base, prize: Number(catalog.singleDigitPrize ?? 0) };
  return base;
}

function buildResultPreview(winningNumber, scope) {
  const tickets = store.tickets.filter((ticket) => ticketMatchesResultScope(ticket, scope));
  const quantity = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
  const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
  const totalPrizes = tickets.reduce((sum, ticket) => {
    const result = evaluateTicket(ticket.number, winningNumber, prizeSchemeForTicket(ticket), ticket.catalogPattern);
    return sum + result.prize * ticket.quantity;
  }, 0);
  const distributorCollection = tickets.reduce((sum, ticket) => sum + Number(ticket.rateSnapshot?.distributorRate ?? ticket.unitPrice) * ticket.quantity, 0);
  const expectedCost = tickets.reduce((sum, ticket) => sum + Number(ticket.rateSnapshot?.minimumRate ?? 0) * ticket.quantity, 0);
  const adminMargin = distributorCollection;
  const projectedProfit = distributorCollection - totalPrizes;
  const baseCost = expectedCost;
  const profitPercentage = baseCost > 0 ? projectedProfit / baseCost * 100 : 0;
  const minimum = store.settings.minimumProfit;
  const meetsMinimumProfit = quantity === 0 || (minimum.mode === 'PERCENTAGE' ? profitPercentage >= minimum.value : projectedProfit >= minimum.value);
  return {
    winningNumber,
    ticketQuantity: quantity,
    totalSales,
    adminMargin,
    baseCost,
    totalPrizes,
    projectedProfit,
    profitPercentage: Math.round(profitPercentage * 100) / 100,
    minimumProfit: minimum,
    minimumProfitLabel: minimum.mode === 'PERCENTAGE' ? `${minimum.value}%` : `INR ${minimum.value}`,
    meetsMinimumProfit,
    status: projectedProfit > 0 ? 'PROFIT' : projectedProfit < 0 ? 'LOSS' : 'BREAK_EVEN',
    boardId: scope.boardId, showId: scope.showId, resultDate: scope.resultDate,
    directSellerOutcomes: buildDirectSellerPerformance(winningNumber, scope)
  };
}

function buildDashboard(user) {
  const tickets = visibleTickets(user);
  const quantity = tickets.reduce((sum, item) => sum + item.quantity, 0);
  const sales = tickets.reduce((sum, item) => sum + item.total, 0);
  const prizes = tickets.reduce((sum, item) => sum + item.prize, 0);
  const profits = calculateTierProfits({ quantity, ...store.settings.pricing, totalPrizes: prizes });
  const key = { SUPER_ADMIN: 'admin', DISTRIBUTOR: 'distributor', SELLER: 'seller' }[user.role];
  const rule = store.bonusRules.find((item) => item.beneficiaryId === user.id);
  const bonus = calculateBonus(sales, profits[key] ?? 0, rule ?? {});
  return {
    role: user.role, quantity, sales, prizes, grossProfit: profits[key] ?? 0, bonus,
    latestDraw: latestVisibleDraw(user),
    minimumProfit: store.settings.minimumProfit,
    customerRate: user.role === 'SELLER' ? store.settings.pricing.customerRate : undefined,
    assignedSchemeRates: user.role === 'SUPER_ADMIN' ? undefined : assignedSchemeRates(user),
    assignedCatalogSchemeRates: user.role === 'SUPER_ADMIN' ? undefined : assignedCatalogSchemeRates(user),
    lotCodeSchemeRates: user.role === 'DISTRIBUTOR' ? (store.users.find((item) => item.id === user.id)?.lotCodeSchemeRates ?? {}) : undefined,
    schemeSettings: user.role === 'SUPER_ADMIN' ? store.settings.schemes : undefined,
    schemeCatalog: store.settings.schemeCatalog.filter((item) => item.enabled && (user.role === 'SUPER_ADMIN' || assignedCatalogSchemeRates(user)[item.id]?.enabled)),
    boards: dashboardBoards(user),
    users: visibleUsers(user).length,
    recentTickets: tickets.slice(-100).reverse(),
    bonusRules: user.role === 'SUPER_ADMIN' ? store.bonusRules.filter((item) => item.ownerId === user.id) : undefined,
    directSellerPerformance: user.role === 'SUPER_ADMIN' ? buildDirectSellerPerformance() : undefined,
    actionSecurity: user.role === 'SUPER_ADMIN' ? { resultPasswordConfigured: Boolean(store.security.resultPasswordHash), managementPasswordConfigured: Boolean(store.security.managementPasswordHash) } : undefined,
    license: licenseStatus(),
    weeklyAccounts: user.role === 'SUPER_ADMIN' ? buildWeeklyAccounts() : undefined
    ,distributorAccounts: user.role === 'DISTRIBUTOR' ? buildDistributorAccounts(user) : undefined
    ,recentDraws: user.role === 'SUPER_ADMIN'
      ? [...store.draws].reverse().slice(0, 100)
      : [...store.draws].filter((draw) => (assignedAccessOwner(user)?.lotCodeIds ?? []).includes(draw.boardId)).reverse().slice(0, 100)
    ,sellerAccounts: user.role === 'SELLER' ? buildSellerAccounts(user) : undefined
  };
}

function dashboardBoards(user) {
  const accessOwner = assignedAccessOwner(user);
  const boards = store.settings.boards.filter((item) => user.role === 'SUPER_ADMIN' || (item.enabled && (accessOwner?.lotCodeIds ?? []).includes(item.id)));
  if (user.role === 'SUPER_ADMIN') return boards;
  return boards.map((board) => {
    // A Seller must only see schemes enabled for this particular Lot Code.
    // The catalog returned by the dashboard is the union across all assigned
    // Lot Codes, so using board.schemeIds directly can expose a scheme that is
    // enabled for DR but not for KL (and the sale is then correctly rejected).
    const lotCodeRates = accessOwner?.lotCodeSchemeRates?.[board.id] ?? {};
    const schemeIds = (board.schemeIds ?? []).filter((schemeId) => lotCodeRates[schemeId]?.enabled);
    const grace = accessOwner?.lotCodeGraceMinutes?.[board.id] ?? {};
    const schedules = (board.schedules ?? []).map((schedule) => {
      const graceMinutes = Number(grace[schedule.id] ?? 0);
      const [hour, minute] = schedule.endTime.split(':').map(Number);
      const effective = Math.min(23 * 60 + 59, hour * 60 + minute + graceMinutes);
      return { ...schedule, graceMinutes, effectiveEndTime: `${String(Math.floor(effective / 60)).padStart(2, '0')}:${String(effective % 60).padStart(2, '0')}` };
    });
    return { ...board, schemeIds, schedules };
  });
}

function latestVisibleDraw(user) {
  if (user.role === 'SUPER_ADMIN') return store.draws.at(-1) ?? null;
  const lotCodeIds = assignedAccessOwner(user)?.lotCodeIds ?? [];
  return [...store.draws].reverse().find((draw) => lotCodeIds.includes(draw.boardId)) ?? null;
}

function buildDistributorAccounts(user, selectedDate) {
  const range = weekRange(selectedDate);
  const sellerIds = descendantsOf(user.id).filter((item) => item.role === 'SELLER').map((item) => item.id);
  const tickets = store.tickets.filter((ticket) => sellerIds.includes(ticket.sellerId) && (ticket.businessDate ?? localDateKey(ticket.createdAt)) >= range.weekStart && (ticket.businessDate ?? localDateKey(ticket.createdAt)) <= range.weekEnd);
  const summarize = (items) => {
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const customerSales = items.reduce((sum, item) => sum + item.total, 0);
    const prizes = items.reduce((sum, item) => sum + item.prize, 0);
    const ratedAmount = items.reduce((sum, item) => sum + Number(item.rateSnapshot?.distributorRate ?? item.unitPrice) * item.quantity, 0);
    const grossMargin = customerSales - ratedAmount;
    const sellerCommission = items.reduce((sum, item) => {
      const itemMargin = (Number(item.unitPrice) - Number(item.rateSnapshot?.distributorRate ?? item.unitPrice)) * item.quantity;
      return sum + itemMargin * Number(item.rateSnapshot?.sellerCommissionPercentage ?? 0) / 100;
    }, 0);
    return { quantity, customerSales, prizes, ratedAmount, adminSettlement: ratedAmount - prizes, grossMargin, sellerCommission, margin: grossMargin - sellerCommission };
  };
  const total = summarize(tickets);
  const days = [];
  const cursor = new Date(`${range.weekStart}T12:00:00+05:30`);
  for (let index = 0; index < 7; index += 1) {
    const date = localDateKey(cursor);
    days.push({ date, ...summarize(tickets.filter((ticket) => (ticket.businessDate ?? localDateKey(ticket.createdAt)) === date)) });
    cursor.setDate(cursor.getDate() + 1);
  }
  const sellerRows = sellerIds.map((sellerId) => {
    const seller = store.users.find((item) => item.id === sellerId);
    const summary = summarize(tickets.filter((ticket) => ticket.sellerId === sellerId));
    const received = store.weeklyPayments.filter((item) => item.distributorId === sellerId && item.ownerId === user.id && item.weekStart === range.weekStart).reduce((sum, item) => sum + item.amount, 0);
    const sellerDue = summary.customerSales - summary.prizes - summary.sellerCommission;
    return { sellerId, name: seller?.name ?? sellerId, commissionPercentage: Number(seller?.commissionPercentage ?? 0), ...summary, sellerDue, received, balance: sellerDue - received };
  });
  return { ...range, ...total, days, sellerRows, sellerTotalDue: sellerRows.reduce((sum, item) => sum + item.sellerDue, 0), sellerTotalReceived: sellerRows.reduce((sum, item) => sum + item.received, 0), sellerTotalBalance: sellerRows.reduce((sum, item) => sum + item.balance, 0) };
}

function buildSellerAccounts(user, selectedDate) {
  const range = weekRange(selectedDate);
  const tickets = store.tickets.filter((ticket) => ticket.sellerId === user.id && (ticket.businessDate ?? localDateKey(ticket.createdAt)) >= range.weekStart && (ticket.businessDate ?? localDateKey(ticket.createdAt)) <= range.weekEnd);
  const sales = tickets.reduce((sum, item) => sum + item.total, 0);
  const commission = tickets.reduce((sum, item) => {
    const margin = (Number(item.unitPrice) - Number(item.rateSnapshot?.distributorRate ?? item.unitPrice)) * item.quantity;
    return sum + margin * Number(item.rateSnapshot?.sellerCommissionPercentage ?? 0) / 100;
  }, 0);
  return { ...range, quantity: tickets.reduce((sum, item) => sum + item.quantity, 0), sales, commissionPercentage: Number(store.users.find((item) => item.id === user.id)?.commissionPercentage ?? 0), commission };
}

function weekRange(input) {
  const source = input && /^\d{4}-\d{2}-\d{2}$/.test(String(input)) ? new Date(`${input}T12:00:00+05:30`) : new Date();
  if (Number.isNaN(source.getTime())) { const error = new Error('Invalid week date'); error.status = 400; throw error; }
  const local = new Date(source.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const mondayOffset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - mondayOffset);
  const weekStart = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  local.setDate(local.getDate() + 6);
  const weekEnd = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  return { weekStart, weekEnd };
}

function buildWeeklyAccounts(selectedDate) {
  const range = weekRange(selectedDate);
  const rows = store.users.filter((item) => item.parentId === 'admin-1' && ['DISTRIBUTOR', 'SELLER'].includes(item.role)).map((account) => {
    const sellerIds = account.role === 'SELLER' ? [account.id] : descendantsOf(account.id).filter((item) => item.role === 'SELLER').map((item) => item.id);
    const tickets = store.tickets.filter((ticket) => sellerIds.includes(ticket.sellerId) && (ticket.businessDate ?? localDateKey(ticket.createdAt)) >= range.weekStart && (ticket.businessDate ?? localDateKey(ticket.createdAt)) <= range.weekEnd);
    const quantity = tickets.reduce((sum, item) => sum + item.quantity, 0);
    const sales = tickets.reduce((sum, item) => sum + item.total, 0);
    const prizes = tickets.reduce((sum, item) => sum + item.prize, 0);
    const distributorRatedAmount = tickets.reduce((sum, item) => sum + Number(item.rateSnapshot?.distributorRate ?? item.unitPrice) * item.quantity, 0);
    const netDue = distributorRatedAmount - prizes;
    const received = store.weeklyPayments.filter((item) => item.distributorId === account.id && item.weekStart === range.weekStart).reduce((sum, item) => sum + item.amount, 0);
    return { distributorId: account.id, role: account.role, name: account.name, quantity, sales, prizes, distributorRatedAmount, netDue, received, balance: netDue - received };
  });
  const days = [];
  const cursor = new Date(`${range.weekStart}T12:00:00+05:30`);
  for (let index = 0; index < 7; index += 1) {
    const date = localDateKey(cursor);
    const dayTickets = store.tickets.filter((ticket) => (ticket.businessDate ?? localDateKey(ticket.createdAt)) === date);
    const sales = dayTickets.reduce((sum, item) => sum + item.total, 0);
    const prizes = dayTickets.reduce((sum, item) => sum + item.prize, 0);
    const expenses = store.dailyExpenses.filter((item) => item.expenseDate === date).reduce((sum, item) => sum + item.amount, 0);
    days.push({ date, quantity: dayTickets.reduce((sum, item) => sum + item.quantity, 0), sales, prizes, expenses, netAmount: sales - prizes - expenses });
    cursor.setDate(cursor.getDate() + 1);
  }
  const totalExpenses = days.reduce((sum, item) => sum + item.expenses, 0);
  return { ...range, totalSales: rows.reduce((sum, item) => sum + item.sales, 0), totalPrizes: rows.reduce((sum, item) => sum + item.prizes, 0), totalExpenses, finalNetAmount: days.reduce((sum, item) => sum + item.netAmount, 0), totalDue: rows.reduce((sum, item) => sum + item.netDue, 0), totalReceived: rows.reduce((sum, item) => sum + item.received, 0), totalBalance: rows.reduce((sum, item) => sum + item.balance, 0), days, rows };
}

function buildDirectSellerPerformance(previewWinningNumber = null, scope = null) {
  const latestDraw = store.draws.at(-1) ?? null;
  const winningNumber = previewWinningNumber ?? latestDraw?.winningNumber ?? null;
  return store.users.filter((item) => item.role === 'SELLER' && item.parentId === 'admin-1').map((seller) => {
    const tickets = store.tickets.filter((ticket) => ticket.sellerId === seller.id && (scope ? ticketMatchesResultScope(ticket, scope) : latestDraw ? ticket.drawId === latestDraw.id : ticket.status === 'ACTIVE'));
    const quantity = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
    const sales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    const prizeExposure = latestDraw && !scope && !previewWinningNumber ? tickets.reduce((sum, ticket) => sum + ticket.prize, 0) : winningNumber ? tickets.reduce((sum, ticket) => {
      const result = evaluateTicket(ticket.number, winningNumber, prizeSchemeForTicket(ticket), ticket.catalogPattern);
      return sum + result.prize * ticket.quantity;
    }, 0) : 0;
    const margin = tickets.reduce((sum, ticket) => sum + (Number(ticket.unitPrice) - Number(ticket.rateSnapshot?.distributorRate ?? ticket.unitPrice)) * ticket.quantity, 0);
    const netOutcome = margin - prizeExposure;
    return {
      sellerId: seller.id,
      name: seller.name,
      quantity,
      sales,
      margin,
      prizeExposure,
      netOutcome,
      status: netOutcome > 0 ? 'PROFIT' : netOutcome < 0 ? 'LOSS' : 'BREAK_EVEN'
    };
  });
}

function visibleUsers(user) {
  if (user.role === 'SUPER_ADMIN') return descendantsOf(user.id).filter((item) => item.role === 'SELLER');
  return store.users.filter((item) => item.parentId === user.id);
}
function visibleTickets(user) {
  if (user.role === 'SUPER_ADMIN') return store.tickets;
  const sellerIds = user.role === 'SELLER' ? [user.id] : descendantsOf(user.id).filter((item) => item.role === 'SELLER').map((item) => item.id);
  return store.tickets.filter((item) => sellerIds.includes(item.sellerId));
}
function visiblePricing(role) {
  const p = store.settings.pricing;
  if (role === 'DISTRIBUTOR') return { distributorRate: p.distributorRate, subDistributorRate: p.subDistributorRate, sellerRate: p.sellerRate };
  return { sellerRate: p.sellerRate, customerRate: p.customerRate };
}
function requireRole(user, role) { if (user.role !== role) { const error = new Error('Permission denied'); error.status = 403; throw error; } }
function requireActionPassword(body, user, type) {
  const account = store.users.find((item) => item.id === user.id);
  const stored = type === 'result' ? store.security.resultPasswordHash : store.security.managementPasswordHash;
  const valid = verifyPassword(String(body.actionPassword ?? ''), stored ?? account.passwordHash);
  if (!valid) { const error = new Error(`${type === 'result' ? 'Result' : 'Management'} password is incorrect`); error.status = 403; throw error; }
}
function authenticate(req) {
  const claims = verifyToken(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
  const account = store.users.find((item) => item.id === claims.id);
  if (!account || !account.isActive || Number(account.sessionVersion ?? 0) !== claims.sessionVersion) { const error = new Error('Session expired. Sign in again'); error.status = 401; throw error; }
  return claims;
}
function isAndroidSellerRequest(req) { return /^number-game-seller-android\//.test(String(req.headers['x-seller-client'] ?? '')); }
function broadcast(message) { for (const client of clients) client.write(`event: ${message.event}\ndata: ${JSON.stringify(message)}\n\n`); }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'OPTIONS') return empty(res, 204);
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const claims = verifyToken(url.searchParams.get('token'));
      const account = store.users.find((item) => item.id === claims.id);
      if (!account || !account.isActive || Number(account.sessionVersion ?? 0) !== claims.sessionVersion) throw new Error('Session expired. Sign in again');
      const user = claims;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...corsHeaders() });
      res.write(`event: connected\ndata: ${JSON.stringify({ role: user.role })}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
      const user = url.pathname === '/api/auth/login' || url.pathname === '/health' ? null : authenticate(req);
      if (user?.role === 'SELLER' && process.env.NODE_ENV === 'production' && !isAndroidSellerRequest(req)) return send(res, 403, { error: 'Seller Entry is available only in the Android app' });
      const result = await handler({ body, user, url, req });
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && result.status < 400 && !['/api/auth/login', '/api/reports/result-preview'].includes(url.pathname)) persistStore();
      return send(res, result.status, result.body);
    }
    if (req.method === 'GET') {
      if (process.env.NODE_ENV === 'production' && url.pathname === '/seller') return send(res, 403, { error: 'Seller Entry is available only in the Android app' });
      return serveStatic(url.pathname, res);
    }
    send(res, 404, { error: 'Route not found' });
  } catch (cause) { send(res, cause.status ?? (cause instanceof SyntaxError ? 400 : 401), { error: cause.message }); }
});

async function serveStatic(pathname, res) {
  const pages = { '/': 'admin-portal/index.html', '/admin': 'admin-portal/index.html', '/seller': 'seller-portal/index.html' };
  const relative = pages[pathname] ?? pathname.replace(/^\//, '');
  if (relative.includes('..') || !['.html', '.css', '.js'].includes(extname(relative))) return send(res, 404, { error: 'Not found' });
  try {
    const data = await readFile(resolve(root, relative));
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[extname(relative)] }); res.end(data);
  } catch { send(res, 404, { error: 'Not found' }); }
}
function readJson(req) { return new Promise((resolveBody, reject) => { let raw = ''; req.on('data', (chunk) => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')); }); req.on('end', () => { try { resolveBody(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } }); }); }
const ok = (body) => ({ status: 200, body });
const created = (body) => ({ status: 201, body });
const fail = (status, message) => ({ status, body: { error: message } });
const corsHeaders = () => ({ 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-seller-client', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS' });
function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }); res.end(JSON.stringify(body)); }
function empty(res, status) { res.writeHead(status, corsHeaders()); res.end(); }

if (process.env.NODE_ENV !== 'test') {
  initializeDatabasePersistence().then(({ mode }) => server.listen(port, () => console.log(`Number Game System (${mode}): http://localhost:${port}`))).catch((error) => { console.error(`Startup failed: ${error.message}`); process.exitCode = 1; });
}
export { expandBoxTicket, server };
