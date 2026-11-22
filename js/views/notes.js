// Quick notes: a place to drop a thought before it is gone.
import { h } from '../util.js';
import { store as s } from '../app-store.js';
import { button, iconButton, askForm, toast } from '../ui.js';

export function notesCard() {
  const notes = s.get().quickNotes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const box = h('textarea', { id: 'qn', rows: 2, placeholder: 'A thought, a room detail, a question for a guest', 'aria-label': 'New quick note' });
  const save = () => { const text = box.value.trim(); if (!text) { box.focus(); return; } s.add('quickNotes', { text }); };
  box.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); } });
  return h('section', { class: 'block', 'aria-labelledby': 'qn-h' }, h('h2', { id: 'qn-h' }, 'Quick notes'),
    h('div', { class: 'field', style: { marginTop: '10px' } }, box), h('div', { class: 'panel-actions' }, button('Save note', { variant: 'primary', onclick: save }), h('span', { class: 'hint' }, 'Ctrl or Cmd + Enter also saves')),
    notes.length ? h('ul', { class: 'rows' }, notes.slice(0, 8).map((n) => h('li', { class: 'note-item' },
      h('p', {}, n.text),
      h('div', { class: 'idea', style: { border: 0, padding: 0, background: 'none' } }, h('span', { class: 'muted' }, new Date(n.updatedAt).toLocaleString()),
        h('div', { class: 'qtools' },
          iconButton('edit', 'Edit note', async () => { const v = await askForm({ title: 'Edit note', fields: [{ name: 'text', label: 'Note', type: 'textarea', rows: 6, required: true, value: n.text }] }); if (v) s.update('quickNotes', n.id, { text: v.text.trim() }); }),
          iconButton('trash', 'Delete note', () => { const removed = s.remove('quickNotes', n.id); toast('Note deleted', { label: 'Undo', onAction: () => s.restore('quickNotes', removed) }); }))))))
      : null,
    notes.length > 8 ? h('p', { class: 'muted pad' }, `Showing the latest 8 of ${notes.length} notes.`) : null);
}
