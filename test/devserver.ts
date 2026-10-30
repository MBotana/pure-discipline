// Servidor local de prueba: archivos estáticos + API real (worker.ts) sobre SQLite en memoria.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { extname, join } from 'node:path';
import { handle } from '../src/worker.ts';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE day_inputs (date TEXT PRIMARY KEY, input TEXT NOT NULL, updated_at INTEGER NOT NULL, device TEXT);
CREATE TABLE push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE notification_log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, date TEXT NOT NULL, sent_at INTEGER NOT NULL, UNIQUE(kind, date));`);
const DB = { prepare: (sql: string) => { const st = db.prepare(sql); let a: any[] = [];
  const o: any = { bind: (...x: any[]) => { a = x; return o; }, first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return {}; } }; return o; } };
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const dir = new URL('../public', import.meta.url).pathname;

createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost:8787');
  if (url.pathname.startsWith('/api/')) {
    const body = await new Promise<Buffer>(r => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
    const r = await handle(new Request(url, { method: req.method, headers: req.headers as any, body: ['GET', 'HEAD'].includes(req.method!) ? undefined : body }), { DB, ASSETS: null });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = join(dir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(p)) p = join(dir, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8787, () => console.log('listo'));
