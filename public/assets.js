// Imágenes del juego. Cada una se busca en /img/<nombre>.png; si el archivo no existe se usa un dibujo provisorio.
// Para reemplazar un dibujo basta con subir el archivo con el nombre exacto (ver img/LEEME.md).
import { px } from '/px.js';
import { heroSVG, petSVG, enemySVG, iconSVG, towerSVG, zoneOf } from '/art.js';

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
const ZSTART = [1, 11, 25, 26, 36, 50, 51, 61, 75, 76, 86, 100];
export const zone12 = floor => { let z = 1; ZSTART.forEach((s, k) => { if (floor >= s) z = k + 1; }); return z; };
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
export const heroSprite = (floor, style, crown) => { const r = heroSrc(floor, '', crown); return `<img class="px sp hero" alt="" src="${r.src}" style="--w:32;${style}">`; };
// ---- mascotas: 32×32 ----
const petFb = (c, lv) => () => px(petSVG(c, lv, 32), 32, 32);
export const petName = (c, lv) => `mascota_${PETS[c].key}_n${lv}`;
export const petTag = (c, lv, k = 2) => tag(petName(c, lv), petFb(c, lv), 32, 32, k, '');
export const petSprite = (c, lv, style) => sp(petName(c, lv), petFb(c, lv), 32, style, 'pet');
// ---- jefes: 48×48 ----
export const bossName = floor => `jefe_${floor}`;
export const bossSprite = (floor, style) => sp(bossName(floor), () => px(enemySVG(zoneOf(floor)).replace('viewBox="0 0 56 48"', 'viewBox="0 -4 56 56"'), 48, 48), 48, style, 'boss');
// ---- íconos de estadística: 16×16 ----
export const iconTag = (c, k = 2) => tag(`icono_${STAT[c]}`, () => px(iconSVG(c), 16, 16), 16, 16, k, 'ico');
// ---- fondos y torre: 240×64 ----
export const bgLayer = (name, fb, cls = 'bg') => { const ok = has(name), src = ok ? url(name) : fb ? fb() : ''; return src ? `<img class="px ${cls}" alt="" src="${src}">` : ''; };
export const towerFb = open => () => px(towerSVG(open), 240, 64);
export const towerLayer = (name, open, cls = 'door') => bgLayer(name, towerFb(open), cls);
