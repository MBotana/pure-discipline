// Imágenes del juego. Cada una se busca en /img/<nombre>.png; si el archivo no existe se usa un dibujo provisorio.
// Para reemplazar un dibujo basta con subir el archivo con el nombre exacto (ver img/LEEME.md).
import { px } from '/px.js';
import { heroSVG, petSVG, enemySVG, iconSVG, towerSVG, farSVG, nearSVG, zoneOf, zone12, ZONES } from '/art.js';
export { zone12 };

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
/** Prueba de existencia que espera el resultado (para los cuadros de la apertura). */
export const exists = name => new Promise(res => { const im = new Image(); im.onload = () => { state.set(name, 'y'); res(true); }; im.onerror = () => res(false); im.src = url(name); });

// ---- nombres y reglas ----
export const STAT = { F: 'fuerza', I: 'inteligencia', V: 'vitalidad', D: 'disciplina', O: 'orden' };
export const PETS = { F: { key: 'behemot', name: 'Behemot' }, I: { key: 'esfinge', name: 'Esfinge' }, V: { key: 'fenix', name: 'Fénix' }, D: { key: 'grifo', name: 'Grifo' }, O: { key: 'qilin', name: 'Qilin' } };
const STARTS = [1, 10, 20, 25, 35, 45, 50, 60, 70, 75, 85, 95];
/** Armadura (1-4) y etapa (1-3) según el piso. */
export function heroLook(floor) { let i = 0; STARTS.forEach((s, k) => { if (floor >= s) i = k; }); return { t: Math.floor(i / 3) + 1, e: (i % 3) + 1 }; }
export const Z12 = ZONES;
export const bgName = floor => 'fondo_' + String(zone12(floor)).padStart(2, '0');
export const BOSSES = [25, 50, 75, 100];
export const heroBase = floor => { const { t, e } = heroLook(floor); return `heroe_t${t}_e${e}`; };
export const POSES = ['diaria', 'semanal', 'mensual', 'mueca'];

const tag = (name, fb, w, h, k, cls) => `<img class="px ${cls}" alt="" src="${has(name) ? url(name) : fb()}" width="${w * k}" height="${h * k}">`;
const sp = (name, fb, w, style, cls) => `<img class="px sp ${cls}" alt="" src="${has(name) ? url(name) : fb()}" style="--w:${w};${style}">`;

// ---- héroe: 32×40 ----
/** Devuelve {src, hop}: la imagen del héroe (con pose) o, si falta la pose, el sprite base saltando. */
export function heroSrc(floor, pose = '', crown = false) {
  const base = heroBase(floor);
  if (pose && has(`${base}_${pose}`)) return { src: url(`${base}_${pose}`), hop: false };
  if (has(base)) return { src: url(base), hop: !!pose };
  return { src: px(heroSVG('a', crown, pose), 32, 40), hop: false };
}
export const heroSprite = (floor, style, crown, k = 1) => { const r = heroSrc(floor, '', crown); return `<img class="px sp hero idle" alt="" src="${r.src}" style="--w:${32 * k};${style}">`; };
/** Cuadros numerados que existan (nombre_1, nombre_2…), cortando en el primero que falte. */
const seq = (name, max = 12) => { const r = []; for (let n = 1; n <= max; n++) { if (has(`${name}_${n}`)) r.push(url(`${name}_${n}`)); else break; } return r; };
/** Respiración de frente (heroe_tX_eY_respirar_1..8, 32×40) para las vistas del personaje. */
export const breathFrames = floor => { const r = seq(`${heroBase(floor)}_respirar`); return r.length >= 2 ? r : null; };
/** Héroe quieto (sin lienzo): para la franja chica, Estadísticas, etc. Respira si hay cuadros; si no, sube y baja suavemente. */
export const heroImgTag = (floor, k = 2, crown = false, cls = '') => heroTag(floor, k, cls, crown);
export function heroTag(floor, k = 2, cls = '', crown = false) {
  const br = breathFrames(floor), size = `width="${32 * k}" height="${40 * k}"`;
  if (br) return `<img class="px hero breathe ${cls.replace(/\bidle\b/, '')}" alt="" src="${br[0]}" data-frames='${JSON.stringify(br)}' ${size}>`;
  return `<img class="px hero idle ${cls}" alt="" src="${heroSrc(floor, '', crown).src}" ${size}>`;
}
// Las respiraciones avanzan solas en cualquier pantalla donde aparezcan.
setInterval(() => document.querySelectorAll('img.breathe').forEach(el => {
  if (el.dataset.pose) return;
  const fr = JSON.parse(el.dataset.frames), k = ((+el.dataset.k || 0) + 1) % fr.length; el.dataset.k = k; el.src = fr[k];
}), 220);
// ---- mascotas: 32×32 ----
const petFb = (c, lv) => () => px(petSVG(c, lv, 32), 32, 32);
export const petName = (c, lv) => `mascota_${PETS[c].key}_n${lv}`;
export const petTag = (c, lv, k = 2, cls = '') => tag(petName(c, lv), petFb(c, lv), 32, 32, k, cls);
export const petSprite = (c, lv, style, k = 1) => sp(petName(c, lv), petFb(c, lv), 32 * k, style, 'pet');
/** Cuadros de carrera de la mascota (mascota_X_nN_correr_1..4); sin ellos queda el sprite quieto con rebote. */
export function petRunFrames(c, lv) {
  const n = petName(c, lv), real = [];
  for (let i = 1; i <= 4; i++) { if (has(`${n}_correr_${i}`)) real.push(url(`${n}_correr_${i}`)); else break; }
  return real.length >= 2 ? real : null;
}
export const petRunner = (c, lv, style, k = 1) => { const fr = petRunFrames(c, lv); if (!fr) return petSprite(c, lv, style, k).replace('class="px sp pet"', 'class="px sp pet running"');
  return `<img class="px sp pet running framed" alt="" src="${fr[0]}" data-frames='${JSON.stringify(fr)}' style="--w:${32 * k};${style}">`; };
export const heroRunner = (floor, style, crown, k = 1, gait = 'caminar') => { const rf = runFrames(floor, crown, gait);
  return `<img class="px sp hero running ${rf.bob ? 'bob' : ''} ${rf.w > 32 ? 'wide' : ''}" alt="" src="${rf.frames[0]}" data-frames='${JSON.stringify(rf.frames)}' style="--w:${rf.w * k};${style}">`; };
// ---- jefes: 48×48 ----
export const bossName = floor => `jefe_${floor}`;
export const bossSprite = (floor, style, k = 1) => sp(bossName(floor), () => px(enemySVG(Z12[zone12(floor) - 1]).replace('viewBox="0 0 56 48"', 'viewBox="0 -4 56 56"'), 48, 48), 48 * k, style, 'boss');
// ---- íconos de estadística: 16×16 ----
export const iconTag = (c, k = 2) => tag(`icono_${STAT[c]}`, () => px(iconSVG(c), 16, 16), 16, 16, k, 'ico');
// ---- fondos y torre: 240×64 ----
export const bgLayer = (name, fb, cls = 'bg') => { const ok = has(name), src = ok ? url(name) : fb ? fb() : ''; return src ? `<img class="px ${cls}" alt="" src="${src}">` : ''; };
export const towerFb = open => () => px(towerSVG(open), 240, 64);
export const towerLayer = (name, open, cls = 'door') => bgLayer(name, towerFb(open), cls);

// ---- ambientes (misión de Orden): 48×48 ----
export const ROOMS = [['cocina', 'Cocina', '🍳', '#e0a060'], ['bano', 'Baño', '🛁', '#6fb3d8'], ['habitacion', 'Habitación', '🛏️', '#9a86d8'], ['living', 'Living', '🛋️', '#d87f6f'], ['oficina', 'Oficina', '💻', '#6fa8a0'], ['patio', 'Patio', '🌳', '#7fbf6a']];
export const roomTile = id => { const r = ROOMS.find(x => x[0] === id), n = 'ambiente_' + id;
  return has(n) ? `<img class="px tile" alt="${r[1]}" src="${url(n)}">` : `<span class="tile fb" style="background:linear-gradient(${r[3]},color-mix(in srgb,${r[3]} 55%,#000))">${r[2]}</span>`; };

// ---- carrera y fondo en movimiento ----
/** Marcha según la racha mensual: sin racha camina, con 1-2 meses corre, con 3 o más hace sprint. */
export const gaitFor = s => s >= 3 ? 'sprint' : s >= 1 ? 'correr' : 'caminar';
/** Milisegundos por cuadro de cada marcha. */
export const GAIT_MS = { caminar: 110, correr: 80, sprint: 60 };
/** Cuadros de la marcha del héroe (heroe_tX_eY_<marcha>_N, 48×40); si falta esa marcha usa la más cercana,
 *  después el sprite quieto con rebote y por último dos provisorios. */
export function runFrames(floor, crown, gait = 'caminar') {
  const base = heroBase(floor), order = { caminar: ['caminar', 'correr', 'sprint'], correr: ['correr', 'sprint', 'caminar'], sprint: ['sprint', 'correr', 'caminar'] }[gait] || ['caminar'];
  for (const g of order) { const fr = seq(`${base}_${g}`); if (fr.length >= 2) return { frames: fr, bob: false, w: 48, gait: g }; }
  if (has(base)) return { frames: [url(base)], bob: true, w: 32, gait };
  return { frames: [px(heroSVG('a', crown, 'run1'), 32, 40), px(heroSVG('a', crown, 'run2'), 32, 40)], bob: false, w: 32, gait };
}
/** Capas del fondo (cada imagen se repite sin cortes): lejana (opcional) y cercana. */
export function scrollLayers(floor, tNear) {
  const n = bgName(floor), z = Z12[zone12(floor) - 1], main = has(n), far = has(n + '_lejos');
  const lay = (cls, t, src) => `<div class="scroll ${cls}" style="--t:${t}s"><img class="px" alt="" src="${src}"><img class="px" alt="" src="${src}"></div>`;
  if (main && !far) return lay('near', tNear, url(n));
  return lay('far', (tNear * 2.2).toFixed(2), far ? url(n + '_lejos') : px(farSVG(z), 240, 64)) + lay('near', tNear, main ? url(n) : px(nearSVG(z), 240, 64));
}
