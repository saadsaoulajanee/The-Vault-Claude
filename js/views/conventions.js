import { h, fmtDate, daysUntil, relDays, todayIso } from '../util.js';
import { store } from '../app-store.js';
import { navigate } from '../router.js';
import { pageHeader, empty, button, askForm } from '../ui.js';

export async function newConvention() {
  const db = store.get();
  const v = await askForm({
    title: 'New convention', submitLabel: 'Create convention',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'organizer', label: 'Organizer', list: db.organizers.map((o) => o.name), placeholder: 'Pick one or type a new name' },
      { name: 'startDate', label: 'First day', type: 'date' },
      { name: 'endDate', label: 'Last day', type: 'date' },
    ],
  });
  if (!v) return null;
  let org = db.organizers.find((o) => o.name.toLowerCase() === v.organizer.trim().toLowerCase());
  if (!org && v.organizer.trim()) org = store.add('organizers', { name: v.organizer.trim() });
  const c = store.add('conventions', {
    name: v.name.trim(), organizerId: org?.id || '', startDate: v.startDate, endDate: v.endDate || v.startDate,
    hotelName: '', hotelAddress: '', notes: '', panels: [], packed: {},
  });
  navigate('/conventions/' + c.id);
  return c;
}

export default function conventions({ root }) {
  const db = store.get();
  const t = todayIso();
  root.append(pageHeader({
    title: 'Conventions', subtitle: db.conventions.length ? `${db.conventions.length} in the vault` : '',
    actions: button('New convention', { variant: 'primary', iconName: 'plus', onclick: () => newConvention() }),
  }));
  if (!db.conventions.length) {
    root.append(empty({ title: 'No conventions yet', text: 'Add one to plan panels, interviews, travel and packing in one place.', action: button('New convention', { variant: 'primary', iconName: 'plus', onclick: () => newConvention() }) }));
    return;
  }
  const upcoming = db.conventions.filter((c) => (c.endDate || c.startDate || '9999') >= t).sort((a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999')));
  const past = db.conventions.filter((c) => !upcoming.includes(c)).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const group = (title, items) => items.length ? h('section', { class: 'block' }, h('h2', {}, title),
    h('ul', { class: 'rows' }, items.map((c) => {
      const org = db.organizers.find((o) => o.id === c.organizerId);
      const n = db.episodes.filter((e) => e.conventionId === c.id).length;
      return h('li', {}, h('a', { class: 'row', href: '#/conventions/' + c.id },
        h('div', { class: 'row-main' }, h('strong', {}, c.name),
          h('span', { class: 'meta' }, org && h('span', {}, org.name), c.startDate && h('span', {}, fmtDate(c.startDate)), n ? h('span', {}, `${n} interview${n === 1 ? '' : 's'}`) : null)),
        c.startDate && h('span', { class: 'pill' }, relDays(daysUntil(c.startDate)))));
    }))) : null;
  root.append(...[group('Upcoming', upcoming), group('Past', past)].filter(Boolean));
}
