// Browser storage adapters and the app-wide store instance.
import { createStore } from './store.js';

function idbAdapter() {
  let opening;
  const open = () => (opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('the-vault', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const run = async (mode, fn) => {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    set: (k, v) => run('readwrite', (s) => s.put(v, k)),
    legacy: async () => { try { return JSON.parse(localStorage.getItem('vault03') || 'null'); } catch { return null; } },
  };
}

function localAdapter() {
  const read = (k) => { try { return JSON.parse(localStorage.getItem('vault5:' + k) || 'null'); } catch { return null; } };
  return {
    get: async (k) => read(k),
    set: async (k, v) => localStorage.setItem('vault5:' + k, JSON.stringify(v)),
    legacy: async () => { try { return JSON.parse(localStorage.getItem('vault03') || 'null'); } catch { return null; } },
  };
}

export const store = createStore(typeof indexedDB !== 'undefined' ? idbAdapter() : localAdapter());
