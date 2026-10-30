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
  // domingo 8-nov 18:00 local = 21:00 UTC: avisa alimentación
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-08T21:00:00Z')), ['feed']);
  // si ya registró el día y alimentó, no avisa
  await call(e, 'POST', '/api/sync', { changes: [{ date: '2026-11-09', input: { gym: true }, updated_at: 1 }] }, T);
  assert.deepEqual(await runReminders(e as any, 'https://x.test', utc('2026-11-10T00:30:00Z')), []);
});
