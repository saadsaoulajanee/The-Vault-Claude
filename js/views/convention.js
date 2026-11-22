import { h, fmtDate, debounce } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { navigate, render } from '../router.js';
import { pageHeader, empty, button, iconButton, askForm, confirmDialog, toast, progress, segmented } from '../ui.js';
import { newEpisode } from './episodes.js';
import { flightsSection } from '../flights.js';
import { mapsUrl } from './venues.js';
import { posterPanel } from './poster.js';
import { contactsList, saveOrganizer } from './organizers.js';

const tabs = {};

export default function convention({ root, params }) {
  const c = s.byId('conventions', params.id);
  if (!c) {
    root.append(pageHeader({ title: 'Convention not found', back: { href: '/conventions', label: 'Conventions' } }),
      empty({ title: 'This convention was deleted or never existed', action: h('a', { class: 'btn primary', href: '#/conventions' }, 'Back to conventions') }));
    return;
  }
  const db = s.get();
  const tab = tabs[c.id] || 'interviews';
  const episodes = db.episodes.filter((e) => e.conventionId === c.id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const panels = c.panels || [];
  const packed = c.packed || {};
  const list = db.checklistTemplate;
  const done = list.filter((_, i) => packed[i]).length;
  const save = debounce((patch) => s.update('conventions', c.id, patch, { silent: true }), 400);
  const org = db.organizers.find((o) => o.id === c.organizerId);

  root.append(pageHeader({
    title: c.name, back: { href: '/conventions', label: 'Conventions' },
    subtitle: [org?.name, c.startDate && (c.endDate && c.endDate !== c.startDate ? `${fmtDate(c.startDate)} to ${fmtDate(c.endDate)}` : fmtDate(c.startDate))].filter(Boolean).join(', '),
    actions: button('Edit details', { iconName: 'edit', onclick: async () => {
      const v = await askForm({ title: 'Convention details', fields: [
        { name: 'name', label: 'Name', required: true, value: c.name },
        { name: 'startDate', label: 'First day', type: 'date', value: c.startDate || '' },
        { name: 'endDate', label: 'Last day', type: 'date', value: c.endDate || '' }] });
      if (v) s.update('conventions', c.id, { name: v.name.trim(), startDate: v.startDate, endDate: v.endDate || v.startDate });
    } }),
  }));

  root.append(segmented([
    { value: 'interviews', label: `Interviews (${episodes.length})` },
    { value: 'panels', label: `Panels (${panels.length})` },
    { value: 'packing', label: `Packing (${done}/${list.length})` },
    { value: 'trip', label: 'Trip' },
    { value: 'poster', label: 'Poster' },
  ], tab, (v) => { tabs[c.id] = v; render({ keepScroll: true, announce: false }); }, 'Convention sections'));

  const panel = h('section', { class: 'panel' });
  root.append(panel);

  if (tab === 'interviews') {
    panel.append(h('div', { class: 'panel-actions' }, button('New interview here', { variant: 'primary', iconName: 'plus', onclick: () => newEpisode({ conventionId: c.id, date: c.startDate }) })));
    panel.append(episodes.length ? h('ul', { class: 'rows' }, episodes.map((e) => h('li', {}, h('a', { class: 'row', href: '#/episodes/' + e.id },
      h('div', { class: 'row-main' }, h('strong', {}, e.guest), h('span', { class: 'muted' }, [fmtDate(e.date), e.time].filter(Boolean).join(' at ') || 'No date')),
      h('span', { class: 'pill' }, `${(e.questions || []).length} questions`)))))
      : h('p', { class: 'muted pad' }, 'No interviews are linked to this convention yet.'));
  }

  if (tab === 'panels') {
    panel.append(h('div', { class: 'panel-actions' }, button('Add panel', { variant: 'primary', iconName: 'plus', onclick: async () => {
      const rooms = (db.venues.find((x) => x.id === c.venueId)?.rooms || []).map((r) => r.name);
      const v = await askForm({ title: 'Add panel', fields: [{ name: 'title', label: 'Panel title', required: true }, { name: 'day', label: 'Day', type: 'date', value: c.startDate || '' }, { name: 'time', label: 'Start', type: 'time' }, { name: 'endTime', label: 'End (optional)', type: 'time' }, { name: 'room', label: 'Room', list: rooms }] });
      if (v) s.update('conventions', c.id, { panels: [...panels, { id: uid(), title: v.title.trim(), day: v.day, time: v.time, endTime: v.endTime, room: v.room.trim(), questions: [] }] });
    } })));
    panel.append(panels.length ? h('ul', { class: 'rows' }, panels.map((p) => h('li', {}, h('a', { class: 'row', href: `#/live/panel/${c.id}~${p.id}` },
      h('div', { class: 'row-main' }, h('strong', {}, p.title), h('span', { class: 'muted' }, [fmtDate(p.day), p.time, p.room].filter(Boolean).join(', '))),
      h('span', { class: 'pill' }, `${(p.questions || []).length} questions`)))))
      : h('p', { class: 'muted pad' }, 'Add the panels you are hosting. Each one gets its own question list and a Live mode.'));
    if (panels.length) panel.append(h('div', { class: 'panel-actions' }, panels.map((p) => button(`Delete “${p.title}”`, { variant: 'ghost', small: true, iconName: 'trash', onclick: async () => {
      if (!(await confirmDialog(`Delete the panel “${p.title}” and its questions?`, { confirmLabel: 'Delete panel', danger: true, title: 'Delete panel' }))) return;
      const before = s.byId('conventions', c.id).panels;
      s.update('conventions', c.id, { panels: before.filter((x) => x.id !== p.id) });
      toast('Panel deleted', { label: 'Undo', onAction: () => s.update('conventions', c.id, { panels: before }) });
    } }))));
  }

  if (tab === 'packing') {
    panel.append(progress(done, list.length, 'Packed'), h('p', { class: 'muted' }, `${done} of ${list.length} packed`));
    panel.append(h('ul', { class: 'checks' }, list.map((item, i) => h('li', {}, h('label', {},
      h('input', { type: 'checkbox', checked: !!packed[i], onchange: (e) => s.update('conventions', c.id, (cur) => ({ packed: { ...(cur.packed || {}), [i]: e.target.checked } })) }), h('span', {}, item))))));
    panel.append(h('p', { class: 'muted pad' }, 'Edit the master packing list in Settings.'));
  }

  if (tab === 'poster') panel.append(posterPanel(c));

  if (tab === 'trip') {
    const venue = db.venues.find((x) => x.id === c.venueId);
    panel.append(
      h('h2', {}, 'Organizer'),
      h('div', { class: 'field', style: { margin: '10px 0 6px' } }, h('label', { for: 'org' }, 'Who runs it'),
        h('select', { id: 'org', value: c.organizerId || '', onchange: (e) => s.update('conventions', c.id, { organizerId: e.target.value }) },
          h('option', { value: '' }, 'None'), db.organizers.map((o) => h('option', { value: o.id }, o.name)))),
      h('div', { class: 'panel-actions' }, button(org ? 'Edit organizer and contacts' : 'New organizer', { small: true, iconName: org ? 'edit' : 'plus', onclick: async () => {
        const saved = await saveOrganizer(org || null);
        if (saved && !org) s.update('conventions', c.id, { organizerId: saved.id });
      } })),
      org ? (contactsList(org) || h('p', { class: 'muted' }, 'No contacts saved for this organizer yet.')) : null,
      h('div', { style: { height: '24px' } }),
      h('h2', {}, 'Flights'), h('div', { style: { margin: '10px 0 24px' } }, flightsSection(c)),
      h('h2', {}, 'Venue and hotel'),
      h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', { for: 'venue' }, 'Venue'),
        h('select', { id: 'venue', value: c.venueId || '', onchange: (e) => s.update('conventions', c.id, { venueId: e.target.value }) },
          h('option', { value: '' }, 'None'), db.venues.map((x) => h('option', { value: x.id }, x.name))),
        venue && h('span', { class: 'hint' }, venue.address || '', ' ', h('a', { href: '#/venues/' + venue.id }, 'Rooms and floor plans')),
        !db.venues.length && h('span', { class: 'hint' }, h('a', { href: '#/venues' }, 'Save a venue first'))),
      h('div', { class: 'field' }, h('label', { for: 'hotel' }, 'Hotel'), h('input', { id: 'hotel', value: c.hotelName || '', oninput: (e) => save({ hotelName: e.target.value }) })),
      h('div', { class: 'field' }, h('label', { for: 'addr' }, 'Hotel address'), h('input', { id: 'addr', value: c.hotelAddress || '', oninput: (e) => save({ hotelAddress: e.target.value }) }),
        c.hotelAddress && h('a', { class: 'hint', href: mapsUrl(c.hotelAddress), target: '_blank', rel: 'noopener noreferrer' }, 'Directions')),
      h('div', { class: 'field' }, h('label', { for: 'hroom' }, 'Hotel room'), h('input', { id: 'hroom', value: c.hotelRoom || '', oninput: (e) => save({ hotelRoom: e.target.value }) })),
      h('div', { class: 'field' }, h('label', { for: 'cn' }, 'Notes'), h('textarea', { id: 'cn', rows: 8, value: c.notes || '', placeholder: 'Flights, contacts, load-in times, anything you need on the day', oninput: (e) => save({ notes: e.target.value }) })));
  }

  root.append(h('div', { class: 'danger-zone' }, button('Delete convention', { variant: 'danger', iconName: 'trash', onclick: async () => {
    if (!(await confirmDialog(`Delete ${c.name}? Linked interviews stay in your episodes.`, { confirmLabel: 'Delete convention', danger: true, title: 'Delete convention' }))) return;
    const removed = s.remove('conventions', c.id);
    navigate('/conventions');
    toast('Convention deleted', { label: 'Undo', onAction: () => s.restore('conventions', removed) });
  } })));
}
