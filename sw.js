// Offline support. App files are cached on install and served cache-first, so the app opens
// with no network. Fonts and the sync library are cached the first time they load.
// Bump VERSION on every release so people get the new files.
const VERSION = 'vault-5.2.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './assets/vault-icon-192.png', './assets/vault-icon-512.png',
  './js/app.js', './js/config.js', './js/model.js', './js/text.js', './js/merge.js', './js/store.js',
  './js/app-store.js', './js/sync.js', './js/util.js', './js/ui.js', './js/router.js', './js/ai.js',
  './js/wikidata.js', './js/theme.js', './js/finance.js', './js/stats.js', './js/youtube.js', './js/services.js',
  './js/charts.js', './js/plans.js', './js/flights.js', './js/flightapi.js',
  './js/views/qlist.js', './js/views/today.js', './js/views/episodes.js', './js/views/episode.js',
  './js/views/guests.js', './js/views/guest.js', './js/views/conventions.js', './js/views/convention.js',
  './js/views/live.js', './js/views/studio.js', './js/views/settings.js', './js/views/day.js', './js/views/budget.js',
  './js/views/stats.js', './js/views/videos.js', './js/views/venues.js', './js/views/venue.js', './js/views/games.js',
  './js/views/notes.js', './js/views/more.js',
  './js/poster.js', './js/guestmerge.js', './js/views/guestdialog.js', './js/views/duplicates.js', './js/views/organizers.js', './js/views/focus.js', './js/views/poster.js',
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    // stale-while-revalidate
    e.respondWith(caches.open(VERSION + '-runtime').then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Everything else (Supabase, Wikidata, your Worker) always goes to the network.
});
