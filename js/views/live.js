// Live mode: one question at a time, big and readable, for use during the interview or panel.
// It manages its own updates (manual route) so nothing re-renders under your hands.
import { h, icon, clock } from '../util.js';
import { store as s } from '../app-store.js';
import { navigate } from '../router.js';
import { pageHeader, empty, button } from '../ui.js';

export default function live({ root, params }) {
  const kind = location.hash.includes('/live/panel/') ? 'panel' : 'episode';
  let ep = null, conv = null, panelRef = null;
  const read = () => {
    if (kind === 'episode') { ep = s.byId('episodes', params.id); return ep; }
    const [cid, pid] = params.id.split('~');
    conv = s.byId('conventions', cid);
    panelRef = conv?.panels?.find((p) => p.id === pid) || null;
    return panelRef;
  };
  const item = read();
  const back = kind === 'episode' ? '/episodes/' + params.id : '/conventions/' + (params.id.split('~')[0] || '');
  const title = kind === 'episode' ? ep?.guest : panelRef?.title;

  if (!item) {
    root.append(pageHeader({ title: 'Nothing to show', back: { href: '/today', label: 'Today' } }), empty({ title: 'This item was deleted or never existed' }));
    return { manual: true };
  }

  const getList = () => (read(), (kind === 'episode' ? ep.questions : panelRef.questions) || []);
  const save = (questions) => {
    if (kind === 'episode') s.update('episodes', ep.id, { questions }, { silent: true });
    else s.update('conventions', conv.id, { panels: conv.panels.map((p) => (p.id === panelRef.id ? { ...p, questions } : p)) }, { silent: true });
  };

  let idx = Math.max(0, getList().findIndex((q) => !q.asked));
  let started = Date.now();
  let showAll = false;

  if (!getList().length) {
    root.append(pageHeader({ title, back: { href: back, label: 'Back' } }),
      empty({ title: 'No questions to ask yet', text: 'Add questions first, then come back and go live.', action: h('a', { class: 'btn primary', href: '#' + back }, 'Add questions') }));
    return { manual: true };
  }

  const stage = h('div', { class: 'live', 'data-autofocus': '', tabindex: '-1' });
  root.append(stage);
  let wake = null;
  const lock = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* optional */ } };
  lock();
  const onVis = () => { if (document.visibilityState === 'visible') lock(); };
  document.addEventListener('visibilitychange', onVis);

  const timer = h('span', { class: 'live-timer', role: 'timer', 'aria-label': 'Time elapsed' }, '0:00');
  const tick = setInterval(() => { timer.textContent = clock(Date.now() - started); }, 1000);

  function go(to) {
    const n = getList().length;
    idx = Math.min(n - 1, Math.max(0, to));
    draw();
  }
  function nextUnasked(from) {
    const list = getList();
    for (let i = from; i < list.length; i++) if (!list[i].asked) return i;
    return list.length - 1;
  }
  function markAsked() {
    const list = getList();
    save(list.map((q, i) => (i === idx ? { ...q, asked: true } : q)));
    go(nextUnasked(idx + 1));
  }

  function draw() {
    const list = getList();
    const q = list[idx];
    const asked = list.filter((x) => x.asked).length;
    const all = asked === list.length;
    stage.replaceChildren(...[
      h('div', { class: 'live-top' },
        h('a', { class: 'btn ghost', href: '#' + back }, icon('back', 18), 'Exit'),
        h('div', { class: 'live-title' }, h('strong', {}, title), h('span', {}, `${asked} of ${list.length} asked`)),
        timer),
      h('div', { class: 'live-body', 'aria-live': 'polite' },
        all && h('p', { class: 'live-done' }, 'Every question has been asked. Nice work.'),
        h('p', { class: 'live-count' }, `Question ${idx + 1} of ${list.length}${q.asked ? ' (asked)' : ''}`),
        h('p', { class: 'live-q' }, q.text),
        list[idx + 1] && h('p', { class: 'live-next' }, h('span', {}, 'Next: '), list[idx + 1].text)),
      h('div', { class: 'live-bar' },
        h('button', { type: 'button', class: 'btn secondary big', onclick: () => go(idx - 1), disabled: idx === 0 }, icon('back', 20), 'Back'),
        h('button', { type: 'button', class: 'btn secondary big', onclick: () => go(idx + 1), disabled: idx === list.length - 1 }, 'Skip', icon('skip', 20)),
        h('button', { type: 'button', class: 'btn primary big', onclick: markAsked }, icon('check', 20), 'Asked, next')),
      h('button', { type: 'button', class: 'btn ghost small live-toggle', 'aria-expanded': String(showAll), onclick: () => { showAll = !showAll; draw(); } }, showAll ? 'Hide all questions' : 'Show all questions'),
      showAll && h('ol', { class: 'live-all' }, list.map((x, i) => h('li', { class: (i === idx ? 'cur ' : '') + (x.asked ? 'done' : '') },
        h('button', { type: 'button', onclick: () => { showAll = false; go(i); } }, x.text))))].filter(Boolean));
    stage.querySelector('.btn.primary')?.focus({ preventScroll: true });
  }

  const onKey = (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'Enter' && !e.target.closest('button,a')) { e.preventDefault(); markAsked(); }
  };
  document.addEventListener('keydown', onKey);
  document.body.classList.add('is-live');
  draw();
  return {
    manual: true,
    cleanup() {
      clearInterval(tick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      document.body.classList.remove('is-live');
      wake?.release?.().catch(() => {});
    },
  };
}
