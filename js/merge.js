// Pure sync/merge logic. Replaces v4's "last full payload wins" with a per-record merge,
// so editing on two devices no longer overwrites one with the other.
export const COLLECTIONS = ['guests', 'organizers', 'conventions', 'episodes', 'venues', 'quickNotes', 'youtubeVideos'];

const stamp = (x) => Number(x?.updatedAt) || 0;

/** Stable JSON with sorted keys, used to compare two databases by content. */
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value ?? null);
}

export function mergeDb(local, remote) {
  local = local || {};
  remote = remote || {};
  const deleted = { ...(remote._deleted || {}) };
  for (const [id, at] of Object.entries(local._deleted || {})) deleted[id] = Math.max(at, deleted[id] || 0);

  const out = { ...remote, ...local };
  for (const name of COLLECTIONS) {
    const l = Array.isArray(local[name]) ? local[name] : [];
    const r = Array.isArray(remote[name]) ? remote[name] : [];
    const rById = new Map(r.map((x) => [x.id, x]));
    const lIds = new Set(l.map((x) => x.id));
    const merged = [];
    for (const item of l) {
      const other = rById.get(item.id);
      merged.push(other && stamp(other) > stamp(item) ? other : item);
    }
    for (const item of r) if (!lIds.has(item.id)) merged.push(item);
    out[name] = merged.filter((x) => !(deleted[x.id] && deleted[x.id] >= stamp(x)));
  }
  out._deleted = deleted;
  out.settings = { ...(remote.settings || {}), ...(local.settings || {}) };

  const lt = Number(local._checklistTemplateUpdatedAt) || 0;
  const rt = Number(remote._checklistTemplateUpdatedAt) || 0;
  const winner = rt > lt ? remote : local;
  out.checklistTemplate = Array.isArray(winner.checklistTemplate) ? winner.checklistTemplate : (local.checklistTemplate || []);
  out._checklistTemplateUpdatedAt = Math.max(lt, rt);
  return out;
}

/** Content fingerprint that ignores key order. */
export const fingerprint = (db) => canonical(db);
