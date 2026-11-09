// Imágenes del juego: íconos de estadística y ambientes. Cada una se busca en /img/<nombre>.png;
// si el archivo no existe se usa un dibujo provisorio (emoji).
// Todas las imágenes existen en /img y el service worker las guarda: se dibujan desde el primer cuadro (sin emoji provisorio ni parpadeo)
// y se precargan/decodifican al abrir la app para que al volver de otra ventana ya estén listas.
const KNOWN = new Set(['ambiente_bano', 'ambiente_cocina', 'ambiente_habitacion', 'ambiente_living', 'ambiente_oficina', 'ambiente_patio', 'icono_agua', 'icono_comida', 'icono_disciplina', 'icono_fuerza', 'icono_inteligencia', 'icono_juegos', 'icono_logro', 'icono_orden', 'icono_titulo', 'icono_vitalidad', 'sombra_bestia', 'sombra_gym', 'sombra_heroe']);
export const onAssets = () => {};
export const url = n => `/img/${n}.png`;
const warm = [...KNOWN].map(n => { const im = new Image(); im.src = url(n); im.decode?.().catch(() => {}); return im; });
export const has = name => KNOWN.has(name);
export const STAT = { F: 'fuerza', I: 'inteligencia', V: 'vitalidad', D: 'disciplina', O: 'orden' };
const EMOJI = { F: '💪', I: '📖', V: '🌿', D: '⛓️', O: '🧹' };
/** Ícono de estadística (imagen o emoji si falta). */
export const iconTag = (c, k = 2) => has(`icono_${STAT[c]}`) ? `<img class="ico" alt="" src="${url(`icono_${STAT[c]}`)}" width="${16 * k}" height="${16 * k}">` : `<span class="ico fb">${EMOJI[c]}</span>`;
export const ROOMS = [['cocina', 'Cocina', '🍳', '#e0a060'], ['bano', 'Baño', '🛁', '#6fb3d8'], ['habitacion', 'Habitación', '🛏️', '#9a86d8'], ['living', 'Living', '🛋️', '#d87f6f'], ['oficina', 'Oficina', '💻', '#6fa8a0'], ['patio', 'Patio', '🌳', '#7fbf6a']];
export const roomTile = id => { const r = ROOMS.find(x => x[0] === id), n = 'ambiente_' + id;
  return has(n) ? `<img class="px tile" alt="${r[1]}" src="${url(n)}">` : `<span class="tile fb" style="background:linear-gradient(${r[3]},color-mix(in srgb,${r[3]} 55%,#000))">${r[2]}</span>`; };
