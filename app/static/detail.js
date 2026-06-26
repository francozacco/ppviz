import { TYPE_LABELS } from './utils.js';

const detailTitle    = document.getElementById('detail-title');
const detailSubtitle = document.getElementById('detail-subtitle');
const detailBody     = document.getElementById('detail-body');

const PLACEHOLDER = '<p class="detail-placeholder">Select an element to view its properties.</p>';

// Standard pandapower columns per table — anything extra is treated as a measurement.
const STANDARD_COLS = {
  bus:    new Set(['index','vn_kv','type','zone','in_service','max_vm_pu','min_vm_pu']),
  line:   new Set(['index','std_type','from_bus','to_bus','length_km','r_ohm_per_km',
                   'x_ohm_per_km','c_nf_per_km','g_us_per_km','max_i_ka','df',
                   'parallel','type','in_service','max_loading_percent','max_p_mw']),
  trafo:  new Set(['index','std_type','hv_bus','lv_bus','sn_mva','vn_hv_kv','vn_lv_kv',
                   'vk_percent','vkr_percent','pfe_kw','i0_percent','shift_degree',
                   'in_service','tap_pos','tap_neutral','tap_min','tap_max',
                   'tap_step_percent','tap_step_degree','tap_side','type',
                   'max_loading_percent','max_p_mw']),
  trafo3w:new Set(['index','std_type','hv_bus','mv_bus','lv_bus','sn_hv_mva','sn_mv_mva',
                   'sn_lv_mva','vn_hv_kv','vn_mv_kv','vn_lv_kv','vk_hv_percent',
                   'vk_mv_percent','vk_lv_percent','vkr_hv_percent','vkr_mv_percent',
                   'vkr_lv_percent','pfe_kw','i0_percent','shift_mv_degree',
                   'shift_lv_degree','in_service','tap_pos','tap_neutral','tap_min',
                   'tap_max','tap_step_percent','tap_at_star_point','max_loading_percent']),
  gen:    new Set(['index','bus','p_mw','vm_pu','sn_mva','min_p_mw','max_p_mw',
                   'min_q_mvar','max_q_mvar','in_service','controllable']),
  sgen:   new Set(['index','bus','p_mw','q_mvar','sn_mva','type','in_service','controllable',
                   'max_p_mw','min_p_mw','max_q_mvar','min_q_mvar']),
  load:   new Set(['index','bus','p_mw','q_mvar','sn_mva','const_z_percent','const_i_percent',
                   'in_service','type','controllable']),
};

const COL_LABELS = {
  // Common
  index: 'Index', in_service: 'In service', std_type: 'Std type', type: 'Type',
  // Bus
  vn_kv: 'Vn (kV)', zone: 'Zone',
  max_vm_pu: 'Max Vm (pu)', min_vm_pu: 'Min Vm (pu)',
  // Line
  from_bus: 'From bus', to_bus: 'To bus', length_km: 'Length (km)',
  r_ohm_per_km: 'R (Ω/km)', x_ohm_per_km: 'X (Ω/km)',
  c_nf_per_km: 'C (nF/km)', g_us_per_km: 'G (μS/km)',
  max_i_ka: 'Max I (kA)', df: 'Derating factor', parallel: 'Parallel',
  max_loading_percent: 'Max loading (%)',
  // Gen / Sgen / Load
  bus: 'Bus', p_mw: 'P (MW)', q_mvar: 'Q (Mvar)', vm_pu: 'Vm (pu)',
  sn_mva: 'Sn (MVA)', max_p_mw: 'Max P (MW)', min_p_mw: 'Min P (MW)',
  max_q_mvar: 'Max Q (Mvar)', min_q_mvar: 'Min Q (Mvar)',
  controllable: 'Controllable',
  const_z_percent: 'Const Z (%)', const_i_percent: 'Const I (%)',
  // Trafo
  hv_bus: 'HV bus', lv_bus: 'LV bus', mv_bus: 'MV bus',
  vn_hv_kv: 'Vn HV (kV)', vn_lv_kv: 'Vn LV (kV)', vn_mv_kv: 'Vn MV (kV)',
  sn_hv_mva: 'Sn HV (MVA)', sn_mv_mva: 'Sn MV (MVA)', sn_lv_mva: 'Sn LV (MVA)',
  vk_percent: 'Vk (%)', vkr_percent: 'Vkr (%)',
  vk_hv_percent: 'Vk HV (%)', vk_mv_percent: 'Vk MV (%)', vk_lv_percent: 'Vk LV (%)',
  vkr_hv_percent: 'Vkr HV (%)', vkr_mv_percent: 'Vkr MV (%)', vkr_lv_percent: 'Vkr LV (%)',
  pfe_kw: 'Pfe (kW)', i0_percent: 'i0 (%)',
  shift_degree: 'Shift (°)', shift_mv_degree: 'Shift MV (°)', shift_lv_degree: 'Shift LV (°)',
  tap_pos: 'Tap pos', tap_neutral: 'Tap neutral',
  tap_min: 'Tap min', tap_max: 'Tap max',
  tap_step_percent: 'Tap step (%)', tap_step_degree: 'Tap step (°)',
  tap_side: 'Tap side', tap_at_star_point: 'Tap at star point',
  // Measurement columns (when present in main tables)
  p_from_mw: 'P from (MW)', q_from_mw: 'Q from (Mvar)',
  p_to_mw: 'P to (MW)', q_to_mw: 'Q to (Mvar)',
  p_hv_mw: 'P HV (MW)', q_hv_mvar: 'Q HV (Mvar)',
  p_lv_mw: 'P LV (MW)', q_lv_mvar: 'Q LV (Mvar)',
  p_mv_mw: 'P MV (MW)', q_mv_mvar: 'Q MV (Mvar)',
};

function _fmtKey(col) {
  return COL_LABELS[col] || col.replace(/_/g, ' ');
}

function _fmtVal(val) {
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return String(val);
    return parseFloat(val.toPrecision(5)).toString();
  }
  return String(val);
}

function _row(key, val) {
  return `<div class="prop-row">
    <span class="prop-key">${_fmtKey(key)}</span>
    <span class="prop-val">${_fmtVal(val)}</span>
  </div>`;
}

export async function showElementDetail(elementId) {
  try {
    const res = await fetch(`/element/${encodeURIComponent(elementId)}/data`);
    if (!res.ok) return;
    const { type, label, props } = await res.json();

    detailTitle.textContent    = label || elementId;
    detailSubtitle.textContent = TYPE_LABELS[type] || type;

    const stdCols  = STANDARD_COLS[type] || new Set();
    const params   = [];
    const measured = [];

    for (const [k, v] of Object.entries(props)) {
      if (v === null) continue;
      (stdCols.has(k) ? params : measured).push([k, v]);
    }

    let html = '';
    if (params.length) {
      html += '<div class="prop-section">Parameters</div>';
      html += params.map(([k, v]) => _row(k, v)).join('');
    }
    if (measured.length) {
      html += '<div class="prop-section">Measurements</div>';
      html += measured.map(([k, v]) => _row(k, v)).join('');
    }
    detailBody.innerHTML = html || '<p class="detail-placeholder">No properties.</p>';
  } catch (_) {}
}

export function clearElementDetail() {
  detailTitle.textContent    = '';
  detailSubtitle.textContent = '';
  detailBody.innerHTML       = PLACEHOLDER;
}
