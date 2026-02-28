import { lerpColor, fitText } from './utils.js';

const CELL  = 52;
const ROW_W = 130;
const COL_H = 110;
const CBAR_H = 26;
const HPAD  = 10;

const sensPanel        = document.getElementById('sens-panel');
const sensCanvas       = document.getElementById('sens-canvas');
const sensCollapse     = document.getElementById('sens-collapse');
const sensExpand       = document.getElementById('sens-expand');
const sensResizeHandle = document.getElementById('sens-resize-handle');

let savedPanelWidth = null;

export async function fetchAndDrawSensMatrix() {
  try {
    const res  = await fetch('/sensitivities');
    const data = await res.json();
    if (!res.ok) return;
    _drawSensMatrix(data.rows, data.cols, data.matrix);
    sensPanel.classList.add('visible');
  } catch (_) {}
}

export function initSensPanel() {
  sensCollapse.addEventListener('click', () => {
    savedPanelWidth = sensPanel.style.flex ? sensPanel.getBoundingClientRect().width : null;
    sensPanel.style.flex     = '';
    sensPanel.style.maxWidth = '';
    sensPanel.classList.add('collapsed');
  });

  sensExpand.addEventListener('click', () => {
    sensPanel.classList.remove('collapsed');
    if (savedPanelWidth !== null) {
      sensPanel.style.flex     = `0 0 ${savedPanelWidth}px`;
      sensPanel.style.maxWidth = `${savedPanelWidth}px`;
    }
  });

  sensResizeHandle.addEventListener('mousedown', e => {
    if (sensPanel.classList.contains('collapsed')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sensPanel.getBoundingClientRect().width;
    sensResizeHandle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const w = Math.max(200, startW + e.clientX - startX);
      sensPanel.style.flex     = `0 0 ${w}px`;
      sensPanel.style.maxWidth = `${w}px`;
    }

    function onUp() {
      sensResizeHandle.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

function _drawSensMatrix(rows, cols, matrix) {
  const nR = rows.length;
  const nC = cols.length;
  const W  = ROW_W + nC * CELL + HPAD;
  const H  = COL_H + nR * CELL + CBAR_H + HPAD;

  sensCanvas.width  = W;
  sensCanvas.height = H;

  const ctx = sensCanvas.getContext('2d');
  ctx.fillStyle = '#13161f';
  ctx.fillRect(0, 0, W, H);

  // Cells + in-cell value
  for (let r = 0; r < nR; r++) {
    for (let c = 0; c < nC; c++) {
      const val = matrix[r][c];
      const cx  = ROW_W + c * CELL;
      const cy  = COL_H + r * CELL;
      ctx.fillStyle = _ptdfColor(val);
      ctx.fillRect(cx, cy, CELL - 2, CELL - 2);
      ctx.font         = '10px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#f1f5f9';
      ctx.fillText(val.toFixed(3), cx + (CELL - 2) / 2, cy + (CELL - 2) / 2);
    }
  }

  ctx.font = '10px system-ui, sans-serif';

  // Row labels
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#94a3b8';
  for (let r = 0; r < nR; r++) {
    const y = COL_H + r * CELL + CELL / 2;
    ctx.fillText(fitText(ctx, rows[r].label, ROW_W - 6), ROW_W - 4, y);
  }

  // Column labels (rotated −90°)
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#94a3b8';
  for (let c = 0; c < nC; c++) {
    ctx.save();
    ctx.translate(ROW_W + c * CELL + CELL / 2, COL_H - 4);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(fitText(ctx, cols[c].label, COL_H - 8), 0, 0);
    ctx.restore();
  }

  // Colorbar
  const barX = ROW_W;
  const barY = COL_H + nR * CELL + 8;
  const barW = Math.max(nC * CELL, 1);
  const barH = 7;
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0,   '#3b82f6');
  grad.addColorStop(0.5, '#1e2130');
  grad.addColorStop(1,   '#ef4444');
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.font         = '8px system-ui, sans-serif';
  ctx.fillStyle    = '#64748b';
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';  ctx.fillText('-1.0', barX, barY + barH + 2);
  ctx.textAlign = 'center';   ctx.fillText('PTDF', barX + barW / 2, barY + barH + 2);
  ctx.textAlign = 'right';    ctx.fillText('+1.0', barX + barW, barY + barH + 2);
}

function _ptdfColor(val) {
  const v = Math.max(-1, Math.min(1, val));
  return v >= 0
    ? lerpColor('#1e2130', '#ef4444', v)
    : lerpColor('#3b82f6', '#1e2130', v + 1);
}
