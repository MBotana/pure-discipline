import { Rise, ladder, needSessions, HERO_TITLES, PET_TITLES } from '/rise.js';
import { frase } from '/phrases.js';
import { semanas, meses, destacados, sugerencias, nombreMes } from '/resumen.js';
import { ROOMS, roomTile, onAssets, has, url, iconTag } from '/assets.js';

const NAMES = { F: 'Fuerza', I: 'Inteligencia', V: 'Vitalidad', D: 'Disciplina', O: 'Orden' };
const CATS = ['F', 'I', 'V', 'D', 'O'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const KEY = 'pd1';

// ---------- estado local (con respaldo en el servidor) ----------
let S = { token: '', startDate: '', days: {}, settings: {}, device: Math.random().toString(36).slice(2, 10), lastSync: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* sin almacenamiento */ }
let ver = 0;
const save = () => { ver++; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignorar */ } };

const THEMES = [['tinta', 'Tinta', '#0b0b0b'], ['papel', 'Papel', '#e9e7e2']];
function applyTheme() {
  const t = THEMES.find(x => x[0] === S.theme) ? S.theme : 'tinta';
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

// ---------- motor (Rise v3) ----------
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
  const g = Math.round(dayGain(date) - before); if (g > 0) fx(g);
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
  syncing = false; save(); render(); autoClose(); ensurePlan();
}
/** Los días anteriores se cierran solos: se fija el puntaje final de la comida. */
const closing = new Set();
function autoClose() {
  if (!S.startDate || !S.token) return;
  const today = todayISO();
  for (const [d, v] of Object.entries(S.days)) {
    if (d >= today || v.input?.closed || !Object.keys(v.input || {}).length) continue;
    setInput(d, i => { i.closed = true; });
    if (wkdayOf(d) < 5 && !S.days[d].input.meals && !closing.has(d)) { closing.add(d); loadMeals(d, true).then(() => { if (mealsOf(d).length) mealClose(d); }); }
  }
}
const pending = () => Object.values(S.days).filter(v => v.dirty).length;

// ---------- vistas ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('es-AR');

// ---------- alimentación: comidas del día (foto o texto), evaluación y cierre ----------
S.log = S.log || {}; S.verdict = S.verdict || {};
/** Ícono propio (si existe el PNG) o el símbolo provisorio. */
const pic = (n, fb, k = 22) => has('icono_' + n) ? `<img class="ico" alt="" src="${url('icono_' + n)}" width="${k}" height="${k}">` : fb;
const hrs = x => String(+Number(x).toFixed(2)).replace('.', ',') + ' h';
const roomsOf = inp => inp.rooms ?? (inp.room ? [inp.room] : []);
const hhmm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
let txOpen = false, txDraft = '', vDraft = '', bkDraft = { t: '', a: '', d: '' };
// Fotos: se guardan en el teléfono (IndexedDB) hasta que las mandás; en el estado solo queda la hora y el texto.
let dbp = null;
const idb = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('pd-fotos', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
const fotoTx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('f', mode), q = fn(t.objectStore('f')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const fotoPut = (id, blob) => fotoTx('readwrite', s => s.put(blob, id));
const fotoGet = id => fotoTx('readonly', s => s.get(id));
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
let waterQ = null, busy = '', errMeal = '', pendBlob = null, pendURL = '';
S.mc = S.mc || {};
const mealsOf = date => S.mc[date]?.meals ?? [];
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function aiRun(label, fn) {
  if (busy) return; busy = label; errMeal = ''; render();
  try { await sync(); await fn(); save(); await sync(); }
  catch (e) { errMeal = e.message || 'No se pudo completar'; }
  busy = ''; render();
}
const mealSend = (blob, text) => { waterQ = { date: todayISO() }; return aiRun('Analizando la comida…', async () => {
  const date = todayISO(), r = await api('/api/meal', 'POST', { date, t: hhmm(), image: blob ? await blobB64(blob) : undefined, mime: 'image/jpeg', text: text || undefined });
  if (blob) await fotoPut(r.id, blob).catch(() => {});
  S.mc[date] = { meals: r.meals }; txOpen = false; txDraft = ''; pendBlob = null; if (pendURL) URL.revokeObjectURL(pendURL); pendURL = '';
}); };
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
const waterOk = inp => (inp.waterMl ?? 0) >= 1000 || !!inp.water;
const dayDoneN = (inp, d) => [isSess(inp), !!inp.read, roomsOf(inp).length > 0, waterOk(inp), (inp.weightKg ?? 0) > 0, ...(wkdayOf(d) < 5 ? [inp.foodPct !== undefined] : [])].filter(Boolean).length;
const dayNeed = d => (wkdayOf(d) < 5 ? 6 : 5);
const pc = x => Math.round(x * 100) + ' %';
const litros = ml => (ml / 1000).toFixed(2).replace(/0$/, '').replace('.', ',') + ' L';
const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, q) => `<i class="${q < n ? 'f' : ''}"></i>`).join('')}</span>`;
const miniBar = (n, max) => `<span class="mini"><i style="width:${Math.min(100, max ? n / max * 100 : 0)}%"></i></span>`;
const infoRow = (cat, label, meta, right, done) => `<div class="mrow static ${done ? 'on' : ''}"><span class="mic">${cat === 'P' ? '🐾' : iconTag(cat, 2)}</span><span class="mtx"><b>${label}</b><small>${meta}</small></span>${right}<span class="chk">${done ? '✓' : ''}</span></div>`;

/** Tarjeta de comidas del día: lista, carga (foto o texto) y el puntaje que va dando la IA. */
function foodCard(date, inp, locked) {
  if (wkdayOf(date) >= 5) return `<div class="card slim"><h2>${pic('comida', '')} Comidas</h2><p class="mute">Fin de semana: tus permitidos. La comida no puntúa.</p>${date === todayISO() ? `<div class="row" style="margin-top:8px"><span class="mute">Agua: ${litros(inp.waterMl ?? 0)} / 1 L</span><button class="btn sm" data-act="waterq" data-v="1">Bebí 250 ml</button>${(inp.waterMl ?? 0) < 1000 ? '<button class="btn sm" data-act="water1">Confirmar 1 L</button>' : ''}</div>` : ''}</div>`;
  const list = mealsOf(date), isToday = date === todayISO(), pre = dayIdx(date) < 0, off = pre || !!busy || locked || !isToday;
  const sc = inp.foodPct, cls = sc >= 0.8 ? 'ok' : sc >= 0.5 ? 'gold' : sc !== undefined ? 'bad' : '';
  let h = `<div class="card slim"><div class="row"><h2>${pic('comida', '')} Comidas</h2><span class="pill ${cls}">${sc === undefined ? 'sin puntuar' : (inp.meals ? 'final ' : 'va ') + pc(sc)}</span></div>`;
  h += list.length ? list.map(x => entryHTML(x, date)).join('') : '<p class="mute">Todavía no cargaste ninguna comida.</p>';
  h += txOpen && isToday ? `<div class="row" style="margin-top:10px"><button class="btn sm ghost" data-act="pickfoto" ${busy ? 'disabled' : ''}>📷 ${pendBlob ? 'Cambiar foto' : 'Agregar foto'}</button>${pendBlob ? `<img class="thumb" src="${pendURL}" alt="">` : '<span class="mute">sin foto</span>'}</div><textarea id="txin" rows="3" placeholder="${pendBlob ? 'Descripción breve (opcional, por las dudas)' : 'Qué comiste (ej.: 2 milanesas con ensalada y agua)'}">${esc(txDraft)}</textarea><div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="txcancel" ${busy ? 'disabled' : ''}>Cancelar</button><button class="btn sm" data-act="mealsend" ${busy ? 'disabled' : ''}>Enviar</button></div>`
    : `<button class="btn" style="margin-top:10px;width:100%" ${off ? 'disabled' : 'data-act="txopen"'}>Cargar comida</button>`;
  if (waterQ && waterQ.date === date) h += `<div class="wq"><b>¿Bebiste 250 ml de agua con esta comida?</b><div class="row"><button class="btn sm" data-act="waterq" data-v="1">Sí</button><button class="btn sm ghost" data-act="waterq" data-v="0">No</button></div></div>`;
  h += `${busy ? `<p class="mute busy">⏳ ${busy}</p>` : ''}${errMeal ? `<p class="err">${esc(errMeal)}</p>` : ''}`;
  if (inp.comp && wkdayOf(date) < 5) h += compCard(date, inp, locked);
  if (inp.verdictTx) h += `<p class="vnote">${esc(inp.verdictTx)}</p>`;
  return h + `</div>`;
}
const ACT_NOM = { bici: 'de bici', soga: 'de saltos a la soga', trote: 'de trote' };
/** Desafío para compensar un exceso de calorías: cuánto quemar, equivalencias y contador manual. */
function compCard(date, inp, locked) {
  const c = inp.comp, left = Math.max(0, c.burn - (c.done || 0)), ok = left === 0;
  const eq = c.opts.map(o => `${Math.max(1, Math.round(left / o.kpm))} min ${ACT_NOM[o.n] || o.n}`).join(' · ');
  return `<div class="wq"><div class="row"><b>${ok ? 'Exceso compensado ✓' : `Te pasaste ${c.over} kcal`}</b><span class="pill ${ok ? 'ok' : 'gold'}">${c.done || 0} / ${c.burn} kcal</span></div>`
    + `<div class="bar gold"><i style="width:${Math.min(100, (c.done || 0) / c.burn * 100)}%"></i></div>`
    + (ok ? `<small class="mute">El puntaje vuelve a ${c.sin} %.</small>`
      : `<small class="mute">Quemá ${left} kcal para volver a ${c.sin} %: ${eq}.</small>`
        + (locked ? '' : `<div class="row" style="margin-top:6px;gap:6px"><select id="ca" style="background:transparent;color:inherit;border:1px solid var(--line,#444);border-radius:8px;padding:4px 6px">${c.opts.map(o => `<option value="${o.n}">${o.n} (min)</option>`).join('')}<option value="kcal">kcal</option></select><input id="cn" type="text" inputmode="numeric" placeholder="0" autocomplete="off" style="width:64px"><button class="btn sm" data-act="compreg">Registrar</button></div>`))
    + `</div>`;
}

function viewHoy() {
  if (!S.startDate) return '';
  const today = todayISO(), idx = dayIdx(viewDate), pre = dayIdx(today) < 0;
  const title = '<h1>Objetivos</h1>';
  const dow = wkdayOf(viewDate), wkStart = addDays(viewDate, -dow);
  const strip = Array.from({ length: 7 }, (_, i) => { const d = addDays(wkStart, i), inp = S.days[d]?.input ?? {}, n = dayDoneN(inp, d), off = d > today;
    return `<button class="wd ${d === viewDate ? 'sel' : ''} ${d === today ? 'tod' : ''} ${n >= dayNeed(d) ? 'full' : n ? 'some' : ''}" ${off ? 'disabled' : `data-act="day" data-d="${d}"`}><span>${'LMXJVSD'[i]}</span><b>${+d.slice(8)}</b><i></i></button>`; }).join('');
  const nav = `<div class="wk">${strip}</div><div class="daytitle">${viewDate === today ? 'Hoy' : 'Editando'} · ${pretty(viewDate)}${viewDate !== today ? ' · <a href="#" data-act="today">volver a hoy</a>' : ''}</div>`;
  if (idx < 0 && !pre) return `${title}${nav}<div class="card mute">Este día es anterior al inicio.</div>`;
  const { e, results } = pre ? { e: newRise(), results: [{ events: [] }] } : compute(idx), st = e.state, r = results[pre ? 0 : idx], cfg = e.cfg;
  const inp = pre ? {} : S.days[viewDate]?.input ?? {}, locked = pre;
  const gained = r.events.reduce((a, x) => a + x.amount, 0), mult = ladder(st.k, Math.min(st.wk.sess, 4));
  const wk = st.wk, mo = st.mo, gH = wk.gameH, cap = cfg.gameCapH;
  let h = title + `<div class="quote">${esc(dayPhrase(viewDate, pre, idx, e, st))}</div>` + nav;
  h += `<div class="seg">${[['dia', 'Día'], ['sem', 'Semana'], ['mes', 'Mes']].map(([k, l]) => `<button class="${mtab === k ? 'on' : ''}" data-act="mtab" data-v="${k}">${l}</button>`).join('')}</div><!--fit-->`;
  if (mtab === 'dia') {
    const sessMin = inp.gymMin ?? (inp.gym ? 60 : 0), gs = gameStatus(gH, cap), ml = inp.waterMl ?? 0;
    let b = `<div class="card slim"><div class="row"><h2>Automático</h2><span class="pill ${isSess(inp) ? 'ok' : ''}">${isSess(inp) ? 'sesión ✓' : 'sin sesión'}</span></div>`
      + infoRow('F', 'Gimnasio / boxeo', `${sessMin} min · se detecta por ubicación`, '', isSess(inp))
      + `<div class="row"><b>${pic('juegos', iconTag('D', 1))} Juegos</b><span class="pill ${gs[0]}">${hrs(gH)} / ${hrs(cap)}</span></div><div class="bar gold"><i style="width:${Math.min(100, gH / cap * 100)}%"></i></div><div class="mute">${gs[1]} · hoy ${hrs(inp.gameH || 0)}</div>`
      + `<div class="row" style="margin-top:6px"><b>${pic('agua', '💧')} Agua</b><span class="row" style="gap:6px">${!locked && ml < 1000 ? '<button class="btn sm" data-act="water1">Confirmar 1 L</button>' : ''}<span class="pill ${waterOk(inp) ? 'ok' : ''}">${litros(ml)} / 1 L</span></span></div><div class="bar"><i style="width:${Math.min(100, ml / 10)}%"></i></div></div>`;
    b += foodCard(viewDate, inp, locked);
    const mine = roomsOf(inp), taken = wk.rooms.filter(x => !mine.includes(x));
    b += `<div class="card slim"><div class="row"><h2>Ambientes</h2><span class="pill ${wk.rooms.length >= cfg.cleanRoomsWeek ? 'ok' : ''}">${wk.rooms.length} / ${cfg.cleanRoomsWeek} esta semana</span></div><div class="rooms">${ROOMS.map(([id, nm]) => `<button class="room ${mine.includes(id) ? 'sel' : ''} ${taken.includes(id) ? 'taken' : ''}" ${locked ? 'disabled' : `data-act="roomtap" data-r="${id}"`}>${roomTile(id)}<b>${nm}</b>${mine.includes(id) || taken.includes(id) ? '<span class="ck">✓</span>' : ''}</button>`).join('')}</div></div>`;
    b += `<div class="card slim"><button class="mrow ${inp.read ? 'on' : ''}" ${locked ? 'disabled' : 'data-act="readtog"'}><span class="mic">${iconTag('I', 2)}</span><span class="mtx"><b>Leí hoy</b><small>10 páginas alcanzan</small></span><span class="chk">${inp.read ? '✓' : ''}</span></button></div>`;
    b += `<div class="card slim"><div class="row"><b>${iconTag('V', 2)} Peso en ayunas</b><span class="row" style="gap:6px"><input id="wgt" type="text" inputmode="decimal" placeholder="kg" autocomplete="off" value="${inp.weightKg ? String(inp.weightKg).replace('.', ',') : ''}" ${locked ? 'disabled' : ''} style="width:76px;margin:0;text-align:center"><button class="btn sm" ${locked ? 'disabled' : 'data-act="wsave"'}>${inp.weightKg ? '✓' : 'Anotar'}</button></span></div></div>`;
    // Corrección manual: solo al editar un día anterior
    if (!pre && viewDate < today) b += `<div class="card slim"><h2>Corregir este día</h2><div class="row" style="margin:8px 0 4px"><input id="gm" type="text" inputmode="numeric" placeholder="Minutos de gimnasio" autocomplete="off"><button class="btn sm" data-act="gymset">Fijar</button></div><div class="row"><input id="gh" type="text" inputmode="decimal" placeholder="Horas de videojuegos (ej.: 1,5)" autocomplete="off"><button class="btn sm" data-act="gameadd">Sumar</button></div>${(inp.gameH || 0) > 0 ? `<button class="undo" data-act="gamezero">Borrar las de ese día</button>` : ''}</div>`;
    h += b;
  } else if (mtab === 'sem') {
    const need = needSessions(st.k), avg = wk.food.length ? wk.food.reduce((a, x) => a + x, 0) / wk.food.length : 0;
    h += `<div class="card slim"><div class="row"><h2>Esta semana</h2><span class="pill ${e.weekType(pre ? 0 : idx) === 'descarga' ? 'gold' : ''}">semana de ${e.weekType(pre ? 0 : idx)}</span></div>`;
    h += infoRow('F', 'Fuerza', `${wk.min} de ${cfg.fuerzaWeekMin} min (6 h)`, miniBar(wk.min, cfg.fuerzaWeekMin), wk.min >= cfg.fuerzaWeekMin);
    h += infoRow('V', 'Vitalidad', `comida L–V: promedio ${wk.food.length ? pc(avg) : '—'} (hace falta ${pc(cfg.foodThr)})`, miniBar(avg, cfg.foodThr), wk.food.length > 0 && avg >= cfg.foodThr - 1e-9);
    h += infoRow('O', 'Orden', `${wk.rooms.length} de ${cfg.cleanRoomsWeek} ambientes distintos de ${ROOMS.length}`, pips(wk.rooms.length, cfg.cleanRoomsWeek), wk.rooms.length >= cfg.cleanRoomsWeek);
    h += infoRow('D', 'Disciplina', `juegos ${hrs(gH)} de ${hrs(cap)}`, '', gH <= cap);
    h += infoRow('P', 'La bestia · constancia', `${wk.sess} sesiones · mínimo ${need} para mantener la racha`, pips(Math.min(wk.sess, 5), 5), wk.sess >= need);
    h += infoRow('P', 'La bestia · progreso', `${wk.prog} ejercicio${wk.prog === 1 ? '' : 's'} mejorado${wk.prog === 1 ? '' : 's'} (${e.weekType(pre ? 0 : idx) === 'carga' ? 'más peso' : '1 repetición más'})`, '', wk.prog > 0);
    h += `<p class="mute">Racha: semana ${st.k} · ×${String(+mult.toFixed(2)).replace('.', ',')}. Fuerza, Vitalidad, Orden y Disciplina pagan al cerrar la semana (domingo).</p></div>`;
  } else {
    const avg = mo.food.length ? mo.food.reduce((a, x) => a + x, 0) / mo.food.length : 0;
    h += `<div class="card slim"><div class="row"><h2>Este mes</h2></div>`;
    h += infoRow('F', 'Fuerza', `${Math.round(mo.min / 60)} de ${cfg.fuerzaMonthMin / 60} h en el gimnasio`, miniBar(mo.min, cfg.fuerzaMonthMin), mo.min >= cfg.fuerzaMonthMin);
    h += infoRow('V', 'Vitalidad', `comida: promedio del mes ${mo.food.length ? pc(avg) : '—'} (hace falta ${pc(cfg.foodThr)})`, miniBar(avg, cfg.foodThr), mo.food.length > 0 && avg >= cfg.foodThr - 1e-9);
    h += infoRow('I', 'Inteligencia', `${mo.books} libro${mo.books === 1 ? '' : 's'} este mes · el primero vale el doble (se cargan en Registro)`, '', mo.books > 0);
    h += infoRow('O', 'Orden', `${mo.repairs} arreglo${mo.repairs === 1 ? '' : 's'} este mes · el primero vale el doble (Registro)`, '', mo.repairs > 0);
    h += infoRow('D', 'Disciplina', mo.discOk ? 'todas las semanas dentro del tope de juegos' : 'una semana se pasó del tope: este mes no suma', '', mo.discOk);
    h += infoRow('P', 'La bestia · ciclo de 4 semanas', `${st.cyc.length} de ${cfg.cycleNeed} ejercicios distintos con progreso`, miniBar(st.cyc.length, cfg.cycleNeed), st.cyc.length >= cfg.cycleNeed);
    h += `</div>`;
  }
  return h;
}


/** Peso: promedio móvil de 7 días, comparación semanal y sugerencia de calorías. */
function pesoSeries() {
  if (!S.startDate) return [];
  return Object.entries(S.days).filter(([d, v]) => d >= S.startDate && v.input?.weightKg > 0).map(([d, v]) => ({ d, w: +v.input.weightKg })).sort((a, b) => a.d.localeCompare(b.d));
}
function viewPeso() {
  const pts = pesoSeries(), fm = x => String(+x.toFixed(1)).replace('.', ',');
  let h = `<div class="card slim"><div class="row"><h2>${iconTag('V', 1)} Peso</h2><span class="pill">${pts.length ? fm(pts[pts.length - 1].w) + ' kg' : '—'}</span></div>`;
  if (pts.length >= 2) {
    const t0 = toUTC(pts[0].d), x = d => (toUTC(d) - t0) / 864e5, span = Math.max(6, x(pts[pts.length - 1].d));
    const avg = pts.map(p => { const win = pts.filter(q => q.d <= p.d && toUTC(p.d) - toUTC(q.d) < 7 * 864e5); return { d: p.d, w: win.reduce((a, q) => a + q.w, 0) / win.length }; });
    const all = [...pts.map(p => p.w), ...avg.map(p => p.w)], lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
    const X = d => 6 + x(d) / span * 288, Y = w => 8 + (1 - (w - lo) / (hi - lo)) * 84;
    h += `<svg viewBox="0 0 300 100" width="100%" height="96" aria-label="Peso diario y promedio de 7 días">${pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="2.2" fill="var(--mute)"/>`).join('')}<polyline fill="none" stroke="var(--hi)" stroke-width="2" points="${avg.map(p => `${X(p.d).toFixed(1)},${Y(p.w).toFixed(1)}`).join(' ')}"/></svg>`;
  }
  // promedios por semana (lunes a domingo)
  const wk = {}; for (const p of pts) { const m = addDays(p.d, -wkdayOf(p.d)); (wk[m] ||= []).push(p.w); }
  const ks = Object.keys(wk).sort(), A = ks.map(k => ({ k, n: wk[k].length, a: wk[k].reduce((x, y) => x + y, 0) / wk[k].length }));
  if (A.length) {
    const cur = A[A.length - 1], prev = A.length > 1 ? A[A.length - 2] : null;
    h += `<div class="mute">Promedio de la semana: <b>${fm(cur.a)} kg</b>${prev ? ` · ${cur.a - prev.a <= 0 ? 'bajó' : 'subió'} ${fm(Math.abs(cur.a - prev.a))} kg respecto de la anterior` : ''}</div>`;
    const full = A.filter(x => x.n >= 3), dl = full.slice(1).map((x, i) => x.a - full[i].a);
    let msg = '';
    if (dl.length >= 2) {
      const [a, b] = dl.slice(-2);
      msg = a < -1 && b < -1 ? 'Bajás más de 1 kg por semana, dos semanas seguidas: sumá unas 200 kcal por día.' : a > -0.1 && b > -0.1 ? 'Dos semanas sin bajar: recortá unas 100-150 kcal por día.' : 'Vas en un ritmo razonable.';
    }
    if (msg) h += `<div class="mute">${msg}</div>`;
  } else h += `<div class="mute">Anotá tu peso en ayunas todos los días en Objetivos. Mirá el promedio, no el número de un día.</div>`;
  return h + `</div>`;
}

/** Frase del día según cómo viene la cosa. */
function dayPhrase(date, pre, idx, e, st) {
  if (pre) return frase('inicio', date);
  const today = todayISO(), inp = S.days[date]?.input ?? {};
  if (date === today && idx >= 2 && [1, 2].every(q => !Object.keys(S.days[addDays(date, -q)]?.input ?? {}).length)) return frase('vuelta', date);
  if (inp.closed) { const n = dayDoneN(inp, date), need = dayNeed(date); return frase(n >= need ? 'bueno' : n >= Math.ceil(need / 2) ? 'parcial' : 'malo', date); }
  if (e.weekType(idx) === 'descarga' && wkdayOf(date) === 0) return frase('descarga', date);
  if (st.k >= 4 && wkdayOf(date) === 6) return frase('racha', date);
  return frase('inicio', date);
}
// ---------- Registro ----------
function viewReg() {
  if (!S.startDate) return `<h1>Registro</h1><div class="card mute">Disponible al ingresar.</div>`;
  return `<h1>Registro</h1>${subtabs('reg', [['res', 'Resumen'], ['peso', 'Peso'], ['dia', 'Diario']])}<!--fit--><div class="iscroll">${viewRegistro()}</div>`;
}

// ---------- historial (para Registro, Récords y Logros) ----------
function history() {
  const today = dayIdx(todayISO()); if (!S.startDate || today < 0) return null;
  const e = newRise(), days = [], log = [], weeks = []; let prevL = Object.fromEntries(CATS.map(c => [c, 1])), prevP = 0, prevH = 1, kMax = 1;
  for (let i = 0; i <= today; i++) {
    const date = addDays(S.startDate, i), inp = S.days[date]?.input ?? {}, r = e.processDay(inp), xp = r.events.reduce((a, x) => a + x.amount, 0);
    days.push({ i, date, inp, xp });
    const w = weeks[Math.floor(i / 7)] ??= { min: 0, sess: 0, xp: 0, prog: 0 };
    w.min += inp.gymMin ?? (inp.gym ? 60 : 0); w.sess += isSess(inp) ? 1 : 0; w.xp += xp; w.prog += (inp.prog || []).length;
    kMax = Math.max(kMax, e.state.k);
    for (const c of CATS) { const l = e.statLevel(c); if (l > prevL[c]) log.push({ date, t: `${NAMES[c]} subió a ${l}`, ic: c }); prevL[c] = l; }
    if (e.petLevel() > prevP) { log.push({ date, t: `${PET_NAME} subió a nivel ${e.petLevel()}`, ic: 'P' }); prevP = e.petLevel(); }
    if (e.level() > prevH) { log.push({ date, t: `Nivel ${e.level()}`, ic: 'H' }); prevH = e.level(); }
    if (TITLES_ON) for (const g of r.unlocked) log.push({ date, t: `Título: ${HERO_TITLES[g].name}`, ic: 'T' });
    if (TITLES_ON) for (const g of r.petUnlocked) log.push({ date, t: `${PET_NAME}: ${PET_TITLES[g].name}`, ic: 'T' });
    for (const x of r.events) if (x.kind !== 'D') log.push({ date, t: `${x.label}: +${fmt(x.amount)} XP`, ic: x.cat });
  }
  return { e, days, log, weeks, kMax };
}
const logIcon = c => c === 'P' ? '🐾' : c === 'T' ? pic('titulo', '♛', 20) : c === 'H' ? '▲' : iconTag(c, 1);

function viewRegistro() {
  const h0 = history(); if (!h0) return `<div class="card mute">Disponible desde el primer día.</div>`;
  if (SUB.reg === 'peso') return viewPeso();
  if (SUB.reg === 'dia') return viewDiario(h0);
  return viewResumen(h0);
}
const INPUTS = () => Object.fromEntries(Object.entries(S.days).map(([d, v]) => [d, v.input ?? {}]));
/** Barras: valores 0..max, con rótulos abajo y una línea de meta opcional. */
function barras(vals, labels, max, meta, fmtv) {
  const n = vals.length, w = 300 / n, bw = Math.min(22, w * 0.7), H = 78;
  return `<svg viewBox="0 0 300 ${H + 22}" width="100%" height="106" role="img">${vals.map((v, i) => {
    const hh = v === null ? 0 : Math.max(1, Math.min(1, v / max) * H), x = i * w + (w - bw) / 2;
    return `<rect x="${x.toFixed(1)}" y="${(H - hh + 10).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="var(--hi)" opacity="${i === n - 1 ? 1 : 0.6}"/><text x="${(x + bw / 2).toFixed(1)}" y="${H + 17}" font-size="8" text-anchor="middle" fill="var(--mute)">${labels[i]}</text>${v !== null && n <= 8 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${Math.max(8, H - hh + 2).toFixed(1)}" font-size="8" text-anchor="middle" fill="var(--ink)">${fmtv(v)}</text>` : ''}`;
  }).join('')}${meta ? `<line x1="0" x2="300" y1="${(H - meta / max * H + 10).toFixed(1)}" y2="${(H - meta / max * H + 10).toFixed(1)}" stroke="var(--ink)" stroke-dasharray="3 3" opacity=".5"/>` : ''}</svg>`;
}
function viewResumen(h0) {
  const today = todayISO(), inp = INPUTS(), sug = sugerencias(inp, S.startDate, today), D = destacados(inp, S.startDate, today);
  const Sm = semanas(inp, S.startDate, today).slice(-8), Mm = meses(inp, S.startDate, today), pc2 = x => Math.round(x * 100) + '%';
  const dm = iso => `${+iso.slice(8)}/${+iso.slice(5, 7)}`, hh = m => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
  let h = `<div class="card slim"><div class="row"><h2>Sugerencias</h2></div>${sug.length ? sug.map(x => `<div class="mrow static"><span class="mtx"><b>${x.tema}</b><small>${esc(x.texto)}</small></span></div>`).join('') : '<div class="mute">Aparecen cuando termina la primera semana. Cada lunes a primera hora te llegan por aviso.</div>'}</div>`;
  const tile = (t, v, s2) => `<div class="medal on"><b>${t}</b><span class="rv">${v}</span><small>${s2}</small></div>`;
  const tiles = [];
  if (D.mejorSemana) tiles.push(tile('Mejor semana', pc2(D.mejorSemana.score), 'del ' + dm(D.mejorSemana.lunes)));
  if (D.peorSemana) tiles.push(tile('Peor semana', pc2(D.peorSemana.score), 'del ' + dm(D.peorSemana.lunes)));
  if (D.mejorMes) tiles.push(tile('Mejor mes', pc2(D.mejorMes.score), nombreMes(D.mejorMes.ym)));
  if (D.peorMes) tiles.push(tile('Peor mes', pc2(D.peorMes.score), nombreMes(D.peorMes.ym)));
  tiles.push(tile('Racha de días', D.rachaDias, 'con 80% o más'));
  if (D.gymRecord) tiles.push(tile('Más gimnasio', hh(D.gymRecord.gymMin), 'semana del ' + dm(D.gymRecord.lunes)));
  h += `<div class="card slim"><div class="row"><h2>Destacados</h2></div><div class="medals">${tiles.join('')}</div></div>`;
  const done = Sm.map(s2 => s2.score), lab = Sm.map(s2 => dm(s2.lunes));
  h += `<div class="card slim"><div class="row"><h2>Cumplimiento por semana</h2></div>${barras(done, lab, 1, 0.8, pc2)}<div class="mute">Línea punteada: 80%.</div></div>`;
  h += `<div class="card slim"><div class="row"><h2>Gimnasio por semana</h2></div>${barras(Sm.map(s2 => s2.gymMin), lab, Math.max(400, ...Sm.map(s2 => s2.gymMin)), 360, m => Math.round(m / 6) / 10 + 'h')}<div class="mute">Línea punteada: meta de 6 h.</div></div>`;
  if (Mm.length) h += `<div class="card slim"><div class="row"><h2>Meses</h2></div>${Mm.slice().reverse().map(m => `<div class="mrow static"><span class="mtx"><b>${nombreMes(m.ym)}${D.mejorMes && m.ym === D.mejorMes.ym ? ' ▲' : ''}${D.peorMes && m.ym === D.peorMes.ym ? ' ▼' : ''}</b><small>${pc2(m.score)} de cumplimiento · ${hh(m.gymMin)} de gimnasio · ${m.dias} días</small></span>${miniBar(m.score, 1)}</div>`).join('')}</div>`;
  h += viewLogros(h0);
  return h;
}
function viewDiario(h0) {
  const { e, days, log } = h0, st = e.state, today = todayISO(), cfg = e.cfg;
  const mult = ladder(st.k, Math.min(st.wk.sess, 4));
  // Racha + calendario del mes
  const ym = today.slice(0, 7), first = ym + '-01', lead = wkdayOf(first), dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).getUTCDate();
  const cells = Array.from({ length: lead }, () => '<span class="blank"></span>').join('') + Array.from({ length: dim }, (_, q) => {
    const d = `${ym}-${pad(q + 1)}`, inp = S.days[d]?.input ?? {};
    return `<span class="${isSess(inp) ? 'on' : (inp.gymMin || inp.gym) ? 'some' : ''} ${d === today ? 'today' : ''}">${q + 1}</span>`;
  }).join('');
  let h = `<div class="card slim"><div class="row"><h2>Racha de la bestia</h2><span class="pill gold">semana ${st.k} · ×${String(+mult.toFixed(2)).replace('.', ',')}</span></div><div class="mute">Sesiones esta semana: ${st.wk.sess} (mínimo ${needSessions(st.k)} para no cortarla) · mejor racha: ${h0.kMax} semanas</div><div class="cal">${'LMXJVSD'.split('').map(x => `<span class="blank">${x}</span>`).join('')}${cells}</div></div>`;
  // Libros
  const books = [], reps = [];
  for (const [d, v] of Object.entries(S.days)) { (v.input?.books ?? []).forEach((b, k) => books.push({ d, k, ...b })); (v.input?.repairs ?? []).forEach((b, k) => reps.push({ d, k, ...b })); }
  const byDate = (a, b) => b.d.localeCompare(a.d) || b.k - a.k; books.sort(byDate); reps.sort(byDate);
  const mBooks = books.filter(b => b.d.slice(0, 7) === ym).length, mReps = reps.filter(b => b.d.slice(0, 7) === ym).length;
  h += `<div class="card slim"><div class="row"><h2>Libros leídos</h2><span class="pill ${books.length ? 'ok' : ''}">${books.length}</span></div><div class="mute">Este mes: ${mBooks} · el primero del mes vale el doble</div><label>Título<input id="bt" value="${esc(bkDraft.t)}" autocomplete="off"></label><label>Autor (opcional)<input id="ba" value="${esc(bkDraft.a)}" autocomplete="off"></label><label>Lo terminé el<input id="bd" type="date" min="${S.startDate}" max="${today}" value="${bkDraft.d || today}"></label><button class="btn" style="margin-top:10px" data-act="bookadd">Agregar libro</button>`
    + books.map(b => `<div class="mrow static"><span class="mic">📖</span><span class="mtx"><b>${esc(b.t)}</b><small>${b.a ? esc(b.a) + ' · ' : ''}${pretty(b.d)}</small></span><button class="undo" data-act="bookdel" data-d="${b.d}" data-k="${b.k}">Borrar</button></div>`).join('') + `</div>`;
  h += `<div class="card slim"><div class="row"><h2>Arreglos en la casa</h2><span class="pill ${reps.length ? 'ok' : ''}">${reps.length}</span></div><div class="mute">Este mes: ${mReps} · el primero del mes vale el doble</div><label>Qué arreglaste<input id="rt" value="${esc(rpDraft.t)}" autocomplete="off"></label><label>Lo terminé el<input id="rd" type="date" min="${S.startDate}" max="${today}" value="${rpDraft.d || today}"></label><button class="btn" style="margin-top:10px" data-act="repairadd">Agregar arreglo</button>`
    + reps.map(b => `<div class="mrow static"><span class="mic">🔧</span><span class="mtx"><b>${esc(b.t)}</b><small>${pretty(b.d)}</small></span><button class="undo" data-act="repairdel" data-d="${b.d}" data-k="${b.k}">Borrar</button></div>`).join('') + `</div>`;
  // Títulos: se quitaron hasta definir los nuevos (TITLES_ON)
  // Diario
  const recent = log.slice(-40).reverse();
  h += `<div class="card slim"><h2>Diario</h2>${recent.length ? recent.map(x => `<div class="mrow static"><span class="mic">${logIcon(x.ic)}</span><span class="mtx"><b>${esc(x.t)}</b><small>${pretty(x.date)}</small></span></div>`).join('') : '<p class="mute">Todavía no pasó nada: sumá XP y se va a ir llenando.</p>'}</div>`;
  void days; return h;
}

function entryHTML(e, date) {
  return `<div class="entry">${e.kind === 'photo' ? `<img class="thumb" data-ph="${e.id}" alt="">` : '<span class="mic">✍️</span>'}<span class="mtx"><b>${e.t}</b><small class="dsc">${esc(e.descr)}</small></span></div>`;
}
// ---------- Guarida: Héroe · La bestia · Gimnasio ----------
const TITLES_ON = false;   // los títulos nuevos se cargan más adelante
const PET_NAME = 'La bestia';
let rpDraft = { t: '', d: '' };

/** Marca los niveles ya vistos (para el aviso ¡sube!): se hace al dibujar la solapa, no al armar su HTML. */
function lvlSeen() {
  const { e, pre } = current(); if (pre) return;
  const seen = S.seenLv || {}, up = CATS.filter(c => e.statLevel(c) > (seen[c] ?? e.statLevel(c)));
  if (up.length || !S.seenLv) { S.seenLv = Object.fromEntries(CATS.map(c => [c, e.statLevel(c)])); save(); }
}
function viewCamp() {
  if (!S.startDate) return `<h1>Guarida</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const head = `<h1>Guarida</h1>` + subtabs('camp', [['her', 'Stats'], ['pet', 'Récords'], ['gim', 'GYM']]) + '<!--fit-->';
  const { e, pre } = current();
  return head + `<div class="iscroll">${SUB.camp === 'pet' ? campMascota(e, pre) : SUB.camp === 'gim' ? campGimnasio(e, pre) : campHeroe(e, pre)}</div>`;
}

/** Cabecera de personaje: título, nombre y nivel, y barra de progreso. El personaje va de fondo (ver stageSet). */
function figHead(side, title, sub, pct) {
  return `<div class="figtxt ${side}"><div class="ttl">${title}</div><div class="sub">${sub}</div><div class="bar gold"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div></div>`;
}
/** Personaje de fondo, fusionado con la pantalla: peleador a la derecha, bestia a la izquierda, del borde inferior al 70 % de la altura. */
function stageSet() {
  let el = document.getElementById('stage'); if (!el) { el = document.createElement('div'); el.id = 'stage'; document.body.insertBefore(el, document.getElementById('app')); }
  const on = tab === 'camp' && S.startDate && (SUB.camp === 'her' || SUB.camp === 'pet');
  const ap = document.getElementById('app'); ap.classList.toggle('stage', !!on); ap.classList.toggle('pet', !!on && SUB.camp === 'pet');
  if (!on) { el.innerHTML = ''; return; }
  const her = SUB.camp === 'her', img = her ? 'sombra_heroe' : 'sombra_bestia';
  el.innerHTML = `<div class="fig ${her ? 'r' : 'l'}"><img alt="" src="${url(img)}"></div>`;
}
function campHeroe(e, pre) {
  const st = e.state, seen = S.seenLv || {}, up = CATS.filter(c => e.statLevel(c) > (seen[c] ?? e.statLevel(c))), nt = e.nextTitle(), lv = e.level();
  let b = `<div class="card slim"><div class="row"><h2>Estadísticas</h2><span class="pill">total ${e.totalLevel()}</span></div>`;
  for (const c of CATS) {
    const p = e.statProgress(c), a = st.petAlloc[c], bad = nt && e.eff(c) < nt.min;
    b += `<div style="margin-top:10px"><div class="row"><b>${iconTag(c)} ${NAMES[c]}${up.includes(c) ? ' <span class="upar">↑</span>' : ''}${bad ? ' <span class="pill bad">baja</span>' : ''}</b><b class="lv">${p.level}/99</b></div><div class="bar"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div><small class="mute">${p.max ? 'máximo' : `${fmt(p.into)} / ${fmt(p.cost)} XP para el nivel ${p.level + 1}`}</small></div>`;
  }
  b += `</div>`;
  return figHead('l', 'El hombre', `Nivel ${lv}`, nt ? Math.min(100, lv / nt.avg * 100) : 100) + b;
}
function viewLogros(hi) {
  const { e, days, weeks, kMax } = hi, st = e.state;
  const sess = days.filter(d => isSess(d.inp)).length, bestWeek = Math.max(...weeks.map(x => x.sess)), prog = weeks.reduce((a, x) => a + x.prog, 0), nT = Object.keys(st.titles).length;
  const M = [
    ['🥊', '10 sesiones', 'Gimnasio y boxeo', sess, 10], ['🥊', '50 sesiones', 'Gimnasio y boxeo', sess, 50], ['🥊', '100 sesiones', 'Gimnasio y boxeo', sess, 100], ['🔥', 'Semana de 5', 'Cinco sesiones en una semana', bestWeek, 5],
    ['📆', '4 semanas seguidas', 'Racha de la bestia', kMax - 1, 4], ['📆', '12 semanas', 'Racha de la bestia', kMax - 1, 12], ['🌙', '26 semanas', 'Racha de la bestia', kMax - 1, 26],
    ['📈', 'Primer progreso', 'Peso o repeticiones', prog, 1], ['📈', '25 progresos', 'Peso o repeticiones', prog, 25],
    ['📚', 'Primer libro', 'Libros leídos', st.totals.books, 1], ['📚', '6 libros', 'Libros leídos', st.totals.books, 6], ['📚', '12 libros', 'Libros leídos', st.totals.books, 12],
    ['🔧', 'Primer arreglo', 'Arreglos', st.totals.repairs, 1],
    ['▲', 'Nivel 10', 'Nivel del héroe', e.level(), 10], ['▲', 'Nivel 25', 'Nivel del héroe', e.level(), 25], ['▲', 'Nivel 50', 'Nivel del héroe', e.level(), 50], ['▲', 'Nivel 75', 'Nivel del héroe', e.level(), 75], ['▲', 'Nivel 99', 'Nivel del héroe', e.level(), 99],
    ['🐾', `${PET_NAME} nivel 25`, 'Bestia', e.petLevel(), 25], ['🐾', `${PET_NAME} nivel 100`, 'Bestia', e.petLevel(), 100],
  ];
  const got = M.filter(m => m[3] >= m[4]).length;
  return `<div class="card slim"><div class="row"><h2>${pic('logro', '')} Medallas</h2><span class="pill ${got ? 'gold' : ''}">${got} / ${M.length}</span></div><div class="medals">${M.map(([ic, nm, ds, n, g]) => `<div class="medal ${n >= g ? 'on' : ''}"><span class="mi">${ic}</span><b>${nm}</b><small>${ds}</small><span class="mini"><i style="width:${Math.min(100, Math.max(0, n) / g * 100)}%"></i></span><small>${Math.min(Math.max(0, n), g)} / ${g}</small></div>`).join('')}</div></div>`;
}

function campMascota(e, pre) {
  const pp = e.petProgress();
  return figHead('r', 'La bestia', `Nivel ${pp.level}`, pp.max ? 100 : pp.pct * 100) + viewLifts();
}

/** Rutina fija. Series con repeticiones por serie (r) y peso que se anota en el modo gimnasio. */
const R = (n, r = [15, 12, 12]) => ({ n, r });
const B = [12, 10, 10];   // los cinco ejercicios de récord
const RUTINA = [
  ['Lunes', 'Boxeo', [{ n: 'Boxeo (sin pesas)' }]],
  ['Martes', 'Torso 1', [R('Press de pecho', B), R('Jalón al pecho'), R('Press de hombros', B), R('Remo sentado'), R('Peck deck'), R('Curl de bíceps en polea'), R('Tríceps en polea'), { n: 'Plancha', t: '3 × 40 s' }, { n: 'Bici libre 30-45 min' }]],
  ['Miércoles', 'Boxeo', [{ n: 'Boxeo (sin pesas)' }]],
  ['Jueves', 'Torso 2', [R('Press inclinado en máquina'), R('Remo en polea baja'), R('Elevaciones laterales'), R('Peck deck invertido'), R('Fondos asistidos o máquina de tríceps'), R('Jalón con agarre cerrado'), R('Crunch en máquina'), R('Elevación de piernas'), { n: 'Bici libre 30-45 min' }]],
  ['Viernes', 'Piernas', [R('Peso muerto convencional', B), R('Sentadilla', B), R('Prensa', B), R('Curl femoral'), R('Extensión de cuádriceps'), R('Abductores y aductores'), R('Gemelos'), R('Puente de glúteos'), { n: 'Bici suave 30 min' }]],
  ['Sábado', 'Libre', [{ n: 'Descanso o bici libre' }]],
  ['Domingo', 'Libre', [{ n: 'Descanso o bici libre' }]],
];
/** Rutina del día: la del calendario o la que elegiste para hoy (input.rut). */
const rutDia = d => RUTINA[S.days[d]?.input?.rut ?? wkdayOf(d)];
const exTxt = x => x.r ? `${x.n} · ${x.r.join('-')}` : x.t ? `${x.n} · ${x.t}` : x.n;
const COMIDAS = [['12:00', 'Milanesa grande al horno con pan integral y verduras'], ['17:00', 'Licuado: 2 bananas, 300 ml de leche proteica, 1 scoop de proteína y 1 de avena'], ['23:00', '1 taza de arroz, 3 huevos, queso rallado y zanahoria rallada']];
function rutinaCards(pre) {
  const hoy = rutDia(todayISO());
  const lista = r => `<ul class="plan">${r[2].map(x => `<li>${esc(exTxt(x))}</li>`).join('')}</ul>`;
  return `<div class="card slim"><div class="row"><h2>Hoy · ${hoy[0]}</h2><span class="pill gold">${hoy[1]}</span></div>${lista(hoy)}<details><summary>Toda la semana</summary>${RUTINA.map(r => `<div class="row" style="margin-top:10px"><b>${r[0]}</b><span class="pill">${r[1]}</span></div>${lista(r)}`).join('')}</details></div>`
    + `<div class="card slim"><details><summary>Comidas del día · ~2.000 kcal</summary><ul class="plan">${COMIDAS.map(c => `<li><b>${c[0]}</b> · ${esc(c[1])}</li>`).join('')}</ul><p class="mute">Meta: ~150 g de proteína y 2 litros de agua por día.</p></details></div>`;
}
/** Fases del bloque de 4 semanas: base, progresiva, máxima y descarga. */
const FASES = ['Carga base', 'Carga progresiva', 'Carga máxima', 'Descarga'];
const wkOf = d => Math.max(0, Math.floor(dayIdx(d) / 7));
const wkMonday = wk => addDays(S.startDate, wk * 7);
const incOf = n => RUTINA[4][2].some(x => x.n === n) ? 5 : 2.5;
const r5 = x => Math.round(x * 2) / 2;
/** Series hechas de un ejercicio en una semana (por número de serie). */
function wkLift(n, wk) {
  const out = [], s0 = wkMonday(wk);
  for (let q = 0; q < 7; q++) { const a = S.days[addDays(s0, q)]?.input?.lifts?.[n]; if (a) a.forEach((x, k) => { if (x?.ok && x.w > 0) out[k] = { w: +x.w, r: +x.r }; }); }
  return out;
}
const weekFeel = (n, wk) => { for (let q = 0; q < 7; q++) { const f = S.days[addDays(wkMonday(wk), q)]?.input?.feel?.[n]; if (f) return f; } return ''; };
/** Último peso hecho en la serie k de semanas anteriores. */
function prevW(n, k, wk) {
  for (let j = wk - 1; j >= Math.max(0, wk - 8); j--) { const a = wkLift(n, j), f = a[k] || a.filter(Boolean).pop(); if (f) return f.w; }
  return null;
}
/** Peso que corresponde a la serie k según la fase (vacío si no hay base). */
function target(n, k, wk) {
  const p = wk % 4, pw = prevW(n, k, wk);
  if (pw === null) return '';
  if (p === 0) return pw;
  if (p === 3) return r5(pw * 0.8);
  return r5(pw + (S.days[wkMonday(wk)]?.input?.plan?.[n]?.d ?? incOf(n)));
}
/** Al empezar una semana de carga progresiva o máxima, la IA ajusta el aumento (dentro de un rango) y queda fijo toda la semana. */
const planAsked = new Set();
async function ensurePlan() {
  if (!S.token || !S.startDate || dayIdx(todayISO()) < 0) return;
  const wk = wkOf(todayISO()), p = wk % 4, mon = wkMonday(wk);
  if (p < 1 || p > 2 || S.days[mon]?.input?.plan || planAsked.has(wk)) return;
  planAsked.add(wk);
  const ex = [];
  RUTINA.forEach(d => d[2].forEach(x => {
    if (!x.r) return;
    const hist = [];
    for (let j = wk - 1; j >= Math.max(0, wk - 4); j--) { const a = wkLift(x.n, j); if (a.filter(Boolean).length) hist.push({ semana: j + 1, fase: FASES[j % 4], series: x.r.map((rp, k) => a[k] ? { reps_objetivo: rp, peso: a[k].w, reps: a[k].r } : { reps_objetivo: rp, hecha: false }), sensacion: weekFeel(x.n, j) || 'sin dato' }); }
    if (hist.length) ex.push({ ejercicio: x.n, aumento_base: incOf(x.n), historial: hist });
  }));
  if (!ex.length) return;
  try { const r = await api('/api/plan', 'POST', { fase: FASES[p], ejercicios: ex }); if (r.plan) { const cur = S.days[mon]; S.days[mon] = { input: { ...(cur?.input || {}), plan: r.plan }, updated_at: Date.now(), dirty: true }; save(); clearTimeout(timer); timer = setTimeout(sync, 1500); } } catch { planAsked.delete(wk); }
}
/** Un récord por ejercicio: el máximo peso con las repeticiones que hiciste. */
const LIFTS = ['Press de pecho', 'Sentadilla', 'Peso muerto convencional', 'Prensa', 'Press de hombros'];
/** Valores de referencia para ver cómo queda la pantalla; desaparecen al empezar (lunes 9/11). */
const REF = { 'Press de pecho': 60, 'Sentadilla': 80, 'Peso muerto convencional': 90, 'Prensa': 160, 'Press de hombros': 30 };
function liftSets() {
  const out = [];
  if (S.startDate && dayIdx(todayISO()) < 0) for (const [n, w] of Object.entries(REF)) out.push({ d: S.startDate, n, w, r: 10 });
  for (const [d, v] of Object.entries(S.days)) {
    for (const [n, arr] of Object.entries(v.input?.lifts ?? {})) for (const x of arr || []) if (x && x.ok && x.w > 0) out.push({ d, n, w: +x.w, r: +x.r });
  }
  return out;
}
const liftRecords = sets => LIFTS.map(nm => ({ nm, mx: sets.filter(x => x.n === nm && x.r >= 10).sort((a, b) => b.w - a.w || b.r - a.r)[0] }));
const kg = w => `${String(+(+w).toFixed(1)).replace('.', ',')} kg`;
function viewLifts() {
  const rec = liftRecords(liftSets());
  return `<div class="card slim"><div class="row"><h2>Récords a 10 reps</h2></div>` + rec.map(r => `<div class="rtab two"><span class="rl"><b>${r.nm}</b></span><span class="rv ${r.mx ? 'rec' : ''}">${r.mx ? kg(r.mx.w) : '—'}</span></div>`).join('') + `</div>`;
}
const FASE_TXT = [
  'Elegí tus pesos y hacé las repeticiones que corresponden, dejando 2 o 3 en el tanque. Lo que anotes es tu base.',
  'Superá la semana anterior: el modo gimnasio te da el peso que corresponde a cada serie.',
  'Semana más exigente, con un peso de partida sobre lo que hiciste en la progresiva. Técnica perfecta, 0 o 1 repetición de reserva.',
  'Peso al 80% y la mitad de las series. No se anotan pesos: solo hacé lo que dice la pantalla.'
];
function campGimnasio(e, pre) {
  const ph = (pre ? 0 : wkOf(todayISO())) % 4;
  const cur = S.days[todayISO()]?.input?.rut ?? wkdayOf(todayISO());
  const pick = `<div class="card slim"><div class="row"><b>Rutina de hoy</b><select data-rut style="background:transparent;color:inherit;border:1px solid var(--line,#444);border-radius:8px;padding:4px 8px">${RUTINA.map((r, q) => `<option value="${q}" ${q === cur ? 'selected' : ''}>${r[0]} · ${r[1]}</option>`).join('')}</select></div></div>`;
  return `<button class="btn" style="width:100%;margin-bottom:12px" data-act="gopen">Abrir modo gimnasio</button>` + pick + rutinaCards(pre)
    + `<div class="card slim"><div class="row"><h2>${FASES[ph]}</h2><span class="pill ${ph === 3 ? 'gold' : ''}">semana ${ph + 1} de 4</span></div><div class="mute">${FASE_TXT[ph]}</div></div>`;
}

const SUB = { ajustes: 'gen', camp: 'her', reg: 'res' };
const subtabs = (k, items) => `<div class="seg">${items.map(([v, l]) => `<button class="${SUB[k] === v ? 'on' : ''}" data-act="sub" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
function viewAjustes() {
  let h = `<h1>Ajustes</h1>`;
  if (S.token) h = `<button class="pill backpill" data-act="back">‹ Volver</button>` + h;
  if (!S.token) {
    h += `<div class="card"><h2>${mode === 'setup' ? 'Crear tu clave' : 'Ingresar'}</h2>`;
    if (mode === null) return h + `<p class="mute">Conectando…</p></div>`;
    h += `<label>Clave (mínimo 8 caracteres)<input id="tok" type="password" autocomplete="${mode === 'setup' ? 'new-password' : 'current-password'}"></label>`;
    if (mode === 'setup') h += `<label>Primer día (un lunes)<input id="sd" type="date" value="${nextMonday(todayISO())}"></label>`;
    h += `<div class="err">${esc(errMsg)}</div><button class="btn" data-act="login">${mode === 'setup' ? 'Crear y entrar' : 'Entrar'}</button></div>`;
    return h;
  }
  h += subtabs('ajustes', [['gen', 'General'], ['notif', 'Notificaciones']]) + '<!--fit-->';
  if (SUB.ajustes === 'gen') h += `<div class="card"><h2>Apariencia</h2><div class="themes">${THEMES.map(t => `<button class="theme ${(S.theme || 'tinta') === t[0] ? 'on' : ''}" data-act="theme" data-v="${t[0]}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join('')}</div></div>`;
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

const VIEWS = { hoy: viewHoy, reg: viewReg, camp: viewCamp, ajustes: viewAjustes };
const NAV = [['hoy', '◉', 'Objetivos'], ['reg', '☰', 'Registro'], ['camp', '☾', 'Guarida']];
/** Aviso de título nuevo (héroe o mascota), una sola vez. */
let announce = null;
function titleSeen() {
  const { e, pre } = current(); if (pre || !TITLES_ON) return;
  const h = e.titleIndex(), p = e.petTitleIndex();
  if (S.seenTitle === undefined) { S.seenTitle = h; S.seenPetTitle = p; save(); return; }
  if (h > S.seenTitle) { announce = { k: 'Nuevo título', n: HERO_TITLES[h].name, f: frase('titulo', todayISO()) }; S.seenTitle = h; save(); }
  else if (p > (S.seenPetTitle ?? -1)) { announce = { k: `${PET_NAME} · nuevo título`, n: PET_TITLES[p].name, f: frase('titulo', todayISO()) }; S.seenPetTitle = p; save(); }
}
function modalHTML() {
  return announce ? `<div class="modal" data-act="closemodal"><div class="card ann"><small>${announce.k}</small><div class="annt">${announce.n}</div><p>${esc(announce.f)}</p><button class="btn" data-act="closemodal">Seguir</button></div></div>` : '';
}
function render() {
  const view = VIEWS[tab] || viewHoy;
  const app = document.getElementById('app'), focus = document.activeElement?.id;
  const offline = (!navigator.onLine || pending() > 0) && S.token ? `<div class="mute" style="text-align:right">${navigator.onLine ? 'pendiente de sincronizar' : 'sin conexión'}</div>` : '';
  if (!S.token && tab !== 'ajustes') { tab = 'ajustes'; return render(); }
  const html = offline + view(), mk = html.indexOf('<!--fit-->');
  app.innerHTML = mk < 0 ? `<div id="fit">${html}</div>` : `${html.slice(0, mk)}<div id="fit">${html.slice(mk + 10)}</div>`;
  if (S.token && S.startDate) titleSeen();
  document.getElementById('modal').innerHTML = modalHTML();
  document.getElementById('tabs').innerHTML = NAV.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
  const gear = document.getElementById('gear'); if (gear) gear.style.display = S.token ? '' : 'none';
  if (tab === 'camp' && S.startDate && SUB.camp === 'her') lvlSeen();
  if (tab === 'hoy' && S.token && S.startDate) loadMeals(viewDate);
  hydratePhotos();
  if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
  stageSet(); fit(); gymScreen();
}
/** Todo entra en la pantalla: se mide el espacio libre y se reduce el contenido lo justo. Si ni así entra, se desplaza dentro de la solapa. */
let fitting = false;
function variants() {
  if (tab === 'hoy' && S.startDate) return { get: () => mtab, set: v => { mtab = v; }, list: ['dia', 'sem', 'mes'] };
  if (tab === 'camp' && S.startDate) return { get: () => SUB.camp, set: v => { SUB.camp = v; }, list: ['her', 'pet', 'gim'] };
  if (tab === 'ajustes' && S.token) return { get: () => SUB.ajustes, set: v => { SUB.ajustes = v; }, list: ['gen', 'notif'] };
  return null;
}
function bestZoom(el, avail) {
  const h = z => { el.style.zoom = z; return el.getBoundingClientRect().height; };
  if (h(1) <= avail + 0.5) return 1;
  let lo = 0.55, hi = 1;
  if (h(lo) > avail + 0.5) return lo;
  for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (h(m) <= avail + 0.5) lo = m; else hi = m; }
  return lo;
}
function fit() {
  if (fitting) return; fitting = true;
  try {
    const app = document.getElementById('app'), f = document.getElementById('fit'), tabs = document.getElementById('tabs');
    if (!f) return;
    app.style.setProperty('--bot', Math.max(0, innerHeight - tabs.getBoundingClientRect().top) + 'px');
    const cs = getComputedStyle(app), avail = app.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) - f.getBoundingClientRect().top;
    f.style.zoom = 1;
    const geo = `left:${f.offsetLeft}px;top:${f.offsetTop}px;right:${app.clientWidth - f.offsetLeft - f.offsetWidth}px`;
    const isc = f.querySelector('.iscroll');
    let z = isc ? 1 : bestZoom(f, avail);
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
    if (isc) {
      isc.style.maxHeight = 'none';
      const off = isc.getBoundingClientRect().top - f.getBoundingClientRect().top;
      isc.style.maxHeight = Math.max(90, (avail - off) / Math.min(1, z) - 2) + 'px';
      app.style.overflowY = 'hidden'; return;
    }
    app.style.overflowY = f.getBoundingClientRect().height > avail + 1 ? 'auto' : 'hidden';
  } finally { fitting = false; }
}
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 300));
document.addEventListener('load', e => { if (e.target.tagName === 'IMG') fit(); }, true);
document.fonts?.ready.then(fit);

/** Texto de XP ganada que sube y se desvanece. */
function fx(delta) {
  if (delta > 0) { const t = document.createElement('div'); t.className = 'dmg'; t.textContent = '+' + delta; document.body.appendChild(t); setTimeout(() => t.remove(), 950); }
}

// ---------- Modo gimnasio ----------
let gymForce = false, gymRest = 0, gymTick = null, gymI = -1;
const gymArrive = () => +(S.settings?.gym_arrive || 0);
const gymActive = () => { const a = gymArrive(); return gymForce || (a > 0 && Date.now() - a < 6 * 3600e3 && S.gymHide !== a); };
const gymSets = x => (wkOf(todayISO()) % 4 === 3 && dayIdx(todayISO()) >= 0) ? x.r.slice(0, Math.ceil(x.r.length / 2)) : x.r;
function gymScreen(force) {
  let el = document.getElementById('gymmode');
  if (!gymActive() || !S.token) { el?.remove(); if (gymTick) { clearInterval(gymTick); gymTick = null; } return; }
  if (el && !force) return;                       // no se redibuja solo: así no se pierde lo que estás escribiendo
  if (!el) { el = document.createElement('div'); el.id = 'gymmode'; document.body.appendChild(el); }
  const today = todayISO(), r = rutDia(today), items = r[2], wk = wkOf(today), ph = wk % 4, des = ph === 3 && dayIdx(today) >= 0;
  const inp = S.days[today]?.input ?? {}, L = inp.lifts ?? {}, D = inp.dl ?? {}, done = (S.gymDone ||= {})[today] ||= {};
  const okEx = (x, i) => x.r ? gymSets(x).every((_, k) => des ? D[x.n]?.[k] : L[x.n]?.[k]?.ok) : !!done[i];
  const made = items.filter((x, i) => okEx(x, i)).length;
  const head = `<div class="gm-fig"><img alt="" src="/img/sombra_gym.png"></div><div class="gm-head"><span>${dayIdx(today) >= 0 ? FASES[ph] : 'Modo gimnasio'}</span><b id="gmt"></b></div><h1>${r[0]} · ${r[1]}</h1><div class="bar gold"><i style="width:${made / items.length * 100}%"></i></div>`;
  const foot = `<div class="gm-foot"><button class="btn ghost" data-act="grest">Descanso <span id="gmr">60</span> s</button><button class="undo" data-act="gexit">Salir del modo</button></div>`;
  if (gymI < 0 || gymI >= items.length) {
    const rows = items.map((x, i) => {
      const ok = okEx(x, i);
      if (!x.r) return `<button class="gm-row ${ok ? 'ok' : ''}" data-act="gcheck" data-i="${i}"><span class="gm-n">${esc(x.n)}</span><span class="gm-wt">${esc(x.t || '')}</span></button>`;
      const wt = gymSets(x).map((rp, k) => { const c = L[x.n]?.[k], on = des ? D[x.n]?.[k] : c?.ok, w = des ? target(x.n, k, wk) : c?.w; return on && w !== '' && w !== undefined ? `${rp} × ${String(w).replace('.', ',')}` : null; }).filter(Boolean);
      return `<button class="gm-row ${ok ? 'ok' : ''}" data-act="gopenex" data-i="${i}"><span class="gm-n">${esc(x.n)}</span><span class="gm-wt">${wt.length ? wt.join(' · ') + ' kg' : gymSets(x).join('-') + ' reps'}</span></button>`;
    }).join('');
    el.innerHTML = head + `<div class="gm-rows">${rows}</div>` + foot;
  } else {
    const x = items[gymI];
    const rows = gymSets(x).map((rp, k) => {
      const c = L[x.n]?.[k], t = target(x.n, k, wk), w = c?.w ?? t, on = des ? D[x.n]?.[k] : c?.ok;
      const mid = des ? `<span class="gm-tg">${t === '' ? '—' : String(t).replace('.', ',')}</span>` : `<input class="gm-w" type="text" inputmode="decimal" placeholder="kg" value="${w === '' || w === undefined ? '' : String(w).replace('.', ',')}" data-gw="${esc(x.n)}" data-k="${k}">`;
      return `<div class="gm-set ${on ? 'ok' : ''}"><span class="gm-rp"><b>${rp}</b> reps</span>${mid}<span class="mute">kg</span><button class="gm-ok" data-act="gset" data-i="${gymI}" data-k="${k}" aria-label="Serie hecha">${on ? '✓' : ''}</button></div>`;
    }).join('');
    const f = inp.feel?.[x.n];
    const feel = des ? '' : `<div class="gm-feel"><span class="mute">¿Cómo se sintió?</span>${[['f', 'Fácil'], ['j', 'Justo'], ['d', 'Duro']].map(([v, l]) => `<button class="${f === v ? 'on' : ''}" data-act="gfeel" data-v="${v}">${l}</button>`).join('')}</div>`;
    el.innerHTML = head + `<div class="gm-ex col ${okEx(x, gymI) ? 'ok' : ''}"><span class="gm-n">${esc(x.n)}</span>${rows}${feel}</div>` + `<button class="btn" data-act="glist">‹ Volver a la lista</button>` + foot;
  }
  tickGym();
  if (!gymTick) gymTick = setInterval(tickGym, 1000);
}
/** Si en la semana superaste tu mejor marca anterior de un ejercicio, cuenta como progreso (una vez por ejercicio). */
function autoProg(date, name) {
  const wkS = addDays(date, -wkdayOf(date));
  const prev = liftSets0().filter(x => x.n === name && x.d < wkS), now = liftSets0().filter(x => x.n === name && x.d >= wkS && x.d <= addDays(wkS, 6));
  if (!prev.length || !now.length) return;
  const pw = Math.max(...prev.map(x => x.w)), best = now.sort((a, b) => b.w - a.w || b.r - a.r)[0];
  if (best.w > pw) setInput(date, i => { i.prog = [...new Set([...(i.prog || []), name])]; });
}
const liftSets0 = () => { const out = []; for (const [d, v] of Object.entries(S.days)) for (const [n, arr] of Object.entries(v.input?.lifts ?? {})) for (const x of arr || []) if (x?.ok && x.w > 0) out.push({ d, n, w: +x.w, r: +x.r }); return out; };
function tickGym() {
  const t = document.getElementById('gmt'), a = gymArrive();
  if (t) { const m = a ? Math.max(0, Math.floor((Date.now() - a) / 60000)) : 0; t.textContent = !a ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }
  const r = document.getElementById('gmr');
  if (r) { if (gymRest > 0 && Date.now() >= gymRest) { gymRest = 0; navigator.vibrate?.(300); } r.textContent = gymRest ? Math.max(0, Math.ceil((gymRest - Date.now()) / 1000)) : 60; r.parentElement.classList.toggle('on', !!gymRest); }
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
  if (a === 'tab') { tab = el.dataset.t; render(); }
  else if (a === 'gset') {
    const r = rutDia(todayISO()), x = r[2][+el.dataset.i], k = +el.dataset.k;
    if (wkOf(todayISO()) % 4 === 3 && dayIdx(todayISO()) >= 0) {
      const was = S.days[todayISO()]?.input?.dl?.[x.n]?.[k];
      setInput(todayISO(), i => { const d = { ...(i.dl || {}) }, a2 = [...(d[x.n] || [])]; a2[k] = !was; d[x.n] = a2; i.dl = d; });
      if (!was) gymRest = Date.now() + 60000;
      gymScreen(true); return;
    }
    const inp = document.querySelector(`#gymmode input[data-gw="${CSS.escape(x.n)}"][data-k="${k}"]`);
    const w = parseFloat((inp?.value || '').replace(',', '.')) || 0, cur = S.days[todayISO()]?.input?.lifts?.[x.n]?.[k];
    setInput(todayISO(), i => { const a2 = ((i.lifts ||= {})[x.n] ||= []); a2[k] = cur?.ok ? { ...cur, ok: false } : { w, r: x.r[k], ok: true }; for (let q = 0; q < x.r.length; q++) a2[q] ||= null; });
    if (!cur?.ok) { gymRest = Date.now() + 60000; autoProg(todayISO(), x.n); }
    gymScreen(true);
  }
  else if (a === 'gopenex') { gymI = +el.dataset.i; gymScreen(true); }
  else if (a === 'glist') { gymI = -1; gymScreen(true); }
  else if (a === 'gfeel') { const r = rutDia(todayISO()), x = r[2][gymI], v = el.dataset.v; setInput(todayISO(), i => { const f = { ...(i.feel || {}) }; f[x.n] = f[x.n] === v ? undefined : v; i.feel = f; }); gymScreen(true); }
  else if (a === 'gcheck') { const g = (S.gymDone ||= {})[todayISO()] ||= {}; g[+el.dataset.i] = !g[+el.dataset.i]; save(); gymScreen(true); }
  else if (a === 'grest') { gymRest = gymRest ? 0 : Date.now() + 60000; tickGym(); }
  else if (a === 'gexit') { S.gymHide = gymArrive(); gymForce = false; save(); gymScreen(true); }
  else if (a === 'gopen') { gymForce = true; gymI = -1; gymScreen(true); }
  else if (a === 'closemodal') { announce = null; render(); }
  else if (a === 'gear') { if (tab !== 'ajustes') { lastTab = tab; tab = 'ajustes'; errMsg = ''; } render(); }
  else if (a === 'back') { tab = lastTab || 'hoy'; render(); }
  else if (a === 'sub') { SUB[el.dataset.k] = el.dataset.v; render(); }
  else if (a === 'roomtap') actDay(viewDate, i => { const r = el.dataset.r, s = new Set(roomsOf(i)); if (s.has(r)) s.delete(r); else s.add(r); delete i.room; i.rooms = [...s]; if (!i.rooms.length) delete i.rooms; });
  else if (a === 'wsave') { const w = parseFloat((document.getElementById('wgt')?.value || '').replace(',', '.')); if (w >= 30 && w <= 300) { actDay(viewDate, i => { i.weightKg = Math.round(w * 10) / 10; }); } else hint('Escribí tu peso en kg'); }
  else if (a === 'readtog') actDay(viewDate, i => { i.read = !i.read; });
  else if (a === 'waterq') { const d = waterQ?.date || todayISO(); waterQ = null; if (el.dataset.v === '1') actDay(d, i => { i.waterMl = (i.waterMl || 0) + 250; }); else render(); }
  else if (a === 'water') actDay(viewDate, i => { const v = Math.max(0, (i.waterMl || 0) + (+el.dataset.v)); if (v) i.waterMl = v; else delete i.waterMl; });
  else if (a === 'compreg') {
    const n = parseInt(document.getElementById('cn')?.value, 10), act = document.getElementById('ca')?.value; if (!(n > 0)) return;
    actDay(viewDate, i => { const c = i.comp; if (!c) return; const o = c.opts.find(x => x.n === act); c.done = (c.done || 0) + Math.round(o ? n * o.kpm : n); if (c.done >= c.burn) i.foodPct = Math.max(i.foodPct ?? 0, c.sin / 100); });
  }
  else if (a === 'water1') actDay(viewDate, i => { i.waterMl = Math.max(i.waterMl || 0, 1000); });
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
    else if (a === 'alloc') {
    if (dayIdx(todayISO()) < 0) return;
    const before = dayGain(todayISO()); setInput(todayISO(), i => { i.alloc = [...(i.alloc || []), el.dataset.c]; }); void before; fx(0);
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
document.addEventListener('change', e => { const el = e.target; if (el.dataset?.rut !== undefined) { const v = +el.value; setInput(todayISO(), i => { if (v === wkdayOf(todayISO())) delete i.rut; else i.rut = v; }); gymI = -1; render(); return; } if (!el.dataset?.gw) return; const k = +el.dataset.k, n = el.dataset.gw, w = parseFloat(el.value.replace(',', '.')) || 0, rp = rutDia(todayISO())[2].find(x => x.n === n)?.r[k]; setInput(todayISO(), i => { const a = ((i.lifts ||= {})[n] ||= []); a[k] = { ...(a[k] || {}), w, r: rp }; for (let q = 0; q < k; q++) a[q] ||= null; }); });
setInterval(() => { if (document.visibilityState === 'visible' && S.token && navigator.onLine) sync(); }, 45000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (viewDate > todayISO()) viewDate = todayISO(); sync(); render(); if (tab === 'hoy') loadMeals(todayISO(), true); } });
onAssets(() => render());
render(); detectMode(); sync();

// Como una aplicación: sin zoom por pellizco ni doble toque, sin rebote de la página.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input')) e.preventDefault(); });
