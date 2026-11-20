import { fmtMoney } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const tooltipEl = () => document.getElementById('tooltip');

function showTooltip(x, y, title, value, label) {
  const tip = tooltipEl();
  const titleEl = document.createElement('div');
  titleEl.className = 'tooltip-title';
  titleEl.textContent = title;
  const row = document.createElement('div');
  row.className = 'tooltip-row';
  const strong = document.createElement('strong');
  strong.textContent = value;
  const name = document.createElement('span');
  name.textContent = label;
  row.append(strong, name);
  tip.replaceChildren(titleEl, row);
  tip.hidden = false;
  const { width, height } = tip.getBoundingClientRect();
  const top = y - height - 12 < 8 ? y + 16 : y - height - 12;
  tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - width - 8))}px`;
  tip.style.top = `${top}px`;
}

export const hideTooltip = () => { tooltipEl().hidden = true; };

function bindTooltip(target, title, value, label) {
  const show = (e) => showTooltip(e.clientX, e.clientY, title, value, label);
  target.addEventListener('pointermove', show);
  target.addEventListener('pointerdown', show);
  target.addEventListener('pointerleave', hideTooltip);
  target.addEventListener('focus', () => {
    const box = target.getBoundingClientRect();
    showTooltip(box.left + box.width / 2, box.top, title, value, label);
  });
  target.addEventListener('blur', hideTooltip);
}

export const fmtShare = (share) => `${(share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const SIZE = 220;
const RADIUS = 84;
const THICKNESS = 24;
const GAP = 2;

export function donutChart(segments, total, centerLabel = 'Despesas') {
  const circumference = 2 * Math.PI * RADIUS;
  const chart = svg('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'group', 'aria-label': 'Despesas por categoria' });
  const center = SIZE / 2;
  const base = { cx: center, cy: center, r: RADIUS, 'stroke-width': THICKNESS };

  if (!segments.length) chart.append(svg('circle', { ...base, stroke: 'var(--grid)' }));

  const gap = segments.length > 1 ? GAP : 0;
  let start = 0;
  for (const s of segments) {
    const length = s.share * circumference;
    const arc = svg('circle', {
      ...base,
      class: 'segment',
      stroke: s.color,
      'stroke-dasharray': `${Math.max(length - gap, 1)} ${circumference}`,
      'stroke-dashoffset': -start,
      transform: `rotate(-90 ${center} ${center})`,
      tabindex: 0,
      role: 'img',
      'aria-label': `${s.name}: ${fmtMoney(s.total)}, ${fmtShare(s.share)}`,
    });
    bindTooltip(arc, s.name, fmtMoney(s.total), `${fmtShare(s.share)} do total`);
    chart.append(arc);
    start += length;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'donut';
  const middle = document.createElement('div');
  middle.className = 'donut-center';
  const label = document.createElement('span');
  label.textContent = centerLabel;
  const value = document.createElement('strong');
  value.textContent = fmtMoney(total);
  middle.append(label, value);
  wrapper.append(chart, middle);
  return wrapper;
}

// Gráfico de linha do gasto acumulado dia a dia. series: [{ name, color, points: [centavos por dia] }]
const LW = 320;
const LH = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };
const compact = (cents) => {
  const v = cents / 100;
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};

export function lineChart(series, days = 31) {
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw);
  const top = Math.max(nice, 100) * 3;
  const w = LW - PAD.left - PAD.right;
  const hgt = LH - PAD.top - PAD.bottom;
  const x = (day) => PAD.left + ((day - 1) / (days - 1)) * w;
  const y = (cents) => PAD.top + hgt - (cents / top) * hgt;
  const chart = svg('svg', { viewBox: `0 0 ${LW} ${LH}`, role: 'img', 'aria-label': 'Gasto acumulado por dia em cada mês' });

  for (let i = 0; i <= 3; i += 1) {
    const value = (top / 3) * i;
    chart.append(svg('line', { class: 'line-grid', x1: PAD.left, x2: LW - PAD.right, y1: y(value), y2: y(value) }));
    const label = svg('text', { class: 'line-axis', x: PAD.left - 6, y: y(value) + 4, 'text-anchor': 'end' });
    label.textContent = compact(value);
    chart.append(label);
  }
  for (const day of [1, 10, 20, days]) {
    const label = svg('text', { class: 'line-axis', x: x(day), y: LH - 6, 'text-anchor': 'middle' });
    label.textContent = String(day);
    chart.append(label);
  }

  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    chart.append(svg('path', { class: 'line-path', d, style: `stroke:${s.color}` }));
    const last = s.points.length;
    const dot = svg('circle', { class: 'line-dot', cx: x(last), cy: y(s.points[last - 1]), r: 4.5, style: `fill:${s.color}`, tabindex: 0 });
    bindTooltip(dot, s.name, fmtMoney(s.points[last - 1]), `até o dia ${last}`);
    chart.append(dot);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'line-chart';
  wrapper.append(chart);
  return wrapper;
}
