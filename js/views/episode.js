import { h, fmtDate, debounce, safeUrl, daysUntil, relDays } from '../util.js';
import { uid } from '../store.js';
import { store as appStore } from '../app-store.js';
import { navigate, render } from '../router.js';
import { STATUSES } from '../model.js';
import { dedupe } from '../text.js';
import { pageHeader, empty, button, iconButton, progress, confirmDialog, toast, avatar, segmented } from '../ui.js';
import { questionList } from './qlist.js';
import { editEpisodeDialog } from './episodes.js';
import { gamesPanel } from './games.js';

const tabs = {};

export default function episode({ root, params }) {
  const s = appStore;
  const ep = s.byId('episodes', params.id);
  if (!ep) {
    root.append(pageHeader({ title: 'Episode not found', back: { href: '/episodes', label: 'Episodes' } }),
      empty({ title: 'This episode was deleted or never existed', action: h('a', { class: 'btn primary', href: '#/episodes' }, 'Back to episodes') }));
    return;
  }
  const db = s.get();
  const guest = db.guests.find((g) => g.id === ep.guestId);
  const conv = db.conventions.find((c) => c.id === ep.conventionId);
  const qs = ep.questions || [];
  const asked = qs.filter((q) => q.asked).length;
  const ideas = ep.ideas || [];
  const tab = tabs[ep.id] || 'questions';

  root.append(pageHeader({
    title: ep.guest || 'Unnamed guest',
    back: { href: '/episodes', label: 'Episodes' },
    subtitle: undefined,
    actions: [
      h('a', { class: 'btn primary' + (qs.length ? '' : ' disabled'), href: qs.length ? `#/live/episode/${ep.id}` : null, 'aria-disabled': qs.length ? null : 'true' }, 'Go live'),
      button('Edit details', { iconName: 'edit', onclick: () => editEpisodeDialog(ep) }),
    ],
  }));

  root.append(h('div', { class: 'ep-head' },
    guest && h('a', { href: '#/guests/' + guest.id, class: 'ep-guest', 'aria-label': 'Open guest profile' }, avatar(guest, 48)),
    h('p', { class: 'meta' },
      h('span', {}, 'Episode ' + ep.number),
      ep.date && h('span', {}, `${fmtDate(ep.date)}${ep.time ? ' at ' + ep.time : ''} (${relDays(daysUntil(ep.date)).toLowerCase()})`),
      conv && h('a', { href: '#/conventions/' + conv.id }, conv.name)),
    h('label', { class: 'inline-select' }, h('span', { class: 'sr' }, 'Stage'),
      h('select', {
        value: String(ep.status ?? 0), 'aria-label': 'Stage',
        onchange: (e) => s.update('episodes', ep.id, { status: Number(e.target.value) }),
      }, STATUSES.map(([e, l], i) => h('option', { value: String(i) }, `${e} ${l}`))))));

  root.append(h('div', { class: 'ep-progress' }, progress(asked, qs.length, 'Questions asked'),
    h('p', { class: 'muted' }, qs.length ? `${asked} of ${qs.length} asked` : 'Add questions to get ready')));

  root.append(segmented([
    { value: 'questions', label: `Questions (${qs.length})` },
    { value: 'ideas', label: `Ideas (${ideas.length})` },
    { value: 'games', label: `Games (${(ep.interviewGames || []).length})` },
    { value: 'notes', label: 'Notes and links' },
  ], tab, (v) => { tabs[ep.id] = v; render({ keepScroll: true, announce: false }); }, 'Episode sections'));

  const panel = h('section', { class: 'panel', 'aria-label': tab });
  root.append(panel);

  if (tab === 'questions') {
    panel.append(
      h('div', { class: 'panel-actions' },
        h('a', { class: 'btn secondary', href: '#/studio/' + ep.id }, 'Generate ideas')),
      questionList({
        getList: () => s.byId('episodes', ep.id).questions || [],
        save: (questions, opts) => s.update('episodes', ep.id, { questions }, opts),
      }));
  }

  if (tab === 'ideas') {
    panel.append(h('div', { class: 'panel-actions' },
      h('a', { class: 'btn secondary', href: '#/studio/' + ep.id }, 'Generate ideas'),
      ideas.length ? button(`Add all ${ideas.length} to questions`, { variant: 'primary', onclick: () => {
        const cur = s.byId('episodes', ep.id);
        const fresh = dedupe(ideas.map((i) => i.text), (cur.questions || []).map((q) => q.text));
        s.update('episodes', ep.id, { questions: [...(cur.questions || []), ...fresh.map((text) => ({ id: uid(), text, asked: false }))], ideas: [] });
        toast(`Added ${fresh.length} to questions`);
      } }) : null));
    if (!ideas.length) panel.append(h('p', { class: 'muted pad' }, 'Ideas wait here until you decide to use them. Generate some, or keep promising lines from research.'));
    else panel.append(h('ul', { class: 'rows' }, ideas.map((idea) => h('li', { class: 'idea' },
      h('span', {}, idea.text),
      h('div', { class: 'qtools' },
        button('Add to questions', { small: true, onclick: () => {
          const cur = s.byId('episodes', ep.id);
          if (!dedupe([idea.text], (cur.questions || []).map((q) => q.text)).length) toast('Already in your questions');
          s.update('episodes', ep.id, { questions: [...(cur.questions || []), { id: uid(), text: idea.text, asked: false }], ideas: (cur.ideas || []).filter((i) => i.id !== idea.id) });
        } }),
        iconButton('trash', 'Remove idea', () => s.update('episodes', ep.id, (cur) => ({ ideas: (cur.ideas || []).filter((i) => i.id !== idea.id) }))))))));
  }

  if (tab === 'games') gamesPanel(panel, ep);

  if (tab === 'notes') {
    const save = debounce((patch) => s.update('episodes', ep.id, patch, { silent: true }), 400);
    const shorts = ep.shorts || [];
    panel.append(
      h('div', { class: 'field' }, h('label', { for: 'notes' }, 'Notes'),
        h('textarea', { id: 'notes', rows: 8, value: ep.notes || '', placeholder: 'Anything to remember before, during or after the interview', oninput: (e) => save({ notes: e.target.value }) })),
      h('div', { class: 'field' }, h('label', { for: 'long' }, 'Long-format link'),
        h('input', { id: 'long', type: 'url', value: ep.longLink || '', placeholder: 'https://', oninput: (e) => save({ longLink: e.target.value.trim() }) }),
        safeUrl(ep.longLink) && h('a', { class: 'hint', href: safeUrl(ep.longLink), target: '_blank', rel: 'noopener noreferrer' }, 'Open link')),
      h('div', { class: 'field' }, h('label', { for: 'short-add' }, 'Shorts'),
        shorts.length ? h('ul', { class: 'rows' }, shorts.map((u, i) => h('li', { class: 'idea' },
          safeUrl(u) ? h('a', { href: safeUrl(u), target: '_blank', rel: 'noopener noreferrer' }, u) : h('span', {}, u),
          iconButton('trash', 'Remove short', () => s.update('episodes', ep.id, (cur) => ({ shorts: (cur.shorts || []).filter((_, k) => k !== i) })))))) : null,
        h('div', { class: 'qadd' }, h('input', { id: 'short-add', type: 'url', placeholder: 'Paste a link to a short', class: 'qadd-input' }),
          button('Add short', { onclick: () => { const el = document.getElementById('short-add'); const u = el.value.trim(); if (!u) return; s.update('episodes', ep.id, (cur) => ({ shorts: [...(cur.shorts || []), u] })); } }))));
  }

  root.append(h('div', { class: 'danger-zone' }, button('Delete episode', { variant: 'danger', iconName: 'trash', onclick: async () => {
    if (!(await confirmDialog(`Delete the episode with ${ep.guest}? You can undo this right after.`, { confirmLabel: 'Delete episode', danger: true, title: 'Delete episode' }))) return;
    const removed = s.remove('episodes', ep.id);
    navigate('/episodes');
    toast('Episode deleted', { label: 'Undo', onAction: () => s.restore('episodes', removed) });
  } })));
}
