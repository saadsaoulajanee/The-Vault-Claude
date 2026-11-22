import { h, fmtDate, icon } from '../util.js';
import { store } from '../app-store.js';
import { navigate } from '../router.js';
import { STATUSES, GROUPS, groupOf } from '../model.js';
import { norm } from '../text.js';
import { pageHeader, empty, button, askForm, progress, toast, avatar } from '../ui.js';

const statusOptions = () => STATUSES.map(([e, label], i) => ({ value: String(i), label: `${e} ${label}` }));

export function findOrCreateGuest(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const db = store.get();
  return db.guests.find((g) => norm(g.name) === norm(clean))
    || store.add('guests', { name: clean, photo: '', bio: '', notes: '', projects: [], journal: [] });
}

export async function newEpisode(defaults = {}) {
  const db = store.get();
  const v = await askForm({
    title: 'New episode', submitLabel: 'Create episode',
    fields: [
      { name: 'guest', label: 'Guest', required: true, list: db.guests.map((g) => g.name), placeholder: 'Pick a guest or type a new name', value: defaults.guest || '' },
      { name: 'number', label: 'Episode number', type: 'number', value: store.nextEpisodeNumber() },
      { name: 'date', label: 'Interview date', type: 'date', value: defaults.date || '' },
      { name: 'conventionId', label: 'Convention', type: 'select', value: defaults.conventionId || '',
        options: [{ value: '', label: 'None' }, ...db.conventions.map((c) => ({ value: c.id, label: c.name }))] },
    ],
  });
  if (!v) return null;
  const guest = findOrCreateGuest(v.guest);
  const ep = store.add('episodes', {
    number: Number(v.number) || store.nextEpisodeNumber(), guest: guest.name, guestId: guest.id,
    date: v.date, conventionId: v.conventionId, status: 0, questions: [], ideas: [], notes: '', longLink: '', shorts: [], time: '', duration: '',
  });
  navigate('/episodes/' + ep.id);
  return ep;
}

export function editEpisodeDialog(ep) {
  const db = store.get();
  return askForm({
    title: 'Episode details',
    fields: [
      { name: 'guest', label: 'Guest', required: true, list: db.guests.map((g) => g.name), value: ep.guest },
      { name: 'number', label: 'Episode number', type: 'number', value: ep.number },
      { name: 'date', label: 'Date (publication or shoot)', type: 'date', value: ep.date || '' },
      { name: 'conventionId', label: 'Convention', type: 'select', value: ep.conventionId || '',
        options: [{ value: '', label: 'None' }, ...db.conventions.map((c) => ({ value: c.id, label: c.name }))] },
      { name: 'interviewDay', label: 'Interview day at the convention', type: 'date', value: /^\d{4}-/.test(ep.interviewDay || '') ? ep.interviewDay : '', hint: ep.interviewDay && !/^\d{4}-/.test(ep.interviewDay) ? `Currently “${ep.interviewDay}” from the previous version. Pick a date to replace it.` : 'Shows the interview on that day in Convention day.' },
      { name: 'time', label: 'Interview time', type: 'time', value: ep.time || '' },
      { name: 'duration', label: 'Length in minutes', type: 'number', min: '0', step: '5', value: /^\d+$/.test(String(ep.duration || '')) ? ep.duration : '' },
      { name: 'room', label: 'Room', value: ep.room || '', list: (db.venues.find((x) => x.id === db.conventions.find((c) => c.id === ep.conventionId)?.venueId)?.rooms || []).map((r) => r.name) },
      { name: 'status', label: 'Stage', type: 'select', value: String(ep.status ?? 0), options: statusOptions() },
    ],
  }).then((v) => {
    if (!v) return;
    const guest = findOrCreateGuest(v.guest);
    // Keep the old weekday name unless a real date was picked.
    const interviewDay = v.interviewDay || (/^\d{4}-/.test(ep.interviewDay || '') ? '' : ep.interviewDay || '');
    store.update('episodes', ep.id, { guest: guest.name, guestId: guest.id, number: Number(v.number) || ep.number, date: v.date, time: v.time, interviewDay, duration: v.duration, room: v.room.trim(), conventionId: v.conventionId, status: Number(v.status) });
  });
}

export default function episodes({ root }) {
  const db = store.get();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let stage = params.get('stage') || 'All';
  let query = '';

  root.append(pageHeader({
    title: 'Episodes',
    subtitle: db.episodes.length ? `${db.episodes.length} in the vault` : '',
    actions: button('New episode', { variant: 'primary', iconName: 'plus', onclick: () => newEpisode() }),
  }));

  if (!db.episodes.length) {
    root.append(empty({ title: 'No episodes yet', text: 'Create an episode to start preparing questions for a guest.', action: button('New episode', { variant: 'primary', iconName: 'plus', onclick: () => newEpisode() }) }));
    return;
  }

  const list = h('ul', { class: 'rows', 'aria-live': 'polite' });
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search guests', 'aria-label': 'Search episodes', 'data-search': '' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by stage' });

  function draw() {
    chips.replaceChildren(...['All', ...GROUPS].map((g) => h('button', {
      type: 'button', class: 'chip' + (g === stage ? ' on' : ''), 'aria-pressed': String(g === stage),
      onclick: () => { stage = g; draw(); },
    }, g)));
    const rows = db.episodes
      .filter((e) => (stage === 'All' || groupOf(e.status) === stage) && (!query || norm(e.guest).includes(norm(query))))
      .sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0));
    if (!rows.length) { list.replaceChildren(h('li', { class: 'muted pad' }, 'No episodes match. Try another stage or search.')); return; }
    list.replaceChildren(...rows.map((e) => {
      const qs = e.questions || [];
      const g = db.guests.find((x) => x.id === e.guestId);
      return h('li', {}, h('a', { class: 'row', href: '#/episodes/' + e.id },
        avatar(g || { name: e.guest }, 40),
        h('div', { class: 'row-main' },
          h('strong', {}, e.guest || 'Unnamed guest'),
          h('span', { class: 'meta' }, h('span', {}, 'Episode ' + e.number), e.date && h('span', {}, fmtDate(e.date)), qs.length && h('span', {}, `${qs.filter((q) => q.asked).length}/${qs.length} asked`))),
        h('span', { class: 'pill' }, `${STATUSES[e.status]?.[0] || ''} ${STATUSES[e.status]?.[1] || 'Unknown'}`)));
    }));
  }
  search.addEventListener('input', () => { query = search.value; draw(); });
  root.append(h('div', { class: 'toolbar' }, h('div', { class: 'search-wrap' }, icon('search', 18), search), chips), list);
  draw();
}
