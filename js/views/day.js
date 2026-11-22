// Convention Day: one timeline for panels, interviews and your own activities, with checklists.
import { h, icon, fmtDate, todayIso } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { render, navigate } from '../router.js';
import { contactsList } from './organizers.js';
import { datesBetween, matchesDay, interviewDate, timeToMinutes, weekdayName, DEFAULT_PRECON_TASKS, DEFAULT_SETUP_TASKS, episodeGuestIds } from '../model.js';
import { pageHeader, empty, button, iconButton, askForm, toast, progress, segmented } from '../ui.js';
import { mapsUrl } from './venues.js';

let convId = '';
let dayIso = '';
let listTab = 'before';

const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Everything happening on one date at one convention, sorted by start time. */
export function scheduleFor(db, c, date) {
  const names = (ids) => (ids || []).map((id) => db.guests.find((g) => g.id === id)?.name).filter(Boolean);
  const items = [];
  for (const p of (c.panels || []).filter((x) => matchesDay(x.day, date))) {
    items.push({ key: 'p' + p.id, kind: 'Panel', title: p.title, time: p.time, endTime: p.endTime, room: p.room, guests: names(p.guestIds), href: `#/live/panel/${c.id}~${p.id}`, action: 'Go live' });
  }
  for (const e of db.episodes.filter((x) => x.conventionId === c.id && Number(x.status) !== 10 && interviewDate(x, c) === date)) {
    const start = timeToMinutes(e.time), len = /^\d+$/.test(String(e.duration || '')) ? Number(e.duration) : 0;
    items.push({ key: 'e' + e.id, kind: 'Interview', title: e.guest || 'Unnamed guest', time: e.time, endTime: e.endTime || (start != null && len ? hhmm(start + len) : ''), room: e.room, guests: names(episodeGuestIds(e)).filter((n) => n !== e.guest), href: `#/episodes/${e.id}`, action: 'Questions' });
  }
  for (const a of (c.activities || []).filter((x) => matchesDay(x.day, date))) {
    items.push({ key: 'a' + a.id, kind: 'Activity', title: a.title, time: a.time, endTime: a.endTime, room: a.room, detail: a.notes, activityId: a.id, guests: [] });
  }
  return items.sort((a, b) => (timeToMinutes(a.time) ?? 9999) - (timeToMinutes(b.time) ?? 9999) || a.title.localeCompare(b.title));
}

/** Which item is happening now, and which is next. Pure, for the banner and for tests. */
export function nowAndNext(items, minutes) {
  const timed = items.filter((i) => timeToMinutes(i.time) != null);
  const end = (i) => timeToMinutes(i.endTime) ?? timeToMinutes(i.time) + 30;
  const current = timed.find((i) => timeToMinutes(i.time) <= minutes && minutes < end(i)) || null;
  const next = timed.find((i) => timeToMinutes(i.time) > minutes) || null;
  return { current, next };
}

function pickConvention(db) {
  const t = todayIso();
  const list = db.conventions.slice();
  return list.find((c) => c.startDate && c.startDate <= t && (c.endDate || c.startDate) >= t)
    || list.filter((c) => (c.startDate || '') >= t).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    || list.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))[0];
}

export default function day({ root }) {
  const db = s.get();
  root.append(pageHeader({ title: 'Convention day', subtitle: 'Everything for the day in one timeline' }));
  if (!db.conventions.length) {
    root.append(empty({ title: 'No conventions yet', text: 'Create a convention to plan its days.', action: h('a', { class: 'btn primary', href: '#/conventions' }, 'Go to conventions') }));
    return;
  }
  if (!db.conventions.some((c) => c.id === convId)) convId = pickConvention(db).id;
  const c = db.conventions.find((x) => x.id === convId);
  const dates = datesBetween(c.startDate, c.endDate || c.startDate);

  root.append(h('div', { class: 'toolbar' }, h('div', { class: 'field' }, h('label', { for: 'dsel' }, 'Convention'),
    h('select', { id: 'dsel', value: convId, onchange: (e) => { convId = e.target.value; dayIso = ''; render({ keepScroll: true, announce: false }); } },
      db.conventions.map((x) => h('option', { value: x.id }, x.name))))));

  if (!dates.length) {
    root.append(empty({ title: 'This convention has no dates yet', text: 'Add its first and last day to see a timeline.', action: h('a', { class: 'btn primary', href: '#/conventions/' + c.id }, 'Edit convention') }));
    return;
  }
  if (!dates.includes(dayIso)) dayIso = dates.includes(todayIso()) ? todayIso() : dates[0];

  root.append(h('div', { class: 'chips', role: 'group', 'aria-label': 'Convention day', style: { marginBottom: '16px' } }, dates.map((d) => h('button', {
    type: 'button', class: 'chip' + (d === dayIso ? ' on' : ''), 'aria-pressed': String(d === dayIso),
    onclick: () => { dayIso = d; render({ keepScroll: true, announce: false }); },
  }, `${weekdayName(d)} ${fmtDate(d, { day: 'numeric', month: 'short' })}`))));

  const items = scheduleFor(db, c, dayIso);
  const clock = new Date();
  const isToday = dayIso === todayIso();
  const { current, next } = isToday ? nowAndNext(items, clock.getHours() * 60 + clock.getMinutes()) : {};
  if (isToday && (current || next)) {
    const it = current || next;
    root.append(h('section', { class: 'now', 'aria-label': current ? 'Happening now' : 'Up next' },
      h('span', {}, current ? 'Happening now' : 'Up next'), h('strong', {}, `${it.time}${it.endTime ? ' to ' + it.endTime : ''}  ${it.title}`),
      h('span', {}, [it.kind, it.room].filter(Boolean).join(', ') + (current && next ? `. Then ${next.time}: ${next.title}` : ''))));
  }

  // Schedule
  const addActivity = async () => {
    const rooms = (db.venues.find((v) => v.id === c.venueId)?.rooms || []).map((r) => r.name);
    const v = await askForm({ title: 'Add activity', submitLabel: 'Add to schedule', fields: [
      { name: 'title', label: 'What', required: true, placeholder: 'Lunch, load-in, meet the organizer' },
      { name: 'day', label: 'Day', type: 'select', value: dayIso, options: dates.map((d) => ({ value: d, label: `${weekdayName(d)} ${fmtDate(d)}` })) },
      { name: 'time', label: 'Start', type: 'time' }, { name: 'endTime', label: 'End (optional)', type: 'time' },
      { name: 'room', label: 'Room (optional)', list: rooms }, { name: 'notes', label: 'Notes (optional)' }] });
    if (!v) return;
    s.update('conventions', c.id, (cur) => ({ activities: [...(cur.activities || []), { id: uid(), title: v.title.trim(), day: v.day, time: v.time, endTime: v.endTime, room: v.room.trim(), notes: v.notes.trim() }] }));
  };
  root.append(h('section', { class: 'block' },
    h('div', { class: 'page-title' }, h('h2', {}, `${weekdayName(dayIso)} schedule`),
      h('div', { class: 'page-actions' }, button('Add activity', { iconName: 'plus', onclick: addActivity }), button('Focus mode', { iconName: 'focus', onclick: () => navigate(`/focus/${c.id}/${dayIso}`) }), button('Print', { variant: 'ghost', iconName: 'print', onclick: () => window.print() }))),
    items.length ? h('ol', { class: 'timeline', style: { marginTop: '12px' } }, items.map((i) => h('li', { class: 'tl' + (i === current ? ' now-item' : '') },
      h('div', { class: 'time' }, i.time || 'Any time', i.endTime ? h('div', { class: 'sub' }, 'to ' + i.endTime) : null),
      h('div', {}, h('div', {}, h('span', { class: 'kind' }, i.kind), h('strong', {}, i.title)),
        h('div', { class: 'sub' }, [i.room && 'Room: ' + i.room, i.guests.length && 'With ' + i.guests.join(', '), i.detail].filter(Boolean).join('. ') || ' ')),
      h('div', { class: 'acts' }, i.href ? h('a', { class: 'btn secondary small', href: i.href }, i.action) : null,
        i.activityId ? iconButton('trash', 'Delete activity', () => { const before = s.byId('conventions', c.id).activities; s.update('conventions', c.id, { activities: before.filter((a) => a.id !== i.activityId) }); toast('Activity deleted', { label: 'Undo', onAction: () => s.update('conventions', c.id, { activities: before }) }); }) : null))))
      : h('p', { class: 'muted pad' }, 'Nothing planned for this day. Add panels in the convention, set a day and time on an interview, or add an activity.')));

  // Checklists
  const field = listTab === 'before' ? 'preConTasks' : 'setupTasks';
  const defaults = (listTab === 'before' ? db.taskTemplates?.preCon || DEFAULT_PRECON_TASKS : db.taskTemplates?.setup || DEFAULT_SETUP_TASKS).map((text) => ({ text, done: false }));
  const tasks = Array.isArray(c[field]) ? c[field] : defaults;
  const setTasks = (next) => s.update('conventions', c.id, { [field]: next });
  const done = tasks.filter((t) => t.done).length;
  const addInput = h('input', { type: 'text', class: 'qadd-input', placeholder: 'Add a task', 'aria-label': 'New task' });
  const addTask = () => { const text = addInput.value.trim(); if (text) setTasks([...tasks, { text, done: false }]); };
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } });
  root.append(h('section', { class: 'block' }, h('h2', {}, 'Checklists'),
    segmented([{ value: 'before', label: 'Before you go' }, { value: 'setup', label: 'Set-up' }], listTab, (v) => { listTab = v; render({ keepScroll: true, announce: false }); }, 'Checklist'),
    progress(done, tasks.length, 'Tasks done'), h('p', { class: 'muted', style: { margin: '6px 0 12px' } }, `${done} of ${tasks.length} done`),
    h('ul', { class: 'rows' }, tasks.map((t, i) => h('li', { class: 'task' + (t.done ? ' done' : '') },
      h('label', {}, h('input', { type: 'checkbox', checked: !!t.done, onchange: (e) => setTasks(tasks.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x))) }), h('span', {}, t.text)),
      iconButton('trash', 'Remove task', () => setTasks(tasks.filter((_, k) => k !== i)))))),
    h('div', { class: 'qadd', style: { marginTop: '12px' } }, addInput, button('Add task', { iconName: 'plus', onclick: addTask }), button('Uncheck all', { variant: 'ghost', disabled: !done, onclick: () => setTasks(tasks.map((t) => ({ ...t, done: false }))) }))));

  // Rooms for the day
  const byRoom = new Map();
  for (const i of items) if (i.room) byRoom.set(i.room, [...(byRoom.get(i.room) || []), i]);
  if (byRoom.size) root.append(h('section', { class: 'block' }, h('h2', {}, 'Rooms today'),
    [...byRoom].map(([room, list]) => h('div', { class: 'room-group' }, h('b', {}, room), h('ul', { class: 'rows' }, list.map((i) => h('li', { class: 'muted' }, `${i.time || 'Any time'}  ${i.title} (${i.kind.toLowerCase()})`)))))));

  // Venue and hotel
  const venue = db.venues.find((v) => v.id === c.venueId);
  const hotel = [c.hotelName, c.hotelAddress, c.hotelRoom].some((x) => String(x || '').trim());
  const org = db.organizers.find((o) => o.id === c.organizerId);
  const contacts = contactsList(org);
  if (contacts) root.append(h('section', { class: 'panel block' }, h('h2', {}, `${org.name} contacts`), contacts));
  if (venue || hotel) root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Where'),
    venue && h('div', { style: { marginTop: '10px' } }, h('strong', {}, venue.name), h('p', { class: 'muted' }, venue.address || ''),
      h('div', { class: 'panel-actions', style: { marginTop: '8px' } }, venue.address ? h('a', { class: 'btn secondary small', href: mapsUrl(venue.address), target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), 'Directions') : null,
        h('a', { class: 'btn ghost small', href: '#/venues/' + venue.id }, 'Floor plans and rooms'))),
    hotel && h('div', { style: { marginTop: '14px' } }, h('strong', {}, c.hotelName || 'Hotel'), c.hotelRoom && h('span', { class: 'badge' }, 'Room ' + c.hotelRoom), h('p', { class: 'muted' }, c.hotelAddress || ''),
      c.hotelAddress ? h('a', { class: 'btn secondary small', href: mapsUrl(c.hotelAddress), target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), 'Directions') : null)));
}
