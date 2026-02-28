import { state } from './state.js';

const HIDE_MAP = {
  bus:      () => state.cy.$('node[type = "bus"]'),
  line:     () => state.cy.$('edge[type = "line"]'),
  trafo:    () => state.cy.$('edge[type = "trafo"]'),
  trafo3w:  () => state.cy.$('node[type = "trafo3w"], edge[type = "trafo_conn"]'),
  gen:      () => {
    const nodes = state.cy.$('node[type = "gen"], node[type = "sgen"]');
    return nodes.union(nodes.connectedEdges('[type = "connection"]'));
  },
  load:     () => {
    const nodes = state.cy.$('node[type = "load"]');
    return nodes.union(nodes.connectedEdges('[type = "connection"]'));
  },
  ext_grid: () => state.cy.$('node[type = "bus"][?has_ext_grid]'),
};

export function initLegend() {
  document.querySelectorAll('.legend-item[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      if (!state.cy) return;
      const key   = el.dataset.toggle;
      const elems = HIDE_MAP[key]?.();
      if (!elems) return;

      if (state.hiddenTypes.has(key)) {
        state.hiddenTypes.delete(key);
        elems.show();
        el.classList.remove('legend-hidden');
      } else {
        state.hiddenTypes.add(key);
        elems.hide();
        el.classList.add('legend-hidden');
      }
    });
  });
}
