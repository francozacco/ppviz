import { state } from './state.js';
import { buildTooltipHtml, setStatus } from './utils.js';
import { runSimulation, applyLoading } from './simulation.js';
import { showElementDetail, clearElementDetail } from './detail.js';

const tooltip         = document.getElementById('tooltip');
const tooltipInfo     = document.getElementById('tooltip-info');
const tooltipBtn      = document.getElementById('tooltip-btn');
const tooltipPmwEdit  = document.getElementById('tooltip-pmw-edit');
const tooltipPmwInput = document.getElementById('tooltip-pmw-input');
const tooltipPmwApply = document.getElementById('tooltip-pmw-apply');

const TOOLTIP_SEL = 'node, edge[type = "line"], edge[type = "trafo"]';
const TOGGLEABLE  = 'edge[type = "line"], edge[type = "trafo"], node[type = "trafo3w"]';
const EDITABLE    = 'node[type = "gen"], node[type = "sgen"], node[type = "load"]';

export function unpinTooltip() {
  state.pinnedElemId = null;
  tooltip.classList.remove('pinned');
  tooltip.style.display    = 'none';
  tooltipBtn.style.display = '';
  tooltipPmwEdit.style.display = '';
  clearElementDetail();
}

function updateTooltipBtn(elem) {
  const inService        = elem.data('in_service');
  tooltipBtn.textContent = inService ? 'Disconnect' : 'Connect';
  tooltipBtn.className   = inService ? 'oos-btn' : 'is-btn';
}

function moveTooltip(x, y) {
  tooltip.style.left = (x + 14) + 'px';
  tooltip.style.top  = (y + 14) + 'px';
}

export function setupTooltips(cy) {
  cy.on('mouseover', TOOLTIP_SEL, evt => {
    if (state.pinnedElemId) return;
    tooltipInfo.innerHTML = buildTooltipHtml(evt.target.data());
    tooltip.style.display = 'block';
    moveTooltip(evt.renderedPosition.x, evt.renderedPosition.y);
  });
  cy.on('mouseout', TOOLTIP_SEL, () => {
    if (state.pinnedElemId) return;
    tooltip.style.display = 'none';
  });
  cy.on('mousemove', TOOLTIP_SEL, evt => {
    if (state.pinnedElemId) return;
    moveTooltip(evt.renderedPosition.x, evt.renderedPosition.y);
  });

  cy.on('tap', TOGGLEABLE, evt => {
    const id = evt.target.id();
    if (state.pinnedElemId === id) { unpinTooltip(); return; }
    state.pinnedElemId = id;
    tooltipInfo.innerHTML = buildTooltipHtml(evt.target.data());
    updateTooltipBtn(evt.target);
    tooltip.classList.add('pinned');
    tooltip.style.display = 'block';
    moveTooltip(evt.renderedPosition.x, evt.renderedPosition.y);
    showElementDetail(id);
  });

  cy.on('tap', EDITABLE, evt => {
    const id = evt.target.id();
    if (state.pinnedElemId === id) { unpinTooltip(); return; }
    state.pinnedElemId = id;
    tooltipInfo.innerHTML = buildTooltipHtml(evt.target.data());
    updateTooltipBtn(evt.target);
    tooltipPmwInput.value = (evt.target.data('p_mw') ?? 0).toFixed(2);
    tooltipPmwEdit.style.display = 'flex';
    tooltip.classList.add('pinned');
    tooltip.style.display = 'block';
    moveTooltip(evt.renderedPosition.x, evt.renderedPosition.y);
    showElementDetail(id);
  });

  cy.on('tap', 'node[type = "bus"]', evt => {
    const id = evt.target.id();
    showElementDetail(id);
  });

  cy.on('tap', evt => { if (evt.target === cy) unpinTooltip(); });
}

tooltipPmwApply.addEventListener('click', async () => {
  if (!state.pinnedElemId) return;
  const id  = state.pinnedElemId;
  const val = parseFloat(tooltipPmwInput.value);
  if (isNaN(val)) return;
  const elem = state.cy.getElementById(id);
  tooltipPmwApply.disabled = true;
  try {
    const res  = await fetch(`/element/${encodeURIComponent(id)}/p_mw`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_mw: val }),
    });
    const data = await res.json();
    if (!res.ok) { setStatus(data.detail || 'Update failed', 'error'); return; }
    elem.data('p_mw', data.p_mw);
    tooltipInfo.innerHTML = buildTooltipHtml(elem.data());
    runSimulation();
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error');
  } finally {
    tooltipPmwApply.disabled = false;
  }
});

tooltipBtn.addEventListener('click', async () => {
  if (!state.pinnedElemId) return;
  const id   = state.pinnedElemId;
  const elem = state.cy.getElementById(id);
  tooltipBtn.disabled = true;
  try {
    const res  = await fetch(`/element/${encodeURIComponent(id)}`, { method: 'PATCH' });
    const data = await res.json();
    if (!res.ok) { setStatus(data.detail || 'Toggle failed', 'error'); return; }
    const { in_service } = data;
    elem.data('in_service', in_service);
    if (elem.data('type') === 'trafo3w') {
      elem.connectedEdges('[type = "trafo_conn"]').data('in_service', in_service);
      elem.connectedEdges('[type = "trafo_conn"]').removeStyle();
    }
    elem.removeStyle();
    if (state.cachedLoading) applyLoading(state.cachedLoading);
    tooltipInfo.innerHTML = buildTooltipHtml(elem.data());
    updateTooltipBtn(elem);
    runSimulation();
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error');
  } finally {
    tooltipBtn.disabled = false;
  }
});
