// Cloudflare Worker: question generation proxy (version 3).
// Secrets: VAULT_ACCESS_TOKEN (required), GROQ_API_KEY and/or OPENROUTER_API_KEY.
// Variables: ALLOWED_ORIGIN (comma separated, for example https://you.github.io), GROQ_MODEL.
// Optional: bind a KV namespace called RATE_LIMIT for limits that hold across Worker instances.

const MAX_PER_REQUEST = 100;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const memoryHits = new Map();

/** Compares in constant time so the token cannot be guessed from response timing. */
export async function tokensMatch(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const key = (s) => String(s).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Turns raw model text into clean, unique questions. Handles ?, full-width ？ and Arabic ؟. */
export function parseQuestions(raw, count, avoid = []) {
  const seen = new Set(avoid.map(key));
  const out = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const q = line.trim().replace(/^\s*(?:\d+[.)]\s*|[-*•]\s+)/, '').trim();
    if (!/[?？؟]["'”’)\]]*$/.test(q)) continue;
    const k = key(q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
    if (out.length >= count) break;
  }
  return out;
}

async function limited(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const slot = Math.floor(Date.now() / WINDOW_MS);
  if (env.RATE_LIMIT) {
    const k = `rl:${ip}:${slot}`;
    const n = Number(await env.RATE_LIMIT.get(k)) || 0;
    if (n >= MAX_REQUESTS) return true;
    await env.RATE_LIMIT.put(k, String(n + 1), { expirationTtl: 120 });
    return false;
  }
  const k = `${ip}:${slot}`;
  const n = (memoryHits.get(k) || 0) + 1;
  memoryHits.set(k, n);
  if (memoryHits.size > 500) for (const old of memoryHits.keys()) if (!old.endsWith(':' + slot)) memoryHits.delete(old);
  return n > MAX_REQUESTS;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedList = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = origin && allowedList.includes(origin) ? origin : allowedList[0] || '';
    const headers = {
      'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

    if (!allowedList.length) return reply({ error: 'Worker is missing the ALLOWED_ORIGIN setting' }, 500);
    if (origin && !allowedList.includes(origin)) return reply({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'POST required' }, 405);
    if (!(await tokensMatch((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.VAULT_ACCESS_TOKEN))) {
      return reply({ error: 'Invalid access token' }, 401);
    }
    if (await limited(request, env)) return reply({ error: 'Too many requests. Wait a minute and try again.' }, 429);

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const { guests, topic, style, language } = body || {};
    if (!Array.isArray(guests) || !guests.length || guests.length > 20 || JSON.stringify(body).length > 20000) return reply({ error: 'Invalid request' }, 400);

    const count = Math.max(1, Math.min(MAX_PER_REQUEST, Math.floor(Number(body.count)) || 30));
    const avoid = Array.isArray(body.avoid) ? body.avoid.slice(-40).map((s) => String(s).slice(0, 200)) : [];
    const compact = guests.map((g) => ({ name: String(g.name || '').slice(0, 120), credits: String(g.credits || '').slice(0, 500) }));
    const messages = [
      { role: 'system', content: 'Write concise, varied interview questions for a host. Use only the supplied facts; never invent roles, credits or events. Every question must be different in angle and wording. One question per line, no numbering, headings or commentary. Aim for 8 to 15 words each.' },
      { role: 'user', content: JSON.stringify({ count, guests: compact, topic: String(topic || '').slice(0, 300), style: String(style || '').slice(0, 200), language: String(language || 'English').slice(0, 40), alreadyHave: avoid }) },
    ];
    const providers = [
      { name: 'Groq', key: env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: env.GROQ_MODEL || 'llama-3.1-8b-instant' },
      { name: 'OpenRouter', key: env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/free' },
    ];
    const errors = [];
    for (const p of providers) {
      if (!p.key) continue;
      try {
        const r = await fetch(p.url, {
          method: 'POST', headers: { Authorization: 'Bearer ' + p.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: p.model, messages, temperature: 0.9, max_tokens: Math.min(4000, count * 24 + 80) }),
        });
        if (!r.ok) { errors.push(`${p.name} HTTP ${r.status}`); continue; }
        const j = await r.json();
        const questions = parseQuestions(j.choices?.[0]?.message?.content, count, avoid);
        if (questions.length) return reply({ questions, provider: p.name, usage: j.usage || null, version: 3 });
        errors.push(`${p.name} returned no questions`);
      } catch { errors.push(`${p.name} connection error`); }
    }
    return reply({ error: errors.join('; ') || 'No provider configured', version: 3 }, 503);
  },
};
