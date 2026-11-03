import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handle, runReminders } from '../src/worker.ts';

// D1 simulado sobre node:sqlite
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE day_inputs (date TEXT PRIMARY KEY, input TEXT NOT NULL, updated_at INTEGER NOT NULL, device TEXT);
  CREATE TABLE push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE notification_log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, date TEXT NOT NULL, sent_at INTEGER NOT NULL, UNIQUE(kind, date));`);
  return { prepare: (sql: string) => { const st = db.prepare(sql); let args: any[] = [];
    const o: any = { bind: (...a: any[]) => { args = a; return o; }, first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }), run: async () => { st.run(...args); return {}; } };
    return o; } };
}
const env = () => ({ DB: fakeD1(), ASSETS: null });
const call = (e: any, method: string, path: string, body?: unknown, token?: string) =>
  handle(new Request('https://x.test' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: token ? { authorization: 'Bearer ' + token } : {} }), e);

test('configuración inicial, autenticación y sincronización con última escritura gana', async () => {
  const e = env();
  assert.equal((await (await call(e, 'GET', '/api/status')).json() as any).configured, false);
  assert.equal((await call(e, 'POST', '/api/setup', { token: 'corta', startDate: '2026-11-02' })).status, 400);
  assert.equal((await call(e, 'POST', '/api/setup', { token: 'clave-larga-1', startDate: '2026-11-02' })).status, 200);
  assert.equal((await call(e, 'POST', '/api/setup', { token: 'otra-clave-22', startDate: '2026-11-02' })).status, 409, 'no se puede reconfigurar');
  assert.equal((await call(e, 'POST', '/api/sync', { changes: [] })).status, 401);
  assert.equal((await call(e, 'POST', '/api/sync', { changes: [] }, 'mala-clave-xx')).status, 401);
  const T = 'clave-larga-1';
  let r: any = await (await call(e, 'POST', '/api/sync', { device: 'a', changes: [{ date: '2026-11-02', input: { gym: true }, updated_at: 100 }] }, T)).json();
  assert.deepEqual(r.days['2026-11-02'].input, { gym: true });
  r = await (await call(e, 'POST', '/api/sync', { device: 'b', changes: [{ date: '2026-11-02', input: { gym: false }, updated_at: 50 }] }, T)).json();
  assert.deepEqual(r.days['2026-11-02'].input, { gym: true }, 'un cambio más viejo no pisa al más nuevo');
  r = await (await call(e, 'POST', '/api/sync', { device: 'b', changes: [{ date: '2026-11-02', input: { gym: true, read: true }, updated_at: 200 }] }, T)).json();
  assert.deepEqual(r.days['2026-11-02'].input, { gym: true, read: true });
  assert.equal(r.settings.start_date, '2026-11-02');
});

test('VAPID: se genera una vez y el JWT se firma', async () => {
  const e = env(); await call(e, 'POST', '/api/setup', { token: 'clave-larga-1', startDate: '2026-11-02' });
  const a: any = await (await call(e, 'GET', '/api/vapid', undefined, 'clave-larga-1')).json();
  const b: any = await (await call(e, 'GET', '/api/vapid', undefined, 'clave-larga-1')).json();
  assert.equal(a.publicKey, b.publicKey); assert.equal(Buffer.from(a.publicKey, 'base64url').length, 65);
});

test('recordatorios: diario y alimentación, una sola vez por día, respetando horas y zona', async () => {
  const e = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  await call(e, 'PUT', '/api/settings', { reminder_hour: 21, feed_hour: 18, tz_offset: -180 }, T);
  const utc = (iso: string) => Date.parse(iso);
  // sábado 7-nov 20:00 local (23:00 UTC): todavía no
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-07T23:00:00Z')), []);
  // sábado 22:00 local (01:00 UTC del 8): avisa 'daily'
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-08T00:30:00Z')), ['daily']);
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-08T01:30:00Z')), [], 'no repite');
  // viernes 6-nov 18:00 local = 21:00 UTC: avisa alimentación
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-06T21:00:00Z')), ['feed']);
  // el domingo no (el fin de semana la comida es libre)
  assert.ok(!(await runReminders(e as any, 'https://x.test', utc('2026-11-08T21:00:00Z'))).includes('feed'));
  // si ya registró el día y alimentó, no avisa
  await call(e, 'POST', '/api/sync', { changes: [{ date: '2026-11-09', input: { gym: true, meals: true }, updated_at: 1 }] }, T);
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-10T00:30:00Z')), []);
});

test('gimnasio: la salida cuenta solo con 40 minutos o más y marca el día de la entrada', async () => {
  const e = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const real = Date.now; let t = Date.parse('2026-11-03T22:00:00Z'); Date.now = () => t;   // 19:00 locales
  try {
    assert.equal((await call(e, 'POST', '/api/gym', { event: 'leave' }, T).then(r => r.json()) as any).counted, false, 'sin entrada');
    await call(e, 'POST', '/api/gym', { event: 'arrive' }, T); t += 10 * 60000;
    assert.equal((await call(e, 'POST', '/api/gym', { event: 'leave' }, T).then(r => r.json()) as any).counted, false, 'pasó 10 minutos');
    await call(e, 'POST', '/api/gym', { event: 'arrive' }, T); t += 75 * 60000;
    const r: any = await call(e, 'POST', '/api/gym', { event: 'leave' }, T).then(x => x.json());
    assert.equal(r.counted, true); assert.equal(r.date, '2026-11-03');
    const s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-03'].input.gym, true); assert.equal(s.days['2026-11-03'].input.gymMin, 75);
    assert.equal((await call(e, 'POST', '/api/gym', { event: 'x' }, T)).status, 400);
  } finally { Date.now = real; }
});

test('vitalidad: ventana del gimnasio y datos de Salud fuera de esa ventana', async () => {
  const e = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const real = Date.now; let t = Date.parse('2026-11-03T22:00:00Z'); Date.now = () => t;   // 19:00 locales
  try {
    let w: any = await call(e, 'GET', '/api/health/window?date=2026-11-03', undefined, T).then(r => r.json());
    assert.equal(w.hasGym, false); assert.equal(w.from, w.to, 'sin gimnasio la ventana queda vacía');
    assert.equal(w.dayStart, '2026-11-03T00:00:00');
    await call(e, 'POST', '/api/gym', { event: 'arrive' }, T); t += 75 * 60000;
    await call(e, 'POST', '/api/gym', { event: 'leave' }, T);
    w = await call(e, 'GET', '/api/health/window?date=2026-11-03', undefined, T).then(r => r.json());
    assert.equal(w.hasGym, true); assert.equal(w.from, '2026-11-03T19:00:00'); assert.equal(w.to, '2026-11-03T20:15:00');
    assert.equal((await call(e, 'GET', '/api/health/window?date=mal', undefined, T)).status, 400);
    // hoy: queda provisorio; al día siguiente, final
    let r: any = await call(e, 'POST', '/api/health', { date: '2026-11-03', steps: '5.200', kcal: '310,5', hrMax: 128 }, T).then(x => x.json());
    assert.equal(r.health.final, false); assert.equal(r.health.kcal, 310.5);
    t = Date.parse('2026-11-04T13:00:00Z');
    r = await call(e, 'POST', '/api/health', { date: '2026-11-03', steps: 7300, kcal: 410, hrMax: 131 }, T).then(x => x.json());
    assert.equal(r.health.final, true);
    const s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-03'].input.health.steps, 7300); assert.equal(s.days['2026-11-03'].input.gym, true, 'no pisa el resto del día');
    assert.equal((await call(e, 'POST', '/api/health', { date: '2026-11-09', steps: 1 }, T)).status, 400, 'día futuro');
    assert.equal((await call(e, 'POST', '/api/health', { date: '2026-11-03' }, T)).status, 400, 'sin datos');
  } finally { Date.now = real; }
});

test('veredicto de comida: guarda la respuesta y cierra el día según la primera línea', async () => {
  const e = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const real = Date.now; Date.now = () => Date.parse('2026-11-04T20:00:00Z');   // miércoles
  try {
    let r: any = await call(e, 'POST', '/api/verdict', { text: 'PARCIAL\nTe falta verdura.' }, T).then(x => x.json());
    assert.equal(r.status, 'parcial');
    let s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-04'].input.meals, undefined); assert.match(s.days['2026-11-04'].input.verdictTx, /verdura/);
    r = await call(e, 'POST', '/api/verdict', { text: 'Aprobado hasta ahora', final: 'no' }, T).then(x => x.json());
    assert.equal(r.closed, false, 'sin final no cierra');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); assert.equal(s.days['2026-11-04'].input.meals, undefined);
    const g: any = await call(e, 'GET', '/api/verdict', undefined, T).then(x => x.json()); assert.match(g.text, /hasta ahora/);
    r = await call(e, 'POST', '/api/verdict', { text: 'Aprobado\nTodo bien.', final: 'si' }, T).then(x => x.json());
    assert.equal(r.status, 'ok');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.deepEqual([s.days['2026-11-04'].input.meals, s.days['2026-11-04'].input.food], [true, true]);
    r = await call(e, 'POST', '/api/verdict', { text: 'NO APROBADO\nMucha fritura.', final: true }, T).then(x => x.json());
    assert.equal(r.status, 'no');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-04'].input.food, undefined); assert.equal(s.days['2026-11-04'].input.meals, true);
    assert.equal((await call(e, 'POST', '/api/verdict', {}, T)).status, 400);
  } finally { Date.now = real; }
});

test('alimentación con IA: describe cada comida, acumula el día y cierra con el análisis completo', async () => {
  const e: any = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  assert.equal((await call(e, 'POST', '/api/meal', { date: '2026-11-04', text: 'milanesa' }, T)).status, 503, 'sin clave de Gemini');
  e.GEMINI_KEY = 'k';
  const real = globalThis.fetch; const prompts: string[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const body = JSON.parse(init.body); const parts = body.contents[0].parts; prompts.push(parts.map((p: any) => p.text ?? '[imagen]').join('|'));
    assert.equal(init.headers['x-goog-api-key'], 'k');
    const isJudge = /Comidas del día/.test(parts[0].text);
    const out = !isJudge ? 'Pollo con arroz.\nProteína: sí, pollo' : /El día terminó/.test(parts[0].text) ? 'NO APROBADO\nFalta verdura.' : 'Comida de ahora: pollo.\nTe falta para una buena alimentación: verduras';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: out }] } }] }), { status: 200 });
  }) as any;
  try {
    let r: any = await call(e, 'POST', '/api/meal', { date: '2026-11-04', t: '13:10', image: 'AAAA', mime: 'image/jpeg' }, T).then(x => x.json());
    assert.equal(r.ok, true); assert.match(r.descr, /Pollo/); assert.doesNotMatch(r.text, /^APROBADO|^NO APROBADO/);
    assert.ok(prompts.some(p => p.includes('[imagen]')), 'la foto viaja a la IA');
    r = await call(e, 'POST', '/api/meal', { date: '2026-11-04', t: '21:00', text: 'sopa de zapallo' }, T).then(x => x.json());
    assert.equal(r.meals.length, 2);
    assert.ok(prompts.at(-1)!.includes('Pollo con arroz') && prompts.at(-1)!.includes('sopa de zapallo'), 'el análisis ve todas las comidas del día');
    let s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-04'].input.meals, undefined, 'el análisis parcial no cierra el día');
    r = await call(e, 'POST', '/api/meal/close', { date: '2026-11-04' }, T).then(x => x.json());
    assert.deepEqual([r.status, r.closed], ['no', true]);
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.deepEqual([s.days['2026-11-04'].input.meals, s.days['2026-11-04'].input.food], [true, undefined]);
    const g: any = await call(e, 'GET', '/api/meals?date=2026-11-04', undefined, T).then(x => x.json());
    assert.equal(g.meals.length, 2); assert.match(g.text, /Falta verdura/);
    assert.equal((await call(e, 'POST', '/api/meal/close', { date: '2026-11-05' }, T)).status, 400, 'sin comidas no se cierra');
  } finally { globalThis.fetch = real; }
});
