// v5.2: duplicates, merge, photo framing, poster lineup, contact links.
import assert from 'node:assert/strict';
import { nameSimilarity, similarGuests, duplicatePairs, cropOf, telHref, mailHref } from '../js/text.js';
import { planMerge } from '../js/guestmerge.js';
import { lineup, cropRect } from '../js/poster.js';

let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok  ', name); n++; } catch (e) { failed++; console.log('FAIL', name, '\n', e.message); } };

t('names match ignoring case, accents, punctuation and word order', () => {
  assert.equal(nameSimilarity('Alfred Enoch', 'alfred  ENOCH'), 1);
  assert.equal(nameSimilarity('Enoch, Alfred', 'Alfred Enoch'), 1);
  assert.equal(nameSimilarity('Zoë Kravitz', 'Zoe Kravitz'), 1);
});
t('typos and short first names are caught, different people are not', () => {
  assert.ok(nameSimilarity('Alfred Enoch', 'Alfread Enoch') >= 0.78);
  assert.ok(nameSimilarity('Dan Radcliffe', 'Daniel Radcliffe') >= 0.78);
  assert.ok(nameSimilarity('Alfred Enoch', 'Alfred Molina') < 0.78);
  assert.ok(nameSimilarity('Tom Felton', 'Tom Hiddleston') < 0.78);
  assert.equal(nameSimilarity('', 'x'), 0);
});
t('similarGuests excludes the guest being edited and sorts by closeness', () => {
  const gs = [{ id: 1, name: 'Daniel Radcliffe' }, { id: 2, name: 'Daniel Radclif' }, { id: 3, name: 'Emma Watson' }];
  const r = similarGuests(gs, 'Daniel Radcliffe', { excludeId: 1 });
  assert.deepEqual(r.map((x) => x.guest.id), [2]);
});
t('duplicatePairs lists each look-alike pair once', () => {
  const gs = [{ id: 1, name: 'A B' }, { id: 2, name: 'B A' }, { id: 3, name: 'Zed Q' }];
  assert.equal(duplicatePairs(gs).length, 1);
});
t('merge keeps everything: credits, journal, notes, photo, links', () => {
  const keep = { id: 'k', name: 'Alfred Enoch', bio: 'short', notes: 'n1', projects: [{ id: 1, title: 'HP' }], journal: [{ id: 1, date: '2026-01-01', text: 'a' }], photo: '' };
  const drop = { id: 'd', name: 'Alfread Enoch', bio: 'a much longer bio', notes: 'n2', projects: [{ id: 2, title: 'hp' }, { id: 3, title: 'HTGAWM' }], journal: [{ id: 2, date: '2026-02-01', text: 'b' }], photo: 'https://x/y.jpg', photoX: 30, photoY: 40, photoZoom: 1.5 };
  const db = {
    guests: [keep, drop],
    episodes: [{ id: 'e1', guestId: 'd', guest: 'Alfread Enoch' }, { id: 'e2', guestId: 'z', guestIds: ['z', 'd', 'k'] }],
    conventions: [{ id: 'c1', guestIds: ['d', 'k'], panels: [{ id: 'p', guestIds: ['d'] }] }],
  };
  const p = planMerge(db, keep, drop);
  assert.deepEqual(p.patch.projects.map((x) => x.title), ['HP', 'HTGAWM']);
  assert.equal(p.patch.journal[0].text, 'b');
  assert.equal(p.patch.bio, 'a much longer bio');
  assert.equal(p.patch.notes, 'n1\n\nn2');
  assert.equal(p.patch.photo, 'https://x/y.jpg');
  assert.equal(p.patch.photoZoom, 1.5);
  assert.deepEqual(p.episodes.find((e) => e.id === 'e1'), { id: 'e1', guestId: 'k', guest: 'Alfred Enoch' });
  assert.deepEqual(p.episodes.find((e) => e.id === 'e2').guestIds, ['z', 'k']);
  assert.deepEqual(p.conventions[0].guestIds, ['k']);
  assert.deepEqual(p.panelFix[0].panels[0].guestIds, ['k']);
});
t('photo framing is clamped and defaults to centred', () => {
  assert.deepEqual(cropOf({}), { x: 50, y: 50, zoom: 1 });
  assert.deepEqual(cropOf({ photoX: 500, photoY: -4, photoZoom: 9 }), { x: 100, y: 0, zoom: 3 });
  assert.deepEqual(cropOf({ photoX: 'abc', photoZoom: '2' }), { x: 50, y: 50, zoom: 2 });
});
t('cropRect matches CSS cover plus zoom about the focus point', () => {
  const c = cropRect(400, 200, 100, {});
  assert.equal(c.height, 100); assert.equal(c.width, 200); assert.equal(c.left, -50); assert.equal(c.top, 0);
  const z = cropRect(400, 200, 100, { photoZoom: 2 });
  assert.equal(z.width, 400); assert.equal(z.left, -150);
  const edge = cropRect(400, 200, 100, { photoX: 0, photoZoom: 2 });
  assert.equal(edge.left, 0);
});
t('poster lineup gathers interview, panel and listed guests once, skips cancelled', () => {
  const db = { guests: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }],
    episodes: [{ id: 1, conventionId: 'x', guestId: 'a', status: 3 }, { id: 2, conventionId: 'x', guestId: 'd', status: 10 }, { id: 3, conventionId: 'y', guestId: 'c' }] };
  const c = { id: 'x', guestIds: ['b', 'a'], panels: [{ guestIds: ['b'] }] };
  assert.deepEqual(lineup(db, c).map((g) => g.id), ['b', 'a']);
});
t('phone and email links are only made from safe values', () => {
  assert.equal(telHref('+33 1 23 45 67 89'), 'tel:+33123456789');
  assert.equal(telHref('call me'), '');
  assert.equal(telHref('javascript:alert(1)'), '');
  assert.equal(mailHref(' a@b.co '), 'mailto:a@b.co');
  assert.equal(mailHref('a@b.co?cc=x y'), '');
  assert.equal(mailHref('nope'), '');
});

console.log(`\n${n}/${n + failed} passed`);
process.exit(failed ? 1 : 0);
