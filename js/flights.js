// Outbound and return flight cards with live status. Used in the convention's Trip tab.
import { h, debounce } from './util.js';
import { store as s } from './app-store.js';
import { getService, httpsUrl } from './services.js';
import { fetchFlightStatus, describeFlight, normalizeFlight } from './flightapi.js';
import { button, toast } from './ui.js';

const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export function flightsSection(c) {
  return h('div', { class: 'flights' }, flightCard(c, 'outbound', 'Outbound flight'), flightCard(c, 'return', 'Return flight'));
}

function flightCard(c, leg, title) {
  const f = c.flights?.[leg] || {};
  const patch = (p) => s.update('conventions', c.id, (cur) => ({ flights: { ...(cur.flights || {}), [leg]: { ...(cur.flights?.[leg] || {}), ...p } } }), { silent: true });
  const save = debounce(patch, 400);
  const result = h('div', { 'aria-live': 'polite' });
  const draw = (live, checkedAt) => {
    if (!live) { result.replaceChildren(); return; }
    result.replaceChildren(h('div', { class: 'fs' },
      h('span', { class: 'fs-pill', 'data-s': String(live.flight_status || 'unknown').toLowerCase() }, String(live.flight_status || 'unknown').replace(/^./, (x) => x.toUpperCase())),
      describeFlight(live).map((l) => h('span', {}, l)),
      checkedAt && h('span', { class: 'muted' }, 'Checked ' + ago(checkedAt))));
  };
  draw(f.liveStatus, f.liveStatusCheckedAt);

  const number = h('input', { id: `fn-${leg}`, type: 'text', value: f.flightNumber || '', placeholder: 'AF1234', autocapitalize: 'characters', oninput: (e) => save({ flightNumber: normalizeFlight(e.target.value) }) });
  const date = h('input', { id: `fd-${leg}`, type: 'date', value: f.date || '', oninput: (e) => save({ date: e.target.value }) });
  const time = h('input', { id: `ft-${leg}`, type: 'time', value: f.time || '', oninput: (e) => save({ time: e.target.value }) });
  const check = button('Check live status', { iconName: 'plane' });
  check.addEventListener('click', async () => {
    check.disabled = true;
    result.replaceChildren(h('p', { class: 'muted' }, 'Checking…'));
    try {
      const live = await fetchFlightStatus({ url: httpsUrl(getService('flightUrl')), token: getService('token'), number: number.value, date: date.value });
      patch({ flightNumber: normalizeFlight(number.value), date: date.value, time: time.value, liveStatus: live, liveStatusCheckedAt: new Date().toISOString() });
      draw(live, new Date().toISOString());
    } catch (e) {
      result.replaceChildren(h('p', { class: 'muted' }, e.message));
      if (!navigator.onLine) toast('You are offline. The last known status is kept.');
    } finally { check.disabled = false; }
  });
  return h('div', { class: 'flight' }, h('h3', {}, title),
    h('div', { class: 'field' }, h('label', { for: number.id }, 'Flight number'), number),
    h('div', { class: 'grid2', style: { gap: '0 12px' } }, h('div', { class: 'field' }, h('label', { for: date.id }, 'Date'), date), h('div', { class: 'field' }, h('label', { for: time.id }, 'Time'), time)),
    check, result);
}
