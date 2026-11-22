// Shared interface pieces: toasts, dialogs, forms and small components.
import { h, icon } from './util.js';
import { initials, cropOf } from './text.js';
import { safeUrl } from './util.js';

export function toast(message, { label, onAction, timeout = 6000 } = {}) {
  const region = document.getElementById('toasts');
  const close = () => node.remove();
  const node = h('div', { class: 'toast', role: 'status' },
    h('span', {}, message),
    label && h('button', { type: 'button', class: 'btn ghost small', onclick: () => { onAction?.(); close(); } }, label));
  region.append(node);
  setTimeout(close, timeout);
  return close;
}

export function dialog(build) { return modal(build); }

function modal(build) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'modal' });
    const finish = (value) => { resolved = true; dlg.close(); resolve(value); };
    let resolved = false;
    dlg.addEventListener('close', () => { dlg.remove(); if (!resolved) resolve(null); });
    dlg.append(build(finish, dlg));
    document.body.append(dlg);
    dlg.showModal();
    (dlg.querySelector('[data-autofocus]') || dlg.querySelector('input,select,textarea,button'))?.focus();
  });
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return modal((finish) => h('div', { class: 'form' },
    h('h2', {}, title),
    h('p', {}, message),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(false) }, 'Cancel'),
      h('button', { type: 'button', class: 'btn ' + (danger ? 'danger' : 'primary'), 'data-autofocus': '', onclick: () => finish(true) }, confirmLabel))))
    .then((v) => !!v);
}

function fieldEl(f, inputs) {
  const id = 'f-' + f.name;
  let control;
  if (f.type === 'textarea') control = h('textarea', { id, rows: f.rows || 5, placeholder: f.placeholder, value: f.value ?? '' });
  else if (f.type === 'select') {
    control = h('select', { id, value: f.value ?? '' },
      (f.options || []).map((o) => h('option', { value: o.value }, o.label)));
  } else {
    control = h('input', { id, type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder, list: f.list ? id + '-list' : null, autocomplete: 'off', step: f.step, min: f.min, inputmode: f.inputmode });
  }
  if (f.required) control.setAttribute('required', '');
  inputs[f.name] = control;
  return h('div', { class: 'field' },
    h('label', { for: id }, f.label),
    control,
    f.list && h('datalist', { id: id + '-list' }, f.list.map((v) => h('option', { value: v }))),
    f.hint && h('p', { class: 'hint' }, f.hint));
}

/** Show a form in a dialog. Resolves to { name: value } or null when cancelled. */
export function askForm({ title, fields, submitLabel = 'Save', intro }) {
  return modal((finish) => {
    const inputs = {};
    const form = h('form', { class: 'form', novalidate: true },
      h('h2', {}, title),
      intro && h('p', { class: 'muted' }, intro),
      fields.map((f) => fieldEl(f, inputs)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, submitLabel)));
    const first = Object.values(inputs)[0];
    first?.setAttribute('data-autofocus', '');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = Object.fromEntries(fields.map((f) => [f.name, inputs[f.name].value]));
      const missing = fields.find((f) => f.required && !String(values[f.name]).trim());
      if (missing) {
        inputs[missing.name].setAttribute('aria-invalid', 'true');
        inputs[missing.name].focus();
        return;
      }
      finish(values);
    });
    return form;
  });
}

export function pageHeader({ title, subtitle, back, actions }) {
  return h('header', { class: 'page-head' },
    back && h('a', { class: 'back', href: '#' + back.href }, icon('back', 18), back.label),
    h('div', { class: 'page-title' },
      h('div', {}, h('h1', { tabindex: '-1' }, title), subtitle && h('p', { class: 'muted' }, subtitle)),
      actions && h('div', { class: 'page-actions' }, actions)));
}

export function empty({ title, text, action }) {
  return h('div', { class: 'empty' }, h('h3', {}, title), text && h('p', { class: 'muted' }, text), action);
}

export function button(label, { variant = 'secondary', iconName, onclick, small, disabled, type = 'button', ...rest } = {}) {
  return h('button', { type, class: `btn ${variant}${small ? ' small' : ''}`, onclick, disabled, ...rest },
    iconName && icon(iconName, small ? 16 : 18), label);
}

export function iconButton(name, label, onclick, { disabled } = {}) {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick, disabled }, icon(name, 18));
}

export function progress(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': label || 'Progress' },
    h('span', { style: { width: pct + '%' } }));
}

export function avatar(person, size = 40) {
  const src = safeUrl(person?.photo);
  const box = h('div', { class: 'avatar', style: { width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' }, 'aria-hidden': 'true' });
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    applyCrop(img, person);
    img.addEventListener('error', () => { img.remove(); box.textContent = initials(person?.name); });
    box.append(img);
  } else box.textContent = initials(person?.name);
  return box;
}

export function segmented(options, value, onChange, label) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === value),
      class: o.value === value ? 'on' : '', onclick: () => onChange(o.value),
    }, o.label)));
}

export { cropOf };

export function applyCrop(img, person) {
  const { x, y, zoom } = cropOf(person);
  img.style.objectPosition = `${x}% ${y}%`;
  img.style.transformOrigin = `${x}% ${y}%`;
  img.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
}
