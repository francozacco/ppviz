import { state } from './state.js';
import { setupTooltips, unpinTooltip } from './tooltip.js';
import { resetFlowState } from './simulation.js';
import { initDrag } from './drag.js';

const GRAPH_STYLE = [
  // ── Default node ────────────────────────────────────────────────────────────
  {
    selector: 'node',
    style: {
      'label': '',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 3,
      'font-size': '7px',
      'color': '#94a3b8',
      'text-outline-width': 1,
      'text-outline-color': '#0f1117',
    },
  },
  // ── Bus ─────────────────────────────────────────────────────────────────────
  {
    selector: 'node[type = "bus"]',
    style: {
      'width': 9, 'height': 9,
      'shape': 'ellipse',
      'background-color': '#cbd5e1',
      'border-width': 1,
      'border-color': '#0f1117',
      'label': 'data(label)',
    },
  },
  { selector: 'node[type = "bus"][!in_service]', style: { 'background-color': '#475569' } },
  // ── Generators / Static gens ─────────────────────────────────────────────────
  {
    selector: 'node[type = "gen"], node[type = "sgen"]',
    style: {
      'width': 14, 'height': 14,
      'shape': 'ellipse',
      'background-color': '#2dd4bf',
      'border-width': 0,
    },
  },
  // ── Load ─────────────────────────────────────────────────────────────────────
  {
    selector: 'node[type = "load"]',
    style: {
      'width': 9, 'height': 9,
      'shape': 'polygon',
      'shape-polygon-points': '0 1, -1 -1, 1 -1',
      'background-color': '#f472b6',
      'border-width': 0,
    },
  },
  // ── Ext. Grid bus ─────────────────────────────────────────────────────────────
  {
    selector: 'node[type = "bus"][?has_ext_grid]',
    style: { 'background-color': '#f87171', 'width': 13, 'height': 13 },
  },
  // ── Trafo3w hub ───────────────────────────────────────────────────────────────
  {
    selector: 'node[type = "trafo3w"]',
    style: {
      'width': 14, 'height': 14,
      'shape': 'ellipse',
      'background-opacity': 0,
      'border-color': '#c084fc',
      'border-width': 2,
      'label': 'data(label)',
      'text-margin-y': 4,
    },
  },
  // ── Out-of-service ────────────────────────────────────────────────────────────
  { selector: 'node[!in_service]', style: { 'opacity': 0.35 } },
  // ── Default edge ──────────────────────────────────────────────────────────────
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'none',
      'source-arrow-shape': 'none',
      'width': 1,
      'line-color': '#334155',
    },
  },
  // ── Lines ─────────────────────────────────────────────────────────────────────
  { selector: 'edge[type = "line"]', style: { 'width': 2, 'line-color': '#60a5fa' } },
  { selector: 'edge[type = "line"][!in_service]', style: { 'line-style': 'dashed', 'line-color': '#475569' } },
  // ── 2W Trafo ──────────────────────────────────────────────────────────────────
  {
    selector: 'edge[type = "trafo"]',
    style: {
      'width': 2.5,
      'line-color': '#f59e0b',
      'curve-style': 'straight',
      'mid-source-arrow-shape': 'circle',
      'mid-source-arrow-fill': 'hollow',
      'mid-source-arrow-color': '#f59e0b',
      'mid-target-arrow-shape': 'circle',
      'mid-target-arrow-fill': 'hollow',
      'mid-target-arrow-color': '#f59e0b',
      'arrow-scale': 1.8,
    },
  },
  { selector: 'edge[type = "trafo"][!in_service]', style: { 'line-style': 'dashed', 'line-color': '#475569', 'opacity': 0.4 } },
  // ── 3W Trafo connection edges ─────────────────────────────────────────────────
  { selector: 'edge[type = "trafo_conn"]', style: { 'width': 2.5, 'line-color': '#c084fc', 'curve-style': 'straight' } },
  { selector: 'edge[type = "trafo_conn"][!in_service]', style: { 'line-style': 'dashed', 'opacity': 0.4 } },
  // ── Element connection edges ──────────────────────────────────────────────────
  { selector: 'edge[type = "connection"]', style: { 'width': 1, 'line-color': '#2d3248', 'curve-style': 'straight' } },
  // ── Selected ──────────────────────────────────────────────────────────────────
  { selector: ':selected', style: { 'border-color': '#f8fafc', 'border-width': 2, 'line-color': '#f8fafc' } },
  // ── Search highlight ──────────────────────────────────────────────────────────
  { selector: 'node.search-hit', style: { 'border-color': '#ffffff', 'border-width': 5 } },
  { selector: 'edge.search-hit', style: { 'line-color': '#ffffff', 'width': 5 } },
];

export function renderGraph(nodes, edges) {
  state.pinnedElemId = null;
  resetFlowState();
  unpinTooltip();

  const searchDropdown = document.getElementById('search-dropdown');
  searchDropdown.style.display = 'none';
  state.hiddenTypes.clear();
  document.querySelectorAll('.legend-item.legend-hidden')
    .forEach(el => el.classList.remove('legend-hidden'));

  const elements = [
    ...nodes.map(n => ({ data: { ...n } })),
    ...edges.map(e => ({ data: { ...e } })),
  ];

  if (state.cy) state.cy.destroy();

  state.cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    style: GRAPH_STYLE,
  });

  // Use geographic positions when the network has geodata (best quality).
  // Fall back to fcose on the backbone when no positions are available.
  const hasGeodata = nodes.some(n => n.x != null && n.y != null);

  let layout;
  if (hasGeodata) {
    layout = state.cy.layout({
      name: 'preset',
      animate: false,
      positions: node => {
        const x = node.data('x');
        const y = node.data('y');
        return (x != null && y != null) ? { x, y } : undefined;
      },
    });
  } else {
    const backbone = state.cy.elements(
      'node[type = "bus"], node[type = "trafo3w"], ' +
      'edge[type = "line"], edge[type = "trafo"], edge[type = "trafo_conn"]'
    );
    layout = backbone.layout({
      name: 'cose',
      animate: false,
      randomize: false,
      nodeRepulsion: 12000,
      nodeOverlap: 16,
      idealEdgeLength: 80,
      edgeElasticity: 100,
    });
  }
  layout.on('layoutstop', () => {
    _postPositionElements(state.cy);
    state.cy.fit(undefined, 30);
    setupTooltips(state.cy);
    initDrag(state.cy);
  });
  layout.run();
}

function _postPositionElements(cy) {
  const ELEM_TYPES = new Set(['gen', 'sgen', 'load']);
  const byBus = new Map();

  cy.nodes().forEach(n => {
    if (!ELEM_TYPES.has(n.data('type'))) return;
    const bus = n.connectedEdges('[type = "connection"]').first()
                  .connectedNodes('[type = "bus"]').first();
    if (!bus.length) return;
    if (!byBus.has(bus.id())) byBus.set(bus.id(), []);
    byBus.get(bus.id()).push(n);
  });

  byBus.forEach((elemNodes, busId) => {
    const bus = cy.getElementById(busId);
    const bp  = bus.position();

    let awayX = 0, awayY = 0;
    bus.neighborhood('node[type = "bus"]').forEach(nb => {
      const dx = bp.x - nb.position().x;
      const dy = bp.y - nb.position().y;
      const len = Math.hypot(dx, dy) || 1;
      awayX += dx / len;
      awayY += dy / len;
    });
    if (awayX === 0 && awayY === 0) awayY = -1;

    const mag       = Math.hypot(awayX, awayY);
    const baseAngle = Math.atan2(awayY / mag, awayX / mag);
    const dist      = 50;
    const spread    = Math.PI / 5;

    elemNodes.forEach((node, i) => {
      const offset = elemNodes.length === 1 ? 0 : (i / (elemNodes.length - 1) - 0.5) * spread;
      const angle  = baseAngle + offset;
      node.position({ x: bp.x + dist * Math.cos(angle), y: bp.y + dist * Math.sin(angle) });
    });
  });
}
