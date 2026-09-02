const grid = document.querySelector('#result-grid');
const dateLabel = document.querySelector('#result-date');
const updatedLabel = document.querySelector('#updated-time');
let previousNumbers = new Map();

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function cardClass(item, index) {
  if (item.boardCode === 'KL') return 'kerala';
  return ['dear-one', 'dear-two', 'dear-three'][index - 1] ?? 'dear-three';
}

function formatDate(value) {
  const [year, month, day] = String(value).split('-');
  return [day, month, year].filter(Boolean).join('/');
}

function render(data) {
  dateLabel.textContent = formatDate(data.resultDate);
  updatedLabel.textContent = new Date(data.updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  grid.innerHTML = data.results.map((item, index) => {
    const key = `${item.boardCode}:${item.showId}`;
    const changed = item.winningNumber && previousNumbers.get(key) !== item.winningNumber;
    previousNumbers.set(key, item.winningNumber);
    const published = Boolean(item.winningNumber);
    const publishedTime = published
      ? new Date(item.publishedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
      : 'Waiting for result';
    return `<article class="result-card ${cardClass(item, index)} ${published ? 'published' : 'waiting'} ${changed ? 'flash' : ''}">
      <div class="card-top">
        <div><div class="lot-code">${escapeHtml(item.boardCode)} · ${escapeHtml(item.boardName)}</div><div class="show">${escapeHtml(item.showLabel)}</div></div>
        <span class="status">${published ? 'PUBLISHED' : 'AWAITED'}</span>
      </div>
      <div class="number">${published ? escapeHtml(item.winningNumber) : '----'}</div>
      <div class="card-bottom"><span>4 DIGIT RESULT</span><span>${escapeHtml(publishedTime)}</span></div>
    </article>`;
  }).join('');
}

async function loadResults() {
  try {
    const response = await fetch('/api/public-results', { cache: 'no-store' });
    if (!response.ok) throw new Error('Result service unavailable');
    render(await response.json());
  } catch {
    updatedLabel.textContent = 'RECONNECTING…';
  }
}

await loadResults();
setInterval(loadResults, 15000);
const events = new EventSource('/api/public-events');
events.addEventListener('draw.published', loadResults);
events.onerror = () => setTimeout(loadResults, 2000);
