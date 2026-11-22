// Convention poster: who is coming. The lineup and the photo framing maths are pure (tested);
// drawPoster paints a PNG with the browser canvas.
import { episodeGuestIds } from './model.js';
import { cropOf } from './text.js';

/** Guests at a convention: ones listed on it, on its panels and in its interviews, minus any hidden from the poster. */
export function lineup(db, c) {
  const ids = [];
  const add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  (c.guestIds || []).forEach(add);
  (c.panels || []).forEach((p) => (p.guestIds || []).forEach(add));
  db.episodes.filter((e) => e.conventionId === c.id && Number(e.status) !== 10).forEach((e) => episodeGuestIds(e).forEach(add));
  return ids.map((id) => db.guests.find((g) => g.id === id)).filter(Boolean);
}

/** Where to draw a photo inside a circle of diameter D so it matches the on-screen framing. */
export function cropRect(w, h, D, person) {
  const { x, y, zoom } = cropOf(person);
  const px = x / 100, py = y / 100;
  const s = Math.max(D / w, D / h);
  const iw = w * s, ih = h * s;
  const ox = (D - iw) * px, oy = (D - ih) * py;
  return { left: px * D + (ox - px * D) * zoom, top: py * D + (oy - py * D) * zoom, width: iw * zoom, height: ih * zoom };
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  const t = setTimeout(() => resolve(null), 6000);
  img.onload = () => { clearTimeout(t); resolve(img); };
  img.onerror = () => { clearTimeout(t); resolve(null); };
  img.src = src;
});

/** Paint the poster. Photos that cannot be loaded for a canvas (blocked by their host) fall back to initials. */
export async function drawPoster(canvas, { title, dates, place, guests, initials, safe }) {
  const W = 1080;
  const cols = guests.length > 12 ? 5 : guests.length > 6 ? 4 : 3;
  const cell = W / cols;
  const D = Math.min(190, cell - 56);
  const rows = Math.max(1, Math.ceil(guests.length / cols));
  const rowH = D + 74;
  const H = Math.max(1080, 420 + rows * rowH + 110);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a1342'); bg.addColorStop(1, '#150b20');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 120, 20, W / 2, 120, 620);
  glow.addColorStop(0, 'rgba(242,176,53,.32)'); glow.addColorStop(1, 'rgba(242,176,53,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 760);

  ctx.textAlign = 'center'; ctx.fillStyle = '#f6effb';
  const fit = (text, max, size, weight) => { let s = size; do { ctx.font = `${weight} ${s}px "Bricolage Grotesque", "Hanken Grotesk", system-ui, sans-serif`; s -= 2; } while (ctx.measureText(text).width > max && s > 28); };
  // Title wraps over at most two lines.
  const words = String(title || 'Convention').split(' ');
  const lines = [];
  fit(title, W - 160, 96, 800);
  let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > W - 160 && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  const shown = lines.slice(0, 2);
  let y = 190;
  shown.forEach((l) => { ctx.fillText(l, W / 2, y); y += 104; });
  ctx.fillStyle = '#f2b035'; fit([dates, place].filter(Boolean).join('  |  ') || ' ', W - 160, 40, 600);
  ctx.fillText([dates, place].filter(Boolean).join('  |  '), W / 2, y + 6);
  ctx.fillStyle = '#cdbde0'; ctx.font = '600 30px "Hanken Grotesk", system-ui, sans-serif';
  ctx.fillText(guests.length ? 'Guests' : 'Lineup to be announced', W / 2, y + 74);

  const top = y + 120;
  const imgs = await Promise.all(guests.map((g) => (safe(g.photo) ? loadImage(g.photo) : null)));
  guests.forEach((g, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, guests.length - row * cols), col = i - row * cols;
    const cx = W / 2 + (col - (inRow - 1) / 2) * cell;
    const cy = top + Math.floor(i / cols) * rowH + D / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#4a2a6e'; ctx.fillRect(cx - D / 2, cy - D / 2, D, D);
    const img = imgs[i];
    if (img) { const r = cropRect(img.naturalWidth, img.naturalHeight, D, g); ctx.drawImage(img, cx - D / 2 + r.left, cy - D / 2 + r.top, r.width, r.height); }
    else { ctx.fillStyle = '#f6effb'; ctx.font = `700 ${Math.round(D * 0.36)}px "Bricolage Grotesque", system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText(initials(g.name), cx, cy + 2); ctx.textBaseline = 'alphabetic'; }
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = '#f2b035'; ctx.beginPath(); ctx.arc(cx, cy, D / 2 + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f6effb';
    fit(g.name, cell - 24, 30, 650);
    ctx.fillText(g.name, cx, cy + D / 2 + 46);
  });
  ctx.fillStyle = 'rgba(205,189,224,.7)'; ctx.font = '500 24px "Hanken Grotesk", system-ui, sans-serif';
  ctx.fillText('Made with The Vault', W / 2, H - 44);
  return canvas;
}
