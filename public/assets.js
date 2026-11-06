// Imágenes del juego: íconos de estadística y ambientes. Cada una se busca en /img/<nombre>.png;
// si el archivo no existe se usa un dibujo provisorio (emoji).
const state = new Map(); let notify = () => {};
export const onAssets = f => { notify = f; };
export const url = n => `/img/${n}.png`;
/** true si el archivo existe (la primera consulta lo verifica en segundo plano y vuelve a dibujar). */
export function has(name) {
  const s = state.get(name);
  if (s === undefined) {
    state.set(name, 'p');
    const im = new Image();
    im.onload = () => { state.set(name, 'y'); notify(); };
    im.onerror = () => state.set(name, 'n');
    im.src = url(name);
    return false;
  }
  return s === 'y';
}
export const STAT = { F: 'fuerza', I: 'inteligencia', V: 'vitalidad', D: 'disciplina', O: 'orden' };
const EMOJI = { F: '💪', I: '📖', V: '🌿', D: '⛓️', O: '🧹' };
/** Ícono de estadística (imagen o emoji si falta). */
export const iconTag = (c, k = 2) => has(`icono_${STAT[c]}`) ? `<img class="ico" alt="" src="${url(`icono_${STAT[c]}`)}" width="${16 * k}" height="${16 * k}">` : `<span class="ico fb">${EMOJI[c]}</span>`;
export const ROOMS = [['cocina', 'Cocina', '🍳', '#e0a060'], ['bano', 'Baño', '🛁', '#6fb3d8'], ['habitacion', 'Habitación', '🛏️', '#9a86d8'], ['living', 'Living', '🛋️', '#d87f6f'], ['oficina', 'Oficina', '💻', '#6fa8a0'], ['patio', 'Patio', '🌳', '#7fbf6a']];
export const roomTile = id => { const r = ROOMS.find(x => x[0] === id), n = 'ambiente_' + id;
  return has(n) ? `<img class="px tile" alt="${r[1]}" src="${url(n)}">` : `<span class="tile fb" style="background:linear-gradient(${r[3]},color-mix(in srgb,${r[3]} 55%,#000))">${r[2]}</span>`; };
