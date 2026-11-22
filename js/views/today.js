import { h, daysUntil, fmtDate, relDays, todayIso } from '../util.js';
import { store } from '../app-store.js';
import { STATUSES, GROUPS, groupOf, isActive } from '../model.js';
import { pageHeader, empty, button, progress, avatar } from '../ui.js';
import { newEpisode } from './episodes.js';
import { newGuest } from './guests.js';
import { newConvention } from './conventions.js';
import { notesCard } from './notes.js';
import { interviewDate } from '../model.js';


export default function today({ root }) {
  const db = store.get();
  const t = todayIso();
  const guestOf = (e) => db.guests.find((g) => g.id === e.guestId);
  // The day of the interview at the convention when known, otherwise the episode date.
  const when = (e) => interviewDate(e, db.conventions.find((c) => c.id === e.conventionId)) || e.date || '';
  const byDate = (a, b) => (when(a) || '9999').localeCompare(when(b) || '9999');
  const active = db.episodes.filter(isActive);
  const upcoming = active.filter((e) => when(e) && when(e) >= t).sort(byDate);
  const next = upcoming[0];
  const attention = active.filter((e) => {
    const n = (e.questions || []).length;
    const d = daysUntil(when(e));
    return n === 0 || (d != null && d >= 0 && d <= 14 && n < 10);
  }).sort(byDate).slice(0, 4);
  const conventions = db.conventions.filter((c) => c.startDate && c.endDate >= t || c.startDate >= t)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))).slice(0, 3);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  root.append(pageHeader({
    title: greeting,
    subtitle: new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
  }));

  if (!db.episodes.length && !db.guests.length && !db.conventions.length) {
    root.append(empty({
      title: 'Your vault is empty',
      text: 'Start with an episode, a guest or a convention. Everything is saved on this device and works offline.',
      action: h('div', { class: 'row-actions' },
        button('New episode', { variant: 'primary', iconName: 'plus', onclick: () => newEpisode() }),
        button('New guest', { onclick: () => newGuest() }),
        button('New convention', { onclick: () => newConvention() })),
    }));
    return;
  }

  // Next shoot
  if (next) {
    const g = guestOf(next);
    const qs = next.questions || [];
    const asked = qs.filter((q) => q.asked).length;
    const conv = db.conventions.find((c) => c.id === next.conventionId);
    root.append(h('section', { class: 'next', 'aria-labelledby': 'next-h' },
      h('div', { class: 'next-main' },
        avatar(g || { name: next.guest }, 56),
        h('div', {},
          h('h2', { id: 'next-h' }, 'Next up: ', next.guest || 'Unnamed guest'),
          h('p', { class: 'meta' },
            h('span', {}, relDays(daysUntil(when(next)))),
            h('span', {}, fmtDate(when(next))),
            next.time && h('span', {}, next.time),
            conv && h('span', {}, conv.name)))),
      h('div', { class: 'next-progress' },
        progress(asked, qs.length, 'Questions asked'),
        h('p', { class: 'muted' }, qs.length ? `${asked} of ${qs.length} questions asked` : 'No questions yet')),
      h('div', { class: 'row-actions' },
        h('a', { class: 'btn primary', href: `#/live/episode/${next.id}` }, 'Go live'),
        h('a', { class: 'btn secondary', href: `#/episodes/${next.id}` }, 'Open episode'))));
  }

  // Pipeline
  const counts = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  db.episodes.forEach((e) => { counts[groupOf(e.status)]++; });
  if (db.episodes.length) {
    root.append(h('section', { class: 'block', 'aria-labelledby': 'pipe-h' },
      h('h2', { id: 'pipe-h' }, 'Pipeline'),
      h('div', { class: 'pipeline' }, GROUPS.map((g) =>
        h('a', { class: 'stage', href: `#/episodes?stage=${encodeURIComponent(g)}` },
          h('strong', {}, counts[g]), h('span', {}, g))))));
  }

  // Needs attention
  if (attention.length) {
    root.append(h('section', { class: 'block', 'aria-labelledby': 'att-h' },
      h('h2', { id: 'att-h' }, 'Needs your attention'),
      h('ul', { class: 'rows' }, attention.map((e) => {
        const n = (e.questions || []).length;
        return h('li', {}, h('a', { class: 'row', href: `#/episodes/${e.id}` },
          h('div', { class: 'row-main' },
            h('strong', {}, e.guest || 'Unnamed guest'),
            h('span', { class: 'muted' }, n === 0 ? 'No questions yet' : `Only ${n} questions, with the shoot ${relDays(daysUntil(when(e))).toLowerCase()}`)),
          h('span', { class: 'pill' }, STATUSES[e.status]?.[1] || 'Unknown')));
      }))));
  }

  // Conventions
  if (conventions.length) {
    root.append(h('section', { class: 'block', 'aria-labelledby': 'con-h' },
      h('h2', { id: 'con-h' }, 'Coming up'),
      h('ul', { class: 'rows' }, conventions.map((c) => h('li', {},
        h('a', { class: 'row', href: `#/conventions/${c.id}` },
          h('div', { class: 'row-main' }, h('strong', {}, c.name), h('span', { class: 'muted' }, fmtDate(c.startDate))),
          h('span', { class: 'pill' }, relDays(daysUntil(c.startDate)))))))));
  }

  root.append(h('div', { class: 'row-actions block' },
    button('New episode', { iconName: 'plus', onclick: () => newEpisode() }),
    button('New guest', { iconName: 'plus', onclick: () => newGuest() }),
    button('New convention', { iconName: 'plus', onclick: () => newConvention() })));
  root.append(notesCard());
}
