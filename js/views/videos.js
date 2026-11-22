// YouTube performance. Paste a link, or pull every video already linked from your episodes.
// The API key stays in this browser. Each refresh adds a snapshot, so you can see growth over time.
import { h, icon, fmtDate } from '../util.js';
import { store as s } from '../app-store.js';
import { render } from '../router.js';
import { getService, setService } from '../services.js';
import { ytId, fetchVideos, withHistory, growth, isoDurationToText } from '../youtube.js';
import { sparkline, statTile } from '../charts.js';
import { button, iconButton, empty, toast, confirmDialog } from '../ui.js';
import { safeUrl } from '../util.js';

const n = (v) => Number(v || 0).toLocaleString();

export function videosPanel(body) {
  const db = s.get();
  const key = getService('youtubeKey');
  const videos = db.youtubeVideos.slice().sort((a, b) => (b.views || 0) - (a.views || 0));

  const keyInput = h('input', { id: 'ytkey', type: 'password', autocomplete: 'off', value: key, placeholder: 'Paste your YouTube Data API key' });
  body.append(h('section', { class: 'panel block' }, h('h2', {}, 'Connect YouTube'),
    h('p', { class: 'muted' }, 'Create a free key in Google Cloud (YouTube Data API v3) and restrict it to your website address. It is stored only in this browser and is never synced or exported.'),
    h('div', { class: 'qadd', style: { marginTop: '12px' } }, keyInput,
      button('Save key', { onclick: () => { setService('youtubeKey', keyInput.value); toast(keyInput.value.trim() ? 'Key saved on this device' : 'Key removed'); render({ keepScroll: true, announce: false }); } }))));

  const run = async (ids, btn) => {
    if (!getService('youtubeKey')) { toast('Save your YouTube API key first'); keyInput.focus(); return; }
    if (!ids.length) { toast('No videos to fetch'); return; }
    btn.disabled = true;
    try {
      const fresh = await fetchVideos(ids, getService('youtubeKey'));
      if (!fresh.length) throw new Error('No public video found. Check the link.');
      for (const v of fresh) {
        const prev = s.get().youtubeVideos.find((x) => x.id === v.id);
        const episode = s.get().episodes.find((e) => [e.longLink, ...(e.shorts || [])].some((u) => ytId(u) === v.id));
        s.upsert('youtubeVideos', { ...withHistory(prev, v), episodeId: prev?.episodeId || episode?.id || '' }, { silent: true });
      }
      toast(`Updated ${fresh.length} video${fresh.length === 1 ? '' : 's'}`);
      render({ keepScroll: true, announce: false });
    } catch (e) { toast(e.message, { timeout: 9000 }); } finally { btn.disabled = false; }
  };

  const url = h('input', { id: 'yturl', type: 'url', placeholder: 'https://www.youtube.com/watch?v=...', 'aria-label': 'Video link' });
  const fetchBtn = button('Fetch', { variant: 'primary', iconName: 'download' });
  fetchBtn.addEventListener('click', () => { const id = ytId(url.value); if (!id) { toast('That is not a YouTube video link'); url.focus(); return; } run([id], fetchBtn).then(() => { url.value = ''; }); });
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fetchBtn.click(); } });

  const linked = [...new Set(db.episodes.flatMap((e) => [e.longLink, ...(e.shorts || [])]).map(ytId).filter(Boolean))];
  const unsaved = linked.filter((id) => !videos.some((v) => v.id === id));
  const refreshBtn = button('Refresh all', { iconName: 'refresh', disabled: !videos.length });
  refreshBtn.addEventListener('click', () => run(videos.map((v) => v.id), refreshBtn));
  const pullBtn = button(`Add ${unsaved.length} from episodes`, { iconName: 'plus', disabled: !unsaved.length });
  pullBtn.addEventListener('click', () => run(unsaved, pullBtn));

  body.append(h('section', { class: 'panel block' }, h('h2', {}, 'Add videos'),
    h('div', { class: 'qadd' }, url, fetchBtn),
    h('div', { class: 'panel-actions', style: { marginTop: '12px' } }, pullBtn, refreshBtn),
    h('p', { class: 'hint' }, 'Links on an episode (long format and shorts) are picked up automatically.')));

  if (!videos.length) { body.append(empty({ title: 'No videos tracked yet', text: 'Paste a link above to start. Come back and refresh to watch the numbers grow.' })); return; }

  const sum = (k) => videos.reduce((t, v) => t + (v[k] || 0), 0);
  body.append(h('div', { class: 'stat-row' }, statTile('Videos', videos.length), statTile('Views', n(sum('views'))), statTile('Likes', n(sum('likes'))), statTile('Comments', n(sum('comments')))));

  body.append(h('ul', { class: 'rows' }, videos.map((v) => {
    const g = growth(v);
    const ep = v.episodeId ? db.episodes.find((e) => e.id === v.episodeId) : null;
    return h('li', { class: 'yt' },
      safeUrl(v.thumbnail) ? h('img', { src: safeUrl(v.thumbnail), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'avatar', style: { width: '112px', height: '63px', borderRadius: '8px' } }, icon('play', 22)),
      h('div', { style: { minWidth: 0 } }, h('strong', {}, v.title),
        h('div', { class: 'nums' }, h('span', {}, h('b', {}, n(v.views)), ' views'), h('span', {}, h('b', {}, n(v.likes)), ' likes'), h('span', {}, h('b', {}, n(v.comments)), ' comments'),
          g ? h('span', { class: 'up' }, `${g > 0 ? '+' : ''}${n(g)} in 7 days`) : null),
        h('div', { class: 'nums' }, v.published && h('span', {}, 'Published ' + fmtDate(v.published.slice(0, 10))), v.duration && h('span', {}, isoDurationToText(v.duration)),
          ep && h('a', { href: '#/episodes/' + ep.id }, 'Episode with ' + ep.guest))),
      h('div', { class: 'tail acts', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, sparkline((v.history || []).map((p) => p.views)),
        h('a', { class: 'icon-btn', href: safeUrl(v.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open on YouTube', title: 'Open on YouTube' }, icon('link', 18)),
        iconButton('trash', 'Stop tracking', async () => {
          if (!(await confirmDialog(`Stop tracking “${v.title}”? Its history is removed.`, { confirmLabel: 'Stop tracking', danger: true, title: 'Remove video' }))) return;
          const removed = s.remove('youtubeVideos', v.id);
          toast('Video removed', { label: 'Undo', onAction: () => s.restore('youtubeVideos', removed) });
        })));
  })));
}
