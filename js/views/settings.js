import { h } from '../util.js';
import { store as s } from '../app-store.js';
import { config } from '../config.js';
import { signIn, signOut, getUser, getSyncStatus, onSyncStatus, cycle } from '../sync.js';
import { pageHeader, button, toast, confirmDialog, askForm, segmented } from '../ui.js';
import { applyTheme } from '../theme.js';
import { render } from '../router.js';
import { getService, setService, httpsUrl } from '../services.js';

export default function settings({ root }) {
  const db = s.get();
  root.append(pageHeader({ title: 'Settings' }));

  // Appearance
  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Appearance'),
    segmented([{ value: 'system', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
      db.settings.theme || 'system', (v) => { s.setSettings({ theme: v }); applyTheme(v); render({ keepScroll: true, announce: false }); }, 'Theme')));

  // Sync
  const state = h('p', { class: 'muted', role: 'status' }, getSyncStatus().message);
  const stop = onSyncStatus((st) => { if (state.isConnected) state.textContent = st.message + (st.at ? ` (${st.at.toLocaleTimeString()})` : ''); });
  const user = getUser();
  const syncBox = h('section', { class: 'panel block' }, h('h2', {}, 'Sync between devices'),
    h('p', { class: 'muted' }, 'Your data always lives on this device first. Signing in keeps your other devices up to date, and merges edits made in two places.'));
  if (user) {
    syncBox.append(h('p', {}, 'Signed in as ', h('strong', {}, user.email || 'your account')), state,
      h('div', { class: 'panel-actions' }, button('Sync now', { onclick: () => cycle(s) }),
        button('Sign out', { variant: 'ghost', onclick: async () => { await signOut(); render({ keepScroll: true, announce: false }); } })));
  } else {
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    const form = h('form', { class: 'qadd', onsubmit: async (e) => {
      e.preventDefault();
      if (!email.value.trim()) { email.focus(); return; }
      try { await signIn(s, email.value.trim()); toast('Check your inbox for the sign-in link', { timeout: 9000 }); }
      catch (err) { toast(err.message); }
    } }, h('label', { for: 'email', class: 'sr' }, 'Email'), email, h('button', { class: 'btn primary', type: 'submit' }, 'Email me a sign-in link'));
    syncBox.append(form);
  }
  root.append(syncBox);

  // Currency
  const currencies = ['EUR', 'USD', 'GBP', 'CAD', 'CHF', 'AUD', 'JPY'];
  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Money'),
    h('div', { class: 'field', style: { marginTop: '10px', maxWidth: '240px' } }, h('label', { for: 'cur' }, 'Currency'),
      h('select', { id: 'cur', value: db.settings.currency || 'EUR', onchange: (e) => { s.setSettings({ currency: e.target.value }); toast('Currency saved'); } },
        currencies.map((c) => h('option', { value: c }, c))))));

  // Connected services
  const svc = (name, label, type, hint, placeholder) => {
    const input = h('input', { id: 'svc-' + name, type, value: getService(name), placeholder, autocomplete: 'off' });
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if ((name === 'aiUrl' || name === 'flightUrl') && v && !httpsUrl(v)) { toast('Enter an address starting with https://'); input.focus(); return; }
      setService(name, name.endsWith('Url') ? httpsUrl(v) : v);
      toast('Saved on this device');
    });
    return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, h('p', { class: 'hint' }, hint));
  };
  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Connected services'),
    h('p', { class: 'muted' }, 'Optional. These stay in this browser only. They are never synced, exported or backed up.'),
    h('div', { style: { marginTop: '14px' } },
      svc('aiUrl', 'Question generator address', 'url', 'Your deployed ai-questions Worker.', 'https://your-ai-worker.workers.dev'),
      svc('flightUrl', 'Flight status address', 'url', 'Your deployed flight-status Worker.', 'https://your-flight-worker.workers.dev'),
      svc('token', 'Access token', 'password', 'The VAULT_ACCESS_TOKEN you set on your Workers. Forgotten when you close the browser.', ''),
      h('p', { class: 'muted' }, 'The YouTube key is set on the Stats screen, in the Videos tab.'))));

  // Packing list
  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Packing list'),
    h('p', { class: 'muted' }, 'One item per line. This is the master list used by every convention.'),
    h('textarea', { rows: 10, 'aria-label': 'Packing list', value: db.checklistTemplate.join('\n'),
      onchange: (e) => { const list = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); s.setPackingTemplate(list.length ? list : db.checklistTemplate); toast('Packing list saved'); } })));

  // Data
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', id: 'import-file', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = s.parseImport(await file.text());
      if (!(await confirmDialog('This replaces everything on this device. A backup is made first, so you can restore it.', { confirmLabel: 'Replace my data', danger: true, title: 'Import this file?' }))) return;
      await s.replaceAll(data, { reason: 'Before importing a file' });
      toast('Imported');
      render({ keepScroll: true, announce: false });
    } catch (err) { toast(err.message); }
    e.target.value = '';
  } });
  const backupsHost = h('ul', { class: 'rows' });
  s.backups().then((list) => backupsHost.replaceChildren(...(list.length ? list.map((b, i) => h('li', { class: 'idea' },
    h('span', {}, h('strong', {}, new Date(b.at).toLocaleString()), h('br'), h('span', { class: 'muted' }, b.reason)),
    button('Restore', { small: true, onclick: async () => {
      if (!(await confirmDialog('Replace your current data with this backup? Your current data is backed up first.', { confirmLabel: 'Restore backup', title: 'Restore backup' }))) return;
      await s.restoreBackup(i); toast('Backup restored'); render({ keepScroll: true, announce: false });
    } }))) : [h('li', { class: 'muted pad' }, 'No backups yet. They are made automatically while you work.')])));

  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Your data'),
    h('p', { class: 'muted' }, `${db.episodes.length} episodes, ${db.guests.length} guests, ${db.conventions.length} conventions, ${db.venues.length} venues. A copy includes floor plan images. If you used the previous version of The Vault in this browser, it was imported automatically.`),
    h('div', { class: 'panel-actions' },
      button('Download a copy', { iconName: 'download', onclick: async () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([await s.exportWithImages()], { type: 'application/json' })), download: `the-vault-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }),
      h('label', { class: 'btn secondary', for: 'import-file' }, 'Import a file'), fileInput,
      button('Back up now', { variant: 'ghost', onclick: async () => { await s.backup('Manual'); toast('Backup saved'); render({ keepScroll: true, announce: false }); } })),
    h('h3', {}, 'Local backups'), backupsHost));

  root.append(h('p', { class: 'muted pad' }, `The Vault ${config.appVersion}`));
  return { cleanup: stop };
}
