import { Rise, ladder, needSessions } from '/rise.js';
import { zoneOf } from '/art.js';
import { ROOMS, roomTile, onAssets, exists, has, url, heroSrc, heroSprite, petFace, petTag, petSprite, petArenaW, bossSprite, towerLayer, runFrames, petRunFrames, heroImgTag, scrollLayers, iconTag, PETS, BOSSES, gaitFor, GAIT_MS, preloadHero, zoneTowerSrc } from '/assets.js';
import { px, setReadyHandler } from '/px.js';
const IMG = (svg, w, h, k, cls = '') => `<img class="px ${cls}" alt="" src="${px(svg, w, h)}" width="${w * k}" height="${h * k}">`;

const NAMES = { F: 'Fuerza', I: 'Inteligencia', V: 'Vitalidad', D: 'Disciplina', O: 'Orden' };
const CATS = ['F', 'I', 'V', 'D', 'O'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const KEY = 'pd1';

// ---------- estado local (con respaldo en el servidor) ----------
let S = { token: '', startDate: '', days: {}, settings: {}, device: Math.random().toString(36).slice(2, 10), lastSync: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* sin almacenamiento */ }
let ver = 0;
const save = () => { ver++; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignorar */ } };

const THEMES = [['gladiador', 'Gladiador', '#1b1210'], ['caballero', 'Caballero', '#0e1626']];
function applyTheme() {
  const t = THEMES.find(x => x[0] === S.theme) ? S.theme : 'gladiador';
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = THEMES.find(x => x[0] === t)[2];
}
applyTheme();
let modal = null, showDone = false, lastTap = { k: '', t: 0 }, mtab = 'dia', tab = 'hoy', lastTab = 'hoy', viewDate = todayISO(), syncMsg = '', syncing = false, errMsg = '', mode = null, timer = 0;

// ---------- fechas (UTC puro, sin zona horaria) ----------
function pad(n) { return String(n).padStart(2, '0'); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(iso, n) { const t = new Date(toUTC(iso) + n * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function dayIdx(iso) { return Math.round((toUTC(iso) - toUTC(S.startDate)) / 864e5); }
function nextMonday(iso) { const dow = (new Date(toUTC(iso)).getUTCDay() + 6) % 7; return dow === 0 ? iso : addDays(iso, 7 - dow); }
function pretty(iso) { const d = new Date(toUTC(iso)); const w = DOW[(d.getUTCDay() + 6) % 7]; return `${w} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; }

// ---------- motor (Rise v2) ----------
const newRise = () => new Rise(S.startDate ? { startDate: S.startDate } : {});
const cmem = new Map();
/** Rehace el historial hasta el día upToIdx (en caché hasta que cambien los datos). */
function compute(upToIdx) {
  const k = ver + ':' + S.startDate + ':' + upToIdx; if (cmem.has(k)) return cmem.get(k);
  const e = newRise(), results = [];
  for (let i = 0; i <= upToIdx; i++) results.push(e.processDay(S.days[addDays(S.startDate, i)]?.input ?? {}));
  if (cmem.size > 40) cmem.clear();
  const out = { e, results }; cmem.set(k, out); return out;
}

// ---------- edición ----------
function setInput(date, fn) {
  const cur = S.days[date] ?? { input: {}, updated_at: 0 };
  const input = { ...cur.input }; fn(input);
  for (const k of Object.keys(input)) if (input[k] === false || input[k] === undefined) delete input[k];
  S.days[date] = { input, updated_at: Date.now(), dirty: true };
  save(); render(); clearTimeout(timer); timer = setTimeout(sync, 1500);
}
/** Estado actual; antes del inicio es el estado de partida (todo en cero). */
function current() {
  const i = dayIdx(todayISO());
  if (!S.startDate || i < 0) { const e = newRise(); return { e, st: e.state, pre: true }; }
  const { e } = compute(i); return { e, st: e.state, pre: false };
}
function dayGain(date) { const i = dayIdx(date); if (i < 0) return 0; return compute(i).results[i].events.reduce((a, x) => a + x.amount, 0); }
function hint(text) {
  let t = document.getElementById('hint');
  if (!t) { t = document.createElement('div'); t.id = 'hint'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1200);
}
/** Cambia el registro de un día y festeja si ganó XP. */
function actDay(date, fn) {
  const before = dayGain(date); setInput(date, fn);
  const g = Math.round(dayGain(date) - before); if (g > 0) fx(g, 'diaria');
}

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
    // Si el servidor reinició el progreso (otra fecha de inicio), se descarta lo guardado en este dispositivo.
    if (r.settings.start_date && S.startDate && r.settings.start_date !== S.startDate) { S.days = {}; S.log = {}; S.verdict = {}; }
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
const mealClose = date => aiRun('Armando el puntaje final del día…', async () => {
  const r = await api('/api/meal/close', 'POST', { date }); S.mc[date] = { meals: r.meals };
  if (!r.closed) errMeal = 'La IA no dio un puntaje claro: tocá Reabrir y volvé a confirmar.';
});
const fetched = new Set();
async function loadMeals(date, force) {
  if (!S.token || (fetched.has(date) && !force)) return; fetched.add(date);
  try { const r = await api('/api/meals?date=' + date); S.mc[date] = { meals: r.meals }; save(); render(); } catch { fetched.delete(date); }
}
/** Estado de las horas de videojuegos según el porcentaje del tope semanal. */
function gameStatus(h, cap) {
  const p = cap ? h / cap * 100 : 0;
  return p > 120 + 1e-9 ? ['bad', 'Pasaste el 120 %: resta 1 de Disciplina'] : p > 100 + 1e-9 ? ['bad', 'Pasaste el tope: esta semana no suma'] : p >= 95 ? ['bad', 'Alerta: estás por pasarte'] : p >= 80 ? ['gold', 'Aviso: llegaste al 80 % del tope'] : ['', 'Dentro del límite'];
}

// ---------- Objetivos: el tablero del día ----------
const wkdayOf = d => (new Date(toUTC(d)).getUTCDay() + 6) % 7;
const isSess = inp => (inp.gymMin ?? (inp.gym ? 60 : 0)) >= 40;
const waterOk = inp => (inp.waterMl ?? 0) >= 2500 || !!inp.water;
const dayDoneN = (inp, d) => [isSess(inp), !!inp.read, roomsOf(inp).length > 0, waterOk(inp), ...(wkdayOf(d) < 5 ? [inp.foodPct !== undefined] : [])].filter(Boolean).length;
const dayNeed = d => (wkdayOf(d) < 5 ? 5 : 4);
const pc = x => Math.round(x * 100) + ' %';
const litros = ml => (ml / 1000).toFixed(2).replace(/0$/, '').replace('.', ',') + ' L';
const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, q) => `<i class="${q < n ? 'f' : ''}"></i>`).join('')}</span>`;
const miniBar = (n, max) => `<span class="mini"><i style="width:${Math.min(100, max ? n / max * 100 : 0)}%"></i></span>`;
const infoRow = (cat, label, meta, right, done) => `<div class="mrow static ${done ? 'on' : ''}"><span class="mic">${cat === 'P' ? '🐾' : iconTag(cat, 2)}</span><span class="mtx"><b>${label}</b><small>${meta}</small></span>${right}<span class="chk">${done ? '✓' : ''}</span></div>`;

/** Tarjeta de comidas del día: lista, carga (foto o texto) y el puntaje que va dando la IA. */
function foodCard(date, inp, locked) {
  if (wkdayOf(date) >= 5) return `<div class="card slim"><h2>Comidas</h2><p class="mute">Fin de semana: tus permitidos. La comida no puntúa.</p></div>`;
  const list = mealsOf(date), isToday = date === todayISO(), pre = dayIdx(date) < 0, off = pre || !!busy || locked || !isToday;
  const sc = inp.foodPct, cls = sc >= 0.8 ? 'ok' : sc >= 0.5 ? 'gold' : sc !== undefined ? 'bad' : '';
  let h = `<div class="card slim"><div class="row"><h2>Comidas</h2><span class="pill ${cls}">${sc === undefined ? 'sin puntuar' : (inp.meals ? 'final ' : 'va ') + pc(sc)}</span></div>`;
  h += list.length ? list.map(x => entryHTML(x, date)).join('') : '<p class="mute">Todavía no cargaste ninguna comida.</p>';
  h += txOpen && isToday ? `<div class="row" style="margin-top:10px"><button class="btn sm ghost" data-act="pickfoto" ${busy ? 'disabled' : ''}>📷 ${pendBlob ? 'Cambiar foto' : 'Agregar foto'}</button>${pendBlob ? `<img class="thumb" src="${pendURL}" alt="">` : '<span class="mute">sin foto</span>'}</div><textarea id="txin" rows="3" placeholder="${pendBlob ? 'Descripción breve (opcional, por las dudas)' : 'Qué comiste (ej.: 2 milanesas con ensalada y agua)'}">${esc(txDraft)}</textarea><div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="txcancel" ${busy ? 'disabled' : ''}>Cancelar</button><button class="btn sm" data-act="mealsend" ${busy ? 'disabled' : ''}>Enviar</button></div>`
    : `<button class="btn" style="margin-top:10px;width:100%" ${off ? 'disabled' : 'data-act="txopen"'}>Cargar comida</button>`;
  h += `${busy ? `<p class="mute busy">⏳ ${busy}</p>` : ''}${errMeal ? `<p class="err">${esc(errMeal)}</p>` : ''}`;
  if (inp.verdictTx) h += `<p class="vnote">${esc(inp.verdictTx)}</p>`;
  return h + `</div>`;
}

function viewHoy() {
  if (!S.startDate) return '';
  const today = todayISO(), idx = dayIdx(viewDate), pre = dayIdx(today) < 0;
  const title = '<h1>Objetivos</h1>';
  const dow = wkdayOf(viewDate), wkStart = addDays(viewDate, -dow);
  const strip = Array.from({ length: 7 }, (_, i) => { const d = addDays(wkStart, i), inp = S.days[d]?.input ?? {}, n = dayDoneN(inp, d), off = d > today;
    return `<button class="wd ${d === viewDate ? 'sel' : ''} ${d === today ? 'tod' : ''} ${n >= dayNeed(d) ? 'full' : n ? 'some' : ''}" ${off ? 'disabled' : `data-act="day" data-d="${d}"`}><span>${'LMXJVSD'[i]}</span><b>${+d.slice(8)}</b><i></i></button>`; }).join('');
  const nav = `<div class="wk">${strip}</div><div class="daytitle">${viewDate === today ? 'Hoy' : 'Editando'} · ${pretty(viewDate)}${viewDate !== today ? ' · <a href="#" data-act="today">volver a hoy</a>' : ''}</div>`;
  if (idx < 0 && !pre) return `${title}${nav}<div class="card mute">Este día es anterior al inicio de tu torre.</div>`;
  const { e, results } = pre ? { e: newRise(), results: [{ events: [], floor: 1 }] } : compute(idx), st = e.state, r = results[pre ? 0 : idx], cfg = e.cfg;
  const inp = pre ? {} : S.days[viewDate]?.input ?? {}, locked = pre || !!inp.closed;
  const gained = r.events.reduce((a, x) => a + x.amount, 0), mult = ladder(st.k, Math.min(st.wk.sess, 4));
  const wk = st.wk, mo = st.mo, gH = wk.gameH, cap = cfg.gameCapH;
  let h = title + nav;
  if (st.blocked !== null && viewDate === today) h += `<div class="banner">🔒 <b>Puerta del piso ${st.blocked}.</b> Tu XP sigue sumando, pero el piso espera hasta que cada estadística (con tu mascota) llegue al mínimo. Mirá la Torre.</div>`;
  if (viewDate === today && idx > 0) { const y = addDays(today, -1), yi = S.days[y]?.input; if (yi && Object.keys(yi).length && !yi.closed) h += `<div class="banner">Ayer quedó sin confirmar. <a href="#" data-act="day" data-d="${y}">Revisarlo</a></div>`; }
  h += `<div class="sum"><span><small>XP del día</small><b>+${fmt(gained)}</b></span><span><small>Piso</small><b>${Math.max(1, r.floor)}</b></span><span><small>Racha</small><b>${st.k} ${st.k === 1 ? 'sem' : 'sems'}</b></span><span><small>Multiplic.</small><b>×${String(+mult.toFixed(2)).replace('.', ',')}</b></span></div>`;
  h += `<div class="seg">${[['dia', 'Día'], ['sem', 'Semana'], ['mes', 'Mes']].map(([k, l]) => `<button class="${mtab === k ? 'on' : ''}" data-act="mtab" data-v="${k}">${l}</button>`).join('')}</div><!--fit-->`;
  if (mtab === 'dia') {
    const sessMin = inp.gymMin ?? (inp.gym ? 60 : 0), gs = gameStatus(gH, cap), n = dayDoneN(inp, viewDate), tot = dayNeed(viewDate);
    let b = `<div class="card slim"><div class="row"><h2>Automático</h2><span class="pill ${isSess(inp) ? 'ok' : ''}">${isSess(inp) ? 'sesión ✓' : 'sin sesión'}</span></div>`
      + infoRow('F', 'Gimnasio / boxeo', `${sessMin} min · se detecta por ubicación`, '', isSess(inp))
      + `<div class="row" style="margin:4px 0 8px"><input id="gm" type="text" inputmode="numeric" placeholder="Minutos (si falló el atajo)" ${locked ? 'disabled' : ''} autocomplete="off"><button class="btn sm" ${locked ? 'disabled' : 'data-act="gymset"'}>Fijar</button></div>`
      + `<div class="row"><b>${iconTag('D', 1)} Juegos</b><span class="pill ${gs[0]}">${hrs(gH)} / ${hrs(cap)}</span></div><div class="bar gold"><i style="width:${Math.min(100, gH / cap * 100)}%"></i></div><div class="mute">${gs[1]} · hoy ${hrs(inp.gameH || 0)}</div>`
      + `<div class="row" style="margin-top:8px"><input id="gh" type="text" inputmode="decimal" placeholder="Horas de videojuegos (ej.: 1,5)" ${locked ? 'disabled' : ''} autocomplete="off"><button class="btn sm" ${locked ? 'disabled' : 'data-act="gameadd"'}>Sumar</button></div>${(inp.gameH || 0) > 0 && !locked ? `<button class="undo" data-act="gamezero">Borrar las de hoy</button>` : ''}</div>`;
    b += foodCard(viewDate, inp, locked);
    const ml = inp.waterMl ?? 0;
    b += `<div class="card slim"><div class="row"><h2>Agua</h2><span class="pill ${waterOk(inp) ? 'ok' : ''}">${litros(ml)} / 2,5 L</span></div><div class="bar"><i style="width:${Math.min(100, ml / 25)}%"></i></div><div class="row"><button class="btn sm ghost" data-act="water" data-v="-250" ${locked || ml <= 0 ? 'disabled' : ''}>− vaso</button><button class="btn sm" data-act="water" data-v="250" ${locked ? 'disabled' : ''}>+ vaso (250 ml)</button></div></div>`;
    const mine = roomsOf(inp), taken = wk.rooms.filter(x => !mine.includes(x));
    b += `<div class="card slim"><div class="row"><h2>Ambientes</h2><span class="pill ${wk.rooms.length >= cfg.cleanRoomsWeek ? 'ok' : ''}">${wk.rooms.length} / ${cfg.cleanRoomsWeek} esta semana</span></div><div class="rooms">${ROOMS.map(([id, nm]) => `<button class="room ${mine.includes(id) ? 'sel' : ''} ${taken.includes(id) ? 'taken' : ''}" ${locked ? 'disabled' : `data-act="roomtap" data-r="${id}"`}>${roomTile(id)}<b>${nm}</b>${mine.includes(id) || taken.includes(id) ? '<span class="ck">✓</span>' : ''}</button>`).join('')}</div><p class="mute">Tocá los que limpiaste hoy. La primera limpieza del día vale más; los otros ambientes suman menos. Cada ambiente cuenta una vez por semana.</p></div>`;
    b += `<div class="card slim"><button class="mrow ${inp.read ? 'on' : ''}" ${locked ? 'disabled' : 'data-act="readtog"'}><span class="mic">${iconTag('I', 2)}</span><span class="mtx"><b>Leí hoy</b><small>10 páginas alcanzan · suma XP de Inteligencia</small></span><span class="chk">${inp.read ? '✓' : ''}</span></button></div>`;
    b += locked && !pre
      ? `<div class="banner ok">Día confirmado ✓ · ${n} / ${tot}</div><button class="btn ghost" style="width:100%" data-act="reopen">Reabrir el día</button>`
      : `<button class="btn" style="width:100%" ${pre || viewDate > today ? 'disabled' : 'data-act="confirm"'}>Confirmar día (${n} / ${tot})</button>`;
    h += `<div class="iscroll">${b}</div>`;
  } else if (mtab === 'sem') {
    const need = needSessions(st.k), avg = wk.food.length ? wk.food.reduce((a, x) => a + x, 0) / wk.food.length : 0;
    h += `<div class="card slim"><div class="row"><h2>Esta semana</h2><span class="pill ${e.weekType(pre ? 0 : idx) === 'descarga' ? 'gold' : ''}">semana de ${e.weekType(pre ? 0 : idx)}</span></div>`;
    h += infoRow('F', 'Fuerza', `${wk.min} de ${cfg.fuerzaWeekMin} min (6 h)`, miniBar(wk.min, cfg.fuerzaWeekMin), wk.min >= cfg.fuerzaWeekMin);
    h += infoRow('V', 'Vitalidad', `comida L–V: promedio ${wk.food.length ? pc(avg) : '—'} (hace falta ${pc(cfg.foodThr)})`, miniBar(avg, cfg.foodThr), wk.food.length > 0 && avg >= cfg.foodThr - 1e-9);
    h += infoRow('O', 'Orden', `${wk.rooms.length} de ${cfg.cleanRoomsWeek} ambientes distintos de ${ROOMS.length}`, pips(wk.rooms.length, cfg.cleanRoomsWeek), wk.rooms.length >= cfg.cleanRoomsWeek);
    h += infoRow('D', 'Disciplina', `juegos ${hrs(gH)} de ${hrs(cap)}`, '', gH <= cap);
    h += infoRow('P', 'Mascota · constancia', `${wk.sess} sesiones · mínimo ${need} para mantener la racha`, pips(Math.min(wk.sess, 5), 5), wk.sess >= need);
    h += infoRow('P', 'Mascota · progreso', `${wk.prog} ejercicio${wk.prog === 1 ? '' : 's'} mejorado${wk.prog === 1 ? '' : 's'} (${e.weekType(pre ? 0 : idx) === 'carga' ? 'más peso' : '1 repetición más'})`, '', wk.prog > 0);
    h += `<p class="mute">Racha: semana ${st.k} · ×${String(+mult.toFixed(2)).replace('.', ',')}. Fuerza, Vitalidad, Orden y Disciplina pagan al cerrar la semana (domingo).</p></div>`;
  } else {
    const avg = mo.food.length ? mo.food.reduce((a, x) => a + x, 0) / mo.food.length : 0;
    h += `<div class="card slim"><div class="row"><h2>Este mes</h2></div>`;
    h += infoRow('F', 'Fuerza', `${Math.round(mo.min / 60)} de ${cfg.fuerzaMonthMin / 60} h en el gimnasio`, miniBar(mo.min, cfg.fuerzaMonthMin), mo.min >= cfg.fuerzaMonthMin);
    h += infoRow('V', 'Vitalidad', `comida: promedio del mes ${mo.food.length ? pc(avg) : '—'} (hace falta ${pc(cfg.foodThr)})`, miniBar(avg, cfg.foodThr), mo.food.length > 0 && avg >= cfg.foodThr - 1e-9);
    h += infoRow('I', 'Inteligencia', `${mo.books} libro${mo.books === 1 ? '' : 's'} este mes · el primero vale el doble (se cargan en Torre › Registro)`, '', mo.books > 0);
    h += infoRow('O', 'Orden', `${mo.repairs} arreglo${mo.repairs === 1 ? '' : 's'} este mes · el primero vale el doble (Torre › Registro)`, '', mo.repairs > 0);
    h += infoRow('D', 'Disciplina', mo.discOk ? 'todas las semanas dentro del tope de juegos' : 'una semana se pasó del tope: este mes no suma', '', mo.discOk);
    h += infoRow('P', 'Mascota · ciclo de 4 semanas', `${st.cyc.length} de ${cfg.cycleNeed} ejercicios distintos con progreso`, miniBar(st.cyc.length, cfg.cycleNeed), st.cyc.length >= cfg.cycleNeed);
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
// ---------- Torre ----------
function viewTorre() {
  if (!S.startDate) return `<div class="card mute">Disponibles al ingresar.</div>`;
  if (SUB.torre === 'reg') return `<div class="torrehead"><h1>Registro</h1><small><button class="pill" data-act="sub" data-k="torre" data-v="esc">‹ Torre</button></small></div><!--fit--><div class="iscroll">${viewRegistro()}</div>`;
  const reg = `<button class="pill regpill" data-act="sub" data-k="torre" data-v="reg">Registro ›</button>`;
  if (dayIdx(todayISO()) < 0) return torreFull(1, arenaState(), reg, newRise());
  const { e } = compute(dayIdx(todayISO())), L = Math.max(1, e.state.floor), ng = e.nextGate();
  let info = '';
  if (ng !== null) {
    const req = e.cfg.gates[ng], low = CATS.filter(c => e.eff(c) < req);
    info = `<div class="gatenums">${[`Puerta ${ng}`, ...(low.length ? low.map(c => `${NAMES[c]} ${e.eff(c)}/${req}`) : ['Requisitos cumplidos'])].map(x => `<span>${x}</span>`).join('')}</div>`;
  }
  return torreFull(L, arenaState(), info + reg, e);
}
/** Barra de la torre: nivel del héroe hacia la próxima puerta. */
function xpBar(e) {
  const st = e.state, lv = e.level(), ng = e.nextGate();
  const right = st.cleared.includes(100) ? 'torre completa' : st.blocked !== null ? 'detenido en la puerta' : ng ? `nivel ${lv} / puerta ${ng}` : '';
  const pct = ng ? Math.min(100, lv / ng * 100) : 100;
  return `<div class="xpbar"><div class="xprow"><span>Nivel ${lv} · piso ${Math.max(1, st.floor)}</span><span>${right}</span></div><div class="bar gold"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
}
/** Torre: título, barra y la escena (terreno, senda con el personaje y la torre). */
function torreFull(floor, o, info, e) { const sc = torreScene(floor, o, '').replace(/<\/div>$/, `${info}</div>`); return `<div class="torrehead"><h1>Torre</h1><small>${zoneOf(floor).n} · Piso ${floor}</small></div>${xpBar(e)}<!--fit--><div class="torrefull" data-torre="1">${sc}</div>`; }

// ---------- historial (para Registro, Récords y Logros) ----------
function history() {
  const today = dayIdx(todayISO()); if (!S.startDate || today < 0) return null;
  const e = newRise(), days = [], log = [], weeks = []; let prevL = Object.fromEntries(CATS.map(c => [c, 0])), prevP = 0, kMax = 1;
  for (let i = 0; i <= today; i++) {
    const date = addDays(S.startDate, i), inp = S.days[date]?.input ?? {}, r = e.processDay(inp), xp = r.events.reduce((a, x) => a + x.amount, 0);
    days.push({ i, date, inp, xp, floor: r.floor });
    const w = weeks[Math.floor(i / 7)] ??= { min: 0, sess: 0, xp: 0, prog: 0 };
    w.min += inp.gymMin ?? (inp.gym ? 60 : 0); w.sess += isSess(inp) ? 1 : 0; w.xp += xp; w.prog += (inp.prog || []).length;
    kMax = Math.max(kMax, e.state.k);
    for (const c of CATS) { const l = e.statLevel(c); if (l > prevL[c]) log.push({ date, t: `${NAMES[c]} subió a ${l}`, ic: c }); prevL[c] = l; }
    if (e.petLevel() > prevP) { log.push({ date, t: `${PET_NAME} subió a nivel ${e.petLevel()}`, ic: 'P' }); prevP = e.petLevel(); }
    for (const g of r.unlocked) log.push({ date, t: `Cruzaste la puerta del piso ${g}`, ic: 'T' });
    for (const x of r.events) if (x.kind !== 'D') log.push({ date, t: `${x.label}: +${fmt(x.amount)} XP`, ic: x.cat });
  }
  return { e, days, log, weeks, kMax };
}
const logIcon = c => c === 'P' ? '🐾' : c === 'T' ? '🏰' : iconTag(c, 1);

function viewRegistro() {
  const h0 = history(); if (!h0) return `<div class="card mute">Disponible desde el primer día de tu torre.</div>`;
  const { e, days, log } = h0, st = e.state, today = todayISO(), cfg = e.cfg;
  const mult = ladder(st.k, Math.min(st.wk.sess, 4));
  // Racha + calendario del mes
  const ym = today.slice(0, 7), first = ym + '-01', lead = wkdayOf(first), dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).getUTCDate();
  const cells = Array.from({ length: lead }, () => '<span class="blank"></span>').join('') + Array.from({ length: dim }, (_, q) => {
    const d = `${ym}-${pad(q + 1)}`, inp = S.days[d]?.input ?? {};
    return `<span class="${isSess(inp) ? 'on' : (inp.gymMin || inp.gym) ? 'some' : ''} ${d === today ? 'today' : ''}">${q + 1}</span>`;
  }).join('');
  let h = `<div class="card slim"><div class="row"><h2>Racha de la mascota</h2><span class="pill gold">semana ${st.k} · ×${String(+mult.toFixed(2)).replace('.', ',')}</span></div><div class="mute">Sesiones esta semana: ${st.wk.sess} (mínimo ${needSessions(st.k)} para no cortarla) · mejor racha: ${h0.kMax} semanas</div><div class="cal">${'LMXJVSD'.split('').map(x => `<span class="blank">${x}</span>`).join('')}${cells}</div></div>`;
  // Libros
  const books = [], reps = [];
  for (const [d, v] of Object.entries(S.days)) { (v.input?.books ?? []).forEach((b, k) => books.push({ d, k, ...b })); (v.input?.repairs ?? []).forEach((b, k) => reps.push({ d, k, ...b })); }
  const byDate = (a, b) => b.d.localeCompare(a.d) || b.k - a.k; books.sort(byDate); reps.sort(byDate);
  const mBooks = books.filter(b => b.d.slice(0, 7) === ym).length, mReps = reps.filter(b => b.d.slice(0, 7) === ym).length;
  h += `<div class="card slim"><div class="row"><h2>Libros leídos</h2><span class="pill ${books.length ? 'ok' : ''}">${books.length}</span></div><div class="mute">Este mes: ${mBooks} · el primero del mes vale el doble</div><label>Título<input id="bt" value="${esc(bkDraft.t)}" autocomplete="off"></label><label>Autor (opcional)<input id="ba" value="${esc(bkDraft.a)}" autocomplete="off"></label><label>Lo terminé el<input id="bd" type="date" min="${S.startDate}" max="${today}" value="${bkDraft.d || today}"></label><button class="btn" style="margin-top:10px" data-act="bookadd">Agregar libro</button>`
    + books.map(b => `<div class="mrow static"><span class="mic">📖</span><span class="mtx"><b>${esc(b.t)}</b><small>${b.a ? esc(b.a) + ' · ' : ''}${pretty(b.d)}</small></span><button class="undo" data-act="bookdel" data-d="${b.d}" data-k="${b.k}">Borrar</button></div>`).join('') + `</div>`;
  h += `<div class="card slim"><div class="row"><h2>Arreglos en la casa</h2><span class="pill ${reps.length ? 'ok' : ''}">${reps.length}</span></div><div class="mute">Este mes: ${mReps} · el primero del mes vale el doble</div><label>Qué arreglaste<input id="rt" value="${esc(rpDraft.t)}" autocomplete="off"></label><label>Lo terminé el<input id="rd" type="date" min="${S.startDate}" max="${today}" value="${rpDraft.d || today}"></label><button class="btn" style="margin-top:10px" data-act="repairadd">Agregar arreglo</button>`
    + reps.map(b => `<div class="mrow static"><span class="mic">🔧</span><span class="mtx"><b>${esc(b.t)}</b><small>${pretty(b.d)}</small></span><button class="undo" data-act="repairdel" data-d="${b.d}" data-k="${b.k}">Borrar</button></div>`).join('') + `</div>`;
  // Camino de puertas
  const gs = Object.keys(cfg.gates).map(Number).sort((a, b) => a - b);
  h += `<div class="card slim"><h2>Camino de puertas</h2>` + gs.map(g => {
    const done = st.cleared.includes(g), low = CATS.filter(c => e.eff(c) < cfg.gates[g]);
    return `<div class="mrow static ${done ? 'on' : ''}"><span class="mic">🚪</span><span class="mtx"><b>Piso ${g}</b><small>${done ? 'cruzada el ' + pretty(addDays(S.startDate, st.clearedDay[g])) : `mínimo ${cfg.gates[g]} en cada estadística` + (e.level() >= g - 10 && low.length ? ' · falta: ' + low.map(c => NAMES[c]).join(', ') : '')}</small></span><span class="chk">${done ? '✓' : ''}</span></div>`;
  }).join('') + `</div>`;
  // Diario
  const recent = log.slice(-40).reverse();
  h += `<div class="card slim"><h2>Diario de la torre</h2>${recent.length ? recent.map(x => `<div class="mrow static"><span class="mic">${logIcon(x.ic)}</span><span class="mtx"><b>${esc(x.t)}</b><small>${pretty(x.date)}</small></span></div>`).join('') : '<p class="mute">Todavía no pasó nada: sumá XP y se va a ir llenando.</p>'}</div>`;
  void days; return h;
}

function entryHTML(e, date) {
  return `<div class="entry">${e.kind === 'photo' ? `<img class="thumb" data-ph="${e.id}" alt="">` : '<span class="mic">✍️</span>'}<span class="mtx"><b>${e.t} · ${mealName(e.t)}</b><small class="dsc">${esc(e.descr)}</small></span></div>`;
}
// ---------- Campamento: Héroe · Mascota · Gimnasio ----------
const PET_NAME = 'Bahamut';
const SCENES = [['pesas', 'Levantando pesas', '🏋️'], ['leyendo', 'Leyendo un libro', '📖'], ['carne', 'Asando carne', '🍖'], ['saco', 'Golpeando el saco', '🥊'], ['auriculares', 'Escuchando música', '🎧'], ['cocinando', 'Cocinando', '🍳']];
const petStage = lv => Math.min(5, Math.floor(lv / 20));
let petOpen = false, petScene = Math.floor(Math.random() * SCENES.length), rpDraft = { t: '', d: '' };
const rerollScene = () => { petScene = Math.floor(Math.random() * SCENES.length); };

/** Marca los niveles ya vistos (para el aviso ¡sube!): se hace al dibujar la solapa, no al armar su HTML. */
function lvlSeen() {
  const { e, pre } = current(); if (pre) return;
  const seen = S.seenLv || {}, up = CATS.filter(c => e.statLevel(c) > (seen[c] ?? e.statLevel(c)));
  if (up.length || !S.seenLv) { S.seenLv = Object.fromEntries(CATS.map(c => [c, e.statLevel(c)])); save(); }
  if (up.length) setTimeout(() => { if (tab === 'camp') fx(0, 'semanal'); }, 500);
}
function viewCamp() {
  if (!S.startDate) return `<h1>Campamento</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const head = `<h1>Campamento</h1>` + subtabs('camp', [['her', 'Héroe'], ['pet', 'Mascota'], ['gim', 'Gimnasio']]) + '<!--fit-->';
  const { e, pre } = current();
  return head + `<div class="iscroll">${SUB.camp === 'pet' ? campMascota(e, pre) : SUB.camp === 'gim' ? campGimnasio(e, pre) : campHeroe(e, pre)}</div>`;
}

function campHeroe(e, pre) {
  const o = arenaState(), st = e.state, seen = S.seenLv || {}, up = CATS.filter(c => e.statLevel(c) > (seen[c] ?? e.statLevel(c)));
  let h = `<div class="card statshero"><div class="stand" style="--gr:${zoneOf(o.floor).gr};--gr2:${zoneOf(o.floor).gr2}">${heroImgTag(o.floor, 4, o.done, 'idle')}<i class="floor"></i></div></div>`;
  h += `<div class="card slim"><div class="row"><h2>Nivel ${e.level()} / 100</h2><span class="pill gold">piso ${Math.max(1, st.floor)}</span></div>`;
  for (const c of CATS) {
    const p = e.statProgress(c), a = st.petAlloc[c];
    h += `<div style="margin-top:10px"><div class="row"><b>${iconTag(c)} ${NAMES[c]}${up.includes(c) ? ' <span class="pill gold">¡sube!</span>' : ''}</b><b>${p.level}${a ? ` <small class="mute">+${a}</small>` : ''} / 20</b></div><div class="bar"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div><small class="mute">${p.max ? 'máximo' : `${fmt(p.into)} / ${fmt(p.cost)} XP para el nivel ${p.level + 1}`}</small></div>`;
  }
  h += `<p class="mute">En azul claro, lo que suma tu mascota (+) para las puertas.</p></div>`;
  const ng = e.nextGate();
  if (ng !== null) {
    const req = e.cfg.gates[ng];
    h += `<div class="card slim"><div class="row"><h2>Próxima puerta · piso ${ng}</h2><span class="pill ${st.blocked === ng ? 'bad' : ''}">${st.blocked === ng ? 'detenido' : `nivel ${e.level()} / ${ng}`}</span></div>`
      + CATS.map(c => `<div class="row" style="margin-top:6px"><span>${iconTag(c)} ${NAMES[c]}</span><b>${e.eff(c)} / ${req}</b></div><div class="bar"><i style="width:${Math.min(100, e.eff(c) / req * 100)}%"></i></div>`).join('') + `</div>`;
  }
  const hi = pre ? null : history();
  if (hi) h += viewRecords(hi) + viewLogros(hi);
  return h;
}
function viewRecords(hi) {
  const { e, days, weeks, kMax } = hi, w = weeks[weeks.length - 1], best = k => Math.max(...weeks.map(x => x[k])), sum = k => weeks.reduce((a, x) => a + x[k], 0);
  const rows = [
    ['Minutos de gimnasio', 'min', w.min, best('min'), sum('min')],
    ['Sesiones', 'sesiones', w.sess, best('sess'), days.filter(d => isSess(d.inp)).length],
    ['XP ganada', 'XP', Math.round(w.xp), Math.round(best('xp')), Math.round(sum('xp'))],
    ['Progresos de peso o repeticiones', 'ejercicios', w.prog, best('prog'), sum('prog')],
    ['Racha de la mascota', 'semanas', e.state.k, kMax, null],
  ];
  let t = `<div class="card slim"><div class="rtab rhead"><span></span><span>Esta semana</span><span>Histórico</span></div>`;
  for (const [nm, u, now, bst, tot] of rows) t += `<div class="rtab"><span class="rl"><b>${nm}</b><small>${u}</small></span><span class="rv ${now > 0 && now >= bst ? 'rec' : ''}">${fmt(now)}${now > 0 && now >= bst ? ' 🏅' : ''}</span><span class="rh"><small>mejor</small> ${fmt(bst)}${tot === null ? '' : `<br><small>total</small> ${fmt(tot)}`}</span></div>`;
  return t + `</div>`;
}
function viewLogros(hi) {
  const { e, days, weeks, kMax } = hi, st = e.state;
  const sess = days.filter(d => isSess(d.inp)).length, fMax = Math.max(1, st.floor), bestWeek = Math.max(...weeks.map(x => x.sess)), prog = weeks.reduce((a, x) => a + x.prog, 0);
  const M = [
    ['🏋️', '10 sesiones', 'Gimnasio y boxeo', sess, 10], ['🏋️', '50 sesiones', 'Gimnasio y boxeo', sess, 50], ['🏋️', '100 sesiones', 'Gimnasio y boxeo', sess, 100], ['🔥', 'Semana de 5', 'Cinco sesiones en una semana', bestWeek, 5],
    ['📆', '4 semanas seguidas', 'Racha de la mascota', kMax - 1, 4], ['📆', '12 semanas', 'Racha de la mascota', kMax - 1, 12], ['🌙', '26 semanas', 'Racha de la mascota', kMax - 1, 26],
    ['📈', 'Primer progreso', 'Peso o repeticiones', prog, 1], ['📈', '25 progresos', 'Peso o repeticiones', prog, 25],
    ['📚', 'Primer libro', 'Libros leídos', st.totals.books, 1], ['📚', '6 libros', 'Libros leídos', st.totals.books, 6], ['📚', '12 libros', 'Libros leídos', st.totals.books, 12],
    ['🔧', 'Primer arreglo', 'Arreglos', st.totals.repairs, 1],
    ['⭐', 'Nivel 10', 'Nivel del héroe', e.level(), 10], ['⭐', 'Nivel 50', 'Nivel del héroe', e.level(), 50], ['⭐', 'Nivel 100', 'Nivel del héroe', e.level(), 100],
    ['🏰', 'Piso 10', 'Torre', fMax, 10], ['🏰', 'Piso 50', 'Torre', fMax, 50], ['👑', 'Torre completa', 'Piso 100', fMax, 100],
    ['🐾', `${PET_NAME} nivel 25`, 'Mascota', e.petLevel(), 25], ['🐾', `${PET_NAME} nivel 100`, 'Mascota', e.petLevel(), 100],
  ];
  const got = M.filter(m => m[3] >= m[4]).length;
  return `<div class="card slim"><div class="row"><h2>Logros</h2><span class="pill ${got ? 'gold' : ''}">${got} / ${M.length}</span></div><div class="medals">${M.map(([ic, nm, ds, n, g]) => `<div class="medal ${n >= g ? 'on' : ''}"><span class="mi">${ic}</span><b>${nm}</b><small>${ds}</small><span class="mini"><i style="width:${Math.min(100, Math.max(0, n) / g * 100)}%"></i></span><small>${Math.min(Math.max(0, n), g)} / ${g}</small></div>`).join('')}</div></div>`;
}

function campMascota(e, pre) {
  const pp = e.petProgress(), pend = e.petPending(), st = e.state, sc = SCENES[petScene % SCENES.length];
  let h = `<div class="card slim"><button class="petlvl" data-act="petopen"><div class="row"><h2>${PET_NAME} · Nivel ${pp.level}${pend > 0 ? '<i class="pdot"></i>' : ''}</h2><span class="pill gold">${pp.max ? 'máximo' : (pp.pct * 100).toFixed(1).replace('.', ',') + ' %'}</span></div><div class="bar gold"><i style="width:${(pp.pct * 100).toFixed(1)}%"></i></div></button>`;
  if (petOpen) {
    h += `<div class="pstats">${pend > 0 ? `<p class="mute">Tenés ${pend} ${pend === 1 ? 'punto' : 'puntos'} para asignar. Una vez asignado no se puede cambiar.</p>` : '<p class="mute">Sin puntos para asignar. Cada nivel de la mascota da 1 punto.</p>'}`
      + CATS.map(c => { const a = st.petAlloc[c], can = pend > 0 && a < 20 && !pre; return `<div class="prow"><span class="mic">${iconTag(c, 1)}</span><span class="nm"><b>${NAMES[c]}</b><small class="mute"> héroe ${e.statLevel(c)} + mascota ${a} = ${e.eff(c)}</small></span>${can ? `<button class="btn sm" data-act="alloc" data-c="${c}">+1</button>` : `<span class="pill">${a} / 20</span>`}</div>`; }).join('') + `</div>`;
  }
  h += `</div>`;
  const img = has('sombra_' + sc[0]) ? `<img class="px scene" alt="${sc[1]}" src="${url('sombra_' + sc[0])}">` : `<div class="scenefb"><span>${sc[2]}</span>${petTag('F', petStage(pp.level), 4)}</div>`;
  h += `<div class="card tama">${img}<span class="cap">${PET_NAME} · ${sc[1]}</span></div>`;
  h += `<p class="mute">${PET_NAME} sube de nivel con tu constancia en el gimnasio y cuando mejorás tus pesos o repeticiones. Sus puntos se suman a los tuyos en las puertas de la torre.</p>`;
  return h;
}

function campGimnasio(e, pre) {
  const st = e.state, d = pre ? 0 : dayIdx(todayISO()), wt = e.weekType(d), mult = ladder(st.k, Math.min(st.wk.sess, 4)), wkStart = pre ? null : addDays(S.startDate, d - d % 7);
  const mine = []; if (wkStart) for (let q = 0; q < 7; q++) { const dt = addDays(wkStart, q); (S.days[dt]?.input?.prog ?? []).forEach((n, k) => mine.push({ d: dt, k, n })); }
  let h = `<div class="card slim"><div class="row"><h2>Semana de ${wt}</h2><span class="pill ${wt === 'descarga' ? 'gold' : ''}">${wt === 'carga' ? 'subí el peso' : 'una repetición más'}</span></div><div class="mute">${wt === 'carga' ? 'En las semanas de carga el progreso es usar más peso que tu mejor marca (llegando al mínimo del rango de repeticiones).' : 'En la descarga el progreso es una repetición más con el mismo peso que la última descarga. Un peso nuevo queda como base.'}</div></div>`;
  h += `<div class="card slim"><div class="row"><h2>Constancia</h2><span class="pill gold">semana ${st.k} · ×${String(+mult.toFixed(2)).replace('.', ',')}</span></div><div class="mute">Sesiones esta semana: ${st.wk.sess} / ${needSessions(st.k)} mínimas · ciclo de 4 semanas: ${st.cyc.length} / ${e.cfg.cycleNeed} ejercicios distintos con progreso</div></div>`;
  h += `<div class="card slim"><div class="row"><h2>Progreso de la semana</h2><span class="pill ${mine.length ? 'ok' : ''}">${mine.length}</span></div><div class="row" style="margin-top:8px"><input id="px" type="text" placeholder="Ejercicio que mejoraste" ${pre ? 'disabled' : ''} autocomplete="off"><button class="btn sm" ${pre ? 'disabled' : 'data-act="progadd"'}>Registrar</button></div>`
    + mine.map(m => `<div class="mrow static"><span class="mic">📈</span><span class="mtx"><b>${esc(m.n)}</b><small>${pretty(m.d)}</small></span><button class="undo" data-act="progdel" data-d="${m.d}" data-k="${m.k}">Borrar</button></div>`).join('')
    + `<p class="mute">Cada ejercicio cuenta una vez por semana. Cuando cargues tu rutina, el registro de pesos y repeticiones va a anotar esto solo.</p></div>`;
  return h;
}

const SUB = { torre: 'esc', ajustes: 'gen', camp: 'her' };
const subtabs = (k, items) => `<div class="seg">${items.map(([v, l]) => `<button class="${SUB[k] === v ? 'on' : ''}" data-act="sub" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
function viewAjustes() {
  let h = `<h1>Ajustes</h1>`;
  if (S.token) h = `<button class="pill backpill" data-act="back">‹ Volver</button>` + h;
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
  h += `<div class="row"><button class="btn sm" data-act="push">Activar</button></div><div class="err" id="pushmsg">${esc(errMsg)}</div>`;
  h += `<label>Recordatorio diario (hora local)<input id="rh" type="number" min="0" max="23" value="${esc(st.reminder_hour ?? 21)}"></label><label>Aviso de alimentación del domingo (hora)<input id="fh" type="number" min="0" max="23" value="${esc(st.feed_hour ?? 18)}"></label><button class="btn sm ghost" data-act="saveset">Guardar horarios</button></div>`;
  } else h += `<div class="card"><h2>Datos</h2><div class="mute">Primer día: ${S.startDate ? pretty(S.startDate) : '—'}</div><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="export">Descargar respaldo</button><button class="btn sm ghost" data-act="logout">Cerrar sesión</button></div></div>`;
  return h;
}

const VIEWS = { hoy: viewHoy, torre: viewTorre, camp: viewCamp, ajustes: viewAjustes };
const NAV = [['hoy', '✅', 'Objetivos'], ['torre', '🏰', 'Torre'], ['camp', '⛺', 'Campamento']];
function modalHTML() { return ''; }
function render() {
  const view = VIEWS[tab] || viewHoy;
  const app = document.getElementById('app'), focus = document.activeElement?.id;
  const offline = (!navigator.onLine || pending() > 0) && S.token ? `<div class="mute" style="text-align:right">${navigator.onLine ? 'pendiente de sincronizar' : 'sin conexión'}</div>` : '';
  if (!S.token && tab !== 'ajustes') { tab = 'ajustes'; return render(); }
  document.documentElement.classList.toggle('cf', has('marco'));
  const html = offline + view(), mk = html.indexOf('<!--fit-->');
  app.innerHTML = mk < 0 ? `<div id="fit">${html}</div>` : `${html.slice(0, mk)}<div id="fit">${html.slice(mk + 10)}</div>`; renderStrip();
  document.getElementById('modal').innerHTML = modalHTML();
  document.getElementById('tabs').innerHTML = NAV.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
  const gear = document.getElementById('gear'); if (gear) gear.style.display = S.token ? '' : 'none';
  if (tab === 'camp' && S.startDate && SUB.camp === 'her') lvlSeen();
  if (tab === 'hoy' && S.token && S.startDate) loadMeals(viewDate);
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
  if (tab === 'camp' && S.startDate) return { get: () => SUB.camp, set: v => { SUB.camp = v; }, list: ['her', 'pet', 'gim'] };
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
      const cur = vs.get(), view = VIEWS[tab], probe = document.createElement('div');
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
  const floor = pre ? 1 : Math.max(1, st.floor), done = st.cleared.includes(100);
  const boss = BOSSES.includes(floor) && !done;
  const running = !phase && ((!pre && !done && st.blocked === null && !boss) || pre);
  const sm = Math.min(4, Math.floor((st.k - 1) / 4));   // meses de racha de la mascota
  return { e, st, pre, floor, hf: floor, hz: floor, boss, running, eq: 'F', pl: petStage(e.petLevel()), done, speed: 1 + 0.5 * sm, gait: gaitFor(sm) };
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
  if (tab === 'torre' && SUB.torre === 'esc') { el.innerHTML = ''; stripKey = ''; startAnim(); return; }
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
  if (el.tagName === 'A') ev.preventDefault();
  const a = el.dataset.act;
  if (a === 'tab') { tab = el.dataset.t; if (tab === 'camp') rerollScene(); render(); }
  else if (a === 'gear') { if (tab !== 'ajustes') { lastTab = tab; tab = 'ajustes'; errMsg = ''; } render(); }
  else if (a === 'back') { tab = lastTab || 'hoy'; render(); }
  else if (a === 'sub') { SUB[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'camp' && el.dataset.v === 'pet') rerollScene(); render(); }
  else if (a === 'roomtap') actDay(viewDate, i => { const r = el.dataset.r, s = new Set(roomsOf(i)); if (s.has(r)) s.delete(r); else s.add(r); delete i.room; i.rooms = [...s]; if (!i.rooms.length) delete i.rooms; });
  else if (a === 'readtog') actDay(viewDate, i => { i.read = !i.read; });
  else if (a === 'water') actDay(viewDate, i => { const v = Math.max(0, (i.waterMl || 0) + (+el.dataset.v)); if (v) i.waterMl = v; else delete i.waterMl; });
  else if (a === 'gymset') {
    const v = parseInt(document.getElementById('gm')?.value, 10);
    if (!(v >= 0 && v <= 600)) { hint('Escribí los minutos'); return; }
    actDay(viewDate, i => { i.gymMin = v; if (v >= 40) i.gym = true; else delete i.gym; });
  }
  else if (a === 'gameadd') {
    const v = parseFloat((document.getElementById('gh')?.value || '').replace(',', '.'));
    if (!(v > 0 && v <= 24)) { hint('Escribí las horas (ej.: 1,5)'); return; }
    setInput(viewDate, i => { i.gameH = Math.round(((i.gameH || 0) + v) * 100) / 100; });
    const cs = compute(dayIdx(viewDate)).e, g = gameStatus(cs.state.wk.gameH, cs.cfg.gameCapH); hint(g[1]);
  }
  else if (a === 'gamezero') setInput(viewDate, i => { delete i.gameH; });
  else if (a === 'confirm') {
    const d = viewDate; setInput(d, i => { i.closed = true; });
    const inp = S.days[d]?.input ?? {};
    if (wkdayOf(d) < 5 && mealsOf(d).length && !inp.meals) mealClose(d);
  }
  else if (a === 'reopen') setInput(viewDate, i => { i.closed = false; i.meals = false; });
  else if (a === 'petopen') { petOpen = !petOpen; render(); }
  else if (a === 'alloc') {
    if (dayIdx(todayISO()) < 0) return;
    const before = dayGain(todayISO()); setInput(todayISO(), i => { i.alloc = [...(i.alloc || []), el.dataset.c]; }); void before; fx(0, 'semanal');
  }
  else if (a === 'progadd') {
    const name = (document.getElementById('px')?.value || '').trim().slice(0, 60); if (!name) { hint('Escribí el ejercicio'); return; }
    const d = dayIdx(todayISO()), ws = addDays(S.startDate, d - d % 7), dup = Array.from({ length: 7 }, (_, q) => S.days[addDays(ws, q)]?.input?.prog ?? []).flat().some(x => x.toLowerCase() === name.toLowerCase());
    if (dup) { hint('Ese ejercicio ya cuenta esta semana'); return; }
    actDay(todayISO(), i => { i.prog = [...(i.prog || []), name]; });
  }
  else if (a === 'progdel') { const d = el.dataset.d, k = +el.dataset.k; setInput(d, i => { const p = [...(i.prog || [])]; p.splice(k, 1); i.prog = p.length ? p : undefined; }); }
  else if (a === 'pickfoto') {
    const pick = document.createElement('input'); pick.type = 'file'; pick.accept = 'image/*';
    pick.onchange = async () => { const f = pick.files[0]; if (!f) return; try { const b = await shrink(f); if (pendURL) URL.revokeObjectURL(pendURL); pendBlob = b; pendURL = URL.createObjectURL(b); txDraft = document.getElementById('txin')?.value ?? txDraft; render(); } catch { errMeal = 'No se pudo leer la foto'; render(); } };
    pick.click();
  }
  else if (a === 'txopen') { txOpen = true; errMeal = ''; render(); }
  else if (a === 'txcancel') { txOpen = false; txDraft = ''; pendBlob = null; if (pendURL) URL.revokeObjectURL(pendURL); pendURL = ''; render(); }
  else if (a === 'mealsend') { const tx = (document.getElementById('txin')?.value || '').trim(); if (!pendBlob && !tx) { hint('Agregá una foto o escribí qué comiste'); return; } mealSend(pendBlob, tx); }
  else if (a === 'bookadd') {
    const t = (document.getElementById('bt')?.value || '').trim(), au = (document.getElementById('ba')?.value || '').trim(), d = document.getElementById('bd')?.value || todayISO();
    if (!t) { hint('Escribí el título'); return; }
    if (d < S.startDate || d > todayISO()) { hint('La fecha tiene que estar dentro del reto'); return; }
    bkDraft = { t: '', a: '', d: '' };
    actDay(d, i => { i.books = [...(i.books || []), au ? { t, a: au } : { t }]; });
    hint('Libro agregado');
  }
  else if (a === 'bookdel') { const d = el.dataset.d, k = +el.dataset.k; setInput(d, i => { const b = [...(i.books || [])]; b.splice(k, 1); i.books = b.length ? b : undefined; }); }
  else if (a === 'repairadd') {
    const t = (document.getElementById('rt')?.value || '').trim(), d = document.getElementById('rd')?.value || todayISO();
    if (!t) { hint('Escribí qué arreglaste'); return; }
    if (d < S.startDate || d > todayISO()) { hint('La fecha tiene que estar dentro del reto'); return; }
    rpDraft = { t: '', d: '' };
    actDay(d, i => { i.repairs = [...(i.repairs || []), { t }]; });
    hint('Arreglo agregado');
  }
  else if (a === 'repairdel') { const d = el.dataset.d, k = +el.dataset.k; setInput(d, i => { const b = [...(i.repairs || [])]; b.splice(k, 1); i.repairs = b.length ? b : undefined; }); }
  else if (a === 'prev') { viewDate = addDays(viewDate, -1); render(); }
  else if (a === 'next') { if (viewDate < todayISO()) { viewDate = addDays(viewDate, 1); render(); } }
  else if (a === 'today') { viewDate = todayISO(); render(); }
  else if (a === 'day') { viewDate = el.dataset.d; tab = 'hoy'; render(); }
  else if (a === 'mtab') { mtab = el.dataset.v; render(); }
  else if (a === 'theme') { S.theme = el.dataset.v; save(); applyTheme(); render(); }
  else if (a === 'login') login();
  else if (a === 'sync') sync();
  else if (a === 'push') enablePush();
  else if (a === 'saveset') {
    try { const r = await api('/api/settings', 'PUT', { reminder_hour: +document.getElementById('rh').value, feed_hour: +document.getElementById('fh').value }); S.settings = r.settings; save(); document.getElementById('pushmsg').textContent = 'Horarios guardados ✔'; } catch (e) { document.getElementById('pushmsg').textContent = e.message; }
  }
  else if (a === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ startDate: S.startDate, days: S.days }, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `rise-${todayISO()}.json` }).click(); URL.revokeObjectURL(url);
  }
  else if (a === 'logout') { S.token = ''; save(); render(); detectMode(); }
});

document.addEventListener('input', ev => {
  const id = ev.target.id, v = ev.target.value;
  if (id === 'txin') txDraft = v;
  else if (id === 'bt') bkDraft.t = v; else if (id === 'ba') bkDraft.a = v; else if (id === 'bd') bkDraft.d = v;
  else if (id === 'rt') rpDraft.t = v; else if (id === 'rd') rpDraft.d = v;
});

async function detectMode() {
  if (S.token) return;
  try { mode = (await api('/api/status')).configured ? 'login' : 'setup'; } catch { mode = 'login'; errMsg = 'Sin conexión.'; }
  render();
}

// ---------- arranque ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (viewDate > todayISO()) viewDate = todayISO(); sync(); render(); if (tab === 'hoy') loadMeals(todayISO(), true); } });
setReadyHandler(() => { readyN++; render(); });
onAssets(() => { readyN++; render(); });
render(); detectMode(); sync();
preloadHero().then(() => { readyN++; render(); });

// Como una aplicación: sin zoom por pellizco ni doble toque, sin rebote de la página.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input')) e.preventDefault(); });
