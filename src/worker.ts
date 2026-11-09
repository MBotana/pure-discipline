/* Pure Discipline — servidor (Cloudflare Worker + D1). Un solo usuario.
 * Autenticación: la primera vez se define una clave (/api/setup); después todo exige Authorization: Bearer <clave>. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Env { DB: any; ASSETS: any; GEMINI_KEY?: string; GEMINI_MODEL?: string; STEAM_KEY?: string; STEAM_ID?: string; RIOT_API_KEY?: string; RIOT_ID?: string; RIOT_REGION?: string; TELEGRAM_CHAT_ID?: string; [bot: `TELEGRAM_BOT_${string}`]: string | undefined }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sha256hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

async function getSetting(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r ? (r.value as string) : null;
}
async function putSetting(env: Env, key: string, value: string) {
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, value, Date.now()).run();
}

async function authed(req: Request, env: Env): Promise<boolean> {
  const stored = await getSetting(env, 'auth_hash'); if (!stored) return false;
  const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return tok.length > 0 && (await sha256hex(tok)) === stored;
}

const PUBLIC_SETTINGS = ['start_date', 'tz_offset', 'reminder_hour', 'feed_hour', 'reminders_on', 'gym_notify', 'aero_steps', 'aero_kcal', 'aero_hour', 'gym_arrive'] as const;
const DEFAULTS: Record<string, string> = { tz_offset: '-180', reminder_hour: '21', feed_hour: '18', reminders_on: '1', gym_notify: '1', aero_steps: '10000', aero_kcal: '500', aero_hour: '19' };

async function readSettings(env: Env) {
  const out: Record<string, string> = {};
  for (const k of PUBLIC_SETTINGS) out[k] = (await getSetting(env, k)) ?? DEFAULTS[k] ?? '';
  return out;
}

// ---------- Web Push (VAPID, sin payload: la app pide el texto en /api/last-notification) ----------
async function vapid(env: Env) {
  let pub = await getSetting(env, 'vapid_pub'), priv = await getSetting(env, 'vapid_priv');
  if (!pub || !priv) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    priv = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
    await putSetting(env, 'vapid_pub', pub); await putSetting(env, 'vapid_priv', priv);
  }
  return { pub, jwk: JSON.parse(priv) };
}

async function vapidAuth(env: Env, endpoint: string, origin: string) {
  const { pub, jwk } = await vapid(env);
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: origin })}`;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data));
  return `vapid t=${data}.${b64u(sig)}, k=${pub}`;
}

// opts.icon / opts.image: rutas de imagen propias (Android/escritorio las muestran; iOS suele usar siempre el ícono de la app).
async function pushAll(env: Env, origin: string, title: string, body: string, opts: { icon?: string; image?: string } = {}): Promise<number> {
  await putSetting(env, 'last_notification', JSON.stringify({ title, body, ...opts, at: Date.now() }));
  const subs = (await env.DB.prepare('SELECT endpoint FROM push_subscriptions').all()).results as { endpoint: string }[];
  let ok = 0;
  for (const s of subs) {
    try {
      const res = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, s.endpoint, origin), TTL: '86400', Urgency: 'normal' } });
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(s.endpoint).run();
      else if (res.ok) ok++;
    } catch { /* se reintenta en la próxima corrida */ }
  }
  return ok;
}

// ---------- Alimentación con IA (Gemini) ----------
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
async function gemini(env: Env, system: string, parts: unknown[], temperature = 0.2): Promise<string> {
  if (!env.GEMINI_KEY) throw Object.assign(new Error('Falta la clave GEMINI_KEY en Cloudflare'), { status: 503 });
  let last = 'sin respuesta';
  for (const m of [...new Set([env.GEMINI_MODEL, ...MODELS].filter(Boolean) as string[])]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature } }),
    }).catch(() => null);
    if (!r) { last = m + ': sin conexión'; continue; }
    if (r.ok) {
      const j: any = await r.json().catch(() => ({}));
      const t = (j.candidates?.[0]?.content?.parts ?? []).map((q: any) => q.text ?? '').join('').trim();
      if (t) return t; last = m + ': respuesta vacía'; continue;
    }
    last = `${m}: ${r.status}`; if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw Object.assign(new Error('La IA no respondió (' + last + ')'), { status: 502 });
}
import { sugerencias, dowL } from '../engine/src/engine/resumen.ts';

// ---------- Mascotas que hablan (Gemini redacta, Telegram entrega) ----------
// El servidor decide SI hay algo que decir y qué hechos pasaron; Gemini solo decide CÓMO decirlo, con la voz de la mascota.
const PERSONAS: Record<string, string> = {
  behemot: 'Sos Behemot, una bestia de fuerza bruta que entrena junto a su dueño. Hablás directo, seco y exigente, con respeto y algo de orgullo; nunca humillás. Rioplatense, tuteo con "vos".',
};
const PET_RULES = 'Escribí UN mensaje de 1 o 2 frases, máximo 220 caracteres, en español rioplatense. Usá SOLO los hechos que te paso: no inventes números, horas, ejercicios ni logros. Sin comillas, sin hashtags, como mucho un emoji. Si hay un reproche, que sea firme pero que deje una salida concreta para hoy.';
async function petMessage(env: Env, pet: string, facts: string): Promise<string> {
  const persona = PERSONAS[pet]; if (!persona) throw Object.assign(new Error('mascota sin personalidad: ' + pet), { status: 400 });
  const t = await gemini(env, persona + ' ' + PET_RULES, [{ text: 'Hechos de hoy:\n' + facts }], 0.9);
  return t.replace(/^["“]|["”]$/g, '').slice(0, 400);
}
async function sendTelegram(env: Env, pet: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = env[`TELEGRAM_BOT_${pet.toUpperCase()}` as `TELEGRAM_BOT_${string}`], chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, error: 'faltan TELEGRAM_BOT_' + pet.toUpperCase() + ' o TELEGRAM_CHAT_ID en Cloudflare' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => null);
  if (!r) return { ok: false, error: 'sin conexión con Telegram' };
  if (r.ok) return { ok: true };
  const j: any = await r.json().catch(() => ({}));
  return { ok: false, error: `Telegram ${r.status}: ${j.description ?? 'error'}` };
}
const DESCRIBE_SYSTEM = `Sos un nutricionista que describe comidas. Describí en español, en 2 a 4 líneas, qué contiene la comida: cada alimento, porción aproximada y cocción. Cerrá siempre con estas cinco etiquetas, en una línea cada una:
Proteína: (sí/no y cuál)
Verduras o frutas: (sí/no y cuáles)
Ultraprocesado, frito o comida rápida: (sí/no y cuál)
Bebida: (cuál, o ninguna visible)
Macros aproximados: proteína X g · carbohidratos X g · grasas X g · ~X kcal
No evalúes el día ni des consejos. Si la imagen no es comida, respondé solo "No parece comida". No inventes lo que no se ve; si algo no se puede saber (aceite, azúcar, salsas), decilo.`;
const RUBRIC = `Rúbrica fija para puntuar la alimentación del día (aplicala siempre igual). El puntaje es un porcentaje de 0 a 100:
- 100: proteína abundante a lo largo del día (idealmente en almuerzo y cena), verduras o frutas presentes, grasas razonables, porciones adecuadas, sin comida basura ni bebidas azucaradas.
- 80: bastante bien, con una falla menor (por ejemplo, poca verdura o una comida algo desbalanceada).
- 50: malo: falta de proteína clara, desbalance fuerte, comida basura o ultraprocesados repetidos, o comer muy poco.
- Menos de 50: peor todavía (varias fallas juntas). 0 si no se comió nada.
Lo que baja el puntaje, sobre todo: falta de proteína, desbalance entre proteínas, verduras, frutas y grasas, comida basura y comer muy poco. Mirá el día completo: lo que faltó en una comida cuenta como cumplido si se compensó en otra. Si falta información para juzgar algo, no lo penalices. Usá solo las comidas listadas; no inventes otras.
Referencia de esta persona: está bajando de peso y entrena casi todos los días. Su meta diaria es de ~2.000 kcal y ~150 g de proteína, repartidas en tres comidas (≈12, 17 y 23 hs). Menos de ~1.500 kcal o menos de ~110 g de proteína en el día es una falla clara; pasarse de ~2.400 kcal es una falla menor. No come papa ni batata: no las recomiendes.`;
const mealName = (t: string) => { const h = +t.slice(0, 2); return h < 11 ? 'Desayuno' : h < 16 ? 'Almuerzo' : h < 20 ? 'Merienda' : 'Cena'; };
const normFirst = (text: string) => text.split('\n').find(l => l.trim())?.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '';
const parseScore = (text: string): number | null => { const m = /PUNTAJE[^0-9\n]{0,20}(\d{1,3})/i.exec(text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')); return m ? Math.min(100, Number(m[1])) : null; };
const validDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const dowOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
const mealsReady = new WeakSet<object>();
async function ensureMeals(env: Env) {
  if (mealsReady.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY, date TEXT NOT NULL, t TEXT NOT NULL, kind TEXT NOT NULL, descr TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
  mealsReady.add(env.DB);
}
const listMeals = async (env: Env, date: string) =>
  ((await env.DB.prepare('SELECT id, t, kind, descr FROM meals WHERE date = ? ORDER BY t, created_at').bind(date).all()).results as { id: string; t: string; kind: string; descr: string }[]);
/** Guarda el análisis del día en la entrada del día. El puntaje (lunes a viernes) va a foodPct; con final cierra el día. */
async function saveVerdict(env: Env, date: string, text: string, fin: boolean) {
  const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
  const input = row ? JSON.parse(row.input as string) : {}, score = parseScore(text), weekday = dowOf(date) >= 1 && dowOf(date) <= 5;
  if (text) input.verdictTx = text; else delete input.verdictTx;
  if (weekday && score !== null) input.foodPct = Math.round(score) / 100;
  const closed = fin && weekday && score !== null;
  if (closed) { input.meals = true; delete input.food; delete input.meat; delete input.veg; }
  await env.DB.prepare('INSERT INTO day_inputs (date, input, updated_at, device) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET input = excluded.input, updated_at = excluded.updated_at, device = excluded.device')
    .bind(date, JSON.stringify(input), Date.now(), 'ia-comida').run();
  return { status: score === null ? 'none' : score >= 80 ? 'ok' : 'no', closed, score };
}
async function judgeDay(env: Env, date: string, final: boolean) {
  const meals = await listMeals(env, date);
  const list = meals.map(m => `${m.t} ${mealName(m.t)}: ${m.descr}`).join('\n');
  const how = final
    ? 'El día terminó. Primera línea: solo "PUNTAJE: NN%" (un número entero de 0 a 100), según TODO el día junto. Después: "Macros del día (aprox.): proteína X g · carbohidratos X g · grasas X g · ~X kcal" y una línea "Meta: 2.000 kcal y 150 g de proteína: llegó / quedó corto en X". Después, una sección "Qué bajó el puntaje:" con cada falla y qué habría que haber comido para evitarla (o una línea de por qué fue 100 si no hubo fallas). Sin markdown.'
    : 'El día sigue. Respondé con estas líneas, sin encabezado de veredicto y sin markdown, cortas y concretas: "Esta comida: qué comí (la última comida listada)", "Esta comida: ~X kcal · X g de proteína", "Acumulado hoy: ~X kcal · X g de proteína (meta: 2.000 kcal y 150 g)", "Te falta: X kcal y X g de proteína, y si falta algo más (verduras, fruta, grasas buenas) o si hay algo para evitar", "Para compensar: una sugerencia concreta con alimentos y cantidades para la próxima comida (o para lo que queda del día, según la hora de las comidas listadas)", "Puntaje estimado hasta ahora: PUNTAJE: NN%" (suponiendo que no comes nada más). Si ya llegó a la meta o se pasó, decilo y no sugieras comer más. ';
  return gemini(env, 'Sos un evaluador consistente de la alimentación diaria de un adulto que entrena. Respondés en español rioplatense, breve y concreto.\n' + RUBRIC, [{ text: `${how}\n\nComidas del día:\n${list}` }]);
}

const isEmptyInput = (raw: string | null) => {
  if (!raw) return true;
  try { return !Object.entries(JSON.parse(raw)).some(([k, v]) => k !== 'equip' && !!v); } catch { return true; }
};

export async function runReminders(env: Env, origin: string, now = Date.now()) {
  const st = await readSettings(env);
  if (st.reminders_on !== '1' || !st.start_date) return [];
  const local = new Date(now + Number(st.tz_offset) * 60000);
  const date = local.toISOString().slice(0, 10), hour = local.getUTCHours(), dow = local.getUTCDay();
  if (date < st.start_date) return [];
  const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
  const input = row ? JSON.parse(row.input as string) : null;
  const sent: string[] = [];
  const once = async (kind: string, title: string, body: string) => {
    const done = await env.DB.prepare('SELECT 1 AS x FROM notification_log WHERE kind = ? AND date = ?').bind(kind, date).first();
    if (done) return;
    await env.DB.prepare('INSERT OR IGNORE INTO notification_log (kind, date, sent_at) VALUES (?, ?, ?)').bind(kind, date, now).run();
    await pushAll(env, origin, title, body); sent.push(kind);
  };
  if (dow >= 1 && dow <= 5 && hour >= Number(st.feed_hour) && !(input && (input.meals || input.feed)))
    await once('feed', 'Set ∞', 'Cargá el veredicto de alimentación de hoy y revisá tus horas de videojuegos.');
  if (hour >= Number(st.reminder_hour) && isEmptyInput(row ? (row.input as string) : null))
    await once('daily', 'Set ∞', 'Todavía no registraste nada hoy. ¿Cómo te fue?');
  return sent;
}

/** Lunes a primera hora: aviso con las sugerencias de la semana que terminó (una sola vez por semana). */
export async function runSemanal(env: Env, origin: string, now = Date.now()) {
  const st = await readSettings(env);
  if (st.reminders_on !== '1' || !st.start_date) return [];
  const local = new Date(now + Number(st.tz_offset) * 60000), hoy = local.toISOString().slice(0, 10), hora = local.getUTCHours();
  if (dowL(hoy) !== 0 || hora < 8 || hoy < st.start_date) return [];
  const rows = (await env.DB.prepare('SELECT date, input FROM day_inputs WHERE date >= ? AND date <= ?').bind(st.start_date, hoy).all()).results as { date: string; input: string }[];
  const inp: Record<string, any> = {}; for (const r of rows) { try { inp[r.date] = JSON.parse(r.input); } catch { /* ignorar */ } }
  const sug = sugerencias(inp, st.start_date, hoy);
  if (!sug.length) return [];
  if (await env.DB.prepare('SELECT 1 AS x FROM notification_log WHERE kind = ? AND date = ?').bind('semanal', hoy).first()) return [];
  await env.DB.prepare('INSERT OR IGNORE INTO notification_log (kind, date, sent_at) VALUES (?, ?, ?)').bind('semanal', hoy, now).run();
  const body = sug.slice(0, 3).map(x => x.texto).join(' · ') + (sug.length > 3 ? ` (+${sug.length - 3} más en Registro)` : '');
  await pushAll(env, origin, 'Resumen de la semana', body);
  return ['semanal'];
}

// ---------- rutas ----------
export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url), path = url.pathname, m = req.method;
  if (path === '/api/status' && m === 'GET') return json({ configured: !!(await getSetting(env, 'auth_hash')) });
  if (path === '/api/last-notification' && m === 'GET') {
    const raw = await getSetting(env, 'last_notification');
    return json(raw ? JSON.parse(raw) : { title: 'Set ∞', body: 'Tenés un recordatorio.' });
  }
  if (path === '/api/setup' && m === 'POST') {
    if (await getSetting(env, 'auth_hash')) return json({ error: 'ya configurado' }, 409);
    const b: any = await req.json().catch(() => ({}));
    if (typeof b.token !== 'string' || b.token.length < 8) return json({ error: 'la clave debe tener al menos 8 caracteres' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate ?? '')) return json({ error: 'fecha de inicio inválida' }, 400);
    await putSetting(env, 'auth_hash', await sha256hex(b.token)); await putSetting(env, 'start_date', b.startDate);
    return json({ ok: true });
  }
  if (!path.startsWith('/api/')) return json({ error: 'no encontrado' }, 404);
  if (!(await authed(req, env))) return json({ error: 'no autorizado' }, 401);

  if (path === '/api/me' && m === 'GET') { await putSetting(env, 'origin', url.origin); return json({ ok: true, settings: await readSettings(env) }); }
  if (path === '/api/settings' && m === 'PUT') {
    const b: any = await req.json().catch(() => ({}));
    for (const k of PUBLIC_SETTINGS) if (b[k] !== undefined) await putSetting(env, k, String(b[k]));
    return json({ settings: await readSettings(env) });
  }
  if (path === '/api/sync' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const changes: { date: string; input: unknown; updated_at: number }[] = Array.isArray(b.changes) ? b.changes : [];
    for (const c of changes) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || typeof c.updated_at !== 'number') continue;
      await env.DB.prepare('INSERT INTO day_inputs (date, input, updated_at, device) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET input = excluded.input, updated_at = excluded.updated_at, device = excluded.device WHERE excluded.updated_at > day_inputs.updated_at')
        .bind(c.date, JSON.stringify(c.input ?? {}), c.updated_at, String(b.device ?? '')).run();
    }
    const rows = (await env.DB.prepare('SELECT date, input, updated_at FROM day_inputs ORDER BY date').all()).results as any[];
    const days: Record<string, { input: unknown; updated_at: number }> = {};
    for (const r of rows) days[r.date] = { input: JSON.parse(r.input), updated_at: r.updated_at };
    return json({ days, settings: await readSettings(env), serverTime: Date.now() });
  }
  // Atajos del iPhone: entrada y salida del gimnasio. La sesión cuenta si estuviste al menos 40 minutos.
  if (path === '/api/gym' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const now = Date.now(), tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset);
    const hhmm = (ms: number) => new Date(ms + tz * 60000).toISOString().slice(11, 16);
    const notify = async (body: string) => { if ((await getSetting(env, 'gym_notify')) !== '0') await pushAll(env, url.origin, 'Gimnasio', body); };
    if (b.event === 'arrive') { await putSetting(env, 'gym_arrive', String(now)); await notify(`Llegaste al gimnasio · ${hhmm(now)}`); return json({ ok: true, event: 'arrive' }); }
    if (b.event !== 'leave') return json({ error: 'event debe ser arrive o leave' }, 400);
    const arr = Number(await getSetting(env, 'gym_arrive') ?? 0);
    if (!arr) { await notify(`Saliste del gimnasio · ${hhmm(now)} (no había una llegada registrada)`); return json({ ok: true, counted: false, reason: 'sin entrada registrada' }); }
    await putSetting(env, 'gym_arrive', '0');
    const minutes = Math.round((now - arr) / 60000);
    if (minutes < 40) { await notify(`Saliste del gimnasio · ${hhmm(now)} · ${minutes} min: menos de 40, no cuenta`); return json({ ok: true, counted: false, minutes }); }
    const date = new Date(arr + tz * 60000).toISOString().slice(0, 10);
    const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
    const input = row ? JSON.parse(row.input as string) : {};
    input.gym = true; input.gymMin = Math.max(Number(input.gymMin ?? 0), minutes);
    // Ventana de la sesión (para separar el gimnasio de la actividad del resto del día en Vitalidad).
    const wins: [number, number][] = Array.isArray(input.gymWins) ? input.gymWins : [];
    wins.push([arr, now]); input.gymWins = wins.slice(-4);
    await env.DB.prepare('INSERT INTO day_inputs (date, input, updated_at, device) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET input = excluded.input, updated_at = excluded.updated_at, device = excluded.device')
      .bind(date, JSON.stringify(input), now, 'atajo-gimnasio').run();
    await notify(`Saliste del gimnasio · ${hhmm(now)} · ${minutes} min: sesión contada ✔`);
    return json({ ok: true, counted: true, minutes, date });
  }
  // League of Legends: lectura manual (para probar la conexión) y estado.
  if (path === '/api/riot/sync' && m === 'POST') return json(await runRiot(env));
  if (path === '/api/riot' && m === 'GET') return json({ configured: !!(env.RIOT_API_KEY && env.RIOT_ID), last: Number(await getSetting(env, 'riot_last') ?? 0) || null });
  // Steam: lectura manual (para probar la conexión) y estado.
  if (path === '/api/steam/sync' && m === 'POST') return json(await runSteam(env));
  if (path === '/api/steam' && m === 'GET') return json({ configured: !!(env.STEAM_KEY && env.STEAM_ID), last: Number(await getSetting(env, 'steam_last') ?? 0) || null });
  // Vitalidad: el atajo de Salud pide la ventana del gimnasio de un día y manda lo medido FUERA de esa ventana.
  if (path === '/api/health/window' && m === 'GET') {
    const tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset), date = url.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date debe ser AAAA-MM-DD' }, 400);
    const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
    const wins: [number, number][] = row ? (JSON.parse(row.input as string).gymWins ?? []) : [];
    const iso = (ms: number) => new Date(ms + tz * 60000).toISOString().slice(0, 19);
    const w = wins.length ? [Math.min(...wins.map(x => x[0])), Math.max(...wins.map(x => x[1]))] : null;
    const day0 = Date.parse(date + 'T00:00:00Z') - tz * 60000;
    // Sin gimnasio, la ventana queda vacía a medianoche: todo el día cuenta como "fuera del gimnasio".
    // fromMin/toMin: minutos desde las 00:00 locales del día; el atajo arma las fechas con "Ajustar fecha" sin tener que interpretar texto.
    const mins = (ms: number) => Math.max(0, Math.round((ms - day0) / 60000));
    return json({ date, hasGym: !!w, from: iso(w ? w[0] : day0), to: iso(w ? w[1] : day0), dayStart: iso(day0), dayEnd: iso(day0 + 86400000 - 1000), fromMin: w ? mins(w[0]) : 0, toMin: w ? mins(w[1]) : 0 });
  }
  if (path === '/api/health/last' && m === 'GET') { const last = Number(await getSetting(env, 'health_last') ?? 0); return json({ last: last || null, minutesAgo: last ? Math.round((Date.now() - last) / 60000) : 99999 }); }
  if (path === '/api/health' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset), now = Date.now(), today = new Date(now + tz * 60000).toISOString().slice(0, 10);
    const date = typeof b.date === 'string' ? b.date : today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return json({ error: 'date inválida' }, 400);
    // Cada campo puede ser un número o una LISTA de valores (las muestras de Salud unidas con saltos de línea o ";"): el servidor suma.
    // Así el atajo no hace cuentas con decimales, que Atajos en español interpreta mal (la coma decimal como separador de miles).
    // dec=true (kcal): si no hay coma, el punto es decimal (0.354 = 0,354). dec=false (pasos, siempre enteros): el punto es de miles (1.234 = 1234).
    const one = (s: string, dec: boolean) => {
      s = s.trim().replace(/[^\d.,-]/g, ''); if (!s) return 0;
      if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');      // 1.234,5 → 1234.5 (formato español)
      else if (!dec) s = s.replace(/\./g, '');                              // pasos: 1.234 → 1234
      const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const num = (v: unknown, dec = true) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;
      const parts = String(v).split(/[\n;]+/).filter(p => p.trim() !== ''); if (!parts.length) return null;
      const t = parts.reduce((a, p) => a + one(p, dec), 0); return Number.isFinite(t) ? Math.round(t * 10) / 10 : null;
    };
    // Muestra cruda de lo último recibido (para depurar el formato que manda Atajos).
    await putSetting(env, 'health_raw', JSON.stringify({ date, steps: String(b.steps ?? '').slice(0, 200), kcal: String(b.kcal ?? '').slice(0, 300), gymSteps: String(b.gymSteps ?? '').slice(0, 200), gymKcal: String(b.gymKcal ?? '').slice(0, 200) }));
    // El atajo manda totales del día y, aparte, lo que midió dentro de la ventana del gimnasio: el servidor resta (sin gimnasio, esos campos van en 0).
    // El pulso máximo viene en dos tramos (antes y después del gimnasio): se queda con el mayor.
    // Vacío = sin muestras. Para HOY cuenta como 0 (p. ej. recién pasada la medianoche); para un día ya cerrado, vacío en pasos Y kcal
    // casi seguro es un atajo roto, y no se registra (si no, daría "fallaste el aeróbico" por error).
    const zeroOk = date === today;
    // El gimnasio ya no se resta: el atajo solo manda el total del día del iPhone (si llegan gymSteps/gymKcal de un atajo viejo, se ignoran).
    const gs = 0, gk = 0, ts = num(b.steps, false) ?? (zeroOk && 'steps' in b ? 0 : null), tk = num(b.kcal) ?? (zeroOk && 'kcal' in b ? 0 : null);
    const steps = ts === null ? null : Math.max(0, ts - gs), kcal = tk === null ? null : Math.max(0, tk - gk);
    // Un decimal con coma mal convertido por Atajos llega como un número gigante (295,8 → 2958...): se rechaza en vez de marcar un aeróbico falso.
    if ([ts, gs].some(v => v !== null && v > 200000) || [tk, gk].some(v => v !== null && v > 8000)) return json({ error: 'valor fuera de rango: redondeá pasos y kcal a entero', recibido: { steps: b.steps ?? null, kcal: b.kcal ?? null, gymSteps: b.gymSteps ?? null, gymKcal: b.gymKcal ?? null } }, 400);
    const hrs = [num(b.hrMax), num(b.hrA), num(b.hrB)].filter((x): x is number => x !== null), hr = hrs.length ? Math.max(...hrs) : null;
    if (steps === null && kcal === null && hr === null) return json({ error: 'faltan steps, kcal o hrMax', recibido: { campos: Object.keys(b), date: b.date ?? null, steps: b.steps ?? null, kcal: b.kcal ?? null, gymSteps: b.gymSteps ?? null, gymKcal: b.gymKcal ?? null } }, 400);   // el eco ayuda a depurar el atajo
    const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
    const input = row ? JSON.parse(row.input as string) : {};
    input.health = { steps: Math.round(steps ?? 0), kcal: Math.round(kcal ?? 0), hr: hr ?? 0, at: now, final: today > date };
    // Aeróbico del día: alcanza con llegar a los pasos O a las calorías activas (sin contar el gimnasio). Se marca solo; lo marcado a mano nunca se desmarca.
    const minSteps = Number((await getSetting(env, 'aero_steps')) ?? DEFAULTS.aero_steps), minKcal = Number((await getSetting(env, 'aero_kcal')) ?? DEFAULTS.aero_kcal);
    const aeroOk = input.health.steps >= minSteps || input.health.kcal >= minKcal;
    // Si estás en el gimnasio ahora mismo (entrada sin salida), los totales todavía incluyen la sesión: no se decide nada hasta que salgas.
    const inGym = false;   // sin resta del gimnasio no hay nada que esperar a que salgas
    input.health.aero = aeroOk;
    if (!inGym) {
      // Lo que se marcó solo (aeroAuto) se desmarca si un dato posterior ya no alcanza (p. ej. al registrarse la ventana del gimnasio); lo marcado a mano nunca.
      if (aeroOk && !input.aero) { input.aero = true; input.aeroAuto = true; }
      else if (!aeroOk && input.aeroAuto) { delete input.aero; delete input.aeroAuto; }
    }
    const hourNow = new Date(now + tz * 60000).getUTCHours(), aeroHour = Number((await getSetting(env, 'aero_hour')) ?? DEFAULTS.aero_hour);
    const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
    const once = async (kind: string, body: string) => {
      if (await env.DB.prepare('SELECT 1 AS x FROM notification_log WHERE kind = ? AND date = ?').bind(kind, date).first()) return;
      await env.DB.prepare('INSERT OR IGNORE INTO notification_log (kind, date, sent_at) VALUES (?, ?, ?)').bind(kind, date, now).run();
      await pushAll(env, url.origin, 'Aeróbico', body);
    };
    // v2: la misión aeróbica se eliminó; los datos de Salud se guardan pero ya no generan avisos.
    await putSetting(env, 'health_last', String(now));
    await env.DB.prepare('INSERT INTO day_inputs (date, input, updated_at, device) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET input = excluded.input, updated_at = excluded.updated_at, device = excluded.device')
      .bind(date, JSON.stringify(input), now, 'atajo-salud').run();
    return json({ ok: true, date, health: input.health });
  }
  // Atajo "Evaluar comida": devuelve el análisis acumulado de hoy (para que el modelo lo tenga en cuenta).
  if (path === '/api/verdict' && m === 'GET') {
    const tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset), date = new Date(Date.now() + tz * 60000).toISOString().slice(0, 10);
    const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
    return json({ date, text: row ? (JSON.parse(row.input as string).verdictTx ?? '') : '' });
  }
  // Guarda una respuesta de texto del día (atajos). Solo cierra el día si final es verdadero y la primera línea trae el veredicto.
  if (path === '/api/verdict' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const text = typeof b.text === 'string' ? b.text.trim().slice(0, 4000) : '';
    if (!text) return json({ error: 'falta text' }, 400);
    const tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset), date = new Date(Date.now() + tz * 60000).toISOString().slice(0, 10);
    const r = await saveVerdict(env, date, text, b.final === true || /^(si|sí|true|1)$/i.test(String(b.final ?? '')));
    return json({ ok: true, date, status: r.status, closed: r.closed });
  }
  // ----- Plan de carga: la IA ajusta el aumento semanal de cada ejercicio, siempre dentro de un rango acotado -----
  if (path === '/api/plan' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const ex: any[] = Array.isArray(b.ejercicios) ? b.ejercicios.slice(0, 30) : [];
    const base: Record<string, number> = {};
    for (const e of ex) base[String(e.ejercicio)] = Number(e.aumento_base) || 2.5;
    const plan: Record<string, { d: number }> = {};
    for (const k of Object.keys(base)) plan[k] = { d: base[k] };
    try {
      const sys = 'Sos un entrenador que ajusta cargas de un adulto que busca tonificar y perder grasa. Recibís el historial de cada ejercicio (semanas anteriores, series con peso y repeticiones, y cómo se sintió: fácil, justo o duro). Para cada ejercicio decidí cuántos kg SUMAR sobre el peso de la semana anterior en esta fase. Reglas: si faltaron series o repeticiones, o se sintió duro, sumá 0 o la mitad del aumento base; si se sintió justo y se completó todo, el aumento base; si se sintió fácil y se completó todo, hasta el doble del aumento base. Si no hay dato de sensación, el aumento base. Respondé SOLO un JSON {"<ejercicio>": {"d": <kg>}} sin texto extra.';
      const t = await gemini(env, sys, [{ text: `Fase: ${b.fase}\n${JSON.stringify(ex)}` }], 0.1);
      const j = JSON.parse(t.replace(/^```(?:json)?|```$/gim, '').trim());
      for (const k of Object.keys(base)) {
        const d = Number(j?.[k]?.d);
        if (Number.isFinite(d)) plan[k] = { d: Math.round(Math.min(Math.max(d, 0), base[k] * 2) * 2) / 2 };
      }
    } catch { /* si la IA falla queda el aumento base */ }
    return json({ plan });
  }
  // ----- Alimentación con IA: cada comida se describe, se guarda y se rehace el análisis de todo el día -----
  if (path === '/api/meals' && m === 'GET') {
    await ensureMeals(env); const date = url.searchParams.get('date') ?? '';
    if (!validDate(date)) return json({ error: 'fecha inválida' }, 400);
    const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
    return json({ date, meals: await listMeals(env, date), text: row ? (JSON.parse(row.input as string).verdictTx ?? '') : '' });
  }
  if (path === '/api/meal' && m === 'POST') {
    await ensureMeals(env);
    const b: any = await req.json().catch(() => ({}));
    const text = typeof b.text === 'string' ? b.text.trim().slice(0, 1500) : '', image = typeof b.image === 'string' ? b.image : '';
    if (!validDate(b.date)) return json({ error: 'fecha inválida' }, 400);
    if (!image && !text) return json({ error: 'falta la foto o el texto' }, 400);
    if (image.length > 3_000_000) return json({ error: 'la foto es demasiado grande' }, 413);
    if (!env.GEMINI_KEY) return json({ error: 'Falta la clave GEMINI_KEY en Cloudflare' }, 503);
    const t = /^\d{2}:\d{2}$/.test(b.t ?? '') ? b.t : '12:00';
    try {
      const descr = image
        ? await gemini(env, DESCRIBE_SYSTEM, [{ text: 'Describí esta comida.' + (text ? ' Nota de quien la comió: ' + text : '') }, { inline_data: { mime_type: typeof b.mime === 'string' ? b.mime : 'image/jpeg', data: image } }], 0.1)
        : text;
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await env.DB.prepare('INSERT INTO meals (id, date, t, kind, descr, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, b.date, t, image ? 'photo' : 'text', descr, Date.now()).run();
      const analysis = await judgeDay(env, b.date, false);
      await saveVerdict(env, b.date, analysis, false);
      return json({ ok: true, id, descr, text: analysis, meals: await listMeals(env, b.date) });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 500); }
  }
  if (path === '/api/meal/close' && m === 'POST') {
    await ensureMeals(env);
    const b: any = await req.json().catch(() => ({}));
    if (!validDate(b.date)) return json({ error: 'fecha inválida' }, 400);
    if (!(await listMeals(env, b.date)).length) return json({ error: 'No hay comidas cargadas ese día' }, 400);
    try {
      const analysis = await judgeDay(env, b.date, true), r = await saveVerdict(env, b.date, analysis, true);
      return json({ ok: true, text: analysis, status: r.status, closed: r.closed, meals: await listMeals(env, b.date) });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 500); }
  }
  if (path === '/api/vapid' && m === 'GET') return json({ publicKey: (await vapid(env)).pub });
  if (path === '/api/push/subscribe' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) return json({ error: 'suscripción inválida' }, 400);
    await env.DB.prepare('INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth')
      .bind(b.endpoint, b.keys.p256dh, b.keys.auth, Date.now()).run();
    return json({ ok: true });
  }
  if (path === '/api/push/unsubscribe' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(b.endpoint ?? '').run();
    return json({ ok: true });
  }
  if (path === '/api/push/test' && m === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    // Con ?pet=behemot: la mascota habla por Telegram (Gemini redacta con hechos de ejemplo). Sin Telegram configurado, cae al aviso web normal.
    if (typeof b.pet === 'string' && PERSONAS[b.pet]) {
      try {
        const text = await petMessage(env, b.pet, 'PRUEBA del sistema de mensajes. Son las 21:00, todavía no fue al gimnasio ni salió a correr hoy, y lleva 3 días seguidos cumpliendo sus misiones.');
        const tg = await sendTelegram(env, b.pet, text);
        return json({ delivered: tg.ok ? 1 : 0, telegram: tg.ok, text, error: tg.error });
      } catch (err: any) { return json({ delivered: 0, telegram: false, error: err.message }, 200); }
    }
    const n = await pushAll(env, url.origin, 'Set ∞', 'Las notificaciones funcionan.');
    return json({ delivered: n });
  }
  return json({ error: 'no encontrado' }, 404);
}

// ---------- Steam: horas jugadas (Disciplina). Compara el tiempo total de cada juego contra la última lectura y suma la diferencia al día de hoy ----------
export async function runSteam(env: Env): Promise<{ ok: boolean; addedH?: number; baseline?: boolean; error?: string }> {
  if (!env.STEAM_KEY || !env.STEAM_ID) return { ok: false, error: 'Faltan STEAM_KEY o STEAM_ID en Cloudflare' };
  let games: { appid: number; playtime_forever?: number }[];
  try {
    const r = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(env.STEAM_KEY)}&steamid=${encodeURIComponent(env.STEAM_ID)}&include_played_free_games=1&format=json`);
    if (!r.ok) return { ok: false, error: `Steam respondió ${r.status}` };
    const j: any = await r.json(); games = j?.response?.games;
  } catch { return { ok: false, error: 'No se pudo consultar Steam' }; }
  if (!Array.isArray(games)) return { ok: false, error: 'Steam no devolvió juegos: el perfil o los detalles de juego deben estar en público' };
  const now = Date.now(), tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset);
  const cur: Record<string, number> = {}; for (const g of games) cur[String(g.appid)] = Number(g.playtime_forever ?? 0);
  const raw = await getSetting(env, 'steam_snap');
  await putSetting(env, 'steam_snap', JSON.stringify(cur)); await putSetting(env, 'steam_last', String(now));
  if (!raw) return { ok: true, baseline: true, addedH: 0 };   // primera lectura: es el punto de partida, no cuenta horas pasadas
  const prev: Record<string, number> = JSON.parse(raw); let mins = 0;
  // Un juego que aparece por primera vez cuenta lo que trae (hasta 8 h): evita sumar cientos de horas viejas si entra a la biblioteca con historial.
  for (const [id, m] of Object.entries(cur)) { const d = id in prev ? m - prev[id] : Math.min(m, 480); if (d > 0) mins += d; }
  if (mins <= 0) return { ok: true, addedH: 0 };
  const date = new Date(now + tz * 60000).toISOString().slice(0, 10);
  const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
  const input = row ? JSON.parse(row.input as string) : {};
  const addedH = Math.round(mins / 60 * 100) / 100;
  input.gameH = Math.round(((Number(input.gameH) || 0) + addedH) * 100) / 100;
  await env.DB.prepare('INSERT INTO day_inputs (date, input, updated_at, device) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET input = excluded.input, updated_at = excluded.updated_at, device = excluded.device')
    .bind(date, JSON.stringify(input), now, 'steam').run();
  return { ok: true, addedH };
}

// ---------- League of Legends: horas jugadas (cuentan como videojuegos). Suma la duración de las partidas nuevas del día en que terminaron ----------
export async function runRiot(env: Env): Promise<{ ok: boolean; addedH?: number; matches?: number; baseline?: boolean; error?: string }> {
  if (!env.RIOT_API_KEY || !env.RIOT_ID || !env.RIOT_ID.includes('#')) return { ok: false, error: 'Faltan RIOT_API_KEY o RIOT_ID (nombre#tag) en Cloudflare' };
  const host = `https://${env.RIOT_REGION || 'americas'}.api.riotgames.com`, hdr = { 'X-Riot-Token': env.RIOT_API_KEY };
  const get = async (u: string) => { const r = await fetch(host + u, { headers: hdr }); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<any>; };
  const now = Date.now(), tz = Number((await getSetting(env, 'tz_offset')) ?? DEFAULTS.tz_offset);
  try {
    let puuid = await getSetting(env, 'riot_puuid');
    if (!puuid) {
      const [name, tag] = env.RIOT_ID.split('#');
      puuid = (await get(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`)).puuid;
      await putSetting(env, 'riot_puuid', puuid!);
    }
    const lastRaw = await getSetting(env, 'riot_last');
    await putSetting(env, 'riot_last', String(now));
    if (!lastRaw) return { ok: true, baseline: true, addedH: 0, matches: 0 };       // primera lectura: punto de partida, no cuenta partidas viejas
    const since = Math.floor((Number(lastRaw) - 3 * 3600e3) / 1000);                 // un margen de 3 h por si una partida terminó entre lecturas
    const ids: string[] = await get(`/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${since}&count=30`);
    const seen: string[] = JSON.parse((await getSetting(env, 'riot_seen')) ?? '[]'), perDay: Record<string, number> = {}; let n = 0;
    for (const id of ids) {
      if (seen.includes(id)) continue;
      const info = (await get(`/lol/match/v5/matches/${id}`))?.info; if (!info) continue;
      const end = Number(info.gameEndTimestamp) || (Number(info.gameStartTimestamp) + Number(info.gameDuration) * (info.gameEndTimestamp ? 1 : 1000));
      const secs = info.gameEndTimestamp ? Number(info.gameDuration) : Number(info.gameDuration) / 1000;   // antes de 2021 venía en milisegundos
      const date = new Date(end + tz * 60000).toISOString().slice(0, 10);
      perDay[date] = (perDay[date] ?? 0) + secs / 3600; seen.push(id); n++;
    }
    await putSetting(env, 'riot_seen', JSON.stringify(seen.slice(-60)));
    let total = 0;
    for (const [date, h] of Object.entries(perDay)) {
      const row = await env.DB.prepare('SELECT input FROM day_inputs WHERE date = ?').bind(date).first();
      const input = row ? JSON.parse(row.input as string) : {}, add = Math.round(h * 100) / 100;
      input.gameH = Math.round(((Number(input.gameH) || 0) + add) * 100) / 100; total += add;
      await env.DB.prepare('INSERT INTO day_inputs (date, input, updated_at, device) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET input = excluded.input, updated_at = excluded.updated_at, device = excluded.device')
        .bind(date, JSON.stringify(input), now, 'riot').run();
    }
    return { ok: true, addedH: Math.round(total * 100) / 100, matches: n };
  } catch (e: any) {
    const c = String(e?.message ?? '');
    return { ok: false, error: c === '401' || c === '403' ? 'Riot rechazó la clave (vencida o incorrecta)' : c === '404' ? 'No se encontró el Riot ID' : c === '429' ? 'Riot pidió esperar (límite de pedidos)' : 'No se pudo consultar Riot' };
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  scheduled: async (_e: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) => {
    const origin = (await getSetting(env, 'origin')) ?? 'https://pure-discipline.workers.dev';
    ctx.waitUntil(runReminders(env, origin));
    ctx.waitUntil(runSemanal(env, origin).then(() => undefined, () => undefined));
    ctx.waitUntil(runSteam(env).then(() => undefined, () => undefined));
    ctx.waitUntil(runRiot(env).then(() => undefined, () => undefined));
  },
};
