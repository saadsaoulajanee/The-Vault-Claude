// Merging two guest profiles. Pure: returns the changes, the caller applies them.
import { episodeGuestIds } from './model.js';

const longer = (a, b) => (String(b || '').trim().length > String(a || '').trim().length ? b : a);

/** Plan merging `drop` into `keep`. Nothing is lost: credits and journal are combined, the longer text wins. */
export function planMerge(db, keep, drop) {
  const seen = new Set((keep.projects || []).map((p) => String(p.title).toLowerCase()));
  const projects = [...(keep.projects || []), ...(drop.projects || []).filter((p) => !seen.has(String(p.title).toLowerCase()))];
  const journal = [...(keep.journal || []), ...(drop.journal || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const notes = [keep.notes, drop.notes && drop.notes !== keep.notes ? drop.notes : ''].filter((x) => x && x.trim()).join('\n\n');
  const patch = {
    projects, journal, notes,
    bio: longer(keep.bio, drop.bio),
    pronunciation: keep.pronunciation || drop.pronunciation || '',
  };
  if (!keep.photo && drop.photo) Object.assign(patch, { photo: drop.photo, photoX: drop.photoX, photoY: drop.photoY, photoZoom: drop.photoZoom });
  const episodes = db.episodes.filter((e) => episodeGuestIds(e).includes(drop.id)).map((e) => {
    const ids = episodeGuestIds(e).map((id) => (id === drop.id ? keep.id : id));
    const unique = [...new Set(ids)];
    const p = { id: e.id, guestId: e.guestId === drop.id ? keep.id : e.guestId };
    if (e.guest && e.guestId === drop.id) p.guest = keep.name;
    if (Array.isArray(e.guestIds)) p.guestIds = unique;
    return p;
  });
  const conventions = db.conventions.filter((c) => (c.guestIds || []).includes(drop.id)).map((c) => ({ id: c.id, guestIds: [...new Set(c.guestIds.map((id) => (id === drop.id ? keep.id : id)))] }));
  const panelFix = db.conventions.filter((c) => (c.panels || []).some((p) => (p.guestIds || []).includes(drop.id))).map((c) => ({
    id: c.id, panels: c.panels.map((p) => ((p.guestIds || []).includes(drop.id) ? { ...p, guestIds: [...new Set(p.guestIds.map((id) => (id === drop.id ? keep.id : id)))] } : p)),
  }));
  return { patch, episodes, conventions, panelFix };
}
