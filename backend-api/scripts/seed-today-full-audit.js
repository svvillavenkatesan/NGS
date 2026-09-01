import { createRecord, persistStore, store } from '../src/store.js';
import { evaluateTicket } from '../src/services/prize-engine.js';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const seller = store.users.find((item) => item.role === 'SELLER' && item.parentId === 'admin-1');
if (!seller) throw new Error('A direct Seller is required for the audit sample');
const boards = store.settings.boards.filter((item) => item.enabled);
const schemes = store.settings.schemeCatalog.filter((item) => item.enabled);
const shows = boards.flatMap((board) => (board.schedules ?? []).filter((item) => item.enabled).map((show) => ({ board, show })));
if (store.draws.some((item) => item.resultDate === today)) throw new Error(`Results already exist for ${today}; audit sample was not duplicated`);

seller.commissionPercentage = 10;
seller.lotCodeIds = boards.map((item) => item.id);
seller.lotCodeSchemeRates ??= {};
for (const board of boards) {
  seller.lotCodeSchemeRates[board.id] = Object.fromEntries(schemes.filter((scheme) => board.schemeIds.includes(scheme.id)).map((scheme) => [scheme.id, { enabled: true, rate: Number(scheme.minimumRate ?? scheme.defaultRate ?? 0) }]));
}
seller.catalogSchemeRates = Object.assign({}, ...Object.values(seller.lotCodeSchemeRates));

const winningNumber = '4312';
const numberFor = (scheme) => ({ A: '3', B: '1', C: '2', AB: '31', AC: '32', BC: '12', ABC: '312', DABC: '4312' }[scheme.pattern]
  ?? (scheme.id === 'scheme-all-single' ? '2' : '12'));
const typeFor = (scheme) => scheme.id === 'scheme-all-single' ? 'ONE_DIGIT_STANDARD'
  : scheme.id === 'scheme-all-doubles' ? 'TWO_DIGIT_STANDARD'
    : ['A', 'B', 'C'].includes(scheme.pattern) ? 'ONE_DIGIT_STANDARD'
      : ['AB', 'AC', 'BC'].includes(scheme.pattern) ? 'TWO_DIGIT_STANDARD'
        : scheme.pattern === 'ABC' ? 'THREE_DIGIT' : 'FOUR_DIGIT';
const reportCode = (board, show) => `REP-${today.replaceAll('-', '')}-${board.code}-${show.id}-${seller.id.slice(-6)}`.toUpperCase();

let ticketCount = 0;
let expectedSales = 0;
let expectedPrize = 0;
for (const { board, show } of shows) {
  const report = createRecord('saleReports', { sellerId: seller.id, sellerName: seller.name, distributorId: null, distributorName: 'Super Admin Direct', boardId: board.id, boardCode: board.code, showId: show.id, showLabel: show.label, businessDate: today, status: 'OPEN', winningNumber: null, drawId: null, auditSample: true });
  report.reportId = reportCode(board, show);
  const tickets = [];
  for (const scheme of schemes.filter((item) => board.schemeIds.includes(item.id))) {
    const ticketType = typeFor(scheme);
    const number = numberFor(scheme);
    const unitPrice = Number(scheme.mrp ?? scheme.defaultRate ?? 0);
    const quantity = 2;
    const prizeSnapshot = { four: Number(scheme.fourDigitPrize ?? 0), three: Number(scheme.threeDigitPrize ?? 0), two: Number(scheme.twoDigitPrize ?? 0), one: Number(scheme.singleDigitPrize ?? 0) };
    const base = store.settings.schemes[ticketType];
    const prizeScheme = base.type === 'FOUR_DIGIT' ? { ...base, prizes: prizeSnapshot }
      : base.type === 'THREE_DIGIT' ? { ...base, prizes: { three: prizeSnapshot.three, two: prizeSnapshot.two, one: prizeSnapshot.one } }
        : base.type === 'TWO_DIGIT' ? { ...base, prize: prizeSnapshot.two }
          : { ...base, prize: prizeSnapshot.one };
    const result = evaluateTicket(number, winningNumber, prizeScheme, scheme.pattern);
    const ticket = createRecord('tickets', { boardId: board.id, boardName: board.name, showId: show.id, showLabel: show.label, catalogSchemeId: scheme.id, catalogSchemeName: scheme.name, catalogPattern: scheme.pattern, number, scheme: ticketType, quantity, unitPrice, total: unitPrice * quantity, sellerId: seller.id, reportId: report.id, transactionSequence: tickets.length + 1, businessDate: today, drawId: null, prize: Number(result.prize) * quantity, status: result.prize > 0 ? 'WIN' : 'LOSE', rateSnapshot: { customerPrice: unitPrice, distributorRate: Number(scheme.minimumRate ?? unitPrice), minimumRate: Number(scheme.minimumRate ?? 0), sellerCommissionPercentage: 10 }, prizeSnapshot, auditSample: true });
    tickets.push(ticket);
    ticketCount += 1;
    expectedSales += ticket.total;
    expectedPrize += ticket.prize;
  }
  const sequence = store.bills.filter((item) => item.businessDate === today).length + 1;
  const bill = createRecord('bills', { billNumber: `AUD-${board.code}-${show.id}-${today.replaceAll('-', '')}`, sequence, sellerId: seller.id, reportId: report.id, boardId: board.id, boardCode: board.code, showId: show.id, showLabel: show.label, businessDate: today, ticketIds: tickets.map((item) => item.id), totalQuantity: tickets.reduce((sum, item) => sum + item.quantity, 0), total: tickets.reduce((sum, item) => sum + item.total, 0), status: 'SAVED', auditSample: true });
  for (const ticket of tickets) ticket.billId = bill.id;
  const draw = createRecord('draws', { winningNumber, boardId: board.id, boardCode: board.code, boardName: board.name, showId: show.id, showLabel: show.label, resultDate: today, publishedBy: 'admin-1', status: 'PUBLISHED', locked: true, belowTargetOverride: true, overrideReason: 'Full software audit sample', auditSample: true });
  for (const ticket of tickets) ticket.drawId = draw.id;
  report.drawId = draw.id;
  report.winningNumber = winningNumber;
  report.status = 'FINALIZED';
  report.finalizedAt = new Date().toISOString();
}

createRecord('audit', { actorId: 'admin-1', action: 'FULL_DAILY_SAMPLE_AUDIT', entityType: 'system', entityId: today, payload: { date: today, shows: shows.length, schemes: schemes.length, tickets: ticketCount, expectedSales, expectedPrize, winningNumber } });
persistStore();

const actualTickets = store.tickets.filter((item) => item.auditSample && item.businessDate === today);
const actualReports = store.saleReports.filter((item) => item.auditSample && item.businessDate === today);
const actualDraws = store.draws.filter((item) => item.auditSample && item.resultDate === today);
const actualSales = actualTickets.reduce((sum, item) => sum + Number(item.total), 0);
const actualPrize = actualTickets.reduce((sum, item) => sum + Number(item.prize), 0);
const failures = [];
if (actualTickets.length !== shows.length * schemes.length) failures.push('ticket coverage');
if (actualReports.length !== shows.length) failures.push('report coverage');
if (actualDraws.length !== shows.length) failures.push('result coverage');
if (actualSales !== expectedSales) failures.push('sales total');
if (actualPrize !== expectedPrize) failures.push('prize total');
if (failures.length) throw new Error(`Audit verification failed: ${failures.join(', ')}`);
console.log(JSON.stringify({ date: today, seller: seller.name, shows: shows.length, schemesPerShow: schemes.length, tickets: actualTickets.length, reports: actualReports.length, results: actualDraws.length, sales: actualSales, prizes: actualPrize, status: 'PASS' }, null, 2));
