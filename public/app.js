import { Engine, levelOf, cumXp, buildGates } from '/engine.js';
import { gateSVG, flagSVG, zoneOf, ZONES } from '/art.js';
import { onAssets, exists, has, url, heroSrc, heroSprite, heroBase, petTag, petSprite, bossSprite, bgName, bgLayer, towerLayer, iconTag, PETS, BOSSES } from '/assets.js';
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

let tab = 'hoy', viewDate = todayISO(), syncMsg = '', syncing = false, errMsg = '', mode = null, timer = 0;

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
const toggle = (date, key) => {
  const before = dayGain(date), wasOn = !!S.days[date]?.input?.[key];
  setInput(date, i => { i[key] = !i[key]; });
  if (wasOn) return;
  const idx = dayIdx(date), c = idx >= 0 ? compute(idx).results[idx].completed : null;
  fx(Math.round(dayGain(date) - before), c?.monthly.length ? 'mensual' : c?.weekly.length ? 'semanal' : 'diaria');
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
  const nav = `<div class="nav"><button data-act="prev" aria-label="Día anterior">‹</button><div style="text-align:center"><b>${pretty(viewDate)}</b>${viewDate === today ? '<div class="mute">Hoy</div>' : '<div class="mute"><a href="#" data-act="today">Ir a hoy</a></div>'}</div><button data-act="next" aria-label="Día siguiente" ${viewDate >= today ? 'disabled' : ''}>›</button></div>`;
  if (dayIdx(today) < 0) return `${nav}<div class="card"><div class="big">Faltan ${-dayIdx(today)} días</div><p class="mute">Tu torre empieza el ${pretty(S.startDate)}. Mientras tanto no hay nada que registrar.</p></div>`;
  if (idx < 0) return `${nav}<div class="card mute">Este día es anterior al inicio de tu torre.</div>`;
  const { e, results } = compute(idx), st = e.state, r = results[idx];
  const dd = idx % 7, inp = S.days[viewDate]?.input ?? {};
  const on = k => !!inp[k];
  const t = (k, label, sub) => `<button class="task ${on(k) ? 'on' : ''}" data-act="t" data-k="${k}"><span class="box">${on(k) ? '✓' : ''}</span><span>${label}<small>${sub}</small></span></button>`;
  const w = c => st.wu[c], m = c => st.mu[c];
  const gained = r.events.reduce((a, x) => a + x.paid, 0), lost = r.events.filter(x => x.outcome !== 'paid').reduce((a, x) => a + x.amount - x.paid, 0);
  let h = nav;
  if (st.blocked !== null && viewDate === today) h += `<div class="banner">🔒 <b>Bloqueado en el piso ${st.blocked}.</b> No sumás XP hasta cumplir la puerta (mirá la pestaña Torre).</div>`;
  h += `<div class="card"><div class="row"><div><div class="mute">XP ganada este día</div><div class="big">+${fmt(gained)}</div></div><div style="text-align:right"><div class="mute">Piso</div><div class="big">${r.floor}</div></div></div>${lost > 0 ? `<div class="mute">No cobrada por bloqueo: ${fmt(lost)}</div>` : ''}<div class="mute">Racha mensual: ${st.s} · multiplicador ×${st.s >= 1 ? st.s + 1 : 1}</div></div>`;
  h += `<div class="card"><h2>${iconTag('F')} Fuerza</h2>${t('gym', 'Gimnasio', `semana ${w('F')}/3 · mes ${m('F')}/18`)}</div>`;
  h += `<div class="card"><h2>${iconTag('I')} Inteligencia</h2>${t('read', 'Lectura', `semana ${w('I')}/3`)}${t('bookTramo', 'Avancé un tramo del libro (10 %)', `mes ${m('I')}/10`)}</div>`;
  h += `<div class="card"><h2>${iconTag('V')} Vitalidad</h2>${t('aero', 'Aeróbico', `semana ${w('V')}/3 · mes ${m('V')}/12`)}</div>`;
  h += `<div class="card"><h2>${iconTag('D')} Disciplina</h2>${t('dwork', 'Día de trabajo del objetivo', `semana ${w('D')}/3`)}${dd === 2 || dd === 6 ? t('dcheck', 'Chequeo de tareas: al día', 'miércoles y domingo') : ''}</div>`;
  h += `<div class="card"><h2>${iconTag('O')} Orden</h2>${t('clean', 'Ambiente ordenado', `semana ${w('O')}/6`)}${t('improve', 'Día de trabajo de la mejora', `mes ${m('O')}/6`)}</div>`;
  if (dd === 6) {
    h += `<div class="card"><h2>Cierre de semana</h2>`;
    h += `<button class="task bad ${inp.anti === false ? 'on' : ''}" data-act="anti"><span class="box">${inp.anti === false ? '!' : ''}</span><span>Violé un antiobjetivo<small>más de 3 sesiones de videojuegos o celular promedio > 5 h</small></span></button>`;
    h += t('feed', 'Alimenté a la mascota toda la semana', `mascota equipada: ${NAMES[st.equipped]}`) + `</div>`;
  }
  return h;
}

let mapAct = 0, mapSel = 0;
function viewTorre() {
  if (!S.startDate || dayIdx(todayISO()) < 0) return `<h1>Torre</h1><div class="card mute">Empieza el ${S.startDate ? pretty(S.startDate) : '—'}.</div>`;
  const { e } = compute(dayIdx(todayISO())), st = e.state, cfg = e.cfg, L = e.floor();
  const into = st.xp - cumXp(L, cfg.A, cfg.r), cost = cfg.A * Math.pow(cfg.r, L - 1);
  const gates = buildGates(cfg), nums = Object.keys(gates).map(Number).sort((a, b) => a - b);
  const curAct = Math.min(10, Math.ceil(L / 10)), act = mapAct || curAct, z = ZONES[act - 1], sel = mapSel || L;
  const reqLines = (g) => { const d = gates[g], parts = [];
    if (d.stats) parts.push(d.stats.map(c => `${NAMES[c]} ${st.stat[c]}/${d.req}`).join(' + '));
    if (d.streak !== undefined) parts.push(`racha de ${d.streak} meses (tenés ${st.s})`);
    return parts.join('<br>'); };
  let h = `<h1>Torre</h1><div class="card"><div class="row"><div><div class="mute">Piso actual</div><div class="big">${L}</div></div><div style="text-align:right"><div class="mute">XP total</div><b>${fmt(st.xp)}</b></div></div>`;
  h += st.tower !== null ? `<div class="banner ok">🏆 ¡Torre completada!</div>` : `<div class="bar"><i style="width:${Math.min(100, into / cost * 100)}%"></i></div><div class="mute">${fmt(into)} / ${fmt(cost)} XP para el piso ${L + 1}</div>`;
  h += `<div class="mute">Racha mensual activa: <b>${st.s}</b> ${st.s === 1 ? 'mes' : 'meses'}</div></div>`;
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
  let h = `<h1>Estadísticas</h1><div class="card">` + (Number.isFinite(cap) ? `<div class="mute">Tope actual: ${cap} (hasta superar la próxima puerta de estadísticas)</div>` : '');
  for (const c of CATS) h += `<div style="margin-top:12px"><div class="row"><b>${iconTag(c)} ${NAMES[c]}</b><b>${st.stat[c]}${Number.isFinite(cap) ? ' / ' + cap : ''}</b></div><div class="bar"><i style="width:${Number.isFinite(cap) ? Math.min(100, st.stat[c] / cap * 100) : 100}%"></i></div></div>`;
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

const TABS = [['hoy', '✅', 'Hoy', viewHoy], ['torre', '🏰', 'Torre', viewTorre], ['stats', '📊', 'Stats', viewStats], ['mascotas', '🐾', 'Mascotas', viewMascotas], ['ajustes', '⚙️', 'Ajustes', viewAjustes]];
function render() {
  const view = TABS.find(t => t[0] === tab)[3];
  const app = document.getElementById('app'), focus = document.activeElement?.id, y = window.scrollY;
  const offline = (!navigator.onLine || pending() > 0) && S.token ? `<div class="mute" style="text-align:right">${navigator.onLine ? 'pendiente de sincronizar' : 'sin conexión'}</div>` : '';
  if (!S.token && tab !== 'ajustes') { tab = 'ajustes'; return render(); }
  app.innerHTML = offline + view(); renderStrip();
  document.getElementById('tabs').innerHTML = TABS.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="tab" data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
  if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
  window.scrollTo(0, y);
}

// ---------- franja de batalla ----------
// Lienzo lógico de 240×64: todo se posiciona en unidades de ese lienzo (cqw) para que escale parejo en cualquier pantalla.
let stripKey = '', readyN = 0, opening = false, phase = '';
const U = v => `calc(${v} * 100cqw / 240)`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function renderStrip() {
  const el = document.getElementById('strip');
  const idx = S.startDate ? dayIdx(todayISO()) : -1;
  if (!S.token || !S.startDate) { el.innerHTML = ''; stripKey = ''; return; }
  if (idx >= 0 && !S.opened && !opening) { startOpening(); return; }
  const { e, st, pre } = current();
  const floor = pre ? 1 : e.floor();
  const into = st.xp - cumXp(floor, e.cfg.A, e.cfg.r), cost = e.cfg.A * Math.pow(e.cfg.r, floor - 1);
  const d = { pre, floor, eq: st.equipped, pl: e.petLevel(st.equipped), blocked: st.blocked !== null, done: st.tower !== null, boss: BOSSES.includes(floor) && !st.cleared.includes(floor) && st.tower === null, pct: pre ? 0 : Math.round(Math.min(100, into / cost * 100)), phase, readyN };
  const key = JSON.stringify(d); if (key === stripKey) return; stripKey = key;
  const z = zoneOf(floor), act = Math.min(10, Math.ceil(floor / 10)), stage = ((floor - 1) % 10) + 1;
  const title = pre ? `La torre se abre el ${pretty(S.startDate)}` : `${z.n} · ${act}-${stage}`;
  const vars = `--sky1:${z.sky[0]};--sky2:${z.sky[1]};--gr:${z.gr};--gr2:${z.gr2}`;
  const showDoor = pre || phase;
  const doorName = phase === 'open' || phase === 'fade' ? 'torre_abierta' : phase.startsWith('f') ? 'torre_apertura_' + phase.slice(1) : 'torre_cerrada';
  const bg = showDoor && pre ? '' : bgLayer(bgName(floor), null, 'bg');
  const door = showDoor ? towerLayer(doorName, doorName !== 'torre_cerrada' && !doorName.startsWith('torre_apertura'), 'door ' + (phase === 'shake' ? 'shake' : phase === 'fade' ? 'fadeout' : '')) : '';
  const ground = 6;
  ['diaria', 'semanal', 'mensual'].forEach(p => heroSrc(floor, p)); // precarga las poses
  el.innerHTML = `<div class="strip ${d.blocked ? 'blocked' : ''}"><div class="top"><span>${title}</span>${pre ? '' : `<span class="hp" title="Avance al próximo piso"><i style="width:${d.pct}%"></i></span>`}</div><div class="arena" style="${vars}">${bg}${door}${heroSprite(floor, `left:${U(46)};bottom:${U(ground)}`, d.done)}${petSprite(d.eq, d.pl, `left:${U(82)};bottom:${U(ground)}`)}${d.boss ? bossSprite(floor, `right:${U(14)};bottom:${U(ground)}`) : ''}</div></div>`;
  if (phase === 'fade') requestAnimationFrame(() => requestAnimationFrame(() => el.querySelector('.door')?.classList.add('gone')));
}
/** Apertura de la puerta, una sola vez: cerrada → sacudón → (cuadros) → abierta → aparece la zona 1. */
async function startOpening() {
  opening = true;
  const frames = []; for (let n = 1; n <= 6; n++) if (await exists('torre_apertura_' + n)) frames.push(n);
  const seq = [['closed', 900], ['shake', 1100], ...frames.map(n => ['f' + n, 500]), ['open', 900], ['fade', 1000]];
  for (const [p, ms] of seq) { phase = p; renderStrip(); await sleep(ms); }
  phase = ''; S.opened = true; save(); opening = false; stripKey = ''; renderStrip();
}
/** Festejo del héroe (1 s diaria, 1,5 s semanal, 2,5 s mensual) y texto de XP ganada. */
function fx(delta, pose = 'diaria') {
  const s = document.querySelector('.strip'); if (!s) return;
  const hero = s.querySelector('.hero');
  if (hero) {
    const { e } = current(), r = heroSrc(e.floor(), pose), base = hero.src, ms = { diaria: 1000, semanal: 1500, mensual: 2500 }[pose];
    hero.src = r.src; hero.classList.toggle('hop', r.hop);
    if (pose === 'mensual') for (let i = 0; i < 6; i++) { const t = document.createElement('i'); t.className = 'spark'; t.textContent = '✦'; t.style.cssText = `left:calc(${46 + (i % 3) * 14 - 6} * 100cqw / 240);bottom:calc(${14 + Math.floor(i / 3) * 20 + (i % 2) * 6} * 100cqw / 240);animation-delay:${i * 0.18}s`; s.querySelector('.arena').appendChild(t); setTimeout(() => t.remove(), ms); }
    setTimeout(() => { if (hero.isConnected) { hero.src = base; hero.classList.remove('hop'); } }, ms);
  }
  if (delta > 0) {
    const t = document.createElement('div'); t.className = 'dmg'; t.textContent = '+' + delta;
    s.querySelector('.arena').appendChild(t); setTimeout(() => t.remove(), 950);
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
  else if (a === 't') toggle(viewDate, el.dataset.k);
  else if (a === 'anti') setInput(viewDate, i => { i.anti = i.anti === false ? undefined : false; });
  else if (a === 'prev') { viewDate = addDays(viewDate, -1); render(); }
  else if (a === 'next') { if (viewDate < todayISO()) { viewDate = addDays(viewDate, 1); render(); } }
  else if (a === 'today') { ev.preventDefault(); viewDate = todayISO(); render(); }
  else if (a === 'equip') { if (dayIdx(todayISO()) < 0) { S.preEquip = el.dataset.c; save(); stripKey = ''; render(); } else setInput(todayISO(), i => { i.equip = el.dataset.c; }); }
  else if (a === 'map') { mapAct = +el.dataset.a; mapSel = 0; render(); }
  else if (a === 'node') { mapSel = +el.dataset.f; render(); }
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
