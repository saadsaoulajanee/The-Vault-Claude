// Focus mode for a convention day: what is happening now and what is next, nothing else.
// Dark stage like Live mode. Updates itself every 20 seconds.
import { h, fmtDate, todayIso } from '../util.js';
import { store as s } from '../app-store.js';
import { pageHeader, empty } from '../ui.js';
import { timeToMinutes, weekdayName } from '../model.js';
import { scheduleFor, nowAndNext } from './day.js';

export default function focus({ root, params }) {
  const c = s.byId('conventions', params.id);
  const date = params.date;
  if (!c) {
    root.append(pageHeader({ title: 'Convention not found', back: { href: '/day', label: 'Day' } }), empty({ title: 'This convention was deleted or never existed' }));
    return { manual: true };
  }
  const stage = h('div', { class: 'live focus', tabindex: '-1' });
  root.append(stage);
  document.body.classList.add('is-live');

  const left = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
  const card = (label, i, minutes, big) => h('section', { class: 'focus-card' + (big ? ' big' : ''), 'aria-label': label },
    h('span', { class: 'focus-label' }, label),
    h('strong', { class: 'focus-title' }, i.title),
    h('span', { class: 'focus-when' }, `${i.time}${i.endTime ? ' to ' + i.endTime : ''}`),
    h('span', { class: 'focus-meta' }, [i.kind, i.room && 'Room: ' + i.room, i.guests?.length && 'With ' + i.guests.join(', ')].filter(Boolean).join('. ')),
    minutes != null && h('span', { class: 'focus-count' }, minutes),
    i.href && h('a', { class: 'btn secondary', href: i.href }, i.action));

  const draw = () => {
    const db = s.get();
    const cur = s.byId('conventions', c.id) || c;
    const items = scheduleFor(db, cur, date);
    const now = new Date();
    const isToday = date === todayIso();
    const mins = now.getHours() * 60 + now.getMinutes();
    const { current, next } = isToday ? nowAndNext(items, mins) : { current: null, next: items.find((i) => timeToMinutes(i.time) != null) || null };
    const endOf = (i) => timeToMinutes(i.endTime) ?? timeToMinutes(i.time) + 30;
    const body = [];
    if (current) body.push(card('Happening now', current, `${left(Math.max(0, endOf(current) - mins))} left`, true));
    if (next) body.push(card(isToday ? 'Up next' : 'First of the day', next, isToday ? `in ${left(timeToMinutes(next.time) - mins)}` : null, !current));
    if (!current && !next) body.push(h('p', { class: 'focus-none' }, isToday ? 'Nothing else today. Well done.' : 'Nothing planned for this day.'));
    const later = items.filter((i) => timeToMinutes(i.time) != null && (!isToday || timeToMinutes(i.time) > mins) && i !== next && i !== current);
    stage.replaceChildren(
      h('div', { class: 'live-top' },
        h('a', { class: 'btn ghost', href: '#/day' }, 'Close'),
        h('div', { class: 'live-title' }, h('strong', {}, c.name), h('span', {}, `${weekdayName(date)} ${fmtDate(date, { day: 'numeric', month: 'short' })}`)),
        h('span', { class: 'live-timer', 'aria-label': 'Time now' }, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))),
      h('div', { class: 'focus-body' }, ...body),
      later.length ? h('details', { class: 'focus-later' }, h('summary', {}, `Later today (${later.length})`),
        h('ul', {}, later.map((i) => h('li', {}, h('b', {}, i.time), ' ', i.title)))) : h('span', {}));
  };
  draw();
  const tick = setInterval(draw, 20000);
  const onVis = () => { if (!document.hidden) draw(); };
  document.addEventListener('visibilitychange', onVis);
  let wake = null;
  navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
  stage.focus({ preventScroll: true });
  return {
    manual: true,
    cleanup() {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
      document.body.classList.remove('is-live');
      wake?.release?.().catch(() => {});
    },
  };
}
