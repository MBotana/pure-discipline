// Ilustraciones vectoriales originales (SVG). Estilo: formas suaves, contorno oscuro, color plano con un toque de brillo.
const INK = '#1b1f3a';
export const ZONES = [
  { n: 'Ruinas en llamas', sky: ['#2a0d0d', '#8a2a10'], far: '#4a1a12', gr: '#3a2a2a', gr2: '#6a2a1a', ac: '#ff6a2a' },
  { n: 'Ruinas', sky: ['#bfe3ff', '#fff4dc'], far: '#b8a88a', gr: '#a89878', gr2: '#7a6a50', ac: '#d8b878' },
  { n: 'Coliseo', sky: ['#e0a070', '#ffe3b8'], far: '#c08a5a', gr: '#d2a766', gr2: '#a8803f', ac: '#c0452a' },
  { n: 'Batalla', sky: ['#8aa0b8', '#d8d8d0'], far: '#7a8a70', gr: '#6a8a4a', gr2: '#4a6a30', ac: '#c0c8d0' },
  { n: 'Campo de guerra', sky: ['#6a6a78', '#b0a8a0'], far: '#6a6258', gr: '#5a5a3e', gr2: '#3e3e2a', ac: '#8a8a7a' },
  { n: 'Llanura del león', sky: ['#ffd27a', '#fff0c8'], far: '#d9b46a', gr: '#c9a24a', gr2: '#a07a28', ac: '#d89a2a' },
  { n: 'Montaña baja', sky: ['#4a4a60', '#8a8aa0'], far: '#5a5a70', gr: '#5a6a58', gr2: '#3e4e3e', ac: '#7a7a92' },
  { n: 'Montaña alta', sky: ['#7ac8ff', '#eaf8ff'], far: '#a8c8e8', gr: '#e6eef6', gr2: '#b8cde0', ac: '#7cc8ff' },
  { n: 'Cima', sky: ['#8a96b0', '#d8dce8'], far: '#7a8298', gr: '#b0b8c8', gr2: '#8892a8', ac: '#8a909c' },
  { n: 'Camino del cielo', sky: ['#6ab8ff', '#fff2d8'], far: '#cfe6ff', gr: '#f4eedc', gr2: '#d8cfae', ac: '#ffd36b' },
  { n: 'Camino de ángeles', sky: ['#9ad0ff', '#fff6d0'], far: '#e8f2ff', gr: '#fff6dc', gr2: '#e8d89a', ac: '#ffffff' },
  { n: 'Trono de Zeus', sky: ['#3a2f7a', '#ffd36b'], far: '#6a4fb0', gr: '#f0dca0', gr2: '#c8a840', ac: '#ffd36b' },
];
const ZSTART = [1, 11, 25, 26, 36, 50, 51, 61, 75, 76, 86, 100];
export const zone12 = floor => { let z = 1; ZSTART.forEach((s, k) => { if (floor >= s) z = k + 1; }); return z; };
export const zoneOf = floor => ZONES[zone12(floor) - 1];


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
  if (level <= 0) return `<svg viewBox="-4 -6 56 56" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 2)"><ellipse cx="24" cy="43" rx="12" ry="3" fill="#000" opacity=".25"/><path d="M24 5c9 0 15 14 15 24 0 8-7 13-15 13S9 37 9 29C9 19 15 5 24 5z" fill="#f5f0e6" stroke="${INK}" stroke-width="2.4"/><path d="M12 28c4 3 7-3 12 0s9-3 13 0" stroke="${p.c}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="19" cy="18" r="2.4" fill="${p.c2}"/><circle cx="29" cy="22" r="2" fill="${p.c}"/></g></svg>`;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 56 56" width="${s}" height="${s}" aria-label="${p.name} nivel ${level}"><g transform="translate(24 46) scale(${scale}) translate(-24 -46)">
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

// ---- provisorios para el período previo al inicio ----
/** Escena 240×64: torre abajo a la izquierda, cerrada o abierta. */
export function towerSVG(open) {
  return `<svg viewBox="0 0 240 64" width="240" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="64" fill="#1c1630"/><rect y="50" width="240" height="14" fill="#2c2a3e"/><rect y="50" width="240" height="3" fill="#403d58"/>
  <path d="M6 54V14h6V8h5v6h5V8h5v6h5V8h5v6h6v40z" fill="#5a5470" stroke="${INK}" stroke-width="1.4"/>
  <path d="M14 54V32c0-7 4-11 9-11s9 4 9 11v22z" fill="${open ? '#ffd36b' : '#3a2616'}" stroke="${INK}" stroke-width="1.4"/>
  ${open ? '<path d="M18 54l5-22 5 22z" fill="#fff3b0"/>' : '<path d="M23 21v33M14 36h18M14 44h18" stroke="#8a6a3b" stroke-width="1.2"/><circle cx="26" cy="40" r="1.4" fill="#ffc442"/>'}
  <circle cx="34" cy="12" r="1" fill="#fff"/><circle cx="120" cy="8" r="1" fill="#fff"/><circle cx="190" cy="14" r="1" fill="#fff"/></svg>`;
}
const ICON = {
  F: `<rect x="1" y="6" width="3" height="4" fill="#e2574c"/><rect x="4" y="4" width="2" height="8" fill="#ff8f84"/><rect x="6" y="7" width="4" height="2" fill="#c3c9dc"/><rect x="10" y="4" width="2" height="8" fill="#ff8f84"/><rect x="12" y="6" width="3" height="4" fill="#e2574c"/>`,
  I: `<path d="M2 3h5v10H2zM9 3h5v10H9z" fill="#6a5cf0"/><path d="M3 5h3M3 7h3M10 5h3M10 7h3" stroke="#fff" stroke-width="1"/>`,
  V: `<path d="M8 14C2 9 1 6 1 4.5A3.5 3.5 0 018 3a3.5 3.5 0 017 1.5C15 6 14 9 8 14z" fill="#f0502c"/><path d="M3 5a2 2 0 012-2" stroke="#ffc27a" stroke-width="1" fill="none"/>`,
  D: `<circle cx="8" cy="8" r="6.5" fill="#c3c9dc"/><circle cx="8" cy="8" r="4.5" fill="#7d869e"/><circle cx="8" cy="8" r="2.5" fill="#e8ebf6"/><circle cx="8" cy="8" r="1" fill="#e2574c"/>`,
  O: `<path d="M12 1l1.4 1.4-6 6" stroke="#8a5a2b" stroke-width="1.6" fill="none"/><path d="M4 8l5 1 1 5H3z" fill="#2fb5a0"/><path d="M5 11h4" stroke="#8fe6d6" stroke-width="1"/>`,
};
export const iconSVG = c => `<svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">${ICON[c]}</svg>`;

/** Provisorios del fondo en movimiento: capa lejana (cielo y colinas) y capa cercana (suelo). Ambas se repiten sin cortes cada 240 px. */
export function farSVG(z) {
  return `<svg viewBox="0 0 240 64" width="240" height="64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${z.sky[0]}"/><stop offset="1" stop-color="${z.sky[1]}"/></linearGradient></defs><rect width="240" height="64" fill="url(#g)"/>
  <path d="M0 50 Q30 30 60 50 T120 50 T180 50 T240 50 V64 H0z" fill="${z.far}"/><path d="M0 54 Q20 42 40 54 T80 54 T120 54 T160 54 T200 54 T240 54 V64 H0z" fill="${z.far}" opacity=".7"/>
  <circle cx="60" cy="14" r="2" fill="#fff" opacity=".8"/><circle cx="170" cy="20" r="1.5" fill="#fff" opacity=".8"/></svg>`;
}
export function nearSVG(z) {
  let s = `<svg viewBox="0 0 240 64" width="240" height="64" xmlns="http://www.w3.org/2000/svg"><rect y="52" width="240" height="12" fill="${z.gr}"/><rect y="52" width="240" height="3" fill="${z.gr2}"/>`;
  for (const x of [20, 80, 140, 200]) s += `<rect x="${x}" y="57" width="10" height="2" fill="${z.gr2}"/>`;
  for (const x of [50, 170]) s += `<path d="M${x} 52l3-6 3 6z" fill="${z.gr2}"/>`;
  return s + '</svg>';
}

/** Imagen provisoria de la zona con la torre (240×96): cielo, montañas, suelo y la torre con una marca en el piso actual. */
export function towerSceneSVG(z, floor = 1) {
  const gy = 84, top = 12, my = (gy - (gy - top) * Math.min(1, floor / 100)).toFixed(1);
  const mount = (c, o) => `<path d="M0 ${gy}V${58 + o}l22-20 18 12 26-26 30 30 20-12 34 24 28-22 30 18 32-14V${gy}z" fill="${c}"/>`;
  let s = `<svg viewBox="0 0 240 96" width="240" height="96" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${z.sky[0]}"/><stop offset="1" stop-color="${z.sky[1]}"/></linearGradient></defs><rect width="240" height="96" fill="url(#g)"/>`;
  s += mount(z.far, 8) + `<g opacity=".55">${mount(z.gr2, 22)}</g>`;
  s += `<rect y="${gy}" width="240" height="12" fill="${z.gr}"/><rect y="${gy}" width="240" height="3" fill="${z.gr2}"/>`;
  const tx = 150, w = 34, c1 = '#8d8aa3', c2 = '#6a6680', c3 = '#4a4660';
  s += `<path d="M${tx - w / 2 - 4} ${gy}V${top + 8}h-3V${top}h5v4h4V${top}h5v4h4V${top}h5v4h4V${top}h5v4h4V${top}h5v8h-3V${gy}z" transform="translate(0 0)" fill="${c1}" stroke="${INK}" stroke-width="1.4"/>`;
  s += `<rect x="${tx - w / 2 + 14}" y="${top + 8}" width="${w / 2 - 6}" height="${gy - top - 8}" fill="${c2}"/>`;
  for (let k = 0; k < 9; k++) s += `<rect x="${tx - 14}" y="${top + 12 + k * 8}" width="${w}" height="1" fill="${c3}" opacity=".7"/>`;
  for (let k = 0; k < 6; k++) s += `<rect x="${tx - 3 + (k % 2) * 8 - 4}" y="${top + 16 + k * 11}" width="4" height="6" fill="#241d36"/>`;
  s += `<path d="M${tx - 6} ${gy}V${gy - 14}c0-5 3-8 6-8s6 3 6 8V${gy}z" fill="#3a2616" stroke="${INK}" stroke-width="1.2"/>`;
  s += `<path d="M${tx} ${top}v-9" stroke="${INK}" stroke-width="1.4"/><path d="M${tx} ${top - 9}h9l-2 3 2 3h-9z" fill="${z.ac}" stroke="${INK}" stroke-width=".8"/>`;
  s += `<rect x="${tx - w / 2 - 8}" y="${my}" width="${w + 16}" height="2" fill="#ffd36b" stroke="${INK}" stroke-width=".6"/><circle cx="${tx - w / 2 - 8}" cy="${my}" r="2.4" fill="#ffd36b" stroke="${INK}" stroke-width=".8"/>`;
  s += `<text x="${tx + w / 2 + 12}" y="${+my + 3}" font-size="7" font-family="monospace" fill="#fff" stroke="${INK}" stroke-width=".5" paint-order="stroke">${floor}</text>`;
  return s + '</svg>';
}
