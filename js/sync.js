// Optional cloud sync through Supabase. The library is only downloaded once you sign in
// (or when a saved session exists), so the app opens instantly and works fully offline.
import { config } from './config.js';
import { mergeDb, fingerprint } from './merge.js';

let client = null;
let user = null;
let channel = null;
let pushTimer = null;
let busy = false;
let lastPushedAt = '';
let status = { state: 'off', message: 'Not signed in', at: null };
const listeners = new Set();

function set(state, message) {
  status = { state, message, at: state === 'synced' ? new Date() : status.at };
  listeners.forEach((fn) => fn(status));
}

export const getSyncStatus = () => status;
export const getUser = () => user;
export function onSyncStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const hasSavedSession = () =>
  Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));

async function ensureClient() {
  if (client) return client;
  const { createClient } = await import(config.supabaseModule);
  client = createClient(config.supabaseUrl, config.supabaseKey, { auth: { flowType: 'pkce' } });
  return client;
}

export async function initSync(store) {
  const params = new URLSearchParams(location.search);
  if (!hasSavedSession() && !params.has('code')) return;
  try {
    const c = await ensureClient();
    const { data } = await c.auth.getSession();
    if (data.session) await begin(store, data.session.user);
    c.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') end();
      else if (session && (!user || user.id !== session.user.id)) setTimeout(() => begin(store, session.user), 0);
    });
  } catch { set('error', 'Could not reach the sync service'); }
}

export async function signIn(store, email) {
  const c = await ensureClient();
  const { error } = await c.auth.signInWithOtp({
    email, options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw new Error(error.message);
  c.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') end();
    else if (session && (!user || user.id !== session.user.id)) setTimeout(() => begin(store, session.user), 0);
  });
}

export async function signOut() {
  if (client) await client.auth.signOut();
  end();
}

function end() {
  user = null;
  if (channel && client) client.removeChannel(channel);
  channel = null;
  set('off', 'Not signed in');
}

async function begin(store, u) {
  user = u;
  set('syncing', 'Syncing…');
  await cycle(store);
  store.on((type, detail) => { if (type === 'change' && user && !detail.quiet) schedulePush(store); });
  if (channel) await client.removeChannel(channel);
  channel = client.channel('vault-sync-' + user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: config.syncTable, filter: 'owner_id=eq.' + user.id },
      (msg) => { if (msg.new?.updated_at && msg.new.updated_at !== lastPushedAt) cycle(store); })
    .subscribe();
}

function schedulePush(store) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => cycle(store), 1500);
}

/** Pull, merge, then push only if something differs. Safe to run at any time. */
export async function cycle(store) {
  if (!user || !client || busy) return;
  if (!navigator.onLine) { set('offline', 'Offline. Changes will sync when you reconnect.'); return; }
  busy = true;
  try {
    const { data: row, error } = await client.from(config.syncTable)
      .select('payload,updated_at').eq('owner_id', user.id).maybeSingle();
    if (error) throw error;
    const local = store.get();
    const merged = mergeDb(local, row?.payload || {});
    if (fingerprint(merged) !== fingerprint(local)) {
      await store.replaceAll(merged, { reason: 'Before applying changes from another device', quiet: true });
    }
    if (!row || fingerprint(merged) !== fingerprint(row.payload || {})) {
      const updated_at = new Date().toISOString();
      const { error: upErr } = await client.from(config.syncTable)
        .upsert({ owner_id: user.id, payload: store.get(), updated_at }, { onConflict: 'owner_id' });
      if (upErr) throw upErr;
      lastPushedAt = updated_at;
    }
    set('synced', 'Up to date');
  } catch (e) {
    set('error', e?.message || 'Sync failed. Your data is safe on this device.');
  } finally { busy = false; }
}

addEventListener('online', () => { if (user) set('syncing', 'Reconnected'); });
