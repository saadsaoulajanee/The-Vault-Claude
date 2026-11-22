// Interview games: formats you can edit, games made per episode, and a full-screen play mode.
import { h, icon } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { navigate } from '../router.js';
import { DEFAULT_GAME_FORMATS, starterPrompts } from '../model.js';
import { splitLines, dedupe } from '../text.js';
import { pageHeader, empty, button, iconButton, askForm, confirmDialog, toast } from '../ui.js';

const formats = () => (Array.isArray(s.get().settings.gameFormats) ? s.get().settings.gameFormats : DEFAULT_GAME_FORMATS);
const formatName = (g) => formats().find((f) => f.id === g.type)?.name || g.title || 'Archived format';
const when = (iso) => (iso ? 'Played ' + new Date(iso).toLocaleDateString() : 'Not played yet');

export function gamesPanel(panel, ep) {
  const games = ep.interviewGames || [];
  const guest = s.get().guests.find((g) => g.id === ep.guestId);
  const setGames = (next) => s.update('episodes', ep.id, { interviewGames: next });

  panel.append(h('p', { class: 'muted' }, 'Quick formats for the middle of an interview. Pick one to start with sample prompts, then make them yours.'),
    h('div', { class: 'panel-actions', style: { marginTop: '12px' } },
      formats().map((f) => button(f.name, { iconName: 'plus', small: true, onclick: () => {
        const g = { id: uid(), type: f.id, title: f.name, prompts: starterPrompts(f.id, guest, formats()), lastPlayedAt: '' };
        setGames([...(s.byId('episodes', ep.id).interviewGames || []), g]);
        if (!g.prompts.length) toast('Created empty. Open Edit prompts to add some.');
      } })),
      button('Manage formats', { variant: 'ghost', small: true, onclick: manageFormats })));

  panel.append(games.length ? h('ul', { class: 'rows' }, games.map((g) => h('li', { class: 'game' },
    h('div', {}, h('strong', {}, formatName(g)), h('div', { class: 'muted' }, `${(g.prompts || []).length} prompts. ${when(g.lastPlayedAt)}`)),
    h('div', { class: 'acts', style: { display: 'flex', gap: '6px', alignItems: 'center' } },
      h('a', { class: 'btn primary small' + ((g.prompts || []).length ? '' : ' disabled'), href: (g.prompts || []).length ? `#/live/game/${ep.id}~${g.id}` : null, 'aria-disabled': (g.prompts || []).length ? null : 'true' }, icon('play', 16), 'Play'),
      button('Edit prompts', { small: true, onclick: () => editGame(ep, g) }),
      iconButton('trash', 'Delete game', () => {
        const before = s.byId('episodes', ep.id).interviewGames || [];
        setGames(before.filter((x) => x.id !== g.id));
        toast('Game deleted', { label: 'Undo', onAction: () => setGames(before) });
      }))))) : empty({ title: 'No games yet', text: 'Choose a format above to make your first one.' }));
}

async function editGame(ep, g) {
  const v = await askForm({
    title: `Edit ${formatName(g)}`, submitLabel: 'Save game', intro: 'One prompt per line.',
    fields: [
      { name: 'type', label: 'Format', type: 'select', value: g.type, options: formats().map((f) => ({ value: f.id, label: f.name })) },
      { name: 'prompts', label: 'Prompts', type: 'textarea', rows: 10, value: (g.prompts || []).join('\n') },
    ],
  });
  if (!v) return;
  const prompts = dedupe(splitLines(v.prompts));
  s.update('episodes', ep.id, (cur) => ({ interviewGames: (cur.interviewGames || []).map((x) => (x.id === g.id ? { ...x, type: v.type, prompts } : x)) }));
}

async function manageFormats() {
  const list = formats();
  const v = await askForm({
    title: 'Game formats', submitLabel: 'Save formats',
    intro: 'One format per line. Add example prompts after a colon, separated by | (for example: Who said it?: Prompt one | Prompt two). Existing games are not changed.',
    fields: [{ name: 'text', label: 'Formats', type: 'textarea', rows: 9, value: list.map((f) => f.name + (f.examples?.length ? ': ' + f.examples.join(' | ') : '')).join('\n') }],
  });
  if (!v) return;
  const next = [];
  for (const line of splitLines(v.text)) {
    const [name, ...rest] = line.split(':');
    const label = name.trim();
    if (!label || next.some((f) => f.name.toLowerCase() === label.toLowerCase())) continue;
    const existing = list.find((f) => f.name.toLowerCase() === label.toLowerCase());
    next.push({ id: existing?.id || 'format-' + uid(), name: label, examples: rest.join(':').split('|').map((x) => x.trim()).filter(Boolean) });
  }
  if (!next.length) { toast('Keep at least one format'); return; }
  s.setSettings({ gameFormats: next });
}

/** Full-screen play mode. Route: /live/game/:episodeId~:gameId */
export default function play({ root, params }) {
  const [epId, gameId] = params.id.split('~');
  const ep = s.byId('episodes', epId);
  const game = ep?.interviewGames?.find((g) => g.id === gameId);
  if (!game || !(game.prompts || []).length) {
    root.append(pageHeader({ title: 'Nothing to play', back: { href: '/episodes/' + (epId || ''), label: 'Back' } }), empty({ title: 'This game is empty or was deleted' }));
    return { manual: true };
  }
  let order = game.prompts.map((_, i) => i);
  let pos = 0;
  const stage = h('div', { class: 'live', tabindex: '-1', 'data-autofocus': '' });
  root.append(stage);
  document.body.classList.add('is-live');
  let wake = null;
  (async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* optional */ } })();

  const shuffle = () => {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    pos = 0; draw();
  };
  const finish = () => {
    s.update('episodes', ep.id, (cur) => ({ interviewGames: (cur.interviewGames || []).map((g) => (g.id === game.id ? { ...g, lastPlayedAt: new Date().toISOString() } : g)) }), { silent: true });
    navigate('/episodes/' + ep.id);
  };
  const go = (d) => { pos = Math.min(order.length - 1, Math.max(0, pos + d)); draw(); };
  const last = () => pos === order.length - 1;

  function draw() {
    stage.replaceChildren(
      h('div', { class: 'live-top' },
        h('a', { class: 'btn ghost', href: '#/episodes/' + ep.id }, icon('back', 18), 'Exit'),
        h('div', { class: 'live-title' }, h('strong', {}, formatName(game)), h('span', {}, ep.guest)),
        h('button', { type: 'button', class: 'btn ghost', onclick: shuffle, 'aria-label': 'Shuffle prompts' }, icon('shuffle', 18), 'Shuffle')),
      h('div', { class: 'live-body', 'aria-live': 'polite' },
        h('p', { class: 'live-count' }, `Prompt ${pos + 1} of ${order.length}`),
        h('p', { class: 'live-q' }, game.prompts[order[pos]]),
        h('div', { class: 'dots', 'aria-hidden': 'true' }, order.map((_, i) => h('span', { class: i === pos ? 'on' : '' })))),
      h('div', { class: 'live-bar' },
        h('button', { type: 'button', class: 'btn secondary big', onclick: () => go(-1), disabled: pos === 0 }, icon('back', 20), 'Back'),
        last() ? h('button', { type: 'button', class: 'btn primary big', style: { gridColumn: 'span 2' }, onclick: finish }, icon('check', 20), 'Finish game')
          : h('button', { type: 'button', class: 'btn primary big', style: { gridColumn: 'span 2' }, onclick: () => go(1) }, 'Next prompt')));
    stage.querySelector('.btn.primary')?.focus({ preventScroll: true });
  }
  const onKey = (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); last() ? finish() : go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return { manual: true, cleanup() { document.removeEventListener('keydown', onKey); document.body.classList.remove('is-live'); wake?.release?.().catch(() => {}); } };
}
