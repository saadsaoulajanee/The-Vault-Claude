// Cloudflare Worker: flight status proxy for AviationStack.
// Secrets: AVIATIONSTACK_KEY (required), VAULT_ACCESS_TOKEN (required, same value as the AI worker is fine).
// Variables: ALLOWED_ORIGIN (comma separated, for example https://you.github.io).
// Your API key never reaches the browser. Answers are cached for 5 minutes to save your quota.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const hits = new Map();

export const validFlight = (s) => /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(String(s || ''));
export const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));

export async function tokensMatch(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Keeps only what the app shows, so responses stay small. */
export function compact(item) {
  if (!item) return null;
  const side = (s = {}) => ({ airport: s.airport || '', iata: s.iata || '', terminal: s.terminal || '', gate: s.gate || '', delay: s.delay ?? null, scheduled: s.scheduled || '', estimated: s.estimated || '', actual: s.actual || '' });
  return { flight_status: item.flight_status || 'unknown', flight_date: item.flight_date || '', airline: item.airline?.name || '', flight: item.flight?.iata || '', departure: side(item.departure), arrival: side(item.arrival) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedList = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = origin && allowedList.includes(origin) ? origin : allowedList[0] || '';
    const headers = { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

    if (!allowedList.length) return reply({ error: 'Worker is missing the ALLOWED_ORIGIN setting' }, 500);
    if (origin && !allowedList.includes(origin)) return reply({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return reply({ error: 'GET required' }, 405);
    if (!(await tokensMatch((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.VAULT_ACCESS_TOKEN))) return reply({ error: 'Invalid access token' }, 401);
    if (!env.AVIATIONSTACK_KEY) return reply({ error: 'Worker is missing the AVIATIONSTACK_KEY secret' }, 500);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const slot = `${ip}:${Math.floor(Date.now() / WINDOW_MS)}`;
    const n = (hits.get(slot) || 0) + 1;
    hits.set(slot, n);
    if (hits.size > 500) for (const k of hits.keys()) if (k !== slot) hits.delete(k);
    if (n > MAX_REQUESTS) return reply({ error: 'Too many requests. Wait a minute and try again.' }, 429);

    const url = new URL(request.url);
    const flight = String(url.searchParams.get('flight_iata') || '').toUpperCase().replace(/\s+/g, '');
    const date = url.searchParams.get('flight_date') || '';
    if (!validFlight(flight)) return reply({ error: 'Enter a flight number like AF1234' }, 400);
    if (!validDate(date)) return reply({ error: 'Enter the flight date' }, 400);

    const cacheKey = new Request(`https://cache.invalid/flight/${flight}/${date}`);
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const hit = cache ? await cache.match(cacheKey) : null;
    if (hit) return reply(await hit.json());

    try {
      const api = `http://api.aviationstack.com/v1/flights?${new URLSearchParams({ access_key: env.AVIATIONSTACK_KEY, flight_iata: flight, flight_date: date, limit: '1' })}`;
      const r = await fetch(api);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) return reply({ error: j.error?.message || `Flight provider returned ${r.status}` }, 502);
      const out = { data: (j.data || []).slice(0, 1).map(compact) };
      if (cache && out.data.length) await cache.put(cacheKey, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=300' } }));
      return reply(out);
    } catch { return reply({ error: 'Could not reach the flight provider' }, 502); }
  },
};
