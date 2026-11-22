import { h, icon } from '../util.js';
import { store as s } from '../app-store.js';
import { navigate } from '../router.js';
import { pageHeader, empty, button, askForm } from '../ui.js';

export async function newVenue() {
  const v = await askForm({ title: 'New venue', submitLabel: 'Create venue', fields: [
    { name: 'name', label: 'Venue name', required: true },
    { name: 'address', label: 'Address', placeholder: 'Street, city' }] });
  if (!v) return null;
  const venue = s.add('venues', { name: v.name.trim(), address: v.address.trim(), rooms: [], floorPlans: [] });
  navigate('/venues/' + venue.id);
  return venue;
}

export const mapsUrl = (address) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);

export default function venues({ root }) {
  const db = s.get();
  root.append(pageHeader({
    title: 'Venues', subtitle: db.venues.length ? `${db.venues.length} saved` : 'Reusable places with room lists and floor plans',
    actions: button('New venue', { variant: 'primary', iconName: 'plus', onclick: () => newVenue() }),
  }));
  if (!db.venues.length) {
    root.append(empty({ title: 'No venues yet', text: 'Save a venue once, then reuse it for every convention held there. Add rooms and annotate floor plans.', action: button('New venue', { variant: 'primary', iconName: 'plus', onclick: () => newVenue() }) }));
    return;
  }
  root.append(h('ul', { class: 'rows' }, db.venues.slice().sort((a, b) => a.name.localeCompare(b.name)).map((v) => {
    const uses = db.conventions.filter((c) => c.venueId === v.id).length;
    return h('li', {}, h('a', { class: 'row', href: '#/venues/' + v.id },
      h('div', { class: 'avatar', style: { width: '40px', height: '40px' } }, icon('venues', 20)),
      h('div', { class: 'row-main' }, h('strong', {}, v.name), h('span', { class: 'muted' }, v.address || 'No address')),
      h('span', { class: 'pill' }, `${(v.rooms || []).length} rooms, ${(v.floorPlans || []).length} plans${uses ? `, ${uses} convention${uses === 1 ? '' : 's'}` : ''}`)));
  })));
}
