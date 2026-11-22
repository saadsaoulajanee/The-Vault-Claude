// Reusable, keyboard-accessible question list used by episodes and panels.
import { h } from '../util.js';
import { uid } from '../store.js';
import { dedupe, splitLines } from '../text.js';
import { toast, iconButton, askForm, button } from '../ui.js';

let refocusAdd = false;

export function questionList({ getList, save, placeholder = 'Write a question' }) {
  const list = getList();
  const wrap = h('div', { class: 'qlist' });

  const addInput = h('input', { type: 'text', class: 'qadd-input', placeholder, 'aria-label': 'New question', enterkeyhint: 'done' });
  if (refocusAdd) { addInput.setAttribute('data-autofocus', ''); refocusAdd = false; }

  const addOne = () => {
    const text = addInput.value.trim();
    if (!text) return;
    if (!dedupe([text], getList().map((q) => q.text)).length) { toast('That question is already on the list'); return; }
    refocusAdd = true;
    save([...getList(), { id: uid(), text, asked: false }]);
  };
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } });

  const pasteMany = async () => {
    const v = await askForm({
      title: 'Paste several questions', submitLabel: 'Add questions',
      intro: 'One question per line. Numbers and bullets are removed, and duplicates are skipped.',
      fields: [{ name: 'text', label: 'Questions', type: 'textarea', rows: 10, required: true }],
    });
    if (!v) return;
    const fresh = dedupe(splitLines(v.text), getList().map((q) => q.text));
    if (!fresh.length) { toast('Nothing new to add'); return; }
    save([...getList(), ...fresh.map((text) => ({ id: uid(), text, asked: false }))]);
    toast(`Added ${fresh.length} question${fresh.length === 1 ? '' : 's'}`);
  };

  const move = (i, d) => {
    const next = getList().slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next);
  };

  const remove = (q, i) => {
    save(getList().filter((x) => x.id !== q.id));
    toast('Question deleted', {
      label: 'Undo',
      onAction: () => { const cur = getList().slice(); cur.splice(Math.min(i, cur.length), 0, q); save(cur); },
    });
  };

  const rows = list.map((q, i) => h('li', { class: 'qrow' + (q.asked ? ' done' : '') },
    h('input', {
      type: 'checkbox', checked: !!q.asked, 'aria-label': `Mark question ${i + 1} as asked`,
      onchange: (e) => save(getList().map((x) => (x.id === q.id ? { ...x, asked: e.target.checked } : x))),
    }),
    h('input', {
      type: 'text', class: 'qtext', value: q.text, 'aria-label': `Question ${i + 1}`,
      onchange: (e) => {
        const text = e.target.value.trim();
        if (!text) { e.target.value = q.text; return; }
        save(getList().map((x) => (x.id === q.id ? { ...x, text } : x)), { silent: true });
      },
    }),
    h('div', { class: 'qtools' },
      iconButton('up', 'Move up', () => move(i, -1), { disabled: i === 0 }),
      iconButton('down', 'Move down', () => move(i, 1), { disabled: i === list.length - 1 }),
      iconButton('trash', 'Delete question', () => remove(q, i)))));

  wrap.append(
    list.length ? h('ol', { class: 'qrows' }, rows) : h('p', { class: 'muted pad' }, 'No questions yet. Write your first one below, or paste a list.'),
    h('div', { class: 'qadd' }, addInput, button('Add question', { variant: 'primary', iconName: 'plus', onclick: addOne }), button('Paste a list', { variant: 'ghost', onclick: pasteMany })));
  return wrap;
}
