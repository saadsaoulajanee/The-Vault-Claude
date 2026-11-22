// Interview statistics, pure. Same definitions as v4: cancelled and invited-only episodes are excluded
// from "interviews"; the publication chart groups by planned publication month.
import { episodeGuestIds } from './model.js';

const PLANNED = ['Interview planned', 'Interviewed', 'Published'];

/** Episodes created in v5 have no guestStatus and always count. v4 "invited only" ones do not. */
export const isInterview = (e) => Number(e.status) !== 10 && (Number(e.status) === 8 || !e.guestStatus || PLANNED.includes(e.guestStatus));

export function interviewStats(db) {
  const active = db.episodes.filter(isInterview);
  const published = active.filter((e) => Number(e.status) === 8);
  const cancelled = db.episodes.filter((e) => Number(e.status) === 10).length;
  const guestOf = (e) => episodeGuestIds(e).map((id) => db.guests.find((g) => g.id === id)).filter(Boolean);

  const projects = new Map();
  const types = new Map();
  for (const e of active) for (const g of guestOf(e)) for (const p of g.projects || []) {
    const title = String(p.title || '').trim();
    if (!title) continue;
    projects.set(title, (projects.get(title) || 0) + 1);
    const t = p.type || 'Other';
    types.set(t, (types.get(t) || 0) + 1);
  }
  const topProjects = [...projects].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10);
  const typeMix = [...types].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const conventions = db.conventions.map((c) => {
    const total = active.filter((e) => e.conventionId === c.id).length;
    const done = published.filter((e) => e.conventionId === c.id).length;
    return { id: c.id, name: c.name, total, done };
  }).filter((c) => c.total).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const months = new Map();
  for (const e of active) { const m = String(e.date || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) months.set(m, (months.get(m) || 0) + 1); }
  const monthly = [...months].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, value]) => ({ month, value }));

  const counts = new Map();
  for (const e of db.episodes.filter((x) => Number(x.status) !== 10)) for (const id of episodeGuestIds(e)) counts.set(id, (counts.get(id) || 0) + 1);
  const repeatGuests = [...counts].map(([id, value]) => ({ name: db.guests.find((g) => g.id === id)?.name || 'Unknown', value }))
    .filter((g) => g.value > 1).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10);

  return {
    total: active.length, published: published.length, cancelled,
    conventionsCovered: new Set(active.map((e) => e.conventionId).filter(Boolean)).size,
    publishedRate: active.length ? Math.round((published.length / active.length) * 100) : 0,
    cancellationRate: db.episodes.length ? Math.round((cancelled / db.episodes.length) * 100) : 0,
    topProjects, typeMix, conventions, monthly, repeatGuests,
  };
}

/** Folds a long tail into "Other" so a chart never needs more colors than it can validate. */
export function foldTail(rows, keep = 4) {
  if (rows.length <= keep + 1) return rows;
  const head = rows.slice(0, keep);
  return [...head, { name: 'Other', value: rows.slice(keep).reduce((s, r) => s + r.value, 0) }];
}
