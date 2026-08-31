const app = document.querySelector('#owner-app');
let token = sessionStorage.getItem('token:OWNER');

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function loginScreen(message = '') {
  app.innerHTML = `<section class="login card"><p class="muted">OWNER SECURITY</p><h1>System Owner Login</h1><form id="owner-login"><label>Phone<input name="phone" inputmode="numeric" required></label><label>Password<input name="password" type="password" required></label><button>Sign in</button><p class="error">${message}</p></form></section>`;
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

async function render(message = '') {
  try {
    const data = await request('/api/owner/control');
    app.innerHTML = `<div class="compact-panel-title"><strong>NGS · SYSTEM OWNER CONTROL</strong></div><section class="grid"><article class="card"><span class="muted">Maximum Sellers</span><strong>${data.maxSellers}</strong></article><article class="card"><span class="muted">Active Sellers</span><strong>${data.currentSellers}</strong></article><article class="card"><span class="muted">Remaining</span><strong>${data.remaining}</strong></article></section><section class="grid"><article class="card wide"><h2>Set Maximum Seller Limit</h2><p class="muted">Super Admin இந்த எண்ணிக்கைக்கு மேல் Seller உருவாக்க முடியாது.</p><form id="seller-limit-form"><label>Maximum Sellers<input name="maxSellers" type="number" min="${data.currentSellers}" max="100000" step="1" value="${data.maxSellers}" required></label><label>Owner Password<input name="ownerPassword" type="password" required></label><button>Save Seller Limit</button></form></article><article class="card wide"><h2>Super Admin Accounts</h2>${data.superAdmins.map((item) => `<p><strong>${item.name}</strong> · ${item.phone} · ${item.isActive ? 'Active' : 'Disabled'}</p>`).join('')}</article></section><p id="owner-message" class="notice">${message}</p><button id="owner-exit" class="secondary">Exit</button>`;
    document.querySelector('#seller-limit-form').addEventListener('submit', saveLimit);
    document.querySelector('#owner-exit').addEventListener('click', () => { sessionStorage.removeItem('token:OWNER'); token = null; loginScreen(); });
  } catch (error) { sessionStorage.removeItem('token:OWNER'); token = null; loginScreen(error.message); }
}

async function saveLimit(event) {
  event.preventDefault();
  try { await request('/api/owner/seller-limit', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); await render('Seller limit saved successfully.'); }
  catch (error) { document.querySelector('#owner-message').textContent = error.message; document.querySelector('#owner-message').classList.add('error'); }
}

if (token) render(); else loginScreen();
