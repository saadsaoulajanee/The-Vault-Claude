// The data store. Pure (storage is injected) so it can be tested without a browser.
import { COLLECTIONS } from './merge.js';
import { DEFAULT_PACKING } from './model.js';
import { syncAutoExpenses } from './finance.js';

export const uid = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('');

const MAX_BACKUPS = 5;
const AUTO_BACKUP_EVERY = 10 * 60 * 1000;
const imageKey = (id) => 'img:' + id;

export function emptyDb() {
  return {
    guests: [], organizers: [], conventions: [], episodes: [], venues: [], quickNotes: [], youtubeVideos: [],
    settings: { theme: 'system' }, checklistTemplate: DEFAULT_PACKING.slice(),
    _deleted: {}, _checklistTemplateUpdatedAt: 0,
  };
}

const normName = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
const toNum = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : Date.parse(v) || fallback);

/** Make any previous-version payload safe to use. Unknown keys are preserved. */
export function normalize(raw) {
  const base = emptyDb();
  const db = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  for (const name of COLLECTIONS) db[name] = Array.isArray(db[name]) ? db[name].filter((x) => x && x.id) : [];
  db.settings = { ...base.settings, ...(db.settings && typeof db.settings === 'object' ? db.settings : {}) };
  delete db.settings.youtubeApiKey; // an API key has no business living in synced data
  if (!Array.isArray(db.checklistTemplate) || !db.checklistTemplate.length) db.checklistTemplate = DEFAULT_PACKING.slice();
  if (!db._deleted || typeof db._deleted !== 'object') db._deleted = {};
  const now = Date.now();
  // v4 stored notes with a locale-formatted date string. Sync needs numbers.
  for (const n of db.quickNotes) { n.createdAt = toNum(n.createdAt, now); n.updatedAt = toNum(n.updatedAt, n.createdAt); n.text = String(n.text ?? ''); }
  for (const v of db.youtubeVideos) if (typeof v.updatedAt !== 'number') v.updatedAt = Date.parse(v.fetchedAt) || now;
  // Link episodes to guest profiles by name, as v4 did.
  for (const e of db.episodes) {
    if (!e.guest) continue;
    let g = db.guests.find((x) => x.id === e.guestId) || db.guests.find((x) => normName(x.name) === normName(e.guest));
    if (!g) {
      g = { id: uid(), name: e.guest, photo: '', bio: '', notes: '', createdAt: now, updatedAt: now };
      db.guests.push(g);
    }
    e.guestId = g.id;
  }
  return db;
}

export function createStore(adapter, { now = () => Date.now() } = {}) {
  let db = emptyDb();
  let timer = null;
  let lastBackup = 0;
  const subs = new Set();
  const emit = (type, detail = {}) => subs.forEach((fn) => fn(type, detail));
  const coll = (name) => {
    if (!COLLECTIONS.includes(name)) throw new Error('Unknown collection: ' + name);
    return db[name];
  };

  /** Keeps automatic costs in line with episodes. Runs after any change that could affect them. */
  function derive() {
    for (const id of syncAutoExpenses(db)) {
      const c = db.conventions.find((x) => x.id === id);
      if (c) c.updatedAt = now();
    }
  }

  const readBackups = async () => (await adapter.get('backups')) || [];

  async function backup(reason) {
    try {
      const list = await readBackups();
      list.unshift({ at: now(), reason, data: JSON.stringify(db) });
      await adapter.set('backups', list.slice(0, MAX_BACKUPS));
      lastBackup = now();
    } catch (e) { emit('error', e); }
  }

  async function flush() {
    clearTimeout(timer);
    timer = null;
    try { await adapter.set('db', db); emit('saved'); } catch (e) { emit('error', e); }
  }

  function touch() {
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
    if (now() - lastBackup > AUTO_BACKUP_EVERY) { lastBackup = now(); backup('Automatic'); }
  }

  const changed = (name, id, silent = false, extra = {}) => {
    if (name === 'episodes' || name === 'conventions') derive();
    touch();
    emit(silent ? 'silent' : 'change', { name, id, ...extra });
  };

  /** v4 kept floor plan images inside the data. Move them to the local image store. */
  async function migrateInlineImages() {
    let moved = false;
    for (const v of db.venues) {
      for (const p of v.floorPlans || []) {
        if (typeof p.data === 'string' && p.data.startsWith('data:') && !p.imageId) {
          p.imageId = uid();
          await adapter.set(imageKey(p.imageId), p.data);
          delete p.data;
          v.updatedAt = now();
          moved = true;
        }
      }
    }
    return moved;
  }

  const api = {
    async load() {
      let raw = await adapter.get('db');
      let migrated = false;
      if (!raw && adapter.legacy) {
        raw = await adapter.legacy();
        migrated = !!raw;
      }
      db = normalize(raw);
      if (migrated) await backup('Before importing the previous version');
      const moved = await migrateInlineImages();
      derive();
      if (migrated || moved) await adapter.set('db', db);
      emit('load');
      return db;
    },
    get: () => db,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    flush,
    backup,
    backups: readBackups,

    byId: (name, id) => coll(name).find((x) => x.id === id) || null,

    add(name, item) {
      const t = now();
      const it = { id: uid(), ...item, createdAt: t, updatedAt: t };
      coll(name).push(it);
      changed(name, it.id);
      return it;
    },
    /** Insert or replace by id, keeping the id you give (used for YouTube videos). */
    upsert(name, item, { silent = false } = {}) {
      const list = coll(name);
      const i = list.findIndex((x) => x.id === item.id);
      const it = { ...(i >= 0 ? list[i] : { createdAt: now() }), ...item, updatedAt: now() };
      if (i >= 0) list[i] = it; else list.push(it);
      changed(name, it.id, silent);
      return it;
    },
    update(name, id, patch, { silent = false } = {}) {
      const it = coll(name).find((x) => x.id === id);
      if (!it) return null;
      const result = typeof patch === 'function' ? patch(it) : patch;
      if (result && typeof result === 'object') Object.assign(it, result);
      it.updatedAt = now();
      changed(name, id, silent);
      return it;
    },
    remove(name, id) {
      const list = coll(name);
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const [it] = list.splice(i, 1);
      db._deleted[id] = now();
      changed(name, id);
      return { item: it, index: i };
    },
    restore(name, { item, index }) {
      delete db._deleted[item.id];
      item.updatedAt = now();
      const list = coll(name);
      list.splice(Math.min(index, list.length), 0, item);
      changed(name, item.id);
    },
    setSettings(patch) {
      db.settings = { ...db.settings, ...patch };
      derive();
      touch(); emit('change', { settings: true });
    },
    setPackingTemplate(list) {
      db.checklistTemplate = list;
      db._checklistTemplateUpdatedAt = now();
      touch(); emit('change', { settings: true });
    },
    async replaceAll(data, { reason = 'Before replacing data', quiet = false } = {}) {
      await backup(reason);
      const { _images, ...rest } = data || {};
      if (_images && typeof _images === 'object') {
        for (const [id, dataUrl] of Object.entries(_images)) if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) await adapter.set(imageKey(id), dataUrl);
      }
      db = normalize(rest);
      await migrateInlineImages();
      derive();
      touch(); emit('change', { external: true, quiet });
    },
    async restoreBackup(index) {
      const b = (await readBackups())[index];
      if (!b) throw new Error('That backup no longer exists');
      await api.replaceAll(JSON.parse(b.data), { reason: 'Before restoring a backup' });
    },

    // Floor plan images stay on this device (they are too large to sync).
    putImage: (id, dataUrl) => adapter.set(imageKey(id), dataUrl),
    getImage: (id) => adapter.get(imageKey(id)),
    deleteImage: (id) => adapter.set(imageKey(id), null),

    nextEpisodeNumber: () => db.episodes.reduce((m, e) => Math.max(m, Number(e.number) || 0), 0) + 1,
    exportJson: () => JSON.stringify(db, null, 2),
    /** A full copy including floor plan images, for moving to another device. */
    async exportWithImages() {
      const images = {};
      for (const v of db.venues) for (const p of v.floorPlans || []) {
        if (p.imageId) { const data = await api.getImage(p.imageId); if (data) images[p.imageId] = data; }
      }
      return JSON.stringify({ ...db, _images: images }, null, 2);
    },
    parseImport(text) {
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('That file is not a Vault export');
      if (!COLLECTIONS.some((n) => Array.isArray(data[n]))) throw new Error('No episodes, guests or conventions found in that file');
      return data;
    },
  };
  return api;
}
