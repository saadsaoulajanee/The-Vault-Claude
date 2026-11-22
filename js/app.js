import { h, icon } from './util.js';
import { store } from './app-store.js';
import { route, start, render, isManual } from './router.js';
import { initSync, onSyncStatus, getSyncStatus } from './sync.js';
import { applyTheme } from './theme.js';
import { toast } from './ui.js';

import today from './views/today.js';
import episodes from './views/episodes.js';
import episode from './views/episode.js';
import guests from './views/guests.js';
import guest from './views/guest.js';
import conventions from './views/conventions.js';
import convention from './views/convention.js';
import live from './views/live.js';
import studio from './views/studio.js';
import settings from './views/settings.js';
import day from './views/day.js';
import budget from './views/budget.js';
import stats from './views/stats.js';
import venues from './views/venues.js';
import venue from './views/venue.js';
import playGame from './views/games.js';
import organizers from './views/organizers.js';
import focus from './views/focus.js';
import more, { MORE } from './views/more.js';

// [path, icon, label, where]: 'both', 'desktop' (hidden in the phone tab bar) or 'mobile' (the More button)
const NAV = [
  ['/today', 'today', 'Today', 'both'], ['/day', 'day', 'Day', 'both'], ['/episodes', 'episodes', 'Episodes', 'both'], ['/guests', 'guests', 'Guests', 'both'],
  ['/more', 'more', 'More', 'mobile'],
  ['sep'],
  ['/conventions', 'conventions', 'Conventions', 'desktop'], ['/organizers', 'users', 'Organizers', 'desktop'], ['/venues', 'venues', 'Venues', 'desktop'], ['/budget', 'budget', 'Budget', 'desktop'],
  ['/stats', 'stats', 'Stats', 'desktop'], ['/settings', 'settings', 'Settings', 'desktop'],
];
const MORE_PATHS = MORE.map((m) => m[0]);

async function boot() {
  try { await store.load(); } catch (e) {
    document.getElementById('main').replaceChildren(h('p', { class: 'muted pad' }, 'Could not open local storage. Private browsing can block it. Your changes will not be saved.'));
  }
  applyTheme(store.get().settings.theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(store.get().settings.theme));

  const nav = document.getElementById('nav');
  nav.append(...NAV.map(([href, ic, label, where]) => (href === 'sep' ? h('div', { class: 'sep', 'aria-hidden': 'true' })
    : h('a', { href: '#' + href, 'data-href': href, class: where === 'desktop' ? 'desktop-only' : where === 'mobile' ? 'mobile-only' : '' }, icon(ic, 22), label))));
  const chip = document.getElementById('syncchip');
  const drawChip = (st) => { chip.dataset.state = st.state; chip.querySelector('span').textContent = st.state === 'off' ? 'Sync is off' : st.message; };
  chip.addEventListener('click', () => { location.hash = '#/settings'; });
  onSyncStatus(drawChip); drawChip(getSyncStatus());

  route('/today', today);
  route('/episodes', episodes);
  route('/episodes/:id', episode);
  route('/guests', guests);
  route('/guests/:id', guest);
  route('/conventions', conventions);
  route('/conventions/:id', convention);
  route('/live/episode/:id', live);
  route('/live/panel/:id', live);
  route('/studio/:id', studio);
  route('/settings', settings);
  route('/day', day);
  route('/budget', budget);
  route('/stats', stats);
  route('/venues', venues);
  route('/venues/:id', venue);
  route('/live/game/:id', playGame);
  route('/more', more);
  route('/organizers', organizers);
  route('/focus/:id/:date', focus);

  await start(document.getElementById('main'), (path) => {
    nav.querySelectorAll('a').forEach((a) => {
      const href = a.dataset.href;
      // On phones the five secondary screens all light up the More tab.
      const phoneMore = href === '/more' && matchMedia('(max-width: 860px)').matches && MORE_PATHS.some((p) => path === p || path.startsWith(p + '/'));
      const on = phoneMore || path === href || path.startsWith(href + '/') || (href === '/episodes' && path.startsWith('/studio/'));
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    document.title = 'The Vault';
  });

  // Re-render when data changes, unless the view manages itself, a dialog is open, or someone is typing.
  let queued = false;
  store.on((type, detail) => {
    if (type === 'error') { toast('Could not save on this device. Download a copy from Settings so nothing is lost.', { timeout: 10000 }); return; }
    if (type !== 'change' || queued) return;
    queued = true;
    requestAnimationFrame(function paint() {
      const typing = document.activeElement?.closest?.('main input, main textarea');
      if (document.querySelector('dialog[open]') || (detail.quiet && typing)) { setTimeout(paint, 600); return; }
      queued = false;
      if (!isManual()) render({ keepScroll: true, announce: false });
    });
  });

  initSync(store);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
