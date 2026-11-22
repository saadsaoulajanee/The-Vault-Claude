// Client for the question-generation Worker. Requests are made in small batches so a
// slow or failing provider only costs one batch, and results are de-duplicated as they arrive.
import { dedupe } from './text.js';

const BATCH = 50;

export async function generateQuestions({
  url, token, guests, topic = '', style = '', language = 'English',
  total = 100, existing = [], signal, onProgress,
}) {
  const out = [];
  const seen = [...existing];
  let tokens = 0;
  let provider = '';
  const maxCalls = Math.ceil(total / BATCH) + 2;

  for (let call = 0; call < maxCalls && out.length < total; call++) {
    const need = Math.min(BATCH, total - out.length);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      signal,
      body: JSON.stringify({ guests, topic, style, language, count: need, avoid: seen.slice(-40) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    if (!(data.version >= 2)) throw new Error('Your Worker is out of date. Deploy worker/ai-questions-worker.js.');

    const fresh = dedupe(data.questions || [], seen).slice(0, total - out.length);
    for (const q of fresh) { out.push(q); seen.push(q); }
    tokens += data.usage?.total_tokens || 0;
    provider = data.provider || provider;
    onProgress?.({ questions: out.slice(), tokens, provider });
    if (!fresh.length) break; // provider is repeating itself; stop spending tokens
  }
  return { questions: out, tokens, provider };
}
