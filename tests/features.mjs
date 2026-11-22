// Tests for the version 4 features brought back: money, stats, dates, games, YouTube, images, flights.
import assert from 'node:assert/strict';
import { money, budgetStatus, syncAutoExpenses, yearlyFinance, categoryTotals, expensesToCsv, autoAmount } from '../js/finance.js';
import { interviewStats, foldTail } from '../js/stats.js';
import { datesBetween, weekdayName, matchesDay, interviewDate, timeToMinutes, starterPrompts, DEFAULT_GAME_FORMATS } from '../js/model.js';
import { ytId, fetchVideos, withHistory, growth, isoDurationToText } from '../js/youtube.js';
import { createStore, normalize } from '../js/store.js';
import { mergeDb } from '../js/merge.js';
import { validFlight, validDate, compact } from '../worker/flight-status-worker.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const adapter = (initial = {}, legacy = null) => {
  const data = { ...initial };
  return { data, get: async (k) => structuredClone(data[k] ?? null), set: async (k, v) => { data[k] = structuredClone(v); }, legacy: async () => legacy };
};

// ---- finance
test('budgetStatus states', () => {
  assert.equal(budgetStatus({ expenses: [{ amount: 10 }] }).state, 'none');
  assert.equal(budgetStatus({ budget: 100, expenses: [{ amount: 50 }] }).state, 'ok');
  assert.equal(budgetStatus({ budget: 100, expenses: [{ amount: 90 }] }).state, 'near');
  const over = budgetStatus({ budget: 100, expenses: [{ amount: 100.5 }] });
  assert.equal(over.state, 'over'); assert.equal(over.pct, 100); assert.ok(over.remaining < 0);
  assert.equal(budgetStatus({ budget: 'abc', expenses: [{ amount: 'x' }] }).spent, 0);
});
test('money formats and survives a bad currency', () => {
  assert.match(money(12.5, 'EUR'), /12[.,]50/);
  assert.match(money(3, 'NOPE'), /3\.00 NOPE/);
});
test('auto expenses: created for non-cancelled episodes, both kinds, deterministic ids', () => {
  const db = { settings: {}, conventions: [{ id: 'c', startDate: '2026-12-04' }], episodes: [{ id: 'e1', guest: 'Ann', conventionId: 'c', status: 2 }, { id: 'e2', guest: 'Bob', conventionId: 'c', status: 10 }, { id: 'e3', guest: 'Cy', status: 2 }] };
  assert.deepEqual(syncAutoExpenses(db), ['c']);
  const ex = db.conventions[0].expenses;
  assert.equal(ex.length, 2);
  assert.deepEqual(ex.map((x) => x.id).sort(), ['auto-e1-editing', 'auto-e1-marketing']);
  assert.ok(ex.every((x) => x.amount === 50 && x.date === '2026-12-04'));
  assert.deepEqual(syncAutoExpenses(db), []); // idempotent
});
test('auto expenses: defaults, overrides, cancelling removes, manual expenses kept, published keep costs', () => {
  const db = { settings: { autoCosts: { editing: 80, marketing: 20 } }, conventions: [{ id: 'c', expenses: [{ id: 'm', title: 'Train', amount: 30 }] }], episodes: [{ id: 'e', guest: 'Ann', conventionId: 'c', status: 8, autoCostOverrides: { marketing: 5 } }] };
  syncAutoExpenses(db);
  const by = (k) => db.conventions[0].expenses.find((x) => x.autoEpisodeExpense === k);
  assert.equal(by('editing').amount, 80); assert.equal(by('marketing').amount, 5);
  assert.equal(db.conventions[0].expenses.length, 3);
  db.episodes[0].status = 10;
  assert.deepEqual(syncAutoExpenses(db), ['c']);
  assert.deepEqual(db.conventions[0].expenses.map((x) => x.id), ['m']);
  assert.equal(autoAmount({ settings: {} }, { autoCostOverrides: { editing: '' } }, 'editing'), 50);
  assert.equal(autoAmount({ settings: {} }, { autoCostOverrides: { editing: -3 } }, 'editing'), 50);
});
test('auto expenses keep v4 ids and collapse duplicates', () => {
  const db = { settings: {}, conventions: [{ id: 'c', expenses: [
    { id: 'old1', episodeId: 'e', autoEpisodeExpense: 'editing', amount: 1 }, { id: 'old2', episodeId: 'e', autoEpisodeExpense: 'editing', amount: 1 }] }], episodes: [{ id: 'e', guest: 'A', conventionId: 'c', status: 0 }] };
  syncAutoExpenses(db);
  const ids = db.conventions[0].expenses.map((x) => x.id);
  assert.ok(ids.includes('old1')); assert.ok(!ids.includes('old2')); assert.equal(ids.length, 2);
});
test('yearly finance groups by convention start year', () => {
  const db = { conventions: [
    { id: 'a', name: 'A', startDate: '2025-03-01', budget: 100, expenses: [{ amount: 40, category: 'Travel' }, { amount: 10, category: 'travel' }] },
    { id: 'b', name: 'B', startDate: '2026-01-10', expenses: [{ amount: 5, category: 'Food' }] },
    { id: 'c', name: 'C', startDate: '', expenses: [{ amount: 999 }] }] };
  const y = yearlyFinance(db);
  assert.deepEqual(y.rows.map((r) => [r.year, r.spent]), [['2025', 50], ['2026', 5]]);
  assert.equal(y.totalSpent, 55); assert.equal(y.totalBudget, 100);
  assert.deepEqual(y.categories.map((c) => [c.name, c.value]), [['Travel', 50], ['Food', 5]]);
});
test('csv escapes quotes, commas and newlines', () => {
  const csv = expensesToCsv({ expenses: [{ date: '2026-01-01', title: 'Lunch, "big"', category: 'Food', amount: 12 }] });
  assert.equal(csv.split('\r\n')[1], '2026-01-01,"Lunch, ""big""",Food,12.00,');
});
test('categoryTotals sorts and merges case', () => assert.deepEqual(categoryTotals([{ category: 'editing', amount: 2 }, { category: 'Editing', amount: 3 }, { category: 'Food', amount: 9 }]).map((c) => c.name), ['Food', 'Editing']));

// ---- stats
test('interview stats follow v4 rules', () => {
  const db = {
    guests: [{ id: 'g1', name: 'A', projects: [{ title: 'Show', type: 'TV series' }, { title: 'Film X', type: 'Film' }] }, { id: 'g2', name: 'B', projects: [{ title: 'Show', type: 'TV series' }] }],
    conventions: [{ id: 'c1', name: 'Con' }, { id: 'c2', name: 'Empty' }],
    episodes: [
      { id: '1', guestId: 'g1', status: 8, conventionId: 'c1', date: '2026-02-10' },
      { id: '2', guestId: 'g2', status: 2, conventionId: 'c1', date: '2026-02-20' },
      { id: '3', guestId: 'g1', status: 10 },
      { id: '4', guestId: 'g2', status: 0, guestStatus: 'Invited' }],
  };
  const s = interviewStats(db);
  assert.equal(s.total, 2); assert.equal(s.published, 1); assert.equal(s.cancelled, 1);
  assert.equal(s.publishedRate, 50); assert.equal(s.cancellationRate, 25);
  assert.deepEqual(s.topProjects[0], { name: 'Show', value: 2 });
  assert.deepEqual(s.monthly, [{ month: '2026-02', value: 2 }]);
  assert.equal(s.conventions.length, 1); assert.equal(s.conventions[0].done, 1);
  assert.equal(s.conventionsCovered, 1);
  assert.deepEqual(s.repeatGuests.map((g) => g.name), ['B']); // A's second episode is cancelled, so it does not count
});
test('stats on an empty vault do not divide by zero', () => {
  const s = interviewStats({ guests: [], conventions: [], episodes: [] });
  assert.equal(s.publishedRate, 0); assert.equal(s.cancellationRate, 0); assert.deepEqual(s.monthly, []);
});
test('foldTail keeps colors within what can be validated', () => {
  const rows = [5, 4, 3, 2, 1, 1, 1].map((value, i) => ({ name: 'T' + i, value }));
  const f = foldTail(rows, 4);
  assert.equal(f.length, 5); assert.deepEqual(f[4], { name: 'Other', value: 3 });
  assert.equal(foldTail(rows.slice(0, 5), 4).length, 5);
});

// ---- dates and days
test('datesBetween and weekdays', () => {
  assert.deepEqual(datesBetween('2026-12-04', '2026-12-06'), ['2026-12-04', '2026-12-05', '2026-12-06']);
  assert.deepEqual(datesBetween('2026-12-04', ''), ['2026-12-04']);
  assert.deepEqual(datesBetween('', '2026-12-06'), []);
  assert.equal(datesBetween('2026-01-01', '2027-01-01').length, 14);
  assert.equal(weekdayName('2026-12-05'), 'Saturday');
  assert.ok(matchesDay('saturday', '2026-12-05')); assert.ok(matchesDay('2026-12-05', '2026-12-05')); assert.ok(!matchesDay('Sunday', '2026-12-05'));
});
test('interviewDate understands v4 weekday names and ignores out-of-range publication dates', () => {
  const c = { startDate: '2026-12-04', endDate: '2026-12-06' };
  assert.equal(interviewDate({ interviewDay: 'Saturday' }, c), '2026-12-05');
  assert.equal(interviewDate({ interviewDay: '2026-12-06' }, c), '2026-12-06');
  assert.equal(interviewDate({ date: '2026-12-04' }, c), '2026-12-04');
  assert.equal(interviewDate({ date: '2027-03-01' }, c), '');
  assert.equal(interviewDate({ date: '2027-03-01' }, null), '2027-03-01');
});
test('timeToMinutes', () => { assert.equal(timeToMinutes('14:30'), 870); assert.equal(timeToMinutes(''), null); assert.equal(timeToMinutes('soon'), null); });

// ---- games
test('starter prompts use saved credits only and honour custom examples', () => {
  const guest = { projects: [{ title: 'Show', role: 'Dan' }, { title: 'Film' }] };
  const p = starterPrompts('character', guest);
  assert.match(p[0], /character Dan from Show/); assert.doesNotMatch(p[1], /character undefined/);
  assert.ok(starterPrompts('character', {}).length >= 2);
  assert.deepEqual(starterPrompts('rank', guest, [{ id: 'rank', name: 'R', examples: ['mine'] }]), ['mine']);
  assert.deepEqual(starterPrompts('custom', guest), []);
  assert.equal(DEFAULT_GAME_FORMATS.length, 5);
});

// ---- youtube
test('ytId handles every common URL shape and rejects junk', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=5', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share']) assert.equal(ytId(u), 'dQw4w9WgXcQ', u);
  for (const u of ['', 'not a url', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=<script>']) assert.equal(ytId(u), '', u);
});
test('fetchVideos builds one batched request and maps results', async () => {
  let called;
  const fetchFn = async (url) => { called = url; return { ok: true, json: async () => ({ items: [{ id: 'abc12345', snippet: { title: 'T', thumbnails: { medium: { url: 'https://i/x.jpg' } } }, statistics: { viewCount: '10', likeCount: '2' }, contentDetails: { duration: 'PT1H2M3S' } }] }) }; };
  const out = await fetchVideos(['abc12345', 'abc12345', ''], 'KEY', { fetchFn, now: () => 0 });
  assert.match(called, /id=abc12345&key=KEY/); assert.equal(out.length, 1);
  assert.equal(out[0].views, 10); assert.equal(out[0].comments, 0);
  await assert.rejects(fetchVideos(['x'], ''), /API key/);
  await assert.rejects(fetchVideos(['abc12345'], 'K', { fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'quota' } }) }) }), /quota/);
  assert.equal(isoDurationToText('PT1H2M3S'), '1:02:03'); assert.equal(isoDurationToText('PT45S'), '0:45');
});
test('history snapshots and growth', () => {
  const day = 864e5;
  let v = withHistory(undefined, { views: 100 }, 0);
  v = withHistory(v, { views: 100 }, 1000);          // same views, too soon: no snapshot
  assert.equal(v.history.length, 1);
  v = withHistory(v, { views: 150 }, 2 * day);
  v = withHistory(v, { views: 400 }, 5 * day);
  assert.equal(v.history.length, 3);
  assert.equal(growth(v, 7 * day, 5 * day), 300);
  assert.equal(growth({ history: [{ at: 0, views: 1 }] }), null);
  for (let i = 0; i < 60; i++) v = withHistory(v, { views: 400 + i }, 6 * day + i);
  assert.equal(v.history.length, 40);
});

// ---- store: images, notes, derived costs, sync
test('v4 inline floor plan images move out of the synced data', async () => {
  const a = adapter({}, { venues: [{ id: 'v', name: 'Hall', floorPlans: [{ id: 'p', name: 'L1', data: 'data:image/jpeg;base64,AAAA', markers: [{ id: 'm', label: 'Panel', x: 10, y: 20 }] }] }] });
  const s = createStore(a); await s.load();
  const plan = s.get().venues[0].floorPlans[0];
  assert.equal(plan.data, undefined); assert.ok(plan.imageId);
  assert.equal(await s.getImage(plan.imageId), 'data:image/jpeg;base64,AAAA');
  assert.equal(plan.markers[0].label, 'Panel');
  assert.ok(!JSON.stringify(a.data.db).includes('base64'));
});
test('export with images and import restores them', async () => {
  const s1 = createStore(adapter()); await s1.load();
  const v = s1.add('venues', { name: 'V', floorPlans: [{ id: 'p', name: 'P', imageId: 'img1', markers: [] }] });
  await s1.putImage('img1', 'data:image/png;base64,BBBB');
  const text = await s1.exportWithImages();
  const s2 = createStore(adapter()); await s2.load();
  await s2.replaceAll(s2.parseImport(text));
  assert.equal(await s2.getImage('img1'), 'data:image/png;base64,BBBB');
  assert.equal(s2.get().venues[0].id, v.id); assert.equal(s2.get()._images, undefined);
});
test('quick notes from v4 get numeric timestamps; videos get updatedAt', () => {
  const db = normalize({ quickNotes: [{ id: 'n', text: 'hi', createdAt: '11/20/2026, 10:00:00 AM', updatedAt: 'garbage' }], youtubeVideos: [{ id: 'abc12345', fetchedAt: '2026-01-01T00:00:00Z' }] });
  assert.equal(typeof db.quickNotes[0].createdAt, 'number'); assert.equal(typeof db.quickNotes[0].updatedAt, 'number');
  assert.equal(db.youtubeVideos[0].updatedAt, Date.parse('2026-01-01T00:00:00Z'));
});
test('store keeps automatic costs in step with episodes and bumps the convention for sync', async () => {
  let t = 10; const s = createStore(adapter(), { now: () => ++t }); await s.load();
  const c = s.add('conventions', { name: 'Con', startDate: '2026-12-04' });
  const before = s.byId('conventions', c.id).updatedAt;
  const e = s.add('episodes', { guest: 'Ann', conventionId: c.id, status: 0 });
  assert.equal(s.byId('conventions', c.id).expenses.length, 2);
  assert.ok(s.byId('conventions', c.id).updatedAt > before);
  s.setSettings({ autoCosts: { editing: 10, marketing: 20 } });
  assert.deepEqual(s.byId('conventions', c.id).expenses.map((x) => x.amount).sort((a, b) => a - b), [10, 20]);
  s.update('episodes', e.id, { status: 10 });
  assert.equal(s.byId('conventions', c.id).expenses.length, 0);
});
test('upsert keeps the given id and replaces in place', async () => {
  const s = createStore(adapter()); await s.load();
  s.upsert('youtubeVideos', { id: 'abc12345', title: 'One', views: 1 });
  s.upsert('youtubeVideos', { id: 'abc12345', title: 'Two' });
  assert.equal(s.get().youtubeVideos.length, 1); assert.equal(s.get().youtubeVideos[0].title, 'Two'); assert.equal(s.get().youtubeVideos[0].views, 1);
});
test('quick notes and videos merge across devices', () => {
  const m = mergeDb({ quickNotes: [{ id: 'a', updatedAt: 1 }] }, { quickNotes: [{ id: 'b', updatedAt: 2 }], youtubeVideos: [{ id: 'v', updatedAt: 3 }] });
  assert.equal(m.quickNotes.length, 2); assert.equal(m.youtubeVideos.length, 1);
});

// ---- flight worker
test('flight worker validates input and trims the provider response', () => {
  assert.ok(validFlight('AF1234')); assert.ok(validFlight('U2123')); assert.ok(!validFlight('af 1234')); assert.ok(!validFlight('<script>')); assert.ok(!validFlight(''));
  assert.ok(validDate('2026-12-04')); assert.ok(!validDate('04/12/2026')); assert.ok(!validDate('2026-13-45'));
  const c = compact({ flight_status: 'scheduled', airline: { name: 'AF' }, flight: { iata: 'AF1' }, extra: 'dropped', departure: { gate: 'A1', delay: 5 } });
  assert.equal(c.departure.gate, 'A1'); assert.equal(c.extra, undefined); assert.equal(c.arrival.gate, ''); assert.equal(compact(null), null);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e.message || e).split('\n')[0]); process.exitCode = 1; }
}
console.log(`\n${passed}/${tests.length} passed`);
