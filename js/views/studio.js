// AI question studio: generate in small batches, pick favourites, send to the episode.
import { h } from '../util.js';
import { store as s } from '../app-store.js';
import { uid } from '../store.js';
import { generateQuestions } from '../ai.js';
import { dedupe, norm } from '../text.js';
import { pageHeader, empty, button, toast, progress } from '../ui.js';
import { getService, setService } from '../services.js';


export default function studio({ root, params }) {
  const ep = s.byId('episodes', params.id);
  if (!ep) {
    root.append(pageHeader({ title: 'Episode not found', back: { href: '/episodes', label: 'Episodes' } }), empty({ title: 'This episode was deleted or never existed' }));
    return;
  }
  const guest = s.get().guests.find((g) => g.id === ep.guestId);
  const credits = (guest?.projects || []).slice(0, 12).map((p) => [p.title, p.role].filter(Boolean).join(': ')).join('; ').slice(0, 500);

  root.append(pageHeader({ title: 'Question studio', subtitle: `For ${ep.guest}`, back: { href: '/episodes/' + ep.id, label: ep.guest } }));

  const url = h('input', { id: 'ai-url', type: 'url', placeholder: 'https://your-worker.workers.dev', value: getService('aiUrl') });
  const token = h('input', { id: 'ai-token', type: 'password', autocomplete: 'off', value: getService('token') });
  const topic = h('textarea', { id: 'ai-topic', rows: 2, placeholder: 'Career, projects, personality' });
  const style = h('input', { id: 'ai-style', value: 'Original, fun, introspective, unexpected' });
  const language = h('input', { id: 'ai-lang', value: 'English' });
  const total = h('select', { id: 'ai-total', value: '100' }, [50, 100, 150, 200, 300].map((n) => h('option', { value: String(n) }, `${n} questions`)));
  const status = h('p', { class: 'muted', role: 'status' });
  const bar = h('div', { hidden: true });
  const results = h('div', { hidden: true });
  const gen = button('Generate questions', { variant: 'primary', iconName: 'sparkle' });
  const stop = button('Stop', { variant: 'ghost', hidden: true });

  let controller = null;
  let questions = [];
  const picked = new Set();

  function drawResults() {
    results.hidden = !questions.length;
    if (!questions.length) return;
    const have = (s.byId('episodes', ep.id).questions || []).map((q) => q.text);
    const addBtn = button(`Add selected (${picked.size})`, { variant: 'primary', disabled: !picked.size, onclick: () => {
      const cur = s.byId('episodes', ep.id);
      const fresh = dedupe([...picked].map((i) => questions[i]), (cur.questions || []).map((q) => q.text));
      s.update('episodes', ep.id, { questions: [...(cur.questions || []), ...fresh.map((text) => ({ id: uid(), text, asked: false }))] });
      const used = new Set(picked);
      questions = questions.filter((_, i) => !used.has(i));
      picked.clear();
      toast(`Added ${fresh.length} to the episode`, { label: 'Open', onAction: () => { location.hash = '#/episodes/' + ep.id; } });
      drawResults();
    } });
    results.replaceChildren(
      h('div', { class: 'panel-actions' }, addBtn,
        button('Select all', { variant: 'ghost', onclick: () => { questions.forEach((_, i) => picked.add(i)); drawResults(); } }),
        button('Clear', { variant: 'ghost', onclick: () => { picked.clear(); drawResults(); } })),
      h('ul', { class: 'pick' }, questions.map((q, i) => h('li', { class: have.some((x) => norm(x) === norm(q)) ? 'have' : '' },
        h('label', {}, h('input', { type: 'checkbox', checked: picked.has(i), onchange: (e) => { e.target.checked ? picked.add(i) : picked.delete(i); drawResults(); } }), h('span', {}, q))))));
  }

  gen.addEventListener('click', async () => {
    let endpoint;
    try { endpoint = new URL(url.value); if (endpoint.protocol !== 'https:') throw new Error(); } catch { status.textContent = 'Enter the https address of your Worker.'; url.focus(); return; }
    if (!token.value) { status.textContent = 'Enter your Worker access token.'; token.focus(); return; }
    setService('aiUrl', endpoint.href);
    setService('token', token.value);
    controller = new AbortController();
    gen.disabled = true; stop.hidden = false; bar.hidden = false;
    const want = Number(total.value);
    status.textContent = 'Generating…';
    try {
      const out = await generateQuestions({
        url: endpoint.href, token: token.value, topic: topic.value, style: style.value, language: language.value, total: want,
        guests: [{ name: ep.guest, credits }], existing: (ep.questions || []).map((q) => q.text), signal: controller.signal,
        onProgress: (p) => { questions = p.questions; bar.replaceChildren(progress(p.questions.length, want, 'Generated')); status.textContent = `${p.questions.length} of ${want} generated`; drawResults(); },
      });
      status.textContent = `${out.questions.length} questions ready${out.tokens ? `, ${out.tokens} tokens` : ''}${out.provider ? ` via ${out.provider}` : ''}. Select your favourites.`;
    } catch (e) {
      status.textContent = e.name === 'AbortError' ? 'Stopped. Anything generated so far is kept below.' : `${e.message}. Anything generated so far is kept below.`;
    } finally { gen.disabled = false; stop.hidden = true; controller = null; }
  });
  stop.addEventListener('click', () => controller?.abort());

  const field = (label, control, hint) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint && h('p', { class: 'hint' }, hint));
  root.append(h('section', { class: 'panel' },
    h('div', { class: 'grid2' }, field('Worker address', url), field('Access token', token, 'Kept for this browser session only.')),
    field('Topics', topic), h('div', { class: 'grid2' }, field('Styles', style), field('Language', language)),
    field('How many', total, 'Questions come in batches of 50, so a slow request costs less.'),
    credits ? h('p', { class: 'muted' }, 'Using the credits saved on this guest profile.') : h('p', { class: 'muted' }, 'Tip: add credits to the guest profile for more specific questions.'),
    h('div', { class: 'panel-actions' }, gen, stop), bar, status, results));
  drawResults();
  return { cleanup: () => controller?.abort() };
}
