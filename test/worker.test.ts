import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handle, runReminders, runSteam } from '../src/worker.ts';

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
    assert.equal(r.health.final, false); assert.equal(r.health.kcal, 311);
    t = Date.parse('2026-11-04T13:00:00Z');
    r = await call(e, 'POST', '/api/health', { date: '2026-11-03', steps: 7300, kcal: 410, hrMax: 131 }, T).then(x => x.json());
    assert.equal(r.health.final, true);
    const s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-03'].input.health.steps, 7300); assert.equal(s.days['2026-11-03'].input.gym, true, 'no pisa el resto del día');
    r = await call(e, 'POST', '/api/health', { date: '2026-11-03', steps: 9000, gymSteps: 1500, kcal: 700, gymKcal: 350, hrA: 120, hrB: 135 }, T).then(x => x.json());
    assert.deepEqual([r.health.steps, r.health.kcal, r.health.hr], [9000, 700, 135], 'el gimnasio ya no se resta (se ignora gymSteps/gymKcal); toma el pulso mayor');
    assert.equal((await call(e, 'POST', '/api/health', { date: '2026-11-09', steps: 1 }, T)).status, 400, 'día futuro');
    assert.equal((await call(e, 'POST', '/api/health', { date: '2026-11-03' }, T)).status, 400, 'sin datos');
  } finally { Date.now = real; }
});

test('veredicto de comida: guarda la respuesta y cierra el día según la primera línea', async () => {
  const e = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const real = Date.now; Date.now = () => Date.parse('2026-11-04T20:00:00Z');   // miércoles
  try {
    let r: any = await call(e, 'POST', '/api/verdict', { text: 'Te falta verdura.\nPUNTAJE: 60%' }, T).then(x => x.json());
    assert.equal(r.status, 'no'); assert.equal(r.closed, false);
    let s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-04'].input.meals, undefined); assert.match(s.days['2026-11-04'].input.verdictTx, /verdura/); assert.equal(s.days['2026-11-04'].input.foodPct, 0.6);
    r = await call(e, 'POST', '/api/verdict', { text: 'Va bien hasta ahora. PUNTAJE: 70%', final: 'no' }, T).then(x => x.json());
    assert.equal(r.closed, false, 'sin final no cierra');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); assert.equal(s.days['2026-11-04'].input.meals, undefined);
    const g: any = await call(e, 'GET', '/api/verdict', undefined, T).then(x => x.json()); assert.match(g.text, /hasta ahora/);
    r = await call(e, 'POST', '/api/verdict', { text: 'PUNTAJE: 90%\nTodo bien.', final: 'si' }, T).then(x => x.json());
    assert.equal(r.status, 'ok');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.deepEqual([s.days['2026-11-04'].input.meals, s.days['2026-11-04'].input.foodPct], [true, 0.9]);
    r = await call(e, 'POST', '/api/verdict', { text: 'PUNTAJE: 40%\nMucha fritura.', final: true }, T).then(x => x.json());
    assert.equal(r.status, 'no');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-04'].input.foodPct, 0.4); assert.equal(s.days['2026-11-04'].input.meals, true);
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
    const out = !isJudge ? 'Pollo con arroz.\nProteína: sí, pollo' : /El día terminó/.test(parts[0].text) ? 'PUNTAJE: 55%\nFalta verdura.' : 'Comida de ahora: pollo.\nTe falta para una buena alimentación: verduras';
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
    assert.deepEqual([s.days['2026-11-04'].input.meals, s.days['2026-11-04'].input.foodPct], [true, 0.55]);
    const g: any = await call(e, 'GET', '/api/meals?date=2026-11-04', undefined, T).then(x => x.json());
    assert.equal(g.meals.length, 2); assert.match(g.text, /Falta verdura/);
    assert.equal((await call(e, 'POST', '/api/meal/close', { date: '2026-11-05' }, T)).status, 400, 'sin comidas no se cierra');
  } finally { globalThis.fetch = real; }
});

test('steam: la primera lectura es el punto de partida; después suma las horas nuevas al día de hoy', async () => {
  const e: any = { ...env(), STEAM_KEY: 'k', STEAM_ID: '123' }; const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const realFetch = globalThis.fetch, realNow = Date.now; let games: any[] = [{ appid: 1, playtime_forever: 600 }, { appid: 2, playtime_forever: 60 }];
  globalThis.fetch = (async () => new Response(JSON.stringify({ response: { games } }))) as any; Date.now = () => Date.parse('2026-11-03T23:00:00Z');   // 20:00 locales
  try {
    assert.deepEqual(await runSteam(e), { ok: true, baseline: true, addedH: 0 });
    assert.equal((await runSteam(e) as any).addedH, 0, 'sin cambios no suma');
    games = [{ appid: 1, playtime_forever: 690 }, { appid: 2, playtime_forever: 60 }, { appid: 3, playtime_forever: 30 }];   // +90 min en el 1 y juego nuevo con 30 min
    const r: any = await runSteam(e); assert.equal(r.addedH, 2);   // 90 + 30 minutos
    const s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json());
    assert.equal(s.days['2026-11-03'].input.gameH, 2);
    games = [{ appid: 1, playtime_forever: 750 }, { appid: 2, playtime_forever: 60 }, { appid: 3, playtime_forever: 30 }];
    assert.equal((await runSteam(e) as any).addedH, 1); assert.equal(((await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json())) as any).days['2026-11-03'].input.gameH, 3, 'acumula');
    globalThis.fetch = (async () => new Response(JSON.stringify({ response: {} }))) as any;
    assert.match(String(((await runSteam(e)) as any).error), /público/);
    assert.equal((await runSteam({ ...env() } as any)).ok, false, 'sin claves');
  } finally { globalThis.fetch = realFetch; Date.now = realNow; }
});

test('aeróbico por Salud: 10.000 pasos o 500 kcal lo marca solo; aviso a la tarde (una vez) y aviso del día siguiente', async () => {
  const e = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const logs = async () => ((await e.DB.prepare('SELECT kind, date FROM notification_log ORDER BY kind, date').all()).results as any[]).filter(x => x.kind.startsWith('aero')).map(x => `${x.kind}@${x.date}`);
  const real = Date.now; let t = Date.parse('2026-11-03T15:00:00Z'); Date.now = () => t;   // 12:00 locales
  const post = (b: any) => call(e, 'POST', '/api/health', b, T).then(x => x.json()) as Promise<any>;
  try {
    assert.equal(((await call(e, 'GET', '/api/health/last', undefined, T).then(x => x.json())) as any).last, null);
    await post({ date: '2026-11-03', steps: 3000, kcal: 150 });
    assert.deepEqual(await logs(), [], 'antes de las 19:00 no avisa');
    t = Date.parse('2026-11-03T22:30:00Z');   // 19:30 locales
    await post({ date: '2026-11-03', steps: 4000, kcal: 200 }); await post({ date: '2026-11-03', steps: 4100, kcal: 210 });
    assert.deepEqual(await logs(), [], 'la misión aeróbica se eliminó: no hay avisos');
    let r = await post({ date: '2026-11-03', steps: 10200, kcal: 300 });
    assert.equal(r.health.aero, true, '10.000 pasos alcanzan');
    let s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); assert.equal(s.days['2026-11-03'].input.aero, true, 'se marca solo');
    t = Date.parse('2026-11-04T22:30:00Z');   // 19:30 del día siguiente
    r = await post({ date: '2026-11-04', steps: 2000, kcal: 520 });
    assert.equal(r.health.aero, true, '500 kcal alcanzan');
    r = await post({ date: '2026-11-04', steps: 7000, kcal: 300, gymSteps: 2000, gymKcal: 600 });
    assert.equal(r.health.aero, false, 'el gimnasio ya no se resta: 7.000 pasos y 300 kcal no alcanzan');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); assert.equal(s.days['2026-11-04'].input.aero, undefined, 'se desmarcó lo que se había marcado solo');
    // estar en el gimnasio ahora mismo ya no frena la decisión (no hay resta que esperar)
    await call(e, 'POST', '/api/gym', { event: 'arrive' }, T);
    r = await post({ date: '2026-11-04', steps: 20000, kcal: 2000 });
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); assert.equal(s.days['2026-11-04'].input.aero, true, 'marca igual aunque haya una entrada al gimnasio abierta');
    await call(e, 'POST', '/api/gym', { event: 'leave' }, T);
    r = await post({ date: '2026-11-04', steps: 7000, kcal: 300 });
    t = Date.parse('2026-11-05T13:00:00Z');   // día siguiente
    await post({ date: '2026-11-04', steps: 7000, kcal: 300 }); await post({ date: '2026-11-04', steps: 7100, kcal: 310 });
    assert.deepEqual(await logs(), [], 'sin avisos aeróbicos');
    assert.ok(((await call(e, 'GET', '/api/health/last', undefined, T).then(x => x.json())) as any).minutesAgo === 0);
    // lo marcado a mano nunca se desmarca ni genera aviso
    await call(e, 'POST', '/api/sync', { changes: [{ date: '2026-11-05', input: { aero: true }, updated_at: t + 1 }] }, T);
    await post({ date: '2026-11-05', steps: 100, kcal: 10 });
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); assert.equal(s.days['2026-11-05'].input.aero, true);
    assert.equal((await logs()).filter(x => x.endsWith('2026-11-05')).length, 0);
  } finally { Date.now = real; }
});

test('mascota que habla: Gemini redacta con los hechos y Telegram entrega; errores claros', async () => {
  const e: any = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  let r: any = await call(e, 'POST', '/api/push/test', { pet: 'behemot' }, T).then(x => x.json());
  assert.equal(r.telegram, false); assert.match(r.error, /GEMINI_KEY/, 'sin clave de Gemini lo dice');
  e.GEMINI_KEY = 'k';
  const real = globalThis.fetch; const calls: string[] = []; let tgStatus = 200;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push(String(url));
    if (String(url).includes('api.telegram.org')) {
      const b = JSON.parse(init.body); assert.equal(b.chat_id, '123'); assert.ok(b.text.length > 0);
      return tgStatus === 200 ? new Response('{"ok":true}', { status: 200 }) : new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 400 });
    }
    const body = JSON.parse(init.body); assert.match(body.systemInstruction.parts[0].text, /Behemot/); assert.match(body.contents[0].parts[0].text, /gimnasio/);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '"Dale, levantate y andá al gimnasio."' }] } }] }), { status: 200 });
  }) as any;
  try {
    r = await call(e, 'POST', '/api/push/test', { pet: 'behemot' }, T).then(x => x.json());
    assert.match(r.error, /TELEGRAM_BOT_BEHEMOT/, 'sin secretos de Telegram lo dice');
    e.TELEGRAM_BOT_BEHEMOT = 'tok'; e.TELEGRAM_CHAT_ID = '123';
    r = await call(e, 'POST', '/api/push/test', { pet: 'behemot' }, T).then(x => x.json());
    assert.deepEqual([r.telegram, r.text], [true, 'Dale, levantate y andá al gimnasio.']);
    assert.ok(calls.some(u => u.includes('/bottok/sendMessage')));
    tgStatus = 400;
    r = await call(e, 'POST', '/api/push/test', { pet: 'behemot' }, T).then(x => x.json());
    assert.equal(r.telegram, false); assert.match(r.error, /chat not found/);
  } finally { globalThis.fetch = real; }
});

test('aviso del lunes: sugerencias de la semana que terminó, una sola vez, a primera hora', async () => {
  const { runSemanal } = await import('../src/worker.ts');
  const e: any = env(); const T = 'clave-larga-1';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-09' });
  await call(e, 'POST', '/api/sync', { device: 'x', changes: [{ date: '2026-11-10', input: { gymMin: 50 }, updated_at: 1 }] }, T);
  const at = (h: number) => Date.UTC(2026, 10, 16, h + 3, 0);   // lunes 16/11, hora local (UTC-3)
  assert.deepEqual(await runSemanal(e, 'https://x.test', at(7)), [], 'antes de las 8 no manda');
  assert.deepEqual(await runSemanal(e, 'https://x.test', Date.UTC(2026, 10, 17, 11, 0)), [], 'otro día no manda');
  assert.deepEqual(await runSemanal(e, 'https://x.test', at(8)), ['semanal']);
  assert.deepEqual(await runSemanal(e, 'https://x.test', at(9)), [], 'una sola vez');
  const n: any = await (await call(e, 'GET', '/api/last-notification', undefined, T)).json();
  assert.equal(n.title, 'Resumen de la semana'); assert.match(n.body, /Gimnasio|Hiciste/);
});

test('league of legends: suma la duración de las partidas nuevas, sin repetir y sin contar el pasado', async () => {
  const { runRiot } = await import('../src/worker.ts');
  const e: any = env(); await call(e, 'POST', '/api/setup', { token: 'clave-larga-1', startDate: '2026-11-02' });
  assert.equal((await runRiot(e)).ok, false, 'sin clave no hace nada');
  e.RIOT_API_KEY = 'RGAPI-test'; e.RIOT_ID = 'Fulano#LAS';
  const real = globalThis.fetch; const urls: string[] = []; let ids = ['LA2_1', 'LA2_2'];
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url); urls.push(u);
    assert.equal(init.headers['X-Riot-Token'], 'RGAPI-test');
    if (u.includes('by-riot-id/Fulano/LAS')) return new Response('{"puuid":"P1"}');
    if (u.includes('/ids?')) return new Response(JSON.stringify(ids));
    const id = u.split('/').pop()!; return new Response(JSON.stringify({ info: { gameEndTimestamp: Date.now() - 600e3, gameDuration: id === 'LA2_1' ? 1800 : 1200 } }));
  }) as any;
  try {
    assert.deepEqual(await runRiot(e), { ok: true, baseline: true, addedH: 0, matches: 0 }, 'la primera lectura es el punto de partida');
    const r = await runRiot(e);
    assert.equal(r.ok, true); assert.equal(r.matches, 2); assert.equal(r.addedH, 0.83, '30 + 20 min');
    ids = ['LA2_1', 'LA2_2', 'LA2_3'];
    assert.equal((await runRiot(e)).matches, 1, 'no repite las ya contadas');
    globalThis.fetch = (async () => new Response('{}', { status: 403 })) as any;
    assert.match((await runRiot(e)).error!, /rechaz/);
  } finally { globalThis.fetch = real; }
});

test('comidas: la estimación se guarda una vez y el acumulado es una suma (el agua no mueve nada)', async () => {
  const e: any = env(); const T = 'clave-larga-1'; e.GEMINI_KEY = 'k';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const real = globalThis.fetch, rn = Date.now; Date.now = () => Date.parse('2026-11-04T20:00:00Z');
  const prompts: string[] = [];
  globalThis.fetch = (async (_u: any, init: any) => {
    const b = JSON.parse(init.body), user = b.contents[0].parts[0].text as string, sys = b.systemInstruction.parts[0].text as string;
    prompts.push(user);
    if (sys.includes('SOLO un JSON')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: user.includes('agua') ? '{"kcal":0,"prot":0}' : '{"kcal":770,"prot":54}' }] } }] }));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Esta comida: ok\nPUNTAJE: 100%' }] } }] }));
  }) as any;
  try {
    const post = (text: string, t: string) => call(e, 'POST', '/api/meal', { date: '2026-11-04', text, t }, T).then(x => x.json());
    await post('Dos milanesas con tomates', '22:36');
    const r: any = await post('50ml de agua', '22:38');
    const j = prompts.at(-1)!;
    assert.match(j, /22:36: Dos milanesas con tomates \[fijo: ~770 kcal · 54 g/); assert.match(j, /22:38: 50ml de agua \[fijo: ~0 kcal · 0 g/);
    assert.match(j, /~770 kcal · 54 g de proteína · 0 g de carbohidratos\. Los números/, 'el acumulado ya viene sumado');
    assert.doesNotMatch(j, /Cena|Almuerzo|Merienda|Desayuno/, 'no se nombra la comida según la hora');
    assert.equal(r.meals.length, 2); assert.deepEqual(r.meals.map((m: any) => m.kcal), [770, 0]);
    // una comida vieja sin estimación se estima una vez y queda fija
    await e.DB.prepare('INSERT INTO meals (id, date, t, kind, descr, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind('old', '2026-11-04', '14:00', 'text', 'Un café', 1).run();
    await post('agua', '22:40');
    assert.equal(((await e.DB.prepare("SELECT kcal FROM meals WHERE id='old'").first()) as any).kcal, 770);
  } finally { globalThis.fetch = real; Date.now = rn; }
});

test('exceso de calorías: arma el desafío de ejercicio y al compensarlo el puntaje vuelve al "sin exceso"', async () => {
  const e: any = env(); const T = 'clave-larga-1'; e.GEMINI_KEY = 'k';
  await call(e, 'POST', '/api/setup', { token: T, startDate: '2026-11-02' });
  const real = globalThis.fetch, rn = Date.now; Date.now = () => Date.parse('2026-11-04T23:00:00Z');
  const prompts: string[] = [];
  globalThis.fetch = (async (_u: any, init: any) => {
    const b = JSON.parse(init.body), user = b.contents[0].parts[0].text as string, sys = b.systemInstruction.parts[0].text as string;
    prompts.push(user);
    if (sys.includes('SOLO un JSON')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: user.includes('agua') ? '{"kcal":0,"prot":0}' : '{"kcal":2600,"prot":160}' }] } }] }));
    const over = user.includes('PUNTAJE SIN EXCESO');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: over ? 'Te pasaste.\nPUNTAJE: 80%\nPUNTAJE SIN EXCESO: 100%' : 'Todo bien.\nPUNTAJE: 100%' }] } }] }));
  }) as any;
  try {
    await call(e, 'POST', '/api/sync', { changes: [{ date: '2026-11-04', input: { weightKg: 87 }, updated_at: 1 }] }, T);
    const post = (text: string) => call(e, 'POST', '/api/meal', { date: '2026-11-04', text, t: '21:00' }, T).then(x => x.json());
    await post('Banquete enorme');
    assert.match(prompts.at(-1)!, /PUNTAJE SIN EXCESO/, 'pasa del tope: le pide el puntaje sin exceso');
    let s: any = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); let d = s.days['2026-11-04'].input;
    assert.equal(d.foodPct, 0.8); assert.equal(d.comp.burn, 1000); assert.equal(d.comp.over, 1000); assert.equal(d.comp.sin, 100);
    assert.equal(d.comp.opts.find((o: any) => o.n === 'bici').kpm, 9.9, '(7,5 − 1) MET × 3,5 × 87 kg / 200');
    // el usuario registra lo quemado (el cliente lo guarda en comp.done)
    d.comp.done = 1000;
    await call(e, 'POST', '/api/sync', { changes: [{ date: '2026-11-04', input: d, updated_at: Date.now() + 5 }] }, T);
    await post('agua');
    s = await call(e, 'POST', '/api/sync', { changes: [] }, T).then(x => x.json()); d = s.days['2026-11-04'].input;
    assert.equal(d.foodPct, 1, 'compensado: vuelve al 100 %'); assert.equal(d.comp.done, 1000, 'conserva lo registrado');
    assert.doesNotMatch(prompts.at(-1)!, /Cena|Almuerzo/);
  } finally { globalThis.fetch = real; Date.now = rn; }
});
