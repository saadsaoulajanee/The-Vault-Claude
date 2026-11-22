// "Find duplicates": look-alike guest profiles, with a safe merge.
import { h } from '../util.js';
import { store as s } from '../app-store.js';
import { dialog, avatar, toast, confirmDialog } from '../ui.js';
import { duplicatePairs } from '../text.js';
import { planMerge } from '../guestmerge.js';
import { render } from '../router.js';

const pairKey = (a, b) => [a.id, b.id].sort().join('|');

export function mergeGuests(keepId, dropId) {
  const db = s.get();
  const keep = db.guests.find((g) => g.id === keepId), drop = db.guests.find((g) => g.id === dropId);
  if (!keep || !drop) return false;
  const plan = planMerge(db, keep, drop);
  s.update('guests', keep.id, plan.patch);
  plan.episodes.forEach(({ id, ...p }) => s.update('episodes', id, p));
  plan.conventions.forEach(({ id, ...p }) => s.update('conventions', id, p));
  plan.panelFix.forEach(({ id, ...p }) => s.update('conventions', id, p));
  s.remove('guests', drop.id);
  return true;
}

function count(db, g) { return db.episodes.filter((e) => e.guestId === g.id).length; }

export function duplicatesTool() {
  return dialog((finish) => {
    const body = h('div', {});
    const draw = () => {
      const db = s.get();
      const ignored = new Set(db.settings.dupIgnore || []);
      const pairs = duplicatePairs(db.guests).filter((p) => !ignored.has(pairKey(p.a, p.b)));
      body.replaceChildren(...(pairs.length ? pairs.map(({ a, b }) => h('div', { class: 'dup' },
        h('div', { class: 'dup-people' }, [a, b].map((g) => h('div', { class: 'dup-person' }, avatar(g, 40), h('div', {}, h('strong', {}, g.name),
          h('span', { class: 'muted' }, `${count(db, g)} episode${count(db, g) === 1 ? '' : 's'}, ${(g.projects || []).length} credits`))))),
        h('div', { class: 'dup-actions' },
          [[a, b], [b, a]].map(([keep, drop]) => h('button', { type: 'button', class: 'btn secondary small', onclick: async () => {
            if (!(await confirmDialog(`Everything on “${drop.name}” moves to “${keep.name}” (episodes, credits, journal, notes). “${drop.name}” is then removed. A backup is saved first.`, { confirmLabel: 'Merge', title: `Keep “${keep.name}”?` }))) return;
            await s.backup('Before merging guests');
            mergeGuests(keep.id, drop.id);
            toast(`Merged into ${keep.name}`);
            draw();
          } }, `Keep ${keep.name}`)),
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => { s.setSettings({ dupIgnore: [...(s.get().settings.dupIgnore || []), pairKey(a, b)] }); draw(); } }, 'Not the same'))))
        : [h('p', { class: 'muted' }, 'No look-alike guests found. Names are compared ignoring case, accents and word order.')]));
    };
    draw();
    return h('div', { class: 'form wide' }, h('h2', {}, 'Find duplicates'), body,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn primary', 'data-autofocus': '', onclick: () => { finish(true); render({ keepScroll: true, announce: false }); } }, 'Done')));
  });
}
