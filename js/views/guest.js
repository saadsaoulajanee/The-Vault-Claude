import { h, debounce, fmtDate, todayIso, safeUrl } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { navigate, render } from '../router.js';
import { ideasFromCredit, crossIdeas } from '../text.js';
import { searchPerson, fetchCredits } from '../wikidata.js';
import { pageHeader, empty, button, iconButton, askForm, confirmDialog, toast, avatar, segmented } from '../ui.js';
import { guestDialog } from './guestdialog.js';
import { checkDuplicate } from './guests.js';

const tabs = {};

export default function guest({ root, params }) {
  const g = s.byId('guests', params.id);
  if (!g) {
    root.append(pageHeader({ title: 'Guest not found', back: { href: '/guests', label: 'Guests' } }),
      empty({ title: 'This guest was deleted or never existed', action: h('a', { class: 'btn primary', href: '#/guests' }, 'Back to guests') }));
    return;
  }
  const db = s.get();
  const episodes = db.episodes.filter((e) => e.guestId === g.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tab = tabs[g.id] || 'profile';
  const save = debounce((patch) => s.update('guests', g.id, patch, { silent: true }), 400);

  root.append(pageHeader({
    title: g.name, back: { href: '/guests', label: 'Guests' },
    actions: [button('Edit name and photo', { iconName: 'edit', onclick: async () => {
      const v = await guestDialog(g, { title: 'Edit guest' });
      if (!v) return;
      if (v.name !== g.name) {
        const hit = await checkDuplicate(v.name, g.id);
        if (!hit) return;
        if (hit !== true) { navigate('/guests/' + hit.id); return; }
      }
      s.update('guests', g.id, v);
      db.episodes.filter((e) => e.guestId === g.id).forEach((e) => s.update('episodes', e.id, { guest: v.name }, { silent: true }));
    } })],
  }));
  root.append(h('div', { class: 'ep-head' }, avatar(g, 64), h('p', { class: 'meta' }, h('span', {}, `${episodes.length} episode${episodes.length === 1 ? '' : 's'}`), (g.projects || []).length ? h('span', {}, `${g.projects.length} credits`) : null)));
  root.append(segmented([{ value: 'profile', label: 'Profile' }, { value: 'credits', label: `Credits (${(g.projects || []).length})` }, { value: 'journal', label: `Journal (${(g.journal || []).length})` }, { value: 'history', label: `Episodes (${episodes.length})` }],
    tab, (v) => { tabs[g.id] = v; render({ keepScroll: true, announce: false }); }, 'Guest sections'));

  const panel = h('section', { class: 'panel' });
  root.append(panel);

  if (tab === 'profile') {
    panel.append(
      h('div', { class: 'field' }, h('label', { for: 'pron' }, 'How to say the name'),
        h('div', { class: 'qadd' }, h('input', { id: 'pron', class: 'qadd-input', value: g.pronunciation || '', placeholder: 'For example: AL-fred EE-notch', oninput: (e) => save({ pronunciation: e.target.value }) }),
          'speechSynthesis' in window ? button('Listen', { iconName: 'volume', onclick: () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(g.name)); } }) : null)),
      h('div', { class: 'field' }, h('label', { for: 'bio' }, 'Bio'), h('textarea', { id: 'bio', rows: 5, value: g.bio || '', oninput: (e) => save({ bio: e.target.value }) })),
      h('div', { class: 'field' }, h('label', { for: 'gnotes' }, 'Notes'), h('textarea', { id: 'gnotes', rows: 5, value: g.notes || '', placeholder: 'Topics to avoid, how they like to be introduced, contact details', oninput: (e) => save({ notes: e.target.value }) })),
      h('div', { class: 'danger-zone' }, button('Delete guest', { variant: 'danger', iconName: 'trash', onclick: async () => {
        if (!(await confirmDialog(episodes.length ? `${g.name} has ${episodes.length} episode(s). They stay, but lose the link to this profile.` : `Delete ${g.name}?`, { confirmLabel: 'Delete guest', danger: true, title: 'Delete guest' }))) return;
        const removed = s.remove('guests', g.id);
        navigate('/guests');
        toast('Guest deleted', { label: 'Undo', onAction: () => s.restore('guests', removed) });
      } })));
  }

  if (tab === 'credits') {
    const projects = g.projects || [];
    const setProjects = (next) => s.update('guests', g.id, { projects: next });
    panel.append(h('div', { class: 'panel-actions' },
      button('Add credit', { iconName: 'plus', onclick: async () => {
        const v = await askForm({ title: 'Add credit', fields: [{ name: 'title', label: 'Title', required: true }, { name: 'role', label: 'Role or character' }, { name: 'year', label: 'Year' }] });
        if (v) setProjects([...projects, { id: uid(), title: v.title.trim(), role: v.role.trim(), year: v.year.trim() }]);
      } }),
      button('Find credits on Wikidata', { iconName: 'search', onclick: () => findCredits(g, projects, setProjects) })));
    panel.append(projects.length ? h('ul', { class: 'rows' }, projects.map((p) => h('li', { class: 'idea' },
      h('span', {}, h('strong', {}, p.title), p.role ? ` as ${p.role}` : '', p.year ? ` (${p.year})` : ''),
      h('div', { class: 'qtools' },
        button('Make questions', { small: true, onclick: () => addIdeas(g, ideasFromCredit(p.title, p.role, g.name)) }),
        iconButton('trash', 'Remove credit', () => setProjects(projects.filter((x) => x.id !== p.id)))))))
      : h('p', { class: 'muted pad' }, 'Add credits by hand, or pull them from Wikidata. Question ideas are built from them without inventing plot details.'));
    if (projects.length > 1) {
      panel.append(h('div', { class: 'panel-actions' }, button('Compare two credits', { onclick: async () => {
        const opts = projects.map((p) => ({ value: p.id, label: p.title }));
        const v = await askForm({ title: 'Compare two credits', submitLabel: 'Make questions', fields: [
          { name: 'a', label: 'First credit', type: 'select', options: opts, value: opts[0].value },
          { name: 'b', label: 'Second credit', type: 'select', options: opts, value: opts[1].value }] });
        if (!v) return;
        const a = projects.find((p) => p.id === v.a), b = projects.find((p) => p.id === v.b);
        const ideas = crossIdeas(a?.title, b?.title);
        if (!ideas.length) { toast('Choose two different credits'); return; }
        addIdeas(g, ideas);
      } })));
    }
  }

  if (tab === 'journal') {
    const journal = g.journal || [];
    panel.append(h('div', { class: 'panel-actions' }, button('Add note', { variant: 'primary', iconName: 'plus', onclick: async () => {
      const v = await askForm({ title: 'Add a note', fields: [{ name: 'date', label: 'Date', type: 'date', value: todayIso() }, { name: 'text', label: 'What happened', type: 'textarea', required: true }] });
      if (v) s.update('guests', g.id, { journal: [{ id: uid(), date: v.date, text: v.text.trim() }, ...journal] });
    } })));
    panel.append(journal.length ? h('ul', { class: 'rows' }, journal.map((n) => h('li', { class: 'idea' },
      h('span', {}, h('strong', {}, fmtDate(n.date) || 'Undated'), h('br'), n.text),
      iconButton('trash', 'Delete note', () => s.update('guests', g.id, { journal: journal.filter((x) => x.id !== n.id) })))))
      : h('p', { class: 'muted pad' }, 'Keep a record of every conversation and favour, so nothing gets asked twice.'));
  }

  if (tab === 'history') {
    panel.append(episodes.length ? h('ul', { class: 'rows' }, episodes.map((e) => h('li', {}, h('a', { class: 'row', href: '#/episodes/' + e.id },
      h('div', { class: 'row-main' }, h('strong', {}, 'Episode ' + e.number), h('span', { class: 'muted' }, fmtDate(e.date) || 'No date')),
      h('span', { class: 'pill' }, `${(e.questions || []).length} questions`)))))
      : h('p', { class: 'muted pad' }, 'No episodes with this guest yet.'));
  }
}

function addIdeas(g, texts) {
  const ep = s.get().episodes.filter((e) => e.guestId === g.id).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!ep) { toast('Create an episode with this guest first'); return; }
  const have = new Set([...(ep.ideas || []), ...(ep.questions || [])].map((x) => x.text));
  const fresh = texts.filter((t) => !have.has(t)).map((text) => ({ id: uid(), text }));
  s.update('episodes', ep.id, { ideas: [...(ep.ideas || []), ...fresh] });
  toast(`${fresh.length} ideas saved to episode ${ep.number}`, { label: 'Open', onAction: () => navigate('/episodes/' + ep.id) });
}

async function findCredits(g, projects, setProjects) {
  const v = await askForm({ title: 'Search Wikidata', submitLabel: 'Search', fields: [{ name: 'q', label: 'Name', value: g.name, required: true }] });
  if (!v) return;
  let people;
  try { people = await searchPerson(v.q); } catch (e) { toast(e.message); return; }
  if (!people.length) { toast('No match on Wikidata. You can still add credits by hand.'); return; }
  const pick = await askForm({ title: 'Which person?', submitLabel: 'Get credits', fields: [{ name: 'id', label: 'Match', type: 'select', value: people[0].id, options: people.map((p) => ({ value: p.id, label: `${p.label} (${p.description})` })) }] });
  if (!pick) return;
  toast('Fetching credits…', { timeout: 3000 });
  let credits;
  try { credits = await fetchCredits(pick.id); } catch (e) { toast(e.message); return; }
  const have = new Set(projects.map((p) => p.title.toLowerCase()));
  const fresh = credits.filter((c) => !have.has(c.title.toLowerCase())).slice(0, 40);
  if (!fresh.length) { toast('No new credits found'); return; }
  setProjects([...projects, ...fresh.map((c) => ({ id: uid(), title: c.title, role: c.role, year: c.year, source: safeUrl(c.sourceUrl) }))]);
  toast(`Added ${fresh.length} credits. Check them against their sources.`);
}
