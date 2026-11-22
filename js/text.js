// Pure text helpers (no DOM) so they can be unit-tested in Node.

/** Normalise for comparison: lowercase, strip accents and punctuation. */
export const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Returns the trimmed, non-empty items whose normalised form is new. */
export function dedupe(list, existing = []) {
  const seen = new Set(existing.map(norm));
  const out = [];
  for (const item of list) {
    const text = String(item ?? '').trim();
    const key = norm(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Split pasted text into lines, removing list markers like "1." "-" "•". */
export function splitLines(text) {
  return String(text ?? '').split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*•]\s+)/, '').trim())
    .filter(Boolean);
}

/** True for lines ending in a question mark in Latin, Arabic or CJK punctuation. */
export const isQuestion = (line) => /[?？؟]["'”’)\]]*\s*$/.test(String(line ?? '').trim());

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Offline question ideas that never assume plot facts. */
export function ideasFromCredit(title, role, guestName) {
  const t = String(title || '').trim();
  if (!t) return [];
  const r = String(role || '').trim();
  const ideas = [
    `What drew you to ${t} when it first came to you?`,
    `What is a moment from making ${t} that you still think about?`,
    `How did working on ${t} change the way you approach your next job?`,
    `What would surprise fans most about making ${t}?`,
  ];
  if (r) ideas.splice(1, 0, `What did you bring of yourself to ${r} in ${t}?`);
  if (guestName) ideas.push(`Looking back at ${t}, what would you tell the ${guestName} who started it?`);
  return ideas;
}

export function crossIdeas(a, b) {
  if (!a || !b || a === b) return [];
  return [
    `How does working on ${a} compare with working on ${b}?`,
    `What did ${a} teach you that you used on ${b}?`,
    `If ${a} and ${b} shared a set for a day, what would happen?`,
  ];
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 0 to 1. Ignores case, accents, punctuation and word order ("Enoch, Alfred" matches "Alfred Enoch"). */
export function nameSimilarity(a, b) {
  const sort = (x) => norm(x).split(' ').filter(Boolean).sort().join(' ');
  const x = sort(a), y = sort(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ratio = 1 - editDistance(x, y) / Math.max(x.length, y.length);
  // "Dan Radcliffe" vs "Daniel Jacob Radcliffe": same surname and a matching first name start.
  const tx = norm(a).split(' ').filter(Boolean), ty = norm(b).split(' ').filter(Boolean);
  const sameLast = tx.length > 1 && ty.length > 1 && tx[tx.length - 1] === ty[ty.length - 1];
  const firstAlike = sameLast && (tx[0].startsWith(ty[0]) || ty[0].startsWith(tx[0])) && Math.min(tx[0].length, ty[0].length) >= 3;
  return Math.max(ratio, firstAlike ? 0.85 : 0);
}

/** Guests whose names look like `name`, most similar first. */
export function similarGuests(guests, name, { excludeId = '', threshold = 0.78 } = {}) {
  return guests.filter((g) => g.id !== excludeId)
    .map((g) => ({ guest: g, score: nameSimilarity(g.name, name) }))
    .filter((x) => x.score >= threshold).sort((p, q) => q.score - p.score);
}

/** Every pair of guests that look alike, for the "find duplicates" tool. */
export function duplicatePairs(guests, threshold = 0.78) {
  const out = [];
  for (let i = 0; i < guests.length; i++) for (let j = i + 1; j < guests.length; j++) {
    const score = nameSimilarity(guests[i].name, guests[j].name);
    if (score >= threshold) out.push({ a: guests[i], b: guests[j], score });
  }
  return out.sort((p, q) => q.score - p.score);
}

/** Photo framing saved on a guest: focus point in percent and zoom. Same field names as version 4. */
export function cropOf(person) {
  const n = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  return { x: n(person?.photoX, 50, 0, 100), y: n(person?.photoY, 50, 0, 100), zoom: n(person?.photoZoom, 1, 1, 3) };
}


export const telHref = (p) => { const d = String(p || '').replace(/[^\d+]/g, ''); return d.replace(/\D/g, '').length >= 5 ? 'tel:' + d : ''; };
export const mailHref = (e) => (/^[^\s@<>"?&]+@[^\s@<>"?&]+\.[^\s@<>"?&]+$/.test(String(e || '').trim()) ? 'mailto:' + String(e).trim() : '');
