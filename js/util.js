// DOM builder and small helpers. Nothing here uses innerHTML or inline event attributes,
// so user data can never be interpreted as markup or script.
const BOOL_PROPS = new Set(['checked', 'selected', 'disabled', 'hidden', 'open', 'readOnly', 'multiple']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let deferredValue;
  for (const [key, val] of Object.entries(props || {})) {
    if (val == null || val === false) continue;
    if (key === 'class') el.className = val;
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key === 'value') deferredValue = val;
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (BOOL_PROPS.has(key)) el[key] = true;
    else el.setAttribute(key, val === true ? '' : String(val));
  }
  append(el, kids);
  if (deferredValue !== undefined) el.value = deferredValue; // after options exist, for <select>
  return el;
}

function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  today: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  episodes: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4M9 21h6',
  guests: 'M16 20v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zM20 20v-1a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  conventions: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4',
  settings: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  plus: 'M12 5v14M5 12h14', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.5-4.5',
  play: 'M7 4l13 8-13 8z', check: 'M5 12l4 4 10-10', x: 'M6 6l12 12M18 6L6 18',
  up: 'M6 14l6-6 6 6', down: 'M6 10l6 6 6-6', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6',
  back: 'M15 6l-6 6 6 6', download: 'M12 4v11M7 11l5 5 5-5M5 20h14', upload: 'M12 20V9M7 13l5-5 5 5M5 4h14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5', skip: 'M5 5l10 7-10 7zM18 5v14',
  day: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  venues: 'M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10zM12 8a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  budget: 'M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2',
  stats: 'M5 20V10M12 20V4M19 20v-7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plane: 'M2 16l8-3V7a2 2 0 014 0v6l8 3v2l-8-1-1 4 3 2v1l-4-1-4 1v-1l3-2-1-4-8 1z',
  dice: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
  refresh: 'M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4',
  link: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  print: 'M7 9V3h10v6M7 17H5v-6h14v6h-2M7 14h10v7H7z',
  phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 005 5L16 12l5 2v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  focus: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M12 10a2 2 0 100 4 2 2 0 000-4z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a2.5 2.5 0 100-5M21 19a5 5 0 00-4-4.9',
  shuffle: 'M3 6h4l10 12h4M3 18h4l3-3.6M14 8.4L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

const pad = (n) => String(n).padStart(2, '0');
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

export function relDays(n) {
  if (n == null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Only https URLs may be used as image or link targets. */
export function safeUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
}

export const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h2 = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h2 ? h2 + ':' + pad(m) : m) + ':' + pad(sec);
};
