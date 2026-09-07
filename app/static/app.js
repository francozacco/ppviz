import { setStatus } from './utils.js';
import { renderGraph } from './graph.js';
import { runSimulation } from './simulation.js';
import { initSearch } from './search.js';
import { initLegend } from './legend.js';
import { apiFetch } from './api.js';

const fileInput   = document.getElementById('file-input');
const fileNameEl  = document.getElementById('file-name');
const runBtn      = document.getElementById('run-btn');
const searchInput = document.getElementById('search-input');
const summaryEl   = document.getElementById('summary-content');

initSearch();
initLegend();

// ── Shared helper called after any successful net load ────────────────────────
function _applyNetData(data, label) {
  fileNameEl.textContent = label;
  setStatus(`${data.summary.n_buses} buses loaded`, 'ok');
  runBtn.disabled = false;
  searchInput.disabled = false;
  searchInput.value = '';
  _renderSummary(data.summary);
  renderGraph(data.nodes, data.edges);
}

// ── Load demo net on startup ──────────────────────────────────────────────────
(async () => {
  try {
    const res  = await apiFetch('/demo');
    if (!res.ok) return;                   // endpoint not yet implemented — silent
    const data = await res.json();
    _applyNetData(data, 'case9 (demo)');
  } catch {
    // network error or endpoint missing — just show the empty state
  }
})();

// ── File upload ───────────────────────────────────────────────────────────────
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  setStatus('Uploading…', '');

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res  = await apiFetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { setStatus(data.detail || 'Upload failed', 'error'); return; }
    _applyNetData(data, file.name);
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error');
  }
});

function _renderSummary(s) {
  const rows = [
    ['Buses', s.n_buses],       ['Lines', s.n_lines],
    ['Trafos', s.n_trafos],     ['Trafos 3W', s.n_trafos3w],
    ['Loads', s.n_loads],       ['Generators', s.n_gens],
    ['Static Gens', s.n_sgens], ['Ext. Grids', s.n_ext_grid],
  ];
  summaryEl.innerHTML = rows
    .map(([k, v]) => `<div class="stat-row"><span>${k}</span><span>${v}</span></div>`)
    .join('');
}

runBtn.addEventListener('click', runSimulation);
