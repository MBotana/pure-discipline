import { Engine, cumXp, buildGates } from '/engine.js';
import { zoneOf } from '/art.js';
import { ROOMS, roomTile, onAssets, exists, has, url, heroSrc, heroSprite, petFace, petSprite, petArenaW, bossSprite, towerLayer, runFrames, petRunFrames, heroImgTag, scrollLayers, iconTag, PETS, BOSSES, gaitFor, GAIT_MS, preloadHero, zoneTowerSrc } from '/assets.js';
import { px, setReadyHandler } from '/px.js';
const IMG = (svg, w, h, k, cls = '') => `<img class="px ${cls}" alt="" src="${px(svg, w, h)}" width="${w * k}" height="${h * k}">`;

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
let modal = null, showDone = false, lastTap = { k: '', t: 0 }, mtab = 'dia', tab = 'hoy', viewDate = todayISO(), syncMsg = '', syncing = false, errMsg = '', mode = null, timer = 0;

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
  if (key === 'clean') { modal = { kind: 'room', date, before, sel: [], fresh: true }; render(); return; }
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

// ---------- alimentación: comidas del día (foto o texto), evaluación y cierre ----------
S.log = S.log || {}; S.verdict = S.verdict || {};
const foodApproved = inp => !!(inp && (inp.food || inp.meat || inp.veg));
const need = d => (new Date(toUTC(d)).getUTCDay() + 6) % 7 < 5 ? 5 : 4;   // el fin de semana la comida es libre
const dailyDone = inp => ['gym', 'read', 'aero', 'clean'].filter(k => inp[k]).length + (foodApproved(inp) ? 1 : 0);
const foodOk = (st, cfg) => cfg.foodRule ? (st.meatWk ?? 0) >= cfg.foodRule.meat && (st.vegWk ?? 0) >= cfg.foodRule.veg && (st.junkWk ?? 0) <= cfg.foodRule.junkMax : st.foodWk >= cfg.foodDays;
const foodText = (st, cfg) => cfg.foodRule ? `carne ${st.meatWk ?? 0}/${cfg.foodRule.meat} · verduras ${st.vegWk ?? 0}/${cfg.foodRule.veg} · basura ${st.junkWk ?? 0} (máx. ${cfg.foodRule.junkMax})` : `${st.foodWk}/${cfg.foodDays} días aprobados`;
const hrs = x => String(+Number(x).toFixed(2)).replace('.', ',') + ' h';
const roomsOf = inp => inp.rooms ?? (inp.room ? [inp.room] : []);
const entries = date => S.log[date] || [];
const hhmm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mealName = t => { const h = +t.slice(0, 2); return h < 11 ? 'Desayuno' : h < 16 ? 'Almuerzo' : h < 20 ? 'Merienda' : 'Cena'; };
let txOpen = false, txDraft = '', vDraft = '', bkDraft = { t: '', a: '', d: '' };
// Fotos: se guardan en el teléfono (IndexedDB) hasta que las mandás; en el estado solo queda la hora y el texto.
let dbp = null;
const idb = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('pd-fotos', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
const fotoTx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('f', mode), q = fn(t.objectStore('f')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const fotoPut = (id, blob) => fotoTx('readwrite', s => s.put(blob, id));
const fotoGet = id => fotoTx('readonly', s => s.get(id));
const fotoDel = id => fotoTx('readwrite', s => s.delete(id));
async function shrink(file, max = 1024) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
}
const phURL = new Map();
async function hydratePhotos() {
  for (const img of document.querySelectorAll('img[data-ph]')) {
    const id = img.dataset.ph;
    try { if (!phURL.has(id)) { const b = await fotoGet(id); if (b) phURL.set(id, URL.createObjectURL(b)); } if (phURL.get(id)) img.src = phURL.get(id); } catch { /* sin foto */ }
  }
}
/** Alimentación con IA: el servidor describe cada comida, guarda la lista del día y rehace el análisis completo. */
let busy = '', errMeal = '', pendBlob = null, pendURL = '';
S.mc = S.mc || {};
const mealsOf = date => S.mc[date]?.meals ?? [];
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function aiRun(label, fn) {
  if (busy) return; busy = label; errMeal = ''; render();
  try { await sync(); await fn(); save(); await sync(); }
  catch (e) { errMeal = e.message || 'No se pudo completar'; }
  busy = ''; render();
}
const mealSend = (blob, text) => aiRun('Analizando la comida…', async () => {
  const date = todayISO(), r = await api('/api/meal', 'POST', { date, t: hhmm(), image: blob ? await blobB64(blob) : undefined, mime: 'image/jpeg', text: text || undefined });
  if (blob) await fotoPut(r.id, blob).catch(() => {});
  S.mc[date] = { meals: r.meals }; txOpen = false; txDraft = ''; pendBlob = null; if (pendURL) URL.revokeObjectURL(pendURL); pendURL = '';
});
const mealClose = date => aiRun('Armando el veredicto del día…', async () => {
  const r = await api('/api/meal/close', 'POST', { date }); S.mc[date] = { meals: r.meals };
  if (!r.closed) errMeal = 'La IA no dio un veredicto claro: marcalo a mano o volvé a intentar.';
  else if (modal?.kind === 'meals') modal = null;
});
const fetched = new Set();
async function loadMeals(date, force) {
  if (!S.token || (fetched.has(date) && !force)) return; fetched.add(date);
  try { const r = await api('/api/meals?date=' + date); S.mc[date] = { meals: r.meals }; save(); render(); } catch { fetched.delete(date); }
}
/** Veredicto del día: 'parcial' es un consejo; 'ok' y 'no' cierran el día (lo que cuenta para la semana). */
function setVerdict(date, st, tx) {
  S.verdict[date] = { st, tx: tx || '', at: Date.now() }; vDraft = ''; save();
  if (st === 'ok') setInput(date, i => { i.meals = true; i.food = true; });
  else if (st === 'no') setInput(date, i => { i.meals = true; i.food = false; i.meat = false; i.veg = false; });
  else render();
}
/** Primer día ya terminado (desde el inicio) sin cerrar: hay que cargar el veredicto para seguir. */
function pendingMeals() {
  if (!S.token || !S.startDate) return null;
  const today = todayISO();
  for (let d = S.startDate; d < today; d = addDays(d, 1)) { if (need(d) === 4) continue; const i = S.days[d]?.input ?? {}; if (!i.meals && !foodApproved(i)) return d; }
  return null;
}


/** Estado de las horas de videojuegos según el porcentaje del tope semanal. */
function gameStatus(h, cap) {
  const p = cap ? h / cap * 100 : 0;
  return p > 120 + 1e-9 ? ['bad', 'Pasaste el 120 %: resta 1 de Disciplina'] : p > 100 + 1e-9 ? ['bad', 'Pasaste el tope: esta semana no suma'] : p >= 95 ? ['bad', 'Alerta: estás por pasarte'] : p >= 80 ? ['gold', 'Aviso: llegaste al 80 % del tope'] : ['', 'Dentro del límite'];
}

function viewHoy() {
  if (!S.startDate) return '';
  const today = todayISO(), idx = dayIdx(viewDate);
  const title = '<h1>Misiones</h1>';
  const dow = (new Date(toUTC(viewDate)).getUTCDay() + 6) % 7, wkStart = addDays(viewDate, -dow);
  const strip = Array.from({ length: 7 }, (_, i) => { const d = addDays(wkStart, i), inp = S.days[d]?.input ?? {}, n = dailyDone(inp), off = d > today;
    return `<button class="wd ${d === viewDate ? 'sel' : ''} ${d === today ? 'tod' : ''} ${n >= need(d) ? 'full' : n ? 'some' : ''}" ${off ? 'disabled' : `data-act="day" data-d="${d}"`}><span>${'LMXJVSD'[i]}</span><b>${+d.slice(8)}</b><i></i></button>`; }).join('');
  const nav = `<div class="wk">${strip}</div><div class="daytitle">${viewDate === today ? 'Hoy' : 'Editando'} · ${pretty(viewDate)}${viewDate !== today ? ' · <a href="#" data-act="today">volver a hoy</a>' : ''}</div>`;
  const pre = dayIdx(today) < 0;
  if (idx < 0 && !pre) return `${title}${nav}<div class="card mute">Este día es anterior al inicio de tu torre.</div>`;
  const cur = pre ? current() : null, { e, results } = pre ? { e: cur.e, results: [{ floor: 1, events: [] }] } : compute(idx), st = e.state, r = results[pre ? 0 : idx], cfg = e.cfg;
  const dd = pre ? 0 : idx % 7, inp = pre ? {} : S.days[viewDate]?.input ?? {};
  const on = k => !!inp[k];
  const w = c => st.wu[c], m = c => st.mu[c];
  const ahead = pre ? 0 : e.xpFloor() - r.floor;   // pisos que el XP ya cubre pero todavía no se subieron (uno por día)
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
  h += `<div class="sum"><span><small>XP del día</small><b>+${fmt(gained)}</b></span><span><small>Piso</small><b>${r.floor}</b></span><span><small>Racha</small><b>${st.s} ${st.s === 1 ? 'mes' : 'meses'}</b></span><span><small>Multiplicador</small><b>×${String(+st.bonusW.toFixed(2)).replace('.', ',')}</b></span></div>${lost > 0 ? `<div class="mute" style="margin:-6px 0 10px">No cobrada por bloqueo: ${fmt(lost)}</div>` : ''}${ahead > 0 ? `<div class="mute" style="margin:-6px 0 10px">Tu XP ya alcanza para ${ahead === 1 ? 'un piso más' : ahead + ' pisos más'}: se sube de a uno por día.</div>` : ''}`;
  h += `<div class="seg">${sections.map(([k, l]) => `<button class="${mtab === k ? 'on' : ''}" data-act="mtab" data-v="${k}">${l}</button>`).join('')}</div><!--fit-->`;
  const wi = pre ? { n: 1, of: 4 } : e.weekInfo(idx), gH = st.gameHWk ?? 0, today0 = inp.gameH || 0, cap = cfg.gameCapH;
  const petIc = c => petFace(c, e.petLevel(c), 1);
  if (mtab === 'dia') {
    const wk = dd < 5 ? '+50 XP' : 'compensa un día perdido', n = dailyDone(inp), tot = dd < 5 ? 5 : 4;
    h += `<div class="card slim"><div class="row"><h2>Misiones del día</h2><span class="pill ${n >= tot ? 'ok' : ''}">${n} / ${tot}</span></div><div class="bar gold"><i style="width:${Math.min(100, n / tot * 100)}%"></i></div>`;
    h += row('gym', 'F', 'Gimnasio', `${wk} · sem ${w('F')}/3 · mes ${m('F')}/${cfg.gymM}`);
    h += row('read', 'I', 'Lectura', `${wk} · sem ${w('I')}/3`);
    h += row('aero', 'V', 'Aeróbico', `${wk} · sem ${w('V')}/3 · mes ${m('V')}/${cfg.aeroM}`);
    h += row('clean', 'O', 'Ambientes ordenados', `${wk} · sem ${st.roomsWk.length}/${cfg.namb} de ${ROOMS.length}`);
    if (dd >= 5) h += `<div class="mrow static"><span class="mic">${ic('P')}</span><span class="mtx"><b>Alimentación</b><small>fin de semana: permitido, no se registra</small></span></div>`;
    else { const fo = foodApproved(inp); h += `<button class="mrow ${fo ? 'on' : ''}" data-act="gotoalim"><span class="mic">${ic('P')}</span><span class="mtx"><b>Alimentación</b><small>${fo ? 'día aprobado' : inp.meals ? 'día no aprobado' : 'se evalúa en la pestaña Alimentación'} · sem ${foodText(st, cfg)}</small></span><span class="chk">${fo ? '✓' : ''}</span></button>`; }
    if (n >= tot) h += `<p class="allok">¡Todas las misiones del día cumplidas!</p>`;
    h += `</div>`;
    { const gs = gameStatus(gH, cap), pct = Math.min(100, gH / cap * 100);
      h += `<div class="card slim bronze"><div class="row"><h2>Disciplina</h2><span class="pill ${gs[0]}">${hrs(gH)} / ${hrs(cap)}</span></div><div class="bar gold"><i style="width:${pct}%"></i></div><div class="mute">${gs[1]} · hoy ${hrs(today0)}</div>`
        + `<div class="row" style="margin-top:8px"><input id="gh" type="text" inputmode="decimal" placeholder="Horas de videojuegos (ej.: 1,5)" ${pre ? 'disabled' : ''} autocomplete="off"><button class="btn sm" ${pre ? 'disabled' : 'data-act="gameadd"'}>Sumar</button></div>${today0 > 0 ? `<button class="undo" data-act="gamezero">Borrar las de hoy</button>` : ''}</div>`; }
  } else if (mtab === 'sem') {
    const rows = [['F', 'Fuerza', '3 sesiones', 3], ['I', 'Inteligencia', '3 lecturas', 3], ['V', 'Vitalidad', '3 aeróbicos', 3], ['O', 'Orden', `${cfg.namb} de ${ROOMS.length} ambientes · sin limpiar: ${ROOMS.filter(([id]) => !st.roomsWk.includes(id)).map(r => r[1]).join(', ') || 'ninguno'}`, cfg.namb]];
    const fed = foodOk(st, cfg), dn = rows.filter(([c]) => st.wdone.includes(c)).length + (st.wdone.includes('D') || st.wu.D >= 3 ? 1 : 0) + (fed ? 1 : 0);
    h += `<div class="card slim"><div class="row"><h2>Esta semana</h2><span class="pill ${dn === 6 ? 'ok' : ''}">${dn} / 6</span></div>`;
    h += rows.map(([c, nm, goal, max]) => info(c, nm, goal, pips(w(c), max), st.wdone.includes(c))).join('');
    h += info('D', 'Disciplina', `videojuegos ${hrs(gH)} de ${hrs(cap)} · suma hasta el tope`, '', st.wdone.includes('D') || st.wu.D >= 3);
    h += info('P', 'Alimentación', foodText(st, cfg), '', fed);
    h += `<div class="mute">Semanas buenas seguidas: ${st.wstreak}</div><p class="mute">Fin de semana: solo compensa días perdidos de lunes a viernes, sin XP extra.</p></div>`;
  } else {
    const rows = [['F', 'Fuerza', `${cfg.gymM} sesiones`, cfg.gymM], ['V', 'Vitalidad', `${cfg.aeroM} aeróbicos`, cfg.aeroM]];
    const dn = st.mdone.length;
    h += `<div class="card slim"><div class="row"><h2>Este mes</h2><span class="pill ${dn === 5 ? 'ok' : ''}">${dn} / 5</span></div>`;
    h += rows.map(([c, nm, goal, max]) => info(c, nm, `${m(c)} de ${goal}`, bar(m(c), max), st.mdone.includes(c))).join('');
    h += info('I', 'Inteligencia', 'Libro terminado (se carga en Estadísticas › Libros)', '', st.mdone.includes('I')) + info('O', 'Orden', 'Arreglo en la casa', '', st.mdone.includes('O'));
    h += info('D', 'Disciplina', `${m('D')} de ${wi.of} objetivos semanales`, bar(m('D'), wi.of), st.mdone.includes('D'));
    h += `</div>`;
    h += `<div class="card slim"><h2>Registrar hoy</h2><button class="mrow" data-act="gotobooks"><span class="mic">${ic('I')}</span><span class="mtx"><b>Libro terminado</b><small>se carga en Estadísticas › Libros · cumple la misión al instante</small></span></button>${row('repair', 'O', 'Arreglo en la casa', 'se cumple el día que lo marcás · el XP se reparte en 6 días')}</div>`;
  }
  if (doneRows.length) {
    h += `<div class="card slim"><button class="donebtn" data-act="showdone"><span>Completadas (${doneRows.length})</span><span>${showDone ? '▲' : '▼'}</span></button>`;
    if (showDone) h += doneRows.map(([k, c, l]) => `<div class="mrow static on"><span class="mic">${ic(c)}</span><span class="mtx"><b>${l}</b>${k === 'clean' ? `<small>${roomsOf(inp).map(r => (ROOMS.find(x => x[0] === r) || [0, r])[1]).join(', ') || 'sin ambiente'}</small>` : ''}</span>${k === 'clean' ? '<button class="undo" data-act="roomedit">Ambientes</button>' : ''}<button class="undo" data-act="undo" data-k="${k}">Deshacer</button></div>`).join('');
    h += `</div>`;
  }
  return h;
}

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
function viewTorre() {
  if (!S.startDate) return `<div class="card mute">Disponibles al ingresar.</div>`;
  if (dayIdx(todayISO()) < 0) return torreFull(1, arenaState(), '', current().e);
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
  return torreFull(L, arenaState(), info, e);
}
/** Barra de XP hasta el piso siguiente. */
function xpBar(e) {
  const f = e.floor(), c0 = cumXp(f, e.cfg.A, e.cfg.r), cost = cumXp(f + 1, e.cfg.A, e.cfg.r) - c0, into = e.state.xp - c0;
  const pct = Math.min(100, Math.max(0, into / cost * 100));
  const right = e.state.tower !== null ? 'torre completa' : e.state.blocked !== null ? 'detenido en la puerta' : into >= cost ? 'completo · el piso sube mañana' : `${fmt(into)} / ${fmt(cost)} XP`;
  return `<div class="xpbar"><div class="xprow"><span>Piso ${f} → ${f + 1}</span><span>${right}</span></div><div class="bar gold"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
}
/** Torre: título, barra de XP y la escena (terreno, senda con el personaje y la torre). */
function torreFull(floor, o, info, e) { const sc = torreScene(floor, o, '').replace(/<\/div>$/, `${info}</div>`); return `<div class="torrehead"><h1>Torre</h1><small>${zoneOf(floor).n} · Piso ${floor}</small></div>${xpBar(e)}<!--fit--><div class="torrefull" data-torre="1">${sc}</div>`; }

// ---------- historial (Récords y Logros) ----------
function history() {
  const today = dayIdx(todayISO()); if (!S.startDate || today < 0) return null;
  const e = new Engine({ startDate: S.startDate }), days = [];
  for (let i = 0; i <= today; i++) {
    const date = addDays(S.startDate, i), inp = S.days[date]?.input ?? {};
    const r = e.processDay(i === 0 && S.preEquip && !inp.equip ? { ...inp, equip: S.preEquip } : inp);
    days.push({ i, date, inp, xp: r.events.reduce((a, x) => a + x.paid, 0), s: e.state.s, ws: e.state.wstreak, floor: r.floor });
  }
  const weeks = [];
  for (const d of days) {
    const w = weeks[Math.floor(d.i / 7)] ??= { gym: 0, aero: 0, read: 0, rooms: 0, xp: 0, books: 0, gameH: 0, full: false };
    w.gym += d.inp.gym ? 1 : 0; w.aero += d.inp.aero ? 1 : 0; w.read += d.inp.read ? 1 : 0;
    w.rooms += roomsOf(d.inp).length || (d.inp.clean ? 1 : 0); w.xp += d.xp; w.books += d.inp.books?.length ?? 0; w.gameH += d.inp.gameH || 0;
  }
  weeks.forEach((w, k) => { w.full = (k + 1) * 7 <= days.length; });
  return { e, days, weeks };
}
/** Récords: columna izquierda = la semana en curso (se actualiza sola), derecha = histórico (mejor valor y total del reto). */
function viewRecords(h) {
  const W = h.weeks, cur = W[W.length - 1];
  const rows = [
    ['🏋️', 'Gimnasio', 'sesiones', w => w.gym, 'max'], ['🏃', 'Aeróbico', 'sesiones', w => w.aero, 'max'], ['📖', 'Lectura', 'días', w => w.read, 'max'],
    ['🧹', 'Orden', 'ambientes', w => w.rooms, 'max'], ['🎮', 'Disciplina', 'horas de juego', w => w.gameH, 'min'], ['⭐', 'XP ganada', 'XP', w => w.xp, 'max'],
  ];
  const f = (n, u) => u === 'horas' ? hrs(n) : fmt(n);
  let t = `<div class="card slim"><div class="rtab rhead"><span></span><span>Esta semana</span><span>Histórico</span></div>`;
  for (const [ic, nm, u, fn, kind] of rows) {
    const vals = W.map(fn), now = fn(cur), total = vals.reduce((a, x) => a + x, 0);
    const done = W.filter(w => w.full).map(fn), best = kind === 'min' ? (done.length ? Math.min(...done) : null) : Math.max(...vals);
    const rec = kind === 'max' && now > 0 && now >= best;
    t += `<div class="rtab"><span class="rl"><b>${ic} ${nm}</b><small>${u}</small></span><span class="rv ${rec ? 'rec' : ''}">${f(now, u)}${rec ? ' 🏅' : ''}</span><span class="rh"><small>${kind === 'min' ? 'menos' : 'mejor'}</small> ${best === null ? '—' : f(best, u)}<br><small>total</small> ${f(total, u)}</span></div>`;
  }
  t += `</div>`;
  const bestDay = h.days.reduce((a, d) => d.xp > a.xp ? d : a, h.days[0]);
  const wsMax = Math.max(...h.days.map(d => d.ws)), sMax = Math.max(...h.days.map(d => d.s));
  t += `<div class="card slim"><h2>Marcas del reto</h2>`
    + [['Mejor día de XP', `${fmt(bestDay.xp)} XP · ${pretty(bestDay.date)}`], ['Semanas buenas seguidas', `${wsMax}`], ['Racha mensual', `${sMax} ${sMax === 1 ? 'mes' : 'meses'}`], ['Piso', `${h.days[h.days.length - 1].floor}`], ['Libros leídos', `${h.days.reduce((a, d) => a + (d.inp.books?.length ?? 0), 0)}`]]
      .map(([k, v]) => `<div class="mrow static"><span class="mtx"><b>${k}</b></span><b>${v}</b></div>`).join('') + `</div>`;
  t += `<div class="card slim"><h2>Con el reloj</h2><p class="mute">Calorías quemadas, distancia y pasos aparecerán acá (récord semanal y total del reto) cuando conectemos el reloj.</p>`
    + ['Calorías quemadas', 'Distancia caminada y corrida', 'Pasos'].map(k => `<div class="mrow static"><span class="mtx"><b>${k}</b></span><span class="mute">—</span></div>`).join('') + `</div>`;
  return t;
}
function viewLogros(h) {
  const { e, days, weeks } = h, tot = k => days.reduce((a, d) => a + (d.inp[k] ? 1 : 0), 0);
  const books = days.reduce((a, d) => a + (d.inp.books?.length ?? 0), 0), wsMax = Math.max(...days.map(d => d.ws)), sMax = Math.max(...days.map(d => d.s));
  const fMax = days[days.length - 1].floor, pets = CATS.reduce((a, c) => a + e.petLevel(c), 0), gymBest = Math.max(...weeks.map(w => w.gym));
  const M = [
    ['🏋️', '10 sesiones', 'Gimnasio', tot('gym'), 10], ['🏋️', '50 sesiones', 'Gimnasio', tot('gym'), 50], ['🏋️', '100 sesiones', 'Gimnasio', tot('gym'), 100], ['🔥', 'Semana de 5', 'Cinco gimnasios en una semana', gymBest, 5],
    ['🏃', '10 aeróbicos', 'Vitalidad', tot('aero'), 10], ['🏃', '50 aeróbicos', 'Vitalidad', tot('aero'), 50],
    ['📚', 'Primer libro', 'Libros leídos', books, 1], ['📚', '6 libros', 'Libros leídos', books, 6], ['📚', '12 libros', 'Libros leídos', books, 12],
    ['📆', '4 semanas seguidas', 'Semanas buenas', wsMax, 4], ['📆', '8 semanas seguidas', 'Semanas buenas', wsMax, 8],
    ['🌙', 'Primer mes', 'Racha mensual', sMax, 1], ['🌙', '3 meses', 'Racha mensual', sMax, 3], ['🌙', '6 meses', 'Racha mensual', sMax, 6],
    ['🏰', 'Piso 10', 'Torre', fMax, 10], ['🏰', 'Piso 25', 'Torre', fMax, 25], ['🏰', 'Piso 50', 'Torre', fMax, 50], ['🏰', 'Piso 75', 'Torre', fMax, 75], ['👑', 'Torre completa', 'Piso 100', fMax, 100],
    ['🐾', 'Mascotas nivel 10', 'Suma de niveles', pets, 10], ['🐾', 'Mascotas al máximo', 'Suma de niveles', pets, 25],
  ];
  const got = M.filter(m => m[3] >= m[4]).length;
  return `<div class="card slim"><div class="row"><h2>Logros</h2><span class="pill ${got ? 'gold' : ''}">${got} / ${M.length}</span></div><div class="medals">${M.map(([ic, nm, ds, n, g]) => `<div class="medal ${n >= g ? 'on' : ''}"><span class="mi">${ic}</span><b>${nm}</b><small>${ds}</small><span class="mini"><i style="width:${Math.min(100, n / g * 100)}%"></i></span><small>${Math.min(n, g)} / ${g}</small></div>`).join('')}</div></div>`;
}
function viewLibros() {
  const today = todayISO(), list = [];
  for (const [d, v] of Object.entries(S.days)) (v.input?.books ?? []).forEach((b, k) => list.push({ d, k, ...b }));
  list.sort((a, b) => b.d.localeCompare(a.d) || b.k - a.k);
  const { e } = current(), mission = e.state.mdone.includes('I'), month = list.filter(b => b.d.slice(0, 7) === today.slice(0, 7)).length;
  let h = `<div class="card slim"><div class="row"><h2>Libros leídos</h2><span class="pill ${list.length ? 'ok' : ''}">${list.length}</span></div><div class="mute">Desde el ${pretty(S.startDate)} · este mes: ${month} · misión del mes: ${mission ? 'cumplida ✓' : 'pendiente'}</div></div>`;
  h += `<div class="card slim"><h2>Agregar libro</h2><label>Título<input id="bt" value="${esc(bkDraft.t)}" autocomplete="off"></label><label>Autor (opcional)<input id="ba" value="${esc(bkDraft.a)}" autocomplete="off"></label><label>Lo terminé el<input id="bd" type="date" min="${S.startDate}" max="${today}" value="${bkDraft.d || today}"></label><button class="btn" style="margin-top:10px" data-act="bookadd">Agregar libro</button><p class="mute">El primer libro del mes marca la misión de Inteligencia al instante; el XP se reparte en 6 días.</p></div>`;
  if (list.length) h += `<div class="card slim"><h2>Mi lista</h2>${list.map(b => `<div class="mrow static"><span class="mic">📖</span><span class="mtx"><b>${esc(b.t)}</b><small>${b.a ? esc(b.a) + ' · ' : ''}${pretty(b.d)}</small></span><button class="undo" data-act="bookdel" data-d="${b.d}" data-k="${b.k}">Borrar</button></div>`).join('')}</div>`;
  return h;
}
/** Marca las estadísticas vistas (para el aviso ¡sube!): se hace al dibujar la pestaña, no al armar su HTML. */
function statSeen() {
  const { st } = current(), seen = S.seenStat || {}, up = CATS.filter(c => st.stat[c] > (seen[c] ?? st.stat[c]));
  if (up.length || !S.seenStat) { S.seenStat = { ...st.stat }; save(); }
  if (up.length) setTimeout(() => { if (tab === 'stats') fx(0, 'semanal'); }, 500);
}
function viewStats() {
  if (!S.startDate) return `<h1>Estadísticas</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const head = `<h1>Estadísticas</h1>` + subtabs('stats', [['est', 'Stats'], ['rec', 'Récords'], ['logr', 'Logros'], ['lib', 'Libros']]) + '<!--fit-->';
  const sc = b => head + `<div class="iscroll">${b}</div>`;
  if (SUB.stats === 'lib') return sc(viewLibros());
  if (SUB.stats === 'rec' || SUB.stats === 'logr') { const h = history(); return sc(h ? (SUB.stats === 'rec' ? viewRecords(h) : viewLogros(h)) : `<div class="card mute">Disponible desde el primer día de tu torre.</div>`); }
  const { e, st } = current(), cap = e.statCap(), o = arenaState(), seen = S.seenStat || {}, up = CATS.filter(c => st.stat[c] > (seen[c] ?? st.stat[c]));
  const sf = o.floor;
  let h = head + `<div class="card statshero"><div class="stand" style="--gr:${zoneOf(o.floor).gr};--gr2:${zoneOf(o.floor).gr2}">${heroImgTag(sf, 4, o.done, 'idle')}<i class="floor"></i></div></div><div class="card">` + (Number.isFinite(cap) ? `<div class="mute">Tope actual: ${cap} · +1 por semanal cumplida, −1 por mensual fallado</div>` : '');
  for (const c of CATS) h += `<div style="margin-top:12px"><div class="row"><b>${iconTag(c)} ${NAMES[c]}${up.includes(c) ? ' <span class="pill gold">¡sube!</span>' : ''}</b><b>${st.stat[c]}${Number.isFinite(cap) ? ' / ' + cap : ''}</b></div><div class="bar"><i style="width:${Number.isFinite(cap) ? Math.min(100, st.stat[c] / cap * 100) : 100}%"></i></div></div>`;
  h += `</div>`;
  const gates = buildGates(e.cfg), nums = Object.keys(gates).map(Number).sort((a, b) => a - b), nextG = nums.find(g => g >= o.floor && !st.cleared.includes(g));
  if (nextG && st.tower === null) {
    const d = gates[nextG];
    h += `<div class="card slim"><div class="row"><h2>Próxima puerta · piso ${nextG}</h2><span class="pill">${nextG - o.floor === 0 ? 'ahora' : 'faltan ' + (nextG - o.floor) + ' pisos'}</span></div>`
      + (d.stats ? d.stats.map(c => `<div class="row" style="margin-top:6px"><span>${iconTag(c)} ${NAMES[c]}</span><b>${st.stat[c]} / ${d.req}</b></div><div class="bar"><i style="width:${Math.min(100, st.stat[c] / d.req * 100)}%"></i></div>`).join('') : '')
      + (d.streak !== undefined ? `<div class="row" style="margin-top:6px"><span>🌙 Racha mensual</span><b>${st.s} / ${d.streak}</b></div><div class="bar"><i style="width:${Math.min(100, st.s / d.streak * 100)}%"></i></div>` : '')
      + `</div>`;
  }
  return h;
}

// ---------- Alimentación (Hoy · Semana · Mascotas) ----------
function entryHTML(e, date) {
  return `<div class="entry">${e.kind === 'photo' ? `<img class="thumb" data-ph="${e.id}" alt="">` : '<span class="mic">✍️</span>'}<span class="mtx"><b>${e.t} · ${mealName(e.t)}</b><small class="dsc">${esc(e.descr)}</small></span></div>`;
}
function alimHoy() {
  const date = todayISO(), pre = dayIdx(date) < 0, inp = pre ? {} : S.days[date]?.input ?? {};
  const { e, st } = current(), cfg = e.cfg, list = mealsOf(date), v = S.verdict[date], ok = foodApproved(inp), closed = ok || !!inp.meals;
  const state = closed ? (ok ? ['ok', '✅ Día aprobado'] : ['bad', '❌ Día no aprobado']) : inp.verdictTx || v?.tx ? ['gold', '🕒 En curso'] : ['', 'Sin evaluar'];
  let h = `<div class="card slim"><div class="row"><h2>Hoy · ${pretty(date)}</h2><span class="pill ${state[0]}">${state[1]}</span></div><div class="mute">Semana: ${foodText(st, cfg)} · alimenta a ${PETS[st.equipped].name}</div></div>`;
  if ((new Date(toUTC(date)).getUTCDay() + 6) % 7 >= 5) return `<div class="card slim"><h2>Hoy · ${pretty(date)}</h2><p class="mute">Fin de semana: tus permitidos. No se registra la comida; la semana de alimentación corre de lunes a viernes.</p><div class="mute">Semana: ${foodText(st, cfg)} · alimenta a ${PETS[st.equipped].name}</div></div>`;
  const off = pre || !!busy || closed;
  h += `<div class="card slim"><div class="row"><h2>Comidas</h2><span class="pill">${list.length}</span></div>${list.length ? list.map(x => entryHTML(x, date)).join('') : '<p class="mute">Todavía no cargaste ninguna comida hoy.</p>'}`;
  h += txOpen ? `<div class="row" style="margin-top:10px"><button class="btn sm ghost" data-act="pickfoto" ${busy ? 'disabled' : ''}>📷 ${pendBlob ? 'Cambiar foto' : 'Agregar foto'}</button>${pendBlob ? `<img class="thumb" src="${pendURL}" alt="">` : '<span class="mute">sin foto</span>'}</div><textarea id="txin" rows="3" placeholder="${pendBlob ? 'Descripción breve (opcional, por las dudas)' : 'Qué comiste (ej.: 2 milanesas con ensalada y agua)'}">${esc(txDraft)}</textarea><div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="txcancel" ${busy ? 'disabled' : ''}>Cancelar</button><button class="btn sm" data-act="mealsend" ${busy ? 'disabled' : ''}>Enviar</button></div>`
    : `<button class="btn" style="margin-top:10px;width:100%" ${off ? 'disabled' : 'data-act="txopen"'}>Cargar comida</button>`;
  h += `${busy ? `<p class="mute busy">⏳ ${busy}</p>` : ''}${errMeal ? `<p class="err">${esc(errMeal)}</p>` : ''}</div>`;
  const tx = inp.verdictTx || v?.tx || '';
  h += `<div class="card slim"><h2>${closed ? 'Veredicto del día' : 'Cómo va el día'}</h2>${tx ? `<p class="vnote">${esc(tx)}</p>` : '<p class="mute">Cargá tu primera comida y la IA te cuenta qué comiste, los macros que sumaste y qué te falta. Cada comida nueva suma al análisis del día.</p>'}`;
  h += closed ? `<p class="mute">Día cerrado.</p>`
    : `<button class="btn" style="margin-top:10px;width:100%" ${pre || busy || !list.length ? 'disabled' : 'data-act="mealclose" data-d="' + date + '"'}>Cerrar el día</button>`;
  return h + `</div>`;
}
function alimSemana() {
  const today = todayISO(), dow = (new Date(toUTC(today)).getUTCDay() + 6) % 7, wk = addDays(today, -dow), { e, st } = current(), cfg = e.cfg;
  let h = `<div class="card slim"><div class="row"><h2>Esta semana</h2><span class="pill ${foodOk(st, cfg) ? 'ok' : ''}">${st.foodWk} / ${cfg.foodDays}</span></div><div class="bar gold"><i style="width:${Math.min(100, st.foodWk / cfg.foodDays * 100)}%"></i></div>`;
  for (let i = 0; i < 5; i++) {
    const d = addDays(wk, i), inp = S.days[d]?.input ?? {}, ok = foodApproved(inp), no = !ok && !!inp.meals, fut = d > today;
    h += `<div class="mrow static ${ok ? 'on' : ''}"><span class="mic">${'LMXJVSD'[i]}</span><span class="mtx"><b>${pretty(d)}</b><small>${ok ? 'aprobado' : no ? 'no aprobado' : fut ? 'por venir' : d === today ? 'hoy · sin cerrar' : 'sin cerrar'}</small></span><span class="chk">${ok ? '✓' : no ? '✗' : ''}</span></div>`;
  }
  return h + `<p class="mute">Con ${cfg.foodDays} de los 5 días de lunes a viernes aprobados, la semana alimenta a ${PETS[st.equipped].name} (+${cfg.petWeek} XP de mascota). Sábado y domingo son libres. No da XP de torre.</p></div>`;
}
function petsBody() {
  const { e, st } = current(), lv = e.petLevels(), cum = [0];
  for (const x of e.cfg.petCosts) cum.push(cum[cum.length - 1] + x);
  const total = CATS.reduce((a, c) => a + lv[c], 0);
  let h = '';
  if (st.feedStreak >= 1) h += `<div class="banner">Semanas sin alimentar seguidas: <b>${st.feedStreak}</b>. ${st.feedStreak >= 2 ? 'La mascota equipada pierde 1 nivel por cada semana fallada.' : 'Con la próxima semana fallada baja 1 nivel.'}</div>`;
  h += `<div class="card slim"><div class="row"><h2>Nivel total</h2><span class="pill gold">${total} / 25</span></div><div class="bar gold"><i style="width:${total / 25 * 100}%"></i></div></div><div class="pgrid">`;
  for (const c of CATS) {
    const l = lv[c], max = l >= 5, eq = st.equipped === c, pct = max ? 100 : (st.px[c] - cum[l]) / e.cfg.petCosts[l] * 100;
    h += `<div class="card pcard"><div class="phead"><div class="pface-wrap">${petFace(c, l, 2)}</div><div><b>${PETS[c].name}</b><small class="mute"> ${NAMES[c]}</small><div class="mute">Nivel ${l} / 5</div></div></div><div class="bar gold"><i style="width:${pct}%"></i></div><div class="row mute"><span>${max ? 'máximo' : `${st.px[c] - cum[l]} / ${e.cfg.petCosts[l]} XP`}</span>${eq ? '<span class="pill gold">equipada</span>' : `<button class="btn sm ghost" data-act="equip" data-c="${c}">Equipar</button>`}</div></div>`;
  }
  return h + `</div><p class="mute">Solo la mascota equipada aporta puntos en una puerta de estadísticas y solo a su propia estadística. Cada semana de alimentación aprobada le da ${e.cfg.petWeek} XP.</p>`;
}
function viewAlim() {
  if (!S.startDate) return `<h1>Alimentación</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const head = `<h1>Alimentación</h1>` + subtabs('alim', [['hoy', 'Hoy'], ['sem', 'Semana'], ['pet', 'Mascotas']]) + '<!--fit-->';
  return head + (SUB.alim === 'sem' ? alimSemana() : SUB.alim === 'pet' ? petsBody() : `<div class="iscroll">${alimHoy()}</div>`);
}

const SUB = { torre: 'res', ajustes: 'gen', stats: 'est', alim: 'hoy' };
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
  if (SUB.ajustes === 'gen') h += `<div class="card"><h2>Dirección de la app</h2><div class="mute" style="word-break:break-all;user-select:all">${esc(location.origin)}</div><div class="row" style="margin-top:8px"><button class="btn sm" data-act="copyurl">Copiar dirección</button></div><p class="mute">Para los atajos: pegala y agregá <b>/api/gym</b> al final.</p></div>`;
  const st = S.settings || {};
  if (SUB.ajustes === 'notif') {
  h += `<div class="card"><h2>Notificaciones</h2>`;
  if (!standalone) h += `<div class="banner">En el iPhone: abrí esta página en Safari, tocá Compartir → <b>Agregar a pantalla de inicio</b> y abrila desde ahí. Sin eso iOS no permite notificaciones.</div>`;
  h += `<div class="row"><button class="btn sm" data-act="push">Activar</button><button class="btn sm ghost" data-act="pushtest">Probar</button></div><div class="err" id="pushmsg">${esc(errMsg)}</div>`;
  h += `<label>Recordatorio diario (hora local)<input id="rh" type="number" min="0" max="23" value="${esc(st.reminder_hour ?? 21)}"></label><label>Aviso de alimentación del domingo (hora)<input id="fh" type="number" min="0" max="23" value="${esc(st.feed_hour ?? 18)}"></label><button class="btn sm ghost" data-act="saveset">Guardar horarios</button></div>`;
  } else h += `<div class="card"><h2>Datos</h2><div class="mute">Primer día: ${S.startDate ? pretty(S.startDate) : '—'}</div><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="export">Descargar respaldo</button><button class="btn sm ghost" data-act="logout">Cerrar sesión</button></div></div>`;
  return h;
}

const TABS = [['hoy', '✅', 'Misiones', viewHoy], ['torre', '🏰', 'Torre', viewTorre], ['stats', '📊', 'Estadísticas', viewStats], ['alim', '🍽️', 'Alimentación', viewAlim], ['ajustes', '⚙️', 'Ajustes', viewAjustes]];
function modalHTML() {
  if (!modal || !S.startDate) return '';
  if (modal.kind === 'meals') {
    const d = modal.date, list = mealsOf(d), tx = S.days[d]?.input?.verdictTx || '';
    return `<div class="modal"><div class="card slim"><h2>Cerrá el ${pretty(d)}</h2><p class="mute">Ese día quedó sin veredicto. Para seguir, cerralo.</p>${list.length ? list.map(x => entryHTML(x, d)).join('') : '<p class="mute">No hay comidas cargadas ese día.</p>'}${tx ? `<p class="vnote">${esc(tx)}</p>` : ''}${busy ? `<p class="mute busy">⏳ ${busy}</p>` : ''}${errMeal ? `<p class="err">${esc(errMeal)}</p>` : ''}<button class="btn" style="margin-top:8px;width:100%" ${busy || !list.length ? 'disabled' : `data-act="mealclose" data-d="${d}"`}>Cerrar el día</button>${errMeal ? `<p class="mute">Si la IA no funciona, marcalo a mano:</p><div class="row vbtns"><button class="btn sm ghost" data-act="mvno" data-d="${d}">No aprobado</button><button class="btn sm ghost" data-act="mvok" data-d="${d}">Aprobado</button></div>` : ''}</div></div>`;
  }
  if (modal.kind === 'room') {
    const { e } = compute(dayIdx(modal.date)), st = e.state, mine = roomsOf(S.days[modal.date]?.input ?? {}), taken = st.roomsWk.filter(r => !mine.includes(r)), sel = modal.sel;
    return `<div class="modal"><div class="card slim"><h2>¿Qué ambientes ordenaste?</h2><p class="mute">Podés marcar varios. Cada ambiente cuenta una vez por semana (${taken.length} de ${ROOMS.length} ya hechos antes; hacen falta ${e.cfg.namb}).</p><div class="rooms">${ROOMS.map(([id, nm]) => `<button class="room ${sel.includes(id) ? 'sel' : ''} ${taken.includes(id) ? 'taken' : ''}" ${taken.includes(id) ? 'disabled' : `data-act="roomtog" data-r="${id}"`}>${roomTile(id)}<b>${nm}</b>${sel.includes(id) || taken.includes(id) ? '<span class="ck">✓</span>' : ''}</button>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="roomcancel">Cancelar</button><button class="btn" data-act="roomsave">Listo${sel.length ? ` (${sel.length})` : ''}</button></div></div></div>`;
  }
  return '';
}
function render() {
  const view = TABS.find(t => t[0] === tab)[3];
  const app = document.getElementById('app'), focus = document.activeElement?.id;
  const offline = (!navigator.onLine || pending() > 0) && S.token ? `<div class="mute" style="text-align:right">${navigator.onLine ? 'pendiente de sincronizar' : 'sin conexión'}</div>` : '';
  if (!S.token && tab !== 'ajustes') { tab = 'ajustes'; return render(); }
  document.documentElement.classList.toggle('cf', has('marco'));
  // Registro de comidas obligatorio: si un día ya terminado quedó sin registrar, se pide antes que cualquier otra cosa.
  if (!modal) { const pm = pendingMeals(); if (pm) { modal = { kind: 'meals', date: pm }; loadMeals(pm); } }
  const html = offline + view(), mk = html.indexOf('<!--fit-->');
  app.innerHTML = mk < 0 ? `<div id="fit">${html}</div>` : `${html.slice(0, mk)}<div id="fit">${html.slice(mk + 10)}</div>`; renderStrip();
  document.getElementById('modal').innerHTML = modalHTML();
  document.getElementById('tabs').innerHTML = TABS.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
  if (tab === 'stats' && S.startDate && SUB.stats === 'est') statSeen();
  if (tab === 'alim' && S.token) loadMeals(todayISO());
  hydratePhotos();
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
  document.querySelectorAll('.stand img.hero').forEach(img => {
    if (!img.complete || !img.naturalHeight) return;
    const g = bottomGap(img);
    img.style.marginBottom = g ? `-${(g * (parseFloat(img.getAttribute('height')) / img.naturalHeight)).toFixed(2)}px` : '';
  });
}
function variants() {
  if (tab === 'hoy' && S.startDate) return { get: () => mtab, set: v => { mtab = v; }, list: ['dia', 'sem', 'mes'] };
  if (tab === 'stats' && S.startDate) return { get: () => SUB.stats, set: v => { SUB.stats = v; }, list: ['est', 'rec', 'logr', 'lib'] };
  if (tab === 'alim' && S.startDate) return { get: () => SUB.alim, set: v => { SUB.alim = v; }, list: ['hoy', 'sem', 'pet'] };
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
  const inner = top - parseFloat(cs.paddingTop) - 92;  // 92: título TORRE y barra de XP (igual en todas las pestañas)
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
    const isc = f.querySelector('.iscroll');
    let z = isc ? 1 : bestZoom(f, avail);
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
          if (html.includes('class="iscroll"')) continue;
          probe.innerHTML = k < 0 ? html : html.slice(k + 10);
          z = Math.min(z, bestZoom(probe, avail));
        }
      } finally { vs.set(cur); probe.remove(); }
    }
    f.style.zoom = z < 1 ? z.toFixed(3) : 1;
    if (isc) {   // lista con desplazamiento propio: el título y las solapas quedan fijos
      isc.style.maxHeight = 'none';
      const off = isc.getBoundingClientRect().top - f.getBoundingClientRect().top;
      isc.style.maxHeight = Math.max(90, (avail - off) / Math.min(1, z) - 2) + 'px';
      app.style.overflowY = 'hidden'; return;
    }
    app.style.overflowY = f.getBoundingClientRect().height > avail + 1 ? 'auto' : 'hidden';
  } finally { fitting = false; }
}
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 300));
document.addEventListener('load', e => { const t = e.target; if (t.tagName === 'IMG' && t.matches('.hero, .pet')) sinkFeet(); else fit(); }, true);
document.fonts?.ready.then(fit);

// ---------- franja de batalla ----------
// Lienzo lógico de 240×64: todo se posiciona en unidades de ese lienzo (cqw) para que escale parejo en cualquier pantalla.
let runTimer = 0, stripKey = '', readyN = 0, opening = false, phase = '';
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
  const idle = o.running ? '' : 'idle', hx = 26, pxx = Math.max(2, hx + 4 - petArenaW(o.eq, o.pl));
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
  const key = JSON.stringify({ o: [o.pre, floor, o.eq, o.pl, o.running, o.boss, o.done, o.speed, o.gait, o.hf, o.hz], phase, readyN, tab: tab === 'hoy' });
  if (key === stripKey) return; stripKey = key;
  el.innerHTML = `<div class="strip ${!o.running && !o.pre ? 'blocked' : ''}">${arenaHTML(o)}</div>`;
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
  const s = document.querySelector('.arena') || document.querySelector('.statshero') || document.body;
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
  if (a === 'tab') { tab = el.dataset.t; if (tab === 'ajustes') errMsg = ''; render(); if (tab === 'alim') loadMeals(todayISO(), true); }
  else if (a === 'sub') { SUB[el.dataset.k] = el.dataset.v; render(); }
  else if (a === 't') {
    const k = el.dataset.k, now = Date.now();
    if (lastTap.k === k && now - lastTap.t < 450) { lastTap = { k: '', t: 0 }; toggle(viewDate, k); }
    else { lastTap = { k, t: now }; el.classList.add('armed'); setTimeout(() => el.classList.remove('armed'), 450); hint('Tocá otra vez para completar'); }
  }
  else if (a === 'gameadd') {
    const v = parseFloat((document.getElementById('gh')?.value || '').replace(',', '.'));
    if (!(v > 0 && v <= 24)) { hint('Escribí las horas (ej.: 1,5)'); return; }
    setInput(viewDate, i => { i.gameH = Math.round(((i.gameH || 0) + v) * 100) / 100; });
    const cs = compute(dayIdx(viewDate)).e, g = gameStatus(cs.state.gameHWk ?? 0, cs.cfg.gameCapH); hint(g[1]);
  }
  else if (a === 'gamezero') setInput(viewDate, i => { delete i.gameH; });
  else if (a === 'gotoalim') { tab = 'alim'; SUB.alim = 'hoy'; render(); }
  else if (a === 'gotobooks') { tab = 'stats'; SUB.stats = 'lib'; render(); }
  else if (a === 'pickfoto') {
    const pick = document.createElement('input'); pick.type = 'file'; pick.accept = 'image/*';
    pick.onchange = async () => { const f = pick.files[0]; if (!f) return; try { const b = await shrink(f); if (pendURL) URL.revokeObjectURL(pendURL); pendBlob = b; pendURL = URL.createObjectURL(b); txDraft = document.getElementById('txin')?.value ?? txDraft; render(); } catch { errMeal = 'No se pudo leer la foto'; render(); } };
    pick.click();
  }
  else if (a === 'txopen') { txOpen = true; errMeal = ''; render(); }
  else if (a === 'txcancel') { txOpen = false; txDraft = ''; pendBlob = null; if (pendURL) URL.revokeObjectURL(pendURL); pendURL = ''; render(); }
  else if (a === 'mealsend') { const tx = (document.getElementById('txin')?.value || '').trim(); if (!pendBlob && !tx) { hint('Agregá una foto o escribí qué comiste'); return; } mealSend(pendBlob, tx); }
  else if (a === 'copyurl') { try { await navigator.clipboard.writeText(location.origin); hint('Dirección copiada'); } catch { hint('Mantené apretada la dirección para copiarla'); } }
  else if (a === 'mealclose') mealClose(el.dataset.d);
  else if (a === 'mvok' || a === 'mvno') { const d = el.dataset.d, tx = (document.getElementById('mvtx')?.value || '').trim(); modal = null; setVerdict(d, a === 'mvok' ? 'ok' : 'no', tx); }
  else if (a === 'bookadd') {
    const t = (document.getElementById('bt')?.value || '').trim(), au = (document.getElementById('ba')?.value || '').trim(), d = document.getElementById('bd')?.value || todayISO();
    if (!t) { hint('Escribí el título'); return; }
    if (d < S.startDate || d > todayISO()) { hint('La fecha tiene que estar dentro del reto'); return; }
    bkDraft = { t: '', a: '', d: '' };
    setInput(d, i => { i.books = [...(i.books || []), au ? { t, a: au } : { t }]; });
    hint('Libro agregado · misión de Inteligencia cumplida');
  }
  else if (a === 'bookdel') { const d = el.dataset.d, k = +el.dataset.k; setInput(d, i => { const b = [...(i.books || [])]; b.splice(k, 1); i.books = b.length ? b : undefined; }); }
  else if (a === 'roomtog') { const r = el.dataset.r, s = modal.sel; modal.sel = s.includes(r) ? s.filter(x => x !== r) : [...s, r]; render(); }
  else if (a === 'roomedit') { modal = { kind: 'room', date: viewDate, before: dayGain(viewDate), sel: roomsOf(S.days[viewDate]?.input ?? {}), fresh: false }; render(); }
  else if (a === 'roomsave') {
    const m0 = modal; modal = null;
    if (!m0.sel.length && m0.fresh) { setInput(m0.date, i => { delete i.clean; delete i.room; delete i.rooms; }); return; }
    setInput(m0.date, i => { delete i.room; if (m0.sel.length) { i.rooms = m0.sel; i.clean = true; } else { delete i.rooms; delete i.clean; } });
    const idx = dayIdx(m0.date), c = compute(idx).results[idx].completed;
    fx(Math.round(dayGain(m0.date) - m0.before), c.monthly.length ? 'mensual' : c.weekly.length || c.pet ? 'semanal' : 'diaria');
  }
  else if (a === 'roomcancel') { const m0 = modal; modal = null; if (m0.fresh) setInput(m0.date, i => { delete i.clean; delete i.room; delete i.rooms; }); else render(); }
  else if (a === 'undo') setInput(viewDate, i => { i[el.dataset.k] = false; if (el.dataset.k === 'clean') { delete i.room; delete i.rooms; } });
  else if (a === 'showdone') { showDone = !showDone; render(); }
  else if (a === 'anti') setInput(viewDate, i => { i.anti = i.anti === false ? undefined : false; });
  else if (a === 'prev') { viewDate = addDays(viewDate, -1); render(); }
  else if (a === 'next') { if (viewDate < todayISO()) { viewDate = addDays(viewDate, 1); render(); } }
  else if (a === 'today') { ev.preventDefault(); viewDate = todayISO(); render(); }
  else if (a === 'equip') { if (dayIdx(todayISO()) < 0) { S.preEquip = el.dataset.c; save(); stripKey = ''; render(); } else setInput(todayISO(), i => { i.equip = el.dataset.c; }); }
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

document.addEventListener('input', ev => {
  const id = ev.target.id, v = ev.target.value;
  if (id === 'txin') txDraft = v; else if (id === 'vtx' || id === 'mvtx') vDraft = v;
  else if (id === 'bt') bkDraft.t = v; else if (id === 'ba') bkDraft.a = v; else if (id === 'bd') bkDraft.d = v;
});

async function detectMode() {
  if (S.token) return;
  try { mode = (await api('/api/status')).configured ? 'login' : 'setup'; } catch { mode = 'login'; errMsg = 'Sin conexión.'; }
  render();
}

// ---------- arranque ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (viewDate > todayISO()) viewDate = todayISO(); sync(); render(); if (tab === 'alim') loadMeals(todayISO(), true); } });
setReadyHandler(() => { readyN++; render(); });
onAssets(() => { readyN++; render(); });
render(); detectMode(); sync();
preloadHero().then(() => { readyN++; render(); });

// Como una aplicación: sin zoom por pellizco ni doble toque, sin rebote de la página.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input')) e.preventDefault(); });
