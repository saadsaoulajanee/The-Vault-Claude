// Connection settings for optional services. These live only in this browser and are never synced,
// so an API key or access token can never end up in your cloud copy of the data.
const WHERE = { aiUrl: 'local', flightUrl: 'local', youtubeKey: 'local', token: 'session' };
const store = (name) => (WHERE[name] === 'session' ? sessionStorage : localStorage);

export function getService(name) {
  try { return store(name).getItem('vault5:svc:' + name) || ''; } catch { return ''; }
}
export function setService(name, value) {
  try { const v = String(value ?? '').trim(); v ? store(name).setItem('vault5:svc:' + name, v) : store(name).removeItem('vault5:svc:' + name); } catch { /* optional */ }
}

/** A valid https address or an empty string. */
export function httpsUrl(value) {
  try { const u = new URL(String(value).trim()); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
