// Flight status client (no DOM). Talks to your own Worker, never to the provider directly.
export const normalizeFlight = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
export const validFlight = (s) => /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(normalizeFlight(s));

export async function fetchFlightStatus({ url, token, number, date, fetchFn = fetch }) {
  if (!url) throw new Error('Add your flight service address in Settings first.');
  if (!token) throw new Error('Enter your access token in Settings first.');
  const flight = normalizeFlight(number);
  if (!validFlight(flight)) throw new Error('Enter a flight number like AF1234.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Enter the flight date.');
  const res = await fetchFn(`${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams({ flight_iata: flight, flight_date: date })}`, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `The flight service returned an error (${res.status}).`);
  const found = (body.data || [])[0];
  if (!found) throw new Error('No matching flight found. Check the number and date. Some plans only cover flights close to today.');
  return found;
}

/** Plain-text lines to show under the status pill. */
export function describeFlight(f) {
  const d = f.departure || {}, a = f.arrival || {};
  const t = (iso) => (iso ? String(iso).slice(11, 16) : '');
  return [
    [d.airport && `From ${d.airport}`, a.airport && `to ${a.airport}`].filter(Boolean).join(' '),
    [d.terminal && `Terminal ${d.terminal}`, d.gate && `Gate ${d.gate}`].filter(Boolean).join(', '),
    d.delay ? `Departure delayed ${d.delay} min` : '',
    d.estimated || d.scheduled ? `Departs ${t(d.estimated || d.scheduled)}` : '',
    a.estimated || a.scheduled ? `Arrives ${t(a.estimated || a.scheduled)}` : '',
  ].filter(Boolean);
}
