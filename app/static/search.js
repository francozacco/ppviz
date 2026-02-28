import { state } from './state.js';
import { TYPE_LABELS } from './utils.js';

const SEARCHABLE_TYPES = new Set(['bus', 'gen', 'sgen', 'load', 'trafo3w', 'line', 'trafo']);

const searchInput    = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-dropdown');

export function initSearch() {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!state.cy || !q) { searchDropdown.style.display = 'none'; return; }

    const results = [];
    state.cy.elements().forEach(elem => {
      if (!SEARCHABLE_TYPES.has(elem.data('type'))) return;
      const label = (elem.data('label') || '').toLowerCase();
      const id    = elem.data('id').toLowerCase();
      if (label.includes(q) || id.includes(q)) results.push(elem);
    });

    if (!results.length) { searchDropdown.style.display = 'none'; return; }

    searchDropdown.innerHTML = results.slice(0, 10).map(elem => {
      const label = elem.data('label') || elem.data('id');
      const type  = TYPE_LABELS[elem.data('type')] || elem.data('type');
      return `<div class="search-result" data-id="${elem.data('id')}">
        <span>${label}</span>
        <span class="search-result-type">${type}</span>
      </div>`;
    }).join('');
    searchDropdown.style.display = 'block';
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchDropdown.style.display = 'none'; searchInput.blur(); }
  });

  searchDropdown.addEventListener('click', e => {
    const row = e.target.closest('.search-result');
    if (!row || !state.cy) return;
    const elem = state.cy.getElementById(row.dataset.id);
    if (!elem.length) return;
    searchInput.value = elem.data('label') || elem.data('id');
    searchDropdown.style.display = 'none';
    const zoom = Math.min(Math.max(state.cy.zoom(), 1.2), 2.5);
    state.cy.animate({ center: { eles: elem }, zoom, duration: 400, easing: 'ease-in-out' });
    elem.flashClass('search-hit', 1200);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#search-container')) searchDropdown.style.display = 'none';
  });
}
