const app = document.querySelector('#owner-app');
let token = sessionStorage.getItem('token:OWNER');

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function loginScreen(message = '') {
  app.innerHTML = `<section class="login card"><p class="muted">OWNER SECURITY</p><h1>System Owner Login</h1><form id="owner-login"><label>Phone<input name="phone" inputmode="numeric" required></label><label>Password<input name="password" type="password" required></label><button>Sign in</button><p class="error">${escapeHtml(message)}</p></form></section>`;
  document.querySelector('#owner-login').addEventListener('submit', login);
}

async function login(event) {
  event.preventDefault();
  try {
    const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    if (result.user.role !== 'OWNER') throw new Error('System Owner account required');
    token = result.token; sessionStorage.setItem('token:OWNER', token); await render();
  } catch (error) { loginScreen(error.message); }
}

function adminCard(item) {
  const created = new Date(item.createdAt).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' });
  return `<article class="card wide"><h2>${escapeHtml(item.superAdminCode)} · ${escapeHtml(item.name)}</h2><p class="muted">Phone: ${escapeHtml(item.phone)} · Created: ${created} · ${item.isActive ? 'Active' : 'Disabled'}</p><p><strong>Sellers ${item.currentSellers} / ${item.sellerLimit}</strong> · Remaining ${item.remaining}</p><form class="admin-limit-form"><input name="superAdminId" type="hidden" value="${escapeHtml(item.id)}"><label>Seller Limit<input name="sellerLimit" type="number" min="${item.currentSellers}" max="100000" value="${item.sellerLimit}" required></label><label>Owner Password<input name="ownerPassword" type="password" required></label><button>Update Limit</button></form></article>`;
}

async function render(message = '') {
  try {
    const data = await request('/api/owner/control');
    app.innerHTML = `<div class="compact-panel-title"><strong>NGS · SYSTEM OWNER CONTROL</strong></div><section class="grid"><article class="card"><span class="muted">Super Admins</span><strong>${data.totalSuperAdmins}</strong></article><article class="card"><span class="muted">Active Sellers</span><strong>${data.currentSellers}</strong></article><article class="card"><span class="muted">Total Capacity</span><strong>${data.totalCapacity}</strong></article></section><section class="grid"><article class="card wide"><h2>Create Super Admin</h2><p class="muted">ID automatically follows YYMM#### — example: 26080001.</p><form id="create-admin-form"><label>Name<input name="name" maxlength="60" required></label><label>Phone / User ID<input name="phone" inputmode="numeric" pattern="[0-9]{10,15}" required></label><label>Temporary Password<input name="password" type="password" minlength="8" required></label><label>Seller Limit<input name="sellerLimit" type="number" min="1" max="100000" value="100" required></label><label>Owner Password<input name="ownerPassword" type="password" required></label><button>Create Super Admin</button></form></article></section><h2>Super Admin Accounts</h2><section class="grid">${data.superAdmins.map(adminCard).join('') || '<p>No Super Admin accounts.</p>'}</section><p id="owner-message" class="notice">${escapeHtml(message)}</p><button id="owner-exit" class="secondary">Exit</button>`;
    document.querySelector('#create-admin-form').addEventListener('submit', createAdmin);
    document.querySelectorAll('.admin-limit-form').forEach((form) => form.addEventListener('submit', saveLimit));
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

function showMessage(message, isError = false) {
  const element = document.querySelector('#owner-message');
  element.textContent = message;
  element.classList.toggle('error', isError);
}

if (token) render(); else loginScreen();
