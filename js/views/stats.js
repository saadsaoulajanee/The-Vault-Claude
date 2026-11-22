import { h } from '../util.js';
import { store as s } from '../app-store.js';
import { render } from '../router.js';
import { interviewStats, foldTail } from '../stats.js';
import { yearlyFinance, money } from '../finance.js';
import { statTile, hbars, splitBars, columns, stackBar, tableView, chartCard } from '../charts.js';
import { pageHeader, empty, segmented, progress } from '../ui.js';
import { videosPanel } from './videos.js';

let tab = 'interviews';
const monthLabel = (m) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }); };

export default function stats({ root }) {
  const db = s.get();
  root.append(pageHeader({ title: 'Stats', subtitle: 'How your interviews, money and videos are doing' }));
  root.append(segmented([{ value: 'interviews', label: 'Interviews' }, { value: 'finances', label: 'Finances' }, { value: 'videos', label: 'Videos' }],
    tab, (v) => { tab = v; render({ keepScroll: true, announce: false }); }, 'Stats sections'));
  const body = h('div', {});
  root.append(body);
  if (tab === 'interviews') interviews(body, db);
  else if (tab === 'finances') finances(body, db);
  else return videosPanel(body);
}

function interviews(body, db) {
  const st = interviewStats(db);
  if (!st.total && !st.cancelled) {
    body.append(empty({ title: 'Nothing to measure yet', text: 'Add episodes with dates, and credits on your guests, and the charts fill in by themselves.', action: h('a', { class: 'btn primary', href: '#/episodes' }, 'Go to episodes') }));
    return;
  }
  body.append(h('div', { class: 'stat-row' },
    statTile('Interviews', st.total, 'Excludes cancelled and invited-only'),
    statTile('Published', st.published),
    statTile('Conventions covered', st.conventionsCovered),
    statTile('Cancelled', st.cancelled, 'Kept in your history')));

  body.append(chartCard('Publication schedule', 'Interviews grouped by their planned publication month.',
    st.monthly.length ? [columns(st.monthly.map((m) => ({ label: monthLabel(m.month), value: m.value }))), tableView(['Month', 'Interviews'], st.monthly.map((m) => [monthLabel(m.month), m.value]))]
      : h('p', { class: 'muted' }, 'Add a date to your episodes to see this chart.')));

  const two = h('div', { class: 'split2' });
  two.append(
    chartCard('Most featured shows and films', 'Projects shared by the most interviewed guests.',
      st.topProjects.length ? [hbars(st.topProjects.map((p) => ({ name: p.name, value: p.value })), { fmt: (v) => `${v} interview${v === 1 ? '' : 's'}` }), tableView(['Project', 'Interviews'], st.topProjects.map((p) => [p.name, p.value]))]
        : h('p', { class: 'muted' }, 'Add credits to your guest profiles.')),
    chartCard('Project mix', 'Credits by type.',
      st.typeMix.length ? [stackBar(foldTail(st.typeMix, 4), { fmt: (v) => `${v}` }), tableView(['Type', 'Credits'], st.typeMix.map((t) => [t.name, t.value]))]
        : h('p', { class: 'muted' }, 'Project types appear once guests have credits.')));
  body.append(two);

  body.append(chartCard('Convention comparison', 'Interview volume at each convention, with how many are published.',
    st.conventions.length ? [splitBars(st.conventions, { doneLabel: 'published', restLabel: 'not yet' }), tableView(['Convention', 'Published', 'Total'], st.conventions.map((c) => [c.name, c.done, c.total]))]
      : h('p', { class: 'muted' }, 'Link episodes to conventions to compare them.')));

  body.append(h('div', { class: 'split2' },
    chartCard('Rates', null,
      h('div', { class: 'rate' }, progress(st.publishedRate, 100, 'Publication rate'), h('p', {}, h('strong', {}, `${st.publishedRate}% published`), h('span', { class: 'muted' }, ' of non-cancelled interviews'))),
      h('div', { class: 'rate' }, progress(st.cancellationRate, 100, 'Cancellation rate'), h('p', {}, h('strong', {}, `${st.cancellationRate}% cancelled`), h('span', { class: 'muted' }, ' of all interviews')))),
    chartCard('Repeat guests', 'Guests who appear in more than one episode.',
      st.repeatGuests.length ? hbars(st.repeatGuests.map((g) => ({ name: g.name, value: g.value })), { fmt: (v) => `${v} episodes` }) : h('p', { class: 'muted' }, 'Nobody has appeared twice yet.'))));
}

function finances(body, db) {
  const cur = db.settings.currency || 'EUR';
  const fmt = (n) => money(n, cur);
  const y = yearlyFinance(db);
  if (!y.rows.length) {
    body.append(empty({ title: 'No yearly figures yet', text: 'Give your conventions a start date and record expenses in Budget. Conventions count towards the year they start.', action: h('a', { class: 'btn primary', href: '#/budget' }, 'Open budget') }));
    return;
  }
  body.append(h('div', { class: 'stat-row' }, statTile('Total spent', fmt(y.totalSpent)), statTile('Planned budgets', fmt(y.totalBudget)), statTile('Conventions tracked', y.conventions)));
  body.append(chartCard('Spending per year', 'Grouped by the year each convention starts, not by when an expense was entered.',
    hbars(y.rows.map((r) => ({
      name: r.year, value: r.spent,
      note: `${r.conventions} convention${r.conventions === 1 ? '' : 's'}, ${r.expenseCount} expense${r.expenseCount === 1 ? '' : 's'}` +
        (r.budget ? `, budget ${fmt(r.budget)}, ${r.spent <= r.budget ? fmt(r.budget - r.spent) + ' remaining' : fmt(r.spent - r.budget) + ' over'}` : ''),
    })), { fmt }),
    tableView(['Year', 'Spent', 'Budget'], y.rows.map((r) => [r.year, fmt(r.spent), r.budget ? fmt(r.budget) : 'None'])),
    ...y.rows.slice().reverse().map((r) => h('details', { class: 'year' }, h('summary', {}, h('span', {}, `${r.year} breakdown`), h('b', {}, fmt(r.spent))),
      h('ul', { class: 'rows' }, r.items.map((i) => h('li', {}, h('a', { class: 'row', href: '#/conventions/' + i.id },
        h('div', { class: 'row-main' }, h('strong', {}, i.name), h('span', { class: 'muted' }, `${i.expenseCount} expense${i.expenseCount === 1 ? '' : 's'}${i.budget ? ', budget ' + fmt(i.budget) : ''}`)), h('b', {}, fmt(i.spent))))))))));
  if (y.categories.length) body.append(chartCard('Categories across all years', null, hbars(y.categories, { fmt, color: 1 }), tableView(['Category', 'Total'], y.categories.map((c) => [c.name, fmt(c.value)]))));
}
