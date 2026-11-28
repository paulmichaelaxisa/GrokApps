// Tiny hand-rolled SVG charts (no libraries): a bar chart for day/month energy and a live-watts sparkline.
const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

/** Nice round upper bound for an axis. */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

/**
 * items: [{label, value, highlight, title}]. onSelect(item|null) fires when a bar is tapped.
 * Draws into `host` (replacing its content).
 */
export function barChart(host, items, { height = 150, labelEvery = 1, unit = 'kWh', onSelect } = {}) {
  host.textContent = '';
  const W = 340, padL = 30, padR = 4, padT = 8, padB = 20;
  const H = height;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const max = niceMax(Math.max(0, ...items.map((i) => i.value)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  for (const t of [0, 0.5, 1]) {
    const y = padT + plotH * (1 - t);
    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'grid-line' }));
    svg.appendChild(el('text', { x: padL - 4, y: y + 3, class: 'axis', 'text-anchor': 'end' }, fmtAxis(max * t)));
  }
  const slot = plotW / Math.max(1, items.length);
  const bw = Math.max(2, Math.min(18, slot * 0.68));
  let selected = null;
  const bars = items.map((it, i) => {
    const h = Math.max(it.value > 0 ? 2 : 0, (it.value / max) * plotH);
    const x = padL + slot * i + (slot - bw) / 2;
    const r = el('rect', { x, y: padT + plotH - h, width: bw, height: h, rx: Math.min(4, bw / 2), class: 'bar' + (it.highlight ? ' hl' : '') });
    const hit = el('rect', { x: padL + slot * i, y: padT, width: slot, height: plotH + padB, class: 'hit' });
    hit.addEventListener('click', () => {
      selected = selected === i ? null : i;
      bars.forEach((b, j) => b.classList.toggle('sel', j === selected));
      onSelect && onSelect(selected === null ? null : items[i]);
    });
    svg.appendChild(r);
    svg.appendChild(hit);
    if (i % labelEvery === 0 || it.highlight) svg.appendChild(el('text', { x: x + bw / 2, y: H - 5, class: 'axis', 'text-anchor': 'middle' }, it.label));
    return r;
  });
  host.appendChild(svg);
  if (!items.length) host.appendChild(Object.assign(document.createElement('p'), { className: 'muted small center', textContent: 'No history yet' }));
}

function fmtAxis(v) {
  return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(0) : v.toFixed(v % 1 ? 1 : 0);
}

/** samples: [{t, w}] -> area sparkline. */
export function sparkline(host, samples, { height = 70 } = {}) {
  host.textContent = '';
  const W = 340, H = height;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Live power, last few minutes' });
  if (samples.length < 2) {
    svg.appendChild(el('text', { x: W / 2, y: H / 2 + 4, class: 'axis', 'text-anchor': 'middle' }, 'Collecting live readings…'));
    host.appendChild(svg);
    return;
  }
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
  // zoom to the data so small wobbles in a steady load are visible, but never exaggerate noise
  const lo0 = Math.min(...samples.map((s) => s.w)), hi0 = Math.max(...samples.map((s) => s.w));
  const span = Math.max(hi0 - lo0, hi0 * 0.12, 2);
  const lo = Math.max(0, lo0 - span * 0.25), hi = hi0 + span * 0.15;
  const pts = samples.map((s) => [((s.t - t0) / Math.max(1, t1 - t0)) * W, H - 4 - ((s.w - lo) / (hi - lo)) * (H - 10)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  svg.appendChild(el('path', { d: line + ` L${W} ${H} L0 ${H} Z`, class: 'spark-area' }));
  svg.appendChild(el('path', { d: line, class: 'spark-line', fill: 'none' }));
  host.appendChild(svg);
}
