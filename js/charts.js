// Small, accessible charts built from plain DOM. Colors come from the validated palette tokens
// (--viz-1 to --viz-5, defined in app.css). Values and names are always real text, never color alone,
// and every chart can be opened as a table.
import { h } from './util.js';

const series = (i) => `var(--viz-${((i - 1) % 5) + 1})`;
const pct = (v, max) => (max > 0 ? Math.max(2, (v / max) * 100) : 0);

export function statTile(label, value, note) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('strong', {}, String(value)), note && h('span', { class: 'muted' }, note));
}

/** Ranked horizontal bars. One series, one color. */
export function hbars(rows, { fmt = String, color = 1 } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return h('ul', { class: 'hbars' }, rows.map((r) => h('li', {},
    h('div', { class: 'hb-head' }, h('span', { class: 'hb-name' }, r.name), h('span', { class: 'hb-val' }, fmt(r.value))),
    h('div', { class: 'track' }, h('i', { style: { width: pct(r.value, max) + '%', background: series(color) } })),
    r.note && h('span', { class: 'muted hb-note' }, r.note))));
}

/** Bars where part of each is highlighted, for example published out of total. */
export function splitBars(rows, { doneLabel = 'done', restLabel = 'not yet' } = {}) {
  const max = Math.max(...rows.map((r) => r.total), 0);
  return h('div', {}, h('ul', { class: 'hbars' }, rows.map((r) => h('li', {},
    h('div', { class: 'hb-head' }, h('span', { class: 'hb-name' }, r.name), h('span', { class: 'hb-val' }, String(r.total))),
    h('div', { class: 'track' }, h('i', { class: 'stacked', style: { width: pct(r.total, max) + '%' } },
      h('b', { style: { width: (r.total ? (r.done / r.total) * 100 : 0) + '%', background: series(1) } }))),
    h('span', { class: 'muted hb-note' }, `${r.done} ${doneLabel}, ${r.total - r.done} ${restLabel}`)))),
  h('p', { class: 'legend-line' }, h('span', { class: 'swatch', style: { background: series(1) } }), doneLabel, h('span', { class: 'swatch rest' }), restLabel));
}

/** Vertical columns over time. Every column keeps its value as text. */
export function columns(rows, { fmt = String } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return h('div', { class: 'cols', role: 'list' }, rows.map((r) => h('div', { class: 'col', role: 'listitem', tabindex: '0', title: `${r.label}: ${fmt(r.value)}`, 'aria-label': `${r.label}: ${fmt(r.value)}` },
    h('span', { class: 'col-val' }, fmt(r.value)),
    h('div', { class: 'col-bar' }, h('i', { style: { height: Math.max(6, (r.value / max) * 100) + '%', background: series(1) } })),
    h('span', { class: 'col-lab' }, r.label))));
}

/** One 100% bar with a legend that always carries the name, count and share. */
export function stackBar(parts, { fmt = String } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return h('div', {},
    h('div', { class: 'stack', role: 'img', 'aria-label': parts.map((p) => `${p.name} ${Math.round((p.value / total) * 100)}%`).join(', ') },
      parts.map((p, i) => h('i', { style: { flexGrow: p.value, background: series(i + 1) } }))),
    h('ul', { class: 'legend' }, parts.map((p, i) => h('li', {}, h('span', { class: 'swatch', style: { background: series(i + 1) } }), h('span', {}, p.name), h('b', {}, `${fmt(p.value)} (${Math.round((p.value / total) * 100)}%)`)))));
}

export function sparkline(points, { w = 96, h: ht = 28 } = {}) {
  if (points.length < 2) return h('span', { class: 'muted' }, 'No trend yet');
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const xy = points.map((v, i) => `${((i / (points.length - 1)) * (w - 4) + 2).toFixed(1)},${(ht - 3 - ((v - lo) / span) * (ht - 6)).toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${ht}`); svg.setAttribute('width', w); svg.setAttribute('height', ht);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Trend from ${points[0]} to ${points[points.length - 1]}`);
  const line = document.createElementNS(ns, 'polyline');
  for (const [k, v] of Object.entries({ points: xy, fill: 'none', stroke: series(1), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) line.setAttribute(k, v);
  svg.append(line);
  return svg;
}

/** The same numbers as a table, for screen readers and for copying. */
export function tableView(headers, rows) {
  return h('details', { class: 'table-view' }, h('summary', {}, 'View as table'),
    h('table', {}, h('thead', {}, h('tr', {}, headers.map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', {}, c))))))));
}

export function chartCard(title, description, ...body) {
  return h('section', { class: 'panel block chart' }, h('h2', {}, title), description && h('p', { class: 'muted' }, description), ...body);
}
