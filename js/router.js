// Tiny hash router. A loader may return { cleanup, manual } to tidy up on leave and to opt
// out of automatic re-render when data changes (Live mode manages its own updates).
const routes = [];
let root, onRoute, current = null, cleanup = null;

export function route(pattern, loader) {
  routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), loader });
}

export const navigate = (path) => { location.hash = '#' + path; };
export const isManual = () => !!current?.manual;

export async function render({ keepScroll = false, announce = true } = {}) {
  const path = location.hash.slice(1) || '/today';
  const y = window.scrollY;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    root.replaceChildren();
    onRoute?.(path);
    const result = (await r.loader({ root, params: { ...m.groups } })) || {};
    current = result;
    cleanup = result.cleanup || null;
    if (keepScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    const target = root.querySelector('[data-autofocus]') || (announce && !keepScroll ? root.querySelector('h1') : null);
    target?.focus({ preventScroll: true });
    return;
  }
  navigate('/today');
}

export function start(el, routeCallback) {
  root = el;
  onRoute = routeCallback;
  addEventListener('hashchange', () => render());
  return render();
}
