/* Pure Discipline — servidor (Cloudflare Worker + D1). Un solo usuario.
 * Autenticación: la primera vez se define una clave (/api/setup); después todo exige Authorization: Bearer <clave>. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Env { DB: any; ASSETS: any }

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

const PUBLIC_SETTINGS = ['start_date', 'tz_offset', 'reminder_hour', 'feed_hour', 'reminders_on'] as const;
const DEFAULTS: Record<string, string> = { tz_offset: '-180', reminder_hour: '21', feed_hour: '18', reminders_on: '1' };

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

async function pushAll(env: Env, origin: string, title: string, body: string): Promise<number> {
  await putSetting(env, 'last_notification', JSON.stringify({ title, body, at: Date.now() }));
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
  if (dow === 0 && hour >= Number(st.feed_hour) && !(input && (input.feed || input.dform)))
    await once('feed', 'Pure Discipline', 'Hoy cierra la semana: completá el cierre (Disciplina y celular).');
  if (hour >= Number(st.reminder_hour) && isEmptyInput(row ? (row.input as string) : null))
    await once('daily', 'Pure Discipline', 'Todavía no registraste nada hoy. ¿Cómo te fue?');
  return sent;
}

// ---------- rutas ----------
export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url), path = url.pathname, m = req.method;
  if (path === '/api/status' && m === 'GET') return json({ configured: !!(await getSetting(env, 'auth_hash')) });
  if (path === '/api/last-notification' && m === 'GET') {
    const raw = await getSetting(env, 'last_notification');
    return json(raw ? JSON.parse(raw) : { title: 'Pure Discipline', body: 'Tenés un recordatorio.' });
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
    const n = await pushAll(env, url.origin, 'Pure Discipline', 'Las notificaciones funcionan.');
    return json({ delivered: n });
  }
  return json({ error: 'no encontrado' }, 404);
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  scheduled: async (_e: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) => {
    const origin = (await getSetting(env, 'origin')) ?? 'https://pure-discipline.workers.dev';
    ctx.waitUntil(runReminders(env, origin));
  },
};
