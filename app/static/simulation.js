import { state } from './state.js';
import { setStatus, loadingColor, buildTooltipHtml } from './utils.js';
import { fetchAndDrawSensMatrix } from './sensitivity.js';

const FLOW_DASH  = [8, 4];
const FLOW_SPEED = 0.15;

let flowOffsets = {};
let animFrame   = null;

const runBtn      = document.getElementById('run-btn');
const tooltipInfo = document.getElementById('tooltip-info');

export async function runSimulation() {
  runBtn.disabled = true;
  setStatus('Running DC power flow…', '');
  try {
    const res  = await fetch('/run', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setStatus(data.detail || 'Power flow failed', 'error'); return; }
    applyLoading(data.loading, data.flows || {}, data.flows_mw || {});
    fetchAndDrawSensMatrix();
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error');
  } finally {
    runBtn.disabled = false;
  }
}

export function applyLoading(loading, flows, flows_mw) {
  state.cachedLoading = loading;
  if (flows !== undefined) state.cachedFlows = flows;
  if (flows_mw !== undefined) {
    for (const [id, mw] of Object.entries(flows_mw)) {
      const elem = state.cy.getElementById(id);
      if (elem.length) elem.data('flow_mw', mw);
    }
  }
  const entries = Object.entries(loading);
  if (!entries.length) {
    setStatus('Power flow ran — no loading data (max_p_mw not set)', 'ok');
    return;
  }
  entries.forEach(([id, pct]) => {
    const color = loadingColor(pct);
    if (id.startsWith('trafo3w_')) {
      const node = state.cy.getElementById(id);
      if (node.length) {
        node.data('loading_pct', pct);
        if (node.data('in_service')) {
          node.style('border-color', color);
          node.connectedEdges('[type = "trafo_conn"]').style('line-color', color);
        }
      }
    } else if (id.startsWith('trafo_')) {
      const edge = state.cy.getElementById(id);
      if (edge.length) {
        edge.data('loading_pct', pct);
        if (edge.data('in_service')) {
          edge.style({
            'line-color': color,
            'mid-source-arrow-color': color,
            'mid-target-arrow-color': color,
          });
        }
      }
    } else {
      const edge = state.cy.getElementById(id);
      if (edge.length) {
        edge.data('loading_pct', pct);
        if (edge.data('in_service')) edge.style('line-color', color);
      }
    }
  });
  if (state.pinnedElemId) {
    const pinned = state.cy.getElementById(state.pinnedElemId);
    if (pinned.length) tooltipInfo.innerHTML = buildTooltipHtml(pinned.data());
  }
  stopFlowAnimation();
  startFlowAnimation();
  setStatus('Power flow ran successfully', 'ok');
}

export function resetFlowState() {
  stopFlowAnimation();
  flowOffsets         = {};
  state.cachedFlows   = {};
  state.cachedLoading = null;
}

export function startFlowAnimation() {
  stopFlowAnimation();
  if (!Object.keys(state.cachedFlows).length || !state.cy) return;
  _applyFlowStyles();
  function tick() {
    for (const [id, dir] of Object.entries(state.cachedFlows)) {
      const elem = state.cy.getElementById(id);
      if (!elem.length || !elem.data('in_service')) continue;
      flowOffsets[id] = (flowOffsets[id] || 0) - dir * FLOW_SPEED;
      elem.style('line-dash-offset', flowOffsets[id]);
    }
    animFrame = requestAnimationFrame(tick);
  }
  animFrame = requestAnimationFrame(tick);
}

export function stopFlowAnimation() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}

function _applyFlowStyles() {
  for (const [id] of Object.entries(state.cachedFlows)) {
    const elem = state.cy.getElementById(id);
    if (!elem.length || !elem.data('in_service')) continue;
    elem.style({ 'line-style': 'dashed', 'line-dash-pattern': FLOW_DASH });
  }
}
