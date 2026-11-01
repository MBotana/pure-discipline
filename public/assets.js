// Imágenes del juego. Cada una se busca en /img/<nombre>.png; si el archivo no existe se usa un dibujo provisorio.
// Para reemplazar un dibujo basta con subir el archivo con el nombre exacto (ver img/LEEME.md).
import { px } from '/px.js';
import { heroSVG, petSVG, enemySVG, iconSVG, towerSVG, towerSceneSVG, farSVG, nearSVG, zoneOf, zone12, ZONES } from '/art.js';
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
export const exists = name => new Promise(res => { const im = new Image(); im.onload = () => { state.set(name, 'y'); res(true); }; im.onerror = () => { state.set(name, 'n'); res(false); }; im.src = url(name); });
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
/** Carga de antemano las imágenes del héroe (para que nunca se vea un dibujo provisorio mientras llegan). */
export function preloadHero() {
  const names = [];
  for (let e = 1; e <= 3; e++) { const b = `heroe_t1_e${e}`; names.push(b); POSES.forEach(p => names.push(`${b}_${p}`)); for (const g of ['caminar', 'correr', 'sprint', 'respirar']) for (let n = 1; n <= 8; n++) names.push(`${b}_${g}_${n}`); }
  return Promise.race([Promise.all(names.map(exists)), new Promise(r => setTimeout(r, 4000))]);
}

// ---- nombres y reglas ----
export const STAT = { F: 'fuerza', I: 'inteligencia', V: 'vitalidad', D: 'disciplina', O: 'orden' };
export const PETS = { F: { key: 'behemot', name: 'Behemot' }, I: { key: 'esfinge', name: 'Esfinge' }, V: { key: 'fenix', name: 'Fénix' }, D: { key: 'grifo', name: 'Grifo' }, O: { key: 'qilin', name: 'Qilin' } };
const STARTS = [1, 10, 20, 25, 35, 45, 50, 60, 70, 75, 85, 95];
/** Armadura (1-4) y etapa (1-3) según el piso. */
export function heroLook(floor) { let i = 0; STARTS.forEach((s, k) => { if (floor >= s) i = k; }); return { t: Math.floor(i / 3) + 1, e: (i % 3) + 1 }; }
export const Z12 = ZONES;
export const bgName = floor => 'fondo_' + String(zone12(floor)).padStart(2, '0');
export const BOSSES = [25, 50, 75, 100];
// Las armaduras 2 a 4 todavía no tienen imágenes: mientras tanto se usa la de gladiador de la misma etapa.
export const heroBase = floor => { const { t, e } = heroLook(floor); return t > 1 && !has(`heroe_t${t}_e${e}`) ? `heroe_t1_e${e}` : `heroe_t${t}_e${e}`; };
export const POSES = ['diaria', 'semanal', 'mensual', 'mueca'];

const tag = (name, fb, w, h, k, cls) => `<img class="px ${cls}" alt="" src="${has(name) ? url(name) : fb()}" width="${w * k}" height="${h * k}">`;
const sp = (name, fb, w, style, cls) => `<img class="px sp ${cls}" alt="" src="${has(name) ? url(name) : fb()}" style="--w:${w};${style}">`;

// ---- héroe: 32×40 ----
/** Devuelve {src, hop}: la imagen del héroe (con pose) o, si falta la pose, el sprite base saltando. */
export function heroSrc(floor, pose = '', crown = false) {
  const base = heroBase(floor);
  if (pose && has(`${base}_${pose}`)) return { src: url(`${base}_${pose}`), hop: false };
  if (has(base)) return { src: url(base), hop: !!pose };
  return { src: BLANK, hop: false };
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
  return `<img class="px hero ${cls}" alt="" src="${BLANK}" ${size}>`;
}
// Las respiraciones avanzan solas en cualquier pantalla donde aparezcan.
setInterval(() => document.querySelectorAll('img.breathe').forEach(el => {
  if (el.dataset.pose) return;
  const fr = JSON.parse(el.dataset.frames), k = ((+el.dataset.k || 0) + 1) % fr.length; el.dataset.k = k; el.src = fr[k];
}), 220);
// ---- mascotas: tamaño según el nivel (n0 huevo 32, n1-n2 chica 24, n3-n4 intermedia 40, n5 grande 64) ----
const petFb = (c, lv) => () => px(petSVG(c, lv, 32), 32, 32);
export const petName = (c, lv) => `mascota_${PETS[c].key}_n${lv}`;
const PET_PX = { 0: 32, 1: 24, 2: 24, 3: 40, 4: 40, 5: 64 };
/** Ancho mostrado en la escena de 240 (la de 64 px se reduce para entrar en la franja). */
const PET_ARENA = { 0: 32, 1: 24, 2: 24, 3: 34, 4: 34, 5: 48 };
const FLYERS = ['fenix', 'qilin'];
/** Píxeles reales del archivo (32 si todavía es el dibujo provisorio). */
export const petPx = (c, lv) => has(petName(c, lv)) ? (PET_PX[lv] || 32) : 32;
export const petArenaW = (c, lv) => has(petName(c, lv)) ? (PET_ARENA[lv] || 32) : 32;
const petW = (c, lv, k) => (has(petName(c, lv)) ? (PET_ARENA[lv] || 32) : 32) * k;
export const petTag = (c, lv, k = 2, cls = '') => { const s = petPx(c, lv), kk = Math.max(1, Math.round(k * 32 / s)); return tag(petName(c, lv), petFb(c, lv), s, s, kk, cls); };
/** Las que vuelan van un poco en el aire. */
const lift = (c, style) => FLYERS.includes(PETS[c].key) ? `${style};bottom:calc(14 * 100cqw / 240)` : style;
export const petSprite = (c, lv, style, k = 1) => sp(petName(c, lv), petFb(c, lv), petW(c, lv, k), lift(c, style), 'pet');
/** Solo el rostro (recorte [x, y, lado] en fracciones del sprite, mirando a la derecha); ajustar cuando estén las imágenes finales. */
const FACE = { behemot: [0.5, 0.02, 0.5], esfinge: [0.45, 0.0, 0.5], fenix: [0.5, 0.0, 0.5], grifo: [0.5, 0.0, 0.5], qilin: [0.5, 0.02, 0.5] };
export function petFace(c, lv, k = 2, cls = '') {
  const n = petName(c, lv);
  if (lv === 0 || !has(n)) return petTag(c, lv, k, cls);
  const [x, y, s] = FACE[PETS[c].key] || [0.5, 0, 0.5], cs = 24 * k;
  return `<span class="pface ${cls}" style="--s:${cs}px"><img class="px" alt="" src="${url(n)}" style="width:${cs / s}px;left:${-x / s * cs}px;top:${-y / s * cs}px"></span>`;
}
/** Cuadros de carrera / vuelo de la mascota (mascota_X_nN_correr_1..8); sin ellos queda el sprite quieto con rebote. */
export function petRunFrames(c, lv) {
  const n = petName(c, lv), real = [];
  for (let i = 1; i <= 8; i++) { if (has(`${n}_correr_${i}`)) real.push(url(`${n}_correr_${i}`)); else break; }
  return real.length >= 2 ? real : null;
}
export const petRunner = (c, lv, style, k = 1) => { const fr = petRunFrames(c, lv); if (!fr) return petSprite(c, lv, style, k).replace('class="px sp pet"', 'class="px sp pet running"');
  return `<img class="px sp pet running framed" alt="" src="${fr[0]}" data-frames='${JSON.stringify(fr)}' style="--w:${petW(c, lv, k)};${lift(c, style)}">`; };
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
  return { frames: [BLANK], bob: false, w: 32, gait };
}
/** Capas del fondo (cada imagen se repite sin cortes): lejana (opcional) y cercana. */
export function scrollLayers(floor, tNear) {
  const n = bgName(floor), z = Z12[zone12(floor) - 1], main = has(n), far = has(n + '_lejos');
  const lay = (cls, t, src) => `<div class="scroll ${cls}" style="--t:${t}s"><img class="px" alt="" src="${src}"><img class="px" alt="" src="${src}"></div>`;
  if (main && !far) return lay('near', tNear, url(n));
  return lay('far', (tNear * 2.2).toFixed(2), far ? url(n + '_lejos') : px(farSVG(z), 240, 64)) + lay('near', tNear, main ? url(n) : px(nearSVG(z), 240, 64));
}

// ---- imagen de la torre por zona: 240×96 (torre_zona_01 … 12). Si falta, se dibuja una provisoria ----
export const zoneTowerSrc = floor => { const n = 'torre_zona_' + String(zone12(floor)).padStart(2, '0'); return has(n) ? url(n) : px(towerSceneSVG(zoneOf(floor), floor), 240, 96); };
