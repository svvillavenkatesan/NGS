const app = document.querySelector('#owner-app');
let token = sessionStorage.getItem('token:OWNER');

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const money = (value) => {
  const amount = Number(value ?? 0);
  return `${amount < 0 ? '-' : ''}₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

function loginScreen(message = '') {
  app.innerHTML = `<section class="login card"><div class="compact-panel-title"><strong>System Owner</strong></div><h1>Login</h1><form id="owner-login" autocomplete="off" data-form-type="other"><label>User ID / Phone<input name="userId" autocomplete="off" data-lpignore="true" data-1p-ignore spellcheck="false" required></label><label>PWD<input name="password" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore required></label><button>Sign in</button><button type="button" class="secondary" id="owner-forgot-password">Forgot PWD</button><p class="error">${escapeHtml(message)}</p></form></section>`;
  document.querySelector('#owner-login').reset();
  document.querySelector('#owner-login').addEventListener('submit', login);
  document.querySelector('#owner-forgot-password').addEventListener('click', requestOwnerPasswordReset);
}

async function requestOwnerPasswordReset() {
  const phone = document.querySelector('#owner-login [name="userId"]').value.trim();
  if (!phone) return loginScreen('Enter Phone / User ID first');
  try { const result = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ phone }) }); loginScreen(result.message); }
  catch (error) { loginScreen(error.message); }
}

async function login(event) {
  event.preventDefault();
  try {
    const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    if (result.user.role !== 'OWNER') throw new Error('System Owner account required');
    token = result.token; sessionStorage.setItem('token:OWNER', token);
    if (result.user.mustChangePassword) return requiredPasswordScreen();
    await render();
  } catch (error) { loginScreen(error.message); }
}

function requiredPasswordScreen() {
  app.innerHTML = `<section class="login card"><div class="compact-panel-title"><strong>System Owner</strong></div><h1>Set New PWD</h1><form id="required-owner-password"><label>New PWD<input name="newPassword" type="password" minlength="8" required></label><label>Confirm New PWD<input name="confirmPassword" type="password" minlength="8" required></label><button>Save New PWD</button><p class="error"></p></form></section>`;
  document.querySelector('#required-owner-password').addEventListener('submit', async (event) => {
    const form = event.currentTarget;
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.newPassword !== values.confirmPassword) { event.currentTarget.querySelector('.error').textContent = 'PWDs do not match'; return; }
    try { await request('/api/me/password', { method: 'PUT', body: JSON.stringify({ newPassword: values.newPassword }) }); sessionStorage.removeItem('token:OWNER'); token = null; loginScreen('New PWD saved. Sign in again.'); }
    catch (error) { form.querySelector('.error').textContent = error.message; }
  });
}


function adminCard(item) {
  const created = new Date(item.createdAt).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' });
  const rows = [['Today', item.financials.today], ['This Week', item.financials.week], ['This Month', item.financials.month]].map(([label, report]) => `<tr><td>${label}</td><td>${report.entries}</td><td>${report.quantity}</td><td>${money(report.sales)}</td><td>${money(report.prizes)}</td><td>${money(report.bonus)}</td><td class="${report.netProfit < 0 ? 'error' : ''}"><strong>${money(report.netProfit)}</strong></td></tr>`).join('');
  const reset = item.passwordResetPending ? `<form class="admin-password-reset-form"><input name="superAdminId" type="hidden" value="${escapeHtml(item.id)}"><button>Reset PWD</button></form><p class="muted">Temporary PWD: 12345678</p>` : '';
  return `<article class="card wide"><h2>${escapeHtml(item.superAdminCode)} · ${escapeHtml(item.name)}</h2><p class="muted">Phone: ${escapeHtml(item.phone)} · Created: ${created} · ${item.isActive ? 'Active' : 'Disabled'}</p><p><strong>Seller IDs: ${item.totalSellersCreated}</strong> · Active ${item.currentSellers} · Limit ${item.sellerLimit} · Remaining ${item.remaining}</p><div class="table-wrap"><table><thead><tr><th>Period</th><th>Entries</th><th>Qty</th><th>Sales</th><th>Prize</th><th>Bonus</th><th>Profit / Loss</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">Today ${item.financials.periods.today} · Week ${item.financials.periods.weekStart} to ${item.financials.periods.weekEnd} · Month ${item.financials.periods.month}</p><form class="admin-limit-form"><input name="superAdminId" type="hidden" value="${escapeHtml(item.id)}"><label>Seller Limit<input name="sellerLimit" type="number" min="${item.currentSellers}" max="100000" value="${item.sellerLimit}" required></label><label>Owner PWD<input name="ownerPassword" type="password" required></label><button>Update Limit</button></form>${reset}</article>`;
}

function validityBadge(item) {
  const validity = item.accountValidity ?? {};
  const end = validity.endsAt ? new Date(validity.endsAt).toLocaleDateString('en-IN') : '—';
  const grace = validity.graceEndsAt ? new Date(validity.graceEndsAt).toLocaleDateString('en-IN') : '—';
  return `<div class="metrics owner-validity"><div><span>Validity</span><strong>${escapeHtml(validity.status ?? '—')}</strong></div><div><span>Period</span><strong>${Number(validity.periodMonths ?? item.accountLicensePeriodMonths ?? 0)} Months</strong></div><div><span>Valid Until</span><strong>${end}</strong></div><div><span>Grace Until</span><strong>${grace}</strong></div><div><span>Key Sequence</span><strong>${Number(validity.sequence ?? item.accountLicenseSequence ?? 0)}</strong></div></div>`;
}

function renewalsPanel(renewals = []) {
  const rows = renewals.map((item) => `<tr><td>${escapeHtml(item.superAdminCode)}</td><td>${escapeHtml(item.superAdminName)}</td><td>${item.requestedMonths === 6 ? '6 Months' : '1 Year'}</td><td><span class="status ${item.status === 'APPROVED' ? 'profit' : 'break_even'}">${escapeHtml(item.status)}</span></td><td>${item.status === 'PENDING' ? `<form class="renewal-approve-form"><input type="hidden" name="requestId" value="${escapeHtml(item.id)}"><input name="ownerPassword" type="password" placeholder="Owner PWD" required><button>Approve & Generate Key</button></form>` : `Key ${Number(item.licenseSequence ?? 0)}`}</td></tr>`).join('');
  return `<section class="card wide"><h2>Validity Renewals</h2>${rows ? `<table><thead><tr><th>Admin ID</th><th>Name</th><th>Period</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No renewal requests.</p>'}</section>`;
}

function resultCorrectionsPanel(requests = []) {
  const rows = requests.map((item) => `<tr><td>${escapeHtml(item.resultDate)}</td><td>${escapeHtml(item.superAdminCode)} · ${escapeHtml(item.superAdminName)}</td><td>${escapeHtml(item.boardCode)} · ${escapeHtml(item.showLabel)}</td><td><span class="number compact-number">${escapeHtml(item.oldWinningNumber)}</span> → <strong class="number compact-number">${escapeHtml(item.proposedWinningNumber)}</strong></td><td>${escapeHtml(item.reason)}</td><td>Prize ${money(item.preview?.totalPrizes)}<br>Net ${money(item.preview?.projectedProfit)} (${Number(item.preview?.profitPercentage ?? 0)}%)</td><td><span class="status ${item.status === 'APPROVED' ? 'profit' : item.status === 'REJECTED' ? 'loss' : 'break_even'}">${escapeHtml(item.status)}</span></td><td>${item.status === 'PENDING' ? `<form class="result-correction-approve-form"><input type="hidden" name="requestId" value="${escapeHtml(item.id)}"><label class="check"><input type="checkbox" name="verified" required> Official result verified</label><input name="ownerPassword" type="password" placeholder="Owner PWD" required><button>Approve & Recalculate</button></form><form class="result-correction-reject-form"><input type="hidden" name="requestId" value="${escapeHtml(item.id)}"><input name="rejectionReason" minlength="5" placeholder="Rejection reason" required><input name="ownerPassword" type="password" placeholder="Owner PWD" required><button type="submit" class="secondary">Reject</button></form>` : escapeHtml(item.rejectionReason ?? 'Completed')}</td></tr>`).join('');
  return `<section class="card wide"><p class="muted">OLD RESULT IS RETAINED IN PERMANENT AUDIT HISTORY</p><h2>Result Correction Approval</h2>${rows ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Super Admin</th><th>Lot / Show</th><th>Old → New</th><th>Reason</th><th>Recalculation Preview</th><th>Status</th><th>Owner Action</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No Result correction requests.</p>'}</section>`;
}

function ownerReportsPanel(reports = []) {
  const totals = reports.reduce((sum, item) => ({ quantity: sum.quantity + Number(item.totalQuantity ?? 0), sales: sum.sales + Number(item.totalSales ?? 0), prize: sum.prize + Number(item.totalPrize ?? 0), bonus: sum.bonus + Number(item.totalBonus ?? 0), net: sum.net + Number(item.totalNet ?? 0) }), { quantity: 0, sales: 0, prize: 0, bonus: 0, net: 0 });
  const rows = reports.map((report) => `<tr><td>${escapeHtml(report.businessDate)}</td><td>${escapeHtml(report.superAdminCode)} · ${escapeHtml(report.superAdminName)}</td><td>${escapeHtml(report.sellerCode)} · ${escapeHtml(report.sellerName)}</td><td>${escapeHtml(report.boardCode)} · ${escapeHtml(report.showLabel)}</td><td>${report.entryCount} / ${report.totalQuantity}</td><td>${money(report.totalSales)}</td><td>${money(report.totalPrize)}</td><td>${money(report.totalBonus)}</td><td>${money(report.totalNet)}</td><td><button type="button" class="secondary owner-view-report" data-report-id="${escapeHtml(report.id)}">View</button></td></tr>`).join('');
  return `<section class="card wide"><h2>Detailed Reports</h2><div class="metrics"><div><span>Quantity</span><strong>${totals.quantity}</strong></div><div><span>Sales</span><strong>${money(totals.sales)}</strong></div><div><span>Prize</span><strong>${money(totals.prize)}</strong></div><div><span>Bonus</span><strong>${money(totals.bonus)}</strong></div><div><span>Profit / Loss</span><strong>${money(totals.net)}</strong></div></div><form id="owner-report-filter" class="catalog-form"><label>Date<input name="date" type="date"></label><label>Super Admin<select name="admin"><option value="">All</option>${[...new Set(reports.map((item) => `${item.superAdminCode} · ${item.superAdminName}`))].map((name) => `<option>${escapeHtml(name)}</option>`).join('')}</select></label><label>Seller<select name="seller"><option value="">All</option>${[...new Set(reports.map((item) => `${item.sellerCode} · ${item.sellerName}`))].map((name) => `<option>${escapeHtml(name)}</option>`).join('')}</select></label></form><div class="table-wrap"><table id="owner-report-table"><thead><tr><th>Date</th><th>Super Admin</th><th>Seller</th><th>Lot / Show</th><th>Entries / Qty</th><th>Sales</th><th>Prize</th><th>Bonus</th><th>Profit / Loss</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="10">No reports.</td></tr>'}</tbody></table></div><div id="owner-report-detail"></div></section>`;
}

function ownerReportDetail(report) {
  const rows = report.entries.map((entry) => `<tr><td>${entry.sequence}</td><td>${escapeHtml(entry.billNumber)}</td><td>${escapeHtml(entry.time)}</td><td>${escapeHtml(entry.scheme)}</td><td>${escapeHtml(entry.enteredNumber)}</td><td>${entry.quantity}</td><td>${money(entry.saleAmount)}</td><td>${money(entry.prizeAmount)}</td><td>${escapeHtml(entry.matchRule ?? '—')}</td><td>${money(entry.bonusAmount)}</td><td>${money(entry.netAmount)}</td></tr>`).join('');
  return `<article class="report-sheet"><div class="report-header"><h2>${escapeHtml(report.reportId)}</h2><button type="button" id="owner-print-report">Print A4 Landscape</button></div><div class="report-meta"><div><span>Super Admin</span><strong>${escapeHtml(report.superAdmin.code)} · ${escapeHtml(report.superAdmin.name)}</strong></div><div><span>Seller</span><strong>${escapeHtml(report.seller.code)} · ${escapeHtml(report.seller.name)}</strong></div><div><span>Lot / Show</span><strong>${escapeHtml(report.boardCode)} / ${escapeHtml(report.showLabel)}</strong></div><div><span>Date</span><strong>${escapeHtml(report.businessDate)}</strong></div><div><span>Result</span><strong>${escapeHtml(report.winningNumber ?? '—')}</strong></div><div><span>Status</span><strong>${escapeHtml(report.status)}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Sl.</th><th>Bill</th><th>Time</th><th>Scheme</th><th>Number</th><th>Qty</th><th>Sold</th><th>Prize</th><th>Reason</th><th>Bonus</th><th>Net</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="5">TOTAL</th><th>${report.totalQuantity}</th><th>${money(report.totalSales)}</th><th>${money(report.totalPrize)}</th><th></th><th>${money(report.totalBonus)}</th><th>${money(report.totalNet)}</th></tr></tfoot></table></div></article>`;
}

function ownerPrintableReport(report) {
  const content = ownerReportDetail(report).replace('<button type="button" id="owner-print-report">Print A4 Landscape</button>', '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.reportId)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;font-size:9px}h2{font-size:17px;margin:0 0 6px}.report-meta{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:8px 0}.report-meta div{border:1px solid #aaa;padding:5px}.report-meta span{display:block;color:#555;font-size:8px}table{width:100%;border-collapse:collapse}thead{display:table-header-group}th,td{border:1px solid #999;padding:3px;text-align:left;white-space:nowrap}tfoot{font-weight:bold;background:#eee}</style></head><body>${content}<script>window.onload=()=>window.print()<\/script></body></html>`;
}

async function render(message = '') {
  try {
    const [data, renewals, reports, resultCorrections] = await Promise.all([request('/api/owner/control'), request('/api/owner/renewals'), request('/api/reports/sales'), request('/api/owner/result-corrections')]);
    app.innerHTML = `<div class="compact-panel-title"><strong>NGS · SYSTEM OWNER</strong></div><section class="grid"><article class="card"><span class="muted">Super Admins</span><strong>${data.totalSuperAdmins}</strong></article><article class="card"><span class="muted">Active Sellers</span><strong>${data.currentSellers}</strong></article><article class="card"><span class="muted">Total Capacity</span><strong>${data.totalCapacity}</strong></article></section><section class="grid"><article class="card wide"><h2>Create Super Admin</h2><form id="create-admin-form"><label>Name<input name="name" maxlength="60" required></label><label>Phone / User ID<input name="phone" inputmode="numeric" pattern="[0-9]{10,15}" required></label><label>Temporary PWD<input name="password" type="password" minlength="8" required></label><label>Seller Limit<input name="sellerLimit" type="number" min="1" max="100000" value="100" required></label><label>Owner PWD<input name="ownerPassword" type="password" required></label><button>Create Super Admin</button></form></article><article class="card wide"><h2>Change Owner PWD</h2><form id="owner-password-form"><label>Current PWD<input name="currentPassword" type="password" required></label><label>New PWD<input name="newPassword" type="password" minlength="8" required></label><button>Change PWD</button></form></article></section><h2>Super Admin Accounts</h2><section class="grid">${data.superAdmins.map(adminCard).join('') || '<p>No Super Admin accounts.</p>'}</section><p id="owner-message" class="notice">${escapeHtml(message)}</p><button id="owner-exit" class="secondary">Exit</button>`;
    document.querySelector('#create-admin-form').addEventListener('submit', createAdmin);
    document.querySelector('#create-admin-form [name="sellerLimit"]').closest('label').insertAdjacentHTML('afterend', '<label>Validity<select name="validityMonths"><option value="6">6 Months</option><option value="12">1 Year</option></select></label>');
    document.querySelectorAll('.admin-limit-form').forEach((form, index) => form.closest('.card').querySelector('h2').insertAdjacentHTML('afterend', validityBadge(data.superAdmins[index])));
    document.querySelector('#owner-message').insertAdjacentHTML('beforebegin', `${resultCorrectionsPanel(resultCorrections)}${renewalsPanel(renewals)}${ownerReportsPanel(reports)}`);
    document.querySelectorAll('.admin-limit-form').forEach((form) => form.addEventListener('submit', saveLimit));
    document.querySelectorAll('.admin-password-reset-form').forEach((form) => form.addEventListener('submit', resetAdminPassword));
    document.querySelector('#owner-password-form').addEventListener('submit', changeOwnerPassword);
    document.querySelectorAll('.renewal-approve-form').forEach((form) => form.addEventListener('submit', approveRenewal));
    document.querySelectorAll('.result-correction-approve-form').forEach((form) => form.addEventListener('submit', approveResultCorrection));
    document.querySelectorAll('.result-correction-reject-form').forEach((form) => form.addEventListener('submit', rejectResultCorrection));
    document.querySelectorAll('.owner-view-report').forEach((button) => button.addEventListener('click', () => viewOwnerReport(button.dataset.reportId)));
    document.querySelector('#owner-report-filter').addEventListener('change', filterOwnerReports);
    document.querySelector('#owner-exit').addEventListener('click', () => { sessionStorage.removeItem('token:OWNER'); token = null; loginScreen(); });
  } catch (error) { sessionStorage.removeItem('token:OWNER'); token = null; loginScreen(error.message); }
}

async function createAdmin(event) {
  event.preventDefault();
  try { const result = await request('/api/owner/super-admin', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await render(`Super Admin ${result.superAdminCode} created successfully.`); }
  catch (error) { showMessage(error.message, true); }
}

async function saveLimit(event) {
  event.preventDefault();
  try { await request('/api/owner/seller-limit', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await render('Seller limit saved successfully.'); }
  catch (error) { showMessage(error.message, true); }
}

async function resetAdminPassword(event) {
  event.preventDefault();
  try { await request('/api/owner/super-admin-password-reset', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await render('Super Admin PWD reset successfully.'); }
  catch (error) { showMessage(error.message, true); }
}

async function changeOwnerPassword(event) {
  event.preventDefault();
  try { await request('/api/me/password', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); sessionStorage.removeItem('token:OWNER'); token = null; loginScreen('PWD changed. Sign in again.'); }
  catch (error) { showMessage(error.message, true); }
}

async function approveRenewal(event) {
  event.preventDefault();
  try {
    const result = await request('/api/owner/renewals/approve', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    await render(`Renewal approved. Signed Key ${result.licenseKey}`);
  } catch (error) { showMessage(error.message, true); }
}

async function approveResultCorrection(event) {
  event.preventDefault();
  try {
    const result = await request('/api/owner/result-corrections/approve', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    await render(`Result corrected to ${result.draw.winningNumber}. ${result.recalculatedTickets} tickets and ${result.recalculatedReports} reports recalculated.`);
  } catch (error) { showMessage(error.message, true); }
}

async function rejectResultCorrection(event) {
  event.preventDefault();
  try {
    await request('/api/owner/result-corrections/reject', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    await render('Result correction request rejected.');
  } catch (error) { showMessage(error.message, true); }
}

async function viewOwnerReport(reportId) {
  try {
    const report = await request(`/api/reports/sale?reportId=${encodeURIComponent(reportId)}`);
    document.querySelector('#owner-report-detail').innerHTML = ownerReportDetail(report);
    document.querySelector('#owner-print-report').addEventListener('click', () => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(ownerPrintableReport(report));
      printWindow.document.close();
    });
  } catch (error) { showMessage(error.message, true); }
}

function filterOwnerReports(event) {
  const values = Object.fromEntries(new FormData(event.currentTarget));
  document.querySelectorAll('#owner-report-table tbody tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) return;
    row.hidden = Boolean((values.date && cells[0].textContent !== values.date) || (values.admin && cells[1].textContent !== values.admin) || (values.seller && cells[2].textContent !== values.seller));
  });
}

function showMessage(message, isError = false) {
  const element = document.querySelector('#owner-message');
  element.textContent = message;
  element.classList.toggle('error', isError);
}

async function bootOwner() {
  if (!token) return loginScreen();
  try { const me = await request('/api/me'); if (me.mustChangePassword) return requiredPasswordScreen(); await render(); }
  catch (error) { sessionStorage.removeItem('token:OWNER'); token = null; loginScreen(error.message); }
}
bootOwner();
