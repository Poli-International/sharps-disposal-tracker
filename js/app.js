const KEY = 'poli-sharps-disposal';
const disposalDate = document.getElementById('disposal-date');
const containerSize = document.getElementById('container-size');
const disposalCost = document.getElementById('disposal-cost');
const provider = document.getElementById('provider');
const disposalNotes = document.getElementById('disposal-notes');
const addBtn = document.getElementById('add-btn');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const recordsBody = document.getElementById('records-body');
const recordsTable = document.getElementById('records-table');
const emptyState = document.getElementById('empty-state');
const logCount = document.getElementById('log-count');
const summaryRow = document.getElementById('summary-row');

disposalDate.value = new Date().toISOString().slice(0, 10);

function load() { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
function save(r) { localStorage.setItem(KEY, JSON.stringify(r)); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function forecastNext(records) {
  if (records.length < 2) return '—';
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((new Date(sorted[i].date) - new Date(sorted[i-1].date)) / 86400000);
  }
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const lastDate = new Date(sorted[sorted.length - 1].date);
  lastDate.setDate(lastDate.getDate() + Math.round(avgGap));
  return lastDate.toISOString().slice(0, 10);
}

function render() {
  const records = load();
  logCount.textContent = records.length ? `${records.length} event${records.length === 1 ? '' : 's'}` : '';

  if (!records.length) {
    emptyState.style.display = '';
    recordsTable.style.display = 'none';
    summaryRow.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  recordsTable.style.display = '';
  summaryRow.style.display = '';

  const withCost = records.filter(r => r.cost !== '');
  const totalCost = withCost.reduce((s, r) => s + parseFloat(r.cost), 0);
  const avgCost = withCost.length ? totalCost / withCost.length : null;

  document.getElementById('total-disposals').textContent = records.length;
  document.getElementById('total-cost').textContent = withCost.length ? `£${totalCost.toFixed(2)}` : '—';
  document.getElementById('avg-cost').textContent = avgCost !== null ? `£${avgCost.toFixed(2)}` : '—';
  document.getElementById('next-forecast').textContent = forecastNext(records);

  recordsBody.innerHTML = [...records].reverse().map((r, i) => {
    const idx = records.length - 1 - i;
    return `<tr>
      <td>${escHtml(r.date)}</td>
      <td>${escHtml(r.size || '—')}</td>
      <td>${r.cost !== '' ? '£' + parseFloat(r.cost).toFixed(2) : '—'}</td>
      <td>${escHtml(r.provider || '—')}</td>
      <td class="notes-cell">${escHtml(r.notes || '—')}</td>
      <td><button class="del-btn" data-idx="${idx}" title="Delete">×</button></td>
    </tr>`;
  }).join('');
}

addBtn.addEventListener('click', () => {
  const date = disposalDate.value;
  if (!date) { alert('Please select a date.'); return; }
  const records = load();
  records.push({
    date,
    size: containerSize.value,
    cost: disposalCost.value.trim(),
    provider: provider.value.trim(),
    notes: disposalNotes.value.trim(),
  });
  save(records);
  containerSize.value = '';
  disposalCost.value = '';
  provider.value = '';
  disposalNotes.value = '';
  render();
});

recordsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  if (!confirm('Delete this disposal event?')) return;
  const idx = parseInt(btn.dataset.idx, 10);
  const records = load();
  records.splice(idx, 1);
  save(records);
  render();
});

exportBtn.addEventListener('click', () => {
  const records = load();
  if (!records.length) { alert('No records to export.'); return; }
  const header = 'Date,Container Size,Cost,Provider,Notes';
  const rows = records.map(r =>
    [r.date, r.size, r.cost, r.provider, r.notes]
      .map(v => `"${String(v).replace(/"/g,'""')}"`)
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'sharps-disposal-log.csv';
  a.click();
});

clearBtn.addEventListener('click', () => {
  if (!confirm('Clear all disposal records? This cannot be undone.')) return;
  localStorage.removeItem(KEY);
  render();
});

render();
