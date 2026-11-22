import { h, fmtDate, icon, todayIso } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { render } from '../router.js';
import { money, budgetStatus, categoryTotals, categoryLabel, expensesToCsv, amountOf } from '../finance.js';
import { EXPENSE_CATEGORIES } from '../model.js';
import { hbars, tableView, statTile } from '../charts.js';
import { pageHeader, empty, button, iconButton, askForm, toast } from '../ui.js';

let selectedId = '';

const STATE_TEXT = {
  none: 'No budget limit set',
  ok: 'On track',
  near: 'Close to the limit',
  over: 'Over budget',
};

export default function budget({ root }) {
  const db = s.get();
  const cur = db.settings.currency || 'EUR';
  const fmt = (n) => money(n, cur);
  const all = db.conventions.slice().sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));

  root.append(pageHeader({ title: 'Budget', subtitle: 'One convention at a time' }));
  if (!all.length) {
    root.append(empty({ title: 'No conventions yet', text: 'Create a convention first, then track what it costs here.', action: h('a', { class: 'btn primary', href: '#/conventions' }, 'Go to conventions') }));
    return;
  }
  if (!all.some((c) => c.id === selectedId)) selectedId = (all.find((c) => (c.endDate || c.startDate || '') >= todayIso()) || all[0]).id;
  const c = all.find((x) => x.id === selectedId);
  const st = budgetStatus(c);
  const rows = (c.expenses || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  root.append(h('div', { class: 'toolbar' }, h('div', { class: 'field' }, h('label', { for: 'bsel' }, 'Convention'),
    h('select', { id: 'bsel', value: selectedId, onchange: (e) => { selectedId = e.target.value; render({ keepScroll: true, announce: false }); } },
      all.map((x) => h('option', { value: x.id }, x.name))))));

  // Summary
  root.append(h('section', { class: 'panel block' },
    h('div', { class: 'page-title' }, h('div', {}, h('h2', {}, c.name), h('p', { class: 'muted' }, `${rows.length} expense${rows.length === 1 ? '' : 's'}${c.startDate ? ', starts ' + fmtDate(c.startDate) : ''}`)),
      h('div', { class: 'page-actions' },
        button('Add expense', { variant: 'primary', iconName: 'plus', onclick: () => addExpense(c) }),
        button('Download CSV', { iconName: 'download', disabled: !rows.length, onclick: () => download(c) }))),
    h('div', { class: 'budget-sum' },
      statTile('Spent', fmt(st.spent)),
      statTile(st.budget ? (st.remaining < 0 ? 'Over by' : 'Remaining') : 'Budget limit', st.budget ? fmt(Math.abs(st.remaining)) : 'Not set')),
    st.budget ? h('div', { class: 'budget-meter', 'data-state': st.state, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(st.pct), 'aria-label': 'Budget used' }, h('i', { style: { width: st.pct + '%' } })) : null,
    h('p', { class: 'status-line', 'data-state': st.state }, st.state === 'over' ? icon('x', 18) : st.state === 'none' ? null : icon('check', 18),
      STATE_TEXT[st.state] + (st.budget ? `, ${Math.round((st.spent / st.budget) * 100)}% used` : '')),
    h('div', { class: 'field', style: { marginTop: '16px', maxWidth: '260px' } }, h('label', { for: 'limit' }, `Budget limit (${cur})`),
      h('input', { id: 'limit', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: st.budget || '', placeholder: 'For example 500',
        onchange: (e) => s.update('conventions', c.id, { budget: Math.max(0, Number(e.target.value) || 0) }) }))));

  // Where the money went
  const cats = categoryTotals(c.expenses);
  if (cats.length) {
    root.append(h('section', { class: 'panel block chart' }, h('h2', {}, 'Where it went'),
      hbars(cats.map((x) => ({ name: x.name, value: x.value })), { fmt }),
      tableView(['Category', 'Amount'], cats.map((x) => [x.name, fmt(x.value)]))));
  }

  // Automatic costs
  const eps = db.episodes.filter((e) => e.conventionId === c.id && Number(e.status) !== 10);
  const ac = db.settings.autoCosts || {};
  const costInput = (kind, ep) => h('input', {
    type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': `${kind} cost for ${ep ? ep.guest : 'every episode'}`,
    value: ep ? (ep.autoCostOverrides?.[kind] ?? '') : (ac[kind] ?? 50), placeholder: ep ? String(ac[kind] ?? 50) : '50',
    onchange: (e) => {
      const raw = e.target.value;
      if (!ep) { s.setSettings({ autoCosts: { editing: ac.editing ?? 50, marketing: ac.marketing ?? 50, [kind]: raw === '' ? 50 : Math.max(0, Number(raw) || 0) } }); return; }
      const overrides = { ...(ep.autoCostOverrides || {}) };
      raw === '' ? delete overrides[kind] : (overrides[kind] = Math.max(0, Number(raw) || 0));
      s.update('episodes', ep.id, { autoCostOverrides: overrides });
    },
  });
  root.append(h('section', { class: 'panel block' }, h('h2', {}, 'Automatic episode costs'),
    h('p', { class: 'muted' }, 'Every episode at this convention adds an editing and a marketing cost. Set the default for all of them, then override single episodes. Cancelled episodes add nothing.'),
    h('div', { class: 'cost-grid', style: { marginTop: '14px' } },
      h('span', { class: 'h' }, ''), h('span', { class: 'h' }, 'Editing'), h('span', { class: 'h' }, 'Marketing'),
      h('span', { class: 'name' }, h('strong', {}, 'Default for all episodes')), costInput('editing'), costInput('marketing'),
      ...eps.flatMap((ep) => [h('span', { class: 'name' }, ep.guest || 'Unnamed guest'), costInput('editing', ep), costInput('marketing', ep)]))));

  // Expenses
  root.append(h('section', { class: 'block' }, h('h2', {}, 'Expenses'),
    rows.length ? h('ul', { class: 'rows' }, rows.map((x) => h('li', { class: 'exp' },
      h('div', { class: 'grow' }, h('span', {}, h('strong', {}, x.title || 'Untitled'), x.autoEpisodeExpense && h('span', { class: 'badge' }, 'Automatic')),
        h('span', { class: 'muted' }, [categoryLabel(x.category), fmtDate(x.date)].filter(Boolean).join(', '))),
      h('b', {}, fmt(amountOf(x))),
      x.autoEpisodeExpense ? null : iconButton('trash', 'Delete expense', () => {
        const before = (s.byId('conventions', c.id).expenses || []);
        s.update('conventions', c.id, { expenses: before.filter((e) => e.id !== x.id) });
        toast('Expense deleted', { label: 'Undo', onAction: () => s.update('conventions', c.id, { expenses: before }) });
      })))) : empty({ title: 'No expenses yet', text: 'Add the first one, or add an episode to this convention to see automatic costs.' })));
}

async function addExpense(c) {
  const v = await askForm({
    title: 'Add expense', submitLabel: 'Save expense',
    fields: [
      { name: 'title', label: 'Description', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true, step: '0.01', min: '0', inputmode: 'decimal' },
      { name: 'date', label: 'Date', type: 'date', value: todayIso() },
      { name: 'category', label: 'Category', type: 'select', value: 'Other', options: EXPENSE_CATEGORIES.map((x) => ({ value: x, label: x })) },
    ],
  });
  if (!v) return;
  const amount = Number(v.amount);
  if (!Number.isFinite(amount) || amount < 0) { toast('Enter an amount of zero or more'); return; }
  s.update('conventions', c.id, (cur) => ({ expenses: [...(cur.expenses || []), { id: uid(), title: v.title.trim(), amount, date: v.date, category: v.category }] }));
}

function download(c) {
  const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + expensesToCsv(c)], { type: 'text/csv;charset=utf-8' })), download: `${c.name.replace(/[^\w-]+/g, '-')}-expenses.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
