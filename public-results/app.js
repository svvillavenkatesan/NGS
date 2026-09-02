const grid = document.querySelector('#result-grid');
const dateLabel = document.querySelector('#result-date');
const largeDateLabel = document.querySelector('#large-result-date');
const updatedLabel = document.querySelector('#updated-time');
const datePicker = document.querySelector('#result-date-picker');
const historyDays = document.querySelector('#history-days');
const pdfButton = document.querySelector('#download-pdf');
let previousNumbers = new Map();
let today = '';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function cardClass(item, index) {
  if (item.boardCode === 'KL') return 'kerala';
  return ['dear-one', 'dear-two', 'dear-three'][index - 1] ?? 'dear-three';
}

function formatDate(value) {
  const [year, month, day] = String(value).split('-');
  return [day, month, year].filter(Boolean).join('/');
}

function resultTitle(item) {
  if (item.boardCode === 'KL') return 'KERALA 3 PM';
  return { show1: 'DEAR 1 PM', show2: 'DEAR 6 PM', show3: 'DEAR 8 PM' }[item.showId] ?? item.showLabel;
}

function render(data) {
  datePicker.value = data.resultDate;
  datePicker.max = today || data.resultDate;
  const formattedDate = formatDate(data.resultDate);
  dateLabel.textContent = formattedDate;
  largeDateLabel.textContent = formattedDate;
  updatedLabel.textContent = new Date(data.updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  grid.innerHTML = data.results.map((item, index) => {
    const key = `${item.boardCode}:${item.showId}:${item.resultDate}`;
    const changed = item.winningNumber && previousNumbers.get(key) !== item.winningNumber;
    previousNumbers.set(key, item.winningNumber);
    const published = Boolean(item.winningNumber);
    const publishedTime = published
      ? new Date(item.publishedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
      : 'Waiting for result';
    return `<article class="result-card ${cardClass(item, index)} ${published ? 'published' : 'waiting'} ${changed ? 'flash' : ''}">
      <div class="card-top">
        <div><div class="lot-code">${escapeHtml(resultTitle(item))}</div><div class="show">4 DIGIT RESULT</div><div class="card-date">${escapeHtml(formattedDate)}</div></div>
        <span class="status">${published ? 'PUBLISHED' : 'AWAITED'}</span>
      </div>
      <div class="number">${published ? escapeHtml(item.winningNumber) : '----'}</div>
      <div class="card-bottom"><span>${escapeHtml(item.boardName.toUpperCase())}</span><span>${escapeHtml(publishedTime)}</span></div>
    </article>`;
  }).join('');
}

async function loadResults(date = datePicker.value) {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await fetch(`/api/public-results${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Result service unavailable');
    const data = await response.json();
    today ||= data.resultDate;
    render(data);
  } catch {
    updatedLabel.textContent = 'RECONNECTING…';
  }
}

function printableHistory(data) {
  const headers = ['Date', 'Kerala 3 PM', 'Dear 1 PM', 'Dear 6 PM', 'Dear 8 PM'];
  const rows = data.rows.map((row) => {
    const values = row.results.map((item) => item.winningNumber ?? 'NOT PUBLISHED');
    return `<tr><td>${escapeHtml(formatDate(row.resultDate))}</td>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
  }).join('');
  return `<!doctype html><html><head><title>Golden Jackpot ${data.days} Day Results</title><style>
    @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17121d;margin:0}h1{margin:0;color:#5a167e;font-size:24px}p{margin:4px 0 14px;color:#555}table{width:100%;border-collapse:collapse;font-size:10px}thead{display:table-header-group}th{background:#511873;color:#fff}th,td{border:1px solid #aaa;padding:6px;text-align:center}td:first-child{font-weight:bold}tbody tr:nth-child(even){background:#f4edf8}.foot{margin-top:10px;font-size:9px;color:#666}
  </style></head><body><h1>GOLDEN JACKPOT · RESULT HISTORY</h1><p>${escapeHtml(formatDate(data.fromDate))} to ${escapeHtml(formatDate(data.toDate))} · ${data.days} Days</p><table><thead><tr>${headers.map((value) => `<th>${value}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="foot">Generated ${escapeHtml(new Date().toLocaleString('en-IN'))}</div></body></html>`;
}

datePicker.addEventListener('change', () => loadResults(datePicker.value));
pdfButton.addEventListener('click', async () => {
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) return;
  printWindow.document.write('<p style="font-family:Arial;padding:30px">Preparing Golden Jackpot PDF…</p>');
  try {
    const response = await fetch(`/api/public-result-history?days=${encodeURIComponent(historyDays.value)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('History unavailable');
    printWindow.document.open();
    printWindow.document.write(printableHistory(await response.json()));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  } catch {
    printWindow.document.body.textContent = 'Unable to prepare result history.';
  }
});

await loadResults();
setInterval(() => loadResults(datePicker.value), 15000);
const events = new EventSource('/api/public-events');
events.addEventListener('draw.published', () => { if (datePicker.value === today) loadResults(today); });
events.onerror = () => setTimeout(() => loadResults(datePicker.value), 2000);
