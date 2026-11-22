// Organizers and their contact people. Phone, email and website become one-tap links on the day.
import { h, icon, safeUrl } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { dialog, pageHeader, empty, button, confirmDialog, toast } from '../ui.js';

import { telHref, mailHref } from '../text.js';

/** One contact as a small card with tap-to-call, email and website links. */
export function contactItem(c) {
  const link = (href, label, ic, external) => href && h('a', { class: 'btn secondary small', href, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, icon(ic, 16), label);
  const site = safeUrl(c.website);
  return h('li', { class: 'contact' },
    h('div', {}, h('strong', {}, c.name || 'Unnamed contact'), c.role && h('span', { class: 'muted' }, c.role),
      c.phone && !telHref(c.phone) ? h('span', { class: 'muted' }, c.phone) : null),
    h('div', { class: 'contact-links' }, link(telHref(c.phone), 'Call', 'phone'), link(mailHref(c.email), 'Email', 'mail'), link(site, 'Website', 'link', true)));
}

export function contactsList(org) {
  const list = (org?.contacts || []).filter((c) => c.name || c.phone || c.email);
  return list.length ? h('ul', { class: 'contacts' }, list.map(contactItem)) : null;
}

export function editOrganizer(org) {
  return dialog((finish) => {
    const rows = h('div', { class: 'contact-rows' });
    const name = h('input', { id: 'o-name', value: org?.name || '', autocomplete: 'off' });
    const addRow = (c = {}) => {
      const f = (key, label, type, ph) => h('div', { class: 'field' }, h('label', {}, label), h('input', { 'data-k': key, type, value: c[key] || '', placeholder: ph, autocomplete: 'off' }));
      const row = h('div', { class: 'contact-row', 'data-id': c.id || uid() },
        f('name', 'Name', 'text', 'Contact name'), f('role', 'Role', 'text', 'Press officer'), f('phone', 'Phone', 'tel', '+33…'),
        f('email', 'Email', 'email', 'name@example.com'), f('website', 'Website', 'url', 'https://'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => row.remove() }, 'Remove'));
      rows.append(row);
      return row;
    };
    (org?.contacts?.length ? org.contacts : []).forEach(addRow);
    const form = h('form', { class: 'form wide', novalidate: true },
      h('h2', {}, org ? 'Edit organizer' : 'New organizer'),
      h('div', { class: 'field' }, h('label', { for: 'o-name' }, 'Organizer name'), name),
      h('h3', {}, 'Contacts'), rows,
      h('button', { type: 'button', class: 'btn secondary small', onclick: () => addRow().querySelector('input').focus() }, icon('plus', 16), 'Add contact'),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(null) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Save organizer')));
    name.setAttribute('data-autofocus', '');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
      const contacts = [...rows.children].map((r) => ({ id: r.dataset.id, ...Object.fromEntries([...r.querySelectorAll('input')].map((i) => [i.dataset.k, i.value.trim()])) }))
        .filter((c) => c.name || c.phone || c.email || c.website);
      finish({ name: name.value.trim(), contacts });
    });
    return form;
  });
}

/** Create or edit, then save. Resolves to the organizer or null. */
export async function saveOrganizer(org) {
  const v = await editOrganizer(org);
  if (!v) return null;
  return org ? s.update('organizers', org.id, v) : s.add('organizers', v);
}

export default function organizers({ root }) {
  const db = s.get();
  root.append(pageHeader({ title: 'Organizers', subtitle: 'Who to call when something goes wrong', actions: button('New organizer', { variant: 'primary', iconName: 'plus', onclick: () => saveOrganizer(null) }) }));
  if (!db.organizers.length) {
    root.append(empty({ title: 'No organizers yet', text: 'Add the people who run your conventions, with their phone, email and website, and they show up on the convention and on the day.', action: button('New organizer', { variant: 'primary', iconName: 'plus', onclick: () => saveOrganizer(null) }) }));
    return;
  }
  root.append(h('ul', { class: 'org-list' }, db.organizers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((o) => {
    const cons = db.conventions.filter((c) => c.organizerId === o.id);
    return h('li', { class: 'panel org' },
      h('div', { class: 'page-title' }, h('div', {}, h('h2', {}, o.name), h('p', { class: 'muted' }, cons.length ? cons.map((c) => c.name).join(', ') : 'Not linked to a convention')),
        h('div', { class: 'page-actions' }, button('Edit', { iconName: 'edit', small: true, onclick: () => saveOrganizer(o) }),
          button('Delete', { variant: 'ghost', iconName: 'trash', small: true, onclick: async () => {
            if (!(await confirmDialog(cons.length ? `${o.name} is linked to ${cons.length} convention(s). They stay, without an organizer.` : `Delete ${o.name}?`, { confirmLabel: 'Delete organizer', danger: true, title: 'Delete organizer' }))) return;
            const removed = s.remove('organizers', o.id);
            cons.forEach((c) => s.update('conventions', c.id, { organizerId: '' }, { silent: true }));
            toast('Organizer deleted', { label: 'Undo', onAction: () => { s.restore('organizers', removed); cons.forEach((c) => s.update('conventions', c.id, { organizerId: o.id })); } });
          } }))),
      contactsList(o) || h('p', { class: 'muted' }, 'No contacts yet. Use Edit to add some.'));
  })));
}
