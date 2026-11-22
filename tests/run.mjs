// Run with: node tests/run.mjs   (Node 20+, no dependencies)
import assert from 'node:assert/strict';
import { mergeDb, canonical } from '../js/merge.js';
import { createStore, normalize } from '../js/store.js';
import { norm, dedupe, splitLines, isQuestion, initials } from '../js/text.js';
import { parseQuestions, tokensMatch } from '../worker/ai-questions-worker.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const memoryAdapter = (initial = {}, legacy = null) => {
  const data = { ...initial };
  return { data, get: async (k) => structuredClone(data[k] ?? null), set: async (k, v) => { data[k] = structuredClone(v); }, legacy: async () => legacy };
};

// ---- text
test('norm ignores case, accents and punctuation', () => assert.equal(norm('  Élodie, GUEST!! '), 'elodie guest'));
test('dedupe drops repeats and blanks, keeps order', () =>
  assert.deepEqual(dedupe(['A?', 'a?', ' ', 'B?', 'Á?'], ['b?']), ['A?']));
test('splitLines strips list markers', () =>
  assert.deepEqual(splitLines('1. One?\n2) Two?\n- Three?\n• Four?\n\n'), ['One?', 'Two?', 'Three?', 'Four?']));
test('isQuestion accepts Latin, CJK and Arabic marks', () => {
  assert.ok(isQuestion('Why?')); assert.ok(isQuestion('なぜ？')); assert.ok(isQuestion('لماذا؟')); assert.ok(isQuestion('He said "why?"'));
  assert.ok(!isQuestion('Tell me about it.'));
});
test('initials', () => { assert.equal(initials('Alfred Enoch'), 'AE'); assert.equal(initials('Cher'), 'C'); assert.equal(initials(''), '?'); });

// ---- merge
test('merge keeps both sides additions', () => {
  const m = mergeDb({ episodes: [{ id: 'a', updatedAt: 1 }] }, { episodes: [{ id: 'b', updatedAt: 1 }] });
  assert.deepEqual(m.episodes.map((e) => e.id).sort(), ['a', 'b']);
});
test('merge picks the newer edit per record', () => {
  const m = mergeDb({ episodes: [{ id: 'a', notes: 'old', updatedAt: 5 }] }, { episodes: [{ id: 'a', notes: 'new', updatedAt: 9 }] });
  assert.equal(m.episodes[0].notes, 'new');
  const m2 = mergeDb({ episodes: [{ id: 'a', notes: 'mine', updatedAt: 9 }] }, { episodes: [{ id: 'a', notes: 'theirs', updatedAt: 5 }] });
  assert.equal(m2.episodes[0].notes, 'mine');
});
test('merge: a delete wins over an older copy, but not over a newer edit', () => {
  const del = mergeDb({ episodes: [], _deleted: { a: 10 } }, { episodes: [{ id: 'a', updatedAt: 5 }] });
  assert.equal(del.episodes.length, 0);
  const edit = mergeDb({ episodes: [], _deleted: { a: 10 } }, { episodes: [{ id: 'a', updatedAt: 20 }] });
  assert.equal(edit.episodes.length, 1);
});
test('merge is idempotent and order independent by content', () => {
  const a = { episodes: [{ id: 'x', updatedAt: 3 }], guests: [{ id: 'g', updatedAt: 1 }], settings: { theme: 'dark' } };
  const b = { episodes: [{ id: 'y', updatedAt: 2 }], guests: [{ id: 'g', updatedAt: 4, name: 'N' }] };
  const ab = mergeDb(a, b), ba = mergeDb(b, a);
  const sorted = (d) => ({ ...d, episodes: [...d.episodes].sort((p, q) => p.id.localeCompare(q.id)) });
  assert.equal(canonical(sorted(ab)), canonical(sorted(ba)));
  assert.equal(canonical(mergeDb(ab, ab)), canonical(ab));
});
test('canonical ignores key order', () => assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 })));

// ---- store
test('normalize repairs old data, links guests, drops API keys', () => {
  const db = normalize({ episodes: [{ id: 'e1', guest: 'Alfred Enoch' }, { id: 'e2', guest: ' alfred  enoch ' }, null, {}], settings: { youtubeApiKey: 'SECRET', theme: 'dark' } });
  assert.equal(db.episodes.length, 2);
  assert.equal(db.guests.length, 1);
  assert.equal(db.episodes[0].guestId, db.episodes[1].guestId);
  assert.equal(db.settings.youtubeApiKey, undefined);
  assert.equal(db.settings.theme, 'dark');
  assert.ok(db.checklistTemplate.length > 10);
});
test('store imports the previous version once, with a backup', async () => {
  const a = memoryAdapter({}, { episodes: [{ id: 'e', guest: 'Ann', number: 3 }] });
  const s = createStore(a);
  await s.load();
  assert.equal(s.get().episodes.length, 1);
  assert.equal((await s.backups()).length, 1);
  assert.equal(a.data.db.episodes[0].id, 'e');
});
test('add, update, remove, undo', async () => {
  let t = 100; const s = createStore(memoryAdapter(), { now: () => ++t });
  await s.load();
  const ep = s.add('episodes', { guest: 'A', questions: [] });
  s.update('episodes', ep.id, { notes: 'hi' });
  assert.equal(s.byId('episodes', ep.id).notes, 'hi');
  const gone = s.remove('episodes', ep.id);
  assert.equal(s.get().episodes.length, 0);
  assert.ok(s.get()._deleted[ep.id]);
  s.restore('episodes', gone);
  assert.equal(s.get().episodes.length, 1);
  assert.equal(s.get()._deleted[ep.id], undefined);
  await s.flush();
});
test('unknown collections throw instead of corrupting data', async () => {
  const s = createStore(memoryAdapter()); await s.load();
  assert.throws(() => s.add('nope', {}), /Unknown collection/);
});
test('backups keep only the latest five', async () => {
  const s = createStore(memoryAdapter()); await s.load();
  for (let i = 0; i < 8; i++) await s.backup('n' + i);
  const list = await s.backups();
  assert.equal(list.length, 5); assert.equal(list[0].reason, 'n7');
});
test('restoreBackup brings data back and backs up first', async () => {
  const s = createStore(memoryAdapter()); await s.load();
  s.add('guests', { name: 'Keep me' }); await s.backup('snap');
  s.remove('guests', s.get().guests[0].id);
  assert.equal(s.get().guests.length, 0);
  const idx = (await s.backups()).findIndex((b) => b.reason === 'snap');
  await s.restoreBackup(idx);
  assert.equal(s.get().guests[0].name, 'Keep me');
});
test('parseImport rejects bad files with clear messages', async () => {
  const s = createStore(memoryAdapter()); await s.load();
  assert.throws(() => s.parseImport('{oops'), /not valid JSON/);
  assert.throws(() => s.parseImport('[]'), /not a Vault export/);
  assert.throws(() => s.parseImport('{"hello":1}'), /No episodes/);
  assert.ok(s.parseImport('{"episodes":[]}'));
});
test('a failing save reports an error instead of throwing', async () => {
  const bad = { get: async () => null, set: async () => { throw new Error('quota'); } };
  const s = createStore(bad); await s.load();
  let err = null; s.on((t, d) => { if (t === 'error') err = d; });
  await s.flush();
  assert.equal(err?.message, 'quota');
});

// ---- worker
test('worker parses questions: numbering, duplicates, other languages, avoid list', () => {
  const raw = '1. What drew you in?\n- what drew you in?\nNot a question.\n3) どうして？\nلماذا؟\nAlready asked?';
  assert.deepEqual(parseQuestions(raw, 10, ['Already asked?']), ['What drew you in?', 'どうして？', 'لماذا؟']);
  assert.equal(parseQuestions('A?\nB?\nC?', 2).length, 2);
});
test('worker compares tokens safely', async () => {
  assert.ok(await tokensMatch('abc', 'abc'));
  assert.ok(!(await tokensMatch('abc', 'abd')));
  assert.ok(!(await tokensMatch('', 'abc')));
  assert.ok(!(await tokensMatch('abc', undefined)));
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e.message || e).split('\n')[0]); process.exitCode = 1; }
}
console.log(`\n${passed}/${tests.length} passed`);
