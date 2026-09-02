const expectedRole = document.body.dataset.role;
const api = location.protocol === 'file:' ? 'http://localhost:4000' : '';
let token = sessionStorage.getItem(`token:${expectedRole}`);
let currentUser;
let saleCart = [];
let currentDashboard;
let currentUsers = [];
let currentReports = [];
let sellerClockTimer;

const request = async (path, options = {}) => {
  const response = await fetch(`${api}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
};
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: Number(value ?? 0) % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(value ?? 0);

async function boot() {
  if (!token) return showLogin();
  try {
    currentUser = await request('/api/me');
    if (currentUser.role !== expectedRole) throw new Error('This account belongs to a different portal');
    await renderDashboard();
  } catch (error) { token = null; sessionStorage.removeItem(`token:${expectedRole}`); showLogin(error.message); }
}

function showLogin(error = '') {
  const loginTitle = { SUPER_ADMIN: 'Super Admin', DISTRIBUTOR: 'Distributor', SUB_DISTRIBUTOR: 'Distributor', SELLER: 'Seller' }[expectedRole] ?? 'Account';
  document.querySelector('main').innerHTML = `<section class="login card"><div class="compact-panel-title"><strong>${loginTitle}</strong></div><h1>Login</h1><form id="login-form" autocomplete="off">
    <label>User ID / Phone<input name="phone" autocomplete="username" value="" required></label>
    <label>Password<input name="password" type="password" autocomplete="new-password" value="" required></label>
    <button>Sign in</button><button type="button" class="secondary" id="forgot-password">Forgot Password</button><p class="error">${error}</p></form></section>`;
  document.querySelector('#login-form').addEventListener('submit', login);
  document.querySelector('#forgot-password').addEventListener('click', requestPasswordReset);
  usePwdLabels(document.querySelector('main'));
}

function usePwdLabels(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) node.nodeValue = node.nodeValue.replaceAll('Passwords', 'PWDs').replaceAll('Password', 'PWD').replaceAll('password', 'PWD');
  root.querySelectorAll('[placeholder]').forEach((item) => { item.placeholder = item.placeholder.replaceAll('Password', 'PWD').replaceAll('password', 'PWD'); });
}

async function requestPasswordReset() {
  const phone = document.querySelector('#login-form [name="phone"]').value.trim();
  const message = document.querySelector('#login-form .error');
  if (!phone) { message.textContent = 'Enter Phone / User ID first'; return; }
  try { const result = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ phone }) }); message.textContent = result.message; message.classList.remove('error'); }
  catch (error) { message.textContent = error.message; }
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button'); submit.disabled = true;
  try {
    const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    if (data.user.role !== expectedRole) throw new Error('Use the correct role portal for this account');
    token = data.token; currentUser = data.user; sessionStorage.setItem(`token:${expectedRole}`, token); await renderDashboard();
  } catch (error) {
    form.querySelector('.error').textContent = error.message;
    submit.disabled = false;
  }
}

async function renderDashboard() {
  const [dashboard, users, candidateData, reports] = await Promise.all([
    request('/api/dashboard'),
    request('/api/users'),
    expectedRole === 'SUPER_ADMIN' ? request('/api/reports/result-candidates') : Promise.resolve(null),
    request('/api/reports/sales')
  ]);
  currentDashboard = dashboard;
  currentUsers = users;
  currentReports = reports;
  document.querySelector('#api-status').textContent = currentUser.name;
  const roleLabel = expectedRole.replaceAll('_', ' ');
  document.querySelector('main').innerHTML = `
    ${expectedRole === 'DISTRIBUTOR' ? `<div class="title-row"><div><p class="muted">${roleLabel} CONTROL CENTER</p><h1>Welcome, ${escapeHtml(currentUser.name)}</h1></div><button class="secondary" id="logout">Sign out</button></div>` : ''}
    ${expectedRole === 'SUPER_ADMIN' ? '<div class="compact-panel-title"><strong>NGS · SUPER ADMIN PANEL</strong></div><nav class="panel-tabs"><button type="button" class="active" data-panel-tab="overview">Dashboard</button><button type="button" data-panel-tab="reports">Reports</button><button type="button" data-panel-tab="weekly-accounts">Accounts</button><button type="button" data-panel-tab="results">Results</button><button type="button" data-panel-tab="direct-sellers">Sellers</button><button type="button" data-panel-tab="schemes">Schemes</button><button type="button" data-panel-tab="lot-codes">Lot Codes</button><button type="button" data-panel-tab="security">Security</button><button type="button" data-panel-tab="validity">Validity</button><button type="button" class="seller-exit" id="logout">Exit</button></nav>' : ''}
    ${expectedRole === 'DISTRIBUTOR' ? '<nav class="panel-tabs"><button type="button" class="active" data-panel-tab="overview">Overview</button><button type="button" data-panel-tab="reports">Reports</button><button type="button" data-panel-tab="accounts">Weekly Accounts</button><button type="button" data-panel-tab="sales">Sales</button><button type="button" data-panel-tab="network">Network</button><button type="button" data-panel-tab="schemes">Schemes</button><button type="button" data-panel-tab="results">Results</button></nav>' : ''}
    ${expectedRole === 'SELLER' ? '<nav class="panel-tabs seller-tabs"><button type="button" class="active" data-panel-tab="entry">Entry</button><button type="button" data-panel-tab="results">Results</button><button type="button" data-panel-tab="reports">Reports</button><button type="button" data-panel-tab="sales">Sales</button><button type="button" data-panel-tab="account">My Account</button><button type="button" class="seller-exit" id="logout">Exit</button></nav>' : ''}
    ${expectedRole !== 'SELLER' ? `<section class="grid">
      ${expectedRole === 'DISTRIBUTOR' ? `<article class="card"><span class="muted">Live result</span><strong class="number" id="live-result">${dashboard.latestDraw?.winningNumber ?? '----'}</strong></article>` : ''}
      <article class="card"><span class="muted">Total sales</span><strong>${money(dashboard.sales)}</strong></article>
      <article class="card"><span class="muted">${expectedRole === 'DISTRIBUTOR' ? 'Weekly margin' : 'Net profit'}</span><strong>${money(expectedRole === 'DISTRIBUTOR' ? dashboard.distributorAccounts?.margin : dashboard.bonus.netProfit)}</strong></article><article class="card"><span class="muted">Tickets / Network</span><strong>${dashboard.quantity} / ${dashboard.users}</strong></article>
    </section>` : ''}
    ${expectedRole === 'SUPER_ADMIN' ? `
      <section class="workspace" data-panel="overview">${performancePanel(dashboard.directSellerPerformance, dashboard.latestDraw)}${ticketsPanel(dashboard.recentTickets)}</section>
      ${reportsWorkspace(reports)}
      ${weeklyAccountsPanel(dashboard.weeklyAccounts)}
      <section class="workspace hidden" data-panel="results">${dailyResultsPanel(dashboard.boards, dashboard.recentDraws ?? [], true)}${actionPanel(dashboard)}${profitTargetPanel(dashboard)}${candidatePanel(candidateData)}</section>
      ${directSellerWorkspace(dashboard.boards, dashboard.schemeCatalog, users, dashboard.sellerCapacity)}
      ${schemeCatalogPanel(dashboard.schemeCatalog)}
      ${lotCodePanel(dashboard.boards, dashboard.schemeCatalog)}
      ${securityPanel(dashboard.actionSecurity)}
      ${validityPanel(dashboard.accountValidity, dashboard.accountRenewal)}
    ` : expectedRole === 'DISTRIBUTOR' ? distributorControlCenter(dashboard, users, reports) : sellerControlCenter(dashboard, users, reports)}
    <p id="message" class="notice"></p>`;
  usePwdLabels(document.querySelector('main'));
  document.querySelector('#logout').onclick = () => { sessionStorage.removeItem(`token:${expectedRole}`); token = null; showLogin(); };
  wireActions();
  const events = new EventSource(`${api}/api/events?token=${encodeURIComponent(token)}`);
  events.addEventListener('draw.published', async (event) => { const liveResult = document.querySelector('#live-result'); if (liveResult) liveResult.textContent = JSON.parse(event.data).draw.winningNumber; notify('New result published'); });
}

function actionPanel(dashboard) {
  if (!dashboard.accountValidity?.canOperate) return `<article class="card wide"><h2>Account Blocked</h2><p class="error">Validity and grace period expired. Owner renewal approval is required.</p></article>`;
  if (expectedRole === 'SELLER') {
    const schemeOptions = sellerSchemeOptions(dashboard.assignedSchemeRates);
    return `<article class="card seller-entry-card" id="sale-card"><div class="entry-clock"><div class="entry-now"><strong id="entry-date">--</strong><strong id="entry-time">--</strong></div><div class="entry-closing"><span id="entry-countdown-label">Entry closes in</span><strong id="entry-countdown">--:--:--</strong><small id="entry-show"></small></div></div>${schemeOptions ? `<form id="ticket-form" class="seller-entry-form" data-unit-price="${dashboard.customerRate}">
    <div class="entry-top-row"><span class="lot-code-quick">${dashboard.boards.map((board, index) => `<button type="button" class="secondary lot-code-choice ${index === 0 ? 'active' : ''}" data-board-choice="${escapeHtml(board.id)}">${escapeHtml(board.id === 'dear' ? 'DEAR' : board.code)}</button>`).join('')}</span><select name="boardId" id="board" class="hidden" aria-hidden="true" tabindex="-1">${dashboard.boards.map((board) => `<option value="${board.id}" data-name="${escapeHtml(board.name)}">${escapeHtml(board.code)} - ${escapeHtml(board.name)}</option>`).join('')}</select><select name="showId" id="seller-show" aria-label="Show">${sellerShowOptions(dashboard.boards[0])}</select><select name="catalogSchemeId" id="catalog-scheme" aria-label="Scheme">${boardCatalogOptions(dashboard.boards[0], dashboard.schemeCatalog)}</select></div>
    <label class="hidden">Number Type<select name="scheme" id="scheme">${schemeOptions}</select></label>
    <div class="number-quantity-row"><label>Ticket Number<input id="ticket-number" name="number" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="1234" autocomplete="off" required></label><label>Quantity<input id="ticket-quantity" name="quantity" type="number" inputmode="numeric" min="1" max="1000" value="1" required></label></div>
    <div class="entry-mode-row"><input type="checkbox" class="hidden" name="boxEntry" id="box-entry"><button type="button" class="secondary box-entry-toggle" id="box-entry-toggle">BOX Entry</button><span id="entry-mode-label" class="muted">2D / 3D / 4D BOX</span></div>
    <span class="quantity-shortcuts">${[1, 2, 3, 4, 5, 10].map((value) => `<button type="button" class="secondary quantity-shortcut" data-quantity="${value}">${value}</button>`).join('')}</span>
    <button class="entry-primary">Add to Bill</button>
  </form>` : '<p class="error">No selling schemes are assigned to this account.</p>'}</article>`;
  }
  if (expectedRole === 'SUPER_ADMIN') return `
    <article class="card" id="publish-card"><h2>Publish Result</h2><form id="result-form">${resultScopeFields(dashboard.boards, 'publish')}<label>Four-digit winning number (DABC)<input id="publish-number" name="winningNumber" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="5846" required></label><label class="check"><input name="overrideBelowTarget" type="checkbox"> Override minimum target</label><label>Override reason<input name="overrideReason"></label><label>Result PWD<input name="actionPassword" type="password" autocomplete="off" required></label><button>Publish Result</button></form></article>
    <article class="card"><h2>Result Preview</h2><form id="preview-form">${resultScopeFields(dashboard.boards, 'preview')}<label>Four-digit winning number<input name="winningNumber" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="5846" required></label><button>Calculate</button></form><div id="preview-result"></div></article>`;
  return `<article class="card"><h2>Add Seller</h2><p class="muted">There is no separate Sub-Distributor role. A Seller with a percentage receives commission.</p><form id="user-form"><input type="hidden" name="role" value="SELLER"><label>Seller name<input name="name" required></label><label>Phone<input name="phone" inputmode="numeric" pattern="[0-9]{10,15}" required></label><label>Temporary password<input name="password" type="password" minlength="8" required></label><label>Commission %<input name="commissionPercentage" type="number" min="0" max="50" step="0.01" value="0" required></label><button>Create Seller</button></form></article>`;
}
function sellerControlCenter(dashboard, users, reports) {
  return `<section class="workspace seller-entry-workspace" data-panel="entry">${actionPanel(dashboard)}${usersPanel(users)}</section>
    <section class="workspace hidden" data-panel="results">${dailyResultsPanel(dashboard.boards, dashboard.recentDraws ?? [])}</section>
    ${reportsWorkspace(reports)}
    <section class="workspace hidden" data-panel="sales">${ticketsPanel(dashboard.recentTickets)}</section>
    <section class="workspace hidden" data-panel="account"><section class="grid wide seller-account-metrics"><article class="card"><span class="muted">Live result</span><strong class="number" id="live-result">${dashboard.latestDraw?.winningNumber ?? '----'}</strong></article><article class="card"><span class="muted">Total sales</span><strong>${money(dashboard.sales)}</strong></article><article class="card"><span class="muted">Commission %</span><strong>${Number(dashboard.sellerAccounts?.commissionPercentage ?? 0)}%</strong></article><article class="card"><span class="muted">Bonus</span><strong>${Number(dashboard.bonus?.percentage ?? 0)}% · ${money(dashboard.bonus?.bonusAmount ?? 0)}</strong></article><article class="card"><span class="muted">Weekly earnings</span><strong>${money(dashboard.sellerAccounts?.commission)}</strong></article></section>${assignedSchemesPanel(dashboard)}${changePasswordPanel()}</section>`;
}
function distributorControlCenter(dashboard, users, reports) {
  const accounts = dashboard.distributorAccounts ?? {};
  return `<section class="workspace" data-panel="overview">${distributorSummary(accounts, dashboard.bonus)}${ticketsPanel(dashboard.recentTickets)}</section>
    ${reportsWorkspace(reports)}
    <section class="workspace hidden" data-panel="accounts" id="distributor-accounts-panel">${distributorAccountsPanel(accounts)}</section>
    <section class="workspace hidden" data-panel="sales">${ticketsPanel(dashboard.recentTickets)}</section>
    <section class="workspace hidden" data-panel="network">${actionPanel(dashboard)}${usersPanel(users)}${changePasswordPanel()}</section>
    <section class="workspace hidden" data-panel="schemes">${distributorAssignedCatalog(dashboard)}</section>
    <section class="workspace hidden" data-panel="results">${dailyResultsPanel(dashboard.boards, dashboard.recentDraws ?? [])}</section>`;
}
function distributorSummary(accounts, bonus = {}) {
  return `<article class="card wide"><p class="muted">This week · ${escapeHtml(accounts.weekStart ?? '—')} to ${escapeHtml(accounts.weekEnd ?? '—')}</p><h2>Distributor Summary</h2><div class="metrics"><div><span>Customer sales</span><strong>${money(accounts.customerSales)}</strong></div><div><span>Prize</span><strong>${money(accounts.prizes)}</strong></div><div><span>Admin settlement</span><strong>${money(accounts.adminSettlement)}</strong></div><div><span>Seller commission</span><strong>${money(accounts.sellerCommission)}</strong></div><div><span>Bonus</span><strong>${Number(bonus.percentage ?? 0)}% · ${money(bonus.bonusAmount ?? 0)}</strong></div><div><span>Your margin</span><strong>${money(accounts.margin)}</strong></div></div></article>`;
}
function distributorAccountsPanel(accounts) {
  const sellerRows = accounts.sellerRows ?? [];
  return `<article class="card wide"><div class="title-row compact"><div><p class="muted">MONDAY TO SUNDAY</p><h2>My Weekly Accounts</h2></div><form id="distributor-week-form"><label>Week date<input name="weekStart" type="date" value="${escapeHtml(accounts.weekStart ?? '')}" required></label><button class="secondary">View week</button></form></div><p class="muted">Distributor margin = Gross margin − Seller percentage commission.</p><div class="metrics"><div><span>Sales</span><strong>${money(accounts.customerSales)}</strong></div><div><span>Prize</span><strong>${money(accounts.prizes)}</strong></div><div><span>Admin settlement</span><strong>${money(accounts.adminSettlement)}</strong></div><div><span>Seller commission</span><strong>${money(accounts.sellerCommission)}</strong></div><div><span>Your margin</span><strong>${money(accounts.margin)}</strong></div></div><h3>Seller collection</h3><div class="metrics"><div><span>Amount due from Sellers</span><strong>${money(accounts.sellerTotalDue)}</strong></div><div><span>Amount received</span><strong>${money(accounts.sellerTotalReceived)}</strong></div><div><span>Balance</span><strong>${money(accounts.sellerTotalBalance)}</strong></div></div>${sellerRows.length ? `<table><thead><tr><th>Seller</th><th>Tickets</th><th>Sales</th><th>Prize</th><th>Commission</th><th>Due</th><th>Received</th><th>Balance</th><th>Payment</th></tr></thead><tbody>${sellerRows.map((row) => `<tr><td>${escapeHtml(row.name)} · ${row.commissionPercentage}%</td><td>${row.quantity}</td><td>${money(row.customerSales)}</td><td>${money(row.prizes)}</td><td>${money(row.sellerCommission)}</td><td>${money(row.sellerDue)}</td><td>${money(row.received)}</td><td class="${row.balance > 0 ? 'error' : ''}">${money(row.balance)}</td><td><form class="seller-payment-form"><input type="hidden" name="sellerId" value="${escapeHtml(row.sellerId)}"><input type="hidden" name="weekStart" value="${escapeHtml(accounts.weekStart)}"><input name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" required><input name="reference" placeholder="Note"><button>Received</button></form></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No Seller accounts.</p>'}<h3>Daily account</h3><table><thead><tr><th>Date</th><th>Tickets</th><th>Sales</th><th>Prize</th><th>Admin settlement</th><th>Seller commission</th><th>Your margin</th></tr></thead><tbody>${(accounts.days ?? []).map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${day.quantity}</td><td>${money(day.customerSales)}</td><td>${money(day.prizes)}</td><td>${money(day.adminSettlement)}</td><td>${money(day.sellerCommission)}</td><td class="${day.margin < 0 ? 'error' : ''}"><strong>${money(day.margin)}</strong></td></tr>`).join('')}</tbody></table></article>`;
}
function distributorAssignedCatalog(dashboard) {
  const rates = dashboard.lotCodeSchemeRates ?? {};
  return `<article class="card wide"><h2>Lot Codes and Schemes</h2>${dashboard.boards.map((board) => `<section class="scheme-group"><h3>${escapeHtml(board.code)} - ${escapeHtml(board.name)}</h3><div>${Object.entries(rates[board.id] ?? {}).filter(([, value]) => value.enabled).map(([id, value]) => `<span class="rate-tag">${escapeHtml(dashboard.schemeCatalog.find((item) => item.id === id)?.name ?? id)} · ${money(value.rate)}</span>`).join(' ') || '<span class="muted">No schemes assigned</span>'}</div></section>`).join('')}</article>`;
}
function distributorResultsPanel(draws) {
  const boards = currentDashboard.boards ?? [];
  const resultTable = (board) => {
    const boardDraws = draws.filter((draw) => draw.boardId === board.id);
    return `<article class="card wide"><p class="muted">${escapeHtml(board.name)} LOT CODE</p><h2>${escapeHtml(board.code)} Result</h2>${boardDraws.length ? `<table><thead><tr><th>Date</th><th>Show</th><th>Result</th><th>Status</th></tr></thead><tbody>${boardDraws.map((draw) => `<tr><td>${escapeHtml(draw.resultDate ?? '')}</td><td>${escapeHtml(draw.showLabel ?? '')}</td><td class="number">${escapeHtml(draw.winningNumber)}</td><td>${draw.locked ? 'LOCKED' : draw.status}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${escapeHtml(board.code)} result has not been published yet.</p>`}</article>`;
  };
  return `<div class="title-row compact"><h2>Published Results</h2></div>${boards.map(resultTable).join('')}`;
}
function indiaDateOffset(offset = 0) {
  const now = new Date(Date.now() + 330 * 60 * 1000 + offset * 24 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}
function dailyResultsPanel(boards = [], draws = [], canPublish = false) {
  const today = indiaDateOffset(0);
  const rows = boards.flatMap((board) => {
    const schedules = (board.schedules ?? []).filter((show) => show.enabled);
    return (schedules.length ? schedules : [{ id: 'all-day', label: 'All Day' }]).map((show) => ({ board, show }));
  });
  const findDraw = (boardId, showId, date) => draws.find((draw) => draw.boardId === boardId && draw.showId === showId && draw.resultDate === date);
  const todayRows = rows.map(({ board, show }) => {
    const draw = findDraw(board.id, show.id, today);
    const publish = canPublish && !draw ? `<button type="button" class="secondary publish-scope" data-board-id="${escapeHtml(board.id)}" data-show-id="${escapeHtml(show.id)}" data-result-date="${today}">Publish</button>` : '—';
    return `<tr><td>${today.split('-').reverse().join('/')}</td><td>${escapeHtml(board.code)}</td><td>${escapeHtml(show.label)}</td><td class="number compact-number">${draw ? escapeHtml(draw.winningNumber) : '----'}</td><td>${publish}</td><td><span class="status ${draw ? 'profit' : 'break_even'}">${draw ? 'PUBLISHED' : 'NOT PUBLISHED'}</span></td></tr>`;
  }).join('');
  const dates = Array.from({ length: 7 }, (_, index) => indiaDateOffset(-(index + 1)));
  const historyRows = rows.map(({ board, show }) => `<tr><th>${escapeHtml(board.code)} · ${escapeHtml(show.label)}</th>${dates.map((date) => { const draw = findDraw(board.id, show.id, date); return `<td class="${draw ? 'number compact-number' : 'muted'}">${draw ? escapeHtml(draw.winningNumber) : 'NOT PUBLISHED'}</td>`; }).join('')}</tr>`).join('');
  return `<article class="card wide results-calendar"><div class="title-row compact"><div><p class="muted">TODAY · AUTO UPDATE</p><h2>Result Status</h2></div><strong>${today.split('-').reverse().join('/')}</strong></div><table><thead><tr><th>Date</th><th>Lot Code</th><th>Show</th><th>Result</th><th>Publish</th><th>Status</th></tr></thead><tbody>${todayRows}</tbody></table><h3>Previous 7 Days</h3><div class="bill-table"><table><thead><tr><th>Lot Code / Show</th>${dates.map((date) => `<th>${date.split('-').reverse().slice(0, 2).join('/')}</th>`).join('')}</tr></thead><tbody>${historyRows}</tbody></table></div></article>`;
}
function resultScopeFields(boards = [], prefix) {
  const first = boards[0];
  const shows = first?.schedules?.filter((item) => item.enabled).length ? first.schedules.filter((item) => item.enabled) : [{ id: 'all-day', label: 'All Day' }];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `<label>Lot Code<select name="boardId" id="${prefix}-result-board">${boards.map((board) => `<option value="${escapeHtml(board.id)}">${escapeHtml(board.code)} - ${escapeHtml(board.name)}</option>`).join('')}</select></label><label>Show<select name="showId" id="${prefix}-result-show">${shows.map((show) => `<option value="${escapeHtml(show.id)}">${escapeHtml(show.label)}</option>`).join('')}</select></label><label>Result date<input name="resultDate" type="date" value="${today}" required></label>`;
}
function distributorPanel(lotCodes = [], catalog = [], users = [], bonusRules = []) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  return `<section class="workspace hidden" data-panel="distributors">
    <article class="card wide"><h2>Select Distributor</h2><form id="distributor-form">
      <input type="hidden" name="role" value="DISTRIBUTOR">
      <label>Select Distributor<select name="distributorId" id="distributor-selector"><option value="">+ Add New Distributor</option>${users.filter((item) => item.role === 'DISTRIBUTOR').map((item) => `<option value="${item.id}">${escapeHtml(item.name)} - ${escapeHtml(item.phone)}</option>`).join('')}</select></label>
      <div id="new-distributor-fields" class="compact-fields">
        <label>Distributor name<input name="name" autocomplete="name" required></label>
        <label>Mobile number<input name="phone" inputmode="numeric" autocomplete="tel" pattern="[0-9]{10,15}" required></label>
        <label>Temporary password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      </div>
      <label>Lot Code<select name="lotCodeId" id="distributor-lot-code">${lotCodes.map((item) => `<option value="${item.id}">${escapeHtml(item.code)} - ${escapeHtml(item.name)}</option>`).join('')}</select></label>
      <fieldset class="scheme-rates"><legend>Common Schemes</legend><div>${catalog.filter((scheme) => scheme.universal).map((scheme) => `<span class="rate-tag">${escapeHtml(scheme.name)}</span>`).join(' ')}</div></fieldset>
      <fieldset class="scheme-rates"><legend>3D Common Selection</legend>
        <div class="scheme-toolbar"><p class="muted">Select the required 3D Schemes for this Lot Code.</p><button type="button" class="secondary" id="select-all-distributor-schemes">Select All</button></div>
        <div class="subscheme-grid compact-scheme-grid">${catalog.filter((scheme) => !scheme.universal && scheme.pattern === 'ABC').map((scheme) => {
          const allowedLots = lotCodes.filter((lot) => lot.schemeIds?.includes(scheme.id)).map((lot) => lot.id).join(' ');
          return `<div class="subscheme catalog-rate" data-lot-ids="${escapeHtml(allowedLots)}"><label class="check"><input type="checkbox" name="catalog_scheme_${scheme.id}"> <span>${escapeHtml(scheme.name)}</span></label></div>`;
        }).join('')}</div>
      </fieldset>
      <fieldset class="scheme-rates"><legend>4D Scheme Selection</legend><p class="muted">Select the required 4D Schemes separately.</p><div class="subscheme-grid compact-scheme-grid">${catalog.filter((scheme) => !scheme.universal && scheme.pattern === 'DABC').map((scheme) => { const allowedLots = lotCodes.filter((lot) => lot.schemeIds?.includes(scheme.id)).map((lot) => lot.id).join(' '); return `<div class="subscheme catalog-rate" data-lot-ids="${escapeHtml(allowedLots)}"><label class="check"><input type="checkbox" name="catalog_scheme_${scheme.id}"> <span>${escapeHtml(scheme.name)}</span></label></div>`; }).join('')}</div></fieldset>
      <fieldset class="scheme-rates"><legend>Distributor grace time</legend><p class="muted">Optional extra minutes after each Show end time. Use 0 when no grace is required.</p><div class="grace-grid">${['show1', 'show2', 'show3', 'show4', 'show5'].map((id, index) => `<label>Show ${index + 1}<input type="text" inputmode="numeric" pattern="[0-9]{1,2}" name="grace_${id}" value="0" aria-label="Show ${index + 1} grace minutes"><span class="muted">minutes</span></label>`).join('')}</div></fieldset>
      <label>Management PWD<input name="actionPassword" type="password" autocomplete="off" required></label>
      <button id="save-distributor">Add Distributor</button>
    </form></article>${distributorBonusPanel(users, bonusRules)}${usersPanel(users.filter((item) => item.role === 'DISTRIBUTOR'))}
  </section>`;
}
function directSellerWorkspace(lotCodes = [], catalog = [], users = [], capacity = {}) {
  const directSellers = users.filter((item) => item.role === 'SELLER');
  return `<section class="workspace hidden" data-panel="direct-sellers"><article class="card wide"><h2>Seller Capacity</h2><div class="metrics"><div><span>Maximum</span><strong>${Number(capacity.maximum ?? 0)}</strong></div><div><span>Active Sellers</span><strong>${Number(capacity.current ?? 0)}</strong></div><div><span>Remaining</span><strong>${Number(capacity.remaining ?? 0)}</strong></div></div></article>${directSellerPanel(lotCodes, catalog, directSellers)}${usersPanel(directSellers)}</section>`;
}
function directSellerPanel(lotCodes = [], catalog = [], sellers = []) {
  return `<article class="card wide"><p class="muted">DIRECT SELLER</p><h2>Select Seller</h2><form id="direct-seller-form" class="catalog-form"><input type="hidden" name="role" value="SELLER"><label>Select Seller<select name="sellerId" id="direct-seller-selector"><option value="">+ Add Seller</option>${sellers.map((seller) => `<option value="${escapeHtml(seller.id)}">${escapeHtml(seller.sellerCode ?? '')} · ${escapeHtml(seller.name)} · ${escapeHtml(seller.phone)}</option>`).join('')}</select></label><div id="new-direct-seller-fields"><label>Seller name<input name="name" required></label><label>Mobile number<input name="phone" inputmode="numeric" pattern="[0-9]{10,15}" required></label><label>Temporary password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label></div><label>Lot Code<select name="lotCodeId" id="direct-seller-lot-code">${lotCodes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} - ${escapeHtml(item.name)}</option>`).join('')}</select></label><label class="check" id="seller-lot-enabled-label"><input type="checkbox" name="lotCodeEnabled" id="seller-lot-enabled" checked> Enable this Lot Code</label><fieldset class="scheme-rates"><legend>Common Schemes</legend><div>${catalog.filter((scheme) => scheme.universal).map((scheme) => `<span class="rate-tag">${escapeHtml(scheme.name)}</span>`).join(' ')}</div></fieldset><fieldset class="scheme-rates"><legend>Select 3D / 4D Schemes</legend><div class="scheme-toolbar"><button type="button" class="secondary" id="select-all-direct-seller-schemes">Select All</button></div><div class="subscheme-grid compact-scheme-grid">${catalog.filter((scheme) => !scheme.universal).map((scheme) => { const allowedLots = lotCodes.filter((lot) => lot.schemeIds?.includes(scheme.id)).map((lot) => lot.id).join(' '); return `<label class="check direct-seller-scheme" data-lot-ids="${escapeHtml(allowedLots)}"><input type="checkbox" name="direct_scheme_${scheme.id}" value="${escapeHtml(scheme.id)}"> ${escapeHtml(scheme.name)}</label>`; }).join('')}</div></fieldset>${sellerGracePanel(lotCodes)}<label>Commission %<input name="commissionPercentage" type="number" min="0" max="50" step="0.01" value="0" required></label><label>Management Password<input name="actionPassword" type="password" required></label><button id="save-direct-seller">Create Direct Seller</button></form></article>`;
}
function sellerGracePanel(lotCodes = []) {
  const showIds = ['show1', 'show2', 'show3', 'show4', 'show5'];
  return `<fieldset class="scheme-rates"><legend>Seller Grace Time (Optional)</legend><p class="muted">Extra entry minutes apply only to the selected Seller, Lot Code and Show. Use 0 for no grace.</p><div class="grace-grid">${showIds.map((id, index) => { const allowedLots = lotCodes.filter((lot) => lot.schedules?.some((show) => show.id === id && show.enabled)).map((lot) => lot.id).join(' '); return `<label class="direct-seller-grace" data-lot-ids="${escapeHtml(allowedLots)}">Show ${index + 1}<input type="number" inputmode="numeric" min="0" max="60" step="1" name="grace_${id}" value="0"><span class="muted">minutes</span></label>`; }).join('')}</div></fieldset>`;
}
function distributorBonusPanel(users = [], bonusRules = []) {
  const distributors = users.filter((item) => item.role === 'DISTRIBUTOR');
  return `<article class="card wide"><p class="muted">DISTRIBUTOR BONUS</p><h2>Set Bonus Percentage</h2><p class="muted">Set an individual Bonus Percentage from 0% to a maximum of 50% for each Distributor.</p>${distributors.length ? `<table><thead><tr><th>Distributor</th><th>Bonus Settings</th></tr></thead><tbody>${distributors.map((distributor) => { const rule = bonusRules.find((item) => item.beneficiaryId === distributor.id); return `<tr><td>${escapeHtml(distributor.name)}</td><td><form class="distributor-bonus-form catalog-form"><input type="hidden" name="beneficiaryId" value="${escapeHtml(distributor.id)}"><input type="hidden" name="targetSales" value="0"><input type="hidden" name="enabled" value="true"><label>Bonus %<input name="percentage" type="number" min="0" max="50" step="0.01" value="${Number(rule?.percentage ?? 0)}" required></label><label>Management Password<input name="actionPassword" type="password" required></label><button>Save Bonus</button></form></td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">No distributors available.</p>'}</article>`;
}
function usersPanel(users) {
  if (expectedRole === 'SELLER') return `<article class="card" id="bill-card"><h2>Current bill</h2><div id="bill-content">${billContent()}</div></article>`;
  const showSchemes = expectedRole === 'SUPER_ADMIN';
  const showCommission = ['SUPER_ADMIN', 'DISTRIBUTOR'].includes(expectedRole);
  const resetColumn = expectedRole === 'SUPER_ADMIN';
  return `<article class="card ${showSchemes || showCommission ? 'wide' : ''}"><h2>Direct network</h2>${users.length ? `<table><thead><tr><th>User ID</th><th>Name</th><th>Role</th>${showSchemes ? '<th>Lot Codes</th><th>Assigned schemes</th>' : ''}${showCommission ? '<th>Commission %</th>' : ''}<th>Status</th>${resetColumn ? '<th>Reset Password</th>' : ''}</tr></thead><tbody>${users.map((user) => `<tr><td>${escapeHtml(user.sellerCode ?? user.superAdminCode ?? '-')}</td><td>${escapeHtml(user.name)}</td><td>${user.role.replaceAll('_', ' ')}</td>${showSchemes ? `<td>${formatLotCodes(user.lotCodeIds ?? (user.lotCodeId ? [user.lotCodeId] : []))}</td><td>${formatDistributorAssignments(user)}</td>` : ''}${showCommission ? `<td>${user.role === 'SELLER' ? `<form class="seller-commission-form"><input type="hidden" name="sellerId" value="${escapeHtml(user.id)}"><input name="commissionPercentage" type="number" min="0" max="50" step="0.01" value="${Number(user.commissionPercentage ?? 0)}" required>${expectedRole === 'SUPER_ADMIN' ? '<input name="actionPassword" type="password" placeholder="Management Password" required>' : ''}<button>Save</button></form>` : '-'}</td>` : ''}<td>${user.isActive ? 'Active' : 'Disabled'}</td>${resetColumn ? `<td><form class="user-password-reset-form"><input type="hidden" name="userId" value="${escapeHtml(user.id)}"><input name="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="New password" required><input name="actionPassword" type="password" autocomplete="off" placeholder="Management Password" required><button>Reset</button></form></td>` : ''}</tr>`).join('')}</tbody></table>` : '<p class="muted">No direct accounts yet.</p>'}</article>`;
}
function changePasswordPanel() {
  return `<article class="card wide"><p class="muted">ACCOUNT SECURITY</p><h2>Change Password</h2><form id="change-password-form" class="catalog-form"><label>Current Password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New Password<input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><button>Change Password</button></form><p class="muted">Sign in again after changing the password.</p></article>`;
}
function distributorSchemeGroup(title, schemes) {
  return `<section class="scheme-group"><h3>${title}</h3><div class="subscheme-grid">${schemes.map(([key, label], index) => `<div class="subscheme"><label class="check"><input type="checkbox" name="scheme_${key}" ${index === 0 ? 'checked' : ''}> <span>${label}</span></label><label class="sub-rate">Rate<input type="number" name="rate_${key}" min="10" step="0.01" value="12"></label></div>`).join('')}</div></section>`;
}
function sellerSchemeOptions(rates = {}) {
  const options = [];
  if (Object.keys(rates).some((key) => key.startsWith('FOUR_'))) options.push(['FOUR_DIGIT', '4 Digit', 4]);
  if (Object.keys(rates).some((key) => key.startsWith('THREE_'))) options.push(['THREE_DIGIT', '3 Digit', 3]);
  if (rates.TWO_STANDARD) options.push(['TWO_DIGIT_STANDARD', '2 Digit', 2]);
  else if (rates.TWO_PREMIUM) options.push(['TWO_DIGIT_PREMIUM', '2 Digit Premium', 2]);
  if (rates.ONE_STANDARD) options.push(['ONE_DIGIT_STANDARD', 'Single Digit', 1]);
  else if (rates.ONE_PREMIUM) options.push(['ONE_DIGIT_PREMIUM', 'Single Digit Premium', 1]);
  return options.map(([value, label, length]) => `<option value="${value}" data-length="${length}">${label}</option>`).join('');
}
function boardCatalogOptions(board, catalog = []) {
  if (!board) return '<option value="">No board available</option>';
  const assigned = catalog.filter((item) => board.schemeIds?.includes(item.id));
  return assigned.length ? assigned.map((item) => `<option value="${item.id}" data-mrp="${Number(item.mrp ?? item.defaultRate ?? 0)}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">No scheme assigned</option>';
}
function sellerShowOptions(board) {
  const schedules = (board?.schedules ?? []).filter((item) => item.enabled);
  if (!schedules.length) return '<option value="all-day">All Day</option>';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const details = schedules.map((show) => {
    const [startHour, startMinute] = show.startTime.split(':').map(Number);
    const [endHour, endMinute] = (show.effectiveEndTime ?? show.endTime).split(':').map(Number);
    return { ...show, start: startHour * 60 + startMinute, end: endHour * 60 + endMinute };
  }).sort((a, b) => a.end - b.end);
  const defaultShow = details.find((show) => currentMinutes >= show.start && currentMinutes <= show.end) ?? details.find((show) => currentMinutes < show.start);
  return details.map((show) => `<option value="${escapeHtml(show.id)}" ${show.id === defaultShow?.id ? 'selected' : ''} ${currentMinutes > show.end ? 'disabled' : ''}>${escapeHtml(show.label)}</option>`).join('');
}
function assignedSchemesPanel(dashboard) {
  if (expectedRole === 'SUPER_ADMIN' || expectedRole === 'SELLER') return '';
  return `<article class="card wide"><h2>Available schemes</h2><p class="muted">These are the only schemes assigned to your distributor network.</p><div>${formatSchemeRates(dashboard.assignedSchemeRates)}</div></article>`;
}
function formatSchemeRates(rates = {}) {
  const labels = { FOUR_EXACT: '4D Exact', FOUR_LAST3: '4D Last 3', FOUR_LAST2: '4D Last 2', FOUR_LAST1: '4D Last 1', THREE_EXACT: '3D Exact', THREE_LAST2: '3D Last 2', THREE_LAST1: '3D Last 1', TWO_STANDARD: '2D Standard', TWO_PREMIUM: '2D Premium', ONE_STANDARD: '1D Standard', ONE_PREMIUM: '1D Premium' };
  const rows = Object.entries(rates).filter(([, item]) => item.enabled).map(([key]) => `<span class="rate-tag">${labels[key] ?? key}</span>`);
  return rows.length ? rows.join(' ') : '<span class="muted">Not assigned</span>';
}
function formatCatalogSchemeRates(rates = {}, catalog = []) {
  const rows = Object.entries(rates).filter(([id, item]) => item.enabled && !catalog.find((scheme) => scheme.id === id)?.universal).map(([id, item]) => `<span class="rate-tag">${escapeHtml(catalog.find((scheme) => scheme.id === id)?.name ?? id)}: ${money(item.rate)}</span>`);
  return rows.length ? rows.join(' ') : '<span class="muted">Common schemes only</span>';
}
function formatLotCodes(ids = []) {
  return ids.map((id) => escapeHtml(currentDashboard.boards.find((item) => item.id === id)?.code ?? id)).join(', ') || '-';
}
function formatDistributorAssignments(user) {
  const rows = [];
  for (const [lotId, rates] of Object.entries(user.lotCodeSchemeRates ?? {})) {
    const code = currentDashboard.boards.find((item) => item.id === lotId)?.code ?? lotId;
    for (const [schemeId, item] of Object.entries(rates)) {
      const scheme = currentDashboard.schemeCatalog.find((entry) => entry.id === schemeId);
      if (item.enabled) rows.push(`<span class="rate-tag">${escapeHtml(code)} · ${escapeHtml(scheme?.name ?? schemeId)}</span>`);
    }
  }
  return rows.length ? rows.join(' ') : '<span class="muted">Common schemes only</span>';
}
function ticketsPanel(tickets) {
  const lotCodes = [...new Map(tickets.map((ticket) => [ticket.boardId, ticket.boardName ?? ticket.boardId])).entries()];
  const filters = lotCodes.length > 1 ? `<div class="compact-actions ticket-filters"><button type="button" class="active" data-ticket-filter="ALL">ALL</button>${lotCodes.map(([id, name]) => `<button type="button" data-ticket-filter="${escapeHtml(id)}">${escapeHtml(id === 'kerala' ? 'KL' : id === 'dear' ? 'DEAR' : name)}</button>`).join('')}</div>` : '';
  return `<article class="card wide"><h2>Recent ticket activity</h2>${tickets.length ? `${filters}<table><thead><tr><th>Lot Code</th><th>Show</th><th>Number</th><th>Scheme</th><th>Qty</th><th>Status</th><th>Prize</th></tr></thead><tbody>${tickets.map((ticket) => `<tr data-ticket-board="${escapeHtml(ticket.boardId)}"><td>${escapeHtml(ticket.boardName ?? '-')}</td><td>${escapeHtml(ticket.showLabel ?? '-')}</td><td class="number">${ticket.number}</td><td>${ticket.scheme.replaceAll('_', ' ')}</td><td>${ticket.quantity}</td><td>${ticket.status}</td><td>${money(ticket.prize)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Tickets will appear here after seller sales.</p>'}</article>`;
}
function weeklyAccountsPanel(accounts = {}) {
  const rows = accounts.rows ?? [];
  const days = accounts.days ?? [];
  return `<section class="workspace hidden" data-panel="weekly-accounts" id="weekly-accounts-panel">
    <article class="card wide">
      <div class="title-row compact"><div><p class="muted">WEEKLY ACCOUNT · MONDAY TO SUNDAY</p><h2>Weekly Accounts</h2><p class="muted">${escapeHtml(accounts.weekStart || '—')} to ${escapeHtml(accounts.weekEnd || '—')}</p></div><form id="weekly-range-form"><label>Select a date in the week<input name="weekStart" type="date" value="${escapeHtml(accounts.weekStart || '')}" required></label><button type="submit" class="secondary">View Week</button></form></div>
      <h3>1. Weekly Net Account</h3><p class="muted">Total Sales − Prize − Other Expenses = Weekly Net Amount</p>
      <div class="metrics"><div><span>Total Sales</span><strong>${money(accounts.totalSales)}</strong></div><div><span>Prize Paid</span><strong>${money(accounts.totalPrizes)}</strong></div><div><span>Other Expenses</span><strong>${money(accounts.totalExpenses)}</strong></div><div><span>Weekly Net Amount</span><strong class="${accounts.finalNetAmount < 0 ? 'error' : ''}">${money(accounts.finalNetAmount)}</strong></div></div>
      <h3>2. Daily Closing Amount</h3><p class="muted">This table shows the actual closing balance for each date.</p>
      <table><thead><tr><th>Date</th><th>Tickets</th><th>Sales</th><th>Prize</th><th>Expense</th><th>Daily Closing Amount</th></tr></thead><tbody>${days.map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${day.quantity}</td><td>${money(day.sales)}</td><td>${money(day.prizes)}</td><td>${money(day.expenses)}</td><td class="${day.netAmount < 0 ? 'error' : ''}"><strong>${money(day.netAmount)}</strong></td></tr>`).join('')}</tbody></table>
      <details><summary>Record Daily Expense</summary><form id="daily-expense-form" class="catalog-form"><label>Date<input name="expenseDate" type="date" min="${escapeHtml(accounts.weekStart || '')}" max="${escapeHtml(accounts.weekEnd || '')}" value="${escapeHtml(accounts.weekStart || '')}" required></label><label>Expense Amount<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Expense Details<input name="note" placeholder="Expense purpose" required></label><label>Management Password<input name="actionPassword" type="password" required></label><button>Record Expense</button></form></details>
    </article>
    <article class="card wide"><h3>3. Distributor / Direct Seller Collection Status</h3><p class="muted">Distributor and Super Admin Direct Seller accounts are shown separately.</p><div class="metrics"><div><span>Amount Due</span><strong>${money(accounts.totalDue)}</strong></div><div><span>Amount Received</span><strong>${money(accounts.totalReceived)}</strong></div><div><span>Balance Due</span><strong class="${accounts.totalBalance > 0 ? 'error' : ''}">${money(accounts.totalBalance)}</strong></div></div>${rows.length ? `<table><thead><tr><th>Account</th><th>Type</th><th>Tickets</th><th>Amount Due</th><th>Amount received</th><th>Balance Due</th><th>Record Payment</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.role === 'SELLER' ? 'Direct Seller' : 'Distributor'}</td><td>${row.quantity}</td><td>${money(row.netDue)}</td><td>${money(row.received)}</td><td class="${row.balance > 0 ? 'error' : ''}"><strong>${money(row.balance)}</strong></td><td><form class="weekly-payment-form"><input type="hidden" name="distributorId" value="${escapeHtml(row.distributorId)}"><input type="hidden" name="weekStart" value="${escapeHtml(accounts.weekStart)}"><input name="amount" type="number" min="0.01" step="0.01" placeholder="Received Amount" required><input name="reference" placeholder="Reference / Note"><input name="actionPassword" type="password" placeholder="Management Password" required><button>Payment Received</button></form></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No accounts available.</p>'}</article>
  </section>`;
}
function candidatePanel(data) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  if (!data?.candidates.length) return `<article class="card wide" id="candidate-panel"><h2>Sold-number profit options</h2><p class="muted">Select Lot Code, Show, and Date above. Matching active 4-digit sold numbers will appear here.</p></article>`;
  return `<article class="card wide" id="candidate-panel"><div class="title-row compact"><div><h2>Sold-number profit options</h2><p class="muted">Top ${data.candidates.length} of ${data.availableUniqueNumbers} unique sold numbers for the selected Lot Code, Show, and Date.</p></div></div>
    <div class="candidate-grid">${data.candidates.map((item) => `<button type="button" class="candidate ${item.status.toLowerCase()} ${item.meetsMinimumProfit ? 'eligible' : 'below-target'}" data-candidate="${item.winningNumber}"><span class="number">${item.winningNumber}</span><strong>${money(item.projectedProfit)} (${item.profitPercentage}%)</strong><small>${item.status.replace('_', ' ')} · Prize ${money(item.totalPrizes)}</small><span>${item.meetsMinimumProfit ? 'Select' : `Below ${item.minimumProfitLabel} · Select with warning`}</span></button>`).join('')}</div>
    <p class="muted">Selecting a number only moves it to Publish Result. It is not published automatically.</p></article>`;
}
function profitTargetPanel(dashboard) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  const target = dashboard.minimumProfit ?? { mode: 'PERCENTAGE', value: 20 };
  return `<article class="card"><h2>Minimum profit target</h2><p class="muted">Results below this target cannot be published.</p><form id="profit-target-form">
    <label>Target type<select name="mode"><option value="PERCENTAGE" ${target.mode === 'PERCENTAGE' ? 'selected' : ''}>Percentage</option><option value="AMOUNT" ${target.mode === 'AMOUNT' ? 'selected' : ''}>Fixed amount (INR)</option></select></label>
    <label>Minimum value<input name="value" type="number" min="0" step="0.01" value="${target.value}" list="profit-presets" required><datalist id="profit-presets"><option value="20"><option value="50"><option value="60"><option value="80"></datalist></label>
    <label>Management Password<input name="actionPassword" type="password" autocomplete="off" required></label><button>Save target</button>
  </form></article>`;
}
function performancePanel(rows, latestDraw) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  const content = !latestDraw
    ? '<p class="muted">Publish a result to calculate each Direct Seller profit and loss.</p>'
    : rows.length
      ? `<p class="muted">Published Result: <span class="number">${latestDraw.winningNumber}</span> · ${escapeHtml(latestDraw.boardCode ?? '')} · ${escapeHtml(latestDraw.showLabel ?? '')} · ${escapeHtml(latestDraw.resultDate ?? '')}. Tickets are permanently settled.</p><table><thead><tr><th>Direct Seller</th><th>Qty</th><th>Sales</th><th>Margin</th><th>Prize</th><th>Net</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.quantity}</td><td>${money(row.sales)}</td><td>${money(row.margin)}</td><td>${money(row.prizeExposure)}</td><td>${money(row.netOutcome)}</td><td><span class="status ${row.status.toLowerCase()}">${row.status.replace('_', ' ')}</span></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No Direct Sellers are connected.</p>';
  return `<article class="card wide"><h2>Direct Seller profit / loss</h2>${content}</article>`;
}
function schemeCatalogPanel(catalog = []) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  return `<section class="workspace hidden" data-panel="schemes"><article class="card wide"><p class="muted">SCHEME CREATION</p><h2>Create scheme</h2><p class="muted">Give the scheme a name and define DABC prize levels.</p><form id="catalog-form" class="catalog-form">
    <label class="catalog-name">Scheme name<input name="name" placeholder="Example: 3D-30-15K" minlength="1" maxlength="60" required></label>
    <label>Pattern<input name="pattern" placeholder="Example: ABC" minlength="1" maxlength="8" pattern="[A-Za-z]+" required></label>
    <label>4 Digit Prize<input name="fourDigitPrize" type="number" min="0" step="1" required></label>
    <label>3 Digit Prize<input name="threeDigitPrize" type="number" min="0" step="1" required></label>
    <label>2 Digit Prize<input name="twoDigitPrize" type="number" min="0" step="1" required></label>
    <label>Single Digit Prize<input name="singleDigitPrize" type="number" min="0" step="1" required></label>
    <label>Minimum Seller Price<input name="minimumRate" type="text" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required></label>
    <label>MRP<input name="mrp" type="text" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required></label>
    <label>Management Password<input name="actionPassword" type="password" autocomplete="off" required></label>
    <button>Create scheme</button>
  </form></article><article class="card wide"><h2>Scheme list</h2><p class="muted">Minimum, MRP and Prize values can be changed. Already-sold tickets keep their original snapshot.</p><label>Management Password for changes<input id="scheme-price-password" type="password" autocomplete="off"></label>${catalog.length ? `<table><thead><tr><th>Scheme</th><th>Pattern</th><th>Minimum</th><th>MRP</th><th>4D Prize</th><th>3D Prize</th><th>2D Prize</th><th>1D Prize</th><th>Status</th><th>Action</th></tr></thead><tbody>${catalog.map((item) => `<tr data-scheme-price-row="${escapeHtml(item.id)}"><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.pattern ?? '-')}</td><td><input type="text" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" data-price="minimumRate" value="${Number(item.minimumRate ?? 0)}" aria-label="${escapeHtml(item.name)} minimum"></td><td><input type="text" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" data-price="mrp" value="${Number(item.mrp ?? 0)}" aria-label="${escapeHtml(item.name)} MRP"></td><td><input type="number" min="0" step="1" data-prize="fourDigitPrize" value="${Number(item.fourDigitPrize ?? 0)}"></td><td><input type="number" min="0" step="1" data-prize="threeDigitPrize" value="${Number(item.threeDigitPrize ?? 0)}"></td><td><input type="number" min="0" step="1" data-prize="twoDigitPrize" value="${Number(item.twoDigitPrize ?? 0)}"></td><td><input type="number" min="0" step="1" data-prize="singleDigitPrize" value="${Number(item.singleDigitPrize ?? 0)}"></td><td>${item.enabled ? 'Active' : 'Disabled'}</td><td><button type="button" class="secondary save-scheme-price" data-scheme-id="${escapeHtml(item.id)}">Save</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No schemes created yet.</p>'}</article></section>`;
}
function lotCodePanel(boards = [], catalog = []) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  return `<section class="workspace hidden" data-panel="lot-codes"><article class="card wide"><p class="muted">LOT CODE ASSIGNMENT & TIMINGS</p><h2>Configure Lot Code</h2><form id="board-config-form"><label>Lot Code<select name="boardId" id="config-lot-code">${boards.map((board) => `<option value="${board.id}">${escapeHtml(board.code)} - ${escapeHtml(board.name)}</option>`).join('')}</select></label><fieldset class="scheme-rates"><legend>Available schemes</legend><p class="muted">The 8 Single/Double schemes are common to every Lot Code. Select any additional 3D and 4D schemes required.</p><div>${catalog.map((item) => `<label class="check board-scheme"><input type="checkbox" name="assignedScheme" value="${item.id}" data-universal="${item.universal ? 'true' : 'false'}" ${item.universal || boards[0]?.schemeIds?.includes(item.id) ? 'checked' : ''} ${item.universal ? 'disabled' : ''}> ${escapeHtml(item.name)}${item.universal ? ' · Common' : ''}</label>`).join('')}</div></fieldset><fieldset class="scheme-rates"><legend id="timing-legend">Daily Timings</legend>${scheduleRow('show1', 'Show 1', '00:01', '15:00')}${scheduleRow('show2', 'Show 2', '00:01', '17:58')}${scheduleRow('show3', 'Show 3', '00:01', '19:58')}${scheduleRow('show4', 'Show 4', '', '')}${scheduleRow('show5', 'Show 5', '', '')}</fieldset><fieldset class="scheme-rates" id="kerala-date-override"><legend>Kerala Special-Date Closing (Optional)</legend><p class="muted">Use this only when Kerala entry must close earlier on one specific date. The normal 3:00 PM closing resumes automatically on other dates.</p><label>Special Date<input type="date" name="specialDate"></label><label>Closing Time<input type="time" name="specialEndTime" value="14:00"></label></fieldset><label>Management Password<input name="actionPassword" type="password" autocomplete="off" required></label><button>Save Lot Code configuration</button></form></article>
  <article class="card wide"><p class="muted">NEW LOT CODE</p><h2>Add Lot Code</h2><form id="board-form" class="catalog-form"><label>Lot Code<input name="code" placeholder="Example: PB" maxlength="8" required></label><label class="catalog-name">Lot Code name<input name="name" placeholder="Example: Punjab" minlength="2" maxlength="40" required></label><label>Management Password<input name="actionPassword" type="password" autocomplete="off" required></label><button>Add Lot Code</button></form></article></section>`;
}
function securityPanel(security = {}) {
  if (expectedRole !== 'SUPER_ADMIN') return '';
  return `<section class="workspace hidden" data-panel="security"><article class="card wide"><p class="muted">ACTION PASSWORD SECURITY</p><h2>Result and Management passwords</h2><p class="muted">Result: ${security.resultPasswordConfigured ? 'Separate password configured' : 'Uses Super Admin password'} · Management: ${security.managementPasswordConfigured ? 'Separate password configured' : 'Uses Super Admin password'}</p><form id="security-password-form" class="catalog-form"><label>Current Super Admin Password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New Result Password<input name="resultPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>New Management Password<input name="managementPassword" type="password" minlength="8" autocomplete="new-password" required></label><button>Save security passwords</button></form><p class="muted">Published Results cannot be edited or deleted.</p></article>${changePasswordPanel()}</section>`;
}

function validityPanel(validity = {}, renewal = null) {
  const end = validity.endsAt ? new Date(validity.endsAt).toLocaleDateString('en-IN') : '—';
  const graceEnd = validity.graceEndsAt ? new Date(validity.graceEndsAt).toLocaleDateString('en-IN') : '—';
  const requestState = renewal ? `<span class="status ${renewal.status === 'APPROVED' ? 'profit' : 'break_even'}">${escapeHtml(renewal.status)}</span>` : '—';
  return `<section class="workspace hidden" data-panel="validity"><article class="card wide"><h2>Account Validity</h2><div class="metrics"><div><span>Status</span><strong>${escapeHtml(validity.status ?? '—')}</strong></div><div><span>Valid Until</span><strong>${end}</strong></div><div><span>Days Left</span><strong>${Number(validity.daysRemaining ?? 0)}</strong></div><div><span>Grace Until</span><strong>${graceEnd}</strong></div><div><span>Grace Days</span><strong>${Number(validity.graceDaysRemaining ?? 0)}</strong></div><div><span>Renewal</span><strong>${requestState}</strong></div></div>${validity.renewalAvailable && renewal?.status !== 'PENDING' ? `<form id="renewal-request-form" class="inline-form"><label>Validity<select name="periodMonths"><option value="6">6 Months</option><option value="12">1 Year</option></select></label><button>Request Renewal</button></form>` : ''}${!validity.canOperate ? '<p class="error">Entry and Result Publish are blocked until Owner approval.</p>' : ''}</article></section>`;
}
function scheduleRow(id, label, start, end) {
  return `<div class="schedule-row" data-schedule-row="${id}"><label class="check"><input type="checkbox" name="schedule_${id}"> ${label}</label><label>Start<input type="time" name="start_${id}" value="${start}"></label><label>End<input type="time" name="end_${id}" value="${end}"></label></div>`;
}
function prizeGroup(title, schemes, values) {
  return `<fieldset class="prize-group"><legend>${title}</legend><div class="prize-grid">${schemes.map(([key, label]) => `<label><span>${label}</span><input name="${key}" type="number" min="0" step="1" value="${values[key]}" required></label>`).join('')}</div></fieldset>`;
}
function reportsWorkspace(reports = []) {
  const rows = reports.slice(0, 100);
  const sellers = [...new Set(rows.map((item) => item.sellerName))];
  const totals = rows.reduce((sum, item) => ({ quantity: sum.quantity + Number(item.totalQuantity ?? 0), sales: sum.sales + Number(item.totalSales ?? 0), prize: sum.prize + Number(item.totalPrize ?? 0), bonus: sum.bonus + Number(item.totalBonus ?? 0), net: sum.net + Number(item.totalNet ?? 0) }), { quantity: 0, sales: 0, prize: 0, bonus: 0, net: 0 });
  const summary = `<div class="metrics report-summary"><div><span>Quantity</span><strong>${totals.quantity}</strong></div><div><span>Sales</span><strong>${money(totals.sales)}</strong></div><div><span>Prize</span><strong>${money(totals.prize)}</strong></div><div><span>Bonus</span><strong>${money(totals.bonus)}</strong></div><div><span>Net</span><strong>${money(totals.net)}</strong></div></div>`;
  return `<section class="workspace hidden" data-panel="reports"><article class="card wide report-list-card"><h2>Detailed Reports</h2>${summary}<form id="report-filter" class="catalog-form"><label>Date<input name="date" type="date"></label><label>Seller<select name="seller"><option value="">All</option>${sellers.map((name) => `<option>${escapeHtml(name)}</option>`).join('')}</select></label><label>Lot Code<select name="lot"><option value="">All</option>${[...new Set(rows.map((item) => item.boardCode))].map((code) => `<option>${escapeHtml(code)}</option>`).join('')}</select></label><label>Show<select name="show"><option value="">All</option>${[...new Set(rows.map((item) => item.showLabel))].map((show) => `<option>${escapeHtml(show)}</option>`).join('')}</select></label></form>${rows.length ? `<table class="report-list"><thead><tr><th>Date</th><th>Seller</th><th>Lot / Show</th><th>Entries / Qty</th><th>Sales</th><th>Prize</th><th>Bonus</th><th>Net</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((report) => `<tr data-date="${escapeHtml(report.businessDate)}" data-seller="${escapeHtml(report.sellerName)}" data-lot="${escapeHtml(report.boardCode)}" data-show="${escapeHtml(report.showLabel)}"><td>${escapeHtml(report.businessDate)}</td><td>${escapeHtml(report.sellerCode ?? '')} · ${escapeHtml(report.sellerName)}</td><td>${escapeHtml(report.boardCode)} · ${escapeHtml(report.showLabel)}</td><td>${report.entryCount} / ${report.totalQuantity}</td><td>${money(report.totalSales)}</td><td>${money(report.totalPrize)}</td><td>${money(report.totalBonus)}</td><td>${money(report.totalNet)}</td><td><span class="status ${report.status === 'FINALIZED' ? 'profit' : 'break_even'}">${escapeHtml(report.status)}</span></td><td><button type="button" class="secondary view-report" data-report-id="${escapeHtml(report.id)}">View</button></td></tr>`).join('')}</tbody></table>` : '<p>No reports.</p>'}</article><div id="report-detail" class="wide"></div></section>`;
}
function sampleDetailedReport() {
  const base = { date: '27/08/2026', time: '10:25:14', billNumber: 'KL3-27-THU-0001', winningNumber: '0204', bonusPercentage: 10, corrected: false };
  const entries = [
    { ...base, sequence: 1, scheme: '3D-30-15K', enteredNumber: '204', quantity: 2, rate: 30, saleAmount: 60, unitPrize: 15000, prizeAmount: 30000, matchRule: 'ABC', bonusAmount: 6, netAmount: -29946 },
    { ...base, sequence: 2, billNumber: 'KL3-27-THU-0002', time: '10:35:14', scheme: '3D-30-15K', enteredNumber: '154', quantity: 3, rate: 30, saleAmount: 90, unitPrize: 0, prizeAmount: 0, matchRule: null, bonusAmount: 9, netAmount: 81 },
    { ...base, sequence: 3, billNumber: 'KL3-27-THU-0003', time: '11:05:10', scheme: '2BC', enteredNumber: '04', quantity: 2, rate: 15, saleAmount: 30, unitPrize: 1000, prizeAmount: 2000, matchRule: 'BC', bonusAmount: 3, netAmount: -1973 },
    { ...base, sequence: 4, billNumber: 'KL3-27-THU-0004', time: '11:20:08', scheme: '1C', enteredNumber: '4', quantity: 5, rate: 13, saleAmount: 65, unitPrize: 100, prizeAmount: 500, matchRule: 'C', bonusAmount: 6.5, netAmount: -441.5 },
    { ...base, sequence: 5, billNumber: 'KL3-27-THU-0005', time: '11:45:02', scheme: '4D-25-1L', enteredNumber: '0204', quantity: 1, rate: 25, saleAmount: 25, unitPrize: 100000, prizeAmount: 100000, matchRule: 'DABC', bonusAmount: 2.5, netAmount: -99977.5 }
  ];
  return { id: 'sample', reportId: 'SAMPLE-DETAILED-REPORT', seller: { id: 'seller-1', code: '01001', name: 'Demo Seller' }, superAdmin: { id: 'admin-1', code: 'SA260001', name: 'Super Admin' }, boardCode: 'KL', showLabel: 'KL 3:00 PM', businessDate: '27/08/2026', createdAt: new Date().toISOString(), status: 'SAMPLE', winningNumber: '0204', totalQuantity: 13, totalSales: 270, totalPrize: 132500, totalBonus: 27, totalNet: -132257, entries, corrections: [] };
}
function reportDetailHtml(report) {
  const canCorrect = expectedRole === 'SUPER_ADMIN';
  const auditRows = report.corrections?.length ? `<details class="audit-history"><summary>Correction Audit History (${report.corrections.length})</summary><table><thead><tr><th>Time</th><th>Transaction</th><th>Field</th><th>Old</th><th>New</th><th>Reason</th></tr></thead><tbody>${report.corrections.map((item) => `<tr><td>${escapeHtml(new Date(item.changedAt).toLocaleString('en-IN'))}</td><td>${escapeHtml(item.transactionId)}</td><td>${escapeHtml(item.changedField)}</td><td>${escapeHtml(item.oldValue)}</td><td>${escapeHtml(item.newValue)}</td><td>${escapeHtml(item.reason)}</td></tr>`).join('')}</tbody></table></details>` : '';
  const rows = report.entries.map((entry) => `<tr><td>${entry.sequence}</td><td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.billNumber)}</td><td>${escapeHtml(entry.time)}</td><td>${escapeHtml(report.boardCode)}</td><td>${escapeHtml(report.showLabel)}</td><td>${escapeHtml(entry.scheme)}</td><td class="number compact-number">${escapeHtml(entry.enteredNumber)}</td><td>${entry.quantity}</td><td>${money(entry.rate)}</td><td>${money(entry.saleAmount)}</td><td>${money(entry.prizeAmount)}</td><td>${entry.matchRule ? `<strong>${escapeHtml(entry.matchRule)}</strong><br>${money(entry.unitPrize)} × ${entry.quantity}` : 'No prize'}</td><td>${money(entry.bonusAmount)}<br><span class="muted">${entry.bonusPercentage}%</span></td><td>${money(entry.netAmount)}${entry.corrected ? '<br><span class="status break_even">CORRECTED</span>' : ''}</td>${canCorrect ? `<td><form class="report-correction-form"><input type="hidden" name="reportId" value="${escapeHtml(report.id)}"><input type="hidden" name="transactionId" value="${escapeHtml(entry.transactionId)}"><input name="enteredNumber" inputmode="numeric" value="${escapeHtml(entry.enteredNumber)}" aria-label="Correct number" required><input name="quantity" type="number" min="1" max="1000" value="${entry.quantity}" aria-label="Correct quantity" required><input name="reason" placeholder="Correction reason" minlength="5" required><input name="actionPassword" type="password" placeholder="Management Password" required><button>Correct</button></form></td>` : ''}</tr>`).join('');
  return `<article class="card wide report-sheet"><div class="report-header"><div><p class="muted">DETAILED SALE REPORT</p><h2>${escapeHtml(report.reportId)}</h2></div><button type="button" class="print-report" data-report-id="${escapeHtml(report.id)}">Print A4 Landscape</button></div><div class="report-meta"><div><span>Seller</span><strong>${escapeHtml(report.seller.code)} · ${escapeHtml(report.seller.name)}</strong></div><div><span>Super Admin</span><strong>${escapeHtml(report.superAdmin.code)} · ${escapeHtml(report.superAdmin.name)}</strong></div><div><span>Lot Code / Show</span><strong>${escapeHtml(report.boardCode)} / ${escapeHtml(report.showLabel)}</strong></div><div><span>Report Date</span><strong>${escapeHtml(report.businessDate)}</strong></div><div><span>Result</span><strong>${escapeHtml(report.winningNumber ?? 'Not published')}</strong></div><div><span>Status</span><strong>${escapeHtml(report.status)}</strong></div></div><div class="bill-table"><table class="report-entry-table detailed-report-table"><thead><tr><th>Sl.</th><th>Date</th><th>Bill No.</th><th>Time</th><th>Lot</th><th>Show</th><th>Scheme</th><th>Number</th><th>Qty</th><th>Rate</th><th>Sold</th><th>Prize</th><th>Prize reason</th><th>Bonus</th><th>Net</th>${canCorrect ? '<th>Super Admin Correction</th>' : ''}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="8">TOTAL</th><th>${report.totalQuantity}</th><th></th><th>${money(report.totalSales)}</th><th>${money(report.totalPrize)}</th><th></th><th>${money(report.totalBonus)}</th><th>${money(report.totalNet)}</th>${canCorrect ? '<th></th>' : ''}</tr></tfoot></table></div>${auditRows}</article>`;
}
async function openSaleReport(reportId) {
  try { const suite = await request(`/api/reports/seller-suite?reportId=${encodeURIComponent(reportId)}`); document.querySelector('#report-detail').innerHTML = sellerReportSuiteHtml(suite); wireReportActions(); document.querySelector('#report-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  catch (error) { notify(error.message, true); }
}
function sellerReportSuiteHtml(suite) {
  const itemRows = suite.itemReport.map((row) => `<tr><td>${escapeHtml(row.scheme)}</td><td>${row.quantity}</td><td>${money(row.amount)}</td><td>${money(row.winning)}</td></tr>`).join('');
  const winningRows = suite.winningReport.map((row) => `<tr><td>${escapeHtml(row.scheme)}</td><td>${row.quantity}</td><td>${money(row.amount)}</td><td>${money(row.winning)}</td></tr>`).join('');
  const billRows = suite.billWinningReport.map((row) => `<tr><td>${escapeHtml(row.billNumber)}</td><td>${escapeHtml(row.time)}</td><td>${row.quantity}</td><td>${money(row.amount)}</td><td>${money(row.prize)}</td></tr>`).join('');
  const menu = `<article class="card wide"><div class="panel-tabs seller-report-menu">${suite.menu.map((name, index) => `<button type="button" class="${index ? '' : 'active'}" data-seller-report-tab="${name}">${name.replace('_', ' ')}</button>`).join('')}</div></article>`;
  const itemTable = (rows) => `<article class="card wide"><table><thead><tr><th>Scheme</th><th>Qty</th><th>Amount</th><th>Winning</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No winning entries</td></tr>'}</tbody></table></article>`;
  const metric = (title, values) => `<article class="card wide"><h2>${title}</h2><div class="metrics">${Object.entries(values).map(([key, value]) => `<div><span>${escapeHtml(key.replaceAll('_', ' '))}</span><strong>${typeof value === 'number' && ['sales', 'prize', 'balance', 'amount'].some((word) => key.toLowerCase().includes(word)) ? money(value) : value}</strong></div>`).join('')}</div></article>`;
  return `${menu}<div data-seller-report-panel="ENTRY">${reportDetailHtml(suite.report)}</div><div class="hidden" data-seller-report-panel="ITEM">${itemTable(itemRows)}</div><div class="hidden" data-seller-report-panel="SALES">${metric('Sales Report', suite.salesReport)}</div><div class="hidden" data-seller-report-panel="WINNING">${itemTable(winningRows)}</div><div class="hidden" data-seller-report-panel="PAYMENT">${metric('Payment Report', suite.paymentReport)}</div><div class="hidden" data-seller-report-panel="BILL_WINNING"><article class="card wide"><table><thead><tr><th>Bill No.</th><th>Time</th><th>Qty</th><th>Amount</th><th>Prize</th></tr></thead><tbody>${billRows}</tbody></table></article></div><div class="hidden" data-seller-report-panel="SUMMARY">${metric('Summary Report', suite.summaryReport)}</div>`;
}
function printableReportHtml(report) {
  const rows = report.entries.map((entry) => `<tr><td>${entry.sequence}</td><td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.billNumber)}</td><td>${escapeHtml(entry.time)}</td><td>${escapeHtml(report.boardCode)}</td><td>${escapeHtml(report.showLabel)}</td><td>${escapeHtml(entry.scheme)}</td><td>${escapeHtml(entry.enteredNumber)}</td><td>${entry.quantity}</td><td>${money(entry.rate)}</td><td>${money(entry.saleAmount)}</td><td>${money(entry.prizeAmount)}</td><td>${entry.matchRule ? `${escapeHtml(entry.matchRule)} · ${money(entry.unitPrize)} × ${entry.quantity}` : 'No prize'}</td><td>${money(entry.bonusAmount)} (${entry.bonusPercentage}%)</td><td>${money(entry.netAmount)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.reportId)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;font-size:8px}h1{font-size:17px;margin:0 0 6px}.meta{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:8px 0}.meta div{border:1px solid #bbb;padding:5px}.meta span{display:block;color:#555;font-size:7px}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}th,td{border:1px solid #999;padding:3px;text-align:left;white-space:nowrap}tfoot{font-weight:bold;background:#eee}.lock{float:right;border:1px solid #111;padding:4px}</style></head><body><span class="lock">PERMANENT / DELETE LOCKED</span><h1>DETAILED SALE REPORT · ${escapeHtml(report.reportId)}</h1><div class="meta"><div><span>Seller</span>${escapeHtml(report.seller.code)} · ${escapeHtml(report.seller.name)}</div><div><span>Super Admin</span>${escapeHtml(report.superAdmin.code)} · ${escapeHtml(report.superAdmin.name)}</div><div><span>Lot / Show</span>${escapeHtml(report.boardCode)} / ${escapeHtml(report.showLabel)}</div><div><span>Date</span>${escapeHtml(report.businessDate)}</div><div><span>Status / Result</span>${escapeHtml(report.status)} / ${escapeHtml(report.winningNumber ?? 'Not published')}</div></div><table><thead><tr><th>Sl.</th><th>Date</th><th>Bill No.</th><th>Time</th><th>Lot</th><th>Show</th><th>Scheme</th><th>Number</th><th>Qty</th><th>Rate</th><th>Sold</th><th>Prize</th><th>Prize reason</th><th>Bonus</th><th>Net</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="8">TOTAL</td><td>${report.totalQuantity}</td><td></td><td>${money(report.totalSales)}</td><td>${money(report.totalPrize)}</td><td></td><td>${money(report.totalBonus)}</td><td>${money(report.totalNet)}</td></tr></tfoot></table><script>window.onload=()=>window.print()<\/script></body></html>`;
}
function wireReportActions() {
  document.querySelectorAll('.view-sample-report').forEach((button) => button.addEventListener('click', () => { document.querySelector('#report-detail').innerHTML = reportDetailHtml(sampleDetailedReport()); wireReportActions(); document.querySelector('#report-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  document.querySelectorAll('.view-report').forEach((button) => button.addEventListener('click', () => openSaleReport(button.dataset.reportId)));
  document.querySelectorAll('.print-report').forEach((button) => button.addEventListener('click', async () => { const printWindow = window.open('', '_blank'); try { const report = button.dataset.reportId === 'sample' ? sampleDetailedReport() : await request(`/api/reports/sale?reportId=${encodeURIComponent(button.dataset.reportId)}`); printWindow.document.write(printableReportHtml(report)); printWindow.document.close(); } catch (error) { printWindow?.close(); notify(error.message, true); } }));
  document.querySelectorAll('.report-correction-form').forEach((form) => form.addEventListener('submit', async (event) => { event.preventDefault(); try { const report = await request('/api/reports/sale-entry', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); document.querySelector('#report-detail').innerHTML = reportDetailHtml(report); wireReportActions(); notify('Correction saved with permanent audit history'); } catch (error) { notify(error.message, true); } }));
  document.querySelectorAll('[data-seller-report-tab]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-seller-report-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('[data-seller-report-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.sellerReportPanel !== button.dataset.sellerReportTab));
  }));
  document.querySelector('#report-filter')?.addEventListener('change', (event) => {
    const values = Object.fromEntries(new FormData(event.currentTarget));
    document.querySelectorAll('.report-list tbody tr').forEach((row) => { row.hidden = Boolean((values.date && row.dataset.date !== values.date) || (values.seller && row.dataset.seller !== values.seller) || (values.lot && row.dataset.lot !== values.lot) || (values.show && row.dataset.show !== values.show)); });
  });
}
function wireActions() {
  document.querySelector('#result-form')?.addEventListener('submit', publishResult);
  document.querySelectorAll('.publish-scope').forEach((button) => button.addEventListener('click', () => {
    const form = document.querySelector('#result-form');
    if (!form) return;
    form.elements.boardId.value = button.dataset.boardId;
    syncResultShows('publish');
    form.elements.showId.value = button.dataset.showId;
    form.elements.resultDate.value = button.dataset.resultDate;
    form.querySelector('input[name="winningNumber"]')?.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  wireReportActions();
  document.querySelector('#preview-form')?.addEventListener('submit', previewResult);
  for (const prefix of ['publish', 'preview']) document.querySelector(`#${prefix}-result-board`)?.addEventListener('change', () => { syncResultShows(prefix); if (prefix === 'preview') refreshCandidates(); });
  document.querySelector('#preview-result-show')?.addEventListener('change', refreshCandidates);
  document.querySelector('#preview-form input[name="resultDate"]')?.addEventListener('change', refreshCandidates);
  document.querySelector('#user-form')?.addEventListener('submit', async (event) => submitForm(event, '/api/users'));
  document.querySelectorAll('.seller-commission-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await request('/api/users/seller-commission', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('Seller commission percentage saved'); await renderDashboard(); switchPanel(expectedRole === 'SUPER_ADMIN' ? 'distributors' : 'network'); }
    catch (error) { notify(error.message, true); }
  }));
  document.querySelector('#distributor-form')?.addEventListener('submit', createDistributor);
  document.querySelector('#direct-seller-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const board = currentDashboard.boards.find((item) => item.id === values.lotCodeId);
    const selected = new Set(new FormData(event.currentTarget).getAll('assignedDirectScheme'));
    const catalogSchemeRates = Object.fromEntries(currentDashboard.schemeCatalog.filter((scheme) => board?.schemeIds?.includes(scheme.id) && (scheme.universal || selected.has(scheme.id))).map((scheme) => [scheme.id, { enabled: true, rate: Number(scheme.minimumRate ?? scheme.mrp ?? scheme.defaultRate ?? 0) }]));
    const graceMinutes = Object.fromEntries(['show1', 'show2', 'show3', 'show4', 'show5'].map((id) => [id, Number(values[`grace_${id}`] ?? 0)]));
    try {
      if (values.sellerId) {
        const enabled = values.lotCodeEnabled === 'on';
        await request('/api/users/seller-settings', { method: 'PUT', body: JSON.stringify(enabled ? { sellerId: values.sellerId, lotCodeId: values.lotCodeId, catalogSchemeRates, commissionPercentage: Number(values.commissionPercentage), graceMinutes, actionPassword: values.actionPassword } : { sellerId: values.sellerId, lotCodeId: values.lotCodeId, removeLotCode: true, actionPassword: values.actionPassword }) });
        notify(enabled ? 'Seller Lot Code and Scheme access updated' : 'Seller Lot Code removed');
      } else {
        await request('/api/users', { method: 'POST', body: JSON.stringify({ ...values, catalogSchemeRates, graceMinutes }) });
        notify('Direct Seller created under Super Admin');
      }
      await renderDashboard(); switchPanel('direct-sellers');
    }
    catch (error) { notify(error.message, true); }
  });
  const updateDirectSellerSchemes = () => {
    const lotCodeId = document.querySelector('#direct-seller-lot-code')?.value;
    document.querySelectorAll('.direct-seller-scheme').forEach((label) => {
      const allowed = label.dataset.lotIds.split(' ').includes(lotCodeId);
      label.hidden = !allowed;
      const checkbox = label.querySelector('input');
      checkbox.name = allowed ? 'assignedDirectScheme' : '';
      checkbox.disabled = !allowed;
      if (!allowed) checkbox.checked = false;
    });
  };
  document.querySelector('#direct-seller-lot-code')?.addEventListener('change', () => loadDirectSellerSettings(true));
  document.querySelector('#direct-seller-selector')?.addEventListener('change', loadDirectSellerSettings);
  document.querySelector('#select-all-direct-seller-schemes')?.addEventListener('click', () => document.querySelectorAll('.direct-seller-scheme:not([hidden]) input').forEach((input) => { input.checked = true; }));
  updateDirectSellerSchemes();
  loadDirectSellerSettings();
  document.querySelectorAll('.distributor-bonus-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await request('/api/bonus-rules', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('Distributor bonus percentage saved'); await renderDashboard(); switchPanel('distributors'); }
    catch (error) { notify(error.message, true); }
  }));
  document.querySelector('#distributor-selector')?.addEventListener('change', loadDistributorSettings);
  document.querySelector('#distributor-lot-code')?.addEventListener('change', loadLotCodeAssignment);
  document.querySelector('#select-all-distributor-schemes')?.addEventListener('click', selectAllDistributorSchemes);
  updateDistributorCatalog();
  document.querySelector('#ticket-form')?.addEventListener('submit', addToBill);
  const updateSaleTotal = () => {
    const form = document.querySelector('#ticket-form');
    if (!form) return;
    const catalogId = document.querySelector('#catalog-scheme')?.value;
    const catalog = currentDashboard.schemeCatalog.find((item) => item.id === catalogId);
    const unitPrice = Number(catalog?.mrp ?? form.dataset.unitPrice);
    const multiplier = ['scheme-all-single', 'scheme-all-doubles'].includes(catalogId) ? 3 : 1;
    const quantity = Math.max(0, Number(document.querySelector('#ticket-quantity').value) || 0);
    const total = document.querySelector('#sale-total');
    const calculation = document.querySelector('#sale-calculation');
    if (total) total.textContent = money(unitPrice * quantity * multiplier);
    if (calculation) calculation.textContent = `${money(unitPrice)} × ${quantity} × ${multiplier} position${multiplier === 1 ? '' : 's'}`;
  };
  document.querySelector('#ticket-quantity')?.addEventListener('input', updateSaleTotal);
  document.querySelectorAll('.lot-code-choice').forEach((button) => button.addEventListener('click', () => {
    const boardSelect = document.querySelector('#board');
    boardSelect.value = button.dataset.boardChoice;
    boardSelect.dispatchEvent(new Event('change'));
    document.querySelectorAll('.lot-code-choice').forEach((item) => item.classList.toggle('active', item === button));
    updateSellerClock();
  }));
  document.querySelector('#box-entry-toggle')?.addEventListener('click', () => {
    const input = document.querySelector('#box-entry');
    input.checked = !input.checked;
    document.querySelector('#box-entry-toggle').classList.toggle('active', input.checked);
    document.querySelector('#entry-mode-label').textContent = input.checked ? 'BOX Entry selected' : 'Straight Entry';
    document.querySelector('#ticket-number')?.focus();
  });
  document.querySelectorAll('.quantity-shortcut').forEach((button) => button.addEventListener('click', () => {
    const quantityInput = document.querySelector('#ticket-quantity');
    quantityInput.value = button.dataset.quantity;
    updateSaleTotal();
    const form = document.querySelector('#ticket-form');
    if (!form.reportValidity()) { document.querySelector('#ticket-number')?.focus(); return; }
    form.requestSubmit();
  }));
  document.querySelector('#board')?.addEventListener('change', (event) => {
    const board = currentDashboard.boards.find((item) => item.id === event.currentTarget.value);
    document.querySelector('#catalog-scheme').innerHTML = boardCatalogOptions(board, currentDashboard.schemeCatalog);
    document.querySelector('#seller-show').innerHTML = sellerShowOptions(board);
    syncSellerCatalogSelection(); updateSaleTotal();
  });
  document.querySelector('#seller-show')?.addEventListener('change', updateSellerClock);
  document.querySelector('#catalog-scheme')?.addEventListener('change', () => { syncSellerCatalogSelection(); updateSaleTotal(); requestAnimationFrame(() => document.querySelector('#ticket-number')?.focus()); });
  document.querySelector('#scheme')?.addEventListener('change', (event) => {
    const length = event.currentTarget.selectedOptions[0].dataset.length;
    const input = document.querySelector('#ticket-number');
    input.maxLength = Number(length); input.pattern = `[0-9]{${length}}`; input.placeholder = '0'.repeat(Number(length)); input.value = '';
    updateSaleTotal();
  });
  selectCurrentSellerScope(); syncSellerCatalogSelection(); updateSaleTotal();
  if (expectedRole === 'SELLER') {
    clearInterval(sellerClockTimer);
    updateSellerClock();
    sellerClockTimer = setInterval(updateSellerClock, 1000);
    document.querySelector('#ticket-number')?.focus();
  }
  document.querySelector('#profit-target-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/api/settings', { method: 'PUT', body: JSON.stringify({ minimumProfit: { mode: values.mode, value: Number(values.value) }, actionPassword: values.actionPassword }) }); notify('Minimum profit target saved'); await renderDashboard(); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelector('#scheme-prize-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const actionPassword = values.actionPassword;
    delete values.actionPassword;
    const schemePrizes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    try { await request('/api/settings', { method: 'PUT', body: JSON.stringify({ schemePrizes, actionPassword }) }); notify('Scheme prize amounts saved'); await renderDashboard(); switchPanel('schemes'); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelector('#board-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await request('/api/settings/boards', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('Lot Code added'); await renderDashboard(); switchPanel('lot-codes'); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelector('#catalog-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of ['fourDigitPrize', 'threeDigitPrize', 'twoDigitPrize', 'singleDigitPrize', 'minimumRate', 'mrp']) values[key] = Number(values[key]);
    values.defaultRate = values.mrp;
    try { await request('/api/settings/scheme-catalog', { method: 'POST', body: JSON.stringify(values) }); notify('Scheme created'); await renderDashboard(); switchPanel('schemes'); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelectorAll('.save-scheme-price').forEach((button) => button.addEventListener('click', async () => {
    const row = button.closest('[data-scheme-price-row]');
    const payload = { id: button.dataset.schemeId };
    row.querySelectorAll('[data-price]').forEach((input) => { payload[input.dataset.price] = Number(input.value); });
    row.querySelectorAll('[data-prize]').forEach((input) => { payload[input.dataset.prize] = Number(input.value); });
    payload.defaultRate = payload.mrp;
    payload.actionPassword = document.querySelector('#scheme-price-password')?.value ?? '';
    try { await request('/api/settings/scheme-catalog', { method: 'PUT', body: JSON.stringify(payload) }); notify('Scheme prices saved'); await renderDashboard(); switchPanel('schemes'); }
    catch (error) { notify(error.message, true); }
  }));
  document.querySelector('#board-config-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const board = currentDashboard.boards.find((item) => item.id === values.get('boardId'));
    const schedules = ['show1', 'show2', 'show3', 'show4', 'show5'].map((key, index) => ({ id: key, label: board?.schedules?.find((item) => item.id === key)?.label ?? `${board?.code ?? 'Show'} ${index + 1}`, enabled: values.get(`schedule_${key}`) === 'on', startTime: values.get(`start_${key}`), endTime: values.get(`end_${key}`) }));
    const dateOverride = board?.code === 'KL' && values.get('specialDate') && values.get('specialEndTime') ? { date: values.get('specialDate'), endTime: values.get('specialEndTime') } : null;
    const payload = { boardId: values.get('boardId'), schemeIds: values.getAll('assignedScheme'), schedules, dateOverride, actionPassword: values.get('actionPassword') };
    try { await request('/api/settings/boards/config', { method: 'PUT', body: JSON.stringify(payload) }); notify('Lot Code schemes and timings saved'); await renderDashboard(); switchPanel('lot-codes'); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelector('#config-lot-code')?.addEventListener('change', updateLotCodeSchemeSelection);
  updateLotCodeSchemeSelection();
  document.querySelector('#security-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await request('/api/security/action-passwords', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('Security passwords saved'); event.currentTarget.reset(); await renderDashboard(); switchPanel('security'); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelector('#change-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/api/me/password', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      sessionStorage.removeItem(`token:${expectedRole}`); token = null; showLogin('Password changed. Sign in with the new password.');
    } catch (error) { notify(error.message, true); }
  });
  document.querySelectorAll('.user-password-reset-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await request('/api/users/password-reset', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('User password reset. Their old sessions are closed.'); event.currentTarget.reset(); }
    catch (error) { notify(error.message, true); }
  }));
  document.querySelector('#renewal-request-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await request('/api/license/renewal-request', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('Renewal request sent to Owner'); await renderDashboard(); switchPanel('validity'); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelectorAll('[data-panel-tab]').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.panelTab)));
  document.querySelectorAll('[data-ticket-filter]').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest('.card');
    const selected = button.dataset.ticketFilter;
    card.querySelectorAll('[data-ticket-filter]').forEach((item) => item.classList.toggle('active', item === button));
    card.querySelectorAll('[data-ticket-board]').forEach((row) => { row.hidden = selected !== 'ALL' && row.dataset.ticketBoard !== selected; });
  }));
  wireCandidateActions();
  wireBillActions();
  wireWeeklyActions();
  document.querySelector('#distributor-week-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const values = Object.fromEntries(new FormData(event.currentTarget)); const data = await request(`/api/reports/distributor-weekly?weekStart=${encodeURIComponent(values.weekStart)}`); document.querySelector('#distributor-accounts-panel').innerHTML = distributorAccountsPanel(data); wireActionsForDistributorAccounts(); }
    catch (error) { notify(error.message, true); }
  });
}
function wireActionsForDistributorAccounts() {
  document.querySelector('#distributor-week-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const values = Object.fromEntries(new FormData(event.currentTarget)); const data = await request(`/api/reports/distributor-weekly?weekStart=${encodeURIComponent(values.weekStart)}`); document.querySelector('#distributor-accounts-panel').innerHTML = distributorAccountsPanel(data); wireActionsForDistributorAccounts(); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelectorAll('.seller-payment-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const data = await request('/api/seller-payments', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); document.querySelector('#distributor-accounts-panel').innerHTML = distributorAccountsPanel(data.accounts); wireActionsForDistributorAccounts(); notify('Seller payment recorded'); }
    catch (error) { notify(error.message, true); }
  }));
}
function wireCandidateActions() {
  document.querySelectorAll('[data-candidate]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('#publish-number').value = button.dataset.candidate;
    document.querySelector('#publish-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelector('#publish-number').focus();
    notify(`${button.dataset.candidate} selected. Review and publish when ready.`);
  }));
}
async function refreshCandidates() {
  const form = document.querySelector('#preview-form');
  if (!form) return;
  const values = Object.fromEntries(new FormData(form));
  if (!values.boardId || !values.showId || !values.resultDate) return;
  try { const data = await request(`/api/reports/result-candidates?boardId=${encodeURIComponent(values.boardId)}&showId=${encodeURIComponent(values.showId)}&resultDate=${encodeURIComponent(values.resultDate)}`); document.querySelector('#candidate-panel').outerHTML = candidatePanel(data); wireCandidateActions(); }
  catch (error) { notify(error.message, true); }
}
function wireWeeklyActions() {
  document.querySelector('#weekly-range-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const values = Object.fromEntries(new FormData(event.currentTarget)); const data = await request(`/api/reports/weekly-accounts?weekStart=${encodeURIComponent(values.weekStart)}`); document.querySelector('#weekly-accounts-panel').outerHTML = weeklyAccountsPanel(data); wireWeeklyActions(); }
    catch (error) { notify(error.message, true); }
  });
  document.querySelectorAll('.weekly-payment-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const data = await request('/api/weekly-payments', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); document.querySelector('#weekly-accounts-panel').outerHTML = weeklyAccountsPanel(data.accounts); wireWeeklyActions(); notify('Weekly payment recorded'); }
    catch (error) { notify(error.message, true); }
  }));
  document.querySelector('#daily-expense-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const data = await request('/api/daily-expenses', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); document.querySelector('#weekly-accounts-panel').outerHTML = weeklyAccountsPanel(data.accounts); wireWeeklyActions(); notify('Daily expense recorded'); }
    catch (error) { notify(error.message, true); }
  });
}
function syncResultShows(prefix) {
  const board = currentDashboard.boards.find((item) => item.id === document.querySelector(`#${prefix}-result-board`)?.value);
  const shows = board?.schedules?.filter((item) => item.enabled).length ? board.schedules.filter((item) => item.enabled) : [{ id: 'all-day', label: 'All Day' }];
  const select = document.querySelector(`#${prefix}-result-show`);
  if (select) select.innerHTML = shows.map((show) => `<option value="${escapeHtml(show.id)}">${escapeHtml(show.label)}</option>`).join('');
}
function switchPanel(name) {
  document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== name));
  document.querySelectorAll('[data-panel-tab]').forEach((button) => button.classList.toggle('active', button.dataset.panelTab === name));
}
async function createDistributor(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const values = Object.fromEntries(formData);
  const catalogSchemeRates = Object.fromEntries(currentDashboard.schemeCatalog.map((scheme) => [scheme.id, { enabled: values[`catalog_scheme_${scheme.id}`] === 'on', rate: Number(scheme.mrp ?? scheme.defaultRate ?? 0) }]));
  const graceMinutes = Object.fromEntries(['show1', 'show2', 'show3', 'show4', 'show5'].map((id) => [id, Number(values[`grace_${id}`] ?? 0)]));
  try {
    if (values.distributorId) {
      await request('/api/users/distributor-settings', { method: 'PUT', body: JSON.stringify({ distributorId: values.distributorId, lotCodeId: values.lotCodeId, catalogSchemeRates, graceMinutes, actionPassword: values.actionPassword }) });
      notify('Distributor Lot Code schemes and rates saved');
    } else {
      await request('/api/users', { method: 'POST', body: JSON.stringify({ role: 'DISTRIBUTOR', name: values.name, phone: values.phone, password: values.password, lotCodeId: values.lotCodeId, catalogSchemeRates, graceMinutes, actionPassword: values.actionPassword }) });
      notify('Distributor added with scheme rates');
    }
    await renderDashboard(); switchPanel('distributors');
  } catch (error) { notify(error.message, true); }
}
function loadDirectSellerSettings(preserveLot = false) {
  const selector = document.querySelector('#direct-seller-selector');
  const form = document.querySelector('#direct-seller-form');
  if (!selector || !form) return;
  const seller = currentUsers.find((item) => item.id === selector.value && item.role === 'SELLER');
  const newFields = document.querySelector('#new-direct-seller-fields');
  newFields?.classList.toggle('hidden', Boolean(seller));
  newFields?.querySelectorAll('input').forEach((input) => { input.required = !seller; input.disabled = Boolean(seller); });
  const lotCode = document.querySelector('#direct-seller-lot-code');
  if (lotCode && !preserveLot) lotCode.value = seller?.lotCodeIds?.[0] ?? currentDashboard.boards[0]?.id ?? '';
  const selectedLot = lotCode?.value;
  const lotEnabled = document.querySelector('#seller-lot-enabled');
  if (lotEnabled) { lotEnabled.checked = seller ? Boolean(seller.lotCodeIds?.includes(selectedLot)) : true; lotEnabled.disabled = !seller; }
  document.querySelectorAll('.direct-seller-scheme').forEach((label) => {
    const allowed = label.dataset.lotIds.split(' ').includes(selectedLot);
    label.hidden = !allowed;
    const checkbox = label.querySelector('input');
    checkbox.name = allowed ? 'assignedDirectScheme' : '';
    checkbox.disabled = !allowed;
    const assignment = seller?.lotCodeSchemeRates?.[selectedLot]?.[checkbox.value];
    checkbox.checked = allowed && Boolean(assignment?.enabled);
  });
  const grace = seller?.lotCodeGraceMinutes?.[selectedLot] ?? {};
  document.querySelectorAll('.direct-seller-grace').forEach((label) => {
    const allowed = label.dataset.lotIds.split(' ').includes(selectedLot);
    label.hidden = !allowed;
    const input = label.querySelector('input');
    input.disabled = !allowed;
    input.value = allowed ? Number(grace[input.name.replace('grace_', '')] ?? 0) : 0;
  });
  const commission = form.querySelector('[name="commissionPercentage"]');
  if (commission) commission.value = Number(seller?.commissionPercentage ?? 0);
  const save = document.querySelector('#save-direct-seller');
  if (save) save.textContent = seller ? 'Update Seller' : 'Create Direct Seller';
}
function loadDistributorSettings() {
  const selector = document.querySelector('#distributor-selector');
  if (!selector) return;
  const distributor = currentUsers.find((item) => item.id === selector.value);
  const fields = document.querySelector('#new-distributor-fields');
  fields.classList.toggle('hidden', Boolean(distributor));
  fields.querySelectorAll('input').forEach((input) => { input.required = !distributor; input.disabled = Boolean(distributor); });
  document.querySelector('#save-distributor').textContent = distributor ? 'Save Distributor' : 'Add Distributor';
  const lotCode = document.querySelector('#distributor-lot-code');
  lotCode.value = distributor?.lotCodeIds?.[0] ?? distributor?.lotCodeId ?? currentDashboard.boards[0]?.id ?? '';
  loadLotCodeAssignment();
}
function loadLotCodeAssignment() {
  const distributor = currentUsers.find((item) => item.id === document.querySelector('#distributor-selector')?.value);
  const lotCodeId = document.querySelector('#distributor-lot-code')?.value;
  updateDistributorCatalog();
  currentDashboard.schemeCatalog.forEach((scheme) => {
    const checkbox = document.querySelector(`[name="catalog_scheme_${scheme.id}"]`);
    const rate = document.querySelector(`[name="catalog_rate_${scheme.id}"]`);
    if (!checkbox) return;
    const assignment = distributor?.lotCodeSchemeRates?.[lotCodeId]?.[scheme.id];
    checkbox.checked = Boolean(assignment?.enabled);
    if (rate) rate.value = assignment?.rate ?? Math.max(scheme.defaultRate ?? 12, scheme.minimumRate ?? 10);
  });
  const grace = distributor?.lotCodeGraceMinutes?.[lotCodeId] ?? {};
  for (const id of ['show1', 'show2', 'show3', 'show4', 'show5']) {
    const input = document.querySelector(`[name="grace_${id}"]`);
    if (input) input.value = grace[id] ?? 0;
  }
}
function updateDistributorCatalog() {
  const selectedLot = document.querySelector('#distributor-lot-code')?.value;
  document.querySelectorAll('.catalog-rate').forEach((card) => {
    const allowed = card.dataset.lotIds.split(' ').includes(selectedLot);
    card.classList.toggle('hidden', !allowed);
    card.querySelectorAll('input').forEach((input) => { input.disabled = !allowed; });
  });
}
function selectAllDistributorSchemes(event) {
  const scope = event?.currentTarget?.closest('fieldset') ?? document;
  scope.querySelectorAll('.catalog-rate:not(.hidden) input[type="checkbox"]:not(:disabled)').forEach((input) => { input.checked = true; });
}
function updateLotCodeSchemeSelection() {
  const selectedId = document.querySelector('#config-lot-code')?.value;
  const lotCode = currentDashboard.boards.find((item) => item.id === selectedId);
  const isKerala = lotCode?.code === 'KL';
  const isDear = lotCode?.code === 'DR';
  document.querySelector('#timing-legend').textContent = isKerala ? 'Kerala Timing — 1 Show' : isDear ? 'Dear Timings — 3 Shows' : 'Daily Timings';
  document.querySelector('#kerala-date-override')?.classList.toggle('hidden', !isKerala);
  document.querySelectorAll('[data-schedule-row]').forEach((row) => {
    const index = Number(row.dataset.scheduleRow.replace('show', ''));
    const hidden = isKerala ? index > 1 : isDear ? index > 3 : false;
    row.classList.toggle('hidden', hidden);
    row.querySelectorAll('input').forEach((input) => { input.disabled = hidden; });
  });
  document.querySelectorAll('#board-config-form [name="assignedScheme"]').forEach((input) => {
    input.checked = input.dataset.universal === 'true' || Boolean(lotCode?.schemeIds?.includes(input.value));
  });
  for (const id of ['show1', 'show2', 'show3', 'show4', 'show5']) {
    const schedule = lotCode?.schedules?.find((item) => item.id === id);
    const checkbox = document.querySelector(`[name="schedule_${id}"]`);
    const start = document.querySelector(`[name="start_${id}"]`);
    const end = document.querySelector(`[name="end_${id}"]`);
    if (checkbox) checkbox.checked = Boolean(schedule?.enabled);
    if (start) start.value = schedule?.startTime ?? start.defaultValue;
    if (end) end.value = schedule?.endTime ?? end.defaultValue;
  }
  const specialDate = document.querySelector('[name="specialDate"]');
  const specialEndTime = document.querySelector('[name="specialEndTime"]');
  if (specialDate) specialDate.value = lotCode?.dateOverride?.date ?? '';
  if (specialEndTime) specialEndTime.value = lotCode?.dateOverride?.endTime ?? '14:00';
}
function addToBill(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const schemeOption = document.querySelector('#scheme').selectedOptions[0];
  const boardOption = document.querySelector('#board').selectedOptions[0];
  const catalogOption = document.querySelector('#catalog-scheme').selectedOptions[0];
  const quantity = Number(values.quantity);
  if (saleCart.length && (saleCart[0].boardId !== values.boardId || saleCart[0].showId !== values.showId)) { notify('Finish the current Lot Code and Show bill before selecting another one', true); return; }
  const catalog = currentDashboard.schemeCatalog.find((item) => item.id === values.catalogSchemeId);
  const selectedBoard = currentDashboard.boards.find((item) => item.id === values.boardId);
  const unitPrice = Number(catalog?.mrp ?? event.currentTarget.dataset.unitPrice);
  const numbers = values.boxEntry === 'on' ? uniqueNumberPermutations(values.number) : [values.number];
  const targetIds = values.catalogSchemeId === 'scheme-all-single' ? ['scheme-a', 'scheme-b', 'scheme-c'] : values.catalogSchemeId === 'scheme-all-doubles' ? ['scheme-ab', 'scheme-ac', 'scheme-bc'] : [values.catalogSchemeId];
  const targets = targetIds.map((id) => currentDashboard.schemeCatalog.find((item) => item.id === id)).filter(Boolean);
  for (const targetCatalog of targets) for (const number of numbers) {
    const targetScheme = ['A', 'B', 'C'].includes(targetCatalog.pattern) ? 'ONE_DIGIT_STANDARD' : ['AB', 'AC', 'BC'].includes(targetCatalog.pattern) ? 'TWO_DIGIT_STANDARD' : values.scheme;
    const targetPrice = Number(targetCatalog.mrp ?? unitPrice);
    const existing = saleCart.find((item) => item.boardId === values.boardId && item.catalogSchemeId === targetCatalog.id && item.scheme === targetScheme && item.number === number);
    if (existing) existing.quantity += quantity;
    else saleCart.push({ boardId: values.boardId, boardCode: selectedBoard?.code ?? boardOption.textContent, showId: values.showId, showLabel: document.querySelector('#seller-show')?.selectedOptions[0]?.textContent ?? values.showId, catalogSchemeId: targetCatalog.id, catalogSchemeName: targetCatalog.name, scheme: targetScheme, schemeLabel: schemeOption.textContent, number, quantity, unitPrice: targetPrice, boxEntry: values.boxEntry === 'on' });
  }
  event.currentTarget.querySelector('#ticket-number').value = '';
  event.currentTarget.querySelector('#ticket-quantity').value = '1';
  const boxInput = event.currentTarget.querySelector('#box-entry');
  const boxToggle = event.currentTarget.querySelector('#box-entry-toggle');
  if (boxInput) boxInput.checked = false;
  boxToggle?.classList.remove('active');
  const modeLabel = event.currentTarget.querySelector('#entry-mode-label');
  if (modeLabel) modeLabel.textContent = 'Straight Entry';
  const total = document.querySelector('#sale-total');
  const calculation = document.querySelector('#sale-calculation');
  if (total) total.textContent = money(unitPrice);
  if (calculation) calculation.textContent = `${money(unitPrice)} × 1 ticket`;
  document.querySelector('#bill-content').innerHTML = billContent();
  wireBillActions();
  const addedCount = numbers.length * targets.length;
  notify(values.boxEntry === 'on' ? `${addedCount} BOX entries added to bill` : `${addedCount} ${addedCount === 1 ? 'entry' : 'entries'} added to bill`);
  event.currentTarget.querySelector('#ticket-number')?.focus();
}
function uniqueNumberPermutations(number) {
  const output = new Set();
  const visit = (prefix, remaining) => {
    if (!remaining.length) { output.add(prefix); return; }
    for (let index = 0; index < remaining.length; index += 1) visit(prefix + remaining[index], remaining.slice(0, index) + remaining.slice(index + 1));
  };
  visit('', String(number));
  return [...output];
}
function selectCurrentSellerScope() {
  if (expectedRole !== 'SELLER') return;
  const indiaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const secondsNow = indiaNow.getHours() * 3600 + indiaNow.getMinutes() * 60 + indiaNow.getSeconds();
  const candidates = (currentDashboard?.boards ?? []).flatMap((board) => (board.schedules ?? []).filter((show) => show.enabled && show.startTime && show.endTime).map((show) => {
    const [startHour, startMinute] = show.startTime.split(':').map(Number);
    const [endHour, endMinute] = (show.effectiveEndTime ?? show.endTime).split(':').map(Number);
    return { board, show, startSeconds: startHour * 3600 + startMinute * 60, endSeconds: endHour * 3600 + endMinute * 60 + 59 };
  })).filter((item) => item.startSeconds <= secondsNow && item.endSeconds >= secondsNow).sort((a, b) => a.endSeconds - b.endSeconds);
  const current = candidates[0];
  if (!current) return;
  const boardSelect = document.querySelector('#board');
  if (!boardSelect) return;
  boardSelect.value = current.board.id;
  boardSelect.dispatchEvent(new Event('change'));
  const showSelect = document.querySelector('#seller-show');
  if (showSelect) showSelect.value = current.show.id;
  document.querySelectorAll('.lot-code-choice').forEach((button) => button.classList.toggle('active', button.dataset.boardChoice === current.board.id));
  updateSellerClock();
}
function updateSellerClock() {
  if (expectedRole !== 'SELLER') return;
  const now = new Date();
  const date = document.querySelector('#entry-date');
  const time = document.querySelector('#entry-time');
  if (date) date.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
  if (time) time.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
  const board = currentDashboard?.boards?.find((item) => item.id === document.querySelector('#board')?.value);
  const indiaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const secondsNow = indiaNow.getHours() * 3600 + indiaNow.getMinutes() * 60 + indiaNow.getSeconds();
  const schedules = (board?.schedules ?? []).filter((item) => item.enabled && item.startTime && item.endTime).map((item) => { const [startHour, startMinute] = item.startTime.split(':').map(Number); const [endHour, endMinute] = (item.effectiveEndTime ?? item.endTime).split(':').map(Number); return { ...item, startSeconds: startHour * 3600 + startMinute * 60, endSeconds: endHour * 3600 + endMinute * 60 + 59 }; });
  const selectedShowId = document.querySelector('#seller-show')?.value;
  const selected = schedules.find((item) => item.id === selectedShowId);
  const active = selected && selected.startSeconds <= secondsNow && selected.endSeconds >= secondsNow ? selected : null;
  const upcoming = selected && selected.startSeconds > secondsNow ? selected : null;
  const countdown = document.querySelector('#entry-countdown');
  const countdownLabel = document.querySelector('#entry-countdown-label');
  const show = document.querySelector('#entry-show');
  const status = document.querySelector('#entry-status');
  if (!active && !upcoming) { if (countdownLabel) countdownLabel.textContent = 'Entry status'; if (countdown) countdown.textContent = 'CLOSED'; if (show) show.textContent = 'No more entry today'; if (status) { status.textContent = 'CLOSED'; status.className = 'status loss'; } return; }
  const target = active ?? upcoming;
  const remaining = (active ? target.endSeconds : target.startSeconds) - secondsNow;
  const value = [Math.floor(remaining / 3600), Math.floor((remaining % 3600) / 60), remaining % 60].map((item) => String(item).padStart(2, '0')).join(':');
  if (countdown) countdown.textContent = value;
  if (countdownLabel) countdownLabel.textContent = active ? 'Entry closes in' : 'Entry opens in';
  if (show) show.textContent = active ? `${target.label} · closes ${target.endTime}` : `${target.label} · starts ${target.startTime}`;
  if (status) { status.textContent = active ? 'OPEN' : 'WAIT'; status.className = active ? 'status profit' : 'status break_even'; }
}
function billContent() {
  if (!saleCart.length) return '<p class="muted">No numbers added. Add tickets to prepare the customer bill.</p>';
  const quantity = saleCart.reduce((sum, item) => sum + item.quantity, 0);
  const total = saleCart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return `<div class="bill-table"><table><thead><tr><th>Scheme</th><th>Number</th><th>Qty</th><th>Amount</th><th></th></tr></thead><tbody>${saleCart.map((item, cartIndex) => `<tr><td><strong class="bill-scheme">${escapeHtml(item.boardCode ?? '')} ${escapeHtml(item.catalogSchemeName)}</strong></td><td class="number">${item.number}</td><td>${item.quantity}</td><td>${money(item.quantity * item.unitPrice)}</td><td><button type="button" class="remove-item" data-remove-item="${cartIndex}" aria-label="Remove ${item.number}">×</button></td></tr>`).join('')}</tbody></table></div><div class="bill-total"><span>${saleCart.length} entries · ${quantity} tickets</span><strong>${money(total)}</strong></div><button type="button" id="settle-bill">Settle bill</button>`;
}
function syncSellerCatalogSelection() {
  const catalog = currentDashboard.schemeCatalog.find((item) => item.id === document.querySelector('#catalog-scheme')?.value);
  const type = catalog?.id === 'scheme-all-single' || ['A', 'B', 'C'].includes(catalog?.pattern) ? 'ONE_DIGIT_STANDARD'
    : catalog?.id === 'scheme-all-doubles' || ['AB', 'AC', 'BC'].includes(catalog?.pattern) ? 'TWO_DIGIT_STANDARD'
    : catalog?.pattern === 'ABC' ? 'THREE_DIGIT' : catalog?.pattern === 'DABC' ? 'FOUR_DIGIT' : '';
  const select = document.querySelector('#scheme');
  if (!select || ![...select.options].some((option) => option.value === type)) return;
  select.value = type;
  const length = select.selectedOptions[0].dataset.length;
  const input = document.querySelector('#ticket-number');
  input.maxLength = Number(length); input.pattern = `[0-9]{${length}}`; input.placeholder = '0'.repeat(Number(length)); input.value = '';
  const boxToggle = document.querySelector('#box-entry-toggle');
  const boxInput = document.querySelector('#box-entry');
  const boxAllowed = Number(length) >= 2;
  if (boxToggle) { boxToggle.disabled = !boxAllowed; boxToggle.title = boxAllowed ? 'Create all unique number combinations' : 'BOX is available for 2D, 3D and 4D only'; }
  if (!boxAllowed && boxInput) { boxInput.checked = false; boxToggle?.classList.remove('active'); document.querySelector('#entry-mode-label').textContent = 'BOX available for 2D / 3D / 4D'; }
}
function wireBillActions() {
  document.querySelectorAll('[data-remove-item]').forEach((button) => button.addEventListener('click', () => {
    saleCart.splice(Number(button.dataset.removeItem), 1); document.querySelector('#bill-content').innerHTML = billContent(); wireBillActions();
  }));
  document.querySelector('#settle-bill')?.addEventListener('click', settleBill);
}
async function settleBill() {
  const button = document.querySelector('#settle-bill'); button.disabled = true;
  try {
    const data = await request('/api/tickets/batch', { method: 'POST', body: JSON.stringify({ items: saleCart.map(({ boardId, showId, catalogSchemeId, scheme, number, quantity }) => ({ boardId, showId, catalogSchemeId, scheme, number, quantity })) }) });
    saleCart = [];
    await renderDashboard();
    notify(`Bill settled: ${data.quantity} tickets · ${money(data.total)}`);
  } catch (error) { button.disabled = false; notify(error.message, true); }
}
async function previewResult(event) {
  event.preventDefault();
  try {
    const data = await request('/api/reports/result-preview', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    const sellerRows = data.directSellerOutcomes?.length ? `<div class="bill-table"><table><thead><tr><th>Direct Seller</th><th>Qty</th><th>Sales</th><th>Margin</th><th>Prize</th><th>Profit / Loss</th><th>Status</th></tr></thead><tbody>${data.directSellerOutcomes.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${money(item.sales)}</td><td>${money(item.margin)}</td><td>${money(item.prizeExposure)}</td><td class="${item.netOutcome < 0 ? 'error' : ''}">${money(item.netOutcome)}</td><td><span class="status ${item.status.toLowerCase()}">${item.status.replace('_', ' ')}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No Direct Sellers are connected.</p>';
    document.querySelector('#preview-result').innerHTML = `<div class="preview-box"><span class="muted">Projected result</span><strong class="${data.status === 'LOSS' ? 'error' : ''}">${money(data.projectedProfit)} (${data.profitPercentage}%)</strong><span class="status ${data.meetsMinimumProfit ? 'profit' : 'loss'}">${data.meetsMinimumProfit ? 'TARGET MET' : `BELOW ${data.minimumProfitLabel}`}</span><dl><div><dt>Ticket quantity</dt><dd>${data.ticketQuantity}</dd></div><div><dt>Admin margin</dt><dd>${money(data.adminMargin)}</dd></div><div><dt>Prize exposure</dt><dd>${money(data.totalPrizes)}</dd></div></dl><h3>Direct Seller projected profit / loss</h3>${sellerRows}</div>`;
  } catch (error) { notify(error.message, true); }
}
async function publishResult(event) {
  event.preventDefault();
  try {
    const data = await request('/api/draws', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    const preview = data.preview;
    await renderDashboard();
    notify(data.belowTarget ? `Result published with warning: ${money(preview.projectedProfit)} (${preview.profitPercentage}%), below ${preview.minimumProfitLabel} target` : `Result published: ${money(preview.projectedProfit)} (${preview.profitPercentage}%)`, data.belowTarget);
  } catch (error) { notify(error.message, true); }
}
async function submitForm(event, path) {
  event.preventDefault();
  try { await request(path, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); notify('Saved successfully'); await renderDashboard(); }
  catch (error) { notify(error.message, true); }
}
function notify(message, isError = false) { const node = document.querySelector('#message'); if (node) { node.textContent = message; node.classList.toggle('error', isError); } }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

boot();
