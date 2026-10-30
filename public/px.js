// Convierte los dibujos vectoriales en pixel art: se rasterizan a baja resolución, se recorta el borde difuso y se reducen los colores.
// La primera vez devuelve un cuadro transparente y avisa cuando está listo para volver a dibujar.
const cache = new Map();
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
let onReady = () => {}, queued = false;
export const setReadyHandler = fn => { onReady = fn; };
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };

export function px(svg, w, h) {
  const key = `${hash(svg)}:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, BLANK);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 100) { a[i + 3] = 0; continue; }
      a[i + 3] = 255;
      for (let k = 0; k < 3; k++) a[i + k] = Math.min(255, Math.round(a[i + k] / 34) * 34);
    }
    x.putImageData(d, 0, 0); cache.set(key, c.toDataURL());
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; onReady(); }); }
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return BLANK;
}
