import { h, icon } from '../util.js';
import { pageHeader } from '../ui.js';

export const MORE = [
  ['/conventions', 'conventions', 'Conventions', 'Panels, trips, flights and packing'],
  ['/organizers', 'users', 'Organizers', 'Contacts for the people who run your conventions'],
  ['/venues', 'venues', 'Venues', 'Rooms and floor plans'],
  ['/budget', 'budget', 'Budget', 'Expenses and automatic episode costs'],
  ['/stats', 'stats', 'Stats', 'Interviews, finances and video performance'],
  ['/settings', 'settings', 'Settings', 'Appearance, sync, services and your data'],
];

export default function more({ root }) {
  root.append(pageHeader({ title: 'More' }), h('ul', { class: 'more-list' }, MORE.map(([href, ic, label, text]) => h('li', {},
    h('a', { href: '#' + href }, h('div', { class: 'avatar', style: { width: '44px', height: '44px' } }, icon(ic, 22)), h('div', {}, h('strong', {}, label), h('span', { class: 'muted' }, text)))))));
}
