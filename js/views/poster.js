// Poster tab of a convention: preview the lineup, hide guests, download a PNG or print.
import { h, fmtDate, safeUrl } from '../util.js';
import { store as s } from '../app-store.js';
import { button, avatar, toast } from '../ui.js';
import { initials } from '../text.js';
import { lineup, drawPoster } from '../poster.js';
import { render } from '../router.js';

const slug = (t) => String(t || 'poster').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'poster';

export function posterPanel(c) {
  const db = s.get();
  const all = lineup(db, c);
  const hidden = new Set(c.posterHidden || []);
  const shown = all.filter((g) => !hidden.has(g.id));
  const venue = db.venues.find((v) => v.id === c.venueId);
  const dates = c.startDate ? (c.endDate && c.endDate !== c.startDate ? `${fmtDate(c.startDate, { day: 'numeric', month: 'short' })} to ${fmtDate(c.endDate)}` : fmtDate(c.startDate)) : '';
  const info = { title: c.name, dates, place: venue?.name || '', guests: shown, initials, safe: (u) => !!safeUrl(u) };

  const wrap = h('div', {});
  if (!all.length) {
    wrap.append(h('p', { class: 'muted pad' }, 'The poster fills itself with the guests of the interviews and panels at this convention. Add one to begin.'));
    return wrap;
  }
  wrap.append(h('div', { class: 'poster-card' },
    h('h3', {}, c.name), h('p', { class: 'poster-sub' }, [dates, venue?.name].filter(Boolean).join('  |  ')),
    h('ul', { class: 'poster-grid' }, shown.map((g) => h('li', {}, avatar(g, 84), h('span', {}, g.name))))));
  const busy = { v: false };
  wrap.append(h('div', { class: 'panel-actions' },
    button('Download PNG', { variant: 'primary', iconName: 'download', disabled: !shown.length, onclick: async (e) => {
      const btn = e.currentTarget;
      if (busy.v) return; busy.v = true; btn.disabled = true;
      try {
        const canvas = await drawPoster(document.createElement('canvas'), info);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const a = h('a', { href: URL.createObjectURL(blob), download: `${slug(c.name)}-poster.png` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      } catch { toast('Could not make the poster image. Try Print instead.'); }
      busy.v = false; btn.disabled = false;
    } }),
    button('Print', { variant: 'ghost', iconName: 'print', onclick: () => window.print() })));
  wrap.append(h('h3', { style: { marginTop: '18px' } }, 'On the poster'),
    h('ul', { class: 'checks' }, all.map((g) => h('li', {}, h('label', {},
      h('input', { type: 'checkbox', checked: !hidden.has(g.id), onchange: (e) => {
        const next = new Set(s.byId('conventions', c.id).posterHidden || []);
        e.target.checked ? next.delete(g.id) : next.add(g.id);
        s.update('conventions', c.id, { posterHidden: [...next] });
      } }), h('span', {}, g.name))))),
    h('p', { class: 'hint' }, 'Photos come from each guest’s photo link. If a photo’s host does not allow reuse, the PNG shows initials for that guest.'));
  return wrap;
}
