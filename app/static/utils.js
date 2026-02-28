export const TYPE_LABELS = {
  bus: 'Bus', gen: 'Generator', sgen: 'Static Gen', load: 'Load',
  trafo: 'Transformer', trafo3w: '3W Transformer', line: 'Line',
};

const statusEl = document.getElementById('status');

export function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

export function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const r  = Math.round(((ah >> 16) & 0xff) + (((bh >> 16) & 0xff) - ((ah >> 16) & 0xff)) * t);
  const g  = Math.round(((ah >> 8)  & 0xff) + (((bh >> 8)  & 0xff) - ((ah >> 8)  & 0xff)) * t);
  const b_ = Math.round((ah & 0xff) + ((bh & 0xff) - (ah & 0xff)) * t);
  return '#' + [r, g, b_].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function loadingColor(pct) {
  const t = Math.min(pct / 100, 1);
  return t <= 0.8
    ? lerpColor('#4ade80', '#fbbf24', t / 0.8)
    : lerpColor('#fbbf24', '#ef4444', (t - 0.8) / 0.2);
}

export function buildTooltipHtml(d) {
  const lines = [`<b>${d.label || d.id}</b>`];
  const typeLabel = (d.type === 'bus' && d.has_ext_grid)
    ? 'Ext. Grid Bus'
    : (TYPE_LABELS[d.type] || d.type);
  lines.push(`Type: <b>${typeLabel}</b>`);
  if (d.vn_kv       !== undefined) lines.push(`Voltage: <b>${d.vn_kv} kV</b>`);
  if (d.p_mw        !== undefined) lines.push(`P: <b>${d.p_mw.toFixed(2)} MW</b>`);
  if (d.max_p_mw    != null)       lines.push(`Max P: <b>${d.max_p_mw.toFixed(2)} MW</b>`);
  if (d.flow_mw     !== undefined) lines.push(`Current P: <b>${d.flow_mw.toFixed(2)} MW</b>`);
  if (d.loading_pct !== undefined) lines.push(`Loading: <b>${d.loading_pct.toFixed(1)} %</b>`);
  lines.push(`In service: <b>${d.in_service ? '✓' : '✗'}</b>`);
  return lines.join('<br>');
}

export function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '\u2026').width > maxW) {
    text = text.slice(0, -1);
  }
  return text + '\u2026';
}
