// One venue: details, room directory, and floor plans you can annotate by dragging markers.
import { h, icon, debounce } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { navigate, render } from '../router.js';
import { ROOM_KINDS } from '../model.js';
import { compressImage, pdfToImages, isPdf } from '../plans.js';
import { pageHeader, empty, button, iconButton, askForm, confirmDialog, toast } from '../ui.js';
import { mapsUrl } from './venues.js';

let planIndex = {};

export default function venue({ root, params }) {
  const v = s.byId('venues', params.id);
  if (!v) {
    root.append(pageHeader({ title: 'Venue not found', back: { href: '/venues', label: 'Venues' } }), empty({ title: 'This venue was deleted or never existed', action: h('a', { class: 'btn primary', href: '#/venues' }, 'Back to venues') }));
    return;
  }
  const save = debounce((patch) => s.update('venues', v.id, patch, { silent: true }), 400);
  const rooms = v.rooms || [];
  const plans = v.floorPlans || [];
  const idx = Math.min(planIndex[v.id] ?? 0, Math.max(0, plans.length - 1));

  root.append(pageHeader({ title: v.name, back: { href: '/venues', label: 'Venues' }, subtitle: v.address || 'No address yet',
    actions: [v.address ? h('a', { class: 'btn secondary', href: mapsUrl(v.address), target: '_blank', rel: 'noopener noreferrer' }, icon('link', 18), 'Directions') : null,
      button('Rename', { iconName: 'edit', onclick: async () => {
        const r = await askForm({ title: 'Venue details', fields: [{ name: 'name', label: 'Venue name', required: true, value: v.name }, { name: 'address', label: 'Address', value: v.address || '' }] });
        if (r) s.update('venues', v.id, { name: r.name.trim(), address: r.address.trim() });
      } })] }));

  // Rooms
  const setRooms = (next) => s.update('venues', v.id, { rooms: next });
  const roomRows = rooms.map((r, i) => {
    const id = r.id || 'room' + i;
    return h('div', { class: 'room-row' },
      h('input', { type: 'text', value: r.name, 'aria-label': 'Room name', onchange: (e) => { const next = rooms.map((x, k) => (k === i ? { ...x, id, name: e.target.value.trim() || x.name } : x)); s.update('venues', v.id, { rooms: next }, { silent: true }); } }),
      h('input', { type: 'text', value: r.notes || '', placeholder: 'Where is it?', 'aria-label': 'Room notes', onchange: (e) => s.update('venues', v.id, { rooms: rooms.map((x, k) => (k === i ? { ...x, id, notes: e.target.value.trim() } : x)) }, { silent: true }) }),
      iconButton('trash', 'Remove room', () => setRooms(rooms.filter((_, k) => k !== i))));
  });
  const newName = h('input', { type: 'text', class: 'qadd-input', placeholder: 'Add a room, for example Panel Room', 'aria-label': 'New room name' });
  const newNote = h('input', { type: 'text', class: 'qadd-input', placeholder: 'Where is it? (optional)', 'aria-label': 'New room notes' });
  const addRoom = () => { const name = newName.value.trim(); if (!name) { newName.focus(); return; } setRooms([...rooms, { id: uid(), name, notes: newNote.value.trim() }]); };
  newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addRoom(); } });
  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Rooms'), h('div', { style: { marginTop: '12px' } }, roomRows,
    !rooms.length && h('p', { class: 'muted pad' }, 'No rooms yet. Rooms you add here can be picked for panels and interviews.')),
    h('div', { class: 'qadd' }, newName, newNote, button('Add room', { iconName: 'plus', onclick: addRoom }))));

  // Floor plans
  const file = h('input', { type: 'file', class: 'sr', id: 'plan-file', accept: 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf', multiple: true });
  file.addEventListener('change', async () => {
    const files = [...file.files]; file.value = '';
    if (!files.length) return;
    toast('Importing…', { timeout: 2500 });
    const added = [];
    for (const f of files) {
      try {
        if (isPdf(f)) {
          const { pages, truncated } = await pdfToImages(f);
          for (let i = 0; i < pages.length; i++) { const id = uid(); await s.putImage(id, pages[i]); added.push({ id: uid(), name: pages.length > 1 ? `${f.name}, page ${i + 1}` : f.name, imageId: id, markers: [] }); }
          if (truncated) toast('Only the first 12 pages were imported');
        } else { const id = uid(); await s.putImage(id, await compressImage(f)); added.push({ id: uid(), name: f.name, imageId: id, markers: [] }); }
      } catch (e) { toast(`${f.name}: ${e.message}`, { timeout: 9000 }); }
    }
    if (added.length) { planIndex[v.id] = (s.byId('venues', v.id).floorPlans || []).length; s.update('venues', v.id, (cur) => ({ floorPlans: [...(cur.floorPlans || []), ...added] })); }
  });

  const plansBox = h('section', { class: 'panel block' }, h('h2', {}, 'Floor plans'),
    h('p', { class: 'muted' }, 'Upload JPG, PNG or PDF files, then drag markers onto the rooms. Plan images are kept on this device only, because they are too large to sync.'),
    h('div', { class: 'panel-actions', style: { marginTop: '12px' } }, h('label', { class: 'btn primary', for: 'plan-file' }, icon('upload', 18), 'Upload plans'), file));
  root.append(plansBox);
  if (plans.length) plansBox.append(planEditor(v, plans, idx));

  root.append(h('div', { class: 'danger-zone' }, button('Delete venue', { variant: 'danger', iconName: 'trash', onclick: async () => {
    const used = s.get().conventions.filter((c) => c.venueId === v.id).length;
    if (!(await confirmDialog(used ? `${used} convention(s) use this venue. They keep working, but lose the link.` : `Delete ${v.name} and its floor plans?`, { confirmLabel: 'Delete venue', danger: true, title: 'Delete venue' }))) return;
    const removed = s.remove('venues', v.id);
    navigate('/venues');
    toast('Venue deleted', { label: 'Undo', onAction: () => s.restore('venues', removed) });
  } })));
}

function planEditor(v, plans, idx) {
  const plan = plans[idx];
  const wrap = h('div', {});
  const setPlans = (next, opts) => s.update('venues', v.id, { floorPlans: next }, opts);
  const patchPlan = (patch, opts) => setPlans(s.byId('venues', v.id).floorPlans.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)), opts);

  wrap.append(h('div', { class: 'tabs-row', role: 'tablist', 'aria-label': 'Floor plans' }, plans.map((p, i) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(i === idx), class: 'chip' + (i === idx ? ' on' : ''),
    onclick: () => { planIndex[v.id] = i; render({ keepScroll: true, announce: false }); },
  }, p.name || 'Plan ' + (i + 1)))));

  const stage = h('div', { class: 'plan-stage' });
  const img = h('img', { alt: `Floor plan: ${plan.name}` });
  stage.append(img);
  const missing = () => { stage.replaceWith(h('div', { class: 'plan-missing panel' }, h('p', {}, 'This plan’s image is not on this device.'), h('p', { class: 'muted' }, 'Plan images are not synced. Upload it again here, or import a full backup from the device that has it.'))); };
  (plan.imageId ? s.getImage(plan.imageId) : Promise.resolve(null)).then((data) => { if (data) img.src = data; else if (stage.isConnected) missing(); });

  const markers = plan.markers || [];
  const drawMarkers = () => {
    stage.querySelectorAll('.marker').forEach((m) => m.remove());
    for (const m of markers) stage.append(markerEl(m));
  };
  function markerEl(m) {
    const el = h('div', { class: 'marker', tabindex: '0', role: 'button', 'data-kind': m.kind, style: { left: m.x + '%', top: m.y + '%' }, 'aria-label': `${m.label}. Drag, or use arrow keys to move.` }, m.label);
    let start = null;
    const commit = () => patchPlan({ markers: s.byId('venues', v.id).floorPlans.find((p) => p.id === plan.id).markers.map((x) => (x.id === m.id ? { ...x, x: m.x, y: m.y } : x)) }, { silent: true });
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); start = true; });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const r = stage.getBoundingClientRect();
      m.x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)) * 10) / 10;
      m.y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) * 10) / 10;
      el.style.left = m.x + '%'; el.style.top = m.y + '%';
    });
    const end = () => { if (!start) return; start = null; el.classList.remove('drag'); commit(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      m.x = Math.min(100, Math.max(0, m.x + d[0])); m.y = Math.min(100, Math.max(0, m.y + d[1]));
      el.style.left = m.x + '%'; el.style.top = m.y + '%';
      clearTimeout(el._t); el._t = setTimeout(commit, 400);
    });
    return el;
  }
  img.addEventListener('load', drawMarkers);
  wrap.append(stage);

  const addMarker = async () => {
    const rooms = s.byId('venues', v.id).rooms || [];
    const r = await askForm({ title: 'Add marker', submitLabel: 'Add to plan', fields: [
      { name: 'label', label: 'Label', required: true, list: rooms.map((x) => x.name), placeholder: 'Pick a room or type a label' },
      { name: 'kind', label: 'Type', type: 'select', value: 'panel', options: ROOM_KINDS.map(([value, label]) => ({ value, label })) }] });
    if (!r) return;
    patchPlan({ markers: [...(s.byId('venues', v.id).floorPlans.find((p) => p.id === plan.id).markers || []), { id: uid(), kind: r.kind, label: r.label.trim(), x: 50, y: 50 }] });
    toast('Marker added in the middle. Drag it into place.');
  };

  wrap.append(h('div', { class: 'panel-actions', style: { marginTop: '14px' } },
    button('Add marker', { variant: 'primary', iconName: 'plus', onclick: addMarker }),
    button('Rename plan', { iconName: 'edit', onclick: async () => { const r = await askForm({ title: 'Rename plan', fields: [{ name: 'name', label: 'Plan name', required: true, value: plan.name }] }); if (r) patchPlan({ name: r.name.trim() }); } }),
    button('Delete plan', { variant: 'ghost', iconName: 'trash', onclick: async () => {
      if (!(await confirmDialog(`Delete “${plan.name}” and its markers? The image is removed from this device.`, { confirmLabel: 'Delete plan', danger: true, title: 'Delete floor plan' }))) return;
      if (plan.imageId) await s.deleteImage(plan.imageId);
      planIndex[v.id] = 0;
      setPlans(s.byId('venues', v.id).floorPlans.filter((p) => p.id !== plan.id));
    } })));

  if (markers.length) wrap.append(h('ul', { class: 'rows' }, markers.map((m) => h('li', { class: 'idea' },
    h('span', {}, h('strong', {}, m.label), h('span', { class: 'badge' }, ROOM_KINDS.find((k) => k[0] === m.kind)?.[1] || 'Other')),
    h('div', { class: 'qtools' },
      iconButton('edit', 'Rename marker', async () => { const r = await askForm({ title: 'Rename marker', fields: [{ name: 'label', label: 'Label', required: true, value: m.label }] }); if (r) patchPlan({ markers: s.byId('venues', v.id).floorPlans.find((p) => p.id === plan.id).markers.map((x) => (x.id === m.id ? { ...x, label: r.label.trim() } : x)) }); }),
      iconButton('trash', 'Delete marker', () => patchPlan({ markers: s.byId('venues', v.id).floorPlans.find((p) => p.id === plan.id).markers.filter((x) => x.id !== m.id) })))))));
  return wrap;
}
