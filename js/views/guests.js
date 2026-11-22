import { h, icon } from '../util.js';
import { store } from '../app-store.js';
import { navigate } from '../router.js';
import { norm, similarGuests } from '../text.js';
import { pageHeader, empty, button, avatar, toast, dialog } from '../ui.js';
import { guestDialog } from './guestdialog.js';
import { duplicatesTool } from './duplicates.js';

/** Warn about look-alike names. Resolves to true (carry on), false (cancel) or the existing guest to open instead. */
export async function checkDuplicate(name, excludeId = '') {
  const near = similarGuests(store.get().guests, name, { excludeId });
  if (!near.length) return true;
  const top = near[0].guest;
  return dialog((finish) => h('div', { class: 'form' },
    h('h2', {}, 'Possible duplicate'),
    h('p', {}, `“${name}” looks a lot like ${near.slice(0, 3).map((x) => x.guest.name).join(', ')}. Is it the same person?`),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(false) }, 'Cancel'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => finish(true) }, 'Different person, continue'),
      h('button', { type: 'button', class: 'btn primary', 'data-autofocus': '', onclick: () => finish(top) }, `Open ${top.name}`)))).then((v) => v ?? false);
}

export async function newGuest() {
  const v = await guestDialog({}, { title: 'New guest', submitLabel: 'Add guest' });
  if (!v) return null;
  const hit = await checkDuplicate(v.name);
  if (hit && hit !== true) { navigate('/guests/' + hit.id); return null; }
  if (!hit) return null;
  const g = store.add('guests', { ...v, bio: '', notes: '', projects: [], journal: [], pronunciation: '' });
  navigate('/guests/' + g.id);
  return g;
}

export default function guests({ root }) {
  const db = store.get();
  root.append(pageHeader({
    title: 'Guests', subtitle: db.guests.length ? `${db.guests.length} people` : '',
    actions: [db.guests.length > 1 ? button('Find duplicates', { iconName: 'search', onclick: () => duplicatesTool() }) : null, button('New guest', { variant: 'primary', iconName: 'plus', onclick: () => newGuest() })].filter(Boolean),
  }));
  if (!db.guests.length) {
    root.append(empty({ title: 'No guests yet', text: 'Add a guest to keep their bio, credits, pronunciation and history in one place.', action: button('New guest', { variant: 'primary', iconName: 'plus', onclick: () => newGuest() }) }));
    return;
  }
  const count = (g) => db.episodes.filter((e) => e.guestId === g.id).length;
  const list = h('ul', { class: 'cards' });
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search guests', 'aria-label': 'Search guests' });
  const draw = () => {
    const rows = db.guests.filter((g) => !search.value || norm(g.name).includes(norm(search.value))).sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...(rows.length ? rows.map((g) => h('li', {}, h('a', { class: 'card-link', href: '#/guests/' + g.id },
      avatar(g, 52), h('strong', {}, g.name),
      h('span', { class: 'muted' }, `${count(g)} episode${count(g) === 1 ? '' : 's'}${(g.projects || []).length ? ` · ${g.projects.length} credits` : ''}`))))
      : [h('li', { class: 'muted pad' }, 'No guests match that search.')]));
  };
  search.addEventListener('input', draw);
  root.append(h('div', { class: 'toolbar' }, h('div', { class: 'search-wrap' }, icon('search', 18), search)), list);
  draw();
}
