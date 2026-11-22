// Name and photo dialog with a live round preview and framing controls (focus point and zoom).
import { h } from '../util.js';
import { dialog, avatar, cropOf } from '../ui.js';
import { safeUrl } from '../util.js';

/** Resolves to { name, photo, photoX, photoY, photoZoom } or null. */
export function guestDialog(g = {}, { title = 'Edit guest', submitLabel = 'Save' } = {}) {
  return dialog((finish) => {
    const c = cropOf(g);
    const name = h('input', { id: 'g-name', value: g.name || '', required: true, autocomplete: 'off' });
    const photo = h('input', { id: 'g-photo', type: 'url', value: g.photo || '', placeholder: 'https://', autocomplete: 'off' });
    const range = (id, min, max, step, value) => h('input', { id, type: 'range', min, max, step, value });
    const x = range('g-x', 0, 100, 1, c.x), y = range('g-y', 0, 100, 1, c.y), z = range('g-z', 1, 3, 0.05, c.zoom);
    const preview = h('div', { class: 'crop-preview' });
    const out = h('p', { class: 'hint', role: 'status' });
    const read = () => ({ photo: safeUrl(photo.value.trim()) ? photo.value.trim() : '', photoX: Number(x.value), photoY: Number(y.value), photoZoom: Number(z.value) });
    const draw = () => {
      const v = read();
      preview.replaceChildren(avatar({ name: name.value || '?', ...v }, 96));
      out.textContent = v.photo ? `Zoom ${v.photoZoom.toFixed(2)}x` : photo.value.trim() ? 'Only https links are used.' : 'Add a photo link to frame it.';
      [x, y, z].forEach((i) => { i.disabled = !v.photo; });
    };
    [name, photo, x, y, z].forEach((i) => i.addEventListener('input', draw));
    draw();
    const row = (label, id, input) => h('div', { class: 'field' }, h('label', { for: id }, label), input);
    const form = h('form', { class: 'form', novalidate: true },
      h('h2', {}, title),
      h('div', { class: 'crop-row' }, preview, h('div', { class: 'crop-fields' }, row('Name', 'g-name', name), row('Photo link', 'g-photo', photo))),
      h('fieldset', { class: 'crop-controls' }, h('legend', {}, 'Frame the photo'),
        row('Left to right', 'g-x', x), row('Top to bottom', 'g-y', y), row('Zoom', 'g-z', z), out,
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => { x.value = 50; y.value = 50; z.value = 1; draw(); } }, 'Reset framing')),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, submitLabel)));
    name.setAttribute('data-autofocus', '');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
      finish({ name: name.value.trim().replace(/\s+/g, ' '), ...read() });
    });
    return form;
  });
}
