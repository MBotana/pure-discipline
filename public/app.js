import { Engine, levelOf, cumXp, buildGates } from '/engine.js';
import { gateSVG, flagSVG, zoneOf, ZONES } from '/art.js';
import { ROOMS, roomTile, onAssets, exists, has, url, heroSrc, heroSprite, heroBase, petTag, petSprite, bossSprite, bgName, bgLayer, towerLayer, runFrames, petRunFrames, heroImgTag, scrollLayers, iconTag, PETS, BOSSES, gaitFor, GAIT_MS } from '/assets.js';
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

const THEMES = [['cielo', 'Cielo', '#9fd8f7'], ['noche', 'Noche', '#0b1830'], ['plata', 'Plata', '#c3ccd8'], ['bronce', 'Bronce', '#120c0b']];
function applyTheme() {
  const t = THEMES.find(x => x[0] === S.theme) ? S.theme : 'cielo';
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
  const dow = (new Date(toUTC(viewDate)).getUTCDay() + 6) % 7, wkStart = addDays(viewDate, -dow), DK = ['gym', 'read', 'aero', 'clean', 'food'];
  const strip = Array.from({ length: 7 }, (_, i) => { const d = addDays(wkStart, i), inp = S.days[d]?.input ?? {}, n = DK.filter(k => inp[k]).length, off = d > today;
    return `<button class="wd ${d === viewDate ? 'sel' : ''} ${d === today ? 'tod' : ''} ${n === 5 ? 'full' : n ? 'some' : ''}" ${off ? 'disabled' : `data-act="day" data-d="${d}"`}><span>${'LMXJVSD'[i]}</span><b>${+d.slice(8)}</b><i></i></button>`; }).join('');
  const nav = `<div class="wk">${strip}</div><div class="daytitle">${viewDate === today ? 'Hoy' : 'Editando'} · ${pretty(viewDate)}${viewDate !== today ? ' · <a href="#" data-act="today">volver a hoy</a>' : ''}</div>`;
  const pre = dayIdx(today) < 0;
  if (idx < 0 && !pre) return `${nav}<div class="card mute">Este día es anterior al inicio de tu torre.</div>`;
  const cur = pre ? current() : null, { e, results } = pre ? { e: cur.e, results: [{ floor: 1, events: [] }] } : compute(idx), st = e.state, r = results[pre ? 0 : idx], cfg = e.cfg;
  const dd = pre ? 0 : idx % 7, inp = pre ? {} : S.days[viewDate]?.input ?? {};
  const on = k => !!inp[k];
  const w = c => st.wu[c], m = c => st.mu[c];
  const gained = r.events.reduce((a, x) => a + x.paid, 0), lost = r.events.filter(x => x.outcome !== 'paid').reduce((a, x) => a + x.amount - x.paid, 0);
  const tick = k => !!inp[k];
  const ic = c => c === 'P' ? petTag(st.equipped, e.petLevel(st.equipped), 1) : iconTag(c, 2);
  const doneRows = [];
  const row = (k, cat, label, meta) => { if (tick(k)) { doneRows.push([k, cat, label]); return ''; } return `<button class="mrow" ${pre ? 'disabled' : `data-act="t" data-k="${k}"`}><span class="mic">${ic(cat)}</span><span class="mtx"><b>${label}</b><small>${meta}</small></span>${pre ? '' : '<span class="dbl">2×</span>'}</button>`; };
  const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, q) => `<i class="${q < n ? 'f' : ''}"></i>`).join('')}</span>`;
  const info = (cat, label, meta, right, done) => `<div class="mrow static ${done ? 'on' : ''}"><span class="mic">${ic(cat)}</span><span class="mtx"><b>${label}</b><small>${meta}</small></span>${right}<span class="chk">${done ? '✓' : ''}</span></div>`;
  const bar = (n, max) => `<span class="mini"><i style="width:${Math.min(100, n / max * 100)}%"></i></span>`;
  const sections = [['dia', 'Diarias'], ['sem', 'Semanales'], ['mes', 'Mensuales']];
  let h = nav;
  if (pre) h += `<div class="banner">Tu torre empieza el <b>${pretty(S.startDate)}</b> (faltan ${-dayIdx(today)} días). Así se verán tus misiones; todavía no se pueden registrar.</div>`;
  if (st.blocked !== null && viewDate === today) h += `<div class="banner">🔒 <b>Bloqueado en el piso ${st.blocked}.</b> No sumás XP hasta cumplir la puerta (mirá la pestaña Torre).</div>`;
  h += `<div class="sum"><span><small>XP del día</small><b>+${fmt(gained)}</b></span><span><small>Piso</small><b>${r.floor}</b></span><span><small>Racha</small><b>${st.s} ${st.s === 1 ? 'mes' : 'meses'}</b></span><span><small>Multiplicador</small><b>×${st.s >= 1 ? st.s + 1 : 1}</b></span></div>${lost > 0 ? `<div class="mute" style="margin:-6px 0 10px">No cobrada por bloqueo: ${fmt(lost)}</div>` : ''}`;
  h += `<div class="seg">${sections.map(([k, l]) => `<button class="${mtab === k ? 'on' : ''}" data-act="mtab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const wi = pre ? { n: 1, of: 4 } : e.weekInfo(idx), games = st.gameWk, today0 = inp.gaming || 0;
  const petIc = c => petTag(c, e.petLevel(c), 1);
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
    h += `<p class="mute">Cada semanal cumplida da +1 punto de estadística (Disciplina se confirma en el cierre del domingo; la alimentación le da XP a tu mascota). Semanas buenas seguidas: ${st.wstreak}.</p></div>`;
    h += `<div class="card slim"><h2>Cierre de semana</h2>`;
    if (dd === 6 && !pre) h += `<button class="btn" data-act="closeweek">${inp.dform ? 'Revisar el cierre' : 'Completar el cierre'}</button><p class="mute">${inp.dform ? `Disciplina: ${inp.dweek ? 'cumplida' : 'no cumplida'} · celular > 5 h: ${inp.phone ? 'sí' : 'no'}` : 'Respondé tu objetivo de Disciplina y el promedio de celular.'}</p>`;
    else h += `<p class="mute">El domingo se abre el formulario con tu objetivo de Disciplina de la semana y la pregunta del celular. Videojuegos esta semana: ${games} (máximo 3).</p>`;
    h += `</div>`;
  } else {
    const rows = [['F', 'Fuerza', `${cfg.gymM} sesiones`, cfg.gymM], ['V', 'Vitalidad', `${cfg.aeroM} aeróbicos`, cfg.aeroM]];
    const dn = st.mdone.length;
    h += `<div class="card slim"><div class="row"><h2>Este mes</h2><span class="pill ${dn === 5 ? 'ok' : ''}">${dn} / 5</span></div>`;
    h += rows.map(([c, nm, goal, max]) => info(c, nm, `${m(c)} de ${goal}`, bar(m(c), max), st.mdone.includes(c))).join('');
    h += info('I', 'Inteligencia', 'Libro terminado', '', st.mdone.includes('I')) + info('O', 'Orden', 'Arreglo en la casa', '', st.mdone.includes('O'));
    h += info('D', 'Disciplina', `${m('D')} de ${wi.of} objetivos semanales`, bar(m('D'), wi.of), st.mdone.includes('D'));
    h += `<p class="mute">Fallar 2 o más reinicia la racha; cada uno fallado resta 1 punto de estadística.</p></div>`;
    h += `<div class="card slim"><h2>Registrar hoy</h2>${row('book', 'I', 'Libro terminado', 'se cumple el día que lo marcás · el XP se reparte en 6 días')}${row('repair', 'O', 'Arreglo en la casa', 'se cumple el día que lo marcás · el XP se reparte en 6 días')}<p class="mute">También aparecen en el cierre del último domingo del mes.</p></div>`;
  }
  if (doneRows.length) {
    h += `<div class="card slim"><button class="donebtn" data-act="showdone"><span>Completadas (${doneRows.length})</span><span>${showDone ? '▲' : '▼'}</span></button>`;
    if (showDone) h += doneRows.map(([k, c, l]) => `<div class="mrow static on"><span class="mic">${ic(c)}</span><span class="mtx"><b>${l}</b></span><button class="undo" data-act="undo" data-k="${k}">Deshacer</button></div>`).join('');
    h += `</div>`;
  }
  return h;
}

let mapAct = 0, mapSel = 0;
const z0 = f => { const z = zoneOf(f), act = Math.min(10, Math.ceil(f / 10)); return `${z.n} · ${act}-${((f - 1) % 10) + 1}`; };
function viewTorre() {
  if (!S.startDate || dayIdx(todayISO()) < 0) return `<h1>Torre</h1><div class="card mute">Empieza el ${S.startDate ? pretty(S.startDate) : '—'}.</div>`;
  const { e } = compute(dayIdx(todayISO())), st = e.state, cfg = e.cfg, L = e.floor();
  const into = st.xp - cumXp(L, cfg.A, cfg.r), cost = cfg.A * Math.pow(cfg.r, L - 1);
  const gates = buildGates(cfg), nums = Object.keys(gates).map(Number).sort((a, b) => a - b);
  const curAct = Math.min(10, Math.ceil(L / 10)), act = mapAct || curAct, z = zoneOf(act * 10 - 5), sel = mapSel || L;
  const reqLines = (g) => { const d = gates[g], parts = [];
    if (d.stats) parts.push(d.stats.map(c => `${NAMES[c]} ${st.stat[c]}/${d.req}`).join(' + '));
    if (d.streak !== undefined) parts.push(`racha de ${d.streak} meses (tenés ${st.s})`);
    return parts.join('<br>'); };
  const o = arenaState(), nextG = nums.find(g => g >= L && !st.cleared.includes(g));
  let h = `<h1>Torre</h1><div class="strip scene"><div class="top"><span>${z0(L)}</span><span>Piso ${L}</span></div>${arenaHTML(o, true)}</div>`;
  h += `<div class="card"><div class="row"><div><div class="mute">Piso actual</div><div class="big">${L}</div></div><div style="text-align:right"><div class="mute">XP total</div><b>${fmt(st.xp)}</b></div></div>`;
  h += st.tower !== null ? `<div class="banner ok">🏆 ¡Torre completada!</div>` : `<div class="bar"><i style="width:${Math.min(100, into / cost * 100)}%"></i></div><div class="mute">${fmt(into)} / ${fmt(cost)} XP para el piso ${L + 1}</div>`;
  h += `<div class="mute">Racha mensual activa: <b>${st.s}</b> ${st.s === 1 ? 'mes' : 'meses'}</div></div>`;
  if (nextG && st.tower === null) h += `<div class="card slim"><h2>Próxima puerta · piso ${nextG}${BOSSES.includes(nextG) ? ' · jefe' : ''}</h2><div class="row"><div>${reqLines(nextG)}</div><span class="pill ${st.blocked === nextG ? 'bad' : ''}">${st.blocked === nextG ? 'bloqueada' : 'pendiente'}</span></div></div>`;
  h += `<div class="acts">${Array.from({ length: 10 }, (_, i) => i + 1).map(a => `<button class="${a === act ? 'on' : ''} ${a > curAct ? 'lock' : ''}" data-act="map" data-a="${a}">${a}</button>`).join('')}</div>`;
  const pts = Array.from({ length: 10 }, (_, i) => [50 + 27 * Math.sin(i * 1.05 + (act % 2) * 1.6), 88 - i * 8, (act - 1) * 10 + i + 1]);
  h += `<div class="map ${act > curAct ? 'dim' : ''}" style="--sky1:${z.sky[0]};--sky2:${z.sky[1]};--gr:${z.gr}"><div class="ribbon">Acto ${act} · ${z.n}</div>`;
  h += `<svg class="path" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="rgba(50,30,15,.75)" stroke-width="4" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/></svg>`;
  pts.forEach(([x, y, f], i) => {
    const gate = !!gates[f], cleared = st.cleared.includes(f), cur = f === L && st.tower === null;
    h += `<button class="node ${L >= f ? '' : 'future'} ${cur ? 'cur' : ''} ${sel === f ? 'sel' : ''}" style="left:${x}%;top:${y}%" data-act="node" data-f="${f}" aria-label="Piso ${f}">${gate ? gateImg(cleared, 1) : '<span class="dot"></span>'}${cur ? flagImg(2) : ''}<b>[${act}-${i + 1}]</b></button>`;
  });
  h += `</div>`;
  const gd = gates[sel], selAct = Math.ceil(sel / 10), selStage = ((sel - 1) % 10) + 1;
  h += `<div class="card" style="margin-top:12px"><h2>Piso ${sel} · ${selAct}-${selStage}</h2>`;
  h += gd ? `<div class="row"><div>${reqLines(sel)}</div><span class="pill ${st.cleared.includes(sel) ? 'ok' : st.blocked === sel ? 'bad' : ''}">${st.cleared.includes(sel) ? 'abierta' : st.blocked === sel ? 'bloqueada' : 'pendiente'}</span></div>` : `<div class="mute">Piso sin puerta: solo suma XP.</div>`;
  h += `</div><div class="card"><h2>Todas las puertas</h2>`;
  for (const g of nums) h += `<div class="gate"><div style="width:44px;font-weight:800">${g}</div><div style="flex:1">${reqLines(g)}</div><span class="pill ${st.cleared.includes(g) ? 'ok' : st.blocked === g ? 'bad' : ''}">${st.cleared.includes(g) ? 'abierta' : st.blocked === g ? 'bloqueada' : 'pendiente'}</span></div>`;
  return h + `</div>`;
}

function viewStats() {
  if (!S.startDate) return `<h1>Estadísticas</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const { e, st } = current(), cap = e.statCap();
  const o = arenaState(), seen = S.seenStat || {}, up = CATS.filter(c => st.stat[c] > (seen[c] ?? st.stat[c]));
  if (up.length || !S.seenStat) { S.seenStat = { ...st.stat }; save(); }
  if (up.length) setTimeout(() => { if (tab === 'stats') fx(0, 'semanal'); }, 500);
  let h = `<h1>Estadísticas</h1><div class="card statshero">${heroImgTag(o.floor, 4, o.done, 'idle')}${petTag(o.eq, o.pl, 3, 'pet idle')}</div><div class="card">` + (Number.isFinite(cap) ? `<div class="mute">Tope actual: ${cap} (hasta superar la próxima puerta de estadísticas)</div>` : '');
  for (const c of CATS) h += `<div style="margin-top:12px"><div class="row"><b>${iconTag(c)} ${NAMES[c]}${up.includes(c) ? ' <span class="pill gold">¡sube!</span>' : ''}</b><b>${st.stat[c]}${Number.isFinite(cap) ? ' / ' + cap : ''}</b></div><div class="bar"><i style="width:${Number.isFinite(cap) ? Math.min(100, st.stat[c] / cap * 100) : 100}%"></i></div></div>`;
  return h + `<p class="mute">+1 por cada semanal cumplida, −1 por cada objetivo mensual fallado.</p></div>`;
}

function viewMascotas() {
  if (!S.startDate) return `<h1>Mascotas</h1><div class="card mute">Disponibles al ingresar.</div>`;
  const { e, st } = current(), lv = e.petLevels();
  const cum = [0]; for (const x of e.cfg.petCosts) cum.push(cum[cum.length - 1] + x);
  let h = `<h1>Mascotas</h1>`;
  if (st.feedStreak >= 1) h += `<div class="banner">Semanas sin alimentar seguidas: <b>${st.feedStreak}</b>. ${st.feedStreak >= 2 ? 'La mascota equipada pierde 1 nivel por cada semana fallada.' : 'Con la próxima semana fallada baja 1 nivel.'}</div>`;
  for (const c of CATS) {
    const l = lv[c], max = l >= 5, eq = st.equipped === c;
    h += `<div class="card"><div class="row"><span style="display:flex;align-items:center;gap:8px">${petTag(c, l, 2)}<b>${PETS[c].name} <small class="mute">(${NAMES[c]})</small></b></span>${eq ? '<span class="pill gold">equipada</span>' : `<button class="btn sm ghost" data-act="equip" data-c="${c}">Equipar</button>`}</div><div class="row mute"><span>Nivel ${l} / 5</span>${max ? '<span>máximo</span>' : `<span>${st.px[c] - cum[l]} / ${e.cfg.petCosts[l]} XP</span>`}</div><div class="bar gold"><i style="width:${max ? 100 : (st.px[c] - cum[l]) / e.cfg.petCosts[l] * 100}%"></i></div></div>`;
  }
  return h + `<p class="mute">Solo la mascota equipada aporta puntos en una puerta de estadísticas y solo a su propia estadística. Cada semana de alimentación perfecta le da 10 XP.</p>`;
}

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
  h += `<div class="card"><h2>Apariencia</h2><div class="themes">${THEMES.map(t => `<button class="theme ${(S.theme || 'cielo') === t[0] ? 'on' : ''}" data-act="theme" data-v="${t[0]}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join('')}</div></div>`;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  h += `<div class="card"><h2>Sincronización</h2><div class="row"><span>${pending() ? pending() + ' día(s) pendientes' : 'Todo sincronizado'}</span><button class="btn sm" data-act="sync" ${syncing ? 'disabled' : ''}>${syncing ? 'Sincronizando…' : 'Sincronizar'}</button></div><div class="mute">${S.lastSync ? 'Última vez: ' + new Date(S.lastSync).toLocaleString('es-AR') : 'Nunca'}</div><div class="err">${esc(syncMsg)}</div></div>`;
  const st = S.settings || {};
  h += `<div class="card"><h2>Notificaciones</h2>`;
  if (!standalone) h += `<div class="banner">En el iPhone: abrí esta página en Safari, tocá Compartir → <b>Agregar a pantalla de inicio</b> y abrila desde ahí. Sin eso iOS no permite notificaciones.</div>`;
  h += `<div class="row"><button class="btn sm" data-act="push">Activar</button><button class="btn sm ghost" data-act="pushtest">Probar</button></div><div class="err" id="pushmsg">${esc(errMsg)}</div>`;
  h += `<label>Recordatorio diario (hora local)<input id="rh" type="number" min="0" max="23" value="${esc(st.reminder_hour ?? 21)}"></label><label>Aviso de alimentación del domingo (hora)<input id="fh" type="number" min="0" max="23" value="${esc(st.feed_hour ?? 18)}"></label><button class="btn sm ghost" data-act="saveset">Guardar horarios</button></div>`;
  h += `<div class="card"><h2>Datos</h2><div class="mute">Primer día: ${S.startDate ? pretty(S.startDate) : '—'}</div><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="export">Descargar respaldo</button><button class="btn sm ghost" data-act="logout">Cerrar sesión</button></div></div>`;
  return h;
}

const TABS = [['hoy', '✅', 'Misiones', viewHoy], ['torre', '🏰', 'Torre', viewTorre], ['stats', '📊', 'Stats', viewStats], ['mascotas', '🐾', 'Mascotas', viewMascotas], ['ajustes', '⚙️', 'Ajustes', viewAjustes]];
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
  const app = document.getElementById('app'), focus = document.activeElement?.id, y = window.scrollY;
  const offline = (!navigator.onLine || pending() > 0) && S.token ? `<div class="mute" style="text-align:right">${navigator.onLine ? 'pendiente de sincronizar' : 'sin conexión'}</div>` : '';
  if (!S.token && tab !== 'ajustes') { tab = 'ajustes'; return render(); }
  document.documentElement.classList.toggle('cf', has('marco'));
  if (tab === 'hoy' && S.startDate && !modal && viewDate === todayISO() && dayIdx(viewDate) >= 0 && dayIdx(viewDate) % 7 === 6 && askedFor !== viewDate && !(S.days[viewDate]?.input?.dform)) {
    askedFor = viewDate; modal = { kind: 'week', dw: false, ph: false, date: viewDate };
  }
  app.innerHTML = offline + view(); renderStrip();
  document.getElementById('modal').innerHTML = modalHTML();
  document.getElementById('tabs').innerHTML = TABS.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
  if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
  window.scrollTo(0, y);
}

// ---------- franja de batalla ----------
// Lienzo lógico de 240×64: todo se posiciona en unidades de ese lienzo (cqw) para que escale parejo en cualquier pantalla.
let previewGait = '', dockOpen = false, runTimer = 0, stripKey = '', readyN = 0, opening = false, phase = '';
const U = v => `calc(${v} * 100cqw / 240)`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function arenaState() {
  const { e, st, pre } = current();
  const floor = pre ? 1 : e.floor();
  const boss = BOSSES.includes(floor) && !st.cleared.includes(floor) && st.tower === null;
  const running = !pre && !phase && st.tower === null && st.blocked === null && !boss;
  return { e, st, pre, floor, boss, running, eq: st.equipped, pl: e.petLevel(st.equipped), done: st.tower !== null, speed: previewGait ? { caminar: 1, correr: 1.5, sprint: 2.5 }[previewGait] : 1 + 0.5 * st.s, gait: previewGait || gaitFor(st.s) };
}
/** Escena de 240×64: fondo en movimiento, héroe y mascota (corriendo o quietos), jefe y puerta. */
function arenaHTML(o, big) {
  const z = zoneOf(o.floor), vars = `--sky1:${z.sky[0]};--sky2:${z.sky[1]};--gr:${z.gr};--gr2:${z.gr2}`;
  const showDoor = o.pre || phase, ground = 6;
  const doorName = phase === 'open' || phase === 'fade' ? 'torre_abierta' : phase.startsWith('f') ? 'torre_apertura_' + phase.slice(1) : 'torre_cerrada';
  const tNear = +(9 / o.speed).toFixed(2);
  const bg = showDoor && o.pre ? '' : `<div class="scrollwrap ${o.running ? '' : 'paused'}">${scrollLayers(o.floor, tNear)}</div>`;
  const door = showDoor ? towerLayer(doorName, doorName !== 'torre_cerrada' && !doorName.startsWith('torre_apertura'), 'door ' + (phase === 'shake' ? 'shake' : phase === 'fade' ? 'fadeout' : '')) : '';
  const idle = o.running ? '' : 'idle', hx = o.boss ? 52 : 46, pxx = o.boss ? 94 : 82;
  ['diaria', 'semanal', 'mensual', 'mueca'].forEach(p => heroSrc(o.floor, p));
  return `<div class="arena ${big ? 'big' : ''}" data-run="${o.running ? 1 : 0}" data-floor="${o.floor}" data-crown="${o.done ? 1 : 0}" data-eq="${o.eq}" data-pl="${o.pl}" data-speed="${o.speed}" data-gait="${o.gait}" style="${vars}">${bg}${door}${heroSprite(o.floor, `left:${U(hx)};bottom:${U(ground)}`, o.done).replace('class="px sp hero', 'data-act="gait" class="px sp hero')}${previewGait && o.running ? `<span class="gaitlbl">Vista previa: ${previewGait} · tocá al héroe para cambiar</span>` : ''}${petSprite(o.eq, o.pl, `left:${U(pxx)};bottom:${U(ground)}`)}${o.boss ? bossSprite(o.floor, `right:${U(14)};bottom:${U(ground)}`) : ''}</div>`;
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
function renderStrip() {
  const el = document.getElementById('strip');
  const idx = S.startDate ? dayIdx(todayISO()) : -1;
  if (!S.token || !S.startDate) { el.innerHTML = ''; stripKey = ''; return; }
  if (idx >= 0 && !S.opened && !opening) { startOpening(); return; }
  if (tab === 'torre' || tab === 'stats') { el.innerHTML = ''; stripKey = ''; startAnim(); return; }
  const o = arenaState(), { e, st } = o, floor = o.floor;
  const into = st.xp - cumXp(floor, e.cfg.A, e.cfg.r), cost = e.cfg.A * Math.pow(e.cfg.r, floor - 1);
  const pct = o.pre ? 0 : Math.round(Math.min(100, into / cost * 100));
  const open = dockOpen || o.pre || !!phase;
  const key = JSON.stringify({ o: [o.pre, floor, o.eq, o.pl, o.running, o.boss, o.done, o.speed, o.gait], pct, phase, open, readyN, tab: tab === 'hoy' });
  if (key === stripKey) return; stripKey = key;
  const z = zoneOf(floor), act = Math.min(10, Math.ceil(floor / 10)), stage = ((floor - 1) % 10) + 1;
  const title = o.pre ? `La torre se abre el ${pretty(S.startDate)}` : `${z.n} · ${act}-${stage}`;
  if (open) el.innerHTML = `<div class="strip ${!o.running && !o.pre ? 'blocked' : ''}" ${o.pre || phase ? '' : 'data-act="dock"'}><div class="top"><span>${title}</span>${o.pre ? '' : `<span class="hp" title="Avance al próximo piso"><i style="width:${pct}%"></i></span>`}</div>${arenaHTML(o)}</div>`;
  else el.innerHTML = `<div class="strip dock" data-act="dock"><div class="dockrow">${heroImgTag(floor, 2, o.done, 'idle')}${petTag(o.eq, o.pl, 2, 'pet idle')}<div class="dockinfo"><b>Piso ${floor}</b><small>${z.n}</small><span class="hp"><i style="width:${pct}%"></i></span><small>Tocá para ver la carrera</small></div></div></div>`;
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
  if (a === 'tab') { tab = el.dataset.t; if (tab === 'ajustes') errMsg = ''; render(); window.scrollTo(0, 0); }
  else if (a === 'gait') { previewGait = { '': 'caminar', caminar: 'correr', correr: 'sprint', sprint: '' }[previewGait]; stripKey = ''; render(); }
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
