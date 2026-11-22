// Floor plan image helpers (browser only). Images are shrunk before saving so they stay small on this device.
const MAX_SIDE = 1800;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export async function compressImage(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be opened. Use a JPG or PNG.'); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.84);
}

let pdfLoading;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  pdfLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS; s.crossOrigin = 'anonymous';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfLoading = null; reject(new Error('The PDF reader could not load. Connect to the internet and try again, or upload the plan as an image.')); };
    document.head.append(s);
  });
  return pdfLoading;
}

/** Renders up to 12 pages. Returns { pages, truncated }. */
export async function pdfToImages(file, maxPages = 12) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1.7, MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(canvas.toDataURL('image/jpeg', 0.84));
  }
  return { pages, truncated: pdf.numPages > maxPages };
}
