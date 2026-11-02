import { Engine, levelOf, cumXp, buildGates } from '/engine.js';
import { gateSVG, flagSVG, zoneOf, ZONES } from '/art.js';
import { ROOMS, roomTile, onAssets, exists, has, url, heroSrc, heroSprite, heroBase, petTag, petFace, petSprite, petArenaW, bossSprite, bgName, bgLayer, towerLayer, runFrames, petRunFrames, heroImgTag, scrollLayers, iconTag, PETS, BOSSES, gaitFor, GAIT_MS, preloadHero, zoneTowerSrc } from '/assets.js';
import { px, setReadyHandler } from '/px.js';
const IMG = (svg, w, h, k, cls = '') => `<img class="px ${cls}" alt="" src="${px(svg, w, h)}" width="${w * k}" height="${h * k}">`;
const gateImg = (open, k = 2) => IMG(gateSVG(open), 32, 40, k);
const flagImg = (k = 1) => IMG(flagSVG(), 16, 20, k, 'flag');

const NAMES = { F: 'Fuerza', I: 'Inteligencia', V: 'Vitalidad', D: 'Disciplina', O: 'Orden' };
const CATS = ['F', 'I', 'V', 'D', 'O'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const KEY = 'pd1';

// ---------- estado local (con respaldo en el servidor) ----------
let S = { token: '', startDate: '', days: {}, settings: {}, device: Math.random().toString(36).slice(2, 10), lastSync: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* sin almacenamiento */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignorar */ } };

const THEMES = [['gladiador', 'Gladiador', '#1b1210'], ['caballero', 'Caballero', '#0e1626']];
function applyTheme() {
  const t = THEMES.find(x => x[0] === S.theme) ? S.theme : 'gladiador';
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = THEMES.find(x => x[0] === t)[2];
}
applyTheme();
const DTEXT = ['Objetivos y prioridades definidos y estrategia planteada', 'Todos los proyectos iniciados y registrados', 'Todos los proyectos cerrados o pendientes a cerrar', 'Reportes realizados y mes entrante planificado', 'Revisión general hecha y ajustes aplicados'];
let modal = null, askedFor = '', showDone = false, lastTap = { k: '', t: 0 }, mtab = 'dia', tab = 'hoy', viewDate = todayISO(), syncMsg = '', syncing = false, errMsg = '', mode = null, timer = 0;

// ---------- fechas (UTC puro, sin zona horaria) ----------
function pad(n) { return String(n).padStart(2, '0'); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(iso, n) { const t = new Date(toUTC(iso) + n * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function dayIdx(iso) { return Math.round((toUTC(iso) - toUTC(S.startDate)) / 864e5); }
function nextMonday(iso) { const dow = (new Date(toUTC(iso)).getUTCDay() + 6) % 7; return dow === 0 ? iso : addDays(iso, 7 - dow); }
function pretty(iso) { const d = new Date(toUTC(iso)); const w = DOW[(d.getUTCDay() + 6) % 7]; return `${w} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; }

// ---------- motor ----------
function compute(upToIdx) {
  const e = new Engine({ startDate: S.startDate }); const results = [];
  for (let i = 0; i <= upToIdx; i++) {
    const inp = S.days[addDays(S.startDate, i)]?.input ?? {};
    results.push(e.processDay(i === 0 && S.preEquip && !inp.equip ? { ...inp, equip: S.preEquip } : inp));
  }
  return { e, results };
}

// ---------- edición ----------
function setInput(date, fn) {
  const cur = S.days[date] ?? { input: {}, updated_at: 0 };
  const input = { ...cur.input }; fn(input);
  for (const k of Object.keys(input)) if (input[k] === false || input[k] === undefined) delete input[k];
  S.days[date] = { input, updated_at: Date.now(), dirty: true };
  save(); render(); clearTimeout(timer); timer = setTimeout(sync, 1500);
}
/** Estado actual; antes del inicio es el estado de partida (todo en el mínimo). */
function current() {
  const i = dayIdx(todayISO());
  if (!S.startDate || i < 0) { const e = new Engine({ startDate: S.startDate || undefined }); if (S.preEquip) e.state.equipped = S.preEquip; return { e, st: e.state, pre: true }; }
  const { e } = compute(i); return { e, st: e.state, pre: false };
}
function dayGain(date) { const i = dayIdx(date); if (i < 0) return 0; return compute(i).results[i].events.reduce((a, x) => a + x.paid, 0); }
function hint(text) {
  let t = document.getElementById('hint');
  if (!t) { t = document.createElement('div'); t.id = 'hint'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1200);
}
const toggle = (date, key) => {
  document.getElementById('hint')?.classList.remove('show');
  const before = dayGain(date), wasOn = !!S.days[date]?.input?.[key];
  setInput(date, i => { i[key] = !i[key]; });
  if (wasOn) return;
  if (key === 'clean') { modal = { kind: 'room', date, before }; render(); return; }
  const idx = dayIdx(date), c = idx >= 0 ? compute(idx).results[idx].completed : null;
  fx(Math.round(dayGain(date) - before), c?.monthly.length ? 'mensual' : c?.weekly.length || c?.pet ? 'semanal' : 'diaria');
};

// ---------- sincronización ----------
async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'error ' + r.status), { status: r.status });
  return data;
}
async function sync() {
  if (!S.token || syncing) return; syncing = true;
  try {
    const changes = Object.entries(S.days).filter(([, v]) => v.dirty).map(([date, v]) => ({ date, input: v.input, updated_at: v.updated_at }));
    const r = await api('/api/sync', 'POST', { device: S.device, changes });
    for (const [date, remote] of Object.entries(r.days)) {
      const loc = S.days[date];
      if (!loc || remote.updated_at >= loc.updated_at) S.days[date] = { input: remote.input, updated_at: remote.updated_at };
    }
    for (const [date, v] of Object.entries(S.days)) if (v.dirty && changes.some(c => c.date === date && c.updated_at === v.updated_at)) delete v.dirty;
    S.settings = r.settings; if (r.settings.start_date) S.startDate = r.settings.start_date;
    S.lastSync = Date.now(); syncMsg = '';
  } catch (e) {
    syncMsg = e.status === 401 ? 'Clave inválida: volvé a ingresar.' : 'Sin conexión: se sincroniza más tarde.';
    if (e.status === 401) S.token = '';
  }
  syncing = false; save(); render();
}
const pending = () => Object.values(S.days).filter(v => v.dirty).length;

// ---------- vistas ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('es-AR');

function viewHoy() {
  if (!S.startDate) return '';
  const today = todayISO(), idx = dayIdx(viewDate);
  const title = '<h1>Misiones</h1>';
  const dow = (new Date(toUTC(viewDate)).getUTCDay() + 6) % 7, wkStart = addDays(viewDate, -dow), DK = ['gym', 'read', 'aero', 'clean', 'food'];
  const strip = Array.from({ length: 7 }, (_, i) => { const d = addDays(wkStart, i), inp = S.days[d]?.input ?? {}, n = DK.filter(k => inp[k]).length, off = d > today;
    return `<button class="wd ${d === viewDate ? 'sel' : ''} ${d === today ? 'tod' : ''} ${n === 5 ? 'full' : n ? 'some' : ''}" ${off ? 'disabled' : `data-act="day" data-d="${d}"`}><span>${'LMXJVSD'[i]}</span><b>${+d.slice(8)}</b><i></i></button>`; }).join('');
  const nav = `<div class="wk">${strip}</div><div class="daytitle">${viewDate === today ? 'Hoy' : 'Editando'} · ${pretty(viewDate)}${viewDate !== today ? ' · <a href="#" data-act="today">volver a hoy</a>' : ''}</div>`;
  const pre = dayIdx(today) < 0;
  if (idx < 0 && !pre) return `${title}${nav}<div class="card mute">Este día es anterior al inicio de tu torre.</div>`;
  const cur = pre ? current() : null, { e, results } = pre ? { e: cur.e, results: [{ floor: 1, events: [] }] } : compute(idx), st = e.state, r = results[pre ? 0 : idx], cfg = e.cfg;
  const dd = pre ? 0 : idx % 7, inp = pre ? {} : S.days[viewDate]?.input ?? {};
  const on = k => !!inp[k];
  const w = c => st.wu[c], m = c => st.mu[c];
  const gained = r.events.reduce((a, x) => a + x.paid, 0), lost = r.events.filter(x => x.outcome !== 'paid').reduce((a, x) => a + x.amount - x.paid, 0);
  const tick = k => !!inp[k];
  const ic = c => c === 'P' ? petFace(st.equipped, e.petLevel(st.equipped), 1) : iconTag(c, 2);
  const doneRows = [];
  const row = (k, cat, label, meta) => { if (tick(k)) { doneRows.push([k, cat, label]); return ''; } return `<button class="mrow" ${pre ? 'disabled' : `data-act="t" data-k="${k}"`}><span class="mic">${ic(cat)}</span><span class="mtx"><b>${label}</b><small>${meta}</small></span>${pre ? '' : '<span class="dbl">2×</span>'}</button>`; };
  const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, q) => `<i class="${q < n ? 'f' : ''}"></i>`).join('')}</span>`;
  const info = (cat, label, meta, right, done) => `<div class="mrow static ${done ? 'on' : ''}"><span class="mic">${ic(cat)}</span><span class="mtx"><b>${label}</b><small>${meta}</small></span>${right}<span class="chk">${done ? '✓' : ''}</span></div>`;
  const bar = (n, max) => `<span class="mini"><i style="width:${Math.min(100, n / max * 100)}%"></i></span>`;
  const sections = [['dia', 'Diarias'], ['sem', 'Semanales'], ['mes', 'Mensuales']];
  let h = title + nav;
  if (st.blocked !== null && viewDate === today) h += `<div class="banner">🔒 <b>Bloqueado en el piso ${st.blocked}.</b> No sumás XP hasta cumplir la puerta (mirá la pestaña Torre).</div>`;
  h += `<div class="sum"><span><small>XP del día</small><b>+${fmt(gained)}</b></span><span><small>Piso</small><b>${r.floor}</b></span><span><small>Racha</small><b>${st.s} ${st.s === 1 ? 'mes' : 'meses'}</b></span><span><small>Multiplicador</small><b>×${st.s >= 1 ? st.s + 1 : 1}</b></span></div>${lost > 0 ? `<div class="mute" style="margin:-6px 0 10px">No cobrada por bloqueo: ${fmt(lost)}</div>` : ''}`;
  h += `<div class="seg">${sections.map(([k, l]) => `<button class="${mtab === k ? 'on' : ''}" data-act="mtab" data-v="${k}">${l}</button>`).join('')}</div><!--fit-->`;
  const wi = pre ? { n: 1, of: 4 } : e.weekInfo(idx), games = st.gameWk, today0 = inp.gaming || 0;
  const petIc = c => petFace(c, e.petLevel(c), 1);
  if (mtab === 'dia') {
    const wk = dd < 5 ? '+50 XP' : 'solo suma a la semana', n = DK.filter(tick).length;
    h += `<div class="card slim"><div class="row"><h2>Misiones del día</h2><span class="pill ${n === 5 ? 'ok' : ''}">${n} / 5</span></div><div class="bar gold"><i style="width:${n * 20}%"></i></div>`;
    h += row('gym', 'F', 'Gimnasio', `${wk} · sem ${w('F')}/3 · mes ${m('F')}/${cfg.gymM}`);
    h += row('read', 'I', 'Lectura', `${wk} · sem ${w('I')}/3`);
    h += row('aero', 'V', 'Aeróbico', `${wk} · sem ${w('V')}/3 · mes ${m('V')}/${cfg.aeroM}`);
    h += row('clean', 'O', 'Ambiente ordenado', `${wk} · sem ${w('O')}/${cfg.namb}`);
    h += row('food', 'P', 'Alimentación cumplida', `sem ${st.foodWk}/${cfg.foodDays} días · alimenta a ${PETS[st.equipped].name}`);
    if (n === 5) h += `<p class="allok">¡Todas las misiones del día cumplidas!</p>`;
    h += `</div>`;
    h += `<div class="card slim bronze"><h2>Antiobjetivo</h2><button class="mrow bronze" ${pre ? 'disabled' : 'data-act="game"'}><span class="mic">🎮</span><span class="mtx"><b>Sesión de videojuegos</b><small>hoy ${today0} · semana ${games} (más de 3 rompe el objetivo)</small></span>${pre ? '' : '<span class="dbl">2×</span>'}</button>${today0 > 0 ? `<button class="undo" data-act="gameminus">Quitar una sesión</button>` : ''}</div>`;
  } else if (mtab === 'sem') {
    const rows = [['F', 'Fuerza', '3 sesiones', 3], ['I', 'Inteligencia', '3 lecturas', 3], ['V', 'Vitalidad', '3 aeróbicos', 3], ['O', 'Orden', `${cfg.namb} ambientes · faltan: ${ROOMS.filter(([id]) => !st.roomsWk.includes(id)).map(r => r[1]).join(', ') || 'ninguno'}`, cfg.namb]];
    const dn = rows.filter(([c]) => st.wdone.includes(c)).length + (st.wu.D >= 3 ? 1 : 0) + (st.foodWk >= cfg.foodDays ? 1 : 0);
    h += `<div class="card slim"><div class="row"><h2>Esta semana</h2><span class="pill ${dn === 6 ? 'ok' : ''}">${dn} / 6</span></div>`;
    h += rows.map(([c, nm, goal, max]) => info(c, nm, goal, pips(w(c), max), st.wdone.includes(c))).join('');
    h += info('D', 'Disciplina', DTEXT[Math.min(wi.n, 5) - 1], '', st.wu.D >= 3);
    h += info('P', 'Alimentación', `${cfg.foodDays} días de alimentación`, pips(st.foodWk, cfg.foodDays), st.foodWk >= cfg.foodDays);
    h += `<div class="mute">Semanas buenas seguidas: ${st.wstreak}</div></div>`;
    h += `<div class="card slim"><h2>Cierre de semana</h2>`;
    if (dd === 6 && !pre) h += `<button class="btn" data-act="closeweek">${inp.dform ? 'Revisar el cierre' : 'Completar el cierre'}</button><p class="mute">${inp.dform ? `Disciplina: ${inp.dweek ? 'cumplida' : 'no cumplida'} · celular > 5 h: ${inp.phone ? 'sí' : 'no'}` : 'Respondé tu objetivo de Disciplina y el promedio de celular.'}</p>`;
    else h += `<div class="mute">Se habilita el domingo · videojuegos esta semana: ${games} (máx. 3)</div>`;
    h += `</div>`;
  } else {
    const rows = [['F', 'Fuerza', `${cfg.gymM} sesiones`, cfg.gymM], ['V', 'Vitalidad', `${cfg.aeroM} aeróbicos`, cfg.aeroM]];
    const dn = st.mdone.length;
    h += `<div class="card slim"><div class="row"><h2>Este mes</h2><span class="pill ${dn === 5 ? 'ok' : ''}">${dn} / 5</span></div>`;
    h += rows.map(([c, nm, goal, max]) => info(c, nm, `${m(c)} de ${goal}`, bar(m(c), max), st.mdone.includes(c))).join('');
    h += info('I', 'Inteligencia', 'Libro terminado', '', st.mdone.includes('I')) + info('O', 'Orden', 'Arreglo en la casa', '', st.mdone.includes('O'));
    h += info('D', 'Disciplina', `${m('D')} de ${wi.of} objetivos semanales`, bar(m('D'), wi.of), st.mdone.includes('D'));
    h += `</div>`;
    h += `<div class="card slim"><h2>Registrar hoy</h2>${row('book', 'I', 'Libro terminado', 'se cumple el día que lo marcás · el XP se reparte en 6 días')}${row('repair', 'O', 'Arreglo en la casa', 'se cumple el día que lo marcás · el XP se reparte en 6 días')}</div>`;
  }
  if (doneRows.length) {
    h += `<div class="card slim"><button class="donebtn" data-act="showdone"><span>Completadas (${doneRows.length})</span><span>${showDone ? '▲' : '▼'}</span></button>`;
    if (showDone) h += doneRows.map(([k, c, l]) => `<div class="mrow static on"><span class="mic">${ic(c)}</span><span class="mtx"><b>${l}</b></span><button class="undo" data-act="undo" data-k="${k}">Deshacer</button></div>`).join('');
    h += `</div>`;
  }
  return h;
}

let mapAct = 0, mapSel = 0;
/** Escena de la torre (240 px de ancho, 2× para el terreno y la aguja; 1× para la escena de carrera).
 *  El terreno va arriba; la escena de carrera (loop) va abajo y la torre se apoya en su mismo suelo, sin moverse.
 *  La aguja sigue por encima del loop hacia el cielo. El punto dorado marca el piso: 1 en la base, 100 en la punta. */
const TV = { W: 240, H: 360, gnd: 6, tx: 200, tw: 36, th: 130 };  // terreno arriba (360); la aguja se apoya en su borde inferior
function torreScene(floor, o, top) {
  const f = Math.min(100, Math.max(1, floor));
  const G = TV.H + 64 - TV.gnd;                               // suelo del loop (6 px sobre su borde inferior), en unidades de escena
  const yc = G - 2 - (f - 1) / 99 * (TV.th - 4);              // centro del punto dorado (1 px de la aguja = 2 px de pantalla)
  const xc = TV.tx + TV.tw / 2 + 6 * Math.sin((f - 1) / 10 * 2 * Math.PI);  // espiral: una vuelta cada 10 pisos
  const tower = has('torre_base') ? `<img class="px tvt" alt="" src="${url('torre_base')}" style="top:${G - TV.th}px">` : '';
  return `<div class="torrescene">${top ? `<div class="tvtop">${top}</div>` : ''}<div class="tvwrap"><img class="px tvg" alt="" src="${zoneTowerSrc(o.hz)}"></div><div class="tvfloor">${arenaHTML(o, true)}</div><div class="tvground" style="--gr:${zoneOf(o.hz).gr};--gr2:${zoneOf(o.hz).gr2}"></div>${tower}<i class="tvd" title="Piso ${f}" style="left:${xc}px;top:${yc}px"></i></div>`;
}
const z0 = f => { const z = zoneOf(f), act = Math.min(10, Math.ceil(f / 10)); return `${z.n} · ${act}-${((f - 1) % 10) + 1}`; };
function viewTorre() {
  if (!S.startDate) return `<div class="card mute">Disponibles al ingresar.</div>`;
  if (dayIdx(todayISO()) < 0) return torreFull(1, arenaState(), '');
  const { e } = compute(dayIdx(todayISO())), st = e.state, L = e.floor(), gates = buildGates(e.cfg);
  const nums = Object.keys(gates).map(Number).sort((a, b) => a - b);
  const nextG = nums.find(g => g >= L && !st.cleared.includes(g));
  let info = '';
  if (nextG && st.tower === null) {
    const d = gates[nextG], lines = [];
    if (d.stats) for (const c of d.stats) lines.push(`${NAMES[c]} ${st.stat[c]}/${d.req}`);
    if (d.streak !== undefined) lines.push(`Racha ${st.s}/${d.streak}`);
    lines.unshift(`Próxima puerta piso ${nextG}`);
    info = `<div class="gatenums">${lines.map(x => `<span>${x}</span>`).join('')}</div>`;
  }
  return torreFull(L, arenaState(), info);
}
/** Escena completa: el terreno, el personaje caminando abajo y la torre. Sin títulos ni tarjetas. */
function torreFull(floor, o, info) { const sc = torreScene(floor, o, '').replace(/<\/div>$/, `${info}</div>`); return `<div class="torrehead"><h1>Torre</h1><small>${zoneOf(floor).n} · Piso ${floor}</small></div><!--fit--><div class="torrefull" data-torre="1">${sc}</div>`; }

function viewStats() {
  if (!S.startDate) return `<h1>Estadísticas</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const { e, st } = current(), cap = e.statCap();
  const o = arenaState(), seen = S.seenStat || {}, up = CATS.filter(c => st.stat[c] > (seen[c] ?? st.stat[c]));
  if (up.length || !S.seenStat) { S.seenStat = { ...st.stat }; save(); }
  if (up.length) setTimeout(() => { if (tab === 'stats') fx(0, 'semanal'); }, 500);
  const sf = o.floor;
  let h = `<h1>Estadísticas</h1><!--fit--><div class="card statshero"><div class="stand" style="--gr:${zoneOf(o.floor).gr};--gr2:${zoneOf(o.floor).gr2}">${heroImgTag(sf, 4, o.done, 'idle')}<i class="floor"></i></div></div><div class="card">` + (Number.isFinite(cap) ? `<div class="mute">Tope actual: ${cap} (hasta superar la próxima puerta de estadísticas)</div>` : '');
  for (const c of CATS) h += `<div style="margin-top:12px"><div class="row"><b>${iconTag(c)} ${NAMES[c]}${up.includes(c) ? ' <span class="pill gold">¡sube!</span>' : ''}</b><b>${st.stat[c]}${Number.isFinite(cap) ? ' / ' + cap : ''}</b></div><div class="bar"><i style="width:${Number.isFinite(cap) ? Math.min(100, st.stat[c] / cap * 100) : 100}%"></i></div></div>`;
  return h + `<p class="mute">+1 por cada semanal cumplida, −1 por cada objetivo mensual fallado.</p></div>`;
}

function viewMascotas() {
  if (!S.startDate) return `<h1>Mascotas</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const { e, st } = current(), lv = e.petLevels();
  const cum = [0]; for (const x of e.cfg.petCosts) cum.push(cum[cum.length - 1] + x);
  let h = `<h1>Mascotas</h1><!--fit-->`;
  if (st.feedStreak >= 1) h += `<div class="banner">Semanas sin alimentar seguidas: <b>${st.feedStreak}</b>. ${st.feedStreak >= 2 ? 'La mascota equipada pierde 1 nivel por cada semana fallada.' : 'Con la próxima semana fallada baja 1 nivel.'}</div>`;
  h += `<div class="pgrid">`;
  for (const c of CATS) {
    const l = lv[c], max = l >= 5, eq = st.equipped === c, pct = max ? 100 : (st.px[c] - cum[l]) / e.cfg.petCosts[l] * 100;
    h += `<div class="card pcard"><div class="phead"><div class="pface-wrap">${petFace(c, l, 2)}</div><div><b>${PETS[c].name}</b><small class="mute"> ${NAMES[c]}</small><div class="mute">Nivel ${l} / 5</div></div></div><div class="bar gold"><i style="width:${pct}%"></i></div><div class="row mute"><span>${max ? 'máximo' : `${st.px[c] - cum[l]} / ${e.cfg.petCosts[l]} XP`}</span>${eq ? '<span class="pill gold">equipada</span>' : `<button class="btn sm ghost" data-act="equip" data-c="${c}">Equipar</button>`}</div></div>`;
  }
  h += `</div>`;
  return h + `<p class="mute">Solo la mascota equipada aporta puntos en una puerta de estadísticas y solo a su propia estadística. Cada semana de alimentación perfecta le da 10 XP.</p>`;
}

const SUB = { torre: 'res', ajustes: 'gen' };
const subtabs = (k, items) => `<div class="seg">${items.map(([v, l]) => `<button class="${SUB[k] === v ? 'on' : ''}" data-act="sub" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
function viewAjustes() {
  let h = `<h1>Ajustes</h1>`;
  if (!S.token) {
    h += `<div class="card"><h2>${mode === 'setup' ? 'Crear tu clave' : 'Ingresar'}</h2>`;
    if (mode === null) return h + `<p class="mute">Conectando…</p></div>`;
    h += `<label>Clave (mínimo 8 caracteres)<input id="tok" type="password" autocomplete="${mode === 'setup' ? 'new-password' : 'current-password'}"></label>`;
    if (mode === 'setup') h += `<label>Primer día de tu torre (un lunes)<input id="sd" type="date" value="${nextMonday(todayISO())}"></label>`;
    h += `<div class="err">${esc(errMsg)}</div><button class="btn" data-act="login">${mode === 'setup' ? 'Crear y entrar' : 'Entrar'}</button></div>`;
    return h;
  }
  h += subtabs('ajustes', [['gen', 'General'], ['notif', 'Notificaciones']]) + '<!--fit-->';
  if (SUB.ajustes === 'gen') h += `<div class="card"><h2>Apariencia</h2><div class="themes">${THEMES.map(t => `<button class="theme ${(S.theme || 'gladiador') === t[0] ? 'on' : ''}" data-act="theme" data-v="${t[0]}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join('')}</div></div>`;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (SUB.ajustes === 'gen') h += `<div class="card"><h2>Sincronización</h2><div class="row"><span>${pending() ? pending() + ' día(s) pendientes' : 'Todo sincronizado'}</span><button class="btn sm" data-act="sync" ${syncing ? 'disabled' : ''}>${syncing ? 'Sincronizando…' : 'Sincronizar'}</button></div><div class="mute">${S.lastSync ? 'Última vez: ' + new Date(S.lastSync).toLocaleString('es-AR') : 'Nunca'}</div><div class="err">${esc(syncMsg)}</div></div>`;
  const st = S.settings || {};
  if (SUB.ajustes === 'notif') {
  h += `<div class="card"><h2>Notificaciones</h2>`;
  if (!standalone) h += `<div class="banner">En el iPhone: abrí esta página en Safari, tocá Compartir → <b>Agregar a pantalla de inicio</b> y abrila desde ahí. Sin eso iOS no permite notificaciones.</div>`;
  h += `<div class="row"><button class="btn sm" data-act="push">Activar</button><button class="btn sm ghost" data-act="pushtest">Probar</button></div><div class="err" id="pushmsg">${esc(errMsg)}</div>`;
  h += `<label>Recordatorio diario (hora local)<input id="rh" type="number" min="0" max="23" value="${esc(st.reminder_hour ?? 21)}"></label><label>Aviso de alimentación del domingo (hora)<input id="fh" type="number" min="0" max="23" value="${esc(st.feed_hour ?? 18)}"></label><button class="btn sm ghost" data-act="saveset">Guardar horarios</button></div>`;
  } else h += `<div class="card"><h2>Datos</h2><div class="mute">Primer día: ${S.startDate ? pretty(S.startDate) : '—'}</div><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="export">Descargar respaldo</button><button class="btn sm ghost" data-act="logout">Cerrar sesión</button></div></div>`;
  return h;
}

const TABS = [['hoy', '✅', 'Misiones', viewHoy], ['torre', '🏰', 'Torre', viewTorre], ['stats', '📊', 'Estadísticas', viewStats], ['mascotas', '🐾', 'Mascotas', viewMascotas], ['ajustes', '⚙️', 'Ajustes', viewAjustes]];
function modalHTML() {
  if (!modal || !S.startDate) return '';
  const i = dayIdx(modal.date), { e, results } = compute(i), st = e.state;
  if (modal.kind === 'room') {
    const mine = S.days[modal.date]?.input?.room, taken = st.roomsWk.filter(r => r !== mine);
    return `<div class="modal"><div class="card slim"><h2>¿Qué ambiente ordenaste?</h2><p class="mute">Cada ambiente cuenta una vez por semana (${taken.length} de ${ROOMS.length} ya hechos).</p><div class="rooms">${ROOMS.map(([id, nm]) => `<button class="room ${taken.includes(id) ? 'taken' : ''}" ${taken.includes(id) ? 'disabled' : `data-act="room" data-r="${id}"`}>${roomTile(id)}<b>${nm}</b>${taken.includes(id) ? '<span class="ck">✓</span>' : ''}</button>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="roomcancel">Cancelar</button></div></div></div>`;
  }
  const wi = e.weekInfo(i), txt = DTEXT[Math.min(wi.n, 5) - 1], lastWeek = wi.n === wi.of;
  const inp0 = S.days[modal.date]?.input ?? {};
  const bookEarlier = st.mdone.includes('I') && !inp0.book, repairEarlier = st.mdone.includes('O') && !inp0.repair;
  const tg = (k, ic, label, sub, bad, off) => `<button class="mrow ${bad ? 'bad' : ''} ${modal[k] || off ? 'on' : ''}" ${off ? 'disabled' : `data-act="mdl" data-k="${k}"`}><span class="mic">${ic}</span><span class="mtx"><b>${label}</b><small>${sub}</small></span><span class="chk">${modal[k] || off ? '✓' : ''}</span></button>`;
  let h = `<div class="modal"><div class="card slim"><h2>Cierre de semana ${wi.n} del mes</h2>${tg('dw', iconTag('D', 2), 'Objetivo de Disciplina', txt, false)}${tg('ph', '📱', 'El promedio semanal de celular superó las 5 h', 'antiobjetivo: si lo marcás, esta semana no suma punto de Disciplina', true)}`;
  if (lastWeek) {
    if (modal.bk === undefined) { modal.bk = !!inp0.book; modal.rp = !!inp0.repair; }
    h += `<h2 style="margin-top:14px">Cierre de mes</h2>${tg('bk', iconTag('I', 2), 'Libro terminado', bookEarlier ? 'ya registrado este mes' : 'se cumple hoy; el XP se reparte en 6 días', false, bookEarlier)}${tg('rp', iconTag('O', 2), 'Arreglo en la casa', repairEarlier ? 'ya registrado este mes' : 'se cumple hoy; el XP se reparte en 6 días', false, repairEarlier)}`;
  }
  return h + `<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="mdlcancel">Cancelar</button><button class="btn" data-act="mdlsave">Guardar cierre</button></div></div></div>`;
}
function render() {
  const view = TABS.find(t => t[0] === tab)[3];
  const app = document.getElementById('app'), focus = document.activeElement?.id;
  const offline = (!navigator.onLine || pending() > 0) && S.token ? `<div class="mute" style="text-align:right">${navigator.onLine ? 'pendiente de sincronizar' : 'sin conexión'}</div>` : '';
  if (!S.token && tab !== 'ajustes') { tab = 'ajustes'; return render(); }
  document.documentElement.classList.toggle('cf', has('marco'));
  if (tab === 'hoy' && S.startDate && !modal && viewDate === todayISO() && dayIdx(viewDate) >= 0 && dayIdx(viewDate) % 7 === 6 && askedFor !== viewDate && !(S.days[viewDate]?.input?.dform)) {
    askedFor = viewDate; modal = { kind: 'week', dw: false, ph: false, date: viewDate };
  }
  const html = offline + view(), mk = html.indexOf('<!--fit-->');
  app.innerHTML = mk < 0 ? `<div id="fit">${html}</div>` : `${html.slice(0, mk)}<div id="fit">${html.slice(mk + 10)}</div>`; renderStrip();
  document.getElementById('modal').innerHTML = modalHTML();
  document.getElementById('tabs').innerHTML = TABS.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
  if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
  fit();
}
/** Todo entra en la pantalla: se mide el espacio libre (sobre la franja y la barra de solapas) y se reduce el contenido lo justo. Solo si ni así entra, se permite desplazar dentro de la solapa. */
let fitting = false;
/** Apoya los pies en el suelo: mide cuántas filas vacías tiene cada sprite abajo y lo baja esa cantidad. */
const gapCache = new Map();
function bottomGap(img) {
  const s = img.currentSrc || img.src;
  if (gapCache.has(s)) return gapCache.get(s);
  let g = 0;
  try {
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return 0;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    while (g < h && ![...Array(w).keys()].some(i => d[((h - 1 - g) * w + i) * 4 + 3] > 20)) g++;
  } catch { g = 0; }
  gapCache.set(s, g); return g;
}
function sinkFeet() {
  // escena de carrera: los pies tocan la franja de suelo (6 unidades de alto)
  document.querySelectorAll('.arena img.sp.hero, .arena img.sp.pet').forEach(img => {
    const w = parseFloat(img.style.getPropertyValue('--w'));
    if (!img.complete || img.naturalWidth < 8 || !w || (img.classList.contains('pet') && /calc\(14 /.test(img.getAttribute('style') || ''))) return;
    img.style.bottom = `calc(${(5 - bottomGap(img) * w / img.naturalWidth).toFixed(2)} * 100cqw / 240)`;
  });
  document.querySelectorAll('.dockrow img.px:not(.ico), .stand img.hero').forEach(img => {
    if (!img.complete || !img.naturalHeight) return;
    const g = bottomGap(img);
    img.style.marginBottom = g ? `-${(g * (parseFloat(img.getAttribute('height')) / img.naturalHeight)).toFixed(2)}px` : '';
  });
}
function variants() {
  if (tab === 'hoy' && S.startDate) return { get: () => mtab, set: v => { mtab = v; }, list: ['dia', 'sem', 'mes'] };
  if (tab === 'ajustes' && S.token) return { get: () => SUB.ajustes, set: v => { SUB.ajustes = v; }, list: ['gen', 'notif'] };
  return null;
}
/** Mayor zoom (0.55 a 1) con el que el elemento entra en el alto disponible. */
function bestZoom(el, avail) {
  const h = z => { el.style.zoom = z; return el.getBoundingClientRect().height; };
  if (h(1) <= avail + 0.5) return 1;
  let lo = 0.55, hi = 1;
  if (h(lo) > avail + 0.5) return lo;
  for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (h(m) <= avail + 0.5) lo = m; else hi = m; }
  return lo;
}
/** Zoom único de la senda y de la torre: el mismo tamaño en todas las pestañas. */
function zs() {
  // Se mide hasta la barra de solapas (no hasta la franja), así el zoom no cambia según la pestaña.
  const app = document.getElementById('app'), cs = getComputedStyle(app), HH = 22, tabs = document.getElementById('tabs');
  const top = tabs ? tabs.getBoundingClientRect().top : innerHeight;
  const inner = top - parseFloat(cs.paddingTop) - 48;  // 48: alto del título TORRE (igual en todas las pestañas)
  return Math.max(0.5, Math.min(2, (app.clientWidth - 16) / 240, (inner - 4) / (428 + HH)));
}
function fit() {
  if (fitting) return; fitting = true;
  try {
    document.documentElement.style.setProperty('--zs', zs().toFixed(3));
    const app = document.getElementById('app'), f = document.getElementById('fit'), strip = document.getElementById('strip'), tabs = document.getElementById('tabs');
    if (!f) return;
    sinkFeet();
    const bar = strip && strip.firstElementChild ? strip : tabs;
    app.style.setProperty('--bot', Math.max(0, innerHeight - bar.getBoundingClientRect().top) + 'px');
    const cs = getComputedStyle(app), avail = app.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) - f.getBoundingClientRect().top;
    f.style.zoom = 1;
    const geo = `left:${f.offsetLeft}px;top:${f.offsetTop}px;right:${app.clientWidth - f.offsetLeft - f.offsetWidth}px`;
    let z = bestZoom(f, avail);
    const scene = f.querySelector('.torrescene');
    if (scene) {
      // Torre: la escena llena el ancho y el alto disponibles (240 px de escena, 360 de terreno + 60 de suelo)
      const HH = 22, z = zs();
      f.style.paddingTop = '0px';
      f.style.zoom = z.toFixed(3);
      // Si sobra alto, la escena baja para apoyarse abajo (el espacio queda arriba, bajo el título).
      const left = avail - f.getBoundingClientRect().height;
      if (left > 0) f.style.paddingTop = (left / z).toFixed(1) + 'px';
      // El suelo de abajo se estira hasta llenar lo que queda de pantalla (en unidades de escena).
      const g = f.querySelector('.tvground');
      if (g) g.style.height = '0px';  // sin relleno: la escena tiene el mismo tamaño que la senda de las otras pestañas
      app.style.overflowY = 'hidden';
      return;
    }
    // Las subpestañas de una misma solapa comparten el zoom (el menor), así el texto no cambia de tamaño al cambiar de pestaña.
    const vs = variants();
    if (vs) {
      const cur = vs.get(), view = TABS.find(t => t[0] === tab)[3], probe = document.createElement('div');
      probe.id = 'fitp'; probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;${geo}`;
      app.appendChild(probe);
      try {
        for (const v of vs.list) {
          if (v === cur) continue;
          vs.set(v); const html = view(), k = html.indexOf('<!--fit-->'); vs.set(cur);
          probe.innerHTML = k < 0 ? html : html.slice(k + 10);
          z = Math.min(z, bestZoom(probe, avail));
        }
      } finally { vs.set(cur); probe.remove(); }
    }
    f.style.zoom = z < 1 ? z.toFixed(3) : 1;
    app.style.overflowY = f.getBoundingClientRect().height > avail + 1 ? 'auto' : 'hidden';
  } finally { fitting = false; }
}
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 300));
document.addEventListener('load', e => { const t = e.target; if (t.tagName === 'IMG' && t.matches('.hero, .pet')) sinkFeet(); else fit(); }, true);
document.fonts?.ready.then(fit);

// ---------- franja de batalla ----------
// Lienzo lógico de 240×64: todo se posiciona en unidades de ese lienzo (cqw) para que escale parejo en cualquier pantalla.
let dockOpen = false, runTimer = 0, stripKey = '', readyN = 0, opening = false, phase = '';
const U = v => `calc(${v} * 100cqw / 240)`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function arenaState() {
  const { e, st, pre } = current();
  const floor = pre ? 1 : e.floor();
  const boss = BOSSES.includes(floor) && !st.cleared.includes(floor) && st.tower === null;
  const running = !phase && ((!pre && st.tower === null && st.blocked === null && !boss) || pre);
  return { e, st, pre, floor, hf: floor, hz: floor, boss, running, eq: st.equipped, pl: e.petLevel(st.equipped), done: st.tower !== null, speed: 1 + 0.5 * st.s, gait: gaitFor(st.s) };
}
/** Escena de 240×64: fondo en movimiento, héroe y mascota (corriendo o quietos), jefe y puerta. */
function arenaHTML(o, big) {
  const z = zoneOf(o.hz), vars = `--sky1:${z.sky[0]};--sky2:${z.sky[1]};--gr:${z.gr};--gr2:${z.gr2}`;
  const showDoor = (o.pre && !o.running) || phase, ground = 6;
  const doorName = phase === 'open' || phase === 'fade' ? 'torre_abierta' : phase.startsWith('f') ? 'torre_apertura_' + phase.slice(1) : 'torre_cerrada';
  const tNear = +(9 / o.speed).toFixed(2);
  const bg = showDoor && o.pre ? '' : `<div class="scrollwrap ${o.running ? '' : 'paused'}">${scrollLayers(o.hz, tNear)}</div>`;
  const door = showDoor ? towerLayer(doorName, doorName !== 'torre_cerrada' && !doorName.startsWith('torre_apertura'), 'door ' + (phase === 'shake' ? 'shake' : phase === 'fade' ? 'fadeout' : '')) : '';
  const idle = o.running ? '' : 'idle', hx = big ? 26 : (o.boss ? 60 : 56), pxx = Math.max(2, hx + 4 - petArenaW(o.eq, o.pl));
  ['diaria', 'semanal', 'mensual', 'mueca'].forEach(p => heroSrc(o.floor, p));
  const floorBand = showDoor && o.pre ? '' : `<div class="scrollwrap floorwrap ${o.running ? '' : 'paused'}"><div class="scroll floorband" style="--t:${tNear}s"><i></i><i></i></div></div>`;
  return `<div class="arena ${big ? 'big' : ''}" data-run="${o.running ? 1 : 0}" data-floor="${o.hf}" data-crown="${o.done ? 1 : 0}" data-eq="${o.eq}" data-pl="${o.pl}" data-speed="${o.speed}" data-gait="${o.gait}" style="${vars}">${bg}${floorBand}${door}${heroSprite(o.hf, `left:${U(hx)};bottom:${U(ground)}`, o.done)}${petSprite(o.eq, o.pl, `left:${U(pxx)};bottom:${U(ground)}`)}${o.boss ? bossSprite(o.floor, `right:${U(14)};bottom:${U(ground)}`) : ''}</div>`;
}
/** Pone a correr a los personajes de las escenas en carrera (cuadros propios o provisorios). */
function startAnim() {
  clearInterval(runTimer);
  const list = [];
  document.querySelectorAll('.arena[data-run="1"]').forEach(ar => {
    const floor = +ar.dataset.floor, speed = +ar.dataset.speed, hero = ar.querySelector('.hero'), pet = ar.querySelector('.pet');
    const rf = runFrames(floor, ar.dataset.crown === '1', ar.dataset.gait), pf = petRunFrames(ar.dataset.eq, +ar.dataset.pl);
    hero.classList.remove('idle'); hero.classList.add('running'); hero.classList.toggle('bob', rf.bob); hero.style.setProperty('--bobt', (0.5 / speed).toFixed(2) + 's');
    hero.classList.toggle('wide', rf.w > 32); hero.style.setProperty('--w', rf.w);
    if (rf.frames.length > 1) { hero.src = rf.frames[0]; list.push([hero, rf.frames]); }
    else hero.src = rf.frames[0];
    if (pf) { pet.src = pf[0]; pet.classList.add('noBob'); list.push([pet, pf]); }
    ar._ms = rf.w > 32 ? GAIT_MS[rf.gait] : Math.round(240 / speed);
  });
  if (!list.length) return;
  let k = 0; const ms = +(document.querySelector('.arena[data-run="1"]')._ms || 240);
  runTimer = setInterval(() => { k++; for (const [el, fr] of list) { if (!el.isConnected) { clearInterval(runTimer); return; } if (el.dataset.pose) continue; el.src = fr[k % fr.length]; } }, ms);
}
function renderStrip() { renderStrip0(); fit(); }
function renderStrip0() {
  const el = document.getElementById('strip');
  const idx = S.startDate ? dayIdx(todayISO()) : -1;
  if (!S.token || !S.startDate) { el.innerHTML = ''; stripKey = ''; return; }
  if (idx >= 0 && !S.opened && !opening) { startOpening(); return; }
  if (tab === 'torre') { el.innerHTML = ''; stripKey = ''; startAnim(); return; }
  const o = arenaState(), { e, st } = o, floor = o.floor;
  const into = st.xp - cumXp(floor, e.cfg.A, e.cfg.r), cost = e.cfg.A * Math.pow(e.cfg.r, floor - 1);
  const pct = o.pre ? 0 : Math.round(Math.min(100, into / cost * 100));
  const open = true;  // siempre expandido: el personaje camina en Misiones igual que en Torre
  const key = JSON.stringify({ o: [o.pre, floor, o.eq, o.pl, o.running, o.boss, o.done, o.speed, o.gait, o.hf, o.hz], pct, phase, open, readyN, tab: tab === 'hoy' });
  if (key === stripKey) return; stripKey = key;
  const z = zoneOf(floor), act = Math.min(10, Math.ceil(floor / 10)), stage = ((floor - 1) % 10) + 1;
  const title = `${z.n} · ${act}-${stage}`;
  if (open) el.innerHTML = `<div class="strip ${!o.running && !o.pre ? 'blocked' : ''}">${arenaHTML(o)}</div>`;
  else el.innerHTML = `<div class="strip dock" data-act="dock"><div class="dockrow" style="--gr:${z.gr};--gr2:${z.gr2}">${petTag(o.eq, o.pl, 1, 'pet idle')}${heroImgTag(floor, 1, o.done, 'idle')}<div class="dockinfo"><b>Piso ${floor}</b><small>${z.n}</small><span class="hp"><i style="width:${pct}%"></i></span><small>Tocá para ver la carrera</small></div></div></div>`;
  startAnim();
  if (phase === 'fade') requestAnimationFrame(() => requestAnimationFrame(() => el.querySelector('.door')?.classList.add('gone')));
}
/** Apertura de la puerta, una sola vez: cerrada → sacudón → (cuadros) → abierta → aparece la zona 1. */
async function startOpening() {
  opening = true;
  const frames = []; for (let n = 1; n <= 6; n++) if (await exists('torre_apertura_' + n)) frames.push(n);
  const seq = [['closed', 900], ['shake', 1100], ...frames.map(n => ['f' + n, 500]), ['open', 900], ['fade', 1000]];
  for (const [p, ms] of seq) { phase = p; stripKey = ''; render(); await sleep(ms); }
  phase = ''; S.opened = true; save(); opening = false; stripKey = ''; render();
}
/** Festejo del héroe (1 s diaria, 1,5 s semanal, 2,5 s mensual) y texto de XP ganada. */
function fx(delta, pose = 'diaria') {
  const s = document.querySelector('.arena') || document.querySelector('.dock') || document.querySelector('.statshero') || document.body;
  const hero = document.querySelector('.hero');
  if (hero) {
    const { e } = current(), r = heroSrc(e.floor(), pose), base = hero.src, ms = { diaria: 1000, semanal: 1500, mensual: 2500, mueca: 1500 }[pose];
    hero.dataset.pose = '1'; hero.classList.remove('running', 'bob', 'idle', 'wide'); hero.src = r.src; hero.classList.toggle('hop', r.hop);
    if (hero.classList.contains('sp')) hero.style.setProperty('--w', 32);
    if (pose === 'mensual') for (let i = 0; i < 6; i++) { const t = document.createElement('i'); t.className = 'spark'; t.textContent = '✦'; t.style.cssText = `left:calc(${46 + (i % 3) * 14 - 6} * 100cqw / 240);bottom:calc(${14 + Math.floor(i / 3) * 20 + (i % 2) * 6} * 100cqw / 240);animation-delay:${i * 0.18}s`; (s.querySelector('.arena') || s).appendChild(t); setTimeout(() => t.remove(), ms); }
    setTimeout(() => { if (hero.isConnected) { stripKey = ''; render(); } }, ms);
  }
  if (delta > 0) {
    const t = document.createElement('div'); t.className = 'dmg'; t.textContent = '+' + delta;
    (s.querySelector('.arena') || s).appendChild(t); setTimeout(() => t.remove(), 950);
  }
}

// ---------- acciones ----------
async function login() {
  const token = document.getElementById('tok').value;
  errMsg = '';
  try {
    if (mode === 'setup') { const sd = document.getElementById('sd').value; await api('/api/setup', 'POST', { token, startDate: sd }); S.startDate = sd; }
    S.token = token; await api('/api/me'); await sync();
  } catch (e) { S.token = ''; errMsg = e.status === 401 ? 'Clave incorrecta.' : e.message; render(); return; }
  tab = 'hoy'; render();
}
function b64uToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function enablePush() {
  const msg = t => { errMsg = t; const el = document.getElementById('pushmsg'); if (el) el.textContent = t; };
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return msg('Este navegador no soporta notificaciones. En iPhone instalá la app en la pantalla de inicio.');
    if ((await Notification.requestPermission()) !== 'granted') return msg('Permiso denegado. Activalo en Ajustes del iPhone → Notificaciones.');
    const reg = await navigator.serviceWorker.ready, { publicKey } = await api('/api/vapid');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
    await api('/api/push/subscribe', 'POST', sub.toJSON()); msg('Notificaciones activadas ✔');
  } catch (e) { msg('No se pudo activar: ' + e.message); }
}
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'tab') { tab = el.dataset.t; if (tab === 'ajustes') errMsg = ''; render(); }
  else if (a === 'sub') { SUB[el.dataset.k] = el.dataset.v; render(); }
  else if (a === 'dock') { dockOpen = !dockOpen; stripKey = ''; renderStrip(); }
  else if (a === 't') {
    const k = el.dataset.k, now = Date.now();
    if (lastTap.k === k && now - lastTap.t < 450) { lastTap = { k: '', t: 0 }; toggle(viewDate, k); }
    else { lastTap = { k, t: now }; el.classList.add('armed'); setTimeout(() => el.classList.remove('armed'), 450); hint('Tocá otra vez para completar'); }
  }
  else if (a === 'game') {
    const now = Date.now();
    if (lastTap.k === 'game' && now - lastTap.t < 450) { lastTap = { k: '', t: 0 }; setInput(viewDate, i => { i.gaming = (i.gaming || 0) + 1; }); fx(0, 'mueca'); }
    else { lastTap = { k: 'game', t: now }; el.classList.add('armed'); setTimeout(() => el.classList.remove('armed'), 450); hint('Tocá otra vez para registrar la sesión'); }
  }
  else if (a === 'gameminus') setInput(viewDate, i => { i.gaming = Math.max(0, (i.gaming || 0) - 1); });
  else if (a === 'closeweek') { const i = S.days[viewDate]?.input ?? {}; modal = { kind: 'week', dw: !!i.dweek, ph: !!i.phone, date: viewDate }; render(); }
  else if (a === 'mdl') { modal[el.dataset.k] = !modal[el.dataset.k]; render(); }
  else if (a === 'room') {
    const m0 = modal; modal = null;
    setInput(m0.date, i => { i.room = el.dataset.r; });
    const idx = dayIdx(m0.date), c = compute(idx).results[idx].completed;
    fx(Math.round(dayGain(m0.date) - m0.before), c.monthly.length ? 'mensual' : c.weekly.length || c.pet ? 'semanal' : 'diaria');
  }
  else if (a === 'roomcancel') { const m0 = modal; modal = null; setInput(m0.date, i => { delete i.clean; delete i.room; }); }
  else if (a === 'mdlcancel') { modal = null; render(); }
  else if (a === 'mdlsave') {
    const m0 = modal; modal = null;
    setInput(m0.date, i => { i.dform = true; i.dweek = m0.dw; i.phone = m0.ph; if (m0.bk !== undefined) i.book = m0.bk; if (m0.rp !== undefined) i.repair = m0.rp; });
    fx(0, m0.ph ? 'mueca' : m0.dw ? 'semanal' : 'diaria');
  }
  else if (a === 'undo') setInput(viewDate, i => { i[el.dataset.k] = false; if (el.dataset.k === 'clean') delete i.room; });
  else if (a === 'showdone') { showDone = !showDone; render(); }
  else if (a === 'anti') setInput(viewDate, i => { i.anti = i.anti === false ? undefined : false; });
  else if (a === 'prev') { viewDate = addDays(viewDate, -1); render(); }
  else if (a === 'next') { if (viewDate < todayISO()) { viewDate = addDays(viewDate, 1); render(); } }
  else if (a === 'today') { ev.preventDefault(); viewDate = todayISO(); render(); }
  else if (a === 'equip') { if (dayIdx(todayISO()) < 0) { S.preEquip = el.dataset.c; save(); stripKey = ''; render(); } else setInput(todayISO(), i => { i.equip = el.dataset.c; }); }
  else if (a === 'map') { mapAct = +el.dataset.a; mapSel = 0; render(); }
  else if (a === 'node') { mapSel = +el.dataset.f; render(); }
  else if (a === 'day') { viewDate = el.dataset.d; render(); }
  else if (a === 'mtab') { mtab = el.dataset.v; render(); }
  else if (a === 'theme') { S.theme = el.dataset.v; save(); applyTheme(); render(); }
  else if (a === 'login') login();
  else if (a === 'sync') sync();
  else if (a === 'push') enablePush();
  else if (a === 'pushtest') { try { const r = await api('/api/push/test', 'POST'); document.getElementById('pushmsg').textContent = r.delivered ? 'Enviada ✔' : 'No hay dispositivos suscritos.'; } catch (e) { document.getElementById('pushmsg').textContent = e.message; } }
  else if (a === 'saveset') {
    try { const r = await api('/api/settings', 'PUT', { reminder_hour: +document.getElementById('rh').value, feed_hour: +document.getElementById('fh').value }); S.settings = r.settings; save(); document.getElementById('pushmsg').textContent = 'Horarios guardados ✔'; } catch (e) { document.getElementById('pushmsg').textContent = e.message; }
  }
  else if (a === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ startDate: S.startDate, days: S.days }, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `pure-discipline-${todayISO()}.json` }).click(); URL.revokeObjectURL(url);
  }
  else if (a === 'logout') { S.token = ''; save(); render(); detectMode(); }
});

async function detectMode() {
  if (S.token) return;
  try { mode = (await api('/api/status')).configured ? 'login' : 'setup'; } catch { mode = 'login'; errMsg = 'Sin conexión.'; }
  render();
}

// ---------- arranque ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (viewDate > todayISO()) viewDate = todayISO(); sync(); render(); } });
setReadyHandler(() => { readyN++; render(); });
onAssets(() => { readyN++; render(); });
render(); detectMode(); sync();
preloadHero().then(() => { readyN++; render(); });

// Como una aplicación: sin zoom por pellizco ni doble toque, sin rebote de la página.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input')) e.preventDefault(); });
