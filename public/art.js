// Ilustraciones vectoriales originales (SVG). Estilo: formas suaves, contorno oscuro, color plano con un toque de brillo.
const INK = '#1b1f3a';
export const ZONES = [
  { n: 'Raíces', sky: ['#9ad6ff', '#e6f6ff'], far: '#7fc4a0', gr: '#5aa86f', gr2: '#3f8a56', ac: '#7bd389' },
  { n: 'Bosque', sky: ['#a7e0c4', '#f0fbea'], far: '#6fb58a', gr: '#4f9e63', gr2: '#357a49', ac: '#9be07a' },
  { n: 'Pantano', sky: ['#c3d9a8', '#f4f7df'], far: '#8fae74', gr: '#6d9a58', gr2: '#4d7b3f', ac: '#c7e06a' },
  { n: 'Colinas', sky: ['#ffd7a8', '#fff4e0'], far: '#d9a56b', gr: '#c68b4e', gr2: '#a06d36', ac: '#ffb347' },
  { n: 'Desierto', sky: ['#ffc7a0', '#ffe9d2'], far: '#e0a070', gr: '#d68f55', gr2: '#b46f3a', ac: '#ff8a4c' },
  { n: 'Cañón', sky: ['#f0a8a0', '#ffe1da'], far: '#c47866', gr: '#a85d4c', gr2: '#82443a', ac: '#ff6b5c' },
  { n: 'Cumbres', sky: ['#b7c4ff', '#eef0ff'], far: '#8f9ad6', gr: '#7683c4', gr2: '#5a66a8', ac: '#8aa0ff' },
  { n: 'Nieve', sky: ['#cfe8ff', '#f7fbff'], far: '#aac6e6', gr: '#d9e8f6', gr2: '#b6cde4', ac: '#7cc8ff' },
  { n: 'Tormenta', sky: ['#7c7fb8', '#c9cbe6'], far: '#5d6094', gr: '#4a4d80', gr2: '#363963', ac: '#b48cff' },
  { n: 'Cielo', sky: ['#3a2f7a', '#c18cff'], far: '#6a4fb0', gr: '#52399a', gr2: '#3b2878', ac: '#ffd36b' },
];
export const zoneOf = floor => ZONES[Math.min(9, Math.max(0, Math.floor((floor - 1) / 10)))];

export function heroSVG(frame = 'a', crown = false) {
  const lift = frame === 'a' ? [3, 0] : frame === 'b' ? [0, 3] : [0, 0];
  const atk = frame === 'atk';
  return `<svg viewBox="0 0 64 72" width="64" height="72" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="30" cy="68" rx="15" ry="3.2" fill="#000" opacity=".3"/>
  <rect x="22" y="53" width="8" height="${14 - lift[0]}" rx="3.5" fill="#3b3f73" stroke="${INK}" stroke-width="2.6"/><rect x="32" y="53" width="8" height="${14 - lift[1]}" rx="3.5" fill="#4a4f8c" stroke="${INK}" stroke-width="2.6"/>
  <g transform="translate(${atk ? 4 : 0} 0)"><path d="M18 56c-2-14 2-28 13-28s15 14 12 28c-8 3-17 3-25 0z" fill="#5865f2" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M24 46c4 3 11 3 15 0" stroke="#fff" stroke-opacity=".4" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <rect x="26" y="49" width="12" height="4" rx="2" fill="#ffc442" stroke="${INK}" stroke-width="1.8"/>
  <circle cx="31" cy="20" r="11" fill="#ffd9b8" stroke="${INK}" stroke-width="2.8"/>
  <path d="M19 21c-1-12 7-17 13-17s13 5 12 16c-4-5-9-7-13-7s-9 2-12 8z" fill="#3f4bd0" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  <circle cx="35" cy="22" r="2" fill="${INK}"/><circle cx="28" cy="22" r="2" fill="${INK}"/>
  <path d="M30 27c1.2 1 2.4 1 3.6 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  ${crown ? `<path d="M24 8l3-6 4 4 4-4 3 6z" fill="#ffc442" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` : ''}
  <g transform="${atk ? 'rotate(42 48 50)' : ''}"><rect x="46" y="20" width="5" height="28" rx="2" fill="#e8ecff" stroke="${INK}" stroke-width="2.4"/><rect x="42" y="46" width="13" height="5" rx="2" fill="#ffc442" stroke="${INK}" stroke-width="2.2"/><rect x="46" y="51" width="5" height="8" rx="2" fill="#7a4a2a" stroke="${INK}" stroke-width="2.2"/></g></g></svg>`;
}

const PET = {
  F: { c: '#e2574c', c2: '#ff8f84', name: 'Oso' }, I: { c: '#6a5cf0', c2: '#a69cff', name: 'Búho' },
  V: { c: '#f08a2c', c2: '#ffc27a', name: 'Zorro' }, D: { c: '#7d869e', c2: '#c3c9dc', name: 'Lobo' }, O: { c: '#2fb5a0', c2: '#8fe6d6', name: 'Gato' },
};
const FACE = {
  F: `<ellipse cx="24" cy="33.5" rx="6" ry="4.4" fill="#ffd9c7" stroke="${INK}" stroke-width="1.8"/><ellipse cx="24" cy="31.6" rx="2.3" ry="1.5" fill="${INK}"/>`,
  I: `<circle cx="18" cy="27" r="5.2" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cx="30" cy="27" r="5.2" fill="#fff" stroke="${INK}" stroke-width="1.8"/><path d="M21.4 31l2.6 4.4 2.6-4.4z" fill="#ffc442" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  V: `<path d="M8 30c6-1.5 11 2 16 7-7 1.5-13 0-16-7zM40 30c-6-1.5-11 2-16 7 7 1.5 13 0 16-7z" fill="#fff6e6" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="24" cy="35.5" r="2" fill="${INK}"/>`,
  D: `<ellipse cx="24" cy="34.5" rx="7" ry="5.2" fill="#e8ebf6" stroke="${INK}" stroke-width="1.8"/><ellipse cx="24" cy="32.2" rx="2.4" ry="1.6" fill="${INK}"/>`,
  O: `<path d="M4 29l10 2M4 35l10-2M44 29l-10 2M44 35l-10-2" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M22.4 31.6h3.2l-1.6 2z" fill="#ff8fa3" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
};
export function petSVG(cat, level, size = 56) {
  const p = PET[cat], s = size;
  if (level <= 0) return `<svg viewBox="0 -8 48 56" width="${s}" height="${s * 56 / 48}" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 2)"><ellipse cx="24" cy="43" rx="12" ry="3" fill="#000" opacity=".25"/><path d="M24 5c9 0 15 14 15 24 0 8-7 13-15 13S9 37 9 29C9 19 15 5 24 5z" fill="#f5f0e6" stroke="${INK}" stroke-width="2.4"/><path d="M12 28c4 3 7-3 12 0s9-3 13 0" stroke="${p.c}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="19" cy="18" r="2.4" fill="${p.c2}"/><circle cx="29" cy="22" r="2" fill="${p.c}"/></g></svg>`;
  const ears = { F: `<circle cx="13" cy="14" r="6" fill="${p.c}" stroke="${INK}" stroke-width="2.2"/><circle cx="35" cy="14" r="6" fill="${p.c}" stroke="${INK}" stroke-width="2.2"/>`,
    I: `<path d="M12 8l5 8-9 2z M36 8l-5 8 9 2z" fill="${p.c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
    V: `<path d="M11 5l8 11-11 1z M37 5l-8 11 11 1z" fill="${p.c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
    D: `<path d="M10 6l9 9-12 3z M38 6l-9 9 12 3z" fill="${p.c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
    O: `<path d="M10 6l8 10-10 3z M38 6l-8 10 10 3z" fill="${p.c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` }[cat];
  const extra = [
    '', '',
    `<path d="M14 36c3 4 17 4 20 0" stroke="#ffc442" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    `<path d="M14 36c3 4 17 4 20 0" stroke="#ffc442" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="24" cy="39.5" r="2.4" fill="#ffc442" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M14 36c3 4 17 4 20 0" stroke="#ffc442" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="24" cy="39.5" r="2.4" fill="#ffc442" stroke="${INK}" stroke-width="1.4"/><path d="M33 8l1.6 3.4 3.6.4-2.7 2.4.8 3.6-3.3-1.9-3.3 1.9.8-3.6-2.7-2.4 3.6-.4z" fill="#ffc442" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
    `<path d="M14 36c3 4 17 4 20 0" stroke="#ffc442" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M16 5l3-5 5 4 5-4 3 5z" fill="#ffc442" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
  ][Math.min(5, level)];
  const scale = 0.82 + level * 0.045;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 48 56" width="${s}" height="${s * 56 / 48}" aria-label="${p.name} nivel ${level}"><g transform="translate(24 46) scale(${scale}) translate(-24 -46)">
  ${level >= 5 ? `<circle cx="24" cy="26" r="22" fill="${p.c2}" opacity=".35"/>` : ''}<ellipse cx="24" cy="44" rx="13" ry="3" fill="#000" opacity=".16"/>
  ${ears}<ellipse cx="24" cy="30" rx="15" ry="13.5" fill="${p.c}" stroke="${INK}" stroke-width="2.4"/>
  <ellipse cx="24" cy="34" rx="9" ry="7" fill="${p.c2}" opacity=".7"/>${FACE[cat]}
  ${cat === 'I' ? '' : `<circle cx="18" cy="27" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="30" cy="27" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`}
  <circle cx="18.6" cy="27.4" r="1.2" fill="${INK}"/><circle cx="30.6" cy="27.4" r="1.2" fill="${INK}"/>
  ${cat === 'I' || cat === 'O' ? '' : `<path d="M21.5 36.4c1.6 1.4 3.4 1.4 5 0" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`}
  ${extra}</g></svg>`;
}

export function enemySVG(z) {
  return `<svg viewBox="0 0 56 48" width="56" height="48" xmlns="http://www.w3.org/2000/svg"><ellipse cx="28" cy="45" rx="17" ry="3" fill="#000" opacity=".18"/>
  <path d="M7 40c-3-14 6-30 21-30s24 16 21 30c-14 4-28 4-42 0z" fill="${z.ac}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M15 22c3-5 8-7 12-7" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="20" cy="29" r="3" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cx="36" cy="29" r="3" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cx="21" cy="30" r="1.3" fill="${INK}"/><circle cx="37" cy="30" r="1.3" fill="${INK}"/>
  <path d="M22 37c4-2 8-2 12 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}
export function gateSVG(open) {
  return `<svg viewBox="0 0 64 80" width="64" height="80" xmlns="http://www.w3.org/2000/svg"><path d="M6 78V32C6 14 18 4 32 4s26 10 26 28v46z" fill="#6b7280" stroke="${INK}" stroke-width="2.6"/>
  <path d="M14 78V34c0-12 8-20 18-20s18 8 18 20v44z" fill="${open ? '#ffd36b' : '#2b2f55'}" stroke="${INK}" stroke-width="2.2"/>
  ${open ? '' : `<rect x="23" y="44" width="18" height="16" rx="3" fill="#ffc442" stroke="${INK}" stroke-width="2"/><path d="M27 44v-5a5 5 0 0110 0v5" stroke="${INK}" stroke-width="2.4" fill="none"/>`}</svg>`;
}

/** Escena tipo "franja de héroe": zona según el piso, héroe caminando con su mascota; enemigo, o la puerta si estás bloqueado. */
export function sceneHTML({ floor, equipped, petLevel, blocked, done, tall = false }) {
  const z = zoneOf(floor);
  const style = `--sky1:${z.sky[0]};--sky2:${z.sky[1]};--far:${z.far};--gr:${z.gr};--gr2:${z.gr2}`;
  return `<div class="scene ${tall ? 'tall' : ''} ${blocked ? 'is-blocked' : ''}" style="${style}" role="img" aria-label="Zona ${z.n}, piso ${floor}">
  <svg class="hills" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 80V50c40-26 70-26 110-4s70 20 110-6 80-18 110 0 50 6 70-6v46z" fill="var(--far)" opacity=".75"/></svg>
  <div class="zone-tag">${z.n} · piso ${floor}</div>
  <div class="ground"></div>
  <div class="actors"><div class="pet-wrap">${petSVG(equipped, petLevel, 46)}</div><div class="hero-wrap">${heroSVG(done)}</div></div>
  <div class="foe">${blocked ? gateSVG(false) : done ? gateSVG(true) : enemySVG(z)}</div></div>`;
}

export const flagSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40"><rect x="4" y="4" width="4" height="34" fill="#8a5a2b" stroke="${INK}" stroke-width="2"/><path d="M8 5h20l-6 7 6 7H8z" fill="#d63a2f" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
