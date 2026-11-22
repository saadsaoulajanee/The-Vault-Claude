// YouTube helpers (no DOM). The API key is kept only in this browser and never synced.
export function ytId(input) {
  try {
    const u = new URL(String(input).trim());
    const host = u.hostname.replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host.endsWith('youtube.com')) id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/) || [])[1] || '';
    return /^[\w-]{6,20}$/.test(id) ? id : '';
  } catch { return ''; }
}

export const isoDurationToText = (iso) => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  if (!m) return '';
  const [h, mi, s] = [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
  return (h ? h + ':' + String(mi).padStart(2, '0') : mi) + ':' + String(s).padStart(2, '0');
};

/** Fetches up to 50 videos in one request. Returns records ready for the store. */
export async function fetchVideos(ids, key, { fetchFn = fetch, now = () => Date.now() } = {}) {
  if (!key) throw new Error('Add your YouTube API key first.');
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (!unique.length) return [];
  const url = 'https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: unique.join(','), key });
  const res = await fetchFn(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `YouTube returned an error (${res.status})`);
  return (data.items || []).map((v) => ({
    id: v.id, url: 'https://www.youtube.com/watch?v=' + v.id, title: v.snippet?.title || 'Untitled',
    thumbnail: v.snippet?.thumbnails?.medium?.url || '', views: Number(v.statistics?.viewCount) || 0,
    likes: Number(v.statistics?.likeCount) || 0, comments: Number(v.statistics?.commentCount) || 0,
    duration: v.contentDetails?.duration || '', published: v.snippet?.publishedAt || '', fetchedAt: new Date(now()).toISOString(),
  }));
}

const HALF_DAY = 12 * 3600 * 1000;
/** Adds a view-count snapshot when the number changed or enough time passed. Keeps the last 40. */
export function withHistory(previous, fresh, now = Date.now()) {
  const history = Array.isArray(previous?.history) ? previous.history.slice() : [];
  const last = history[history.length - 1];
  if (!last || last.views !== fresh.views || now - last.at > HALF_DAY) history.push({ at: now, views: fresh.views });
  return { ...previous, ...fresh, history: history.slice(-40), updatedAt: now };
}

/** Change in views since the oldest snapshot within the window (default 7 days). */
export function growth(video, windowMs = 7 * 864e5, now = Date.now()) {
  const h = video.history || [];
  if (h.length < 2) return null;
  const base = h.find((p) => now - p.at <= windowMs) || h[0];
  const latest = h[h.length - 1];
  return base === latest ? null : latest.views - base.views;
}
