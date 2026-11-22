// Money logic, pure. Automatic editing and marketing costs behave exactly as in v4:
// every non-cancelled episode linked to a convention carries both costs, an episode can
// override them, and published episodes keep theirs because the work was still done.
const KINDS = ['editing', 'marketing'];

export function money(n, currency = 'EUR') {
  const v = Number(n) || 0;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v); }
  catch { return v.toFixed(2) + ' ' + currency; }
}

export const amountOf = (x) => { const n = Number(x?.amount); return Number.isFinite(n) ? n : 0; };
export const totalSpent = (c) => (c?.expenses || []).reduce((s, x) => s + amountOf(x), 0);
export const categoryLabel = (s) => { const t = String(s || 'Other'); return t.charAt(0).toUpperCase() + t.slice(1); };

/** state: none (no budget), ok, near (85% or more used), over. */
export function budgetStatus(c) {
  const budget = Math.max(0, Number(c?.budget) || 0);
  const spent = totalSpent(c);
  const state = !budget ? 'none' : spent > budget ? 'over' : spent >= budget * 0.85 ? 'near' : 'ok';
  return { budget, spent, remaining: budget - spent, pct: budget ? Math.min(100, (spent / budget) * 100) : 0, state };
}

export function categoryTotals(expenses) {
  const map = new Map();
  for (const x of expenses || []) { const k = categoryLabel(x.category); map.set(k, (map.get(k) || 0) + amountOf(x)); }
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function autoAmount(db, ep, kind) {
  const o = ep.autoCostOverrides?.[kind];
  if (o !== null && o !== undefined && String(o) !== '' && Number.isFinite(Number(o)) && Number(o) >= 0) return Number(o);
  const cfg = db.settings?.autoCosts?.[kind];
  return cfg !== undefined && cfg !== '' && Number.isFinite(Number(cfg)) && Number(cfg) >= 0 ? Number(cfg) : 50;
}

const autoTitle = (kind, ep) => (kind === 'editing' ? 'Editing' : 'Marketing') + ' Episode: ' + (ep.guest || 'Unnamed guest');

/** Brings automatic expenses in line with episodes. Returns the ids of conventions that changed. */
export function syncAutoExpenses(db) {
  const changed = [];
  const byConv = new Map();
  for (const e of db.episodes || []) {
    if (!e?.id || !e.conventionId || Number(e.status) === 10) continue;
    if (!byConv.has(e.conventionId)) byConv.set(e.conventionId, []);
    byConv.get(e.conventionId).push(e);
  }
  for (const c of db.conventions || []) {
    const wanted = new Map();
    for (const e of byConv.get(c.id) || []) for (const k of KINDS) wanted.set(e.id + '|' + k, { e, k });
    const before = Array.isArray(c.expenses) ? c.expenses : [];
    const next = [];
    const seen = new Set();
    let dirty = false;
    for (const x of before) {
      if (!x.autoEpisodeExpense) { next.push(x); continue; }
      const key = x.episodeId + '|' + x.autoEpisodeExpense;
      if (!wanted.has(key) || seen.has(key)) { dirty = true; continue; }
      seen.add(key);
      const { e, k } = wanted.get(key);
      const want = { title: autoTitle(k, e), amount: autoAmount(db, e, k), date: c.startDate || '', category: k };
      let item = x;
      for (const [f, v] of Object.entries(want)) if (x[f] !== v) { if (item === x) item = { ...x }; item[f] = v; dirty = true; }
      if ('episodeStatus' in item) { if (item === x) item = { ...x }; delete item.episodeStatus; dirty = true; }
      next.push(item);
    }
    for (const [key, { e, k }] of wanted) {
      if (seen.has(key)) continue;
      next.push({ id: `auto-${e.id}-${k}`, episodeId: e.id, autoEpisodeExpense: k, title: autoTitle(k, e), amount: autoAmount(db, e, k), date: c.startDate || '', category: k });
      dirty = true;
    }
    if (dirty) { c.expenses = next; changed.push(c.id); }
  }
  return changed;
}

/** Conventions are grouped by the year they start, not by when an expense was typed in. */
export function yearlyFinance(db) {
  const years = new Map();
  for (const c of db.conventions || []) {
    const m = /^(\d{4})/.exec(String(c.startDate || '').trim());
    if (!m) continue;
    const y = years.get(m[1]) || { year: m[1], conventions: 0, budget: 0, spent: 0, expenseCount: 0, items: [], expenses: [] };
    years.set(m[1], y);
    const expenses = Array.isArray(c.expenses) ? c.expenses : [];
    const spent = expenses.reduce((s, x) => s + amountOf(x), 0);
    y.conventions++; y.budget += Number(c.budget) || 0; y.spent += spent; y.expenseCount += expenses.length;
    y.expenses.push(...expenses);
    y.items.push({ id: c.id, name: c.name || 'Unnamed convention', spent, budget: Number(c.budget) || 0, expenseCount: expenses.length });
  }
  const rows = [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
  for (const y of rows) y.items.sort((a, b) => b.spent - a.spent);
  return {
    rows,
    totalSpent: rows.reduce((s, y) => s + y.spent, 0),
    totalBudget: rows.reduce((s, y) => s + y.budget, 0),
    conventions: rows.reduce((s, y) => s + y.conventions, 0),
    categories: categoryTotals(rows.flatMap((y) => y.expenses)),
  };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function expensesToCsv(c) {
  const rows = [['Date', 'Description', 'Category', 'Amount', 'Automatic']];
  for (const x of [...(c.expenses || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    rows.push([x.date || '', x.title || '', categoryLabel(x.category), amountOf(x).toFixed(2), x.autoEpisodeExpense ? 'yes' : '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
